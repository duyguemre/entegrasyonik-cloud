// ADR-0026 WP-LOG L1: log/hata-grubu SORGU servisi (yalnız repository katmanı; uçlar L2+ backoffice'te -- bu pakette YOK).
// Kurallar: her sorgu `maxTimeMS` (5 sn) taşır; sonuç sayısı SINIRLI (sayfa <=200, grup <=200, iz <=500); zaman aralığı VARSAYILAN
// son 24 saat (indeksli ve sınırlı tarama); filtre değerleri yalnız ilkel tip (NoSQL operatör enjeksiyonu yok); metin araması
// yalnız ÖNEK (regex YOK). Sayfalama: (ts,_id) keyset imleci (skip yok).
import { Types } from 'mongoose';
import type { LogEventDoc } from './logRecord';
import { tenantBucketOf } from '../metrics/errorEvents';

export const QUERY_MAX_TIME_MS = 5000;
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_GROUPS = 200;
export const MAX_TRACE_ENTRIES = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_MS = DAY_MS;
const MAX_RANGE_MS = 31 * DAY_MS;

export interface TimeRange { from?: Date; to?: Date }

export interface LogQueryDeps {
    /** LogEvents modeli (mongoose Model ya da uyumlu). Verilmezse ApplicationDB'den tembel çözülür. */
    logModel?: any;
    /** ErrorEvents modeli. */
    errorModel?: any;
    now?: () => Date;
}

export interface LogFilters extends TimeRange {
    level?: string[];
    source?: string[];
    errorClass?: string[];
    tenantId?: number;
    integrationCode?: string;
    operation?: string;
    correlationId?: string;
    fingerprint?: string;
    /** msg ÖNEKİ (regex değil). */
    textPrefix?: string;
    limit?: number;
}

export interface LogPage { items: Array<LogEventDoc & { _id: string }>; nextCursor?: string }

export class LogQueryError extends Error {
    constructor(message: string) { super(message); this.name = 'LogQueryError'; }
}

// ---- doğrulama yardımcıları ----------------------------------------------------------------------------------------------
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256;
function reqStr(name: string, v: unknown): string {
    if (!isStr(v)) throw new LogQueryError(`${name}: geçersiz değer`);
    return v;
}
function strList(name: string, v: unknown): string[] | undefined {
    if (v === undefined) return undefined;
    if (!Array.isArray(v) || v.length > 20 || !v.every(isStr)) throw new LogQueryError(`${name}: geçersiz liste`);
    return v as string[];
}
function optStr(name: string, v: unknown): string | undefined { return v === undefined ? undefined : reqStr(name, v); }

function resolveRange(r: TimeRange, now: Date): { from: Date; to: Date } {
    const to = r.to ?? now;
    const from = r.from ?? new Date(to.getTime() - DEFAULT_RANGE_MS);
    if (!(from instanceof Date) || !(to instanceof Date) || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new LogQueryError('aralık: geçersiz tarih');
    if (from.getTime() > to.getTime()) throw new LogQueryError('aralık: from > to');
    // Üst sınır: tarama maliyetini bağlar (TTL zaten <=14 gün; ErrorEvents 30 gün).
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) return { from: new Date(to.getTime() - MAX_RANGE_MS), to };
    return { from, to };
}

const clampLimit = (n: unknown, def: number, max: number): number => {
    const v = typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : def;
    return Math.min(max, Math.max(1, v));
};

async function logModelOf(deps?: LogQueryDeps): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- tembel yükleme: test/enjeksiyon yolunda mongoose modeli yüklenmesin
    return deps?.logModel ?? require('./prodDeps').productionLogEventModel();
}
async function errorModelOf(deps?: LogQueryDeps): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- tembel yükleme: test/enjeksiyon yolunda mongoose modeli yüklenmesin
    return deps?.errorModel ?? require('../metrics/prodDeps').productionErrorEventModel();
}
const nowOf = (deps?: LogQueryDeps): Date => (deps?.now ?? (() => new Date()))();

// ---- imleç -----------------------------------------------------------------------------------------------------------------
function encodeCursor(ts: Date, id: unknown): string {
    return Buffer.from(`${ts.getTime()}:${String(id)}`, 'utf8').toString('base64url');
}
function decodeCursor(cursor: string): { ts: Date; id: string } {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const m = /^(\d{1,15}):([a-f0-9]{24})$/.exec(raw);
    if (!m) throw new LogQueryError('imleç geçersiz');
    return { ts: new Date(Number(m[1])), id: m[2] };
}

