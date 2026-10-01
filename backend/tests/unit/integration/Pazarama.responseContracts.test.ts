// F-09: Pazarama yanıt sözleşmeleri — kabul (sabit örnek) + drift (alan tipi değişmiş) testleri.
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { OrderConnector } from '@integration/modules/marketplace/pazarama/api/OrderConnector';
import { metricsRegistry } from '@platform/runtime/metrics';
import { observe } from '../../helpers/responseContract';
import {
    PAZARAMA_ORDERS_LIST, PAZARAMA_BATCH_RESULT, PAZARAMA_UPDATE_BATCH_RESULT,
    PAZARAMA_CATEGORIES_LIST, PAZARAMA_CATEGORY_ATTRIBUTES,
} from '@integration/modules/marketplace/pazarama/contracts';

const orders = { success: true, data: [{ OrderNumber: 1001, Items: [{ OrderItemId: 'a', Quantity: 2, Product: { Code: 'C1' } }], newField: 1 }, { orderNumber: 'x', items: [] }] };
const batch = { data: { batchResult: [{ productCode: 'P1' }], failedProducts: [{ productCode: 'P2', errorReason: 'hata' }] } };
const upd = { data: { data: [{ code: 'P1', price: { status: 0, operationDetail: 'ok' }, operationStatusText: 'Basarili' }] } };

afterEach(() => { jest.restoreAllMocks(); });

describe('Pazarama yanıt sözleşmeleri', () => {
    it.each([
        ['orders.list (zarf)', PAZARAMA_ORDERS_LIST, orders],
        ['orders.list (dizi)', PAZARAMA_ORDERS_LIST, orders.data],
        ['batch.result', PAZARAMA_BATCH_RESULT, batch],
        ['batch.update.result', PAZARAMA_UPDATE_BATCH_RESULT, upd],
        ['categories.list', PAZARAMA_CATEGORIES_LIST, { data: [{ CategoryId: 'g1', Name: 'A' }] }],
        ['categories.list (data.categories)', PAZARAMA_CATEGORIES_LIST, { data: { categories: [{ id: 'g1', name: 'A' }] } }],
        ['categories.attributes', PAZARAMA_CATEGORY_ATTRIBUTES, { data: { categoryAttributes: [{ AttributeId: 'a', Name: 'Renk' }] } }],
    ])('kabul: %s', (_n, contract, data) => {
        const r = observe(contract, data);
        expect(r.ok).toBe(true);
        expect(r.logs).toHaveLength(0);
        expect(r.counterFields).toHaveLength(0);
    });

    it('drift: data dizi değil', () => {
        expect(observe(PAZARAMA_ORDERS_LIST, { data: 'x' }).fields).toEqual(['data']);
    });
    it('drift: sipariş no alanlarının hiçbiri yok (kritik)', () => {
        expect(observe(PAZARAMA_ORDERS_LIST, { data: [{ Items: [] }] }).fields).toEqual(['data[].OrderNumber']);
    });
    it('drift: kalem miktarı nesneye dönmüş; değer sızmaz', () => {
        const r = observe(PAZARAMA_ORDERS_LIST, { data: [{ OrderNumber: 1, Items: [{ Quantity: { v: 'PII-Y' } }] }] });
        expect(r.fields).toEqual(['data[].Items[].Quantity']);
        expect(r.logs[0]).toMatchObject({ integrationCode: 'pazarama', endpoint: 'orders.list' });
        expect(JSON.stringify(r.logs)).not.toContain('PII-Y');
    });
    it('drift: batch data nesnesi yok', () => {
        expect(observe(PAZARAMA_BATCH_RESULT, {}).fields).toEqual(['data']);
    });
    it('drift: failedProducts.errorReason sayı', () => {
        expect(observe(PAZARAMA_BATCH_RESULT, { data: { failedProducts: [{ errorReason: 3 }] } }).fields)
            .toEqual(['data.failedProducts[].errorReason']);
    });
    it('drift: update sonucunda price.status metne dönmüş + code yok', () => {
        const r = observe(PAZARAMA_UPDATE_BATCH_RESULT, { data: { data: [{ price: { status: '0' } }] } });
        expect(r.fields.sort()).toEqual(['data.data[].code', 'data.data[].price.status']);
    });
    it('drift: kategori listesi tanınmayan biçim', () => {
        expect(observe(PAZARAMA_CATEGORIES_LIST, { foo: 1 }).fields).toEqual(['items']);
    });
    it('drift: öznitelik adı sayı', () => {
        expect(observe(PAZARAMA_CATEGORY_ATTRIBUTES, { data: [{ Name: 5 }] }).fields).toEqual(['items[].Name']);
    });

    it('bağlantı: bozuk yanıt sonucu değiştirmez, sayaç artar', async () => {
        const inc = jest.spyOn(metricsRegistry, 'incCounter');
        const oc = new OrderConnector({ post: async () => ({ data: { data: [{ Items: [] }] } }) } as any, { clientId: 7, integrationSettings: { urls: {} } });
        expect(await oc.fetchOrdersFromPlatform()).toEqual([{ Items: [] }]);
        const s = inc.mock.calls.filter(c => c[0] === 'integration_response_schema_mismatch').map(c => ({ labels: c[1] as Record<string, string> }));
        expect(s.map(x => x.labels.field)).toEqual(['data[].OrderNumber']);
    });
});
