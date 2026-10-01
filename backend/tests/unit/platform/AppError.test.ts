import { describe, it, expect } from '@jest/globals';
import { AppError, ERROR_CODES, codeForStatus, isKnownErrorCode } from '@platform/core/errors';

describe('AppError', () => {
    it('temel alanlar: message, status, statusCode alias, expose varsayılan true, code verilmezse tanımsız', () => {
        const e = new AppError('özel ileti', 404);
        expect(e.message).toBe('özel ileti');
        expect(e.status).toBe(404);
        expect(e.statusCode).toBe(404);
        expect(e.expose).toBe(true);
        expect(e.code).toBeUndefined();
        expect(e).toBeInstanceOf(Error);
    });

    it('status verilmezse 500 varsayılan', () => {
        expect(new AppError('x').status).toBe(500);
    });

    it('AppError.of(code): katalog iletisi + status + code otomatik', () => {
        const e = AppError.of('NOT_FOUND');
        expect(e.status).toBe(404);
        expect(e.code).toBe('NOT_FOUND');
        expect(e.message).toBe(ERROR_CODES.NOT_FOUND.message);
    });

    it('AppError.of: özel mesaj verilebilir, kod/status katalogdan gelir', () => {
        const e = AppError.of('VALIDATION', { message: 'alan eksik: sku' });
        expect(e.message).toBe('alan eksik: sku');
        expect(e.status).toBe(400);
        expect(e.code).toBe('VALIDATION');
    });

    it('AppError.internal: expose=false, code=INTERNAL, status=500 (ileti istemciye SIZMAMALI -- sendError bunu ayrıca maskeler)', () => {
        const e = AppError.internal('DB bağlantısı koptu (ayrıntı)');
        expect(e.expose).toBe(false);
        expect(e.code).toBe('INTERNAL');
        expect(e.status).toBe(500);
    });

    it('name = alt sınıf adı (instanceof zincirleri korunur)', () => {
        class Custom extends AppError { }
        const e = new Custom('x', 400);
        expect(e.name).toBe('Custom');
        expect(e).toBeInstanceOf(AppError);
        expect(e).toBeInstanceOf(Error);
    });
});

describe('codeForStatus', () => {
    it.each([[400, 'VALIDATION'], [401, 'UNAUTHENTICATED'], [402, 'PLAN_REQUIRED'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [409, 'CONFLICT'], [429, 'RATE_LIMITED'], [501, 'NOT_SUPPORTED'], [503, 'UNAVAILABLE'], [500, 'INTERNAL'], [502, 'INTERNAL'], [422, 'VALIDATION'], [418, 'VALIDATION']])(
        'status %d -> %s', (status, code) => {
            expect(codeForStatus(status)).toBe(code);
        });
});

describe('isKnownErrorCode', () => {
    it('katalogdaki kodlar için true, bilinmeyenler için false', () => {
        expect(isKnownErrorCode('VALIDATION')).toBe(true);
        expect(isKnownErrorCode('WEAK_PASSWORD')).toBe(true);
        expect(isKnownErrorCode('NOT_A_REAL_CODE')).toBe(false);
        expect(isKnownErrorCode(undefined)).toBe(false);
        expect(isKnownErrorCode(123)).toBe(false);
    });
});
