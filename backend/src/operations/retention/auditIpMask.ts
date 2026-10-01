// RET-02 (KVKK veri minimizasyonu): 90 gunden eski `AuditLogs` kayitlarinda tam IP maskelenir. Kayit 365 gun TTL ile AYNEN silinir
// (TTL/`at` degismez). Maskeleme: `ip` alani KALDIRILIR, ag oneki `ipMasked`'a yazilir (IPv4 /24, IPv6 /48). Boylece:
//  - is idempotenttir (bekleyen kayit = `ip` alani olan kayit; ikinci tur ayni kaydi bulmaz),
//  - `ret02_ip_pending` kismi indeksi (`{at:1,_id:1}`, partial `ip $exists`) yalniz bekleyenleri tasir (goc 0024; indeks yoksa sorgu
//    `at_1` TTL indeksiyle calisir, yalniz daha cok tarar),
//  - yaris guvenli: guncelleme filtresi `{_id, ip: <okunan deger>}` (araya giren degisiklik ezilmez).
// Zamanlayici: bootstrap/schedules.ts `retention.auditIpMask` (gunluk, dagitik kilit = scheduler lease). DB disinda hicbir sey yapmaz.
import { isIP } from 'net';
import { DatabaseManagerInstance } from '@database/DatabaseManager';

export const AUDIT_IP_MASK_JOB_NAME = 'retention.auditIpMask';
/** RET-02: IP bu yastan sonra maskelenir (gun). Saklama suresi (365 g TTL) ayri; bkz. models/AuditLog.ts. */
export const AUDIT_IP_MASK_AFTER_DAYS = 90;
export const AUDIT_IP_MASK_BATCH_SIZE = 500;
/** Tur basina ust sinir (500 x 200 = 100k kayit); kalan sonraki turda (`more:true`). */
export const AUDIT_IP_MASK_MAX_BATCHES = 200;
const QUERY_MAX_TIME_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Cozumlenemeyen deger icin yer tutucu (ham deger hicbir kosulda saklanmaz). */
export const MASKED_UNKNOWN = 'unknown';

function expandIpv6(addr: string): string[] | null {
    const halves = addr.split('::');
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(':') : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
    if (fill < 0) return null;
    const groups = [...head, ...Array(fill).fill('0'), ...tail];
    return groups.length === 8 ? groups : null;
}

/** IPv4 -> `a.b.c.0/24`; IPv6 -> `h1:h2:h3::/48`; IPv4-eslenik IPv6 IPv4 gibi; gecersiz -> `unknown`. Saf, idempotent degil (girdi ham IP). */
export function maskIp(raw: unknown): string {
    if (typeof raw !== 'string') return MASKED_UNKNOWN;
    let ip = raw.trim();
    const zone = ip.indexOf('%');
    if (zone >= 0) ip = ip.slice(0, zone);
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
    if (mapped) ip = mapped[1];
    const v = isIP(ip);
    if (v === 4) return `${ip.split('.').slice(0, 3).join('.')}.0/24`;
    if (v === 6) {
        const g = expandIpv6(ip.toLowerCase());
        if (!g) return MASKED_UNKNOWN;
        return `${g.slice(0, 3).map((h) => (parseInt(h, 16) || 0).toString(16)).join(':')}::/48`;
    }
    return MASKED_UNKNOWN;
}

export interface AuditIpMaskDeps {
    /** ApplicationDB `AuditLogs` modeli (mongoose). */
    model: any;
    now?: () => Date;
    batchSize?: number;
    maxBatches?: number;
}

export interface AuditIpMaskRunCtx {
    signal?: AbortSignal;
    heartbeat?: (progress?: unknown) => Promise<void>;
}

export interface AuditIpMaskResult {
    processed: number;
    failed: number;
    batches: number;
    /** Tur ust siniri doldu; bekleyen kayit kalmis olabilir. */
    more: boolean;
    cutoff: Date;
}

/** Bekleyen (maskelenmemis) ve esigi gecmis kayit filtresi. `ip $exists` kismi indeksin kosuludur. */
export function pendingFilter(cutoff: Date): Record<string, unknown> {
    return { ip: { $exists: true }, at: { $lt: cutoff } };
}

/** Bir tur: (at,_id) keyset sayfalama + sayfa basina tek `bulkWrite`. Asla tum koleksiyonu bellege almaz. */
export async function runAuditIpMask(deps: AuditIpMaskDeps, ctx: AuditIpMaskRunCtx = {}): Promise<AuditIpMaskResult> {
    const now = (deps.now ?? (() => new Date()))();
    const cutoff = new Date(now.getTime() - AUDIT_IP_MASK_AFTER_DAYS * DAY_MS);
    const batchSize = deps.batchSize ?? AUDIT_IP_MASK_BATCH_SIZE;
    const maxBatches = deps.maxBatches ?? AUDIT_IP_MASK_MAX_BATCHES;
    const out: AuditIpMaskResult = { processed: 0, failed: 0, batches: 0, more: false, cutoff };
    let last: { at: Date; _id: unknown } | null = null;

    while (out.batches < maxBatches) {
        if (ctx.signal?.aborted) { out.more = true; break; }
        const base = pendingFilter(cutoff);
        const filter = last ? { $and: [base, { $or: [{ at: { $gt: last.at } }, { at: last.at, _id: { $gt: last._id } }] }] } : base;
        const rows: Array<{ _id: unknown; at: Date; ip: unknown }> = await deps.model
            .find(filter, { _id: 1, at: 1, ip: 1 }).sort({ at: 1, _id: 1 }).limit(batchSize).maxTimeMS(QUERY_MAX_TIME_MS).lean();
        if (rows.length === 0) break;
        out.batches++;
        const ops = rows.map((r) => ({
            updateOne: { filter: { _id: r._id, ip: r.ip }, update: { $set: { ipMasked: maskIp(r.ip) }, $unset: { ip: '' } } },
        }));
        try {
            const res: any = await deps.model.bulkWrite(ops, { ordered: false });
            const modified = Number(res?.modifiedCount ?? res?.nModified ?? ops.length);
            out.processed += modified;
        } catch (err: any) {
            // ordered:false -> kismi basari; yazilamayanlar `ip`'yi korur ve sonraki turda yeniden denenir (idempotent).
            const ok = Number(err?.result?.modifiedCount ?? err?.result?.nModified ?? 0);
            out.processed += ok;
            out.failed += rows.length - ok;
        }
        const tail = rows[rows.length - 1];
        last = { at: tail.at, _id: tail._id };
        await ctx.heartbeat?.({ processed: out.processed, batches: out.batches });
        if (rows.length < batchSize) break;
        if (out.batches >= maxBatches) out.more = true;
    }
    return out;
}

/** Uretim baglantisi: ApplicationDB tur basinda cozulur. */
export async function runAuditIpMaskProd(ctx: AuditIpMaskRunCtx): Promise<AuditIpMaskResult> {
    const app = await DatabaseManagerInstance.getApplicationDB();
    return runAuditIpMask({ model: app.getAuditLogModel() }, ctx);
}
