/**
 * YENİ DAVRANIŞ (ADR-0006 Karar 5): Webserver.ts -> /health, /ready rotaları.
 * Aynı sahte express() düzeni `webserver-auth-middleware.test.ts` ile aynıdır; burada `app.get` çağrıları
 * YAKALANIR (o dosyada no-op'tu) ve doğrudan çağrılarak handler davranışı sınanır. Gerçek HTTP/port/DB/Redis YOK.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('@health/HealthCheck', () => ({ checkReadiness: jest.fn() }));
jest.mock('@services/redis', () => ({ RedisService: { getInstance: jest.fn(() => ({ ping: jest.fn() })) } }));

type Route = { method: string; path: string; handler: (...a: any[]) => any };

async function bootWebserver(): Promise<{ routes: Route[] }> {
  const routes: Route[] = [];
  const fakeApp: any = {
    use: () => undefined,
    get: (p: any, h: any) => { if (typeof h === 'function') routes.push({ method: 'GET', path: p, handler: h }); },
    listen: (_port: any, _url: any, cb: any) => { cb(); return { on: () => ({}) }; },
  };
  const fakeExpress: any = () => fakeApp;
  fakeExpress.static = () => (() => undefined);

  await new Promise<void>((resolve, reject) => {
    jest.isolateModules(() => {
      jest.doMock('express', () => ({ __esModule: true, default: fakeExpress }));
      jest.doMock('cookie-parser', () => ({ __esModule: true, default: () => (() => undefined) }));
      jest.doMock('compression', () => ({ __esModule: true, default: () => (() => undefined) }));
      jest.doMock('cors', () => ({ __esModule: true, default: () => (() => undefined) }));
      jest.doMock('body-parser', () => ({ __esModule: true, default: { json: () => (() => undefined), urlencoded: () => (() => undefined) } }));
      jest.doMock('../../../src/api/rpc/ApiManager', () => ({ configureApis: () => undefined }));
      jest.doMock('../../../src/api/files/ImageApiManager', () => ({ configureImageServices: () => undefined }));
      jest.doMock('../../../src/api/webhooks/WebhookApiManager', () => ({ configureWebhookRoutes: () => undefined })); // [ADR-0005 Karar 8] fakeApp'te app.post yok; ApiManager/ImageApiManager ile AYNI nedenle mock'lanır
      jest.doMock('../../../src/api/http/agentRoutes', () => ({ configureAgentRoutes: () => undefined, getAgentBroker: () => undefined })); // [ADR-0034 BR-1] app.delete/post; fakeApp'te yok -> AYNI nedenle mock
      jest.doMock('../../../src/api/oauth', () => ({ configureOAuthPublicRoutes: () => undefined, configureOAuthConsentRoutes: () => undefined })); // [ADR-0035 MCP-1] app.use([..])/post; fakeApp'te yok -> AYNI nedenle mock
      jest.doMock('../../../src/api/http/mcpRoutes', () => ({ configureMcpRoutes: () => undefined })); // [ADR-0035 MCP-2] app.get/put/delete/post; fakeApp'te yok -> AYNI nedenle mock
      // [ADR-0035 MCP-3] `POST /mcp` ucu `app.all` kullanir; fakeApp'te yok -> AYNI nedenle mock (kendi testi tests/unit/mcp/).
      jest.doMock('../../../src/mcp', () => ({ configureMcpEndpoint: () => undefined }));
      jest.doMock('../../../src/api/http/notificationUnsubscribe', () => ({ configureNotificationUnsubscribeRoutes: () => undefined })); // [ADR-0029 NB5] express.urlencoded + app.post; fakeApp'te yok -> AYNI nedenle mock
      jest.doMock('../../../src/api/admin', () => ({ configureAdminApi: () => undefined })); // [ADR-0026] /admin-api kendi testlerinde
      jest.doMock('../../../src/api/webhooks/BillingWebhookApiManager', () => ({ configureBillingWebhookRoutes: () => undefined })); // [ADR-0008 §4] AYNI nedenle mock'lanır
      jest.doMock('../../../src/api/webhooks/MockCheckoutApiManager', () => ({ configureMockCheckoutRoutes: () => undefined })); // [ADR-0014 S4a] AYNI nedenle mock'lanır
      jest.doMock('../../../src/api/http/authenticate', () => ({ createAuthenticateMiddleware: () => (() => undefined) }));
      jest.doMock('../../../src/api/rpc/index', () => ({ __esModule: true, default: {} }));
      const Webserver = require('../../../src/bootstrap/Webserver').default;
      Webserver.getInstance().init('all' as any).then(resolve, reject);
    });
  });
  return { routes };
}

function fakeRes() {
  const res: any = { statusCode: undefined, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: any) => { res.body = b; return res; });
  return res;
}

const envKeys = ['SERVER_CONTEXT', 'IMAGE_FILES_PATH', 'SERVER_PORT', 'CORS_ORIGINS'];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  envKeys.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  envKeys.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  jest.restoreAllMocks();
});

describe('Webserver /health /ready (ADR-0006 Karar 5)', () => {
  it('[YENİ DAVRANIŞ] /health VE /ready, "*" SPA catch-all\'dan ÖNCE ve auth middleware\'inden ÖNCE (en baştaki 2 GET) kayıtlıdır', async () => {
    const { routes } = await bootWebserver();
    const getRoutes = routes.filter((r) => r.method === 'GET');
    expect(getRoutes[0].path).toBe('/health');
    expect(getRoutes[1].path).toBe('/ready');
  });

  it('[YENİ DAVRANIŞ] /health her zaman 200 {status:"ok"} döner (bağımlılık kontrolü yapılmaz)', async () => {
    const { routes } = await bootWebserver();
    const health = routes.find((r) => r.path === '/health')!;
    const res = fakeRes();
    await health.handler({} as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('[YENİ DAVRANIŞ] /ready hazırsa 200, checkReadiness sonucunu gövdede döner', async () => {
    const { checkReadiness } = require('@health/HealthCheck');
    (checkReadiness as jest.Mock<any>).mockResolvedValue({ ready: true, mongo: 'ok', redis: 'ok' });
    const { routes } = await bootWebserver();
    const ready = routes.find((r) => r.path === '/ready')!;
    const res = fakeRes();
    await ready.handler({} as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ready: true, mongo: 'ok', redis: 'ok' });
    expect(checkReadiness).toHaveBeenCalledWith('all', expect.any(Function));
  });

  it('[YENİ DAVRANIŞ] /ready hazır değilse 503 döner (host/sürüm bilgisi olmayan gövde)', async () => {
    const { checkReadiness } = require('@health/HealthCheck');
    (checkReadiness as jest.Mock<any>).mockResolvedValue({ ready: false, mongo: 'fail', redis: 'n/a' });
    const { routes } = await bootWebserver();
    const ready = routes.find((r) => r.path === '/ready')!;
    const res = fakeRes();
    await ready.handler({} as any, res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ ready: false, mongo: 'fail', redis: 'n/a' });
  });
});
