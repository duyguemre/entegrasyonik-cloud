/**
 * COM-01: Trendyol commissions.json şema/tutarlılık + sessiz %0 kuralı + kaynak/bayatlık üst verisi.
 * DB/ağ YOK (yalnız statik JSON).
 */
import { describe, it, expect } from '@jest/globals';
import commissions from '@integration/modules/marketplace/trendyol/commissions.json';
import meta from '@integration/modules/marketplace/trendyol/commissions.meta.json';
import { PlatformMappingProvider } from '@integration/modules/provider/PlatformMappingProvider';
import { CategoryService } from '@integration/modules/marketplace/trendyol/services/CategoryService';

const all: any[] = [];
const walk = (nodes: any[], parent: any | null) => nodes.forEach(n => { all.push({ n, parent }); walk(n.childrenCategories ?? [], n); });
walk(commissions as any[], null);

describe('Trendyol commissions.json şeması (COM-01)', () => {
    it('id benzersiz, parentId ağaçla tutarlı', () => {
        expect(new Set(all.map(x => x.n.id)).size).toBe(all.length);
        for (const { n, parent } of all) expect(n.parentId).toBe(parent ? parent.id : null);
    });
    it('commission sayı veya null; sessiz %0 yok (yalnız null = bilinmiyor)', () => {
        for (const { n } of all) {
            expect(n.commission === null || (typeof n.commission === 'number' && n.commission > 0 && n.commission <= 50)).toBe(true);
        }
    });
    it('KA1/KA2 dolu düğümde kademeler temel orandan büyük değil ve KA1 <= KA2', () => {
        for (const { n } of all.filter(x => x.n.ka1 || x.n.ka2)) {
            expect(n.ka1.commission).toBeLessThanOrEqual(n.ka2.commission);
            expect(n.ka2.commission).toBeLessThanOrEqual(n.commission);
        }
    });
    it('Dijital Destek Kartı (4984): eski sessiz %0 artık null -> sağlayıcı null döner', async () => {
        const p = new PlatformMappingProvider({} as any, 'c-com01', 'trendyol');
        expect(await p.getCategoryCommission(4984)).toBeNull();
        const r: any = await new CategoryService({ clientId: 'c-com01' }, {} as any).fetchCategoryCommission('4984');
        expect(r.commission).toBeNull();
    });
});

describe('commissions.meta.json (COM-01)', () => {
    it('asOf ISO tarih, kaynak dolu, vatIncluded bilinmiyor=null (uydurma yok)', () => {
        expect(meta.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(meta.source.length).toBeGreaterThan(0);
        expect(meta.vatIncluded).toBeNull();
        expect(meta.sourceConfidence).toBe('unverified');
    });
    it('fetchCategoryCommission meta döndürür', async () => {
        const r: any = await new CategoryService({ clientId: 'c-com01' }, {} as any).fetchCategoryCommission('368');
        expect(r.meta.asOf).toBe(meta.asOf);
        expect(r.commission).toBe(25);
    });
});
