import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { makeFakeApp, makeReq, makeRes } from './_helpers';

// ADR-0026 Karar 4.9: musteri /api tarafindaki impersonation uclari (ApiManager ozel rotalari). RunOperation mock'lanir; DB/Redis yok.
const CTX = '/api';
const IMP = { sub: 'adm1', tid: 5, ga: true, tv: 0, imp: true, fx: true, auth_time: 1, iat: 1, exp: 2, iss: 'i', aud: 'web' };

function load(runImpl: (...a: any[]) => any) {
  const runMock = jest.fn(runImpl as any);
  let app: ReturnType<typeof makeFakeApp>;
  let AuditLogger: any;
  jest.isolateModules(() => {
    AuditLogger = require('../../../src/services/audit/AuditLogger').AuditLogger;
    jest.doMock('../../../src/api/rpc/RunOperation', () => ({ __esModule: true, default: runMock }));
    jest.doMock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));
    const { configureApis } = require('../../../src/api/rpc/ApiManager');
    app = makeFakeApp();
    configureApis(app, CTX);
  });
  return { app: app!, runMock: runMock as jest.Mock<any>, AuditLogger };
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /api/SecurityService/redeemImpersonation', () => {
  it('bileti tuketir, kimliksiz cagrilir (principal/userContext YOK) ve 60 dk omurlu imp cerezi basar; token govdede DONMEZ', async () => {
    const { app, runMock } = load(async () => ({ sessionClaims: { sub: 'adm1', tid: 5, ga: true, imp: true, tv: 0, fixedTtlSeconds: 3600 }, body: { store: { clientId: 5 } } }));
    const res = makeRes();
    await app.routes['POST /api/SecurityService/redeemImpersonation'](makeReq({ body: { ticket: 'T'.repeat(43) } }), res);
    expect(runMock.mock.calls[0].slice(0, 6)).toEqual([undefined, 'SecurityService', 'redeemImpersonation', { ticket: 'T'.repeat(43) }, undefined, expect.objectContaining({})]);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ store: { clientId: 5 } });
    expect(res.cookies).toHaveLength(1);
    expect(res.cookies[0].name).toBe('JWT_TOKEN');
    expect(res.cookies[0].options.maxAge).toBe(3600_000);
    expect(JSON.stringify(res.body)).not.toContain(res.cookies[0].value);
  });

  it('gecersiz bilet: hata yaniti, cerez basilmaz', async () => {
    const { app } = load(async () => { const e: any = new Error('x'); e.statusCode = 401; throw e; });
    const res = makeRes();
    await app.routes['POST /api/SecurityService/redeemImpersonation'](makeReq({ body: { ticket: 'x' } }), res);
    expect(res.statusCode).toBe(401);
    expect(res.cookies).toHaveLength(0);
  });

  it('jenerik rota redeem/end operasyonlarini REDDEDER (SessionResult cerezsiz sizmasin)', async () => {
    const { app, runMock } = load(async () => ({}));
    for (const op of ['redeemImpersonation', 'endImpersonation', 'REDEEMIMPERSONATION']) {
      const res = makeRes({ userContext: {}, principal: IMP });
      await app.routes['POST /api/:service/:operation'](makeReq({ params: { service: 'SecurityService', operation: op }, body: {} }), res);
      expect([op, res.statusCode]).toEqual([op, 403]);
    }
    expect(runMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/SecurityService/endImpersonation', () => {
  it('imp oturumunu bitirir: JWT_TOKEN cerezi silinir (maxAge 0)', async () => {
    const { app } = load(async () => ({}));
    const res = makeRes({ userContext: { _id: 'adm1' }, principal: IMP });
    await app.routes['POST /api/SecurityService/endImpersonation'](makeReq({ body: {} }), res);
    expect(res.statusCode).toBe(200);
    expect(res.cookies[0]).toMatchObject({ name: 'JWT_TOKEN', value: 'Signout' });
    expect(res.cookies[0].options.maxAge).toBe(0);
  });

  it('imp olmayan oturum 400; kimliksiz 401', async () => {
    const { app } = load(async () => ({}));
    const res1 = makeRes({ userContext: {}, principal: { ...IMP, imp: false } });
    await app.routes['POST /api/SecurityService/endImpersonation'](makeReq({ body: {} }), res1);
    expect(res1.statusCode).toBe(400);
    const res2 = makeRes();
    await app.routes['POST /api/SecurityService/endImpersonation'](makeReq({ body: {} }), res2);
    expect(res2.statusCode).toBe(401);
  });
});

describe('B3: destek oturumu gorunurlugu', () => {
  it('GET /userContext: imp oturumunda impersonation {active, expiresAt, reason} doner (bant sayfa yenilemesinde de cikar); normal oturumda alan YOK', async () => {
    const { app } = load(async () => ({}));
    const uc = { _id: 'adm1', name: 'Destek', surname: 'Yoneticisi', isGlobalAdmin: true, order: 5 };
    const res = makeRes({ userContext: uc, principal: { ...IMP, exp: 1_800_000_000, impReason: 'TICKET-9 destek talebi' } });
    await app.routes['GET /api/userContext'](makeReq({}), res);
    expect(res.body.impersonation).toEqual({ active: true, expiresAt: new Date(1_800_000_000_000).toISOString(), reason: 'TICKET-9 destek talebi' });
    const res2 = makeRes({ userContext: uc, principal: { ...IMP, imp: false, fx: undefined } });
    await app.routes['GET /api/userContext'](makeReq({}), res2);
    expect('impersonation' in res2.body).toBe(false);
  });

  it('endImpersonation: impersonation.end kaydi tid + onBehalfOf + gerekce ile yazilir (tenant denetiminde gorunur)', async () => {
    const { app, AuditLogger } = load(async () => ({}));
    const spy = jest.spyOn(AuditLogger, 'log').mockResolvedValue(undefined as never);
    const res = makeRes({ userContext: { _id: 'adm1' }, principal: { ...IMP, impReason: 'TICKET-9 destek talebi' } });
    await app.routes['POST /api/SecurityService/endImpersonation'](makeReq({ body: {} }), res);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ event: 'impersonation.end', sub: 'adm1', tid: 5, onBehalfOf: 5, imp: true, actorType: 'impersonator', meta: { reason: 'TICKET-9 destek talebi' } }));
  });
});
