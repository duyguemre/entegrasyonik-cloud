/**
 * Mock hosted checkout sayfası + dev tetikleyici (ADR-0008 §1, ADR-0014 S4a).
 * DB mock'lu (DatabaseManager), ödeme sağlayıcısı GERÇEK MockPaymentProvider, webhook GERÇEK `handleBillingWebhook`
 * (imza doğrulama dahil). HTTP katmanı: gerçek Express, yalnızca loopback (127.0.0.1, ephemeral port) -- dış ağ YOK.
 * Kanıtlanan: prod/live/başka sağlayıcıda 404, token imza/ref/süre/tek kullanım, CSRF (cross-site) ret, kart alanı YOK,
 * güvenlik başlıkları, başarılı/reddedildi sonuçlarının webhook'la Subscriptions'a yansıması, dev tetikleyici imzası/replay'i.
 */
import { describe, it, expect, jest, beforeEach, afterEach, afterAll, beforeAll } from '@jest/globals';
import crypto from 'crypto';
import http from 'http';
import express from 'express';

jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn() } }));
jest.mock('@services/billing/EntitlementService', () => ({ EntitlementService: { invalidate: jest.fn() } }));
jest.mock('@services/audit/AuditLogger', () => ({ AuditLogger: { log: jest.fn(async () => undefined) } }));

import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { getPaymentProvider, resetPaymentProviderForTests } from '@services/billing/PaymentProviderFactory';
import { MockPaymentProvider } from '@services/billing/MockPaymentProvider';
import {
    CHECKOUT_TOKEN_TTL_MS, consumeCheckoutToken, isMockCheckoutEnabled, mintCheckoutToken, resetCheckoutTokensForTests,
    signDevRequest, verifyCheckoutToken,
} from '@services/billing/mockCheckoutToken';
import { configureMockCheckoutRoutes, escapeHtml } from '@api/webhooks/MockCheckoutApiManager';

let subscriptionUpdateOne: jest.Mock<(...a: any[]) => Promise<any>>;
const events = new Set<string>();
let subscriptionDoc: any;

function mockDb() {
    subscriptionUpdateOne = jest.fn(async (..._a: any[]) => ({}));
    (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue({
        getBillingEventModel: () => ({
            findOne: (f: any) => ({ lean: async () => (events.has(f.providerEventId) ? { _id: 'x' } : null) }),
            create: async (d: any) => { events.add(d.providerEventId); return d; },
        }),
        getSubscriptionModel: () => ({
            findOne: () => ({ lean: async () => subscriptionDoc }),
            updateOne: subscriptionUpdateOne,
        }),
    });
}

let server: http.Server;
let base: string;

async function listen(app: express.Express): Promise<{ srv: http.Server; url: string }> {
    let srv!: http.Server;
    await new Promise<void>(r => { srv = app.listen(0, '127.0.0.1', () => r()); });
    return { srv, url: `http://127.0.0.1:${(srv.address() as any).port}` };
}

beforeAll(async () => {
    process.env.MOCK_CHECKOUT_RATE_LIMIT_MAX = '100000'; // testler ardışık çok istek atar; sınır ayrıca aşağıda kanıtlanır
    const app = express();
    configureMockCheckoutRoutes(app);
    // authenticate'in yerini tutan yakalayıcı: kapalıyken 404'ün 401'den DEĞİL bizim kapımızdan geldiğini kanıtlar
    app.use((_req, res) => res.status(401).end());
    await new Promise<void>(r => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => { await new Promise<void>(r => server.close(() => r())); });

const ENV_KEYS = ['NODE_ENV', 'PAYMENT_PROVIDER', 'PAYMENT_ENV', 'MOCK_CHECKOUT_RETURN_URL'] as const;
const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    resetPaymentProviderForTests();
    resetCheckoutTokensForTests();
    events.clear();
    subscriptionDoc = null;
    mockDb();
});
afterEach(() => {
    for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
    jest.restoreAllMocks();
});

async function startCheckout(clientId = 5, plan = 'growth') {
    const provider = getPaymentProvider() as MockPaymentProvider;
    const co = await provider.createCheckout(clientId, plan, 'month');
    subscriptionDoc = { clientId, provider: 'mock', providerSubscriptionRef: co.providerRef };
    const url = new URL(co.checkoutUrl as string);
    return { provider, ref: co.providerRef, url, token: url.searchParams.get('t') as string, checkoutUrl: co.checkoutUrl as string };
}

async function get(path: string, headers: Record<string, string> = {}) {
    const r = await fetch(base + path, { headers });
    return { status: r.status, text: await r.text(), headers: r.headers };
}
async function postForm(path: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
    const r = await fetch(base + path, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(fields).toString(),
    });
    return { status: r.status, text: await r.text(), headers: r.headers };
}
async function postDev(payload: any, sig?: string) {
    const raw = JSON.stringify(payload);
    const r = await fetch(base + '/api/billing/mock/simulate', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-mock-dev-signature': sig ?? signDevRequest(raw) }, body: raw,
    });
    return { status: r.status, json: await r.json().catch(() => null) as any };
}
const devPayload = (providerRef: string, scenario: string, extra: any = {}) => ({ providerRef, scenario, nonce: crypto.randomBytes(8).toString('hex'), iat: Date.now(), ...extra });

