// Bellek-içi sahte Mongoose modeli (NB7/NB8 testleri): find/findOne (zincirli), create (benzersiz anahtar -> E11000), updateOne/updateMany ($set/$unset/$inc),
// findOneAndUpdate({new}), insertMany, deleteOne, countDocuments, aggregate (enjekte). Sorgu: eşitlik, $in/$ne/$lt/$lte/$gt/$gte/$exists, $and/$or, noktalı yol. DB/Redis/ağ YOK.
type Doc = Record<string, any>;
const isDate = (v: any) => v instanceof Date;
const val = (d: Doc, path: string): any => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), d);
const same = (a: any, b: any) => (isDate(a) && isDate(b) ? a.getTime() === b.getTime() : String(a) === String(b));
const cmp = (a: any, b: any) => (isDate(a) || isDate(b) ? (a instanceof Date ? a.getTime() : NaN) - (b instanceof Date ? b.getTime() : NaN) : a - b);

function field(v: any, cond: any): boolean {
    if (cond !== null && typeof cond === 'object' && !isDate(cond) && !Array.isArray(cond) && Object.keys(cond).some((k) => k.startsWith('$'))) {
        return Object.entries(cond).every(([op, arg]: [string, any]) => {
            switch (op) {
                case '$exists': return (v !== undefined) === arg;
                case '$ne': return arg === null ? v != null : !(v !== undefined && same(v, arg));
                case '$in': return (arg as any[]).some((a) => (a === null ? v == null : v !== undefined && same(v, a)));
                case '$lt': return v !== undefined && v !== null && cmp(v, arg) < 0;
                case '$lte': return v !== undefined && v !== null && cmp(v, arg) <= 0;
                case '$gt': return v !== undefined && v !== null && cmp(v, arg) > 0;
                case '$gte': return v !== undefined && v !== null && cmp(v, arg) >= 0;
                default: throw new Error('fake: desteklenmeyen operatör ' + op);
            }
        });
    }
    if (cond === null) return v === null || v === undefined;
    return v !== undefined && same(v, cond);
}
export function matches(d: Doc, f: Doc): boolean {
    return Object.entries(f).every(([k, c]) => {
        if (k === '$or') return (c as Doc[]).some((x) => matches(d, x));
        if (k === '$and') return (c as Doc[]).every((x) => matches(d, x));
        return field(val(d, k), c);
    });
}

function applyUpdate(d: Doc, u: Doc): void {
    const setPath = (path: string, value: any) => {
        const parts = path.split('.'); let o = d;
        for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] ??= {}; o = o[parts[i]]; }
        o[parts[parts.length - 1]] = value;
    };
    for (const [k, v] of Object.entries(u.$set ?? {})) setPath(k, v);
    for (const k of Object.keys(u.$unset ?? {})) { const parts = k.split('.'); let o: any = d; for (let i = 0; i < parts.length - 1 && o; i++) o = o[parts[i]]; if (o) delete o[parts[parts.length - 1]]; }
    for (const [k, v] of Object.entries(u.$inc ?? {})) setPath(k, ((val(d, k) as number | undefined) ?? 0) + (v as number));
}

class Q<T> implements PromiseLike<T> {
    private sortSpec: Record<string, 1 | -1> = {};
    private lim = Infinity;
    constructor(private readonly rows: () => Doc[], private readonly one: boolean) {}
    sort(s: Record<string, 1 | -1>) { this.sortSpec = s; return this; }
    limit(n: number) { this.lim = n; return this; }
    maxTimeMS(_n: number) { return this; }
    lean() { return this; }
    option(_o: any) { return this; }
    then<R1 = T, R2 = never>(res?: ((v: T) => R1 | PromiseLike<R1>) | null, rej?: ((e: any) => R2 | PromiseLike<R2>) | null): Promise<R1 | R2> {
        const out = [...this.rows()];
        const keys = Object.entries(this.sortSpec);
        out.sort((a, b) => { for (const [k, dir] of keys) { const x = val(a, k), y = val(b, k); const c = x < y ? -1 : x > y ? 1 : 0; if (c) return c * dir; } return 0; });
        const page = out.slice(0, this.lim);
        return Promise.resolve((this.one ? (page[0] ?? null) : page) as T).then(res, rej);
    }
}

