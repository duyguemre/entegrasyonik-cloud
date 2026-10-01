import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

// Characterization: backend/src/bootstrap/Webserver.ts -> init() kurulumu.
// ADR-0001 adım 3: eski "MOCK SECURITY" middleware'i (cookie -> jwt.decode -> res.locals.userContext) SİLİNDİ;
// yerine tek authenticate middleware'i (src/api/http/authenticate.ts) takılır. Onun davranışı authenticate.test.ts'te sınanır.
// Express/cors/compression/body-parser/cookie-parser ve ApiManager/ImageApiManager/authenticate mock'lanır; gerçek sunucu/port/ağ YOK.

type Captured = {
  uses: Array<(...a: any[]) => any>; order: string[];
  configureApis: jest.Mock<any>; configureImage: jest.Mock<any>; createAuthMw: jest.Mock<any>; authMw: (...a: any[]) => any;
  corsArgs: any[];
};

async function bootWebserver(): Promise<Captured> {
  const uses: Array<(...a: any[]) => any> = [];
  const order: string[] = [];
  const configureApis = jest.fn((..._a: any[]) => { order.push('configureApis'); });
  const configureImage = jest.fn((..._a: any[]) => { order.push('configureImageServices'); });
  const authMw = (() => undefined) as any;
  const createAuthMw = jest.fn((..._a: any[]) => { order.push('authenticate'); return authMw; });
  const fakeApp: any = {
    use: (mw: any) => { uses.push(mw); },
    get: () => undefined,
    listen: (_port: any, _url: any, cb: any) => { cb(); return { on: () => ({}) }; },
  };
  const fakeExpress: any = () => fakeApp;
  fakeExpress.static = () => (() => undefined);
  const corsArgs: any[] = [];
  const named = (n: string) => () => { const f = (() => undefined) as any; f.__name = n; order.push(n); return f; };

  await new Promise<void>((resolve, reject) => {
    jest.isolateModules(() => {
      jest.doMock('express', () => ({ __esModule: true, default: fakeExpress }));
      jest.doMock('cookie-parser', () => ({ __esModule: true, default: named('cookieParser') }));
      jest.doMock('compression', () => ({ __esModule: true, default: named('compression') }));
      jest.doMock('cors', () => ({ __esModule: true, default: (opts: any) => { corsArgs.push(opts); return named('cors')(); } }));
      jest.doMock('body-parser', () => ({ __esModule: true, default: { json: named('json'), urlencoded: named('urlencoded') } }));
      jest.doMock('../../../src/api/rpc/ApiManager', () => ({ configureApis }));
      jest.doMock('../../../src/api/files/ImageApiManager', () => ({ configureImageServices: configureImage }));
      // [ADR-0026] `/admin-api` baglama noktasi kendi testlerinde (tests/unit/api/admin) sinanir; burada app.use sirasini bozmamasi icin mock.
      jest.doMock('../../../src/api/admin', () => ({ configureAdminApi: jest.fn() }));
      // [ADR-0029 NB5] e-posta abonelik-iptal ucu `app.post(...)` + `express.urlencoded` kullanir; fakeApp'te yok -> ayni gerekceyle mock.
      jest.doMock('../../../src/api/http/notificationUnsubscribe', () => ({ configureNotificationUnsubscribeRoutes: jest.fn() }));
      // [ADR-0005 Karar 8] Webhook rotası `Webserver.configure()` içinde `app.post(...)` çağırır; `fakeApp` bu
      // testte yalnızca `use/get/listen` sağlar (ApiManager/ImageApiManager de AYNI nedenle mock'lanmış) --
      // bu testin ilgisi `order`/`uses` sırasıdır, webhook rota kaydı KAPSAM DIŞI (ayrıntı: WebhookApiManager
      // kendi testinde, tests/characterization/webhooks/Trendyol.webhook.test.ts).
      jest.doMock('../../../src/api/webhooks/WebhookApiManager', () => ({ configureWebhookRoutes: jest.fn() }));
      // ADR-0008 §4: billing webhook rotası da AYNI nedenle mock'lanır (`app.post(...)` çağırır, fakeApp'te
      // `express.raw` yok) -- kendi testi tests/characterization/webhooks/Billing.webhook.test.ts'te.
      jest.doMock('../../../src/api/webhooks/BillingWebhookApiManager', () => ({ configureBillingWebhookRoutes: jest.fn() }));
      jest.doMock('../../../src/api/webhooks/MockCheckoutApiManager', () => ({ configureMockCheckoutRoutes: jest.fn() })); // [ADR-0014 S4a]
      // [ADR-0034 BR-1] sohbet araci uclari `app.delete/post` kullanir; fakeApp'te yok -> ayni gerekceyle mock (kendi testi tests/unit/agent/agentRoutes.test.ts).
      jest.doMock('../../../src/api/http/agentRoutes', () => ({ configureAgentRoutes: jest.fn(), getAgentBroker: jest.fn() }));
      // [ADR-0035 MCP-1] OAuth uclari `app.post/delete/use([...])` + cors kullanir; fakeApp'te yok -> AYNI nedenle mock (kendi testi tests/unit/oauth/routes.test.ts).
      jest.doMock('../../../src/api/oauth', () => ({ configureOAuthPublicRoutes: jest.fn(), configureOAuthConsentRoutes: jest.fn() }));
      // [ADR-0035 MCP-2] tenant MCP ayari + bagli uygulamalar uclari `app.get/put/delete/post` kullanir; fakeApp'te yok -> AYNI nedenle mock (kendi testi tests/unit/oauth/mcpRoutes.test.ts).
      jest.doMock('../../../src/api/http/mcpRoutes', () => ({ configureMcpRoutes: jest.fn() }));
      // [ADR-0035 MCP-3] `POST /mcp` ucu `app.all` kullanir; fakeApp'te yok -> AYNI nedenle mock (kendi testi tests/unit/mcp/).
      jest.doMock('../../../src/mcp', () => ({ configureMcpEndpoint: () => undefined }));
      jest.doMock('../../../src/api/http/authenticate', () => ({ createAuthenticateMiddleware: createAuthMw }));
      jest.doMock('../../../src/api/rpc/index', () => ({ __esModule: true, default: {} }));
      const Webserver = require('../../../src/bootstrap/Webserver').default;
      Webserver.getInstance().init().then(resolve, reject);
    });
  });
  return { uses, order, configureApis, configureImage, createAuthMw, authMw, corsArgs };
}

