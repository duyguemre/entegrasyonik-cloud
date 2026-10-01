/**
 * YENİ DAVRANIŞ (ADR-0017 Karar 3, "JobRunRegistry"): saf yazıcı/hesaplama fonksiyonları.
 * DB YOK: `writeHistoryIfMeaningful`/`markRunning`/`markFinished` sahte modellerle test edilir.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
    deriveJobHealth, isHistoryWorthy, writeHistoryIfMeaningful, toRedactedError, truncateOutputSummary,
    resetHistoryThrottleForTests,
} from '@platform/runtime/scheduler/registry';
import { defineJob } from '@platform/runtime/scheduler/types';
import { FakeJobRunCollection } from '../../../helpers/fakeSchedulerModels';

const def = defineJob({ name: 'reg.test', everyMs: 60000, maxDurationMs: 5000, run: async () => ({}) });

describe('deriveJobHealth', () => {
    const NOW = new Date('2026-09-28T12:00:00Z');

    it('kayıt hiç yoksa ve süreç kısa süredir ayaktaysa "unknown" döner (never-ran İDDİA ETMEZ)', () => {
        expect(deriveJobHealth(null, { now: NOW, expectedIntervalMs: 60000, maxDurationMs: 5000 })).toBe('unknown');
    });

    it('kayıt yok VE süreç 2×interval\'dan uzun süredir ayaktaysa "never-ran"', () => {
        const health = deriveJobHealth(null, { now: NOW, expectedIntervalMs: 60000, maxDurationMs: 5000, processUptimeMs: 130000 });
        expect(health).toBe('never-ran');
    });

    it('runningSince dolu ve heartbeat maxDurationMs\'i aştıysa "hung"', () => {
        const state = { name: 'x', runningSince: new Date(NOW.getTime() - 10000), heartbeatAt: new Date(NOW.getTime() - 10000) };
        expect(deriveJobHealth(state, { now: NOW, expectedIntervalMs: 60000, maxDurationMs: 5000 })).toBe('hung');
    });

    it('lastFinishedAt, 2×interval+60sn\'den eskiyse "stale"', () => {
        const state = { name: 'x', lastFinishedAt: new Date(NOW.getTime() - (2 * 60000 + 61000)) };
        expect(deriveJobHealth(state, { now: NOW, expectedIntervalMs: 60000, maxDurationMs: 5000 })).toBe('stale');
    });

    it('lastFinishedAt yakın zamanlıysa "ok"', () => {
        const state = { name: 'x', lastFinishedAt: new Date(NOW.getTime() - 1000) };
        expect(deriveJobHealth(state, { now: NOW, expectedIntervalMs: 60000, maxDurationMs: 5000 })).toBe('ok');
    });

    it('günlük iş (isDaily) 1 saat ek tolerans alır', () => {
        // 2×24sa + 60dk + 60sn eskiyse hâlâ "ok" (tolerans sayesinde), 1sn fazlası "stale"
        const withinTolerance = new Date(NOW.getTime() - (2 * 86400000 + 60 * 60000));
        expect(deriveJobHealth({ name: 'x', lastFinishedAt: withinTolerance }, { now: NOW, expectedIntervalMs: 86400000, maxDurationMs: 5000, isDaily: true })).toBe('ok');

        const overTolerance = new Date(NOW.getTime() - (2 * 86400000 + 61 * 60000 + 2000));
        expect(deriveJobHealth({ name: 'x', lastFinishedAt: overTolerance }, { now: NOW, expectedIntervalMs: 86400000, maxDurationMs: 5000, isDaily: true })).toBe('stale');
    });
});

describe('toRedactedError / truncateOutputSummary', () => {
    it('mesaj 500 karakteri geçerse kesilir', () => {
        const err = new Error('x'.repeat(600));
        const redacted = toRedactedError(err);
        expect(redacted.message.length).toBe(500);
    });

    it('outputSummary 2 KB\'ı geçerse truncated:true ile özetlenir', () => {
        const big = { processed: 1, blob: 'y'.repeat(3000) };
        const out = truncateOutputSummary(big) as any;
        expect(out.truncated).toBe(true);
    });

    it('küçük outcome AYNEN döner', () => {
        const small = { processed: 5 };
        expect(truncateOutputSummary(small)).toEqual(small);
    });
});

describe('isHistoryWorthy / writeHistoryIfMeaningful', () => {
    beforeEach(() => resetHistoryThrottleForTests());

    const base = { def, trigger: 'interval' as const, startedAt: new Date(), finishedAt: new Date(), durationMs: 10, corrId: 'c1', pod: 'p1' };

    it('status=ok ve processed=0 ise (ve son 1 saatte kayıt yoksa) YİNE DE yazılır (saatlik en az bir kural)', async () => {
        const model = new FakeJobRunCollection();
        const wrote = await writeHistoryIfMeaningful(model, { ...base, status: 'ok', outcome: {} });
        expect(wrote).toBe(true);
        expect(model.docs).toHaveLength(1);
    });

    it('status=ok/processed=0 art arda (1 saat içinde) İKİNCİ kez YAZILMAZ', async () => {
        const model = new FakeJobRunCollection();
        await writeHistoryIfMeaningful(model, { ...base, status: 'ok', outcome: {}, finishedAt: new Date('2026-09-28T10:00:00Z') });
        const wrote2 = await writeHistoryIfMeaningful(model, { ...base, status: 'ok', outcome: {}, finishedAt: new Date('2026-09-28T10:05:00Z') });
        expect(wrote2).toBe(false);
        expect(model.docs).toHaveLength(1);
    });

    it('status=failed HER ZAMAN yazılır (throttle\'dan bağımsız)', async () => {
        const model = new FakeJobRunCollection();
        await writeHistoryIfMeaningful(model, { ...base, status: 'ok', outcome: {}, finishedAt: new Date('2026-09-28T10:00:00Z') });
        const wrote2 = await writeHistoryIfMeaningful(model, { ...base, status: 'failed', outcome: {}, finishedAt: new Date('2026-09-28T10:00:01Z'), error: { message: 'x' } });
        expect(wrote2).toBe(true);
        expect(model.docs).toHaveLength(2);
    });

    it('processed>0 HER ZAMAN yazılır', async () => {
        const model = new FakeJobRunCollection();
        await writeHistoryIfMeaningful(model, { ...base, status: 'ok', outcome: {}, finishedAt: new Date('2026-09-28T10:00:00Z') });
        const wrote2 = await writeHistoryIfMeaningful(model, { ...base, status: 'ok', outcome: { processed: 3 }, finishedAt: new Date('2026-09-28T10:00:01Z') });
        expect(wrote2).toBe(true);
    });

    it('isHistoryWorthy saf fonksiyon: 1 saatten eski throttle -> tekrar true', () => {
        const now = Date.now();
        expect(isHistoryWorthy({ ...base, status: 'ok', outcome: {} }, now)).toBe(true);
    });
});
