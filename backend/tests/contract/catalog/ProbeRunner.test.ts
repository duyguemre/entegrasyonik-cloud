// ADR-0018 Karar 2b (Aşama B) — ProbeRunner: replay modu (bulgu ÜRETMEZ, kayıtlı fikstürle sözleşme regresyon
// testi) + canlı mod kapısı (PROBES_LIVE + mock çakışması fail-fast). GERÇEK ağ isteği bu testte YOK.
import { describe, it, expect, jest } from '@jest/globals';
import { z } from 'zod';
import {
    runReplayProbes, REPLAY_FIXTURES, runProbes, assertNoLiveModeMockConflict, ProbeLiveModeConflictError,
    type ReplayFixtureEntry,
} from '@integration/compliance/ProbeRunner';
import type { IntegrationDescriptor } from '@integration/catalog/types';

describe('runReplayProbes — kayıtlı fikstürler kendi sözleşmelerine karşı doğrulanır', () => {
    it('Aşama A Trendyol sözleşmeleri (orders.list@v2, claims.list@v1) için 2 kayıtlı fikstür var, ikisi de OK', () => {
        const results = runReplayProbes();
        expect(results).toHaveLength(REPLAY_FIXTURES.length);
        expect(results.every((r) => r.ok)).toBe(true);
        expect(results.map((r) => r.contractId).sort()).toEqual(
            ['trendyol.claims.list@v1', 'trendyol.orders.list@v2'].sort(),
        );
    });

    it('fikstür şemayla UYUŞMAZSA (regresyon) ok=false + issueCodes döner (FindingService ÇAĞRILMAZ, bu yalnız saf fonksiyon)', () => {
        const badFixture: ReplayFixtureEntry = {
            integrationCode: 'trendyol', category: 'marketplace', contractId: 'fake@v1',
            schema: z.object({ mustHave: z.string() }).strict(),
            fixture: { unexpectedField: 'x' },
        };
        const results = runReplayProbes([badFixture]);
        expect(results).toEqual([{ integrationCode: 'trendyol', contractId: 'fake@v1', ok: false, issueCodes: expect.any(Array) }]);
        expect(results[0].issueCodes!.length).toBeGreaterThan(0);
    });
});

describe('runProbes — replay modu (varsayılan, PROBES_LIVE=false)', () => {
    it('processed=fikstür sayısı, failed=0, IntegrationFinding ÜRETİLMEDİ (note="replay")', async () => {
        const outcome = await runProbes({ probesLive: false });
        expect(outcome).toEqual({ processed: REPLAY_FIXTURES.length, failed: 0, note: 'replay', skipped: false });
    });

    it('fikstür bozulursa (regresyon enjekte edilirse) job outcome failed>0 döner (JobRunRegistry partial görür)', async () => {
        const badFixture: ReplayFixtureEntry = {
            integrationCode: 'trendyol', category: 'marketplace', contractId: 'fake@v1',
            schema: z.object({ mustHave: z.string() }).strict(),
            fixture: {},
        };
        const outcome = await runProbes({ probesLive: false, fixtures: [badFixture] });
        expect(outcome.processed).toBe(1);
        expect(outcome.failed).toBe(1);
    });
});

function fakeDescriptor(code: string, mockPrefix: string | undefined, probeCount = 0): IntegrationDescriptor {
    return {
        code, displayName: code, category: 'marketplace', status: 'available', adapterVersion: '1.0.0',
        protocol: 'rest', auth: { type: 'api_key_header', requiredSettings: [] },
        capabilities: {}, limitations: [], rateLimits: { configured: {}, verified: false },
        api: { hosts: [], docs: [] },
        config: { hosts: [] },
        mock: { available: !!mockPrefix, prefix: mockPrefix, contractFixtures: [] },
        contracts: [],
        probes: probeCount > 0 ? [{ id: `${code}.probe`, capability: 'categories', readOnly: true, needs: 'public' }] : undefined,
        verification: { liveApi: false, mockEnvironment: true },
    } as IntegrationDescriptor;
}

describe('assertNoLiveModeMockConflict — ADR-0018 Karar 2b "canlı mod mock ile aynı anda AÇILAMAZ"', () => {
    it('hiçbir entegrasyonun mock modu açık değilse SESSİZCE geçer', () => {
        const descriptors = [fakeDescriptor('trendyol', 'TY', 1), fakeDescriptor('n11', 'N11')];
        expect(() => assertNoLiveModeMockConflict(descriptors, () => false)).not.toThrow();
    });

    it('herhangi bir entegrasyonun mock modu açıksa fail-fast fırlatır (ProbeLiveModeConflictError)', () => {
        const descriptors = [fakeDescriptor('trendyol', 'TY', 1), fakeDescriptor('n11', 'N11')];
        expect(() => assertNoLiveModeMockConflict(descriptors, (p) => p === 'TY')).toThrow(ProbeLiveModeConflictError);
        try {
            assertNoLiveModeMockConflict(descriptors, (p) => p === 'TY');
        } catch (e: any) {
            expect(e.message).toContain('trendyol');
        }
    });

    it('mock prefix\'i olmayan entegrasyon çakışma sayılmaz', () => {
        const descriptors = [fakeDescriptor('bizimhesap', undefined)];
        expect(() => assertNoLiveModeMockConflict(descriptors, () => true)).not.toThrow();
    });
});

describe('runProbes — canlı mod (PROBES_LIVE=true)', () => {
    it('mock çakışması varsa THROW eder (runJob bunu "failed" olarak işler, IntegrationFinding YOK)', async () => {
        const descriptors = [fakeDescriptor('trendyol', 'TY', 1)];
        await expect(runProbes({ probesLive: true, descriptors, isMockEnabled: () => true }))
            .rejects.toThrow(ProbeLiveModeConflictError);
    });

    it('çakışma yoksa GERÇEK ağ isteği ATMAZ; canlı yürütücü henüz yok, "skipped" döner', async () => {
        const descriptors = [fakeDescriptor('trendyol', 'TY', 1)];
        const outcome = await runProbes({ probesLive: true, descriptors, isMockEnabled: () => false });
        expect(outcome.skipped).toBe('live_probe_pending_platform_credentials');
        expect(outcome.processed).toBe(0);
    });
});
