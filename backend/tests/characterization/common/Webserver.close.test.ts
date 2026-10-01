/**
 * YENİ DAVRANIŞ (ADR-0006 Karar 6, adım 2): Webserver.close() — http.Server.close()'a delege eder.
 * Aynı sahte express() düzeni diğer Webserver testleriyle aynıdır. Gerçek port/ağ YOK.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

async function bootWebserver(): Promise<{ webserverClose: jest.Mock<any>; instance: any }> {
  const webserverClose = jest.fn((cb: any) => cb());
  const fakeServer: any = { close: webserverClose };
  fakeServer.on = () => fakeServer; // http.Server.on() gerçekte "this" döner (zincirlenebilir)
  const fakeApp: any = {
    use: () => undefined,
    get: () => undefined,
    listen: (_port: any, _url: any, cb: any) => { cb(); return fakeServer; },
  };
  const fakeExpress: any = () => fakeApp;
  fakeExpress.static = () => (() => undefined);
  let instance: any;

  await new Promise<void>((resolve, reject) => {
    jest.isolateModules(() => {
      jest.doMock('express', () => ({ __esModule: true, default: fakeExpress }));
      jest.doMock('cookie-parser', () => ({ __esModule: true, default: () => (() => undefined) }));
      jest.doMock('compression', () => ({ __esModule: true, default: () => (() => undefined) }));
      jest.doMock('cors', () => ({ __esModule: true, default: () => (() => undefined) }));
      jest.doMock('body-parser', () => ({ __esModule: true, default: { json: () => (() => undefined), urlencoded: () => (() => undefined) } }));
      jest.doMock('../../../src/api/rpc/ApiManager', () => ({ configureApis: () => undefined }));
      jest.doMock('../../../src/api/ImageApiManager', () => ({ configureImageServices: () => undefined }));
      jest.doMock('../../../src/api/WebhookApiManager', () => ({ configureWebhookRoutes: () => undefined })); // [ADR-0005 Karar 8] fakeApp'te app.post yok; ApiManager/ImageApiManager ile AYNI nedenle mock'lanır
      jest.doMock('../../../src/api/http/agentRoutes', () => ({ configureAgentRoutes: () => undefined, getAgentBroker: () => undefined })); // [ADR-0034 BR-1] app.delete/post; fakeApp'te yok -> AYNI nedenle mock
      jest.doMock('../../../src/api/oauth', () => ({ configureOAuthPublicRoutes: () => undefined, configureOAuthConsentRoutes: () => undefined })); // [ADR-0035 MCP-1] app.use([..])/post; fakeApp'te yok -> AYNI nedenle mock
      jest.doMock('../../../src/api/http/mcpRoutes', () => ({ configureMcpRoutes: () => undefined })); // [ADR-0035 MCP-2] app.get/put/delete/post; fakeApp'te yok -> AYNI nedenle mock
      // [ADR-0035 MCP-3] `POST /mcp` ucu `app.all` kullanir; fakeApp'te yok -> AYNI nedenle mock (kendi testi tests/unit/mcp/).
      jest.doMock('../../../src/mcp', () => ({ configureMcpEndpoint: () => undefined }));
      jest.doMock('../../../src/api/http/notificationUnsubscribe', () => ({ configureNotificationUnsubscribeRoutes: () => undefined })); // [ADR-0029 NB5] express.urlencoded + app.post; fakeApp'te yok -> AYNI nedenle mock
      jest.doMock('../../../src/api/admin', () => ({ configureAdminApi: () => undefined })); // [ADR-0026] /admin-api kendi testlerinde
      jest.doMock('../../../src/api/BillingWebhookApiManager', () => ({ configureBillingWebhookRoutes: () => undefined })); // [ADR-0008 §4] AYNI nedenle mock'lanır
      jest.doMock('../../../src/api/MockCheckoutApiManager', () => ({ configureMockCheckoutRoutes: () => undefined })); // [ADR-0014 S4a] AYNI nedenle mock'lanır
      jest.doMock('../../../src/api/authenticate', () => ({ createAuthenticateMiddleware: () => (() => undefined) }));
      jest.doMock('../../../src/api/rpc/index', () => ({ __esModule: true, default: {} }));
      const WebserverModule = require('../../../src/Webserver').default;
      instance = WebserverModule.getInstance();
      instance.init('all').then(resolve, reject);
    });
  });
  return { webserverClose, instance };
}

beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => undefined); });
afterEach(() => { jest.restoreAllMocks(); });

describe('Webserver.close (ADR-0006 Karar 6)', () => {
  it('[YENİ DAVRANIŞ] http.Server.close() çağırır ve callback tetiklenince resolve eder', async () => {
    const { webserverClose, instance } = await bootWebserver();
    await instance.close();
    expect(webserverClose).toHaveBeenCalledTimes(1);
  });
});
