import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

function fakeReqRes(over: { principal?: any; ip?: string } = {}) {
    const res: any = { locals: { principal: over.principal }, setHeader: jest.fn(), status: jest.fn(function (this: any) { return this; }), send: jest.fn() };
    const req: any = { headers: {}, method: 'GET', socket: { remoteAddress: over.ip ?? '10.0.0.1' }, res };
    req.res = res; // Express garantisi (bkz. modül yorumu)
    return { req, res };
}

const ENV_KEYS = ['GLOBAL_RATE_LIMIT_ENABLED', 'GLOBAL_RATE_LIMIT_MAX', 'GLOBAL_RATE_LIMIT_WINDOW_MS'];
let saved: Record<string, string | undefined> = {};

afterEach(() => {
    ENV_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
});

function load() {
    let mod: typeof import('@platform/rateLimit/globalRateLimit');
    jest.isolateModules(() => { mod = require('@platform/rateLimit/globalRateLimit'); });
    return mod!;
}

describe('createGlobalRateLimitMiddleware', () => {
    beforeEachSave();

    it('GLOBAL_RATE_LIMIT_ENABLED=false: no-op (her istek geçer, limitlenmez)', () => {
        process.env.GLOBAL_RATE_LIMIT_ENABLED = 'false';
        const { createGlobalRateLimitMiddleware } = load();
        const mw = createGlobalRateLimitMiddleware();
        for (let i = 0; i < 50; i++) {
            const { req, res } = fakeReqRes();
            const next = jest.fn();
            mw(req, res, next);
            expect(next).toHaveBeenCalledTimes(1);
        }
    });

    it('varsayılan aktif: max aşılınca 429 döner, altındaysa geçer', () => {
        process.env.GLOBAL_RATE_LIMIT_ENABLED = 'true';
        process.env.GLOBAL_RATE_LIMIT_MAX = '3';
        process.env.GLOBAL_RATE_LIMIT_WINDOW_MS = '60000';
        const { createGlobalRateLimitMiddleware } = load();
        const mw = createGlobalRateLimitMiddleware();
        const { req, res } = fakeReqRes({ ip: '10.0.0.2' });
        for (let i = 0; i < 3; i++) {
            const next = jest.fn();
            mw(req, res, next);
            expect(next).toHaveBeenCalledTimes(1);
        }
        const next4 = jest.fn();
        mw(req, res, next4);
        expect(next4).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(429);
    });

    it('kimlikli istek tenantId:userSub anahtarıyla sınırlanır (IP\'den BAĞIMSIZ -- aynı tenant farklı IP\'den de aynı kovayı paylaşır)', () => {
        process.env.GLOBAL_RATE_LIMIT_ENABLED = 'true';
        process.env.GLOBAL_RATE_LIMIT_MAX = '2';
        process.env.GLOBAL_RATE_LIMIT_WINDOW_MS = '60000';
        const { createGlobalRateLimitMiddleware } = load();
        const mw = createGlobalRateLimitMiddleware();
        const principal = { sub: 'user-1', tid: 5 };
        const a = fakeReqRes({ principal, ip: '1.1.1.1' });
        const b = fakeReqRes({ principal, ip: '2.2.2.2' });
        mw(a.req, a.res, jest.fn());
        mw(b.req, b.res, jest.fn()); // farklı IP ama AYNI principal -> aynı kova
        const third = jest.fn();
        mw(a.req, a.res, third);
        expect(third).not.toHaveBeenCalled();
        expect(a.res.status).toHaveBeenCalledWith(429);
    });

    it('kimliksiz istekler IP bazlı ayrı kovalara düşer (bir IP\'nin limiti diğerini etkilemez)', () => {
        process.env.GLOBAL_RATE_LIMIT_ENABLED = 'true';
        process.env.GLOBAL_RATE_LIMIT_MAX = '1';
        process.env.GLOBAL_RATE_LIMIT_WINDOW_MS = '60000';
        const { createGlobalRateLimitMiddleware } = load();
        const mw = createGlobalRateLimitMiddleware();
        const a = fakeReqRes({ ip: '3.3.3.3' });
        const b = fakeReqRes({ ip: '4.4.4.4' });
        const nextA = jest.fn(); const nextB = jest.fn();
        mw(a.req, a.res, nextA);
        mw(b.req, b.res, nextB);
        expect(nextA).toHaveBeenCalledTimes(1);
        expect(nextB).toHaveBeenCalledTimes(1);
    });
});

function beforeEachSave() {
    beforeEach(() => {
        saved = {};
        ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
    });
}
