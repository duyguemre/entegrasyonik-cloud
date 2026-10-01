// F-09: N11 yanıt sözleşmeleri — kabul (sabit örnek) + drift (alan tipi değişmiş) testleri.
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { OrderConnector } from '@integration/modules/marketplace/n11/api/OrderConnector';
import { metricsRegistry } from '@platform/runtime/metrics';
import { observe } from '../../helpers/responseContract';
import {
    N11_ORDERS_LIST_REST, N11_ORDERS_LIST_SOAP, N11_BATCH_STATUS, N11_CATEGORIES_LIST, N11_CATEGORY_ATTRIBUTES,
} from '@integration/modules/marketplace/n11/contracts';

const rest = { totalElements: 1, content: [{ id: 1, orderNumber: 'N1', shipmentPackageStatus: 'Created', extra: true, lines: [{ orderLineId: 5, productId: 9, quantity: 2, price: '10.5', stockCode: 'SC' }] }] };
const soap = { orderList: { order: [{ orderNumber: 'N1', status: 'New', orderItemList: { orderItem: { id: '1', quantity: '2', price: '9.9', sellerStockCode: 'SC' } } }] } };
const batch = { items: [{ id: 3, status: 'COMPLETED', stockCode: 'SC', reasons: [] }] };

afterEach(() => { jest.restoreAllMocks(); });

describe('N11 yanıt sözleşmeleri', () => {
    it.each([
        ['orders.list.rest', N11_ORDERS_LIST_REST, rest],
        ['orders.list.soap', N11_ORDERS_LIST_SOAP, soap],
        ['orders.list.soap (boş liste)', N11_ORDERS_LIST_SOAP, { orderList: '' }],
        ['batch.status', N11_BATCH_STATUS, batch],
        ['categories.list (dizi)', N11_CATEGORIES_LIST, [{ id: 1, name: 'A', subCategories: [] }]],
        ['categories.list (categoryList.category tekil)', N11_CATEGORIES_LIST, { categoryList: { category: { id: 1, name: 'A' } } }],
        ['categories.attributes', N11_CATEGORY_ATTRIBUTES, { categoryAttributes: [{ attributeId: 1, attributeName: 'Renk' }] }],
    ])('kabul: %s', (_n, contract, data) => {
        const r = observe(contract, data);
        expect(r.ok).toBe(true);
        expect(r.logs).toHaveLength(0);
        expect(r.counterFields).toHaveLength(0);
    });

    it('drift: REST content dizi değil', () => {
        expect(observe(N11_ORDERS_LIST_REST, { content: {} }).fields).toEqual(['content']);
    });
    it('drift: REST sipariş no yok (kritik alan)', () => {
        expect(observe(N11_ORDERS_LIST_REST, { content: [{ id: 1 }] }).fields).toEqual(['content[].orderNumber']);
    });
    it('drift: REST kalem miktarı nesneye dönmüş; değer sızmaz', () => {
        const r = observe(N11_ORDERS_LIST_REST, { content: [{ orderNumber: 'N1', lines: [{ quantity: { v: 'PII-X' } }] }] });
        expect(r.fields).toEqual(['content[].lines[].quantity']);
        expect(r.logs[0]).toMatchObject({ integrationCode: 'n11', endpoint: 'orders.list.rest' });
        expect(JSON.stringify(r.logs)).not.toContain('PII-X');
    });
    it('drift: SOAP orderList nesne/boş dize değil', () => {
        expect(observe(N11_ORDERS_LIST_SOAP, { orderList: 5 }).fields).toEqual(['orderList']);
    });
    it('drift: batch item status yok', () => {
        expect(observe(N11_BATCH_STATUS, { items: [{ id: 1 }] }).fields).toEqual(['items[].status']);
    });
    it('drift: kategori listesi hiçbir bilinen biçimde değil', () => {
        expect(observe(N11_CATEGORIES_LIST, { foo: 1 }).fields).toEqual(['items']);
    });
    it('drift: öznitelik adı sayıya dönmüş', () => {
        expect(observe(N11_CATEGORY_ATTRIBUTES, [{ attributeId: 1, name: 7 }]).fields).toEqual(['items[].name']);
    });

    it('bağlantı: bozuk yanıt sonucu değiştirmez, sayaç artar', async () => {
        const inc = jest.spyOn(metricsRegistry, 'incCounter');
        const bad = { content: [{ id: 1 }] };
        const oc = new OrderConnector({ rest: { get: async () => bad } } as any, { clientId: 7, integrationSettings: { urls: {} } });
        expect(await oc.fetchOrdersRest({})).toBe(bad);
        const s = inc.mock.calls.filter(c => c[0] === 'integration_response_schema_mismatch').map(c => ({ labels: c[1] as Record<string, string> }));
        expect(s.map(x => x.labels.field)).toEqual(['content[].orderNumber']);
    });
});
