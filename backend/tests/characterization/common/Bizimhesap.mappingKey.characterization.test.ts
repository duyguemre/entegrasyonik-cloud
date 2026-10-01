// faz4-db09b (ADR-0032 H1): Bizimhesap kanal dış kimliği tek anahtar `mapping`; okuma eski `mappings`'i de tanır.
import { describe, it, expect } from '@jest/globals';
import { ProductTransformer } from '@integration/modules/erp/bizimhesap/transformers/ProductTransformer';
import { platformProductId } from '@integration/modules/erp/bizimhesap/services/ProductService';

describe('Bizimhesap kanal kimliği anahtarı (DB-09b)', () => {
    it('platformProductId: `mapping` kazanır; yalnız eski `mappings` varsa onu okur; ikisi de yoksa undefined', () => {
        expect(platformProductId({ mapping: { productId: '1' }, mappings: { productId: '2' } })).toBe('1');
        expect(platformProductId({ mappings: { productId: '2' } })).toBe('2');
        expect(platformProductId({})).toBeUndefined();
        expect(platformProductId(undefined)).toBeUndefined();
    });

    it('dönüştürücü kimliği YALNIZ `mapping.productId` altına yazar (`mappings` yok)', async () => {
        const [p] = await new ProductTransformer().convertProducts([{ title: 'X', id: 42 }], undefined);
        const ch = (p.variants[0].platforms as any).bizimhesap;
        expect(ch.mapping.productId).toBe('42');
        expect(ch.mappings).toBeUndefined();
        expect(platformProductId(ch)).toBe('42');
    });
});
