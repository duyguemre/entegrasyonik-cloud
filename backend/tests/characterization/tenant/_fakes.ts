// Ortak sahte (in-memory) merkezi DB ve tenant DB — yalnızca tenant testleri. DB/Redis/ağ YOK.
// Mongo davranışlarından yalnızca testlerin ihtiyaç duyduğu alt küme taklit edilir: eşitlik filtreleri, noktalı yol $set/$unset,
// $max/$inc + upsert (Counters) ve tekil indeks ihlali (E11000). Yarış senaryoları için her G/Ç bir mikro-bekleme (tick) içerir.
import { jest } from '@jest/globals';

export const tick = () => new Promise<void>(r => setImmediate(r));

function getPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj: any, path: string, value: any) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) { o[keys[i]] = o[keys[i]] ?? {}; o = o[keys[i]]; }
  o[keys[keys.length - 1]] = value;
}
function unsetPath(obj: any, path: string) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) { if (o == null) return; o = o[keys[i]]; }
  if (o) delete o[keys[keys.length - 1]];
}
/** Basit operatör desteği ($in/$lte/$gte/$ne); bilinmeyen/skaler değer eski davranış (tam eşitlik). Katkısal (geriye uyumlu). */
function matchesValue(actual: any, expected: any): boolean {
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
    return Object.entries(expected).every(([op, val]: [string, any]) => {
      if (op === '$in') return Array.isArray(val) && val.includes(actual);
      if (op === '$ne') return actual !== val;
      if (op === '$lte') return actual !== undefined && actual !== null && new Date(actual).getTime() <= new Date(val as any).getTime();
      if (op === '$gte') return actual !== undefined && actual !== null && new Date(actual).getTime() >= new Date(val as any).getTime();
      return actual === expected;
    });
  }
  return actual === expected;
}
function matches(doc: any, filter: any): boolean {
  return Object.entries(filter || {}).every(([k, v]) => matchesValue(getPath(doc, k), v));
}
const dupError = (what: string) => Object.assign(new Error('E11000 duplicate key ' + what), { code: 11000 });

export function chainOf(compute: () => any) {
  let sortSpec: any;
  const c: any = {};
  c.select = jest.fn(() => c);
  c.sort = jest.fn((s: any) => { sortSpec = s; return c; });
  const run = async () => { await tick(); return compute.call({ sortSpec }); };
  c.lean = jest.fn(run);
  c.exec = jest.fn(run);
  c._sort = () => sortSpec;
  return c;
}

