import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

// Characterization: backend/src/api/RunOperation.ts (+ ApiWrapper.ts)
// Servis kayıt defteri (src/api/index.ts) sahte bir servis kümesiyle değiştirilir; DB/Redis yok.

const calls: any[] = [];

class FakeService {
  constructor(public clientId: any, public request: any) { calls.push({ clientId, request }); }
  async init() { calls.push({ init: true }); }
  async echo() { return { clientId: this.clientId, request: this.request }; }
  async sensitiveHelper() { return 'helper-called'; } // "iç" yardımcı; ADR-0001 adım 5'ten sonra kayıtta olmadığı için RPC ile ÇAĞRILAMAZ
}

// [ADR-0001 adım 5] Jenerik RPC artık yalnızca OPERATION_POLICY kaydındaki operasyonları çağırır (varsayılan ret).
// Bu testler sahte servislerle çalıştığından, izole modül kaydına sahte servisler için kayıt eklenir (gerçek kayıt
// operation-policy.test.ts'te sınanır). `echo`/`selectStore` üye kademesindedir; `sensitiveHelper`/`init`/`nope` KAYITTA YOKTUR.
const PR = { sub: 'u1', tid: 1, ga: false, tv: 0, imp: false }; // doğrulanmış (member kademesi) principal

function loadRun(apis: any = { FakeService }, extraPolicy: Record<string, Record<string, string>> = {}) {
  let run: any;
  jest.isolateModules(() => {
    jest.doMock('../../../src/api/index', () => ({ __esModule: true, default: apis }));
    const policy = require('../../../src/api/operationPolicy');
    Object.assign(policy.OPERATION_POLICY, {
      FakeService: { echo: 'member' },
      Late: { echo: 'member' },
      Broken: { echo: 'member' },
      Boom: { x: 'member' },
      SecurityService: { selectStore: 'member' },
      ...extraPolicy,
    });
    run = require('../../../src/api/RunOperation').default;
  });
  return run as (userContext: any, service: string, operation: string, request: any, principal?: any) => Promise<any>;
}

beforeEach(() => { calls.length = 0; });

