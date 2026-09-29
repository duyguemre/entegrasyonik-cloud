import { DatabaseManagerInstance } from '@database/DatabaseManager';
import type { SubscriptionStatus } from '@database/application/models/Subscription';

// ADR-0008 §3: "Uygulama noktası tek yerdir: EntitlementService (plan + override + durum → izinler)."
// Bu dosya (a) API katmanı guard'ı, (b) IntegrationEngine iş planlayıcısı, (c) MCP katmanı (ADR-0009) için ORTAK
// karar motorudur -- üç boyut da AYNI `checkAccess` fonksiyonunu çağırmalıdır (guard'ların KENDİSİNİ bu API'lere
// bağlamak bu görevin kapsamı dışıdır; ADR "Etki Alanı": API/IntegrationEngine/MCP entegrasyonu ayrı görevler).
//
// 60 sn TTL, tenant anahtarlı, süreç-içi bellek önbelleği (ADR §3 son paragraf): webhook işlenince ilgili tenant
// anahtarı silinir (`invalidate`). Bu, ADR-0002'deki `@Cache` decorator'ından BAĞIMSIZ, kasıtlı olarak ayrı basit
// bir Map -- ADR-0002 kapsamı entegrasyon modüllerindeki metot-seviyesi cache'lemedir; burada tek bir karar
// fonksiyonunun sonucu tutuluyor ve anahtar zaten tenant'lı (ADR-0002'nin çözdüğü tenant-sızıntısı sınıfı burada oluşmaz).

export type AccessDimension = 'read' | 'write' | 'engine';
export type EffectiveStatus = SubscriptionStatus | 'no_subscription';

export interface EntitlementDecision {
    allowed: boolean;
    status: EffectiveStatus;
    reason?: string;
}

export interface QuotaDecision {
    allowed: boolean;
    limit: number;
    used: number;
    resource: QuotaResource;
    reason?: string;
}

export type QuotaResource = 'channels' | 'skus' | 'users' | 'mcpCallsPerDay';

interface SubscriptionLike {
    clientId: number;
    status: SubscriptionStatus;
    billingExempt?: boolean;
    graceUntil?: Date | string | null;
    currentPeriodEnd?: Date | string | null;
    planCode?: string;
    limitOverrides?: Partial<Record<QuotaResource, number>> | null;
}

const CACHE_TTL_MS = 60_000;
// ADR §3 durum makinesi: "canceled" -> dönem sonuna kadar tam, SONRA 30 gün salt-okunur (sonrası fiilen "expired"
// muamelesi görür -- arka plan job'u durumu henüz 'expired'e çevirmemiş olsa bile EntitlementService savunmacıdır).
const CANCELED_READONLY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(v: Date | string | null | undefined): Date | undefined {
    if (!v) return undefined;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
}

interface AccessTriple { read: boolean; write: boolean; engine: boolean; }

const FULL_ACCESS: AccessTriple = { read: true, write: true, engine: true };
const READ_ONLY: AccessTriple = { read: true, write: false, engine: false };
const NO_ACCESS: AccessTriple = { read: false, write: false, engine: false };

/**
 * ADR §3 durum makinesi tablosunu SAF (yan etkisiz) biçimde uygular. `graceUntil`/`currentPeriodEnd` zaman
 * sınırlarını da (past_due grace, canceled 30 gün salt-okunur penceresi) burada değerlendirir.
 */
export function computeAccess(sub: SubscriptionLike, now: Date = new Date()): AccessTriple {
    if (sub.billingExempt) return FULL_ACCESS; // legacy tenant'lar (ADR §2 Legacy satırı): billing state machine'i tarafından kısıtlanmaz

    switch (sub.status) {
        case 'trialing':
        case 'active':
            return FULL_ACCESS;

        case 'past_due': {
            // ADR §3: "tam — grace 7 gün". graceUntil tanımlıysa ve süresi dolmuşsa suspended MUAMELESİ (savunmacı;
            // asıl durum geçişi ayrı bir arka plan job'unun sorumluluğudur, bu iş BU GÖREVİN KAPSAMINDA DEĞİL).
            const grace = toDate(sub.graceUntil);
            if (grace && now.getTime() > grace.getTime()) return READ_ONLY;
            return FULL_ACCESS;
        }

        case 'suspended':
            // ADR §3: "tam (görüntüleme + dışa aktarma) / kapalı / durdurulur"
            return READ_ONLY;

        case 'canceled': {
            const periodEnd = toDate(sub.currentPeriodEnd);
            if (!periodEnd || now.getTime() <= periodEnd.getTime()) return FULL_ACCESS; // dönem sonuna kadar tam
            const readonlyUntil = periodEnd.getTime() + CANCELED_READONLY_DAYS * DAY_MS;
            if (now.getTime() <= readonlyUntil) return READ_ONLY; // sonra 30 gün salt-okunur
            return NO_ACCESS; // 30 gün sonrası fiilen expired muamelesi
        }

        case 'expired':
        default:
            return NO_ACCESS;
    }
}

