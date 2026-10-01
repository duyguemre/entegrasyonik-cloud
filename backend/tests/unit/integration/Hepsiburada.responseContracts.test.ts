// F-09: Hepsiburada yanıt sözleşmeleri — kabul (sabit örnek) + drift (alan tipi değişmiş) testleri.
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { OrderConnector } from '@integration/modules/marketplace/hepsiburada/api/OrderConnector';
import { ProductConnector } from '@integration/modules/marketplace/hepsiburada/api/ProductConnector';
import { metricsRegistry } from '@platform/runtime/metrics';
import { observe } from '../../helpers/responseContract';
import {
    HB_ORDERS_LIST, HB_BATCH_STATUS, HB_CATEGORIES_LIST, HB_CATEGORY_ATTRIBUTES,
} from '@integration/modules/marketplace/hepsiburada/contracts';

const orders = { totalCount: 1, items: [{ orderNumber: 'HB100', status: 'Open', newField: 1, lineItems: [{ merchantSku: 'S1', barcode: 'B1', quantity: 2 }] }] };
const batch = { status: 'COMPLETED', items: [{ barcode: 'B1', merchantSku: 'S1', status: 'SUCCESS', message: 'ok' }], data: [{ x: 1 }] };
const cats = { data: [{ categoryId: 10, name: 'Elektronik', parentCategoryId: 0 }], totalPages: 1 };
const attrs = { data: { baseAttributes: [{ name: 'Marka' }], attributes: [], variantAttributes: [] } };

afterEach(() => { jest.restoreAllMocks(); });

describe('Hepsiburada yanıt sözleşmeleri', () => {
    it.each([
        ['orders.list', HB_ORDERS_LIST, orders],
        ['batch.status', HB_BATCH_STATUS, batch],
        ['categories.list (data zarfı)', HB_CATEGORIES_LIST, cats],
        ['categories.list (düz dizi)', HB_CATEGORIES_LIST, cats.data],
        ['categories.attributes', HB_CATEGORY_ATTRIBUTES, attrs],
    ])('kabul: %s (bilinmeyen alan kırmaz)', (_n, contract, data) => {
        const r = observe(contract, data);
        expect(r.ok).toBe(true);
        expect(r.logs).toHaveLength(0);
        expect(r.counterFields).toHaveLength(0);
    });

    it('drift: sipariş no yok -> kritik alan sinyali', () => {
        const r = observe(HB_ORDERS_LIST, { items: [{ status: 'Open', lineItems: [] }] });
        expect(r.ok).toBe(false);
        expect(r.counterFields).toEqual(['items[].orderNumber']);
    });
    it('drift: kalem alanı tipi değişti -> sayaç + API_SCHEMA_DRIFT, değer sızmaz', () => {
        const bad = { items: [{ orderNumber: 'HB1', lineItems: [{ barcode: 12345678, quantity: { secret: 'PII-ALICI' } }] }] };
        const r = observe(HB_ORDERS_LIST, bad);
        expect(r.ok).toBe(false);
        expect(r.counterFields).toEqual(expect.arrayContaining(['items[].lineItems[].quantity', 'items[].lineItems[].barcode']));
        const log = r.logs.find(l => l.field === 'items[].lineItems[].barcode')!;
        expect(log).toMatchObject({ integrationCode: 'hepsiburada', endpoint: 'orders.list', expected: 'string' });
        expect(JSON.stringify(r.logs)).not.toContain('PII-ALICI');
    });
    it('drift: items dizi değil -> items alanı', () => {
        expect(observe(HB_ORDERS_LIST, { items: 'x' }).fields).toEqual(['items']);
    });
    it('drift: batch status sayıya dönmüş', () => {
        expect(observe(HB_BATCH_STATUS, { status: 5 }).fields).toEqual(['status']);
    });
    it('drift: kategori adı sayıya dönmüş', () => {
        expect(observe(HB_CATEGORIES_LIST, { data: [{ categoryId: 1, name: 5 }] }).fields).toEqual(['data[].name']);
    });
    it('drift: öznitelik zarfı yok', () => {
        expect(observe(HB_CATEGORY_ATTRIBUTES, {}).fields).toEqual(['data']);
    });

    it('bağlantı: bozuk yanıt istek başarısız SAYILMAZ, sonuç aynen döner; sayaç artar', async () => {
        const inc = jest.spyOn(metricsRegistry, 'incCounter');
        const params = { clientId: 7, integrationSettings: { settings: { MERCHANTID: 'm1' }, urls: {} } };
        const body = { items: [{ status: 'Open' }], totalCount: 1 };
        const oc = new OrderConnector({ get: async () => ({ data: body }) } as any, params);
        const res = await oc.fetchOrdersFromPlatform();
        expect(res).toEqual(body.items);
        const pc = new ProductConnector({ get: async () => ({ data: { status: 5 } }) } as any, params);
        expect(await pc.fetchBatchResults('t1')).toEqual({ status: 5 });
        const s = inc.mock.calls.filter(c => c[0] === 'integration_response_schema_mismatch').map(c => ({ labels: c[1] as Record<string, string> }));
        expect(s.map(x => x.labels.endpoint).sort()).toEqual(['batch.status', 'orders.list']);
    });
});
