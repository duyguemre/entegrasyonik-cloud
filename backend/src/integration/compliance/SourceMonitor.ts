// ADR-0018 Karar 2c (Aşama B) — Haftalık kaynak izleyici: resmi doküman/changelog/duyuru sayfalarını periyodik
// çeker, içerik hash'i/diff'i karşılaştırır. Bu GERÇEK bir dış ağ isteğidir (tenant/platform kimlik bilgisi
// İÇERMEZ, genel web sayfası -- egress guard kapsamı DIŞI). Varsayılan `SOURCE_MONITOR_ENABLED=false`: bu
// görevde GERÇEK istek ATILMADI, yalnız enjekte edilmiş sahte `fetchDoc`/`fetchRobots` ile test edildi.
//
// Hukuki/etik sınırlar (ADR bağlayıcı): robots.txt'e uyulur; kimliği belli User-Agent; URL başına haftada <=1
// istek, toplam <=1 istek/sn; hata durumunda SESSİZCE atla (bulgu ÜRETME, yalnız logla).
import crypto from 'crypto';
import { config } from '@config';
import { logger as rootLogger, Logger } from '@platform/core/logger';
import type { JobOutcome } from '@platform/runtime/scheduler';
import { listIntegrationDescriptors } from '@integration/catalog/IntegrationDescriptorRegistry';
import type { IntegrationDescriptor } from '@integration/catalog/types';
import { FindingService, type ReportFindingInput } from './FindingService';

export interface DocMonitorTarget {
    integrationCode: string;
    category: string;
    url: string;
    kind: string;
}

/** `descriptor.api.docs[]` içinde `monitor==='auto'` işaretli tüm URL'ler (ADR: yalnız bunlar otomatik izlenir). */
export function listAutoMonitoredDocs(descriptors: readonly IntegrationDescriptor[] = listIntegrationDescriptors()): DocMonitorTarget[] {
    const out: DocMonitorTarget[] = [];
    for (const d of descriptors) {
        for (const doc of d.api.docs) {
            if (doc.monitor === 'auto') out.push({ integrationCode: d.code, category: d.category, url: doc.url, kind: doc.kind });
        }
    }
    return out;
}

// --- Metin normalizasyonu (ADR: "script/nav/footer atılır, boşluk normalize edilir") -------------------------------

const STRIP_BLOCK_TAGS = /<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi;
const BLOCK_BREAK_TAGS = /<\/(p|div|li|tr|h[1-6]|section|article|header|footer)>|<br\s*\/?>/gi;
const ANY_TAG = /<[^>]+>/g;
const HTML_ENTITIES: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
};
const MAX_LINES = 2000;
const MAX_LINE_HASHES = 2000;

function decodeEntities(s: string): string {
    return s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => HTML_ENTITIES[m] ?? m);
}

/** HTML -> normalize edilmiş, boş satırları atılmış satır listesi (script/style/nav/footer/header ÇIKARILIR). */
export function normalizeHtmlToLines(html: string): string[] {
    const withoutBlocks = html.replace(STRIP_BLOCK_TAGS, '\n');
    const withBreaks = withoutBlocks.replace(BLOCK_BREAK_TAGS, '\n');
    const withoutTags = withBreaks.replace(ANY_TAG, ' ');
    const decoded = decodeEntities(withoutTags);
    return decoded
        .split('\n')
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter((l) => l.length > 0)
        .slice(0, MAX_LINES);
}

/** Sıralı satırların SHA-256'sı (tek doğruluk kaynağı: "değişti mi" karşılaştırması bunun üzerinden yapılır). */
export function computeContentHash(lines: string[]): string {
    return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}

/** Satır başına 12-hex kısaltılmış hash (ham metin ASLA saklanmaz; yalnız "hangi satırlar farklı" karşılaştırması için). */
export function computeLineHashes(lines: string[]): string[] {
    return lines.slice(0, MAX_LINE_HASHES).map((l) => crypto.createHash('sha256').update(l).digest('hex').slice(0, 12));
}

const MAX_DIFF_CHARS = 2 * 1024;

/**
 * Eski/yeni satır-hash listelerinden ≤2KB'lık İNSAN OKUNUR bir özet üretir. Ham metin/İÇERİK asla girmez --
 * yalnız kaç satırın eklendiği/çıkarıldığı/toplam sayısı (ADR Karar 2c "≤2KB'lık satır diff özeti").
 */
export function summarizeLineDiff(oldHashes: readonly string[], newHashes: readonly string[]): string {
    const oldSet = new Set(oldHashes);
    const newSet = new Set(newHashes);
    let added = 0;
    let removed = 0;
    for (const h of newHashes) if (!oldSet.has(h)) added++;
    for (const h of oldHashes) if (!newSet.has(h)) removed++;
    const summary = `İçerik değişti: ${oldHashes.length} -> ${newHashes.length} satır (+${added} eklendi / -${removed} çıkarıldı).`;
    return summary.length > MAX_DIFF_CHARS ? summary.slice(0, MAX_DIFF_CHARS) : summary;
}

