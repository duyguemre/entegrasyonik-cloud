/**
 * ADR-0006 Karar 2: IntegrationError sözleşmesi.
 */
import { describe, it, expect } from '@jest/globals';
import { IntegrationError, fromHttpError, redactMessage } from '@integration/modules/common/IntegrationError';

const ctx = { integrationCode: 'trendyol', operation: 'GET /orders', clientId: 7 };

describe('IntegrationError', () => {
    it('code alanına göre retryable belirler', () => {
        expect(new IntegrationError('RATE_LIMITED', 'x', ctx).retryable).toBe(true);
        expect(new IntegrationError('UNAVAILABLE', 'x', ctx).retryable).toBe(true);
        expect(new IntegrationError('UNKNOWN_OUTCOME', 'x', ctx).retryable).toBe(true);
        expect(new IntegrationError('AUTH', 'x', ctx).retryable).toBe(false);
        expect(new IntegrationError('VALIDATION', 'x', ctx).retryable).toBe(false);
        expect(new IntegrationError('NOT_FOUND', 'x', ctx).retryable).toBe(false);
        expect(new IntegrationError('NOT_SUPPORTED', 'x', ctx).retryable).toBe(false);
        expect(new IntegrationError('INTERNAL', 'x', ctx).retryable).toBe(false);
    });

    it('mesajdaki Authorization/Bearer/Basic ve pass/token/secret alanlarını temizler', () => {
        const msg = redactMessage('Auth failed: Authorization: Bearer abc.def.123 secret=topsecret token: "xyz" password=hunter2');
        expect(msg).not.toContain('abc.def.123');
        expect(msg).not.toContain('topsecret');
        expect(msg).not.toContain('xyz');
        expect(msg).not.toContain('hunter2');
    });

    it('çok uzun mesajı kısaltır', () => {
        const msg = redactMessage('x'.repeat(1000));
        expect(msg.length).toBeLessThanOrEqual(501);
    });

    it('zaten IntegrationError ise aynı nesneyi döner', () => {
        const e = new IntegrationError('AUTH', 'x', ctx);
        expect(fromHttpError(e, { ...ctx, idempotent: true })).toBe(e);
    });

    describe('fromHttpError - HTTP durum eşlemesi', () => {
        it('401/403 -> AUTH', () => {
            expect(fromHttpError({ response: { status: 401 } }, { ...ctx, idempotent: true }).code).toBe('AUTH');
            expect(fromHttpError({ response: { status: 403 } }, { ...ctx, idempotent: true }).code).toBe('AUTH');
        });
        it('404 -> NOT_FOUND', () => {
            expect(fromHttpError({ response: { status: 404 } }, { ...ctx, idempotent: true }).code).toBe('NOT_FOUND');
        });
        it('400 -> VALIDATION', () => {
            expect(fromHttpError({ response: { status: 400 } }, { ...ctx, idempotent: true }).code).toBe('VALIDATION');
        });
        it('okuma: 500 -> UNAVAILABLE', () => {
            expect(fromHttpError({ response: { status: 500 } }, { ...ctx, idempotent: true }).code).toBe('UNAVAILABLE');
        });
        it('yazma: 500 -> UNKNOWN_OUTCOME', () => {
            expect(fromHttpError({ response: { status: 500 } }, { ...ctx, idempotent: false }).code).toBe('UNKNOWN_OUTCOME');
        });
        it('yazma: timeout -> UNKNOWN_OUTCOME', () => {
            expect(fromHttpError({ code: 'ECONNABORTED', message: 'timeout' }, { ...ctx, idempotent: false }).code).toBe('UNKNOWN_OUTCOME');
        });
        it('yazma: ECONNREFUSED -> UNAVAILABLE (kesin gönderilmedi)', () => {
            expect(fromHttpError({ code: 'ECONNREFUSED' }, { ...ctx, idempotent: false }).code).toBe('UNAVAILABLE');
        });
        it('okuma: ağ hatası (ECONNRESET) -> UNAVAILABLE', () => {
            expect(fromHttpError({ code: 'ECONNRESET' }, { ...ctx, idempotent: true }).code).toBe('UNAVAILABLE');
        });
        it('circuitOpen: true ise her koşulda UNAVAILABLE + circuitOpen', () => {
            const e = fromHttpError({ isBrokenCircuitError: true }, { ...ctx, idempotent: true, circuitOpen: true });
            expect(e.code).toBe('UNAVAILABLE');
            expect(e.circuitOpen).toBe(true);
        });
        it('429 -> RATE_LIMITED', () => {
            expect(fromHttpError({ response: { status: 429 } }, { ...ctx, idempotent: true }).code).toBe('RATE_LIMITED');
        });
    });
});
