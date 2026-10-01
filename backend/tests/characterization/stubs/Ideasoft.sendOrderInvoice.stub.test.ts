/**
 * [ADR-0006 Karar 2] TERS ÇEVRİLDİ (ADR-0006 Bağlam bölümü, "Ideasoft sendOrderInvoice no-op
 * success:true"): bu dosya eskiden Ideasoft `sendOrderInvoice`'ın (ideasoft/services/OrderService.ts)
 * hiçbir çağrı yapmadan `{success:true}` döndüğünü sabitliyordu. Artık gerçek fatura bildirim uç
 * noktası uygulanana kadar `IntegrationError('NOT_SUPPORTED')` fırlatılır (invoice-service.ts bunu
 * try/catch ile yakalayıp honest `{success:false}` döner, başarı taklit etmez).
 * axios taklit edilir (gerçek ağ YOK); HTTP istemcisinin ÇAĞRILMADIĞI assert edilir.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('axios', () => require('./_axiosMock').axiosModuleFactory());

import Ideasoft from '@integration/modules/ecommerce/ideasoft';
import { httpCallCount, resetHttp } from './_axiosMock';

const params = {
    clientId: 74,
    integrationSettings: { settings: { storeName: 'test', key: 'k', secret: 's' }, urls: {} },
};

beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    resetHttp();
});
afterEach(() => { jest.restoreAllMocks(); });

describe('Ideasoft sendOrderInvoice (ADR-0006 Karar 2 ters çevrildi)', () => {
    it('[YENİ DAVRANIŞ] artık IntegrationError(NOT_SUPPORTED) fırlatır, sahte {success:true} DÖNMEZ', async () => {
        const ideasoft = new Ideasoft(params);
        await expect(ideasoft.sendOrderInvoice({ orderId: 'ORD-1' } as any)).rejects.toMatchObject({
            name: 'IntegrationError', code: 'NOT_SUPPORTED', retryable: false,
        });
        expect(httpCallCount()).toBe(0); // hâlâ gerçek çağrı yapılmıyor ama artık dürüstçe hata veriyor
    });
});
