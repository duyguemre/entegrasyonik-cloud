/**
 * ADR-0030 X3 — Idempotency-Key: gözlem kipinde davranış değişmez + tespit metriği; enforce kipinde tekrar / yeniden kullanım /
 * eşzamanlılık / hata sonrası yeniden deneme. Bellek-içi (geçici) MongoDB; ad/kimlikler sentetiktir. DB'ye kalıcı yazma YOK.
 * `RunOperation.run` GERÇEK yetenek kaydıyla (OrderService/cancelOrder: external+destructive) çalışır; servis ve tenant DB tutamağı mock'lanır.
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { IdempotencyKeySchema } from '../../src/database/client/models/IdempotencyKey';

jest.setTimeout(120000);

let mongod: import('mongodb-memory-server').MongoMemoryServer;
let conn: mongoose.Connection;
let Model: mongoose.Model<any>;

const calls: any[] = [];
let impl: (req: any) => Promise<any> = async () => ({ ok: true });
class OrderService {
  constructor(public clientId: any, public request: any) {}
  async init() {}
  async cancelOrder() { calls.push(this.request); return impl(this.request); }
  async getOrders() { calls.push('read'); return { list: [] }; }
}

const PR = { sub: 'u1', tid: 1, ga: false, tv: 0, imp: false };
const KEY = '11111111-2222-4333-8444-555555555555';

function loadRun(mode?: string) {
  if (mode) process.env.IDEMPOTENCY_ENFORCE = mode; else delete process.env.IDEMPOTENCY_ENFORCE;
  let run: any; let metrics: any;
  jest.isolateModules(() => {
    jest.doMock('../../src/api/rpc/index', () => ({ __esModule: true, default: { OrderService } }));
    jest.doMock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {
      getClientDB: async () => ({ getIdempotencyKeyModel: () => Model }),
      getClientDBForTenant: async () => ({ getIdempotencyKeyModel: () => Model }),
    } }));
    run = require('../../src/api/rpc/RunOperation').default;
    metrics = require('../../src/platform/runtime/metrics/MetricsRegistry').metricsRegistry;
  });
  return { run: run as (u: any, s: string, o: string, r: any, p?: any, m?: any) => Promise<any>, metrics };
}
const call = (run: any, body: any, key?: string, principal: any = PR) =>
  run({ order: 1 }, 'OrderService', 'cancelOrder', body, principal, key ? { idempotencyKey: key } : undefined);

beforeAll(async () => {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  conn = await mongoose.createConnection(mongod.getUri() + 'entegrasyonikClient_9001').asPromise();
  Model = conn.model('idempotency_key', IdempotencyKeySchema);
  await Model.createIndexes(); // autoIndex:false; testte açıkça (üretimde göç)
});
afterAll(async () => { await conn?.close(); await mongod?.stop(); });
beforeEach(async () => {
  calls.length = 0; impl = async () => ({ ok: true }); await Model.deleteMany({});
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => { delete process.env.IDEMPOTENCY_ENFORCE; jest.restoreAllMocks(); });

describe('gözlem kipi (varsayılan): davranış DEĞİŞMEZ', () => {
  it('anahtarsız istek: eskisi gibi, depoya yazılmaz', async () => {
    const { run } = loadRun();
    await call(run, { orderId: 'o1' }); await call(run, { orderId: 'o1' });
    expect(calls).toHaveLength(2);
    expect(await Model.countDocuments()).toBe(0);
  });
  it('aynı anahtar + aynı gövde ikinci kez: servis YİNE çağrılır, tespit metriği artar', async () => {
    const { run, metrics } = loadRun();
    const inc = jest.spyOn(metrics, 'incCounter');
    expect(await call(run, { orderId: 'o1' }, KEY)).toEqual({ ok: true });
    expect(await call(run, { orderId: 'o1' }, KEY)).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(inc).toHaveBeenCalledWith('idempotency_duplicate_detected', expect.objectContaining({ kind: 'replay', mode: 'observe' }));
  });
  it('aynı anahtar + farklı gövde: engellenmez (reused tespit edilir)', async () => {
    const { run, metrics } = loadRun();
    const inc = jest.spyOn(metrics, 'incCounter');
    await call(run, { orderId: 'o1' }, KEY); await call(run, { orderId: 'o2' }, KEY);
    expect(calls).toHaveLength(2);
    expect(inc).toHaveBeenCalledWith('idempotency_duplicate_detected', expect.objectContaining({ kind: 'reused' }));
  });
  it('geçersiz biçimli anahtar yok sayılır (400 değil)', async () => {
    const { run } = loadRun();
    await expect(call(run, { orderId: 'o1' }, 'x')).resolves.toEqual({ ok: true });
  });
  it('okuma RPC kapsam dışı', async () => {
    const { run } = loadRun();
    await run({ order: 1 }, 'OrderService', 'getOrders', {}, PR, { idempotencyKey: KEY });
    expect(await Model.countDocuments()).toBe(0);
  });
});

describe('enforce kipi', () => {
  it('aynı anahtar + aynı gövde: önceki yanıt, servis ikinci kez ÇAĞRILMAZ', async () => {
    const { run } = loadRun('enforce');
    impl = async () => ({ id: 7 });
    expect(await call(run, { orderId: 'o1', cancelData: { reason: 'r', reasonId: 1 } }, KEY)).toEqual({ id: 7 });
    expect(await call(run, { cancelData: { reasonId: 1, reason: 'r' }, orderId: 'o1' }, KEY)).toEqual({ id: 7 }); // anahtar sırası önemsiz
    expect(calls).toHaveLength(1);
  });
  it('aynı anahtar + farklı gövde: 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const { run } = loadRun('enforce');
    await call(run, { orderId: 'o1' }, KEY);
    await expect(call(run, { orderId: 'o2' }, KEY)).rejects.toMatchObject({ statusCode: 422, code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(calls).toHaveLength(1);
  });
  it('eşzamanlı ikinci istek: 409 IDEMPOTENCY_IN_PROGRESS; ilk bitince aynı anahtar önceki yanıtı verir', async () => {
    const { run } = loadRun('enforce');
    let release!: () => void;
    impl = () => new Promise(r => { release = () => r({ done: 1 }); });
    const first = call(run, { orderId: 'o1' }, KEY);
    await new Promise(r => setTimeout(r, 300));
    await expect(call(run, { orderId: 'o1' }, KEY)).rejects.toMatchObject({ statusCode: 409, code: 'IDEMPOTENCY_IN_PROGRESS' });
    release();
    expect(await first).toEqual({ done: 1 });
    expect(await call(run, { orderId: 'o1' }, KEY)).toEqual({ done: 1 });
    expect(calls).toHaveLength(1);
  });
  it('hata ile biten işlem kaydı silinir: aynı anahtarla yeniden denenebilir', async () => {
    const { run } = loadRun('enforce');
    impl = async () => { throw new Error('pazaryeri hatası'); };
    await expect(call(run, { orderId: 'o1' }, KEY)).rejects.toThrow('pazaryeri');
    impl = async () => ({ ok: 2 });
    expect(await call(run, { orderId: 'o1' }, KEY)).toEqual({ ok: 2 });
    expect(calls).toHaveLength(2);
  });
  it('kullanıcı kapsamı: başka kullanıcı aynı anahtarla çakışmaz', async () => {
    const { run } = loadRun('enforce');
    await call(run, { orderId: 'o1' }, KEY);
    await call(run, { orderId: 'o1' }, KEY, { ...PR, sub: 'u2' });
    expect(calls).toHaveLength(2);
  });
  it('anahtarsız istek eskisi gibi çalışır; geçersiz anahtar 400', async () => {
    const { run } = loadRun('enforce');
    await call(run, { orderId: 'o1' }); await call(run, { orderId: 'o1' });
    expect(calls).toHaveLength(2);
    await expect(call(run, { orderId: 'o1' }, 'x')).rejects.toMatchObject({ statusCode: 400 });
  });
  it('takılı (5 dk+) in_progress kaydı devralınır', async () => {
    const { run } = loadRun('enforce');
    const { hashBody } = require('../../src/platform/core/idempotency/idempotency');
    await Model.create({ userId: 'u1', operation: 'OrderService/cancelOrder', key: KEY, bodyHash: hashBody({ orderId: 'o1' }), state: 'in_progress', startedAt: new Date(Date.now() - 6 * 60000), expAt: new Date(Date.now() + 1e6) });
    expect(await call(run, { orderId: 'o1' }, KEY)).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
  });
});
