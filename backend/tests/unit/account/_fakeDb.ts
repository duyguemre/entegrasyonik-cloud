import { jest } from '@jest/globals';

// Hesap yaşam döngüsü testleri için durum tutan, bellek-içi sahte Mongoose modelleri (DB/Redis/ağ/SMTP YOK).
// Yalnızca AccountLifecycleService'in kullandığı sorgu/güncelleme alt kümesini uygular: eşitlik, null==yok, $gt, $set/$unset/$inc, sort(createdAt).

let seq = 0;

function clone<T>(o: T): T {
  if (o instanceof Date) return new Date(o.getTime()) as any;
  if (Array.isArray(o)) return o.map(clone) as any;
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o as any).map(([k, v]) => [k, clone(v)])) as any;
  return o;
}

function matchValue(actual: any, expected: any): boolean {
  if (expected === null) return actual === undefined || actual === null;
  if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
    // Operatör nesneleri: yalnızca $gt desteklenir; bilinmeyen operatör bilerek HATA verir (testte sessiz eşleşme olmasın)
    for (const [op, v] of Object.entries(expected)) {
      if (op === '$gt') { if (!(actual instanceof Date && actual.getTime() > (v as Date).getTime())) return false; }
      else throw new Error('fake: desteklenmeyen operatör ' + op);
    }
    return true;
  }
  if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
  return actual === expected;
}

function matches(doc: any, filter: Record<string, any>): boolean {
  return Object.entries(filter).every(([k, v]) => matchValue(doc[k], v));
}

function applyUpdate(doc: any, update: Record<string, any>) {
  for (const [op, fields] of Object.entries(update)) {
    if (op === '$set') Object.assign(doc, clone(fields));
    else if (op === '$unset') for (const k of Object.keys(fields as any)) delete doc[k];
    else if (op === '$inc') for (const [k, n] of Object.entries(fields as any)) doc[k] = (Number(doc[k]) || 0) + (n as number);
    else throw new Error('fake: desteklenmeyen güncelleme ' + op);
  }
}

export class FakeQuery<T> implements PromiseLike<T> {
  constructor(private run: () => T, private sorter?: (a: any, b: any) => number) { }
  sort(spec: Record<string, 1 | -1>) {
    const [k, dir] = Object.entries(spec)[0];
    this.sorter = (a, b) => ((a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir);
    return this;
  }
  lean() { return this; }
  select() { return this; }
  private exec(): T { return this.run(); }
  then<R1 = T, R2 = never>(ok?: ((v: T) => R1 | PromiseLike<R1>) | null, err?: ((e: any) => R2 | PromiseLike<R2>) | null): PromiseLike<R1 | R2> {
    return Promise.resolve().then(() => this.exec()).then(ok as any, err as any);
  }
  /** sorter'ı kullanan dahili yol (findOne için). */
  withSort(fn: (sorter?: (a: any, b: any) => number) => T) { this.run = () => fn(this.sorter); return this; }
}

export function makeFakeModel(initial: any[] = []) {
  const docs: any[] = initial.map((d) => ({ _id: d._id ?? 'id' + ++seq, ...clone(d) }));
  const calls: Record<string, any[][]> = {};
  const rec = (name: string, args: any[]) => { (calls[name] ??= []).push(args); };
  const model: any = {
    docs,
    calls,
    findOne: (filter: any = {}) => {
      rec('findOne', [filter]);
      return new FakeQuery<any>(() => null).withSort((sorter) => {
        const found = docs.filter((d) => matches(d, filter));
        if (sorter) found.sort(sorter);
        return found[0] ? clone(found[0]) : null;
      });
    },
    findById: (id: any) => {
      rec('findById', [id]);
      return new FakeQuery<any>(() => { const d = docs.find((x) => x._id === id); return d ? clone(d) : null; });
    },
    findOneAndUpdate: (filter: any, update: any, opts: any = {}) => {
      rec('findOneAndUpdate', [filter, update, opts]);
      return new FakeQuery<any>(() => {
        const d = docs.find((x) => matches(x, filter));
        if (!d) return null;
        const before = clone(d);
        applyUpdate(d, update);
        return opts.new ? clone(d) : before;
      });
    },
    updateOne: (filter: any, update: any) => {
      rec('updateOne', [filter, update]);
      return new FakeQuery<any>(() => { const d = docs.find((x) => matches(x, filter)); if (d) applyUpdate(d, update); return { matchedCount: d ? 1 : 0 }; });
    },
    updateMany: (filter: any, update: any) => {
      rec('updateMany', [filter, update]);
      return new FakeQuery<any>(() => { const hit = docs.filter((x) => matches(x, filter)); hit.forEach((d) => applyUpdate(d, update)); return { matchedCount: hit.length }; });
    },
    create: async (rec0: any) => {
      rec('create', [rec0]);
      if ('tokenHash' in rec0 && docs.some((d) => d.tokenHash === rec0.tokenHash)) throw Object.assign(new Error('E11000'), { code: 11000 });
      const d = { _id: 'id' + ++seq, ...clone(rec0) };
      docs.push(d);
      return clone(d);
    },
  };
  return model;
}

export interface FakeAccountEnv {
  users: ReturnType<typeof makeFakeModel>;
  tokens: ReturnType<typeof makeFakeModel>;
  tenantUsers: ReturnType<typeof makeFakeModel>;
  appDb: any;
  getClientDB: any;
  sent: Array<{ to: string; subject: string; text: string; html?: string }>;
  mailSender: any;
}

/** Bellek-içi merkezi DB + tenant kullanıcı kopyası + kayıt tutan sahte e-posta göndericisi. */
export function makeAccountEnv(users: any[] = [], tenantUsers: any[] = []): FakeAccountEnv {
  const usersModel = makeFakeModel(users);
  const tokens = makeFakeModel();
  const tenant = makeFakeModel(tenantUsers);
  const sent: FakeAccountEnv['sent'] = [];
  const mailSender: any = (jest.fn as any)(async (to: string, subject: string, text: string, html?: string) => { sent.push({ to, subject, text, html }); });
  return {
    users: usersModel,
    tokens,
    tenantUsers: tenant,
    appDb: { getUserModel: () => usersModel, getAccountTokenModel: () => tokens },
    getClientDB: (jest.fn as any)(async (_order: number) => ({ getUserModel: () => tenant })),
    sent,
    mailSender,
  };
}

/** Gönderilen e-postadaki bağlantıdan token'ı çıkarır. */
export function tokenFromMail(mail: { text: string }): string {
  const m = /token=([A-Za-z0-9_-]+)/.exec(mail.text);
  if (!m) throw new Error('e-postada token bağlantısı yok');
  return m[1];
}
