import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

function fakeReqRes() {
    const headers: Record<string, string | string[] | number> = {};
    const req: any = { headers: {}, method: 'GET', url: '/health' };
    const res: any = {
        setHeader: (k: string, v: any) => { headers[k] = v; },
        getHeader: (k: string) => headers[k],
        removeHeader: (k: string) => { delete headers[k]; },
        // helmet checks res.statusCode/writableEnded sometimes; sağlanır
        statusCode: 200,
    };
    return { req, res, headers };
}

describe('createSecurityHeadersMiddleware (helmet)', () => {
    afterEach(() => { delete process.env.NODE_ENV; delete process.env.APP_ENV; });

    it('temel güvenlik başlıklarını ekler: x-powered-by yok, X-Frame-Options=DENY, X-Content-Type-Options=nosniff', () => {
        const { createSecurityHeadersMiddleware } = require('@api/http/securityHeaders');
        const mw = createSecurityHeadersMiddleware();
        const { req, res, headers } = fakeReqRes();
        mw(req, res, () => undefined);
        expect(headers['X-Frame-Options']).toBe('DENY');
        expect(headers['X-Content-Type-Options']).toBe('nosniff');
        expect(headers['X-Powered-By']).toBeUndefined();
    });

    it('CSP Report-Only olarak eklenir (Content-Security-Policy DEĞİL, Content-Security-Policy-Report-Only)', () => {
        const { createSecurityHeadersMiddleware } = require('@api/http/securityHeaders');
        const mw = createSecurityHeadersMiddleware();
        const { req, res, headers } = fakeReqRes();
        mw(req, res, () => undefined);
        expect(headers['Content-Security-Policy-Report-Only']).toBeDefined();
        expect(headers['Content-Security-Policy']).toBeUndefined();
    });

    it('local/staging (APP_ENV != production): Strict-Transport-Security YOK (http geliştirme kırılmasın)', () => {
        process.env.APP_ENV = 'local';
        jest.isolateModules(() => {
            const { createSecurityHeadersMiddleware } = require('@api/http/securityHeaders');
            const mw = createSecurityHeadersMiddleware();
            const { req, res, headers } = fakeReqRes();
            mw(req, res, () => undefined);
            expect(headers['Strict-Transport-Security']).toBeUndefined();
        });
    });

    it('production (APP_ENV=production): Strict-Transport-Security eklenir', () => {
        process.env.APP_ENV = 'production';
        jest.isolateModules(() => {
            const { createSecurityHeadersMiddleware } = require('@api/http/securityHeaders');
            const mw = createSecurityHeadersMiddleware();
            const { req, res, headers } = fakeReqRes();
            mw(req, res, () => undefined);
            expect(headers['Strict-Transport-Security']).toBeDefined();
        });
    });

    it('next() çağrılır (isteği engellemez)', () => {
        const { createSecurityHeadersMiddleware } = require('@api/http/securityHeaders');
        const mw = createSecurityHeadersMiddleware();
        const { req, res } = fakeReqRes();
        const next = jest.fn();
        mw(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });
});
