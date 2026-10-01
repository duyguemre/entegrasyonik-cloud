import express, { Express, Request, Response } from 'express';
import { getPaymentProvider } from '@services/billing/PaymentProviderFactory';
import { MOCK_TEST_CARDS, MockPaymentProvider } from '@services/billing/MockPaymentProvider';
import type { PaymentProvider, WebhookHeaders } from '@services/billing/PaymentProvider';
import { PaymentProviderError } from '@services/billing/PaymentProvider';
import {
    consumeCheckoutToken, isMockCheckoutEnabled, mintCheckoutToken, verifyAndConsumeDevRequest, verifyCheckoutToken,
} from '@services/billing/mockCheckoutToken';
import { createRateLimiter } from '@platform/rateLimit/rateLimit';
import { handleBillingWebhook, IBillingWebhookResult } from './BillingWebhookApiManager';

// ADR-0008 §1 (MockPaymentProvider "hosted checkout" sayfası + dev tetikleyicisi) + ADR-0014 S4a.
//
// ROTALAR (context "/api" içinde, `authenticate` middleware'inden ÖNCE kayıtlı -- BillingWebhookApiManager ile aynı
// mekanizma; kimlik doğrulaması JWT'ye değil İMZALI TEK KULLANIMLIK token'a dayanır):
//   GET  /api/billing/mock-checkout/:providerRef?t=<token>   sahte hosted checkout sayfası (HTML)
//   POST /api/billing/mock-checkout/:providerRef             form: t, scenario=success|declined|3ds_failed -> sonuç sayfası
//   POST /api/billing/mock/simulate                          dev tetikleyici (imzalı JSON; TÜM senaryolar: yenileme hatası/kurtarma dahil)
//
// GÜVENLİK (hepsi test edilir -- tests/unit/billing/MockCheckoutApiManager.test.ts):
//  - ETKİNLİK KAPISI: yalnızca PAYMENT_PROVIDER=mock VE PAYMENT_ENV!=live VE NODE_ENV!=='production' (isMockCheckoutEnabled).
//    Kapalıyken TÜM rotalar 404 -- kapı her istekte değerlendirilir (rota kaydı env'e bağlı DEĞİL; yoksa authenticate 401 dönerdi).
//  - CSRF/replay: GET/POST token'ı `providerRef`'e bağlı, HMAC imzalı, süreli (15 dk); POST'ta TEK KULLANIMLIK (nonce tüketilir).
//    Token yalnızca `startCheckout`'u çağıran oturum açmış YÖNETİCİYE dönen checkoutUrl'de bulunur. `Sec-Fetch-Site: cross-site`
//    (tarayıcılar gönderir) açıkça reddedilir. Reddedilen ödeme denemesinde sayfa YENİ token'lı "tekrar dene" bağlantısı üretir.
//  - Sayfada GERÇEK KART ALANI YOK (input yalnızca gizli token + gönder butonları); kart verisi bu sunucudan hiç geçmez.
//  - Sonuç, GERÇEK webhook yolundan (handleBillingWebhook: imza doğrulama -> idempotency -> getSubscription ile kanonik durum
//    -> Subscriptions güncelleme -> EntitlementService.invalidate) BİREBİR aynı kodla işlenir (ADR §1 "aynı imza doğrulama kodundan").
//  - Yanıt başlıkları: katı CSP (script YOK, form-action 'self', frame-ancestors 'none'), no-store, no-referrer, nosniff.
//    Değişken içerik HTML-kaçışlıdır; token/imza loglanmaz.
//  - Rate limit: süreç-içi (createRateLimiter), webhook kovasından AYRI.

