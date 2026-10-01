// faz4-int-wp1: Pazarama fetchOrdersFromPlatform sorguyu (müşteri/tarih verisi olabilir) console'a YAZMAZ; davranış aynı.
// INT-05: gövdeye sayfalama alanları (pageNumber/pageSize) eklendi; çağıranın pageSize'ı sayfa boyutu olarak korunur.
import { describe, it, expect, jest } from '@jest/globals';
import { OrderConnector } from '@integration/modules/marketplace/pazarama/api/OrderConnector';

describe('Pazarama OrderConnector.fetchOrdersFromPlatform', () => {
    it('sorgu içeriği log\'a sızmaz; POST gövdesi ve dönüş şekli korunur', async () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        const post = jest.fn(async (_u: string, _b: any, _o: any) => ({ data: { data: [{ orderNumber: 1 }] } }));
        const c = new OrderConnector({ post } as any, { integrationSettings: {} });
        const r = await c.fetchOrdersFromPlatform({ pageSize: 10, secretMarker: 'SIZINTI' });
        expect(r).toEqual([{ orderNumber: 1 }]);
        expect(post).toHaveBeenCalledWith('order/getOrdersForApi', { secretMarker: 'SIZINTI', pageNumber: 1, pageSize: 10 }, { idempotent: true, operation: 'fetchOrdersFromPlatform' });
        expect(JSON.stringify(log.mock.calls)).not.toContain('SIZINTI');
        log.mockRestore();
    });
});