// ---- filtre -> $match ------------------------------------------------------------------------------------------------------
export function buildLogMatch(f: LogFilters, now: Date): Record<string, unknown> {
    const { from, to } = resolveRange(f, now);
    const q: Record<string, unknown> = { ts: { $gte: from, $lte: to } };
    const level = strList('level', f.level); if (level) q.level = { $in: level };
    const source = strList('source', f.source); if (source) q.source = { $in: source };
    const ec = strList('errorClass', f.errorClass); if (ec) q.errorClass = { $in: ec };
    if (f.tenantId !== undefined) {
        if (typeof f.tenantId !== 'number' || !Number.isFinite(f.tenantId)) throw new LogQueryError('tenantId: geçersiz değer');
        q.tenantId = f.tenantId;
    }
    const integ = optStr('integrationCode', f.integrationCode); if (integ) q.integrationCode = integ;
    const op = optStr('operation', f.operation); if (op) q.operation = op;
    const corr = optStr('correlationId', f.correlationId); if (corr) q.correlationId = corr;
    const fp = optStr('fingerprint', f.fingerprint); if (fp) q.fingerprint = fp;
    const prefix = optStr('textPrefix', f.textPrefix);
    if (prefix) q.msg = { $gte: prefix, $lt: prefix + '￿' }; // regex YOK: sözlük sırası aralığı = önek
    return q;
}

