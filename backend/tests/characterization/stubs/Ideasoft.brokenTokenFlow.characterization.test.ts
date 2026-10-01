/**
 * CHARACTERIZATION (BACKLOG C10, ADR-0006 Aşama B3 — BİLİNÇLİ OLARAK DOKUNULMADI):
 * Ideasoft gerçek modda token akışı kopuk. `IPlatform.init()` (yalnızca `init()` içinde
 * `SecurityService.refreshToken()` çağrılır) hiçbir üretim yolundan tetiklenmiyor
 * (`IntegrationFactory.getInstance`, `src/integration/modules/IntegrationFactory.ts:192-209`,
 * `moduleInstance`'ı oluşturduktan sonra ASLA `.init()` çağırmaz — yalnızca `ApiWrapper`'daki AYRI
 * "microservice" desenlerinde `init()` çağrılır, `IPlatform` bu desenin parçası DEĞİLDİR).
 * Sonuç: `Service.currentToken` her yeni örnekte boş ('') başlar ve hiçbir get/post/put çağrısı
 * bunu otomatik doldurmaz; istekler boş `Authorization: Bearer ` header'ıyla gider.
 *
 * Bu dosyanın amacı: ADR-0006 B3'ün ResilientHttpClient'a taşıma değişikliği bu KOPUK davranışı
 * YANLIŞLIKLA "düzeltmediğini" kanıtlamaktır. Token akışının GERÇEK düzeltmesi (init() bağlanması,
 * OAuth callback/refresh akışının üretimde çalışır hale getirilmesi) ayrı ve daha büyük bir iştir (C10).
 *
 * axios taklit edilir (gerçek ağ YOK, gerçek Ideasoft hostuna hiçbir istek YOK).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('axios', () => require('./_axiosMock').axiosModuleFactory());

import Service from '@integration/modules/ecommerce/ideasoft/services/Service';
import { OrderService } from '@integration/modules/ecommerce/ideasoft/services/OrderService';
import { http, resetHttp } from './_axiosMock';

const params = {
    clientId: 73,
    integrationSettings: {
        settings: { storeName: 'test', key: 'k', secret: 's' },
        urls: { orderListUrl: 'orders' },
    },
};

beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    resetHttp();
    http.get.mockResolvedValue({ data: [] });
});
afterEach(() => { jest.restoreAllMocks(); });

describe('Ideasoft Service - token akışı kopuk (C10, DOKUNULMADI)', () => {
    it('[MEVCUT DAVRANIŞ] yeni Service örneğinde getCurrentToken() boş string döner (init() hiç çağrılmadı)', () => {
        const svc = new Service(params);
        expect(svc.getCurrentToken()).toBe('');
    });

    it('[MEVCUT DAVRANIŞ] fetchOrders çağrısı, token hiç ayarlanmamışken BOŞ Bearer header ile istek atar (hata fırlatmaz, sessizce boş token gönderir)', async () => {
        const svc = new Service(params);
        const orderService = new OrderService(params, svc);

        await orderService.fetchOrders({});

        expect(http.get).toHaveBeenCalledTimes(1);
        const headers = (http.get.mock.calls[0][1] as any)?.headers;
        expect(headers.Authorization).toBe('Bearer ');
    });

    it('[MEVCUT DAVRANIŞ] setCurrentToken çağrılmadıkça token akışı (SecurityService.refreshToken) OTOMATİK tetiklenmez; token yalnızca elle set edilirse header\'a yansır', async () => {
        const svc = new Service(params);
        svc.setCurrentToken('manually-set-token');
        const orderService = new OrderService(params, svc);

        await orderService.fetchOrders({});

        const headers = (http.get.mock.calls[0][1] as any)?.headers;
        expect(headers.Authorization).toBe('Bearer manually-set-token');
    });
});
