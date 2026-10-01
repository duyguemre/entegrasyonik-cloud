// MOB-08 / K55: backoffice kullanım okumaları -- platform (masaüstü/mobil + alt tür) kırılımı. SAF: modeller enjekte edilir.
// Kaynaklar: UsageDaily (gün + tenant + platform → takma kullanıcı kümesi; operations/usage/usageRecorder.ts) ve AuditLogs `login` kayıtları
// (`platform` alanı MOB-08 ile eklendi; eski kayıtlarda yok → `unknown`). Veri yoksa uydurma 0 YOK: `computable:false` + `note:'hesaplanamadı'`.
// Yanıtta yalnız sayılar: takma kimlik, sub, UA, IP DÖNMEZ.
import {
    CLIENT_PLATFORMS, PLATFORM_CLASSES, platformClassOf, platformsOfFilter, isClientPlatform,
    type ClientPlatform, type PlatformClass, type PlatformFilter,
} from '@platform/core/context';
import { addDaysInZone, dayKeyInZone } from '@utils/timeZone';

export const NOT_COMPUTABLE = 'hesaplanamadı';
const QUERY_MAX_TIME_MS = 2500;
/** Okunan belge üst sınırı (gün × tenant × platform). Aşılırsa `truncated:true` (sayılar alt sınırdır). */
export const MAX_USAGE_DOCS = 20_000;

export type ByClass = Record<PlatformClass, number>;
export type ByPlatform = Record<ClientPlatform, number>;
export interface DailyPoint { day: string; desktop: number; mobile: number; unknown: number }

const zeroByClass = (): ByClass => ({ desktop: 0, mobile: 0, unknown: 0 });
const zeroByPlatform = (): ByPlatform => Object.fromEntries(CLIENT_PLATFORMS.map((p) => [p, 0])) as ByPlatform;

interface UsageDoc { day: string; tid: number; platform: string; u?: string[] }

/** `n` gün öncesinden bugüne (dahil) gün anahtarları, eskiden yeniye. */
export function dayKeysBack(now: Date, n: number): string[] {
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) out.push(dayKeyInZone(addDaysInZone(now, -i)));
    return out;
}

async function readUsageDocs(model: any, sinceDay: string, filter: ClientPlatform[] | null, tid?: number): Promise<{ docs: UsageDoc[]; truncated: boolean }> {
    const q: Record<string, unknown> = { day: { $gte: sinceDay } };
    if (tid !== undefined) q.tid = tid;
    if (filter) q.platform = { $in: filter };
    const docs: UsageDoc[] = await model.find(q, { _id: 0, day: 1, tid: 1, platform: 1, u: 1 }).limit(MAX_USAGE_DOCS + 1).maxTimeMS(QUERY_MAX_TIME_MS).lean();
    const truncated = docs.length > MAX_USAGE_DOCS;
    return { docs: truncated ? docs.slice(0, MAX_USAGE_DOCS) : docs, truncated };
}

/** Pencere içindeki tekil kullanıcı (tid|takma) sayıları: toplam, sınıf ve alt tür bazında. Bir kullanıcı iki sınıfta da sayılabilir (toplamda bir kez). */
function summarize(docs: UsageDoc[], fromDay: string) {
    const all = new Set<string>(); const tenants = new Set<number>();
    const cls: Record<PlatformClass, Set<string>> = { desktop: new Set(), mobile: new Set(), unknown: new Set() };
    const plat = Object.fromEntries(CLIENT_PLATFORMS.map((p) => [p, new Set<string>()])) as Record<ClientPlatform, Set<string>>;
    for (const d of docs) {
        if (d.day < fromDay || !isClientPlatform(d.platform)) continue;
        const c = platformClassOf(d.platform);
        for (const u of d.u ?? []) {
            const k = `${d.tid}|${u}`;
            all.add(k); cls[c].add(k); plat[d.platform].add(k); tenants.add(d.tid);
        }
    }
    const byClass = zeroByClass(); for (const c of PLATFORM_CLASSES) byClass[c] = cls[c].size;
    const byPlatform = zeroByPlatform(); for (const p of CLIENT_PLATFORMS) byPlatform[p] = plat[p].size;
    // Mobil pay: en az bir kez mobilden gelen kullanıcı / sınıfı bilinen kullanıcı (bilinmeyen paydada yok). Payda 0 → null.
    const known = new Set<string>([...cls.desktop, ...cls.mobile]).size;
    const mobileShare = known > 0 ? Math.round((cls.mobile.size / known) * 1000) / 1000 : null;
    return { users: all.size, tenants: tenants.size, byClass, byPlatform, mobileShare };
}

