import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// [ADR-0001 adım 6] AuditLogger + AuditLog şeması + RunOperation'da AdminService yazma denetimi.
// DB/Redis/ağ YOK: sink veya DatabaseManager mock'lanır.

import { AuditLogger, sanitizeMeta } from '../../../src/services/audit/AuditLogger';
import { AuditLogSchema, AUDIT_LOG_TTL_SECONDS } from '../../../src/database/application/models/AuditLog';

const flush = () => new Promise(r => setImmediate(r));

let records: any[];
beforeEach(() => {
  records = [];
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  AuditLogger.setSink(async (r) => { records.push(r); });
});
afterEach(() => { AuditLogger.setSink(undefined); jest.restoreAllMocks(); });

describe('AuditLog şeması', () => {
  it('[ADR-0001 adım 6] TTL indeksi 365 gün (at alanı); koleksiyon "AuditLogs"; alanlar at/event/sub/tid/ip/result/meta', () => {
    expect(AUDIT_LOG_TTL_SECONDS).toBe(365 * 24 * 60 * 60);
    const idx = AuditLogSchema.indexes().find(([spec]: any) => spec.at === 1 && Object.keys(spec).length === 1);
    expect(idx).toBeDefined();
    expect((idx as any)[1].expireAfterSeconds).toBe(31536000);
    expect((AuditLogSchema as any).options.collection).toBe('AuditLogs');
    for (const f of ['at', 'event', 'sub', 'tid', 'ip', 'result', 'meta']) expect(AuditLogSchema.path(f)).toBeDefined();
    // PII alanı YOK
    for (const f of ['email', 'password', 'token', 'name', 'surname']) expect(AuditLogSchema.path(f)).toBeUndefined();
  });
});

describe('AuditLogger.log', () => {
  it('kaydı sub/tid/ip/result/event/at ile yazar; tid sayıya, sub stringe çevrilir', async () => {
    await AuditLogger.log({ event: 'login', result: 'ok', sub: 'u1', tid: 3, ip: '203.0.113.1' });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ event: 'login', result: 'ok', sub: 'u1', tid: 3, ip: '203.0.113.1' });
    expect(records[0].at).toBeInstanceOf(Date);
  });

  it('undefined alanlar kayda hiç girmez (başarısız girişte sub/tid/meta yok)', async () => {
    await AuditLogger.log({ event: 'login', result: 'fail', ip: '203.0.113.1' });
    expect(Object.keys(records[0]).sort()).toEqual(['at', 'event', 'ip', 'result']);
  });

  it('[best-effort] sink HATA verirse log() reddetmez/fırlatmaz; hata loglanır', async () => {
    AuditLogger.setSink(async () => { throw new Error('db down'); });
    await expect(AuditLogger.log({ event: 'x', result: 'ok' })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('[best-effort] sink eşzamanlı fırlatsa bile log() reddetmez', async () => {
    AuditLogger.setSink((() => { throw new Error('sync boom'); }) as any);
    await expect(AuditLogger.log({ event: 'x', result: 'ok' })).resolves.toBeUndefined();
  });

  it('asenkron: log() çağıran akışı bloklamaz (sink çağrısı mikro görevde)', async () => {
    const seen: string[] = [];
    AuditLogger.setSink(async () => { seen.push('sink'); });
    const p = AuditLogger.log({ event: 'x', result: 'ok' });
    seen.push('after-call');
    await p;
    expect(seen).toEqual(['after-call', 'sink']);
  });

  it('AUDIT_LOG_DISABLED=true ve özel sink yoksa hiçbir şey yazılmaz/bağlanılmaz', async () => {
    AuditLogger.setSink(undefined);
    expect(process.env.AUDIT_LOG_DISABLED).toBe('true'); // jest setup
    await expect(AuditLogger.log({ event: 'x', result: 'ok' })).resolves.toBeUndefined();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('varsayılan sink ApplicationDB.AuditLogs modeline create eder (DatabaseManager mock)', async () => {
    const create = jest.fn(async (_r: any) => ({}));
    let saved: string | undefined;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: async () => ({ getAuditLogModel: () => ({ create }) }) } }));
      const mod = require('../../../src/services/audit/AuditLogger');
      saved = process.env.AUDIT_LOG_DISABLED;
      delete process.env.AUDIT_LOG_DISABLED;
      try {
        await mod.AuditLogger.log({ event: 'selectStore', result: 'ok', sub: 's', tid: 2, ip: '1.1.1.1' });
      } finally {
        process.env.AUDIT_LOG_DISABLED = saved;
      }
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({ event: 'selectStore', result: 'ok', sub: 's', tid: 2, ip: '1.1.1.1' });
  });

  it('varsayılan sink DB erişemezse de (getApplicationDB reddeder) istek düşmez', async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: async () => { throw new Error('no db'); } } }));
      const mod = require('../../../src/services/audit/AuditLogger');
      const saved = process.env.AUDIT_LOG_DISABLED;
      delete process.env.AUDIT_LOG_DISABLED;
      try {
        await expect(mod.AuditLogger.log({ event: 'x', result: 'ok' })).resolves.toBeUndefined();
      } finally {
        process.env.AUDIT_LOG_DISABLED = saved;
      }
    });
    expect(console.error).toHaveBeenCalled();
  });
});

