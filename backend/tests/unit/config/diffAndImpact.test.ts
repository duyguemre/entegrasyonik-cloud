import { describe, it, expect } from '@jest/globals';
import { computeDiff, highestDanger, computeActiveTenantsImpact } from '@integration/config/diffAndImpact';

const defs: Record<string, { danger: 'safe' | 'caution' | 'dangerous' }> = {
    a: { danger: 'safe' }, b: { danger: 'caution' }, c: { danger: 'dangerous' },
};
const getDef = (k: string) => defs[k];

describe('ADR-0020 Karar 3.2/3.3 — computeDiff', () => {
    it('yeni eklenen, değişen ve kaldırılan anahtarları raporlar; değişmeyenler atlanır', () => {
        const diff = computeDiff({ a: 1, b: 2 }, { a: 1, b: 3, c: 5 }, getDef);
        expect(diff).toEqual([
            { key: 'b', from: 2, to: 3, danger: 'caution' },
            { key: 'c', from: undefined, to: 5, danger: 'dangerous' },
        ]);
    });

    it('kataloğundan silinmiş (bulunamayan) anahtar dangerous sayılır (güvenli varsayılan)', () => {
        const diff = computeDiff({}, { orphan: 1 }, () => undefined);
        expect(diff).toEqual([{ key: 'orphan', from: undefined, to: 1, danger: 'dangerous' }]);
    });

    it('highestDanger: en yüksek tehlike seviyesini döner', () => {
        expect(highestDanger([{ key: 'a', danger: 'safe', to: 1 }])).toBe('safe');
        expect(highestDanger([{ key: 'a', danger: 'safe', to: 1 }, { key: 'b', danger: 'caution', to: 2 }])).toBe('caution');
        expect(highestDanger([{ key: 'a', danger: 'caution', to: 1 }, { key: 'b', danger: 'dangerous', to: 2 }])).toBe('dangerous');
        expect(highestDanger([])).toBe('safe');
    });
});

describe('ADR-0020 Karar 3.3 — computeActiveTenantsImpact', () => {
    it('_engine hedefinde yalnız status=ACTIVE filtresi kullanılır (entegrasyon filtresi YOK)', async () => {
        const calls: any[] = [];
        const applicationDB = { getClientModel: () => ({ countDocuments: (f: any) => { calls.push(f); return Promise.resolve(3); } }) };
        const r = await computeActiveTenantsImpact(applicationDB as any, '_engine');
        expect(calls).toEqual([{ status: 'ACTIVE' }]);
        expect(r).toEqual({ activeTenants: 3, approximate: false });
    });

    it('entegrasyon hedefinde integrations.integrationCode filtresi eklenir', async () => {
        const calls: any[] = [];
        const applicationDB = { getClientModel: () => ({ countDocuments: (f: any) => { calls.push(f); return Promise.resolve(2); } }) };
        await computeActiveTenantsImpact(applicationDB as any, 'trendyol');
        expect(calls).toEqual([{ status: 'ACTIVE', 'integrations.integrationCode': 'trendyol' }]);
    });

    it('50\'den fazla aktif tenant varsa approximate:true işaretlenir', async () => {
        const applicationDB = { getClientModel: () => ({ countDocuments: () => Promise.resolve(51) }) };
        const r = await computeActiveTenantsImpact(applicationDB as any, '_engine');
        expect(r).toEqual({ activeTenants: 51, approximate: true });
    });
});