export function makeCentralDb(seed: { clients?: any[]; users?: any[]; counters?: Record<string, number>; plans?: any[]; subscriptions?: any[] } = {}): any {
  const state = {
    clients: (seed.clients ?? []).map(c => ({ ...c })),
    users: (seed.users ?? []).map(u => ({ ...u })),
    counters: { ...(seed.counters ?? {}) } as Record<string, number>,
    // ADR-0008 (ADR-0014 S4a): provisioning `trialing` abonelik adımı — Plans / Subscriptions (yalnızca ilgili alt küme)
    plans: (seed.plans ?? []).map(p => ({ ...p })),
    subscriptions: (seed.subscriptions ?? []).map(s => ({ ...s })),
  };

  const clientModel: any = {
    findOne: jest.fn((filter: any = {}) => {
      let sortSpec: any;
      const c: any = {};
      c.select = jest.fn(() => c);
      c.sort = jest.fn((s: any) => { sortSpec = s; return c; });
      const run = async () => {
        await tick();
        let rows = state.clients.filter(d => matches(d, filter));
        if (sortSpec && sortSpec.order) rows = rows.slice().sort((a, b) => sortSpec.order * (a.order - b.order));
        return rows[0] ? { ...rows[0] } : null;
      };
      c.lean = jest.fn(run);
      c.exec = jest.fn(run);
      return c;
    }),
    create: jest.fn(async (p: any) => {
      await tick();
      for (const d of state.clients) {
        if (d.order === p.order) throw dupError('order');
        if (d.clientId === p.clientId) throw dupError('clientId');
        if (d.dbConfig?.dbname && d.dbConfig.dbname === p.dbConfig?.dbname) throw dupError('dbConfig.dbname');
      }
      const doc = { _id: 'oid-' + (state.clients.length + 1), ...JSON.parse(JSON.stringify(p)) };
      state.clients.push(doc);
      return { ...doc, toObject: () => JSON.parse(JSON.stringify(doc)) };
    }),
    updateOne: jest.fn(async (filter: any, update: any) => {
      await tick();
      const doc = state.clients.find(d => matches(d, filter));
      if (!doc) return { matchedCount: 0 };
      for (const [k, v] of Object.entries(update.$set ?? {})) setPath(doc, k, v);
      for (const k of Object.keys(update.$unset ?? {})) unsetPath(doc, k);
      return { matchedCount: 1 };
    }),
    // ADR-0003 adım 8 (purge/L-08): find(filter).select().sort().lean() — runPurgeForDueTenants ve Dispatcher aktif-tenant sorgusu için.
    find: jest.fn((filter: any = {}) => chainOf(() => state.clients.filter(d => matches(d, filter)).map(d => ({ ...d })))),
    // Eski (ADR-0003 adım 8 öncesi) AdminService.deleteClient davranışı: gerçek silme. Karakterizasyon testi için.
    deleteOne: jest.fn(async (filter: any) => {
      await tick();
      const before = state.clients.length;
      state.clients = state.clients.filter(d => !matches(d, filter));
      return { deletedCount: before - state.clients.length };
    }),
  };

  const userModel: any = {
    findOne: jest.fn(async (filter: any = {}) => {
      await tick();
      const d = state.users.find(u => matches(u, filter));
      return d ? withToObject(d) : null;
    }),
    create: jest.fn(async (p: any) => {
      await tick();
      const email = typeof p.email === 'string' ? p.email.trim().toLowerCase() : p.email; // şema: lowercase + trim
      if (state.users.some(u => u.email === email)) throw dupError('email');
      const doc = { _id: 'u' + (state.users.length + 1), ...p, email };
      state.users.push(doc);
      return withToObject(doc);
    }),
    // ADR-0003 adım 8 (purge): merkezi Users'ta tenant'a bağlı kayıtların silinmesi.
    deleteMany: jest.fn(async (filter: any) => {
      await tick();
      const before = state.users.length;
      state.users = state.users.filter(u => !matches(u, filter));
      return { deletedCount: before - state.users.length };
    }),
  };

  const counterModel: any = {
    updateOne: jest.fn(async (f: any, u: any) => {
      await tick();
      if (u.$max) state.counters[f._id] = Math.max(state.counters[f._id] ?? 0, u.$max.sequence_value);
      return {};
    }),
    findOneAndUpdate: jest.fn(async (f: any, u: any) => {
      await tick();
      state.counters[f._id] = (state.counters[f._id] ?? 0) + u.$inc.sequence_value;
      return { sequence_value: state.counters[f._id] };
    }),
  };

  const planModel: any = {
    findOne: jest.fn((filter: any = {}) => chainOf(() => { const d = state.plans.find(x => matches(x, filter)); return d ? { ...d } : null; })),
  };
  // updateOne: eşitlik filtresi + $setOnInsert/$set + upsert (Subscriptions.clientId tekil indeksi taklit edilir)
  const subscriptionModel: any = {
    updateOne: jest.fn(async (filter: any, update: any, opts: any = {}) => {
      await tick();
      const doc = state.subscriptions.find(x => matches(x, filter));
      if (doc) {
        for (const [k, v] of Object.entries(update.$set ?? {})) setPath(doc, k, v);
        return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
      }
      if (!opts.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      state.subscriptions.push({ ...filter, ...(update.$setOnInsert ?? {}), ...(update.$set ?? {}) });
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: 'sub' + state.subscriptions.length };
    }),
    findOne: jest.fn((filter: any = {}) => chainOf(() => { const d = state.subscriptions.find(x => matches(x, filter)); return d ? { ...d } : null; })),
  };

  // ADR-0003 adım 8 (purge): clientId'ye bağlı ApplicationDB koleksiyonları — yalnızca deleteMany çağrıldığını
  // doğrulamak için basit sahte modeller (gerçek veri tutmazlar; DB YOK).
  const deletableModel = () => ({ deleteMany: jest.fn(async (_filter: any) => { await tick(); return { deletedCount: 0 }; }) });
  const exportSignalModel = deletableModel();
  const exportFlagModel = deletableModel();
  const importJobModel = deletableModel();
  const operationLogModel = deletableModel();
  const deadLetterQueueModel = deletableModel();
  const ticketModel = deletableModel();

  const appDb: any = {
    getClientModel: () => clientModel,
    getUserModel: () => userModel,
    getCounterModel: () => counterModel,
    getExportSignalModel: () => exportSignalModel,
    getExportFlagModel: () => exportFlagModel,
    getImportJobModel: () => importJobModel,
    getOperationLogModel: () => operationLogModel,
    getDeadLetterQueueModel: () => deadLetterQueueModel,
    getTicketModel: () => ticketModel,
    getPlanModel: () => planModel,
    getSubscriptionModel: () => subscriptionModel,
  };
  return {
    appDb, state, clientModel, userModel, counterModel, planModel, subscriptionModel,
    exportSignalModel, exportFlagModel, importJobModel, operationLogModel, deadLetterQueueModel, ticketModel,
  };
}

function withToObject(d: any) {
  const doc: any = { ...d };
  Object.defineProperty(doc, 'toObject', { value: () => ({ ...d }), enumerable: false });
  return doc;
}

export function makeTenantDb(): any {
  const catModel = { findOneAndUpdate: jest.fn(async (..._a: any[]) => ({})) };
  const brandModel = { findOneAndUpdate: jest.fn(async (..._a: any[]) => ({})) };
  const seeded: any[] = [];
  const ciModel = {
    findOne: jest.fn(() => chainOf(() => seeded[0] ?? null)),
    create: jest.fn(async (p: any) => { seeded.push(p); return p; }),
  };
  const tenantUsers: any[] = [];
  const tenantUserModel = {
    findOneAndUpdate: jest.fn(async (f: any, u: any, _o: any) => {
      if (!tenantUsers.some(x => x.email === f.email)) tenantUsers.push({ ...u.$setOnInsert });
      return {};
    }),
  };
  const db = {
    getCategoryModel: () => catModel, getBrandModel: () => brandModel,
    getClientIntegrationModel: () => ciModel, getUserModel: () => tenantUserModel,
  };
  return { db, catModel, brandModel, ciModel, tenantUserModel, tenantUsers };
}