describe('etkinlik kapısı (yalnızca mock + dev/local; prod/live/başka sağlayıcıda 404)', () => {
    it('NODE_ENV=test (dev/local benzeri): açık', () => {
        expect(isMockCheckoutEnabled()).toBe(true);
    });

    it.each([
        ['NODE_ENV=production', { NODE_ENV: 'production' }],
        ['PAYMENT_ENV=live', { PAYMENT_ENV: 'live' }],
        ['PAYMENT_PROVIDER=iyzico', { PAYMENT_PROVIDER: 'iyzico' }],
    ] as Array<[string, Record<string, string>]>)('%s -> kapalı: GET/POST/dev tetikleyici HEPSİ 404 (authenticate 401\'i değil)', async (_l, env) => {
        const { ref, token } = await startCheckout(); // token, kapı AÇIKKEN üretilir (saldırgan elinde geçerli token olsa bile)
        Object.assign(process.env, env);
        expect((await get(`/api/billing/mock-checkout/${ref}?t=${token}`)).status).toBe(404);
        expect((await postForm(`/api/billing/mock-checkout/${ref}`, { t: token, scenario: 'success' })).status).toBe(404);
        expect((await postDev(devPayload(ref, 'success'))).status).toBe(404);
        expect(subscriptionUpdateOne).not.toHaveBeenCalled();
    });

    it('kapalıyken createCheckout eski yer tutucu URL döner (token/sır üretmez); açıkken backend\'in kendi sayfasına işaret eder', async () => {
        const provider = new MockPaymentProvider();
        const open = await provider.createCheckout(1, 'starter', 'month');
        expect(open.checkoutUrl).toMatch(/^http:\/\/localhost:\d+\/api\/billing\/mock-checkout\/mock_sub_1_[0-9a-f]+\?t=/);
        process.env.NODE_ENV = 'production';
        const closed = await provider.createCheckout(1, 'starter', 'month');
        expect(closed.checkoutUrl).toMatch(/^https:\/\/mock-payments\.entegrasyonik\.local\/checkout\/mock_sub_1_/);
        expect(closed.checkoutUrl).not.toContain('?t=');
    });
});