// ---- 1) listLogs -----------------------------------------------------------------------------------------------------------
export async function listLogs(filters: LogFilters = {}, cursor?: string, deps?: LogQueryDeps): Promise<LogPage> {
    const now = nowOf(deps);
    const limit = clampLimit(filters.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const match = buildLogMatch(filters, now);
    let query: Record<string, unknown> = match;
    if (cursor !== undefined) {
        const c = decodeCursor(reqStr('cursor', cursor));
        query = { $and: [match, { $or: [{ ts: { $lt: c.ts } }, { ts: c.ts, _id: { $lt: new Types.ObjectId(c.id) } }] }] };
    }
    const model = await logModelOf(deps);
    const rows: any[] = await model.find(query).sort({ ts: -1, _id: -1 }).limit(limit + 1).maxTimeMS(QUERY_MAX_TIME_MS).lean();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return { items: items.map((r) => ({ ...r, _id: String(r._id) })), nextCursor: hasMore && last ? encodeCursor(last.ts, last._id) : undefined };
}

// ---- 2) getIssueGroups (ErrorEvents) ---------------------------------------------------------------------------------------
export type IssueSort = 'lastSeen' | 'count' | 'tenantCount' | 'firstSeen';
export interface IssueGroupFilters extends TimeRange {
    status?: 'open' | 'acknowledged' | 'resolved' | 'muted';
    source?: 'server' | 'client';
    module?: string;
    integrationCode?: string;
    /** BE-06: tenant süzgeci. ErrorEvents tenant kimliği saklamaz; kova (`tenantBuckets`) eşleşmesiyle uygulanır -> YAKLAŞIK (fazla gelebilir, eksik gelmez). */
    tenantId?: number;
    sort?: IssueSort;
    limit?: number;
}
export interface IssueGroup {
    fp: string; source: string; module?: string; code?: string; integrationCode?: string;
    count: number; rangeCount: number; tenantCount: number; firstSeen: Date; lastSeen: Date; status: string; sampleMessage?: string;
}

const STATUSES = ['open', 'acknowledged', 'resolved', 'muted'];
const SORTS: Record<IssueSort, Record<string, 1 | -1>> = {
    lastSeen: { lastSeen: -1 }, count: { count: -1 }, tenantCount: { tenantCount: -1, lastSeen: -1 }, firstSeen: { firstSeen: -1 },
};

/** Aralıkta (lastSeen >= from) görülen hata grupları; `rangeCount` = günlük kovalardan aralık toplamı. */
export async function getIssueGroups(filters: IssueGroupFilters = {}, deps?: LogQueryDeps): Promise<IssueGroup[]> {
    const now = nowOf(deps);
    const { from, to } = resolveRange(filters, now);
    const match: Record<string, unknown> = { lastSeen: { $gte: from } };
    if (filters.status !== undefined) { if (!STATUSES.includes(filters.status)) throw new LogQueryError('status: geçersiz'); match.status = filters.status; }
    if (filters.source !== undefined) { if (filters.source !== 'server' && filters.source !== 'client') throw new LogQueryError('source: geçersiz'); match.source = filters.source; }
    const mod = optStr('module', filters.module); if (mod) match.module = mod;
    const integ = optStr('integrationCode', filters.integrationCode); if (integ) match.integrationCode = integ;
    if (filters.tenantId !== undefined) {
        if (typeof filters.tenantId !== 'number' || !Number.isInteger(filters.tenantId) || filters.tenantId <= 0) throw new LogQueryError('tenantId: geçersiz değer');
        match.tenantBuckets = tenantBucketOf(filters.tenantId);
    }
    const sortKey = filters.sort ?? 'lastSeen';
    if (!SORTS[sortKey]) throw new LogQueryError('sort: geçersiz');
    const limit = clampLimit(filters.limit, 50, MAX_GROUPS);
    const fromDay = from.toISOString().slice(0, 10);
    const toDay = to.toISOString().slice(0, 10);

    const pipeline: Record<string, unknown>[] = [
        { $match: match },
        {
            $addFields: {
                rangeCount: {
                    $reduce: {
                        input: { $filter: { input: { $ifNull: ['$daily', []] }, as: 'x', cond: { $and: [{ $gte: ['$$x.d', fromDay] }, { $lte: ['$$x.d', toDay] }] } } },
                        initialValue: 0, in: { $add: ['$$value', '$$this.n'] },
                    },
                },
            },
        },
        { $sort: SORTS[sortKey] },
        { $limit: limit },
        {
            $project: {
                _id: 0, fp: 1, source: 1, module: 1, code: 1, integrationCode: 1, count: 1, rangeCount: 1,
                tenantCount: { $ifNull: ['$tenantCount', 0] }, firstSeen: 1, lastSeen: 1, status: 1, sampleMessage: '$sample.message',
            },
        },
    ];
    const model = await errorModelOf(deps);
    return model.aggregate(pipeline).option({ maxTimeMS: QUERY_MAX_TIME_MS });
}

// ---- 3) getIssueTrend ------------------------------------------------------------------------------------------------------
export interface TrendPoint { day: string; count: number }

/**
 * Bir hata grubunun günlük trendi (UTC gün). Birincil kaynak `ErrorEvents.daily` (fp = ErrorEvents parmak izi, son 30 gün);
 * kayıt yoksa `LogEvents.fingerprint` üzerinden günlük toplama (yalnız LogEvents TTL penceresi). Boş günler 0 ile doldurulur.
 */
export async function getIssueTrend(fingerprint: string, range: TimeRange = {}, deps?: LogQueryDeps): Promise<TrendPoint[]> {
    const fp = reqStr('fingerprint', fingerprint);
    const now = nowOf(deps);
    const { from, to } = resolveRange({ from: range.from ?? new Date(now.getTime() - 29 * DAY_MS), to: range.to }, now);
    const fromDay = from.toISOString().slice(0, 10);
    const toDay = to.toISOString().slice(0, 10);

    const errModel = await errorModelOf(deps);
    const doc: any = await errModel.findOne({ fp }).select({ daily: 1 }).maxTimeMS(QUERY_MAX_TIME_MS).lean();
    const byDay = new Map<string, number>();
    if (doc) {
        for (const p of (doc.daily ?? []) as Array<{ d: string; n: number }>) byDay.set(p.d, p.n);
    } else {
        const logModel = await logModelOf(deps);
        const rows: Array<{ _id: string; n: number }> = await logModel.aggregate([
            { $match: { fingerprint: fp, ts: { $gte: from, $lte: to } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$ts', timezone: 'UTC' } }, n: { $sum: 1 } } },
            { $limit: 40 },
        ]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
        for (const r of rows) byDay.set(r._id, r.n);
    }
    const out: TrendPoint[] = [];
    for (let t = Date.parse(fromDay + 'T00:00:00Z'); t <= Date.parse(toDay + 'T00:00:00Z') && out.length < 40; t += DAY_MS) {
        const day = new Date(t).toISOString().slice(0, 10);
        out.push({ day, count: byDay.get(day) ?? 0 });
    }
    return out;
}

// ---- 4) getTrace -----------------------------------------------------------------------------------------------------------
export type TraceEntry = LogEventDoc & { _id: string };

/** Bir correlationId'nin (= reqId) tüm kalıcı log kayıtları, zaman sırasıyla (en çok 500). */
export async function getTrace(correlationId: string, deps?: LogQueryDeps): Promise<TraceEntry[]> {
    const id = reqStr('correlationId', correlationId);
    const model = await logModelOf(deps);
    const rows: any[] = await model.find({ correlationId: id }).sort({ ts: 1, _id: 1 }).limit(MAX_TRACE_ENTRIES).maxTimeMS(QUERY_MAX_TIME_MS).lean();
    return rows.map((r) => ({ ...r, _id: String(r._id) }));
}

// ---- 5) getVolumeByCategory ------------------------------------------------------------------------------------------------
export interface CategoryVolume { source: string; level: string; count: number }

/** Aralıkta kaynak x seviye hacmi (en çok 200 satır; büyükten küçüğe). */
export async function getVolumeByCategory(range: TimeRange = {}, deps?: LogQueryDeps): Promise<CategoryVolume[]> {
    const { from, to } = resolveRange(range, nowOf(deps));
    const model = await logModelOf(deps);
    const rows: Array<{ _id: { source?: string; level: string }; n: number }> = await model.aggregate([
        { $match: { ts: { $gte: from, $lte: to } } },
        { $group: { _id: { source: '$source', level: '$level' }, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: MAX_GROUPS },
    ]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
    return rows.map((r) => ({ source: r._id.source ?? 'unknown', level: r._id.level, count: r.n }));
}
