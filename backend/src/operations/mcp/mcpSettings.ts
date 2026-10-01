// ADR-0035 Karar 6 / MCP_PLAN MCP-2 (K38/K47): tenant MCP erisim ayari. Depo: tenant DB `Settings.mcp = { access, transferConsent: { at, by, textVersion } }`
// (Setting semasi strict:false, EKLEMELI; goc yok; varsayilan `off`). YALNIZ tenant SAHIBI acar/degistirir ve surumlu aktarim metnini onaylar;
// yonetici (admin) acamaz. Metin surumu (`MCP_TRANSFER_TEXT_VERSION`) artinca kayitli onay eskir -> ETKIN deger `off` (yeniden onay gerekir).
// `Settings.mcp` istemci ayar RPC'lerinden OKUNMAZ/YAZILMAZ (setting-service SERVER_OWNED_SETTINGS_KEYS). E-posta depoya YAZILMAZ (yalniz kullanici kimligi).
import { AppError } from '@platform/core/errors';
import { getRequestId } from '@platform/core/context';
import { AuditLogger } from '@services/audit/AuditLogger';

export const MCP_TRANSFER_TEXT_VERSION = 'mcp-v1';
export const MCP_TRANSFER_TEXT = 'Yapay zekâ bağlantısı açıldığında, mağaza kullanıcılarının kendi hesaplarıyla bağladığı yapay zekâ uygulamaları '
    + '(kendi seçtikleri sağlayıcılar) siparişler, ürünler, stok ve raporlar gibi mağaza verilerinizi, kullanıcının yetkisi ölçüsünde okuyabilir; '
    + 'kişisel veriler (ad, adres, telefon) maskelenir. Aktarım yurt dışındaki sunuculara yapılabilir ve ilgili sağlayıcının saklama ve gizlilik koşulları geçerlidir. '
    + '"Okuma + işlem önerme" seçilirse uygulamalar işlem önerebilir; her işlem yalnızca kullanıcının Entegrasyonik içindeki onayıyla yürütülür. '
    + 'Bu ayarı yalnızca mağaza sahibi değiştirebilir; kapatıldığında bağlantılar askıya alınır, "Tümünü kes" ile tamamen sonlandırılır.';

export type McpAccess = 'off' | 'read' | 'readwrite';
const MCP_ACCESS_VALUES: ReadonlyArray<McpAccess> = ['off', 'read', 'readwrite'];
export const isMcpAccess = (v: unknown): v is McpAccess => typeof v === 'string' && (MCP_ACCESS_VALUES as readonly string[]).includes(v);

export interface StoredMcpSettings {
    access?: string;
    transferConsent?: { at: Date | string; by: string; textVersion: string };
}

/** Ayar deposu soyutlamasi (testte sahte; canli: tenant DB Settings). */
export interface McpSettingsStore {
    read(tid: number): Promise<StoredMcpSettings | undefined>;
    write(tid: number, value: StoredMcpSettings): Promise<void>;
}

async function clientSettingModel(tid: number) {
    // tembel yukleme: bu modulu yuklemek DB katmanini yuklemez (birim testleri)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseManagerInstance } = require('@database/DatabaseManager') as typeof import('@database/DatabaseManager');
    const db = await DatabaseManagerInstance.getClientDB(tid);
    if (!db) throw new Error('tenant db yok');
    return db.getSettingModel();
}

const mongoMcpSettingsStore: McpSettingsStore = {
    async read(tid) {
        const doc = await (await clientSettingModel(tid)).findOne({ docId: 1 }, { mcp: 1 }).lean();
        const m = (doc as { mcp?: StoredMcpSettings } | null)?.mcp;
        return m && typeof m === 'object' ? m : undefined;
    },
    async write(tid, value) {
        await (await clientSettingModel(tid)).findOneAndUpdate({ docId: 1 }, { $set: { mcp: value } }, { upsert: true, new: true }).lean();
    },
};

/** Kayitli ayardan ETKIN erisim: gecersiz deger ya da eski/eksik onay metni surumu -> `off`. */
export function effectiveAccess(s: StoredMcpSettings | undefined): McpAccess {
    if (!s || !isMcpAccess(s.access) || s.access === 'off') return 'off';
    return s.transferConsent?.textVersion === MCP_TRANSFER_TEXT_VERSION ? s.access : 'off';
}

export interface McpSettingsView {
    access: McpAccess;
    consent: { textVersion: string; at: string; byEmail: string } | null;
    currentText: { textVersion: string; text: string };
    consentOutdated: boolean;
    canEdit: boolean;
    serverUrl: string;
    activeConnections: number;
}

/** Kaydeden oturum: kimlik/rol SUNUCUDA cozulmus (govdeden gelmez). */
export interface McpSettingsActor { tid: number; userId: string; isOwner: boolean; imp: boolean; ip?: string }

export interface McpSettingsDeps {
    store?: McpSettingsStore;
    /** Onay veren kullanicinin e-postasi (yalniz gosterim; depoda tutulmaz). */
    userEmail?: (userId: string) => Promise<string | undefined>;
    now?: () => number;
    cacheTtlMs?: number;
}

