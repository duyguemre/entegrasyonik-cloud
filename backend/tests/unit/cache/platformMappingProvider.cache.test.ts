// ADR-0002 adım 4 (faz4-int-wp3): PlatformMappingProvider tenant izolasyonu + yazma yolunda invalidation. DB YOK (mock).
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { PlatformMappingProvider } from '../../../src/integration/modules/provider/PlatformMappingProvider';
import { nodeCache, resetCacheForTests, configureCache, invalidateTenantCache } from '@utils/decorator/cache';

function fakeDb(rows: any[], counter: { n: number }): any {
    const q = () => ({ lean: async () => { counter.n++; return rows; } });
    return {
        getBrandModel: () => ({ find: q }),
        getCategoryModel: () => ({ find: q }),
        getAttributeMappingModel: () => ({ find: q }),
        getChoiceModel: () => ({ find: q }),
    };
}

beforeEach(() => { resetCacheForTests(); configureCache({ jitter: 0 }); });
afterAll(() => { nodeCache.flushAll(); nodeCache.close(); });

describe('PlatformMappingProvider cache', () => {
    it('tenant A ve B aynı entegrasyonda birbirinin markalarını görmez', async () => {
        const ca = { n: 0 }, cb = { n: 0 };
        const a = new PlatformMappingProvider(fakeDb([{ _id: 'a1', title: 'A-Marka' }], ca), 1, 'trendyol');
        const b = new PlatformMappingProvider(fakeDb([{ _id: 'b1', title: 'B-Marka' }], cb), 2, 'trendyol');
        expect(await a.getLocalBrandTitle('a1')).toBe('A-Marka');
        expect(await b.getLocalBrandTitle('a1')).toBe('Bilinmeyen Marka');
        expect(await b.getLocalBrandTitle('b1')).toBe('B-Marka');
        expect(ca.n).toBe(1); expect(cb.n).toBe(1);
    });

    it('yazma sonrası invalidateTenantCache 600 sn bayatlığı kırar; yalnız o tenant etkilenir', async () => {
        const ca = { n: 0 }, cb = { n: 0 };
        const rowsA = [{ _id: 'a1', title: 'Eski' }];
        const a = new PlatformMappingProvider(fakeDb(rowsA, ca), 1, 'trendyol');
        const b = new PlatformMappingProvider(fakeDb([{ _id: 'b1', title: 'B' }], cb), 2, 'trendyol');
        await a.getLocalBrandTitle('a1'); await b.getLocalBrandTitle('b1');
        rowsA[0] = { _id: 'a1', title: 'Yeni' };
        expect(await a.getLocalBrandTitle('a1')).toBe('Eski');       // bayat (TTL)
        invalidateTenantCache(1, 'PlatformMappingProvider');
        expect(await a.getLocalBrandTitle('a1')).toBe('Yeni');
        await b.getLocalBrandTitle('b1');
        expect(cb.n).toBe(1);                                          // B'nin kaydı korundu
    });

    it('boş eşleştirme listesi de cachelenir (boş tenant her çağrıda DB okumaz)', async () => {
        const c = { n: 0 };
        const p = new PlatformMappingProvider(fakeDb([], c), 3, 'trendyol');
        await p.getLocalChoices(); await p.getLocalChoices();
        expect(c.n).toBe(1);
    });
});
