import { describe, it, expect } from '@jest/globals';
import { getContext, getRequestId, resolveRequestId, runWithContext, enrichContext, withTestContext } from '@platform/core/context';

describe('resolveRequestId', () => {
    it('geçerli biçimli (8-64, [A-Za-z0-9_-]) gelen X-Request-Id AYNEN kullanılır', () => {
        expect(resolveRequestId('abc12345-XYZ_9')).toBe('abc12345-XYZ_9');
    });
    it('geçersiz (kısa/uzun/özel karakter/tanımsız) ise yeni bir UUID üretir', () => {
        for (const bad of [undefined, '', 'short', 'a'.repeat(65), 'has spaces here', 'ünïcode-id-değer', 123 as any]) {
            const id = resolveRequestId(bad);
            expect(id).toMatch(/^[0-9a-f-]{36}$/i);
        }
    });
});

describe('requestContext (AsyncLocalStorage)', () => {
    it('bağlam dışında getContext/getRequestId undefined döner', () => {
        expect(getContext()).toBeUndefined();
        expect(getRequestId()).toBeUndefined();
    });

    it('runWithContext içinde bağlam okunabilir; dışında sızmaz', () => {
        let seenInside: string | undefined;
        runWithContext({ requestId: 'req-1' }, () => { seenInside = getRequestId(); });
        expect(seenInside).toBe('req-1');
        expect(getRequestId()).toBeUndefined();
    });

    it('iç içe eşzamanlı bağlamlar (Promise.all) BİRBİRİNE KARIŞMAZ', async () => {
        const results = await Promise.all([1, 2, 3].map((n) => runWithContext({ requestId: `r${n}` }, async () => {
            await new Promise((r) => setTimeout(r, Math.random() * 5));
            return getRequestId();
        })));
        expect(results).toEqual(['r1', 'r2', 'r3']);
    });

    it('enrichContext: mevcut bağlamı YERİNDE genişletir (tenantId/userSub -- authenticate sonrası)', () => {
        runWithContext({ requestId: 'req-2' }, () => {
            enrichContext({ tenantId: 7, userSub: 'u1' });
            expect(getContext()).toEqual({ requestId: 'req-2', tenantId: 7, userSub: 'u1' });
        });
    });

    it('enrichContext: bağlam yokken no-op (fırlatmaz)', () => {
        expect(() => enrichContext({ tenantId: 1 })).not.toThrow();
    });

    it('withTestContext: requestId verilmezse otomatik üretir', () => {
        withTestContext({}, () => {
            expect(getRequestId()).toBeDefined();
        });
    });
});
