/**
 * [ADR-0006 adım 4] TERS ÇEVRİLDİ (BACKLOG C9 sahte başarı): bu dosya eskiden N11
 * approveOrder/rejectOrder'ın (n11/index.ts:72-73, n11/services/OrderService.ts) gerçek SOAP/REST
 * çağrısı yapmadan `true` döndüğünü sabitliyordu. Artık gerçek uygulama tamamlanana kadar
 * IntegrationError('NOT_SUPPORTED') fırlatılır (Publisher/OrderOrchestrator bunu artık başarı saymaz).
 * axios taklit edilir (gerçek ağ YOK); HTTP istemcisinin ÇAĞRILMADIĞI assert edilir.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('axios', () => require('./_axiosMock').axiosModuleFactory());

import N11 from '@integration/modules/marketplace/n11';
import { OrderService } from '@integration/modules/marketplace/n11/services/OrderService';
import { OrderInternalStatusEnum } from '@interfaces/index';
import { http, resetHttp, httpCallCount } from './_axiosMock';

const params = {
  clientId: 7,
  integrationSettings: { settings: { APIKEY: 'test-key', APISECRET: 'test-secret' }, urls: {} },
};

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  resetHttp();
});
afterEach(() => { jest.restoreAllMocks(); });

describe('N11 approveOrder / rejectOrder (ADR-0006 adım 4 - BACKLOG C9 ters çevrildi)', () => {
  it('[YENİ DAVRANIŞ] approveOrder artık IntegrationError(NOT_SUPPORTED) fırlatır, sahte true DÖNMEZ', async () => {
    const n11 = new N11(params);
    await expect(n11.approveOrder('ORD-123')).rejects.toMatchObject({
      name: 'IntegrationError', code: 'NOT_SUPPORTED', retryable: false,
    });
    expect(httpCallCount()).toBe(0); // hâlâ gerçek çağrı yapılmıyor (henüz uygulanmadı) ama artık dürüstçe hata veriyor
  });

  it('[YENİ DAVRANIŞ] rejectOrder artık IntegrationError(NOT_SUPPORTED) fırlatır (neden/parametre yok sayılır)', async () => {
    const n11 = new N11(params);
    await expect(n11.rejectOrder('ORD-123', { reasonId: 'OUT_OF_STOCK' } as any)).rejects.toMatchObject({
      code: 'NOT_SUPPORTED',
    });
    expect(httpCallCount()).toBe(0);
  });

  it('[YENİ DAVRANIŞ] rejectOrder boş/undefined parametrelerle de NOT_SUPPORTED fırlatır', async () => {
    const n11 = new N11(params);
    await expect(n11.rejectOrder('', undefined as any)).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
    expect(httpCallCount()).toBe(0);
  });

  it('[YENİ DAVRANIŞ] OrderService.updateOrderPackageStatus artık her hedef statü için NOT_SUPPORTED fırlatır ve HTTP çağırmaz', async () => {
    const svc = new OrderService(params, { rest: {}, soapRequest: jest.fn() } as any);
    for (const s of Object.values(OrderInternalStatusEnum)) {
      await expect(svc.updateOrderPackageStatus('ORD-1', 'LI-1', s as any)).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
    }
    expect(httpCallCount()).toBe(0);
  });

  it('[MEVCUT DAVRANIŞ - DEĞİŞMEDİ] KONTROL: gerçek çağrı yapan sendOrderShipping HTTP istemcisini çağırır ("0 çağrı" assertion boş değil)', async () => {
    http.post.mockRejectedValue(new Error('taklit ağ hatası') as never);
    const n11 = new N11(params);
    await expect(n11.sendOrderShipping({ orderId: 'ORD-1', trackingCode: 'TRK1' } as any)).rejects.toThrow();
    expect(http.post).toHaveBeenCalledTimes(1);
  });
});
