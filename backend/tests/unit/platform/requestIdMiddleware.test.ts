import { describe, it, expect } from '@jest/globals';
import { createRequestIdMiddleware, REQUEST_ID_HEADER } from '@api/http/requestId';
import { getRequestId } from '@platform/core/context';

function fakeReqRes(headers: Record<string, string> = {}) {
    const setHeaders: Record<string, string> = {};
    const req: any = { headers, method: 'GET', path: '/api/X' };
    const res: any = { locals: {}, setHeader: (k: string, v: string) => { setHeaders[k] = v; } };
    return { req, res, setHeaders };
}

describe('createRequestIdMiddleware', () => {
    it('X-Request-Id yoksa üretir; yanıt başlığına ve res.locals.requestId\'ye yazar; ALS bağlamında görünür', () => {
        const mw = createRequestIdMiddleware();
        const { req, res, setHeaders } = fakeReqRes();
        let seenInsideNext: string | undefined;
        mw(req, res, () => { seenInsideNext = getRequestId(); });
        expect(setHeaders[REQUEST_ID_HEADER]).toBeDefined();
        expect(res.locals.requestId).toBe(setHeaders[REQUEST_ID_HEADER]);
        expect(seenInsideNext).toBe(setHeaders[REQUEST_ID_HEADER]);
    });

    it('geçerli biçimli gelen X-Request-Id AYNEN yanıt başlığına yazılır (istemci izini sürebilsin)', () => {
        const mw = createRequestIdMiddleware();
        const { req, res, setHeaders } = fakeReqRes({ 'x-request-id': 'client-supplied-id-123' });
        mw(req, res, () => undefined);
        expect(setHeaders[REQUEST_ID_HEADER]).toBe('client-supplied-id-123');
    });

    it('geçersiz biçimli gelen X-Request-Id yok sayılır, sunucu YENİ bir id üretir', () => {
        const mw = createRequestIdMiddleware();
        const { req, res, setHeaders } = fakeReqRes({ 'x-request-id': 'kısa' });
        mw(req, res, () => undefined);
        expect(setHeaders[REQUEST_ID_HEADER]).not.toBe('kısa');
        expect(setHeaders[REQUEST_ID_HEADER]!.length).toBeGreaterThanOrEqual(8);
    });

    it('middleware DIŞINDA (next tamamlandıktan sonra) bağlam sızmaz', () => {
        const mw = createRequestIdMiddleware();
        const { req, res } = fakeReqRes();
        mw(req, res, () => undefined);
        expect(getRequestId()).toBeUndefined();
    });
});
