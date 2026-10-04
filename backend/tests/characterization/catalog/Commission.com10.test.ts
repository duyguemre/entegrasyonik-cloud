/**
 * COM-10: ic satis fiyati = pazaryeri brut satis fiyati; komisyon dusulmez, toInternalVariant komisyon parametresi YOK.
 * Net fiyat COM-07 kesinti modeliyle okuma aninda hesaplanir (kalici alan yok). Import -> export tur testi: fiyat degismez.
 * DB/ag YOK.
 */
import { describe, it, expect } from '@jest/globals';
import { ProductMapper as TyMapper } from '@integration/modules/marketplace/trendyol/transformers/ProductTransformer';
import { ProductMapper as PzMapper } from '@integration/modules/marketplace/pazarama/transformers/ProductTransformer';
import { ProductMapper as HbMapper } from '@integration/modules/marketplace/hepsiburada/transformers/ProductTransformer';
import { PLATFORM_PROCESS } from '@interfaces/index';

const ty: any = new (TyMapper as any)({} as any);
const pz: any = new (PzMapper as any)({} as any);
const hb: any = new (HbMapper as any)();
const raw = { productMainId: 'M', title: 'T', barcode: 'B', salePrice: 118, price: 118, listPrice: 130, vatRate: 18, quantity: 1, images: [], attributes: [] };
const mapping = { catId: 1, brandId: 1, settings: {} };

describe('COM-10: ic fiyat brut', () => {
    for (const [name, m] of [['trendyol', ty], ['pazarama', pz], ['hepsiburada', hb]] as const) {
        it(`${name}: salePrice brut (118), KDV haric price 100, platform fiyati ayni`, () => {
            const v = (m as any).toInternalVariant(raw, { choices: [] });
            expect(v.prices.salePrice).toBe(118);
            expect(v.prices.price).toBeCloseTo(100);
            expect(v.platforms[Object.keys(v.platforms)[0]].prices.salePrice).toBe(118);
        });
    }
});

describe('COM-10: import -> export tur testi (fiyat degismez)', () => {
    // Ice aktarilan varyant baska bir kanala yayinlanirken platform fiyati yok -> ust duzey prices kullanilir.
    const imported = (m: any) => { const v = m.toInternalVariant(raw, { choices: [] }); return { ...v, platforms: {}, images: ['https://x/y.jpg'], product: { title: 'T', description: 'D', taxPercentage: 20 /* WP5: KDV açıkça */ } }; };
    const pub = (m: any, mode: any = PLATFORM_PROCESS.UPDATE) => m.toPlatformBatch({ payload: imported(m) } as any, mode, [], [], mapping);
    it('pazarama: yayin salePrice 118', () => { expect(pub(pz).salePrice).toBe(118); });
    it('hepsiburada: yayin fiyati 118,00', () => { expect(JSON.stringify(pub(hb))).toContain('118,00'); });
    it('trendyol: yayin salePrice 118', () => { expect(pub(ty, PLATFORM_PROCESS.UPDATE_PRICE).salePrice).toBe(118); });
});
