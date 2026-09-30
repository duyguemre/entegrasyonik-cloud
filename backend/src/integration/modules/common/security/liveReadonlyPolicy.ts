// LIVE-RO (canlı salt-okuma kipi) — Katman A'nın SAF karar mantığı (ağ/DB/env YOK; testlenebilir, dist'ten `dev-tools/egress-guard.js` yükler).
//
// Amaç: `LIVE_READONLY=1` iken yerel backend, tenant'ın GERÇEK pazaryeri bağlantı bilgileriyle YALNIZ OKUYABİLSİN. Bu dosya "hangi giden HTTP isteği
// geçer?" sorusunun tek cevabıdır; egress-guard (http/https/fetch en alt seviye) her isteği buradan geçirir.
//
// Kural özeti (docs/LIVE_READONLY.md):
//  1. Host: yalnız loopback VEYA `ALLOWED_OUTBOUND_HOSTS` (K7 tek listesi; burada ikinci bir host listesi YOK). Diğer her host (R2/S3, SMTP, CDN, ...) bloklu.
//  2. Yöntem: GET/HEAD serbest. Diğer yöntemler YALNIZ aşağıdaki açık okuma-allowlist'iyle:
//     (a) Pazarama client_credentials token ucu; Ideasoft token ucu YALNIZ `allowTokenRefresh` içinde 'ideasoft' varsa (döner/rotasyonlu refresh_token riski),
//     (b) N11 SOAP (POST /ws/*): gövdedeki TÜM `*Request` operasyonları N11_READ_OPERATIONS içinde olmalı (gövde gerekir -> 'inspect-body'),
//     (c) Pazarama'nın filtreli LİSTELEME için POST kullanan okuma uçları (PAZARAMA_READ_POST_PATHS).
//  3. Başka HER istek (ürün/fiyat/stok gönderme, sipariş durum/kargo/fatura, talep onayı, soru cevabı, N11 REST POST, ...) `block`.
import { ALLOWED_OUTBOUND_HOSTS, hostMatchesPattern } from './outboundHosts';

export const LIVE_READONLY_BLOCKED = 'LIVE_READONLY_BLOCKED';

/** N11 SOAP okuma operasyonları (KODDA kullanılanlar; src/integration/modules/marketplace/n11/api/*). Genişletmek kod incelemesi gerektirir. */
export const N11_READ_OPERATIONS: readonly string[] = [
    'GetTopLevelCategoriesRequest', 'GetCategoryAttributesIdRequest', 'GetCategoryAttributeValueRequest',
    'GetProductListRequest', 'GetProductQuestionListRequest', 'OrderListRequest', 'ClaimReturnListRequest',
    'GetSettlementListRequest', 'GetShipmentCompaniesRequest',
];

/** Pazarama: filtreli okuma için POST kullanan uçlar (yol SONU, büyük/küçük harf duyarsız). Yazma uçları (updateOrderStatus, sellerAnswer, updateRefund, invoice-link, product create/price/stock) YOK. */
export const PAZARAMA_READ_POST_PATHS: readonly RegExp[] = [
    /\/order\/getOrdersForApi$/i, /\/order\/getRefund$/i, /\/order\/paymentAgreement$/i,
    /\/finance\/(getsettlements|getotherfinancials|getcargoinvoicedetails)$/i,
    /\/QuestionAnswer\/getApprovalAnswersByMerchant(Search)?$/i, /\/product\/getProductDetail$/i,
];

const PAZARAMA_TOKEN_PATH = /\/connect\/token$/i;
const IDEASOFT_TOKEN_PATH = /\/oauth(\/v\d+)?\/(token|authorize)$/i;
const READ_METHODS = new Set(['GET', 'HEAD']);
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '::']);

export interface LiveRequest {
    /** 'https:' | 'http:' */
    protocol: string;
    host: string;
    port?: string | number;
    method: string;
    /** Yol (sorgu dizesi olmadan tercih edilir; varsa atılır). */
    path: string;
    /** Yalnız SOAP gövde denetimi için (metin). */
    body?: string;
}

export type LiveDecision =
    | { action: 'allow'; reason: string; operation?: string }
    | { action: 'inspect-body'; reason: string }
    | { action: 'block'; reason: string; operation?: string };

export interface LivePolicyOptions {
    /** `LIVE_READONLY_ALLOW_TOKEN_REFRESH` değeri (ör. ['ideasoft']). Varsayılan: hiçbiri. */
    allowTokenRefresh?: readonly string[];
    /** Test: host tablosu (varsayılan ALLOWED_OUTBOUND_HOSTS). */
    hosts?: Readonly<Record<string, readonly string[]>>;
}

