/**
 * [ADR-0006 adım 3] TERS ÇEVRİLDİ: bu dosya eskiden Trendyol bağlayıcılarının API hatasında
 * sessizce [] döndüğünü ("sipariş/iade/mesaj yok" ile "çekme başarısız" ayırt edilemiyordu)
 * sabitliyordu (BACKLOG C9, kaynak: OrderConnector.ts:72, ClaimConnector.ts:80,93, MessageConnector.ts:44).
 *
 * ADR-0006 Karar 1-2 uygulandıktan sonra: artık [] DÖNMEZ, IntegrationError fırlatılır (kod/retryable
 * taşır). Okuma bağlayıcıları artık 5xx/timeout/ağ hatasında ResilientHttpClient üzerinden retry eder
 * (önceden yalnızca 429/ağ hatası retry ediliyordu, yanıtlı 4xx/5xx retry edilmiyordu) — bu yüzden 500
 * senaryosunda http.get birden çok kez çağrılır (1 ilk deneme + retry bütçesi). Testler hızlı kalması
 * için `ResilientHttpClient.setTestDelayScale` ile backoff/breaker süreleri ölçeklenir (şekil/oran AYNI,
 * sadece gerçek süre kısalır; üretim varsayılanı 1'dir, burada DEĞİŞTİRİLMEZ).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('axios', () => require('./_axiosMock').axiosModuleFactory());

import Service from '@integration/modules/marketplace/trendyol/services/Service';
import { OrderConnector } from '@integration/modules/marketplace/trendyol/api/OrderConnector';
import { ClaimConnector } from '@integration/modules/marketplace/trendyol/api/ClaimConnector';
import { MessageConnector } from '@integration/modules/marketplace/trendyol/api/MessageConnector';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { http, resetHttp } from './_axiosMock';

const params = {
    clientId: 7,
    integrationSettings: {
        settings: { APIKEY: 'test-key', APISECRET: 'test-secret', SELLERID: '999' },
        urls: {
            orderListUrl: 'https://api.trendyol.com/sapigw/suppliers/<SELLERID>/orders',
            claimListUrl: 'https://api.trendyol.com/sapigw/suppliers/<SELLERID>/claims',
            claimRejectionReasonsUrl: 'https://api.trendyol.com/sapigw/claim-issue-reasons',
            qnaListUrl: 'https://api.trendyol.com/sapigw/qna/sellers/<SELLERID>/questions/filter',
        },
    },
};

const apiError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { message: 'taklit hata' } } });

let service: Service;
beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); }); // 1000x hızlı: 1sn -> 1ms (şekil/oran aynı)
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });

beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    resetHttp();
    ResilientHttpClient.resetAllState();
    service = new Service(params);
});
afterEach(() => { jest.restoreAllMocks(); });

describe('Trendyol bağlayıcıları - IntegrationError (ADR-0006, [ADR-0006 adım 3] eski hata-yutma ters çevrildi)', () => {
    it('[YENİ DAVRANIŞ] OrderConnector.fetchOrdersFromPlatform 401 -> IntegrationError(AUTH), retry edilmez (tek istek)', async () => {
        http.get.mockRejectedValue(apiError(401) as never);
        await expect(new OrderConnector(service, params).fetchOrdersFromPlatform({})).rejects.toMatchObject({
            name: 'IntegrationError', code: 'AUTH', retryable: false,
        });
        expect(http.get).toHaveBeenCalledTimes(1);
    });

    it('[YENİ DAVRANIŞ] OrderConnector.fetchOrdersFromPlatform 400 -> IntegrationError(VALIDATION), retry edilmez', async () => {
        http.get.mockRejectedValue(apiError(400) as never);
        await expect(new OrderConnector(service, params).fetchOrdersFromPlatform({})).rejects.toMatchObject({
            code: 'VALIDATION', retryable: false,
        });
        expect(http.get).toHaveBeenCalledTimes(1);
    });

    it('[YENİ DAVRANIŞ] OrderConnector.fetchOrdersFromPlatform sürekli 500 -> IntegrationError(UNAVAILABLE) fırlatılır, [] DÖNMEZ; okuma olduğu için retry edilir (1 ilk + 4 retry = 5 istek)', async () => {
        http.get.mockRejectedValue(apiError(500) as never);
        await expect(new OrderConnector(service, params).fetchOrdersFromPlatform({})).rejects.toMatchObject({
            code: 'UNAVAILABLE', retryable: true,
        });
        expect(http.get).toHaveBeenCalledTimes(5);
    });

    it('[YENİ DAVRANIŞ] ilk sayfa başarılı, sonraki sayfa sürekli hata verirse yine IntegrationError fırlatılır (tüm sonuç atılır, [] DÖNMEZ)', async () => {
        http.get
            .mockResolvedValueOnce({ data: { content: [{ id: 1 }], totalPages: 2 } } as never)
            .mockRejectedValue(apiError(500) as never);
        await expect(new OrderConnector(service, params).fetchOrdersFromPlatform({})).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    });

    it('[MEVCUT DAVRANIŞ - DEĞİŞMEDİ] başarılı yanıtta siparişler döner', async () => {
        http.get.mockResolvedValue({ data: { content: [{ id: 1 }, { id: 2 }], totalPages: 1 } } as never);
        await expect(new OrderConnector(service, params).fetchOrdersFromPlatform({})).resolves.toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('[YENİ DAVRANIŞ] ClaimConnector.fetchClaimsFromPlatform sürekli 500 -> IntegrationError(UNAVAILABLE), [] DÖNMEZ', async () => {
        http.get.mockRejectedValue(apiError(500) as never);
        await expect(new ClaimConnector(service, params).fetchClaimsFromPlatform({})).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    });

    it('[YENİ DAVRANIŞ] ClaimConnector.retrieveOrderRejectionReasons sürekli 500 -> IntegrationError(UNAVAILABLE), [] DÖNMEZ', async () => {
        http.get.mockRejectedValue(apiError(500) as never);
        await expect(new ClaimConnector(service, params).retrieveOrderRejectionReasons()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    });

    it('[YENİ DAVRANIŞ] MessageConnector.fetchMessages sürekli 503 -> IntegrationError(UNAVAILABLE), [] DÖNMEZ', async () => {
        http.get.mockRejectedValue(apiError(503) as never);
        await expect(new MessageConnector(service, params).fetchMessages({})).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    });

    it('[MEVCUT DAVRANIŞ - DEĞİŞMEDİ] startDate/endDate sorguda milisaniye timestamp olarak gönderilir', async () => {
        http.get.mockResolvedValue({ data: { content: [], totalPages: 1 } } as never);
        // [C22 2026-09-28] ESKİ: sabit 2026-01-01. startDate-only artık <=14 günlük pencerelere bölünür (her biri ayrı istek);
        // test yakın tarih kullanır (tek pencere). Sabit uzak tarihle çok pencere davranışı trendyol-orders testinde.
        const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
        await new OrderConnector(service, params).fetchOrdersFromPlatform({ startDate: d });
        const calledUrl = (http.get.mock.calls[0] as any[])[0] as string;
        expect(calledUrl).toContain(`startDate=${d.getTime()}`);
        expect(calledUrl).toContain('page=0');
        expect(calledUrl).toContain('size=200'); // [C22 2026-09-28] ESKİ: size=50
    });
});

describe('Trendyol OrderConnector - yazma çağrılarında retry yasağı ([ADR-0006 adım 1])', () => {
    it('rejectOrder (PUT): aynı gövde 15dk içinde tekrar gönderilirse Trendyol 400 döner; artık RETRY YAPILMAZ (tek istek, VALIDATION)', async () => {
        // 1f bulgusu: Trendyol "aynı gövde 15 dk içinde tekrar gönderilirse hata" veriyor; eski Service.ts
        // her POST/PUT hatasında (ağ hatası da dahil) retry ediyordu -> bu durumun kaynağı olabilirdi.
        // ADR-0006: yazmalarda 400/timeout/5xx retry YOK.
        http.put.mockRejectedValue(apiError(400) as never);
        await expect(new OrderConnector(service, params).rejectOrder('ORD-1', { reasonId: '1', lineItems: [] } as any))
            .rejects.toMatchObject({ code: 'VALIDATION', retryable: false });
        expect(http.put).toHaveBeenCalledTimes(1);
    });

    it('sendOrderShipping (POST): sunucu 500 dönerse retry edilmez, UNKNOWN_OUTCOME fırlatılır (sonuç belirsiz)', async () => {
        http.post.mockRejectedValue(apiError(500) as never);
        await expect(new OrderConnector(service, params).sendOrderShipping({ orderId: 'X', trackingCode: 'T1' } as any))
            .rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME', retryable: true });
        expect(http.post).toHaveBeenCalledTimes(1);
    });

    it('sendOrderInvoice (POST): ağ hatası (ECONNRESET, gönderilip gönderilmediği belirsiz) retry edilmez, UNKNOWN_OUTCOME', async () => {
        http.post.mockRejectedValue(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) as never);
        await expect(new OrderConnector(service, params).sendOrderInvoice({ orderId: '900001', invoiceNumber: 'INV1' } as any))
            .rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
        expect(http.post).toHaveBeenCalledTimes(1);
    });
});