// --- robots.txt (ADR bağlayıcı: "robots.txt'e uyulur") ---------------------------------------------------------

/**
 * Yalnız `User-agent: *` grubunu okuyan minimal bir robots.txt yorumlayıcısı (en uzun eşleşen `Disallow`/`Allow`
 * kazanır -- standart basit robots.txt semantiği). `robotsTxt=null` (çekilemedi/yok) -> İZİNLİ varsayılır.
 */
export function isPathAllowedByRobots(robotsTxt: string | null, pathAndQuery: string): boolean {
    if (!robotsTxt) return true;
    let inWildcardGroup = false;
    let matchedAnyAgent = false;
    const disallows: string[] = [];
    const allows: string[] = [];

    for (const raw of robotsTxt.split(/\r?\n/)) {
        const line = raw.split('#')[0].trim();
        if (!line) continue;
        const m = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
        if (!m) continue;
        const field = m[1].toLowerCase();
        const value = m[2].trim();
        if (field === 'user-agent') {
            inWildcardGroup = value === '*';
            if (inWildcardGroup) matchedAnyAgent = true;
            continue;
        }
        if (!inWildcardGroup) continue;
        if (field === 'disallow' && value) disallows.push(value);
        if (field === 'allow' && value) allows.push(value);
    }
    if (!matchedAnyAgent) return true;

    let best: { len: number; allow: boolean } | null = null;
    for (const d of disallows) if (pathAndQuery.startsWith(d) && (!best || d.length > best.len)) best = { len: d.length, allow: false };
    for (const a of allows) if (pathAndQuery.startsWith(a) && (!best || a.length > best.len)) best = { len: a.length, allow: true };
    return best ? best.allow : true;
}

// --- Snapshot depolama (varsayılan: ApplicationDB; testte enjekte edilir) ---------------------------------------

export interface SourceSnapshotRecord {
    url: string;
    integrationCode: string;
    category: string;
    contentHash?: string;
    lineHashes?: string[];
    etag?: string;
    lastModified?: string;
    lastCheckedAt?: Date;
    lastChangedAt?: Date;
    lastDiff?: string;
    changeCount?: number;
}

async function getModel() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- TS6-01: node16 CJS, tembel yukleme (dinamik import yerine)
    const { DatabaseManagerInstance } = (require('@database/DatabaseManager') as typeof import('@database/DatabaseManager'));
    const db = await DatabaseManagerInstance.getApplicationDB();
    return (db as any).getSourceSnapshotModel();
}

async function defaultReadSnapshot(url: string): Promise<SourceSnapshotRecord | null> {
    const model = await getModel();
    return model.findOne({ url }).lean();
}

async function defaultWriteSnapshot(record: SourceSnapshotRecord): Promise<void> {
    const model = await getModel();
    await model.findOneAndUpdate({ url: record.url }, { $set: record }, { upsert: true, new: true });
}

// --- HTTP (varsayılan: axios; yalnız SOURCE_MONITOR_ENABLED=true iken ÇAĞRILIR) ---------------------------------

export interface HttpDocResponse { status: number; headers: Record<string, string>; body: string }

/** [ADR-0022] Doküman yanıt tavanı (2 MB) ve yönlendirme sınırı. */
export const SOURCE_MONITOR_MAX_BYTES = 2 * 1024 * 1024;
export const SOURCE_MONITOR_MAX_REDIRECTS = 3;

/** İzinli host kümesi: izlenen tüm hedef URL'lerin host'ları (yeni host eklemek = descriptor.api.docs değişikliği = kod incelemesi). */
function monitoredHosts(): Set<string> {
    const set = new Set<string>();
    for (const t of listAutoMonitoredDocs()) {
        try { set.add(new URL(t.url).hostname.toLowerCase()); } catch { /* geçersiz hedef atlanır */ }
    }
    return set;
}

