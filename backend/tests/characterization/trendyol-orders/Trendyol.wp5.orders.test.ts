/**
 * WP5 (Trendyol Sipariş V2): tarih saat dilimi (orderDate GMT+3 / createdDate GMT), paymentMethod, "yalnız son 1 ay" penceresi,
 * eski uç nokta referansı kalmadığı. Gerçek ağ YOK.
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';

jest.mock('axios', () => require('../stubs/_axiosMock').axiosModuleFactory());

import Service from '@integration/modules/marketplace/trendyol/services/Service';
import { OrderConnector } from '@integration/modules/marketplace/trendyol/api/OrderConnector';
import { OrderMapper } from '@integration/modules/marketplace/trendyol/transformers/OrderTransformer';
import { TRENDYOL_ORDER_V2, orderListPacer } from '@integration/modules/marketplace/trendyol/limits';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { http, resetHttp } from '../stubs/_axiosMock';
import { v2Package, page } from '../../helpers/trendyolOrderFixtures';

const params = { clientId: 7, integrationSettings: { settings: { APIKEY: 'k', APISECRET: 's', SELLERID: '778899' }, urls: {} as any } };
const fetchOrders = (q: any) => new OrderConnector(new Service(params), params).fetchOrdersFromPlatform(q);
const urls = (): string[] => (http.get.mock.calls as any[]).map(c => c[0] as string);
const DAY = 24 * 3600 * 1000;

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    resetHttp(); ResilientHttpClient.resetAllState(); orderListPacer.reset();
});
afterEach(() => { jest.restoreAllMocks(); });

describe('OrderMapper tarih/paymentMethod (WP5)', () => {
    const map = (over: any) => new OrderMapper('7').toInternalOrderPackages([v2Package(over)])[0];
    const TRUE_UTC = Date.UTC(2026, 9, 1, 9, 0, 0); // gerçek an: 09:00Z = 12:00 TR

    it('orderDate GMT+3 kodlu => 3 sa çıkarılıp UTC\'ye çevrilir', () => {
        const o = map({ orderDate: TRUE_UTC + 3 * 3600 * 1000, createdDate: undefined });
        expect(o.order.dates.orderDate.toISOString()).toBe('2026-10-01T09:00:00.000Z');
    });

    it('orderDate yoksa createdDate (GMT) düzeltmesiz kullanılır', () => {
        const o = map({ orderDate: undefined, createdDate: TRUE_UTC });
        expect(o.order.dates.orderDate.toISOString()).toBe('2026-10-01T09:00:00.000Z');
    });

    it('paymentMethod meta\'ya açıkça taşınır', () => {
        expect((map({ paymentMethod: 'CREDIT_CARD' }).order.meta as any).paymentMethod).toBe('CREDIT_CARD');
    });
});

describe('OrderConnector son 1 ay penceresi (WP5)', () => {
    it('1 aydan eski başlangıç kırpılır; hiçbir pencere taban altına inmez', async () => {
        http.get.mockResolvedValue(page([]) as never);
        const now = Date.now();
        await fetchOrders({ startDate: now - 90 * DAY, endDate: now });
        const starts = urls().map(u => Number(new URL(u).searchParams.get('startDate')));
        expect(Math.min(...starts)).toBeGreaterThanOrEqual(now - TRENDYOL_ORDER_V2.maxLookbackMs - 5000);
        expect(Math.min(...starts)).toBeGreaterThan(now - 30 * DAY);
    });

    it('tüm aralık 1 ay öncesinde ise istek atılmaz, boş döner', async () => {
        const now = Date.now();
        await expect(fetchOrders({ startDate: now - 80 * DAY, endDate: now - 60 * DAY })).resolves.toEqual([]);
        expect(http.get).not.toHaveBeenCalled();
    });

    it('size <= 200 ve varsayılan URL V2 (/v2/orders); eski /orders yolu çağrılmaz', async () => {
        http.get.mockResolvedValue(page([]) as never);
        await fetchOrders({});
        const u = new URL(urls()[0]);
        expect(u.pathname).toMatch(/\/v2\/orders$/);
        expect(Number(u.searchParams.get('size'))).toBeLessThanOrEqual(200);
    });
});
