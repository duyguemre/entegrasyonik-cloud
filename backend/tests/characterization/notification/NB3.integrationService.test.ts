/**
 * ADR-0029 NB3 -- IntegrationService toplu islem bildirimleri: katalog kodu/params/idempotency, N-05 (ham error.message YOK),
 * bayrak kapali eski olay birebir. DB/Redis/ag YOK.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

let mockV2 = false;
jest.mock('@config', () => {
  const actual: any = jest.requireActual('@config');
  const notify = { get v2Enabled() { return mockV2; }, emailEnabled: false };
  return { ...actual, config: new Proxy(actual.config, { get: (t, k) => (k === 'notify' ? notify : t[k]) }) };
});
jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@integration/engine/IntegrationEventBus', () => ({ EVENTS: {}, integrationEventBus: { emit: jest.fn(), on: jest.fn() } }));

import IntegrationFactory from '@integration/modules/IntegrationFactory';
import IntegrationService from '@api/rpc/handlers/integration-service';
import { NotificationService } from '@services/notification/NotificationService';
import { notificationEventBus } from '@services/notification/NotificationEventBus';
import { NOTIFICATION_EVENTS } from '@interfaces/index';
import { getDefinition } from '@operations/notifications/catalog';

const SECRET = 'mongodb://user' + ':pa55w0rd@host/db ETIMEDOUT';
const REQ = { mode: 'TRANSFER', selectedIntegrations: ['trendyol'], barcodeList: ['B1'], scope: 1 };

function svcWithBoom(): any {
  const svc: any = new IntegrationService(42, REQ);
  (IntegrationFactory as any).mockImplementation(() => ({ getInstance: async () => { throw new Error(SECRET); } }));
  svc.clientDB = { getVariantModel: () => { throw new Error(SECRET); } };
  svc.applicationDB = {};
  return svc;
}

let sink: { notify: jest.Mock<any>; notifyLegacy: jest.Mock<any> };
let saved: jest.Mock<any>;
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  notificationEventBus.removeAllListeners(NOTIFICATION_EVENTS.SEND_CLIENT_NOTIFICATION);
  saved = jest.fn(async () => undefined);
  NotificationService.init({ saveNotification: saved, getStorageConfig: jest.fn() } as any);
  sink = { notify: jest.fn(async () => ({ status: 'created' })), notifyLegacy: jest.fn(async () => ({ status: 'created' })) };
  NotificationService.setSink(sink as any);
});

describe('[NB3][N-05] internalProcessBatch hata bildirimi', () => {
  it('bayrak ACIK: CATALOG_BATCH_FAILED, params katalog semasina uyar, HAM hata mesaji/sir YOK; errorCode guvenli', async () => {
    mockV2 = true;
    await svcWithBoom().internalProcessBatch(REQ);
    await new Promise((r) => setImmediate(r));
    const call = sink.notify.mock.calls.find((c: any[]) => c[0] === 'CATALOG_BATCH_FAILED') as any[];
    expect(call).toBeDefined();
    expect(call[1]).toBe(42);
    expect(getDefinition('CATALOG_BATCH_FAILED')!.params.safeParse(call[2]).success).toBe(true);
    expect(call[2]).toMatchObject({ integ: 'trendyol', mode: 'TRANSFER', errorCode: 'UNEXPECTED_ERROR' });
    expect(JSON.stringify(call)).not.toMatch(/pa55w0rd|ETIMEDOUT|mongodb:/);
    expect(call[3].idempotencyKey).toMatch(/^batch-failed:/);
    expect(saved).not.toHaveBeenCalled();
  });

  it('bayrak KAPALI: eski olay BIREBIR (BATCH_PROCESS/error, bugunku metin); cekirdege gitmez', async () => {
    mockV2 = false;
    await svcWithBoom().internalProcessBatch(REQ);
    await new Promise((r) => setImmediate(r));
    expect(sink.notify).not.toHaveBeenCalled();
    const [id, data] = saved.mock.calls[0] as any[];
    expect(id).toBe(42); // bugunku davranis: clientId sayi olarak gider
    expect(data).toMatchObject({ type: 'BATCH_PROCESS', mode: 'TRANSFER', severity: 'error', title: 'İşlem Başarısız' });
    expect(data.message).toBe(`Toplu işlem sırasında bir hata oluştu: ${SECRET}`);
  });
});