/** Yalnız http(s) + izinli host; IP literal (iç ağ/metadata) ve kimlik bilgili URL reddedilir. */
export function isSafeMonitorUrl(raw: string, allowedHosts: ReadonlySet<string>): boolean {
    let u: URL;
    try { u = new URL(raw); } catch { return false; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    if (u.username || u.password) return false;
    const host = u.hostname.toLowerCase();
    if (host.startsWith('[') || /^[0-9.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return false;
    return allowedHosts.has(host);
}

export interface SafeGetOptions {
    allowedHosts: ReadonlySet<string>;
    timeoutMs: number;
    maxRedirects: number;
    maxBytes?: number;
    /** Test enjeksiyonu (varsayılan: axios). */
    httpGet?: (url: string, cfg: any) => Promise<{ status: number; headers: any; data: any }>;
}

/**
 * [ADR-0022] Güvenli GET: axios otomatik yönlendirmesi KAPALI; her hop elle izlenir ve HER hop'ta host izin listesi
 * denetlenir (izinsiz host'a istek HİÇ atılmaz); en fazla `maxRedirects` hop; gövde tavanı.
 * Hop'lar arası başlıklar aynen taşınır YALNIZ aynı host'a (cross-host zaten reddedildiği için fiilen hep aynı küme).
 */
export async function safeGetText(url: string, headers: Record<string, string>, opts: SafeGetOptions): Promise<HttpDocResponse> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- TS6-01: node16 CJS, tembel yukleme (dinamik import yerine)
    const httpGet = opts.httpGet ?? (async (u: string, cfg: any) => (require('axios') as { get(u: string, cfg?: any): Promise<any> }).get(u, cfg));
    let current = url;
    for (let hop = 0; hop <= opts.maxRedirects; hop++) {
        if (!isSafeMonitorUrl(current, opts.allowedHosts)) throw new Error('kaynak izleme: URL izin listesi dışı/güvensiz, istek atılmadı');
        const res = await httpGet(current, {
            headers, timeout: opts.timeoutMs, validateStatus: () => true, responseType: 'text',
            maxRedirects: 0, maxContentLength: opts.maxBytes ?? SOURCE_MONITOR_MAX_BYTES, maxBodyLength: opts.maxBytes ?? SOURCE_MONITOR_MAX_BYTES,
        });
        if (res.status >= 300 && res.status < 400 && res.status !== 304) {
            const loc = res.headers?.location ?? res.headers?.Location;
            if (!loc) throw new Error('kaynak izleme: yönlendirme Location içermiyor');
            if (hop === opts.maxRedirects) throw new Error('kaynak izleme: yönlendirme sınırı aşıldı');
            let next: string;
            try { next = new URL(String(loc), current).toString(); } catch { throw new Error('kaynak izleme: geçersiz yönlendirme'); }
            current = next;
            continue;
        }
        return { status: res.status, headers: (res.headers as any) ?? {}, body: typeof res.data === 'string' ? res.data : String(res.data ?? '') };
    }
    throw new Error('kaynak izleme: yönlendirme sınırı aşıldı');
}

async function defaultFetchDoc(url: string, headers: Record<string, string>): Promise<HttpDocResponse> {
    const allowed = monitoredHosts();
    try { allowed.add(new URL(url).hostname.toLowerCase()); } catch { /* safeGetText reddeder */ }
    return safeGetText(url, headers, { allowedHosts: allowed, timeoutMs: 10_000, maxRedirects: SOURCE_MONITOR_MAX_REDIRECTS });
}

/** `null`: robots.txt yok/erişilemedi -> İZİNLİ varsayılır (yaygın bot davranışı; ADR bunu yasaklamaz). */
async function defaultFetchRobots(origin: string, userAgent: string): Promise<string | null> {
    try {
        const host = new URL(origin).hostname.toLowerCase();
        const res = await safeGetText(`${origin}/robots.txt`, { 'User-Agent': userAgent }, { allowedHosts: new Set([host]), timeoutMs: 5_000, maxRedirects: 0 });
        return res.status === 200 ? res.body : null;
    } catch {
        return null;
    }
}

// --- Ana çalıştırıcı ---------------------------------------------------------------------------------------------

export interface SourceMonitorDeps {
    enabled?: boolean;
    targets?: DocMonitorTarget[];
    fetchDoc?: (url: string, headers: Record<string, string>) => Promise<HttpDocResponse>;
    fetchRobots?: (origin: string, userAgent: string) => Promise<string | null>;
    readSnapshot?: (url: string) => Promise<SourceSnapshotRecord | null>;
    writeSnapshot?: (record: SourceSnapshotRecord) => Promise<void>;
    reportFinding?: (input: ReportFindingInput) => Promise<void>;
    now?: () => Date;
    sleep?: (ms: number) => Promise<void>;
    userAgent?: string;
    /** Varsayılan 7 gün (ADR: "haftada 1"). Testler için enjekte edilebilir. */
    weeklyIntervalMs?: number;
    logger?: Logger;
}

/**
 * Zamanlanmış turun tek girişi (`SourceMonitorScheduler` bunu `runJob` içinde çağırır).
 * `enabled=false` (varsayılan, `SOURCE_MONITOR_ENABLED`): hiçbir ağ isteği atmaz, `skipped` döner.
 */
export async function runSourceMonitor(deps: SourceMonitorDeps = {}): Promise<JobOutcome> {
    const log = deps.logger ?? rootLogger.child({ module: 'compliance:SourceMonitor' });
    const enabled = deps.enabled ?? config.compliance.sourceMonitorEnabled;
    if (!enabled) return { skipped: 'source_monitor_disabled', processed: 0 };

    const targets = deps.targets ?? listAutoMonitoredDocs();
    const now = deps.now ?? (() => new Date());
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const userAgent = deps.userAgent ?? config.compliance.sourceMonitorUserAgent;
    const weeklyIntervalMs = deps.weeklyIntervalMs ?? 7 * 24 * 60 * 60 * 1000;
    const readSnapshot = deps.readSnapshot ?? defaultReadSnapshot;
    const writeSnapshot = deps.writeSnapshot ?? defaultWriteSnapshot;
    const reportFinding = deps.reportFinding ?? FindingService.report;
    const fetchDoc = deps.fetchDoc ?? defaultFetchDoc;
    const fetchRobots = deps.fetchRobots ?? defaultFetchRobots;

    let processed = 0;
    let failed = 0;
    let skippedByWeeklyGate = 0;
    let skippedByRobots = 0;
    let changed = 0;
    const robotsCache = new Map<string, string | null>();

    for (const target of targets) {
        try {
            const existing = await readSnapshot(target.url);
            if (existing?.lastCheckedAt && (now().getTime() - new Date(existing.lastCheckedAt).getTime()) < weeklyIntervalMs) {
                skippedByWeeklyGate++;
                continue; // URL başına haftada <=1 istek (ADR Karar 2c)
            }

            let origin: string;
            let pathAndQuery: string;
            try {
                const u = new URL(target.url);
                origin = u.origin;
                pathAndQuery = u.pathname + u.search;
            } catch {
                log.warn({ url: target.url }, 'kaynak izleme: geçersiz URL, atlandı');
                failed++;
                continue;
            }

            if (!robotsCache.has(origin)) {
                robotsCache.set(origin, await fetchRobots(origin, userAgent).catch(() => null));
            }
            if (!isPathAllowedByRobots(robotsCache.get(origin) ?? null, pathAndQuery)) {
                log.info({ url: target.url }, 'kaynak izleme: robots.txt tarafından yasaklandı, atlandı');
                skippedByRobots++;
                continue;
            }

            const headers: Record<string, string> = { 'User-Agent': userAgent };
            if (existing?.etag) headers['If-None-Match'] = existing.etag;
            if (existing?.lastModified) headers['If-Modified-Since'] = existing.lastModified;

            const res = await fetchDoc(target.url, headers);
            processed++;
            await sleep(1000); // toplam <=1 istek/sn (ADR Karar 2c)

            if (res.status === 304) {
                await writeSnapshot({ ...(existing as SourceSnapshotRecord), url: target.url, integrationCode: target.integrationCode, category: target.category, lastCheckedAt: now() });
                continue;
            }
            if (res.status < 200 || res.status >= 300) {
                log.warn({ url: target.url, status: res.status }, 'kaynak izleme: beklenmeyen HTTP durumu, sessizce atlandı (bulgu ÜRETİLMEDİ)');
                failed++;
                continue;
            }

            const lines = normalizeHtmlToLines(res.body);
            const contentHash = computeContentHash(lines);
            const lineHashes = computeLineHashes(lines);
            const etag = res.headers['etag'] ?? res.headers['ETag'];
            const lastModified = res.headers['last-modified'] ?? res.headers['Last-Modified'];

            if (existing?.contentHash && existing.contentHash !== contentHash) {
                changed++;
                const diffSummary = summarizeLineDiff(existing.lineHashes ?? [], lineHashes);
                await reportFinding({
                    integrationCode: target.integrationCode, category: target.category, kind: 'doc', source: 'source_monitor',
                    subjectKey: target.url, severity: 'info',
                    evidence: { docDiff: diffSummary, fingerprint: contentHash },
                });
                await writeSnapshot({
                    url: target.url, integrationCode: target.integrationCode, category: target.category,
                    contentHash, lineHashes, etag, lastModified, lastCheckedAt: now(), lastChangedAt: now(),
                    lastDiff: diffSummary, changeCount: (existing.changeCount ?? 0) + 1,
                });
            } else {
                await writeSnapshot({
                    url: target.url, integrationCode: target.integrationCode, category: target.category,
                    contentHash, lineHashes, etag, lastModified, lastCheckedAt: now(),
                    lastChangedAt: existing?.lastChangedAt, lastDiff: existing?.lastDiff, changeCount: existing?.changeCount ?? 0,
                });
            }
        } catch (e: any) {
            failed++;
            log.warn({ url: target.url, err: e?.message }, 'kaynak izleme: hata, SESSİZCE atlandı (ADR-0018 Karar 2c, bulgu ÜRETİLMEDİ)');
        }
    }

    return {
        processed, failed, skipped: false,
        skippedByWeeklyGate, skippedByRobots, changed, targetCount: targets.length,
    };
}