export const SCENARIO_FORM_VALUES: Record<string, string> = {
    success: MOCK_TEST_CARDS.SUCCESS,
    declined: MOCK_TEST_CARDS.DECLINED,
    '3ds_failed': MOCK_TEST_CARDS.THREE_DS_FAILED,
};
/** Dev tetikleyici: ADR §1'deki TÜM deterministik senaryolar (kart kodu veya kısa ad). */
const DEV_SCENARIOS: Record<string, string> = {
    ...SCENARIO_FORM_VALUES,
    renewal_fails: MOCK_TEST_CARDS.RENEWAL_FAILS,
    recovery: MOCK_TEST_CARDS.RECOVERY,
    [MOCK_TEST_CARDS.SUCCESS]: MOCK_TEST_CARDS.SUCCESS,
    [MOCK_TEST_CARDS.DECLINED]: MOCK_TEST_CARDS.DECLINED,
    [MOCK_TEST_CARDS.THREE_DS_FAILED]: MOCK_TEST_CARDS.THREE_DS_FAILED,
    [MOCK_TEST_CARDS.RENEWAL_FAILS]: MOCK_TEST_CARDS.RENEWAL_FAILS,
    [MOCK_TEST_CARDS.RECOVERY]: MOCK_TEST_CARDS.RECOVERY,
};

export interface MockCheckoutDeps {
    getProvider: () => PaymentProvider;
    dispatchWebhook: (provider: string, rawBody: Buffer, headers: WebhookHeaders) => Promise<IBillingWebhookResult>;
    now: () => number;
}

const defaultDeps: MockCheckoutDeps = {
    getProvider: () => getPaymentProvider(),
    dispatchWebhook: (p, b, h) => handleBillingWebhook(p, b, h),
    now: () => Date.now(),
};

export interface HttpResult {
    status: number;
    contentType: 'text/html; charset=utf-8' | 'application/json; charset=utf-8';
    body: string;
}