export class FakeNotifyModel {
    public docs: Doc[] = [];
    public uniqueKeys: string[][] = [];
    public aggregateResult: Doc[] | ((pipeline: any[]) => Doc[]) = [];
    private seq = 0;
    constructor(seed: Doc[] = [], opts: { unique?: string[][] } = {}) { this.uniqueKeys = opts.unique ?? []; for (const s of seed) this.insertSync(s); }
    private nextId() { return (++this.seq).toString(16).padStart(24, '0'); }
    private insertSync(doc: Doc): Doc {
        for (const keys of this.uniqueKeys) {
            if (this.docs.some((x) => keys.every((k) => same(val(x, k), val(doc, k))))) { const e: any = new Error('E11000 duplicate key'); e.code = 11000; throw e; }
        }
        const d = { _id: doc._id ?? this.nextId(), ...doc };
        this.docs.push(d);
        return d;
    }
    async create(doc: Doc) { return this.insertSync(doc); }
    async insertMany(docs: Doc[]) { return docs.map((d) => this.insertSync(d)); }
    find(f: Doc = {}) { return new Q<Doc[]>(() => this.docs.filter((d) => matches(d, f)), false); }
    findOne(f: Doc = {}) { return new Q<Doc | null>(() => this.docs.filter((d) => matches(d, f)), true); }
    countDocuments(f: Doc = {}) { return new Q<number>(() => [], false).then(() => this.docs.filter((d) => matches(d, f)).length) as any; }
    aggregate(p: any[]) { const r = typeof this.aggregateResult === 'function' ? this.aggregateResult(p) : this.aggregateResult; return new Q<Doc[]>(() => r, false); }
    async updateOne(f: Doc, u: Doc, opts: { upsert?: boolean } = {}) {
        const d = this.docs.find((x) => matches(x, f));
        if (!d && opts.upsert) { // esitlik suzgeci alanlari + $set (MOB-04 PushSubscriptions)
            const base: Doc = Object.fromEntries(Object.entries(f).filter(([k, v]) => !k.startsWith('$') && (v === null || typeof v !== 'object')));
            const nd = this.insertSync(base); applyUpdate(nd, { ...u, $unset: undefined });
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        }
        if (!d) return { matchedCount: 0, modifiedCount: 0 };
        applyUpdate(d, u);
        return { matchedCount: 1, modifiedCount: 1 };
    }
    async updateMany(f: Doc, u: Doc) {
        const hit = this.docs.filter((x) => matches(x, f));
        for (const d of hit) applyUpdate(d, u);
        return { matchedCount: hit.length, modifiedCount: hit.length };
    }
    findOneAndUpdate(f: Doc, u: Doc, opts: { new?: boolean; sort?: Record<string, 1 | -1> } = {}) {
        return new Q<Doc | null>(() => {
            const d = this.docs.find((x) => matches(x, f));
            if (!d) return [];
            const before = opts.new ? null : { ...d };
            applyUpdate(d, u);
            return [opts.new ? d : before!];
        }, true);
    }
    async deleteMany(f: Doc) { const before = this.docs.length; this.docs = this.docs.filter((x) => !matches(x, f)); return { deletedCount: before - this.docs.length }; }
    async distinct(key: string, f: Doc = {}) { return [...new Set(this.docs.filter((d) => matches(d, f)).map((d) => val(d, key)).filter((v) => v !== undefined))]; }
    async deleteOne(f: Doc) { const i = this.docs.findIndex((x) => matches(x, f)); if (i >= 0) this.docs.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; }
}
