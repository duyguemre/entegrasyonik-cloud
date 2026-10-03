'use strict';
/**
 * LIVE-RO — "canlı salt-okuma" kipi, KATMAN A: http/https/fetch seviyesinde yöntem+host+yol(+SOAP operasyonu) kapısı.
 * (Katman B: uygulama içi — yazan işçiler başlatılmaz, yazma RPC'leri 423; bkz. docs/LIVE_READONLY.md.)
 *
 * Kullanım:   node -r ./dev-tools/egress-guard.js -r ./dev-tools/live-readonly-guard.js dist/entegrasyonik.js   (bkz. `npm run start:live-readonly`)
 * Bu dosya `-r` ile yüklenince KENDİLİĞİNDEN: (1) LIVE_READONLY=true kurar, (2) .env'i okur, (3) *_MOCK_MODE'ları ZORLA kapatır,
 * (4) DB_URL yerel (loopback) değilse süreci BAŞLATMAZ (Atlas'a dokunulmaz), (5) guard'ı kurar.
 * Karar mantığı TEK yerdedir: src/integration/modules/common/security/liveReadonlyPolicy.ts (derlenmiş `dist` kopyası yüklenir;
 * yüklenemezse FAIL-CLOSED: loopback dışı her şey bloklu ve süreç başlamaz).
 * Yalnız GET/HEAD serbest; POST vb. yalnız politikadaki açık okuma allowlist'i (token, N11 SOAP okuma operasyonları, Pazarama liste POST'ları).
 * Redis/Mongo (127.0.0.1) etkilenmez. Test ortamı LIVE_READONLY_GUARD_NO_AUTOINSTALL=1 ile otomatik kurulumu kapatır.
 */
const http = require('http');
const https = require('https');
const path = require('path');
const egress = require('./egress-guard.js');

const POLICY_DIST = path.join(__dirname, '..', 'dist', 'src', 'integration', 'modules', 'common', 'security', 'liveReadonlyPolicy.js');
const GUARD_MARK = Symbol.for('entegrasyonik.liveReadonly.egressGuard');
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '::']);

let saved = null;
let state = null;

function loadPolicy() {
    try { return require(POLICY_DIST); } catch { return null; }
}