describe('GET sayfa: hosted checkout HTML', () => {
    it('200 HTML; GERÇEK KART ALANI YOK (yalnızca gizli token + 3 sonuç butonu); test bandı; güvenlik başlıkları', async () => {
        const { url, ref } = await startCheckout();
        const r = await get(url.pathname + url.search);
        expect(r.status).toBe(200);
        expect(r.headers.get('content-type')).toContain('text/html');
        expect(r.text).toContain('TEST ORTAMI (MOCK)');
        expect(r.text).toContain(`action="/api/billing/mock-checkout/${ref}"`);
        const inputs = [...r.text.matchAll(/<input[^>]*>/g)].map(m => m[0]);
        expect(inputs).toHaveLength(1);
        expect(inputs[0]).toContain('type="hidden"');
        expect(r.text).not.toMatch(/type="(text|tel|number|password|email)"|autocomplete|cc-number|cardnumber|cvv|cvc/i);
        expect([...r.text.matchAll(/name="scenario" value="([^"]+)"/g)].map(m => m[1])).toEqual(['success', 'declined', '3ds_failed']);
        expect(r.text).not.toMatch(/<script/i);
        const csp = r.headers.get('content-security-policy') as string;
        expect(csp).toContain("default-src 'none'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("form-action 'self'");
        expect(r.headers.get('cache-control')).toBe('no-store');
        expect(r.headers.get('referrer-policy')).toBe('no-referrer');
        expect(r.headers.get('x-frame-options')).toBe('DENY');
        expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it('GET token TÜKETMEZ: sayfa yeniden yüklenebilir', async () => {
        const { url } = await startCheckout();
        expect((await get(url.pathname + url.search)).status).toBe(200);
        expect((await get(url.pathname + url.search)).status).toBe(200);
    });

    it('token yok / bozuk / imzası değiştirilmiş / başka oturumun ref\'ine bağlı -> 403 ve sayfa içeriği yok', async () => {
        const a = await startCheckout(5);
        const b = await startCheckout(6);
        const path = `/api/billing/mock-checkout/${a.ref}`;
        expect((await get(path)).status).toBe(403);
        expect((await get(`${path}?t=abc`)).status).toBe(403);
        expect((await get(`${path}?t=${a.token.slice(0, -2)}00`)).status).toBe(403);
        const cross = await get(`${path}?t=${b.token}`); // b'nin token'ı a'nın oturumunda
        expect(cross.status).toBe(403);
        expect(cross.text).not.toContain('name="scenario"');
    });

    it('süresi dolmuş token -> 410', async () => {
        const { provider, ref } = await startCheckout();
        void provider;
        const old = mintCheckoutToken(ref, Date.now() - CHECKOUT_TOKEN_TTL_MS - 1000);
        const r = await get(`/api/billing/mock-checkout/${ref}?t=${old}`);
        expect(r.status).toBe(410);
    });

    it('bilinmeyen/yeniden başlatılmış oturum (sağlayıcıda kayıt yok) -> 404 anlaşılır sayfa; biçim dışı ref -> 404', async () => {
        const ref = 'mock_sub_9_deadbeef';
        const t = mintCheckoutToken(ref);
        const r = await get(`/api/billing/mock-checkout/${ref}?t=${t}`);
        expect(r.status).toBe(404);
        expect(r.text).toContain('Ödeme oturumu bulunamadı');
        expect((await get(`/api/billing/mock-checkout/${encodeURIComponent('a<b>')}?t=${t}`)).status).toBe(404);
    });

    it('ENJEKSİYON: token/ref HTML\'e kaçışsız basılmaz', async () => {
        expect(escapeHtml(`"><img src=x onerror=1>&'`)).toBe('&quot;&gt;&lt;img src=x onerror=1&gt;&amp;&#39;');
    });
});

describe('POST: sonuç -> GERÇEK webhook yolu -> Subscriptions', () => {
    it('başarılı: 200 "Ödeme başarılı (test)"; Subscriptions kanonik "active" ile güncellenir; BillingEvent yazıldı', async () => {
        const { ref, token } = await startCheckout();
        const r = await postForm(`/api/billing/mock-checkout/${ref}`, { t: token, scenario: 'success' });
        expect(r.status).toBe(200);
        expect(r.text).toContain('Ödeme başarılı (test)');
        expect(subscriptionUpdateOne).toHaveBeenCalledWith({ clientId: 5 }, { $set: expect.objectContaining({ status: 'active', cardLast4: '4242' }) });
        expect(events.size).toBe(1);
    });

    it('reddedildi ve 3DS başarısız: abonelik "trialing" kalır (aktif OLMAZ); sayfa YENİ token\'lı "Tekrar dene" bağlantısı üretir ve o token çalışır', async () => {
        for (const scenario of ['declined', '3ds_failed']) {
            resetPaymentProviderForTests();
            const { ref, token } = await startCheckout();
            subscriptionUpdateOne.mockClear();
            const r = await postForm(`/api/billing/mock-checkout/${ref}`, { t: token, scenario });
            expect(r.status).toBe(200);
            expect(r.text).toMatch(/reddedildi|3D Secure/);
            expect(subscriptionUpdateOne).toHaveBeenCalledWith({ clientId: 5 }, { $set: expect.objectContaining({ status: 'trialing' }) });
            const retry = r.text.match(/href="([^"]*mock-checkout[^"]*)"/);
            expect(retry).not.toBeNull();
            const retryUrl = (retry as RegExpMatchArray)[1].replace(/&amp;/g, '&');
            expect(new URL(retryUrl, base).searchParams.get('t')).not.toBe(token);
            expect((await get(retryUrl)).status).toBe(200);
        }
    });

    it('REPLAY: aynı token ikinci kez kullanılamaz (410) ve ikinci webhook olayı üretilmez', async () => {
        const { ref, token } = await startCheckout();
        expect((await postForm(`/api/billing/mock-checkout/${ref}`, { t: token, scenario: 'success' })).status).toBe(200);
        subscriptionUpdateOne.mockClear();
        const again = await postForm(`/api/billing/mock-checkout/${ref}`, { t: token, scenario: 'success' });
        expect(again.status).toBe(410);
        expect(subscriptionUpdateOne).not.toHaveBeenCalled();
        expect(events.size).toBe(1);
    });

    it('CSRF: token yok/başka oturumun token\'ı -> 403 ve HİÇBİR etki yok; Sec-Fetch-Site=cross-site -> 403 (token geçerli olsa bile, token TÜKETİLMEZ)', async () => {
        const a = await startCheckout(5);
        const b = await startCheckout(6);
        const path = `/api/billing/mock-checkout/${a.ref}`;
        expect((await postForm(path, { scenario: 'success' })).status).toBe(403);
        expect((await postForm(path, { t: b.token, scenario: 'success' })).status).toBe(403);
        expect((await postForm(path, { t: a.token, scenario: 'success' }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
        expect(subscriptionUpdateOne).not.toHaveBeenCalled();
        // cross-site denemesi token'ı yakmadı: aynı token same-origin ile hâlâ çalışır
        expect((await postForm(path, { t: a.token, scenario: 'success' }, { 'sec-fetch-site': 'same-origin' })).status).toBe(200);
    });

    it('bilinmeyen senaryo değeri (prototype anahtarı dahil) -> 400; token TÜKETİLMEZ', async () => {
        const { ref, token } = await startCheckout();
        const path = `/api/billing/mock-checkout/${ref}`;
        expect((await postForm(path, { t: token, scenario: 'card_renewal_fails' })).status).toBe(400); // yalnızca 3 form senaryosu (yenileme/kurtarma dev tetikleyicide)
        expect((await postForm(path, { t: token, scenario: '__proto__' })).status).toBe(400);
        expect((await postForm(path, { t: token, scenario: 'toString' })).status).toBe(400);
        expect((await postForm(path, { t: token, scenario: 'success' })).status).toBe(200);
    });

    it('webhook işlenemezse (Subscriptions kaydı yok -> outcome failed) kullanıcıya 502 hata sayfası, başarı GÖSTERİLMEZ', async () => {
        const { ref, token } = await startCheckout();
        subscriptionDoc = null;
        const r = await postForm(`/api/billing/mock-checkout/${ref}`, { t: token, scenario: 'success' });
        expect(r.status).toBe(502);
        expect(r.text).not.toContain('Ödeme başarılı');
    });

    it('MOCK_CHECKOUT_RETURN_URL yalnızca http(s) ise bağlantı olur (javascript: reddedilir)', async () => {
        process.env.MOCK_CHECKOUT_RETURN_URL = 'javascript:alert(1)';
        const a = await startCheckout();
        const bad = await postForm(`/api/billing/mock-checkout/${a.ref}`, { t: a.token, scenario: 'success' });
        expect(bad.text).not.toContain('javascript:');
        resetPaymentProviderForTests();
        process.env.MOCK_CHECKOUT_RETURN_URL = 'http://localhost:3000/subscription';
        const b = await startCheckout();
        const ok = await postForm(`/api/billing/mock-checkout/${b.ref}`, { t: b.token, scenario: 'success' });
        expect(ok.text).toContain('href="http://localhost:3000/subscription"');
    });
});

describe('dev tetikleyici (POST /api/billing/mock/simulate): imzalı çağrı -> gerçek webhook yolu', () => {
    it('imzalı senaryo: başarı -> active; yenileme başarısız -> past_due; kurtarma -> active (ADR §1 dunning senaryoları)', async () => {
        const { ref } = await startCheckout();
        const seen: string[] = [];
        for (const scenario of ['success', 'renewal_fails', 'recovery']) {
            subscriptionUpdateOne.mockClear();
            const r = await postDev(devPayload(ref, scenario));
            expect(r.status).toBe(200);
            expect(r.json.webhook).toEqual({ statusCode: 200, outcome: 'processed' });
            seen.push((subscriptionUpdateOne.mock.calls[0][1] as any).$set.status);
        }
        expect(seen).toEqual(['active', 'past_due', 'active']);
    });

    it('dev-tools/mock-simulate.js istemcisinin imzası sunucuyla UYUMLU; yalnızca loopback hedeflenir', async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const cli = require('../../../dev-tools/mock-simulate.js');
        const { ref } = await startCheckout();
        const { raw, signature } = cli.buildRequest(process.env.BILLING_MOCK_HMAC_SECRET, ref, 'success');
        expect(signature).toBe(signDevRequest(raw));
        const r = await fetch(base + '/api/billing/mock/simulate', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mock-dev-signature': signature }, body: raw });
        expect(r.status).toBe(200);
        expect(() => cli.assertLoopback('http://localhost:5001')).not.toThrow();
        expect(() => cli.assertLoopback('https://app.entegrasyonik.com')).toThrow(/loopback/);
    });

    it('imza yok/yanlış/webhook imzası (alan ayrımı) -> 401, etki yok', async () => {
        const { ref } = await startCheckout();
        const p = devPayload(ref, 'success');
        expect((await postDev(p, '0'.repeat(64))).status).toBe(401);
        const webhookStyleSig = crypto.createHmac('sha256', process.env.BILLING_MOCK_HMAC_SECRET as string).update(JSON.stringify(p)).digest('hex');
        expect((await postDev(p, webhookStyleSig)).status).toBe(401);
        expect(subscriptionUpdateOne).not.toHaveBeenCalled();
    });

    it('REPLAY (aynı nonce) 401, bayat iat 401, biçim hatası 400, bilinmeyen senaryo 400, bilinmeyen ref 404', async () => {
        const { ref } = await startCheckout();
        const p = devPayload(ref, 'success');
        expect((await postDev(p)).status).toBe(200);
        expect((await postDev(p)).status).toBe(401);
        expect((await postDev(devPayload(ref, 'success', { iat: Date.now() - 10 * 60 * 1000 }))).status).toBe(401);
        expect((await postDev({ providerRef: ref })).status).toBe(400);
        expect((await postDev(devPayload(ref, 'nope'))).status).toBe(400);
        expect((await postDev(devPayload(ref, '__proto__'))).status).toBe(400);
        expect((await postDev(devPayload('mock_sub_1_unknown', 'success'))).status).toBe(404);
    });
});

describe('rate limit', () => {
    it('sınır aşılınca 429 (env ile ayarlanabilir; webhook kovasından ayrı)', async () => {
        const prev = process.env.MOCK_CHECKOUT_RATE_LIMIT_MAX;
        process.env.MOCK_CHECKOUT_RATE_LIMIT_MAX = '2';
        const app = express();
        configureMockCheckoutRoutes(app);
        process.env.MOCK_CHECKOUT_RATE_LIMIT_MAX = prev;
        const { srv, url } = await listen(app);
        try {
            const codes: number[] = [];
            for (let i = 0; i < 4; i++) codes.push((await fetch(`${url}/api/billing/mock-checkout/mock_sub_1_x?t=bad`)).status);
            expect(codes).toEqual([403, 403, 429, 429]);
        } finally { await new Promise<void>(r => srv.close(() => r())); }
    });
});

describe('mockCheckoutToken (birim)', () => {
    it('mint -> verify ok; consume tek kullanım; ref bağı; TTL sınırı', () => {
        const t = mintCheckoutToken('ref_a', 1_000);
        expect(verifyCheckoutToken(t, 'ref_a', 2_000).ok).toBe(true);
        expect(verifyCheckoutToken(t, 'ref_b', 2_000)).toEqual({ ok: false, reason: 'ref_mismatch' });
        expect(verifyCheckoutToken(t, 'ref_a', 1_000 + CHECKOUT_TOKEN_TTL_MS + 1)).toEqual({ ok: false, reason: 'expired' });
        expect(consumeCheckoutToken(t, 'ref_a', 2_000).ok).toBe(true);
        expect(consumeCheckoutToken(t, 'ref_a', 2_000)).toEqual({ ok: false, reason: 'replayed' });
        expect(verifyCheckoutToken(t, 'ref_a', 2_000)).toEqual({ ok: false, reason: 'replayed' });
    });

    it('imza/gövde kurcalama ve tip hataları reddedilir; webhook gövde imzası token olarak GEÇERSİZ (alan ayrımı)', () => {
        const t = mintCheckoutToken('ref_a');
        const [p, s] = t.split('.');
        const forged = Buffer.from(JSON.stringify({ ref: 'ref_a', exp: Date.now() + 1e9, n: 'x' })).toString('base64url');
        expect(verifyCheckoutToken(`${forged}.${s}`, 'ref_a')).toEqual({ ok: false, reason: 'bad_signature' });
        expect(verifyCheckoutToken(`${p}.${'0'.repeat(s.length)}`, 'ref_a')).toEqual({ ok: false, reason: 'bad_signature' });
        for (const bad of [undefined, null, 5, {}, '', 'a', 'a.b.c', 'x'.repeat(2000)]) expect(verifyCheckoutToken(bad, 'ref_a').ok).toBe(false);
        const webhookSig = crypto.createHmac('sha256', process.env.BILLING_MOCK_HMAC_SECRET as string).update(p).digest('hex');
        expect(verifyCheckoutToken(`${p}.${webhookSig}`, 'ref_a')).toEqual({ ok: false, reason: 'bad_signature' });
    });

    it('token içinde sır/ham anahtar YOK (yalnızca ref, exp, nonce)', () => {
        const t = mintCheckoutToken('ref_a');
        const payload = JSON.parse(Buffer.from(t.split('.')[0], 'base64url').toString('utf8'));
        expect(Object.keys(payload).sort()).toEqual(['exp', 'n', 'ref']);
        expect(t).not.toContain(process.env.BILLING_MOCK_HMAC_SECRET as string);
    });
});
