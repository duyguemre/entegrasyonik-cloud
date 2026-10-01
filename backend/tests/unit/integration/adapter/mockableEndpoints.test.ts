// C10c (faz4-conf-close): mock uç listesi tek kaynağı = adapterKeys.mockDefaultEndpoints ∪ env (resolveMockableEndpoints).
import { describe, it, expect } from '@jest/globals';
import { resolveMockableEndpoints } from '@integration/modules/common/mock/MockMode';
import { ADAPTER_KEYS } from '@integration/modules/adapterKeys';

describe('resolveMockableEndpoints', () => {
    const defs = ['orders', 'products'];
    it('varsayılan yoksa yalnız env (boş => hiçbiri)', () => {
        expect(resolveMockableEndpoints([], [])).toEqual([]);
        expect(resolveMockableEndpoints(['a'], [])).toEqual(['a']);
    });
    it('varsayılan varken env boşsa varsayılanlar; eski/eksik env varsayılanları DARALTMAZ (birleşim)', () => {
        expect(resolveMockableEndpoints([], defs)).toEqual(defs);
        expect(resolveMockableEndpoints(['suppliers', 'orders'], defs)).toEqual(['orders', 'products', 'suppliers']);
        expect(resolveMockableEndpoints(['+extra'], defs)).toEqual(['orders', 'products', 'extra']);
    });
    it("'!' girişi varsayılanları yok sayar (yalnız env) ve listeye sızmaz", () => {
        expect(resolveMockableEndpoints(['!', '/mockable-yok'], defs)).toEqual(['/mockable-yok']);
        expect(resolveMockableEndpoints(['!'], defs)).toEqual([]);
    });
    it('HB/Ideasoft/Bizimhesap varsayılan listeleri tanımlı; TY/Pazarama/N11 yalnız env', () => {
        const d = (c: string) => (ADAPTER_KEYS.find(k => k.code === c) as any).mockDefaultEndpoints;
        for (const c of ['hepsiburada', 'ideasoft', 'bizimhesap']) expect(d(c)?.length).toBeGreaterThan(0);
        for (const c of ['trendyol', 'pazarama', 'n11']) expect(d(c)).toBeUndefined();
    });
});