const envKeys = ['SERVER_CONTEXT', 'IMAGE_FILES_PATH', 'SERVER_PORT', 'CORS_ORIGINS'];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  envKeys.forEach(k => { saved[k] = process.env[k]; delete process.env[k]; });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  envKeys.forEach(k => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  jest.restoreAllMocks();
});

describe('Webserver kurulumu (ADR-0001 adım 3)', () => {
  it('[ADR-0001 adım 3] kurulum sırası: cookieParser, compression, json, urlencoded, cors; sonra authenticate; SONRA configureApis, configureImageServices (kimlik middleware\'i tüm /api rotalarından önce)', async () => {
    const cap = await bootWebserver();
    expect(cap.order).toEqual(['cookieParser', 'compression', 'json', 'urlencoded', 'cors', 'authenticate', 'configureApis', 'configureImageServices']);
    // [ADR-0017 2026-09-28] Asama A: `requestId` + `securityHeaders` (helmet) correlation/guvenlik middleware'leri
    // TUM digerlerinden ONCE (health/webhook dahil, auth'tan once) takilir; `globalRateLimit` ise authenticate'ten
    // SONRA (kimlik-anahtarli sinir, res.locals.principal gerekir), configureApis'ten once, EN SON use().
    // [B-R1] olu express.static katmani kaldirildi (dist/src/client yok). uses sirasi:
    // [requestId, securityHeaders, cookieParser, compression, json, urlencoded, cors, originCheck, authenticate, globalRateLimit]
    // = 7 (temel: [ADR-0001 adim 7] 5 kurulum middleware'i + Origin/CSRF kontrolu + authenticate) + requestId + securityHeaders + globalRateLimit = 10.
    // [ADR-0030 X5 - KASITLI DEGISIKLIK] use() SONUNA 2 kayit eklendi: JSON 404 (notFoundHandler) + son hata isleyici
    // (errorHandler, 4 argumanli). Bunlar tum rotalardan sonra kayitlidir; asagidaki sira iddialari bu ikiliyi atlayarak degerlendirilir.
    // [BO-B11 - KASITLI DEGISIKLIK] globalRateLimit'ten SONRA `app.use(context, maintenanceGuard)` (bakim modu 503);
    // yol-bagli kayit oldugu icin yakalanan ilk arguman context dizesidir. Sira iddialari bu kaydi da atlar.
    expect(cap.uses).toHaveLength(13);
    expect(cap.uses[cap.uses.length - 1]).toHaveLength(4); // errorHandler: (err, req, res, next)
    expect(cap.uses[cap.uses.length - 2]).toHaveLength(2); // notFoundHandler: (req, res)
    expect(typeof cap.uses[cap.uses.length - 3]).toBe('string'); // maintenanceGuard: app.use(context, mw)
    const uses = cap.uses.slice(0, -3);
    expect(uses[0]).not.toBe(cap.authMw); // requestId
    expect(uses[1]).not.toBe(cap.authMw); // securityHeaders
    expect(uses[uses.length - 1]).not.toBe(cap.authMw); // globalRateLimit: authenticate'ten SONRA, sirali use()'larin sonuncusu
    expect(uses[uses.length - 2]).toBe(cap.authMw);
    expect(typeof uses[uses.length - 3]).toBe('function'); // originCheck: authenticate'ten ONCE
    expect(uses[uses.length - 3]).not.toBe(cap.authMw);
  });

  it('[ADR-0001 adım 7] CORS origin listesi CORS_ORIGINS env değerinden gelir; "*" KABUL EDİLMEZ (listeden çıkarılır, uyarı basılır)', async () => {
    process.env.CORS_ORIGINS = 'http://localhost:3000, * ,app://.';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cap = await bootWebserver();
    expect(cap.corsArgs[0].origin).toEqual(['http://localhost:3000', 'app://.']);
    expect(cap.corsArgs[0].origin).not.toContain('*');
    expect(warn).toHaveBeenCalled();
  });

  it('[ADR-0001 adım 7] CORS_ORIGINS boşsa izinli origin listesi BOŞ (eskiden [""]); joker yok', async () => {
    const cap = await bootWebserver();
    expect(cap.corsArgs[0].origin).toEqual([]);
  });

  it('[ADR-0001 adım 3] authenticate middleware\'i API bağlamıyla ("/api") oluşturulur; eski cookie->decode middleware\'i yok', async () => {
    const cap = await bootWebserver();
    expect(cap.createAuthMw).toHaveBeenCalledTimes(1);
    expect(cap.createAuthMw.mock.calls[0][0]).toBe('/api');
  });

  it('[MEVCUT DAVRANIŞ] varsayılan bağlam "/api", görsel yolu "products/" (env verilmezse)', async () => {
    const cap = await bootWebserver();
    expect(cap.configureApis.mock.calls[0][1]).toBe('/api');
    expect(cap.configureImage.mock.calls[0].slice(1)).toEqual(['/api', 'products/']);
  });

  it('[ADR-0001 adım 3] SERVER_CONTEXT değişirse authenticate de aynı bağlamla kurulur', async () => {
    process.env.SERVER_CONTEXT = '/v1';
    const cap = await bootWebserver();
    expect(cap.createAuthMw.mock.calls[0][0]).toBe('/v1');
  });

  it('[ADR-0001 adım 2] JWT_SECRET tanımsız/kısa ise Webserver.init() reddeder (fail-fast); hiçbir middleware/rota kurulmaz', async () => {
    const saved = process.env.JWT_SECRET;
    try {
      process.env.JWT_SECRET = 'kisa';
      await expect(bootWebserver()).rejects.toThrow(/JWT_SECRET/);
      delete process.env.JWT_SECRET;
      await expect(bootWebserver()).rejects.toThrow(/JWT_SECRET/);
    } finally {
      process.env.JWT_SECRET = saved;
    }
  });
});