export function normalizeHost(host: string): string {
    return String(host ?? '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

export function isLoopbackHost(host: string): boolean {
    return LOOPBACK.has(normalizeHost(host));
}

/** Host hangi adaptöre ait (izin listesi deseniyle)? Yoksa undefined. */
export function adapterOfHost(host: string, hosts: Readonly<Record<string, readonly string[]>> = ALLOWED_OUTBOUND_HOSTS): string | undefined {
    const h = normalizeHost(host);
    if (!h) return undefined;
    for (const [code, patterns] of Object.entries(hosts)) if (patterns.some(p => hostMatchesPattern(h, p))) return code;
    return undefined;
}

/** Açılış özeti / net-seviye guard için: tüm izinli host desenleri (tek liste, tekrarsız). */
export function liveReadHostPatterns(hosts: Readonly<Record<string, readonly string[]>> = ALLOWED_OUTBOUND_HOSTS): string[] {
    return [...new Set(Object.values(hosts).flat())];
}

/** Net-seviye (TCP) guard: loopback veya izinli canlı host mu? */
export function isAllowedLiveHost(host: string, hosts: Readonly<Record<string, readonly string[]>> = ALLOWED_OUTBOUND_HOSTS): boolean {
    return isLoopbackHost(host) || adapterOfHost(host, hosts) !== undefined;
}

/** N11 SOAP gövdesindeki operasyon adları (`<sch:GetProductListRequest>` -> `GetProductListRequest`). */
export function soapOperationsOf(body: string): string[] {
    const out: string[] = [];
    const re = /<(?:[A-Za-z_][\w.-]*:)?([A-Za-z][\w]*Request)(?=[\s>/])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) out.push(m[1]);
    return out;
}

function pathOnly(p: string): string {
    const s = String(p ?? '/');
    const cut = s.search(/[?#]/);
    return cut >= 0 ? s.slice(0, cut) : s;
}

/** Log için yol: uzun sayısal kimlikler maskelenir (değersiz log). */
export function redactPathForLog(p: string): string {
    return pathOnly(p).replace(/\/\d{4,}(?=\/|$)/g, '/:n').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid').replace(/[0-9a-f]{24}/gi, ':oid');
}

export function evaluateLiveRequest(req: LiveRequest, opts: LivePolicyOptions = {}): LiveDecision {
    const hosts = opts.hosts ?? ALLOWED_OUTBOUND_HOSTS;
    const host = normalizeHost(req.host);
    const method = String(req.method || 'GET').toUpperCase();
    const path = pathOnly(req.path);

    if (isLoopbackHost(host)) return { action: 'allow', reason: 'loopback' };

    const adapter = adapterOfHost(host, hosts);
    if (!adapter) return { action: 'block', reason: 'host-not-allowed' };
    if (req.protocol !== 'https:') return { action: 'block', reason: 'https-required' };
    if (req.port !== undefined && req.port !== '' && String(req.port) !== '443') return { action: 'block', reason: 'port-not-allowed' };

    if (READ_METHODS.has(method)) return { action: 'allow', reason: 'read-method' };

    // --- Yazma yöntemi: yalnız açık okuma allowlist'i ---
    if (method === 'POST') {
        if (adapter === 'pazarama') {
            if (PAZARAMA_TOKEN_PATH.test(path)) return { action: 'allow', reason: 'oauth-token', operation: 'token' };
            if (PAZARAMA_READ_POST_PATHS.some(r => r.test(path))) return { action: 'allow', reason: 'read-post', operation: path.split('/').pop() };
        }
        if (adapter === 'ideasoft' && IDEASOFT_TOKEN_PATH.test(path)) {
            const allowed = (opts.allowTokenRefresh ?? []).map(s => s.trim().toLowerCase());
            return allowed.includes('ideasoft')
                ? { action: 'allow', reason: 'oauth-token', operation: 'token' }
                : { action: 'block', reason: 'token-refresh-disabled', operation: 'token' };
        }
        if (adapter === 'n11' && /^\/ws\//i.test(path)) {
            if (req.body === undefined) return { action: 'inspect-body', reason: 'n11-soap' };
            const ops = soapOperationsOf(req.body);
            if (ops.length === 0) return { action: 'block', reason: 'soap-operation-unknown', operation: 'unknown' };
            const bad = ops.find(o => !N11_READ_OPERATIONS.includes(o));
            if (bad) return { action: 'block', reason: 'soap-write-operation', operation: bad };
            return { action: 'allow', reason: 'soap-read', operation: ops[0] };
        }
    }
    return { action: 'block', reason: 'write-method-not-allowlisted' };
}

// --- Başlangıç denetimleri (saf) ---------------------------------------------------------------------------------------

/** `DB_URL` sunucu kısmındaki host'lar (mongodb[+srv]://[kullanıcı:parola@]h1[:p],h2/...). Parola/kullanıcı ASLA döndürülmez. Ayrıştırılamazsa []. */
export function dbUrlHosts(url: string | undefined): { srv: boolean; hosts: string[] } {
    const m = /^mongodb(\+srv)?:\/\/(?:[^@/]*@)?([^/?#]+)/i.exec(String(url ?? '').trim());
    if (!m) return { srv: false, hosts: [] };
    const hosts = m[2].split(',').map(h => normalizeHost(h.replace(/:\d+$/, ''))).filter(Boolean);
    return { srv: !!m[1], hosts };
}

/** DB_URL yalnız yerel (loopback) host'lara işaret ediyor mu? SRV (Atlas biçimi) ve boş/ayrıştırılamaz değer false. */
export function isLocalDbUrl(url: string | undefined): boolean {
    const { srv, hosts } = dbUrlHosts(url);
    return !srv && hosts.length > 0 && hosts.every(isLoopbackHost);
}