describe('sanitizeMeta (PII/sır koruması)', () => {
  it('hassas görünen anahtarlar (parola/token/e-posta/sır/anahtar/cookie) atılır; yalnızca ilkel değerler kalır', () => {
    const m = sanitizeMeta({ password: 'x', newPassword: 'y', token: 't', email: 'a@b.c', secret: 's', apiKey: 'k', cookie: 'c', authorization: 'a', roleCode: 'ROLE_ADMIN', n: 1, ok: true, obj: { a: 1 }, arr: [1] });
    expect(m).toEqual({ roleCode: 'ROLE_ADMIN', n: 1, ok: true });
  });

  it('uzun string kırpılır, en fazla 10 anahtar; boş sonuç undefined; dizi/ilkel girdi undefined', () => {
    expect((sanitizeMeta({ a: 'x'.repeat(500) }) as any).a).toHaveLength(200);
    const many: any = {}; for (let i = 0; i < 30; i++) many['k' + i] = i;
    expect(Object.keys(sanitizeMeta(many) as any)).toHaveLength(10);
    expect(sanitizeMeta({ password: 'x' })).toBeUndefined();
    expect(sanitizeMeta([1, 2])).toBeUndefined();
    expect(sanitizeMeta('s')).toBeUndefined();
  });
});

describe('AuditLogger.fromRequest', () => {
  it('sub/tid doğrulanmış principal\'dan, ip requestMeta\'dan alınır (istek gövdesinden DEĞİL)', async () => {
    await AuditLogger.fromRequest({ principal: { sub: 'p1', tid: 4 }, requestMeta: { ip: '9.9.9.9' }, sub: 'body-sub', tid: 999, ip: 'body-ip' }, 'user.create', 'ok', { roleCode: 'ROLE_ADMIN' });
    expect(records[0]).toMatchObject({ event: 'user.create', result: 'ok', sub: 'p1', tid: 4, ip: '9.9.9.9', meta: { roleCode: 'ROLE_ADMIN' } });
  });
  it('overrides (ör. hedef tid) öncelikli; principal/requestMeta yoksa alanlar boş', async () => {
    await AuditLogger.fromRequest({}, 'selectStore', 'fail', undefined, { tid: 8 });
    expect(records[0]).toMatchObject({ event: 'selectStore', result: 'fail', tid: 8 });
    expect(records[0].sub).toBeUndefined();
    expect(records[0].ip).toBeUndefined();
  });
});