describe('RunOperation: bilinmeyen servis', () => {
  it('[ADR-0001 adım 5] bilinmeyen servis artık 403 Forbidden FIRLATIR (eskiden { error: "entegrayonik api tanımlı değil", _status: 400 } nesnesi dönerdi); servis örneklenmez', async () => {
    const run = loadRun();
    await expect(run({ order: 1 }, 'NoSuchService', 'echo', {}, PR)).rejects.toMatchObject({ message: 'Forbidden', statusCode: 403 });
    expect(calls).toHaveLength(0); // hiçbir servis örneklenmedi
  });

  it('[ADR-0001 adım 5] servis adı büyük/küçük harf duyarlıdır: "fakeservice" kayıtta yok -> 403 (eskiden 400 gövdesi)', async () => {
    const run = loadRun();
    await expect(run({ order: 1 }, 'fakeservice', 'echo', {}, PR)).rejects.toMatchObject({ statusCode: 403 });
    expect(calls).toHaveLength(0);
  });

  it('[ADR-0001 adım 5] kayıtta olsa bile servis kayıt defterinde (Apis) yoksa: 403; servis kaydı ilk çağrıda bir kez hazırlanır, sonradan eklenen servis görülmez', async () => {
    const apis: any = { FakeService };
    const run = loadRun(apis);
    await run({ order: 1 }, 'FakeService', 'echo', {}, PR);
    apis.Late = FakeService;
    await expect(run({ order: 1 }, 'Late', 'echo', {}, PR)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('[ADR-0001 adım 5] null/undefined (falsy) servis sınıfı kayıt sırasında atlanır -> 403', async () => {
    const run = loadRun({ FakeService, Broken: undefined });
    await expect(run({ order: 1 }, 'Broken', 'echo', {}, PR)).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('RunOperation: tenant kimliği ve istek zenginleştirme', () => {
  it('[ADR-0001 adım 4] clientId = userContext.order; userContext artık authenticate middleware\'inin DOĞRULANMIŞ tid\'inden kurduğu sunucu bağlamıdır (eskiden imzasız token payload\'ı); request\'e userContext eklenir', async () => {
    const run = loadRun();
    const uc = { order: 7, _id: 'u1' };
    const resp = await run(uc, 'FakeService', 'echo', { a: 1 }, PR);
    expect(resp.clientId).toBe(7);
    // ADR-0024 P1-CORE: tipli bağlam (ctx) eklenir; userContext/principal geriye uyumlu kalır
    expect(resp.request).toEqual({ a: 1, userContext: uc, principal: PR, ctx: expect.objectContaining({ actor: expect.objectContaining({ sub: 'u1', tid: 1, tokenVersion: 0, actorType: 'user' }) }) });
  });

  it('[ADR-0001 adım 5] principal YOKSA kayıttaki operasyon 401 ile reddedilir ve servis çağrılmaz (eskiden userContext\'siz de çalışırdı; kimliksiz erişimi ApiManager/middleware zaten keser, bu ikinci savunma hattıdır)', async () => {
    const run = loadRun();
    await expect(run(undefined, 'FakeService', 'echo', { a: 1 })).rejects.toMatchObject({ statusCode: 401 });
    expect(calls).toHaveLength(0);
  });

  it('[MEVCUT DAVRANIŞ] açık operasyonlar (logout) userContext/principal olmadan çalışır: clientId undefined, request.userContext undefined; politika kaydına takılmaz', async () => {
    class SecurityService { constructor(public c: any, public r: any) {} async init() {} async logout() { return { clientId: this.c, request: this.r }; } }
    const run = loadRun({ SecurityService });
    const resp = await run(undefined, 'SecurityService', 'logout', { a: 1 });
    expect(resp.clientId).toBeUndefined();
    expect(resp.request).toEqual({ a: 1, userContext: undefined, principal: undefined });
  });

  it('[MEVCUT DAVRANIŞ] userContext.order tip dönüşümü yapılmadan aktarılır (string "abc" da olduğu gibi gider; tid tamsayılığı Security.verifyToken\'da zorunlu)', async () => {
    const run = loadRun();
    const resp = await run({ order: 'abc' }, 'FakeService', 'echo', {}, PR);
    expect(resp.clientId).toBe('abc');
  });

  it('[MEVCUT DAVRANIŞ] istemci verili "userContext" alanı sunucu tarafındaki userContext ile EZİLİR', async () => {
    const run = loadRun();
    const resp = await run({ order: 2 }, 'FakeService', 'echo', { userContext: { order: 999, isGlobalAdmin: true } }, PR);
    expect(resp.request.userContext).toEqual({ order: 2 });
  });

  it('[ADR-0001 adım 5] userContext yok ama principal var (member): istemci "userContext" alanı yine undefined ile ezilir (gövdeden isGlobalAdmin sızmaz)', async () => {
    const run = loadRun();
    const resp = await run(undefined, 'FakeService', 'echo', { userContext: { isGlobalAdmin: true } }, PR);
    expect(resp.request.userContext).toBeUndefined();
  });

  it('[ADR-0001 adım 4] gövdedeki "order" ve "clientId" alanları YOK SAYILIR: tenant yalnızca userContext.order\'dan (eskiden gövde alanları servise aynen giderdi)', async () => {
    const run = loadRun();
    const resp = await run({ order: 2 }, 'FakeService', 'echo', { order: 999, clientId: 999, keep: 1 }, PR);
    expect(resp.clientId).toBe(2);
    expect(resp.request.order).toBeUndefined();
    expect(resp.request.clientId).toBeUndefined();
    expect(resp.request.keep).toBe(1);
  });

  it('[ADR-0001 adım 4] gövdedeki "principal" alanı ezilir: servise yalnızca doğrulanmış principal gider (sahte gövde ga:true yetki vermez: kademe doğrulanmış principal\'dan)', async () => {
    const run = loadRun();
    const forged = { ga: true, sub: 'x' };
    const real = { ga: false, sub: 'u1', tid: 1, tv: 0, imp: false };
    expect((await run({ order: 1 }, 'FakeService', 'echo', { principal: forged }, real)).request.principal).toBe(real);
  });

  it('[ADR-0001 adım 4] userContext YOKKEN gövdedeki order/clientId da tenant olamaz: clientId undefined', async () => {
    const run = loadRun();
    const resp = await run(undefined, 'FakeService', 'echo', { order: 5, clientId: 5 }, PR);
    expect(resp.clientId).toBeUndefined();
  });

  it('[ADR-0001 adım 4] tek istisna: SecurityService.selectStore hedef mağazayı gövdedeki clientId ile bildirir (işlem parametresi; tenant kimliği değil, yetki serviste ga ile denetlenir)', async () => {
    class SecurityService { constructor(public c: any, public r: any) {} async init() {} async selectStore() { return { clientId: this.c, request: this.r }; } }
    // [ADR-0001 adım 5] gerçek kayıtta selectStore = platformAdmin; burada yalnızca gövde-clientId davranışını sınamak için member'a indirilmiş sahte kayıt
    const run = loadRun({ SecurityService });
    const resp = await run({ order: 2 }, 'SecurityService', 'selectStore', { clientId: 12, order: 99 }, PR);
    expect(resp.clientId).toBe(2); // tenant hâlâ userContext'ten
    expect(resp.request.clientId).toBe(12);
    expect(resp.request.order).toBeUndefined();
  });

  it('[MEVCUT DAVRANIŞ] request null/undefined ise {} gibi yayılır (spread)', async () => {
    const run = loadRun();
    const resp = await run({ order: 1 }, 'FakeService', 'echo', undefined, PR);
    expect(resp.request).toEqual({ userContext: { order: 1 }, principal: PR, ctx: expect.objectContaining({ actor: expect.objectContaining({ sub: 'u1' }) }) });
  });

  it('[MEVCUT DAVRANIŞ] sıra: örnekle -> init() -> operasyon', async () => {
    const run = loadRun();
    await run({ order: 1 }, 'FakeService', 'echo', {}, PR);
    expect(calls[0].clientId).toBe(1);
    expect(calls[1]).toEqual({ init: true });
  });
});

describe('RunOperation: operasyon çözümleme (ADR-0001 adım 5: izinli liste = OPERATION_POLICY, varsayılan ret)', () => {
  it('[ADR-0001 adım 5] kayıtta olmayan operasyon: 403; servis ÖRNEKLENMEZ ve init() ÇALIŞMAZ (eskiden init() çalışıp Error("Operation not implemented") fırlatırdı)', async () => {
    const run = loadRun();
    await expect(run({ order: 1 }, 'FakeService', 'nope', {}, PR)).rejects.toMatchObject({ message: 'Forbidden', statusCode: 403 });
    expect(calls).toHaveLength(0);
  });

  it('[ADR-0001 adım 5] iç yardımcı metot ve init RPC ile ÇAĞRILAMAZ: 403, servis çağrılmaz (eskiden herhangi bir üyeye çözülürdü)', async () => {
    const run = loadRun();
    await expect(run({ order: 1 }, 'FakeService', 'sensitiveHelper', {}, PR)).rejects.toMatchObject({ statusCode: 403 });
    await expect(run({ order: 1 }, 'FakeService', 'init', {}, PR)).rejects.toMatchObject({ statusCode: 403 });
    expect(calls).toHaveLength(0);
  });

  it('[ADR-0001 adım 5] prototip üyeleri ("toString", "constructor", "hasOwnProperty", "__proto__") ve "_" önekli adlar 403 (eskiden toString -> "[object Object]" dönerdi, constructor TypeError fırlatırdı)', async () => {
    const run = loadRun();
    for (const op of ['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf', '_gizli']) {
      await expect(run({ order: 1 }, 'FakeService', op, {}, PR)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(calls).toHaveLength(0);
  });

  it('[ADR-0001 adım 5] kayıtta VAR ama sınıfta olmayan (ölü kayıt) operasyon: hâlâ Error("Operation not implemented") — ölü kaydı operation-policy.test.ts yakalar', async () => {
    const run = loadRun({ FakeService }, { FakeService: { echo: 'member', ghost: 'member' } });
    await expect(run({ order: 1 }, 'FakeService', 'ghost', {}, PR)).rejects.toThrow('Operation not implemented');
    expect(calls.some(c => c.init)).toBe(true);
  });

  it('[ADR-0001 adım 5] ApiWrapper ikinci savunma hattı: kayıt yanlışlıkla init/toString içerse bile wrapper örneklemeden 403 döner', async () => {
    const run = loadRun({ FakeService }, { FakeService: { echo: 'member', init: 'member', toString: 'member', _x: 'member' } });
    await expect(run({ order: 1 }, 'FakeService', 'init', {}, PR)).rejects.toMatchObject({ statusCode: 403 });
    await expect(run({ order: 1 }, 'FakeService', '_x', {}, PR)).rejects.toMatchObject({ statusCode: 403 });
    expect(calls).toHaveLength(0);
  });

  it('[MEVCUT DAVRANIŞ] servis constructor/init hatası çağırana aynen yayılır (yakalanmaz)', async () => {
    class Boom { constructor() {} async init() { throw new Error('init patladi'); } }
    const run = loadRun({ Boom });
    await expect(run({ order: 1 }, 'Boom', 'x', {}, PR)).rejects.toThrow('init patladi');
  });
});

describe('src/api/index.ts: servis kaydı (statik metin kontrolü)', () => {
  it('[MEVCUT DAVRANIŞ] AdminService ve SecurityService servis kayıt defterindedir (ADR-0001 adım 5: AdminService yalnızca platformAdmin kademesiyle çağrılabilir)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../src/api/index.ts'), 'utf8');
    const exportBlock = src.slice(src.indexOf('export default'));
    expect(exportBlock).toMatch(/^\s*AdminService,?$/m);
    expect(exportBlock).toMatch(/^\s*SecurityService,?$/m);
  });
});

describe('RunOperation: tipli bağlam (ADR-0024 P1-CORE)', () => {
  const TENANT = { order: 1, _id: 'cid', status: 'ACTIVE', dbname: 'entegrasyonikClient_1' };

  it('gövdedeki "ctx" alanı sunucuda atılır; ctx yalnızca doğrulanmış principal/userContext\'ten kurulur', async () => {
    const run = loadRun();
    const resp = await run({ order: 1, roleCode: 'ROLE_ADMIN' }, 'FakeService', 'echo', { ctx: { actor: { sub: 'evil', tier: 'owner' } } }, PR);
    expect(resp.request.ctx.actor).toMatchObject({ sub: 'u1', tid: 1, tier: 'admin', actorType: 'user' });
    expect(resp.request.ctx.actor.sub).not.toBe('evil');
  });

  it('requestMeta.tenant yalnız tenant.order == userContext.order ise ctx.tenant olur; requestMeta servise yalnız { ip } iletilir', async () => {
    const run: any = loadRun();
    const ok = await run({ order: 1 }, 'FakeService', 'echo', {}, PR, { ip: '203.0.113.1', tenant: TENANT });
    expect(ok.request.ctx.tenant).toEqual(TENANT);
    expect(ok.request.ctx.ip).toBe('203.0.113.1');
    expect(ok.request.requestMeta).toEqual({ ip: '203.0.113.1' });
    const bad = await run({ order: 1 }, 'FakeService', 'echo', {}, PR, { tenant: { ...TENANT, order: 2 } });
    expect(bad.request.ctx.tenant).toBeUndefined();
  });
});