function reasonFor(status: EffectiveStatus, dimension: AccessDimension): string {
    const dimLabel: Record<AccessDimension, string> = { read: 'görüntüleme', write: 'yazma', engine: 'entegrasyon motoru' };
    switch (status) {
        case 'no_subscription':
            return 'Bu tenant için bir abonelik kaydı bulunamadı.';
        case 'suspended':
            return `Aboneliğiniz askıya alındı; ${dimLabel[dimension]} işlemi şu an kullanılamıyor. Devam etmek için ödeme bilgilerinizi güncelleyin.`;
        case 'canceled':
            return `Aboneliğiniz iptal edildi; salt-okunur/erişim süresi doldu (${dimLabel[dimension]} kullanılamıyor).`;
        case 'expired':
            return `Aboneliğiniz sona erdi; ${dimLabel[dimension]} işlemi kullanılamıyor.`;
        default:
            return `${dimLabel[dimension]} işlemi şu an kullanılamıyor.`;
    }
}

function quotaReasonFor(resource: QuotaResource, limit: number): string {
    const labels: Record<QuotaResource, string> = {
        channels: 'kanala', skus: 'SKU\'ya', users: 'kullanıcıya', mcpCallsPerDay: 'günlük MCP çağrısına',
    };
    return `Planınız ${limit} ${labels[resource]} izin veriyor; yükseltmek için abonelik ayarlarına gidin.`;
}

interface CacheEntry { access: AccessTriple; status: EffectiveStatus; limits: Record<QuotaResource, number> | null; expiresAt: number; }

export class EntitlementService {
    private static cache = new Map<number, CacheEntry>();

    /** Webhook işlenince (ADR §3 son paragraf) veya durum değişince çağrılır. */
    public static invalidate(tenantId: number): void {
        EntitlementService.cache.delete(tenantId);
    }

    /** Yalnızca testler için: tüm önbelleği temizler. */
    public static clearCacheForTests(): void {
        EntitlementService.cache.clear();
    }

    private static async loadSubscription(tenantId: number): Promise<SubscriptionLike | null> {
        const applicationDB = await DatabaseManagerInstance.getApplicationDB();
        const doc = await applicationDB.getSubscriptionModel().findOne({ clientId: tenantId }).lean();
        return (doc as any) ?? null;
    }

    private static async loadLimits(sub: SubscriptionLike | null): Promise<Record<QuotaResource, number> | null> {
        if (!sub || sub.billingExempt) return null; // billingExempt: sınırsız (checkQuota bunu ayrıca ele alır)
        const applicationDB = await DatabaseManagerInstance.getApplicationDB();
        const plan: any = await applicationDB.getPlanModel().findOne({ code: sub.planCode }).lean();
        const base = plan?.limits || { channels: 0, skus: 0, users: 0, mcpCallsPerDay: 0 };
        const overrides = sub.limitOverrides || {};
        return {
            channels: overrides.channels ?? base.channels,
            skus: overrides.skus ?? base.skus,
            users: overrides.users ?? base.users,
            mcpCallsPerDay: overrides.mcpCallsPerDay ?? base.mcpCallsPerDay,
        };
    }

    private static async getEntry(tenantId: number, now: Date): Promise<CacheEntry> {
        const cached = EntitlementService.cache.get(tenantId);
        if (cached && cached.expiresAt > now.getTime()) return cached;

        const sub = await EntitlementService.loadSubscription(tenantId);
        const status: EffectiveStatus = sub ? sub.status : 'no_subscription';
        const access = sub ? computeAccess(sub, now) : NO_ACCESS;
        const limits = await EntitlementService.loadLimits(sub);

        const entry: CacheEntry = { access, status, limits, expiresAt: now.getTime() + CACHE_TTL_MS };
        EntitlementService.cache.set(tenantId, entry);
        return entry;
    }

    /** ADR §3: (a) API guard, (b) IntegrationEngine planlayıcısı, (c) MCP katmanının çağıracağı TEK karar noktası. */
    public static async checkAccess(tenantId: number, dimension: AccessDimension, now: Date = new Date()): Promise<EntitlementDecision> {
        const entry = await EntitlementService.getEntry(tenantId, now);
        const allowed = entry.access[dimension];
        return allowed ? { allowed: true, status: entry.status } : { allowed: false, status: entry.status, reason: reasonFor(entry.status, dimension) };
    }

    /**
     * ADR §3 son paragraf: "Kota aşımında mevcut veri silinmez/kapatılmaz; yalnızca yeni oluşturma reddedilir ve
     * aksiyon alınabilir mesaj döner." `currentUsage`, çağıran tarafından ANLIK SAYIMLA (ADR "Kota uygulaması"
     * kararı) sağlanır -- bu servis sayaç TUTMAZ.
     */
    public static async checkQuota(tenantId: number, resource: QuotaResource, currentUsage: number, now: Date = new Date()): Promise<QuotaDecision> {
        const entry = await EntitlementService.getEntry(tenantId, now);
        if (entry.status === 'no_subscription') {
            return { allowed: false, limit: 0, used: currentUsage, resource, reason: reasonFor('no_subscription', 'write') };
        }
        if (entry.limits === null) {
            // billingExempt (legacy) -> sınırsız (ADR §2 Legacy satırı: "sınırsız ... hepsi, billingExempt: true")
            return { allowed: true, limit: Number.POSITIVE_INFINITY, used: currentUsage, resource };
        }
        const limit = entry.limits[resource];
        const allowed = currentUsage < limit;
        return { allowed, limit, used: currentUsage, resource, reason: allowed ? undefined : quotaReasonFor(resource, limit) };
    }
}
