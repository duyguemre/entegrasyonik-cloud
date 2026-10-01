/**
 * [F-06 / BACKOFFICE_PLAN §2.9 L1] Yapılandırılmış olay log'u: alan şeması (ts, level, source, code, errorClass, tenantId,
 * integrationCode, operation, correlationId, durationMs, msg, fingerprint), bağlamdan alan taşıma ve fingerprint kararlılığı.
 * Gerçek pino (mock yok); çıktı process.stdout JSON satırlarından yakalanır (tests/helpers/logCapture.ts).
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { eventLog, computeFingerprint, messageTemplate, classifyError } from '@platform/core/logger';
import { runWithContext, runWithJobContext, withContextPatch } from '@platform/core/context';
import { captureLogs, LogCapture } from '../../helpers/logCapture';

let cap: LogCapture;
beforeEach(() => { cap = captureLogs(); });
afterEach(() => { cap.restore(); });

describe('eventLog: alan şeması (LogEvents uyumu)', () => {
    it('tüm şema alanları tek satırda: ts, level, source, code, tenantId, integrationCode, operation, durationMs, msg, fingerprint', () => {
        const log = eventLog('worker', 'Publisher');
        log.info('PUBLISHER_STARTED', 'Batch 42 basladi', { tenantId: 7, integrationCode: 'trendyol', operation: 'export.Publisher', durationMs: 12 });
        const l = cap.lines[0];
        expect(l).toMatchObject({
            level: 'info', source: 'worker', code: 'PUBLISHER_STARTED', msg: 'Batch 42 basladi',
            tenantId: 7, integrationCode: 'trendyol', operation: 'export.Publisher', durationMs: 12, module: 'Publisher',
        });
        expect(typeof l.fingerprint).toBe('string');
        expect(l.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    });

    it('bağlam varken ts (ISO) + correlationId eklenir; yoksa correlationId alanı YOK', () => {
        const log = eventLog('engine');
        log.info('NO_CTX', 'baglamsiz');
        expect(cap.lines[0].correlationId).toBeUndefined();
        runWithContext({ requestId: 'req-corr-0001', tenantId: 5 }, () => log.info('WITH_CTX', 'baglamli'));
        const l = cap.lines[1];
        expect(l.correlationId).toBe('req-corr-0001');
        expect(l.reqId).toBe('req-corr-0001'); // geriye uyum
        expect(l.tenantId).toBe(5); // bağlamdan
        expect(String(l.ts)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('bağlamdaki integrationCode/operation/source log satırına akar; açık alan bağlamı EZER', () => {
        const log = eventLog('adapter-trendyol');
        withContextPatch({ integrationCode: 'n11', operation: 'ctx.op', source: 'worker', tenantId: 1 }, () => {
            log.info('CTX_FIELDS', 'a');
            log.info('EXPLICIT', 'b', { integrationCode: 'trendyol', operation: 'own.op' });
        });
        expect(cap.lines[0]).toMatchObject({ integrationCode: 'n11', operation: 'ctx.op', tenantId: 1, source: 'adapter-trendyol' });
        expect(cap.lines[1]).toMatchObject({ integrationCode: 'trendyol', operation: 'own.op' });
    });

    it('level: debug/info/warn/error adı olarak yazılır', () => {
        const log = eventLog('api');
        log.debug('D', 'd'); log.info('I', 'i'); log.warn('W', 'w'); log.error('E', 'e');
        expect(cap.lines.map((l) => l.level)).toEqual(['debug', 'info', 'warn', 'error']);
    });
});

describe('eventLog: errorClass (IntegrationError türleri)', () => {
    it('IntegrationError -> errorClass = err.code; err{type,code,message} serileşir', () => {
        class IntegrationError extends Error { code = 'RATE_LIMITED'; constructor(m: string) { super(m); this.name = 'IntegrationError'; } }
        eventLog('adapter-n11').warn('CALL_FAILED', 'cagri basarisiz', { err: new IntegrationError('429') });
        expect(cap.lines[0].errorClass).toBe('RATE_LIMITED');
        expect(cap.lines[0].err).toMatchObject({ type: 'IntegrationError', message: '429' });
    });

    it('Error doğrudan verilirse (ikinci argüman) err + errorClass türetilir; jenerik hata -> name', () => {
        eventLog('worker').error('BOOM', 'patladi', new TypeError('x'));
        expect(cap.lines[0]).toMatchObject({ errorClass: 'TypeError', level: 'error' });
        expect(classifyError(new RangeError('r'))).toBe('RangeError');
        expect(classifyError(undefined)).toBeUndefined();
    });

    it('açık errorClass alanı türetmeyi ezer', () => {
        eventLog('worker').warn('X', 'x', { errorClass: 'CUSTOM', err: new Error('e') });
        expect(cap.lines[0].errorClass).toBe('CUSTOM');
    });
});

describe('fingerprint kararlılığı (source + code + mesaj şablonu)', () => {
    it('aynı hata farklı sayı/UUID/ObjectId ile AYNI parmak izi', () => {
        const a = computeFingerprint('worker', 'PUB_FAIL', 'Batch 42 basarisiz (tenant 7)');
        const b = computeFingerprint('worker', 'PUB_FAIL', 'Batch 9001 basarisiz (tenant 123)');
        const c = computeFingerprint('worker', 'PUB_FAIL', 'Batch 507f1f77bcf86cd799439011 basarisiz (tenant 7)'.replace('507f1f77bcf86cd799439011', '42'));
        expect(a).toBe(b);
        expect(a).toBe(c);
        expect(computeFingerprint('worker', 'X', 'job 550e8400-e29b-41d4-a716-446655440000 bitti'))
            .toBe(computeFingerprint('worker', 'X', 'job 6ba7b810-9dad-11d1-80b4-00c04fd430c8 bitti'));
        expect(computeFingerprint('worker', 'X', 'obj 507f1f77bcf86cd799439011 tamam'))
            .toBe(computeFingerprint('worker', 'X', 'obj 65a1b2c3d4e5f6a7b8c9d0e1 tamam'));
    });

    it('farklı code, source ya da şablon FARKLI parmak izi; boşluk farkı önemsiz', () => {
        const base = computeFingerprint('worker', 'A', 'mesaj');
        expect(computeFingerprint('worker', 'B', 'mesaj')).not.toBe(base);
        expect(computeFingerprint('engine', 'A', 'mesaj')).not.toBe(base);
        expect(computeFingerprint('worker', 'A', 'baska mesaj')).not.toBe(base);
        expect(computeFingerprint('worker', 'A', '  mesaj  ')).toBe(base);
    });

    it('messageTemplate: sayılar # ve kimlikler <id>/<uuid> olur', () => {
        expect(messageTemplate('Batch 42 / 5000')).toBe('Batch # / #');
        expect(messageTemplate('id 507f1f77bcf86cd799439011')).toBe('id <id>');
    });

    it('log satırındaki fingerprint aynı olayın tekrarında aynıdır (farklı sayılarla)', () => {
        const log = eventLog('worker', 'Stager');
        log.info('STAGER_DONE', 'Stager finished for job 1');
        log.info('STAGER_DONE', 'Stager finished for job 222');
        expect(cap.lines[0].fingerprint).toBe(cap.lines[1].fingerprint);
    });

    it('logger.error (eventLog dışı) da fingerprint taşır', () => {
        const { logger } = require('@platform/core/logger');
        logger.child({ module: 'M' }).error({ code: 'ERR_X' }, 'hata 5');
        const l = cap.lines.find((x) => x.level === 'error')!;
        expect(l.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    });
});

describe('iş bağlamı', () => {
    it('runWithJobContext: her iş YENİ id alır; verilen correlationId aynen korunur', () => {
        const ids: string[] = [];
        for (let i = 0; i < 2; i++) runWithJobContext({ source: 'worker', operation: 'order.sync' }, () => { eventLog('worker').info('J', 'j'); });
        runWithJobContext({ source: 'worker', correlationId: 'carried-id-0001' }, () => { eventLog('worker').info('J', 'j'); });
        cap.lines.forEach((l) => ids.push(String(l.correlationId)));
        expect(ids[0]).toMatch(/^job-/);
        expect(ids[0]).not.toBe(ids[1]);
        expect(ids[2]).toBe('carried-id-0001');
        expect(cap.lines[0]).toMatchObject({ operation: 'order.sync' });
    });
});