describe('RunOperation: AdminService YAZMA işlemleri audit\'lenir (tek noktada, principal\'dan sub/tid)', () => {
  const PR_ADMIN = { sub: 'adm1', tid: undefined as any, ga: true, tv: 0, imp: false };
  const UC = { _id: 'adm1', isGlobalAdmin: true };

  class FakeAdmin {
    constructor(public c: any, public r: any) {}
    async init() {}
    async createClient() { return { created: true }; }
    async getClients() { return []; }
    async retrieveThing() { return 1; }
    async deleteClient() { throw new Error('fail-deleting'); }
  }

  function loadRun() {
    let run: any;
    jest.isolateModules(() => {
      jest.doMock('../../../src/api/index', () => ({ __esModule: true, default: { AdminService: FakeAdmin } }));
      jest.doMock('../../../src/api/requestValidation', () => ({ validateRpcRequest: (_s: string, _o: string, b: unknown) => b })); // [ADR-0023] yetki testi: gövde şeması ayrı sınanır (tests/unit/api/requestValidation.test.ts)
      const policy = require('../../../src/api/operationPolicy');
      Object.assign(policy.OPERATION_POLICY, { AdminService: { createClient: 'platformAdmin', getClients: 'platformAdmin', retrieveThing: 'platformAdmin', deleteClient: 'platformAdmin' } });
      const { AuditLogger: IsoLogger } = require('../../../src/services/audit/AuditLogger');
      IsoLogger.setSink(async (r: any) => { records.push(r); });
      run = require('../../../src/api/RunOperation').default;
    });
    return run as (...a: any[]) => Promise<any>;
  }

  it('yazma başarılı: event=admin.write result=ok, sub principal\'dan, meta {service, operation}, ip requestMeta\'dan; istek gövdesi kayda GİRMEZ', async () => {
    const run = loadRun();
    await run(UC, 'AdminService', 'createClient', { clientData: { password: 'do-not-log', email: 'x@y.z' } }, PR_ADMIN, { ip: '10.0.0.5' });
    await flush();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ event: 'admin.write', result: 'ok', sub: 'adm1', ip: '10.0.0.5', meta: { service: 'AdminService', operation: 'createClient' } });
    expect(JSON.stringify(records[0])).not.toMatch(/do-not-log|x@y\.z/);
  });

  it('yazma hata verirse result=error kaydı yazılır ve hata çağırana AYNEN fırlatılır', async () => {
    const run = loadRun();
    await expect(run(UC, 'AdminService', 'deleteClient', {}, PR_ADMIN)).rejects.toThrow('fail-deleting');
    await flush();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ event: 'admin.write', result: 'error', meta: { operation: 'deleteClient' } });
  });

  it('get/retrieve önekli (okuma) operasyonlar audit\'lenmez', async () => {
    const run = loadRun();
    await run(UC, 'AdminService', 'getClients', {}, PR_ADMIN);
    await run(UC, 'AdminService', 'retrieveThing', {}, PR_ADMIN);
    await flush();
    expect(records).toHaveLength(0);
  });

  it('audit sink hatası AdminService işlemini DÜŞÜRMEZ (best-effort)', async () => {
    let run: any;
    jest.isolateModules(() => {
      jest.doMock('../../../src/api/index', () => ({ __esModule: true, default: { AdminService: FakeAdmin } }));
      jest.doMock('../../../src/api/requestValidation', () => ({ validateRpcRequest: (_s: string, _o: string, b: unknown) => b })); // [ADR-0023] yetki testi: gövde şeması ayrı sınanır (tests/unit/api/requestValidation.test.ts)
      Object.assign(require('../../../src/api/operationPolicy').OPERATION_POLICY, { AdminService: { createClient: 'platformAdmin' } });
      require('../../../src/services/audit/AuditLogger').AuditLogger.setSink(async () => { throw new Error('audit down'); });
      run = require('../../../src/api/RunOperation').default;
    });
    await expect(run(UC, 'AdminService', 'createClient', {}, PR_ADMIN)).resolves.toEqual({ created: true });
    await flush();
    expect(console.error).toHaveBeenCalled();
  });

  it('AdminService dışındaki servislerin yazma operasyonları bu noktada audit\'lenmez (kendi servisleri audit eder)', async () => {
    let run: any;
    jest.isolateModules(() => {
      class Other { constructor(public c: any, public r: any) {} async init() {} async createThing() { return 1; } }
      jest.doMock('../../../src/api/index', () => ({ __esModule: true, default: { Other } }));
      Object.assign(require('../../../src/api/operationPolicy').OPERATION_POLICY, { Other: { createThing: 'member' } });
      require('../../../src/services/audit/AuditLogger').AuditLogger.setSink(async (r: any) => { records.push(r); });
      run = require('../../../src/api/RunOperation').default;
    });
    await run({ order: 1 }, 'Other', 'createThing', {}, { sub: 'u', tid: 1, ga: false, tv: 0, imp: false });
    await flush();
    expect(records).toHaveLength(0);
  });

  it('istek gövdesindeki requestMeta/principal/userContext servise geçmez (yalnızca sunucu tarafı requestMeta)', async () => {
    let seen: any;
    let run: any;
    jest.isolateModules(() => {
      class Spy { constructor(public c: any, public r: any) { seen = r; } async init() {} async ping() { return 1; } }
      jest.doMock('../../../src/api/index', () => ({ __esModule: true, default: { Spy } }));
      Object.assign(require('../../../src/api/operationPolicy').OPERATION_POLICY, { Spy: { ping: 'member' } });
      run = require('../../../src/api/RunOperation').default;
    });
    await run({ order: 1 }, 'Spy', 'ping', { requestMeta: { ip: 'spoofed' }, principal: { sub: 'evil' }, x: 1 }, { sub: 'u', tid: 1, ga: false, tv: 0, imp: false }, { ip: '5.5.5.5' });
    expect(seen.requestMeta).toEqual({ ip: '5.5.5.5' });
    expect(seen.principal.sub).toBe('u');
    expect(seen.x).toBe(1);
  });
});