const PROVIDER_REF_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function escapeHtml(v: unknown): string {
    return String(v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}

const STYLE = `
:root{color-scheme:light}
body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6fa;color:#1a2233}
main{max-width:480px;margin:48px auto;padding:0 16px}
.card{background:#fff;border:1px solid #d8deea;border-radius:12px;padding:28px;box-shadow:0 2px 8px rgba(20,30,60,.06)}
.banner{background:#fff4d6;border:1px solid #f0c36d;color:#6b4a00;border-radius:8px;padding:10px 12px;font-size:14px;margin-bottom:20px}
h1{font-size:20px;margin:0 0 8px}p{line-height:1.5;margin:8px 0}.muted{color:#5b6579;font-size:14px}
.btn{display:block;width:100%;box-sizing:border-box;margin-top:12px;padding:12px 16px;border-radius:8px;border:1px solid #1a2233;background:#fff;color:#1a2233;font-size:16px;cursor:pointer;text-align:center;text-decoration:none}
.btn:focus-visible{outline:3px solid #2b6cb0;outline-offset:2px}
.btn.primary{background:#1a2233;color:#fff}
.ok{color:#0b6b3a}.err{color:#a11d1d}
`;

function page(title: string, inner: string): string {
    return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body><main><div class="card">
<div class="banner" role="note"><strong>TEST ORTAMI (MOCK).</strong> Bu sayfada kart alanı yoktur; gerçek kart bilgisi girmeyin. Ödeme gerçekten alınmaz.</div>
${inner}
</div></main></body></html>`;
}

function html(status: number, title: string, inner: string): HttpResult {
    return { status, contentType: 'text/html; charset=utf-8', body: page(title, inner) };
}

function errorPage(status: number, heading: string, text: string): HttpResult {
    return html(status, heading, `<h1 class="err">${escapeHtml(heading)}</h1><p>${escapeHtml(text)}</p>`);
}

const NOT_FOUND: HttpResult = { status: 404, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>404</title><h1>404</h1>' };

function tokenFailure(reason: string): HttpResult {
    // Ayrıntılı neden sızdırılmaz (yalnızca 'süresi doldu/kullanıldı' ile 'geçersiz' ayrımı kullanıcıya yardımcı olur).
    if (reason === 'expired' || reason === 'replayed') {
        return errorPage(410, 'Ödeme oturumu geçersiz', 'Bu ödeme oturumunun süresi doldu veya daha önce kullanıldı. Uygulamadan ödemeyi yeniden başlatın.');
    }
    return errorPage(403, 'Ödeme oturumu geçersiz', 'Bu ödeme bağlantısı doğrulanamadı. Uygulamadan ödemeyi yeniden başlatın.');
}

/** MockPaymentProvider'ın simülatörünü taşıyan sağlayıcı (yalnızca mock). */
function asMock(p: PaymentProvider): MockPaymentProvider | undefined {
    return p && p.name === 'mock' && typeof (p as any).simulateEvent === 'function' ? (p as MockPaymentProvider) : undefined;
}

function returnLinkHtml(): string {
    // Yalnızca env'de AÇIKÇA verilen http(s) adrese bağlantı (open-redirect yok; kullanıcı girdisi kullanılmaz).
    const url = process.env.MOCK_CHECKOUT_RETURN_URL;
    if (url && /^https?:\/\/[^\s"'<>]+$/i.test(url)) {
        return `<a class="btn" href="${escapeHtml(url)}">Uygulamaya dön</a>`;
    }
    return '<p class="muted">Bu sekmeyi kapatıp uygulamaya dönebilirsiniz.</p>';
}

/** GET: sahte hosted checkout sayfası. Token'ı TÜKETMEZ (yalnızca doğrular). */
export async function handleCheckoutPage(providerRef: string, token: unknown, deps: MockCheckoutDeps = defaultDeps): Promise<HttpResult> {
    if (!isMockCheckoutEnabled()) return NOT_FOUND;
    if (!PROVIDER_REF_RE.test(providerRef)) return NOT_FOUND;
    const v = verifyCheckoutToken(token, providerRef, deps.now());
    if (!v.ok) return tokenFailure(v.reason);

    const mock = asMock(deps.getProvider());
    if (!mock) return NOT_FOUND;
    let planCode: string;
    try {
        planCode = (await mock.getSubscription(providerRef)).planCode;
    } catch (e: any) {
        if (e instanceof PaymentProviderError && e.code === 'not_found') {
            return errorPage(404, 'Ödeme oturumu bulunamadı', 'Bu ödeme oturumu artık mevcut değil (sunucu yeniden başlatılmış olabilir). Uygulamadan ödemeyi yeniden başlatın.');
        }
        throw e;
    }
    return html(200, 'Test ödeme sayfası', `
<h1>Ödeme (test)</h1>
<p class="muted">Plan: <strong>${escapeHtml(planCode)}</strong></p>
<p>Bir test sonucu seçin. Sonuç, gerçek ödeme sağlayıcısında olduğu gibi imzalı bir webhook olayıyla uygulamaya bildirilir.</p>
<form method="post" action="${escapeHtml('/api/billing/mock-checkout/' + encodeURIComponent(providerRef))}">
<input type="hidden" name="t" value="${escapeHtml(token as string)}">
<button class="btn primary" type="submit" name="scenario" value="success">Ödemeyi başarılı say (test kartı: başarılı)</button>
<button class="btn" type="submit" name="scenario" value="declined">Kart reddedildi (test kartı: reddedildi)</button>
<button class="btn" type="submit" name="scenario" value="3ds_failed">3D Secure başarısız (test kartı: 3DS hatası)</button>
</form>`);
}

/** POST: token TÜKETİLİR (tek kullanım) -> simülasyon -> GERÇEK webhook yolu -> sonuç sayfası. */
export async function handleCheckoutSubmit(providerRef: string, token: unknown, scenarioKey: unknown, deps: MockCheckoutDeps = defaultDeps): Promise<HttpResult> {
    if (!isMockCheckoutEnabled()) return NOT_FOUND;
    if (!PROVIDER_REF_RE.test(providerRef)) return NOT_FOUND;
    if (typeof scenarioKey !== 'string' || !Object.prototype.hasOwnProperty.call(SCENARIO_FORM_VALUES, scenarioKey)) {
        return errorPage(400, 'Geçersiz istek', 'Bilinmeyen test senaryosu.');
    }
    const mock = asMock(deps.getProvider());
    if (!mock) return NOT_FOUND;

    // Doğrula + nonce'u tüket (aynı token ikinci kez kullanılamaz). Tüketim, YALNIZCA imza+ref+süre doğrulaması geçen istekte
    // gerçekleşir (geçersiz/başkasına ait token nonce yakmaz); senaryo/sağlayıcı kontrolleri bundan ÖNCE yapıldığı için
    // hatalı form değeri meşru token'ı harcamaz.
    const c = consumeCheckoutToken(token, providerRef, deps.now());
    if (!c.ok) return tokenFailure(c.reason);

    try {
        await mock.getSubscription(providerRef);
    } catch (e: any) {
        if (e instanceof PaymentProviderError && e.code === 'not_found') {
            return errorPage(404, 'Ödeme oturumu bulunamadı', 'Bu ödeme oturumu artık mevcut değil (sunucu yeniden başlatılmış olabilir). Uygulamadan ödemeyi yeniden başlatın.');
        }
        throw e;
    }

    const scenario = SCENARIO_FORM_VALUES[scenarioKey] as (typeof MOCK_TEST_CARDS)[keyof typeof MOCK_TEST_CARDS];
    const { rawBody, headers } = mock.simulateEvent(scenario, providerRef);
    const result = await deps.dispatchWebhook('mock', rawBody, headers);
    if (result.statusCode !== 200 || (result.outcome !== 'processed' && result.outcome !== 'ignored')) {
        return errorPage(502, 'Sonuç işlenemedi', 'Ödeme sonucu uygulamaya iletilemedi (webhook işlenemedi). Lütfen tekrar deneyin veya uygulamadan ödemeyi yeniden başlatın.');
    }

    if (scenario === MOCK_TEST_CARDS.SUCCESS) {
        return html(200, 'Ödeme başarılı (test)', `<h1 class="ok">Ödeme başarılı (test)</h1>
<p>Aboneliğiniz etkinleştirildi. Durum, webhook ile uygulamaya iletildi.</p>${returnLinkHtml()}`);
    }
    // Reddedildi / 3DS başarısız: gerçek hosted formlardaki gibi yeniden denemeye izin verilir -> YENİ tek kullanımlık token.
    const retryToken = mintCheckoutToken(providerRef, deps.now());
    const label = scenario === MOCK_TEST_CARDS.THREE_DS_FAILED ? '3D Secure doğrulaması başarısız (test)' : 'Ödeme reddedildi (test)';
    const retryHref = `/api/billing/mock-checkout/${encodeURIComponent(providerRef)}?t=${retryToken}`;
    return html(200, label, `<h1 class="err">${escapeHtml(label)}</h1>
<p>Aboneliğiniz değişmedi; deneme süreniz kartsız devam eder.</p>
<a class="btn primary" href="${escapeHtml(retryHref)}">Tekrar dene</a>${returnLinkHtml()}`);
}

/** Dev tetikleyici (JSON, imzalı): tüm senaryolar; gerçek webhook yolundan geçer. */
export async function handleDevSimulate(rawBody: Buffer, signature: unknown, deps: MockCheckoutDeps = defaultDeps): Promise<HttpResult> {
    if (!isMockCheckoutEnabled()) return NOT_FOUND;
    const json = (status: number, obj: unknown): HttpResult => ({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(obj) });

    const r = verifyAndConsumeDevRequest(rawBody, signature, deps.now());
    if (!r.ok) return json(r.reason === 'malformed' ? 400 : 401, { error: 'invalid_request' });
    if (!PROVIDER_REF_RE.test(r.providerRef) || !Object.prototype.hasOwnProperty.call(DEV_SCENARIOS, r.scenario)) {
        return json(400, { error: 'invalid_request' });
    }
    const mock = asMock(deps.getProvider());
    if (!mock) return NOT_FOUND;
    try {
        await mock.getSubscription(r.providerRef);
    } catch (e: any) {
        if (e instanceof PaymentProviderError && e.code === 'not_found') return json(404, { error: 'unknown_provider_ref' });
        throw e;
    }
    const scenario = DEV_SCENARIOS[r.scenario] as (typeof MOCK_TEST_CARDS)[keyof typeof MOCK_TEST_CARDS];
    const { rawBody: body, headers, eventId } = mock.simulateEvent(scenario, r.providerRef);
    const result = await deps.dispatchWebhook('mock', body, headers);
    return json(result.statusCode === 200 ? 200 : 502, { eventId, webhook: { statusCode: result.statusCode, outcome: result.outcome } });
}

function send(res: Response, r: HttpResult) {
    res.status(r.status);
    res.setHeader('Content-Type', r.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    res.end(r.body);
}

function crossSite(req: Request): boolean {
    return String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site';
}

/** `Webserver.configure()` içinde, billing webhook rotasıyla AYNI yerde ve `authenticate` middleware'inden ÖNCE çağrılır. */
export function configureMockCheckoutRoutes(app: Express) {
    const envInt = (name: string, fallback: number) => { const n = Number(process.env[name]); return Number.isInteger(n) && n > 0 ? n : fallback; };
    const mockCheckoutRateLimiter = createRateLimiter({
        max: envInt('MOCK_CHECKOUT_RATE_LIMIT_MAX', 30),
        windowMs: envInt('MOCK_CHECKOUT_RATE_LIMIT_WINDOW_MS', 60_000),
    });
    const base = '/api/billing/mock-checkout/:providerRef';

    // Kapı: kapalıysa rate limit/gövde ayrıştırma bile çalışmadan 404.
    const gate = (_req: Request, res: Response, next: () => void) => (isMockCheckoutEnabled() ? next() : send(res, NOT_FOUND));

    app.get(base, gate, mockCheckoutRateLimiter, async (req: Request, res: Response) => {
        try {
            send(res, await handleCheckoutPage(req.params.providerRef, req.query.t));
        } catch (e: any) {
            console.error('[MockCheckoutApiManager] sayfa hatası:', e?.message);
            send(res, errorPage(500, 'Beklenmeyen hata', 'İşlem tamamlanamadı.'));
        }
    });

    app.post(base, gate, mockCheckoutRateLimiter, express.urlencoded({ extended: false, limit: '4kb' }), async (req: Request, res: Response) => {
        if (crossSite(req)) return send(res, errorPage(403, 'İstek reddedildi', 'Çapraz site istekleri kabul edilmez.'));
        try {
            const body = (req.body || {}) as Record<string, unknown>;
            send(res, await handleCheckoutSubmit(req.params.providerRef, body.t, body.scenario));
        } catch (e: any) {
            console.error('[MockCheckoutApiManager] gönderim hatası:', e?.message);
            send(res, errorPage(500, 'Beklenmeyen hata', 'İşlem tamamlanamadı.'));
        }
    });

    app.post('/api/billing/mock/simulate', gate, mockCheckoutRateLimiter, express.raw({ type: '*/*', limit: '4kb' }), async (req: Request, res: Response) => {
        try {
            const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
            send(res, await handleDevSimulate(raw, req.headers['x-mock-dev-signature']));
        } catch (e: any) {
            console.error('[MockCheckoutApiManager] dev tetikleyici hatası:', e?.message);
            send(res, { status: 500, contentType: 'application/json; charset=utf-8', body: '{"error":"internal"}' });
        }
    });
}
