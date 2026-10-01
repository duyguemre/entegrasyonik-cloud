/**
 * YENİ DAVRANIŞ (ADR-0017 Karar 2.4, "mini-Sentry"): `fingerprintOfErrorEvent`, `buildErrorEventUpsertOp` (saf)
 * + `recordErrorEvent` (10 sn süreç-içi toplama -- sahte zamanlayıcı, DB YOK).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
    fingerprintOfErrorEvent, buildErrorEventUpsertOp, recordErrorEvent,
    resetErrorEventStateForTests, ErrorEventModel, ErrorEventInput,
} from '@platform/runtime/metrics/errorEvents';

describe('fingerprintOfErrorEvent', () => {
    it('source+module+code+mesaj şablonundan (rakamlar # ile) üretir', () => {
        const a = fingerprintOfErrorEvent({ source: 'server', module: 'X', code: 'C1', message: 'hata 42 oluştu' });
        const b = fingerprintOfErrorEvent({ source: 'server', module: 'X', code: 'C1', message: 'hata 99 oluştu' });
        expect(a).toBe(b); // rakamlar normalize edilir
    });

    it('source FARKLI ise fp FARKLI (client hatası server hatasıyla KARIŞMAZ)', () => {
        const a = fingerprintOfErrorEvent({ source: 'server', module: 'X', code: 'C1', message: 'aynı' });
        const b = fingerprintOfErrorEvent({ source: 'client', module: 'X', code: 'C1', message: 'aynı' });
        expect(a).not.toBe(b);
    });
});

describe('buildErrorEventUpsertOp', () => {
    const now = new Date('2026-09-28T10:00:00Z');
    const input: ErrorEventInput = { source: 'server', module: 'M', code: 'C', message: 'x'.repeat(600), stack: Array.from({ length: 40 }, (_, i) => `l${i}`).join('\n'), corrId: 'r1', tenantId: 3 };

    it('mesaj <=500 karaktere, stack <=30 satıra kesilir', () => {
        const op = buildErrorEventUpsertOp('fp1', input, 2, now);
        const setStage = op.pipeline[0].$set as any;
        expect(setStage.sample.message.length).toBe(500);
        expect(setStage.sample.stack.split('\n')).toHaveLength(30);
    });

    it('pipeline count alanını $add ile ARTIRIR (mevcut değer + incCount)', () => {
        const op = buildErrorEventUpsertOp('fp1', input, 5, now);
        const setStage = op.pipeline[0].$set as any;
        expect(setStage.count).toEqual({ $add: [{ $ifNull: ['$count', 0] }, 5] });
    });

    it('status: resolved ise open\'a DÖNER (regresyon); diğer durumlarda KORUNUR', () => {
        const op = buildErrorEventUpsertOp('fp1', input, 1, now);
        const setStage = op.pipeline[0].$set as any;
        expect(setStage.status).toEqual({ $cond: [{ $eq: ['$status', 'resolved'] }, 'open', { $ifNull: ['$status', 'open'] }] });
    });

    it('filter fp ile eşleşir; $set içinde de fp AÇIKÇA vardır (pipeline upsert filtre eşitliğini taşımaz)', () => {
        const op = buildErrorEventUpsertOp('fp1', input, 1, now);
        expect(op.filter).toEqual({ fp: 'fp1' });
        expect((op.pipeline[0].$set as any).fp).toBe('fp1');
    });
});

describe('recordErrorEvent (10 sn toplama penceresi)', () => {
    beforeEach(() => { jest.useFakeTimers(); resetErrorEventStateForTests(); });
    afterEach(() => { jest.useRealTimers(); resetErrorEventStateForTests(); });

    function fakeModel(): { model: ErrorEventModel; calls: any[] } {
        const calls: any[] = [];
        const model: ErrorEventModel = {
            findOneAndUpdate: jest.fn(async (filter, pipeline, options) => { calls.push({ filter, pipeline, options }); return {}; }) as any,
        };
        return { model, calls };
    }

    it('aynı fp 10 sn içinde N kez gelirse TEK Mongo yazımı olur (count=N)', async () => {
        const { model, calls } = fakeModel();
        recordErrorEvent({ source: 'server', module: 'M', message: 'aynı hata' }, { model });
        recordErrorEvent({ source: 'server', module: 'M', message: 'aynı hata' }, { model });
        recordErrorEvent({ source: 'server', module: 'M', message: 'aynı hata' }, { model });
        jest.advanceTimersByTime(10_000);
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        expect(calls).toHaveLength(1);
        const setStage = calls[0].pipeline[0].$set;
        expect(setStage.count).toEqual({ $add: [{ $ifNull: ['$count', 0] }, 3] });
    });

    it('farklı fp AYRI pencere/yazım açar', async () => {
        const { model, calls } = fakeModel();
        recordErrorEvent({ source: 'server', module: 'A', message: 'hata bir' }, { model });
        recordErrorEvent({ source: 'server', module: 'B', message: 'hata iki' }, { model });
        jest.advanceTimersByTime(10_000);
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        expect(calls).toHaveLength(2);
    });

    it('model.findOneAndUpdate reddederse hata YUTULUR (fırlatmaz)', async () => {
        const model: ErrorEventModel = { findOneAndUpdate: jest.fn(async () => { throw new Error('db down'); }) as any };
        expect(() => recordErrorEvent({ source: 'server', message: 'x' }, { model })).not.toThrow();
        jest.advanceTimersByTime(10_000);
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    it('recordErrorEvent kendisi ASLA fırlatmaz (geçersiz girdi bile)', () => {
        expect(() => recordErrorEvent(undefined as any)).not.toThrow();
    });
});