const CACHE_MAX = 1000;

export class McpSettingsService {
    private readonly store: McpSettingsStore;
    private readonly now: () => number;
    private readonly ttl: number;
    private readonly cache = new Map<number, { at: number; value: McpAccess }>();

    constructor(private readonly deps: McpSettingsDeps = {}) {
        this.store = deps.store ?? mongoMcpSettingsStore;
        this.now = deps.now ?? Date.now;
        this.ttl = deps.cacheTtlMs ?? 60_000;
    }

    invalidate(tid: number): void { this.cache.delete(tid); }

    /** `/mcp` ve onay karari icin ETKIN erisim (60 sn surec-ici onbellek; yazimda gecersiz kilinir). Depo hatasi FIRLATIR (cagiran reddeder: fail-closed). */
    async getAccess(tid: number): Promise<McpAccess> {
        const hit = this.cache.get(tid);
        const t = this.now();
        if (hit && t - hit.at < this.ttl) return hit.value;
        const value = effectiveAccess(await this.store.read(tid));
        this.cache.set(tid, { at: t, value });
        while (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value as number);
        return value;
    }

    async view(tid: number, extra: { canEdit: boolean; serverUrl: string; activeConnections: number }): Promise<McpSettingsView> {
        const s = await this.store.read(tid);
        const c = s?.transferConsent;
        const consent = c && c.textVersion && c.by
            ? { textVersion: c.textVersion, at: new Date(c.at).toISOString(), byEmail: (await this.safeEmail(c.by)) ?? '' }
            : null;
        const configured = isMcpAccess(s?.access) && s?.access !== 'off';
        return {
            access: effectiveAccess(s),
            consent,
            currentText: { textVersion: MCP_TRANSFER_TEXT_VERSION, text: MCP_TRANSFER_TEXT },
            consentOutdated: configured && c?.textVersion !== MCP_TRANSFER_TEXT_VERSION,
            canEdit: extra.canEdit,
            serverUrl: extra.serverUrl,
            activeConnections: extra.activeConnections,
        };
    }

    private async safeEmail(userId: string): Promise<string | undefined> {
        try { return await this.deps.userEmail?.(userId); } catch { return undefined; }
    }

    /** Kaydet: yalniz SAHIP (admin dahil digerleri 403), impersonation 403, `access!=off` icin guncel metin surumu onayi ZORUNLU (422). */
    async save(actor: McpSettingsActor, body: { access?: unknown; acceptTextVersion?: unknown }): Promise<{ from: McpAccess; to: McpAccess }> {
        if (actor.imp) throw AppError.of('IMPERSONATION_FORBIDDEN');
        if (!actor.isOwner) throw AppError.of('FORBIDDEN', { message: 'Yapay zekâ bağlantısını yalnızca mağaza sahibi değiştirebilir.' });
        if (!isMcpAccess(body.access)) throw AppError.of('VALIDATION', { message: 'Geçersiz erişim değeri.' });
        const access = body.access;
        if (body.acceptTextVersion !== undefined && typeof body.acceptTextVersion !== 'string') throw AppError.of('VALIDATION', { message: 'Geçersiz onay metni sürümü.' });
        const prev = await this.store.read(actor.tid);
        const from = effectiveAccess(prev);
        const next: StoredMcpSettings = { access };
        if (access !== 'off') {
            if (body.acceptTextVersion !== MCP_TRANSFER_TEXT_VERSION) {
                throw new AppError('Veri aktarım bilgilendirmesinin güncel sürümünü onaylamalısınız.', 422, { code: 'VALIDATION' });
            }
            next.transferConsent = { at: new Date(this.now()), by: actor.userId, textVersion: MCP_TRANSFER_TEXT_VERSION };
        } else if (prev?.transferConsent) {
            next.transferConsent = prev.transferConsent; // kapatmak onay kaydini silmez (denetim izi); yeniden acista onay yine zorunlu
        }
        await this.store.write(actor.tid, next);
        this.invalidate(actor.tid);
        const reqId = getRequestId();
        await AuditLogger.log({
            event: 'mcp.settings.changed', result: 'ok', sub: actor.userId, tid: actor.tid, ip: actor.ip, surface: 'app', actorType: 'user', reqId,
            meta: { from, to: access, ...(access !== 'off' ? { textVersion: MCP_TRANSFER_TEXT_VERSION } : {}) },
        });
        return { from, to: access };
    }
}

let singleton: McpSettingsService | undefined;
export function getMcpSettingsService(): McpSettingsService {
    return (singleton ??= new McpSettingsService({
        userEmail: async (id) => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { DatabaseManagerInstance } = require('@database/DatabaseManager') as typeof import('@database/DatabaseManager');
            const app = await DatabaseManagerInstance.getApplicationDB();
            const u = await app.getUserModel().findById(id, 'email').lean() as { email?: string } | null;
            return u?.email;
        },
    }));
}