describe('Kaynak taraması (statik): istek yolunda jwt.decode ve MOCK SECURITY kalmadı', () => {
  const root = path.join(__dirname, '../../../src');
  const files = ['bootstrap/Webserver.ts', 'api/rpc/ApiManager.ts', 'api/files/ImageApiManager.ts', 'api/rpc/RunOperation.ts', 'platform/core/security/Security.ts', 'api/http/authenticate.ts', 'api/rpc/handlers/security-service.ts'];
  const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');

  it('[ADR-0001 adım 3] hiçbir kimlik dosyasında decode( çağrısı yoktur (yorum satırları hariç)', () => {
    for (const f of files) {
      const code = read(f).split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
      expect([f, /\bdecode\s*\(/.test(code)]).toEqual([f, false]);
    }
  });

  it('[ADR-0001 adım 3] "MOCK SECURITY" middleware\'i Webserver.ts\'te yok', () => {
    expect(read('bootstrap/Webserver.ts')).not.toMatch(/MOCK SECURITY DEVREYE/);
  });

  it('[ADR-0001 adım 2] kaynak kodda gömülü JWT sırrı alanı yok (accessTokenSecret)', () => {
    expect(read('platform/core/security/Security.ts')).not.toMatch(/accessTokenSecret/);
  });
});