function daily(docs: UsageDoc[], days: string[]): DailyPoint[] {
    const sets = new Map<string, Record<PlatformClass, Set<string>>>();
    for (const day of days) sets.set(day, { desktop: new Set(), mobile: new Set(), unknown: new Set() });
    for (const d of docs) {
        const s = sets.get(d.day);
        if (!s || !isClientPlatform(d.platform)) continue;
        const c = platformClassOf(d.platform);
        for (const u of d.u ?? []) s[c].add(`${d.tid}|${u}`);
    }
    return days.map((day) => { const s = sets.get(day)!; return { day, desktop: s.desktop.size, mobile: s.mobile.size, unknown: s.unknown.size }; });
}

export interface ActiveUsersDeps { usageModel: any; now?: () => number }

/** getPulse `activeUsers` bloğu: bugün / 7 g / 30 g tekil aktif kullanıcı + müşteri; 7 g sınıf/alt tür kırılımı; son 14 gün günlük seri. */
export async function pulseActiveUsers(d: ActiveUsersDeps, platform?: PlatformFilter) {
    const now = new Date((d.now ?? Date.now)());
    const filter = platformsOfFilter(platform);
    const days30 = dayKeysBack(now, 30);
    const { docs, truncated } = await readUsageDocs(d.usageModel, days30[0]!, filter);
    if (docs.length === 0) {
        return {
            computable: false, platform: platform ?? null, today: null, last7d: null, last30d: null, byClass: null, byPlatform: null, mobileShare: null,
            daily: [] as DailyPoint[], truncated: false, note: NOT_COMPUTABLE,
        };
    }
    const today = summarize(docs, days30[29]!), w7 = summarize(docs, days30[23]!), w30 = summarize(docs, days30[0]!);
    return {
        computable: true, platform: platform ?? null,
        today: { users: today.users, tenants: today.tenants },
        last7d: { users: w7.users, tenants: w7.tenants },
        last30d: { users: w30.users, tenants: w30.tenants },
        byClass: w7.byClass, byPlatform: w7.byPlatform, mobileShare: w7.mobileShare,
        daily: daily(docs, days30.slice(16)), truncated,
    };
}

export interface TenantUsageDeps { usageModel: any; auditModel: any; now?: () => number }
export type UsageDays = 7 | 30 | 90;

/** Müşteri detayı "Kullanım": aralıkta tekil aktif kullanıcı + sınıf/alt tür + günlük seri + son aktif gün; giriş sayıları (platform kırılımlı). */
export async function tenantUsage(d: TenantUsageDeps, tid: number, days: UsageDays = 30, platform?: PlatformFilter) {
    const nowMs = (d.now ?? Date.now)();
    const now = new Date(nowMs);
    const filter = platformsOfFilter(platform);
    const keys = dayKeysBack(now, days);
    const since = addDaysInZone(now, -(days - 1));
    const [usage, logins] = await Promise.all([
        (async () => {
            const { docs, truncated } = await readUsageDocs(d.usageModel, keys[0]!, filter, tid);
            if (docs.length === 0) {
                return { computable: false, users: null, byClass: null, byPlatform: null, mobileShare: null, lastActiveDay: null, daily: [] as DailyPoint[], truncated: false, note: NOT_COMPUTABLE };
            }
            const s = summarize(docs, keys[0]!);
            const lastActiveDay = docs.reduce<string | null>((m, x) => ((x.u?.length ?? 0) > 0 && (m === null || x.day > m) ? x.day : m), null);
            return { computable: true, users: s.users, byClass: s.byClass, byPlatform: s.byPlatform, mobileShare: s.mobileShare, lastActiveDay, daily: daily(docs, keys), truncated };
        })(),
        (async () => {
            const match: Record<string, unknown> = { tid, event: 'login', result: 'ok', at: { $gte: since } };
            if (filter) match.platform = filter.includes('unknown') ? { $in: [...filter, null] } : { $in: filter };
            const rows: Array<{ _id: string | null; n: number }> = await d.auditModel.aggregate([
                { $match: match }, { $group: { _id: '$platform', n: { $sum: 1 } } },
            ]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
            const byPlatform = zeroByPlatform(); const byClass = zeroByClass();
            let total = 0;
            for (const r of rows) {
                const p: ClientPlatform = isClientPlatform(r._id) ? r._id : 'unknown';   // MOB-08 öncesi kayıtlar: alan yok → bilinmiyor
                byPlatform[p] += r.n; byClass[platformClassOf(p)] += r.n; total += r.n;
            }
            return { computable: true, total, byClass, byPlatform };
        })(),
    ]);
    return { tid, days, platform: platform ?? null, generatedAt: now.toISOString(), from: keys[0], to: keys[keys.length - 1], activeUsers: usage, logins };
}
