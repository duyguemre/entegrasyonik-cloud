// [eslesme-fiyat WP5] İçe aktarılan yeni varyantın kanal fiyatı PriceHistory'ye `source:'import'` yazılır (best-effort). DB YOK.
import { describe, it, expect, jest } from '@jest/globals';
import Importer from '@integration/engine/catalog/import/Importer';

describe('Importer.recordImportPriceHistory', () => {
    it('observed kanal fiyatı (yoksa ana fiyat) ile import kaydı; geçersiz fiyat atlanır; sağlayıcı yoksa no-op', async () => {
        const insertMany = jest.fn(async () => undefined);
        const imp: any = new (Importer as any)({ getPriceHistoryModel: () => ({ insertMany }) });
        await imp.recordImportPriceHistory([
            { _id: 'v1', barcode: 'B1', prices: { salePrice: 50 }, platforms: { trendyol: { observed: { salePrice: 120, marketPrice: 150 } } } },
            { _id: 'v2', barcode: 'B2', prices: { salePrice: 0 }, platforms: { n11: {} } },
        ]);
        expect(insertMany).toHaveBeenCalledTimes(1);
        expect((insertMany.mock.calls[0] as any)[0]).toEqual([expect.objectContaining({ integrationCode: 'trendyol', variantId: 'v1', salePrice: 120, listPrice: 150, source: 'import' })]);
        const none: any = new (Importer as any)({});
        await expect(none.recordImportPriceHistory([{ _id: 'v' }])).resolves.toBeUndefined();
        const failing: any = new (Importer as any)({ getPriceHistoryModel: () => ({ insertMany: async () => { throw new Error('db'); } }) });
        await expect(failing.recordImportPriceHistory([{ _id: 'v1', platforms: { n11: { observed: { salePrice: 1 } } } }])).resolves.toBeUndefined();
    });
});