function tokenRefreshList() {
    return (process.env.LIVE_READONLY_ALLOW_TOKEN_REFRESH || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function normHost(h) { return String(h || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, ''); }

function blockedError(d, req) {
    const err = new Error(`[live-readonly] İstek ENGELLENDİ (LIVE_READONLY_BLOCKED): ${req.method} ${req.host}${state.redact(req.path)} — ${d.reason}${d.operation ? ` [${d.operation}]` : ''}`);
    err.code = 'LIVE_READONLY_BLOCKED';
    err.reason = d.reason;
    if (d.operation) err.operation = d.operation;
    return err;
}

function logBlocked(d, req) {
    const key = `${req.method} ${req.host} ${state.redact(req.path)} ${d.reason} ${d.operation || ''}`;
    if (state.warned.has(key)) return;
    state.warned.add(key);
    // Değersiz log: host, yöntem, (maskelenmiş) yol, operasyon, neden. Başlık/gövde/sorgu ASLA yazılmaz.
    state.log(`[live-readonly] ENGELLENDİ host=${req.host} method=${req.method} path=${state.redact(req.path)} operation=${d.operation || '-'} reason=${d.reason}`);
}

function decide(req) {
    if (state.policy) return state.policy.evaluateLiveRequest(req, { allowTokenRefresh: state.allowTokenRefresh });
    // Politika yüklenemedi: FAIL-CLOSED (yalnız loopback).
    return LOOPBACK.has(normHost(req.host)) ? { action: 'allow', reason: 'loopback' } : { action: 'block', reason: 'policy-unavailable' };
}

function describeArgs(args, defaultProtocol) {
    let opts = {};
    let i = 0;
    if (typeof args[0] === 'string' || (typeof URL !== 'undefined' && args[0] instanceof URL)) {
        const u = new URL(String(args[0]));
        opts = { protocol: u.protocol, hostname: u.hostname, port: u.port, path: u.pathname + u.search };
        i = 1;
    }
    if (args[i] && typeof args[i] === 'object') opts = { ...opts, ...args[i] };
    let host = opts.hostname || opts.host || 'localhost';
    if (!opts.hostname && /^[^[]*:\d+$/.test(host)) host = host.replace(/:\d+$/, '');
    return {
        protocol: opts.protocol || defaultProtocol,
        host: String(host),
        port: opts.port === undefined || opts.port === null ? undefined : opts.port,
        method: String(opts.method || 'GET').toUpperCase(),
        path: String(opts.path || '/'),
        socketPath: opts.socketPath,
    };
}

function toBuf(chunk, enc) {
    return Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof enc === 'string' ? enc : 'utf8');
}

/** Gövde gerektiren (N11 SOAP) istekler: gövde tamponlanır, `end()`te karar verilir; bloklu ise HİÇBİR bayt ağa yazılmaz. */
function wrapForBody(req, info) {
    const chunks = [];
    const origWrite = req.write.bind(req);
    const origEnd = req.end.bind(req);
    req.write = function guardedWrite(chunk, enc, cb) {
        if (chunk !== undefined && chunk !== null) chunks.push(toBuf(chunk, enc));
        const done = typeof enc === 'function' ? enc : cb;
        if (typeof done === 'function') process.nextTick(done);
        return true;
    };
    req.end = function guardedEnd(chunk, enc, cb) {
        if (typeof chunk === 'function') { cb = chunk; chunk = undefined; enc = undefined; }
        else if (typeof enc === 'function') { cb = enc; enc = undefined; }
        if (chunk !== undefined && chunk !== null) chunks.push(toBuf(chunk, enc));
        const d = decide({ ...info, body: Buffer.concat(chunks).toString('utf8') });
        if (d.action !== 'allow') {
            logBlocked(d, info);
            const err = blockedError(d, info);
            process.nextTick(() => req.destroy(err));
            return req;
        }
        for (const c of chunks) origWrite(c);
        return origEnd(cb);
    };
    return req;
}

function makeRequest(orig, defaultProtocol) {
    return function guardedRequest(...args) {
        const info = describeArgs(args, defaultProtocol);
        if (info.socketPath) { const e = new Error('[live-readonly] socketPath ENGELLENDİ (LIVE_READONLY_BLOCKED)'); e.code = 'LIVE_READONLY_BLOCKED'; throw e; }
        const d = decide(info);
        if (d.action === 'block') { logBlocked(d, info); throw blockedError(d, info); }
        const req = orig.apply(this, args);
        return d.action === 'inspect-body' ? wrapForBody(req, info) : req;
    };
}

function makeGet(guardedRequest) {
    return function guardedGet(...args) {
        const req = guardedRequest.apply(this, args);
        req.end();
        return req;
    };
}

function makeFetch(origFetch) {
    return function guardedFetch(input, init) {
        let info;
        let body;
        try {
            const isReq = typeof Request !== 'undefined' && input instanceof Request;
            const u = new URL(isReq ? input.url : String(input));
            info = { protocol: u.protocol, host: u.hostname, port: u.port || undefined, method: String((init && init.method) || (isReq ? input.method : 'GET')).toUpperCase(), path: u.pathname };
            body = init && init.body;
        } catch {
            return Promise.reject(Object.assign(new Error('[live-readonly] fetch hedefi ayrıştırılamadı (LIVE_READONLY_BLOCKED)'), { code: 'LIVE_READONLY_BLOCKED' }));
        }
        let d = decide(info);
        if (d.action === 'inspect-body') d = typeof body === 'string' ? decide({ ...info, body }) : { action: 'block', reason: 'body-not-inspectable' };
        if (d.action === 'block') { logBlocked(d, info); return Promise.reject(blockedError(d, info)); }
        return origFetch.apply(this, arguments);
    };
}

/**
 * Guard'ı kurar. opts.policy: liveReadonlyPolicy modülü (varsayılan: dist'ten; yoksa fail-closed). opts.allowTokenRefresh: ['ideasoft']. opts.log: günlükleyici.
 */
function install(opts = {}) {
    if (saved) return;
    const policy = opts.policy === undefined ? loadPolicy() : opts.policy;
    state = {
        policy,
        allowTokenRefresh: opts.allowTokenRefresh || tokenRefreshList(),
        warned: new Set(),
        log: opts.log || ((m) => console.warn(m)),
        redact: (p) => (policy && policy.redactPathForLog ? policy.redactPathForLog(p) : String(p).split('?')[0]),
    };
    saved = { httpRequest: http.request, httpGet: http.get, httpsRequest: https.request, httpsGet: https.get, fetch: globalThis.fetch };
    const hReq = makeRequest(saved.httpRequest, 'http:');
    const sReq = makeRequest(saved.httpsRequest, 'https:');
    http.request = hReq; http.get = makeGet(hReq);
    https.request = sReq; https.get = makeGet(sReq);
    if (typeof saved.fetch === 'function') globalThis.fetch = makeFetch(saved.fetch);
    // TCP katmanı: loopback + izinli canlı host'lar (egress-guard'ın kancası); diğer her host bağlantı kurulmadan engellenir.
    egress.setHostPredicate(policy ? (h) => policy.isAllowedLiveHost(h) : null);
    globalThis[GUARD_MARK] = true;
}

function uninstall() {
    if (!saved) return;
    http.request = saved.httpRequest; http.get = saved.httpGet;
    https.request = saved.httpsRequest; https.get = saved.httpsGet;
    if (saved.fetch) globalThis.fetch = saved.fetch;
    egress.setHostPredicate(null);
    delete globalThis[GUARD_MARK];
    saved = null;
    state = null;
}

/** Ön-yükleme: LIVE_READONLY=true, .env, mock kapatma, yerel-DB kapısı. Başarısızlıkta ÇIKIŞ (süreç başlamaz). */
function preflight(policy, env = process.env, exit = (c) => process.exit(c)) {
    // 'true' ŞART: src/config/env.ts `t.bool` yalnız 'true' dizesini açık sayar ('1' -> false -> Katman B hiç devreye girmez; 2026-10-03'te yaşandı).
    env.LIVE_READONLY = 'true';
    if (env === process.env) { try { require('dotenv').config({ quiet: true }); } catch { /* dotenv yok: env zaten ortamda */ } }
    const forced = [];
    for (const k of Object.keys(env)) if (/_MOCK_MODE$/.test(k) && String(env[k]).toLowerCase() === 'true') { env[k] = 'false'; forced.push(k); }
    if (forced.length) console.warn(`[live-readonly] Mock kipleri bu kipte KAPATILDI (env yok sayıldı): ${forced.join(', ')}`);
    if (!policy) { console.error('[live-readonly] Politika modülü (dist) yüklenemedi; önce `npm run build`. Süreç BAŞLATILMADI.'); exit(1); return false; }
    if (!policy.isLocalDbUrl(env.DB_URL)) {
        console.error('[live-readonly] DB_URL yerel (127.0.0.1/localhost) bir MongoDB\'ye işaret etmiyor (veya tanımsız/SRV). Atlas\'a dokunulmaz; süreç BAŞLATILMADI.');
        exit(1); return false;
    }
    return true;
}

module.exports = { install, uninstall, preflight, loadPolicy, GUARD_MARK };

if (!process.env.LIVE_READONLY_GUARD_NO_AUTOINSTALL) {
    const policy = loadPolicy();
    if (preflight(policy)) install({ policy });
}
