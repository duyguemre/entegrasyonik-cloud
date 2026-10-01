import { describe, it, expect } from '@jest/globals';
import { redactLogObject } from '@platform/core/logger/redact';

describe('redactLogObject', () => {
    it('bilinen sır anahtarlarını [REDACTED] yapar (ADR-0003 D.17 tek liste)', () => {
        const out = redactLogObject({ user: 'a', password: 'x', nested: { apiSecret: 'y' } });
        expect(out).toEqual({ user: 'a', password: '[REDACTED]', nested: { apiSecret: '[REDACTED]' } });
    });

    it('axios benzeri hata nesnesinden config/request ATILIR, response.data KESİLİR', () => {
        const axiosErr = {
            isAxiosError: true, message: 'Request failed', name: 'AxiosError', code: 'ERR_BAD_REQUEST',
            config: { headers: { Authorization: 'Bearer secret-token' }, url: 'https://x' },
            request: { path: '/x' },
            response: { status: 400, statusText: 'Bad Request', data: 'x'.repeat(600) },
        };
        const out: any = redactLogObject(axiosErr);
        expect(out.config).toBeUndefined();
        expect(out.request).toBeUndefined();
        expect(out.response.status).toBe(400);
        expect(out.response.data.length).toBeLessThanOrEqual(501);
        expect(JSON.stringify(out)).not.toContain('secret-token');
    });

    it('enc:v1: ile başlayan şifreli değerler redakte edilir', () => {
        const out: any = redactLogObject({ secretField: 'enc:v1:k1:abc:def:ghi' });
        expect(out.secretField).toBe('[REDACTED]');
    });

    it('girdi (orijinal nesne) DEĞİŞTİRİLMEZ (immutable)', () => {
        const input = { password: 'x' };
        redactLogObject(input);
        expect(input.password).toBe('x');
    });

    it('primitive/null değerleri olduğu gibi döner', () => {
        expect(redactLogObject(null as any)).toBeNull();
        expect(redactLogObject(5 as any)).toBe(5);
        expect(redactLogObject('plain' as any)).toBe('plain');
    });
});
