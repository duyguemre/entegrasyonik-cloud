/**
 * [ADR-0006 adım 4] TERS ÇEVRİLDİ (BACKLOG C9 sahte başarı): bu dosya eskiden Hepsiburada
 * updateProductVariant/updateProductDelivery'nin HTTP çağırmadan { result:true } döndüğünü
 * sabitliyordu (kaynak: hepsiburada/index.ts:62-74). Artık gerçek uygulama tamamlanana kadar
 * IntegrationError('NOT_SUPPORTED') fırlatılır (Publisher bunu artık COMPLETED saymaz).
 * axios taklit edilir (gerçek ağ YOK).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('axios', () => require('./_axiosMock').axiosModuleFactory());

import Hepsiburada from '@integration/modules/marketplace/hepsiburada';
import { http, resetHttp, httpCallCount } from './_axiosMock';

const params = {
    clientId: 7,
    integrationSettings: { settings: { APIKEY: 'test-key', APISECRET: 'test-secret', SELLERID: 'M-1' }, urls: {} },
};

const staged = [
    { payload: { _id: 'v1', barcode: 'BC1' } },
    { payload: { _id: 'v2', barcode: 'BC2' } },
    { /* payload yok -> filtrelenir */ },
] as any[];

beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    resetHttp();
});
afterEach(() => { jest.restoreAllMocks(); });

describe('Hepsiburada updateProductVariant/updateProductDelivery (ADR-0006 adım 4 - BACKLOG C9 ters çevrildi)', () => {
    it('[YENİ DAVRANIŞ] updateProductVariant artık IntegrationError(NOT_SUPPORTED) fırlatır, sahte result:true DÖNMEZ', async () => {
        await expect(new Hepsiburada(params).updateProductVariant(staged)).rejects.toMatchObject({
            name: 'IntegrationError', code: 'NOT_SUPPORTED', retryable: false,
        });
        expect(httpCallCount()).toBe(0); // hâlâ gerçek çağrı yapılmıyor (henüz uygulanmadı) ama artık dürüstçe hata veriyor
    });

    it('[YENİ DAVRANIŞ] updateProductDelivery artık IntegrationError(NOT_SUPPORTED) fırlatır', async () => {
        await expect(new Hepsiburada(params).updateProductDelivery(staged)).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
        expect(httpCallCount()).toBe(0);
    });

    it('[YENİ DAVRANIŞ] boş girdi için de aynı şekilde NOT_SUPPORTED fırlatır (artık "sahte başarı" özel durumu yok)', async () => {
        const hb = new Hepsiburada(params);
        await expect(hb.updateProductVariant([])).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
        await expect(hb.updateProductDelivery([])).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
        expect(httpCallCount()).toBe(0);
    });

    it('[MEVCUT DAVRANIŞ - DEĞİŞMEDİ] KONTROL: gerçek çağrı yapan rejectOrder HTTP istemcisini çağırır ("0 çağrı" assertion boş değil)', async () => {
        http.post.mockResolvedValue({ data: {} } as never);
        const res = await new Hepsiburada(params).rejectOrder('ORD-1', { reasonId: 'Other' } as any);
        expect(res).toBe(true);
        expect(http.post).toHaveBeenCalledTimes(1);
    });
});
