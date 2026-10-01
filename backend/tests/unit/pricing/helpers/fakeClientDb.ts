/**
 * PRC-R2 testleri için BELLEK-İÇİ sahte ClientDB (gerçek Mongo YOK; bulutta mongodb-memory-server indirilemez).
 * Yalnız fiyat kuralı operasyonlarının kullandığı alt küme: eşitlik/$in/$exists/$gt(e)/$lt(e)/$ne/$type/$or süzgeci, noktalı yol,
 * $set/$unset/$inc/$setOnInsert güncellemesi, upsert, bulkWrite (updateOne/updateMany), $match+$group ($sum/$min) toplaması.
 * Her örnek AYRI bir tenant DB'sidir (K2 izolasyon testi iki ayrı örnekle yapılır).
 */
import { ObjectId } from 'mongodb';

type Doc = Record<string, any>;

const get = (o: any, path: string): any => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const set = (o: any, path: string, v: any) => {
    const ks = path.split('.');
    let cur = o;
    for (const k of ks.slice(0, -1)) { if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k]; }
    cur[ks[ks.length - 1]] = v;
};
const unset = (o: any, path: string) => {
    const ks = path.split('.');
    const parent = ks.length > 1 ? get(o, ks.slice(0, -1).join('.')) : o;
    if (parent && typeof parent === 'object') delete parent[ks[ks.length - 1]];
};
const norm = (v: any) => (v instanceof ObjectId ? String(v) : v instanceof Date ? v.getTime() : v);
const eq = (a: any, b: any) => {
    if (Array.isArray(a) && !Array.isArray(b)) return a.some((x) => norm(x) === norm(b));
    return norm(a) === norm(b);
};
const clone = <T>(v: T): T => {
    if (v instanceof ObjectId || v instanceof Date) return v;
    if (Array.isArray(v)) return v.map(clone) as any;
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) as any;
    return v;
};

function matchCond(val: any, cond: any): boolean {
    if (cond && typeof cond === 'object' && !(cond instanceof ObjectId) && !(cond instanceof Date) && !Array.isArray(cond)) {
        const keys = Object.keys(cond);
        if (keys.length && keys.every((k) => k.startsWith('$'))) {
            return keys.every((op) => {
                const c = cond[op];
                switch (op) {
                    case '$in': return (c as any[]).some((x) => eq(val, x));
                    case '$nin': return !(c as any[]).some((x) => eq(val, x));
                    case '$ne': return !eq(val, c);
                    case '$exists': return c ? val !== undefined : val === undefined;
                    case '$gt': return val != null && norm(val) > norm(c);
                    case '$gte': return val != null && norm(val) >= norm(c);
                    case '$lt': return val != null && norm(val) < norm(c);
                    case '$lte': return val != null && norm(val) <= norm(c);
                    case '$type': return c === 'string' ? typeof val === 'string' : c === 'number' ? typeof val === 'number' : true;
                    default: throw new Error(`fake: desteklenmeyen operatör ${op}`);
                }
            });
        }
    }
    return eq(val, cond);
}

export function matches(doc: Doc, filter: Doc = {}): boolean {
    return Object.entries(filter).every(([k, cond]) => {
        if (k === '$or') return (cond as Doc[]).some((f) => matches(doc, f));
        if (k === '$and') return (cond as Doc[]).every((f) => matches(doc, f));
        return matchCond(get(doc, k), cond);
    });
}

function applyUpdate(doc: Doc, update: Doc, inserting: boolean) {
    for (const [op, body] of Object.entries(update)) {
        if (op === '$set') for (const [p, v] of Object.entries(body as Doc)) set(doc, p, clone(v));
        else if (op === '$unset') for (const p of Object.keys(body as Doc)) unset(doc, p);
        else if (op === '$inc') for (const [p, v] of Object.entries(body as Doc)) set(doc, p, (get(doc, p) ?? 0) + (v as number));
        else if (op === '$setOnInsert') { if (inserting) for (const [p, v] of Object.entries(body as Doc)) set(doc, p, clone(v)); }
        else throw new Error(`fake: desteklenmeyen güncelleme ${op}`);
    }
}

class Query {
    private sortSpec: Doc | null = null;
    private lim = Infinity;
    constructor(private readonly rows: () => Doc[]) { }
    sort(s: Doc) { this.sortSpec = s; return this; }
    limit(n: number) { this.lim = n; return this; }
    maxTimeMS() { return this; }
    select() { return this; }
    async lean() {
        let r = this.rows();
        if (this.sortSpec) {
            const [[k, dir]] = Object.entries(this.sortSpec);
            r = [...r].sort((a, b) => (norm(get(a, k)) > norm(get(b, k)) ? 1 : norm(get(a, k)) < norm(get(b, k)) ? -1 : 0) * (dir as number));
        }
        return r.slice(0, this.lim).map(clone);
    }
    then(res: any, rej: any) { return this.lean().then(res, rej); }
}

export class FakeModel {
    docs: Doc[] = [];
    constructor(private readonly opts: { idFactory?: () => any } = {}) { }
    private newId() { return this.opts.idFactory ? this.opts.idFactory() : new ObjectId(); }
    find(filter: Doc = {}) { return new Query(() => this.docs.filter((d) => matches(d, filter))); }
    findOne(filter: Doc = {}) { const q = new Query(() => this.docs.filter((d) => matches(d, filter)).slice(0, 1)); return { lean: async () => (await q.lean())[0] ?? null }; }
    async countDocuments(filter: Doc = {}) { return this.docs.filter((d) => matches(d, filter)).length; }
    async create(doc: Doc) {
        const d = { _id: this.newId(), ...clone(doc) };
        this.docs.push(d);
        return { ...clone(d), toObject: () => clone(d) };
    }
    async insertMany(docs: Doc[]) { for (const d of docs) await this.create(d); }
    async updateOne(filter: Doc, update: Doc, o: { upsert?: boolean } = {}) {
        const d = this.docs.find((x) => matches(x, filter));
        if (d) { applyUpdate(d, update, false); return { matchedCount: 1, modifiedCount: 1 }; }
        if (o.upsert) {
            const base: Doc = { _id: this.newId() };
            for (const [k, v] of Object.entries(filter)) if (!k.startsWith('$') && (typeof v !== 'object' || v instanceof ObjectId || v instanceof Date)) set(base, k, v);
            applyUpdate(base, update, true);
            this.docs.push(base);
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        }
        return { matchedCount: 0, modifiedCount: 0 };
    }
    async updateMany(filter: Doc, update: Doc) {
        const hit = this.docs.filter((x) => matches(x, filter));
        for (const d of hit) applyUpdate(d, update, false);
        return { matchedCount: hit.length, modifiedCount: hit.length };
    }
    async bulkWrite(ops: Doc[]) {
        for (const op of ops) {
            if (op.updateOne) await this.updateOne(op.updateOne.filter, op.updateOne.update, { upsert: op.updateOne.upsert });
            else if (op.updateMany) await this.updateMany(op.updateMany.filter, op.updateMany.update);
            else throw new Error('fake: desteklenmeyen bulkWrite');
        }
    }
    findOneAndUpdate(filter: Doc, update: Doc) {
        return { lean: async () => { const d = this.docs.find((x) => matches(x, filter)); if (!d) return null; applyUpdate(d, update, false); return clone(d); } };
    }
    findOneAndDelete(filter: Doc) {
        return { lean: async () => { const i = this.docs.findIndex((x) => matches(x, filter)); if (i < 0) return null; const [d] = this.docs.splice(i, 1); return clone(d); } };
    }
    aggregate(pipeline: Doc[]) {
        const run = async () => {
            let rows = this.docs.map(clone);
            for (const st of pipeline) {
                if (st.$match) rows = rows.filter((d) => matches(d, st.$match));
                else if (st.$group) {
                    const keyOf = (d: Doc): any => {
                        const idSpec = st.$group._id;
                        const ev = (e: any): any => {
                            if (typeof e === 'string' && e.startsWith('$')) return get(d, e.slice(1));
                            if (e && typeof e === 'object' && '$ifNull' in e) { const v = ev(e.$ifNull[0]); return v ?? e.$ifNull[1]; }
                            if (e && typeof e === 'object') return Object.fromEntries(Object.entries(e).map(([k, x]) => [k, ev(x)]));
                            return e;
                        };
                        return ev(idSpec);
                    };
                    const groups = new Map<string, { _id: any; rows: Doc[] }>();
                    for (const d of rows) {
                        const id = keyOf(d);
                        const k = JSON.stringify(id, (_k, v) => (v instanceof ObjectId ? String(v) : v));
                        if (!groups.has(k)) groups.set(k, { _id: id, rows: [] });
                        groups.get(k)!.rows.push(d);
                    }
                    rows = [...groups.values()].map((g) => {
                        const out: Doc = { _id: g._id };
                        for (const [f, acc] of Object.entries(st.$group)) {
                            if (f === '_id') continue;
                            const a = acc as Doc;
                            if ('$sum' in a) out[f] = g.rows.reduce((s, r) => s + (typeof a.$sum === 'number' ? a.$sum : Number(get(r, String(a.$sum).slice(1))) || 0), 0);
                            else if ('$min' in a) {
                                const vals = g.rows.map((r) => get(r, String(a.$min).slice(1))).filter((v) => typeof v === 'number');
                                out[f] = vals.length ? Math.min(...vals) : null;
                            } else throw new Error('fake: desteklenmeyen akümülatör');
                        }
                        return out;
                    });
                } else throw new Error('fake: desteklenmeyen aşama');
            }
            return rows;
        };
        const p: any = run();
        p.option = () => p;
        return p;
    }
}

export function fakeClientDb() {
    const models = {
        variant: new FakeModel(), product: new FakeModel(), priceRule: new FakeModel(), priceSuggestion: new FakeModel(),
        priceHistory: new FakeModel(), pricingSettings: new FakeModel(), buyboxSnapshot: new FakeModel(),
    };
    return {
        models,
        getVariantModel: () => models.variant,
        getProductModel: () => models.product,
        getPriceRuleModel: () => models.priceRule,
        getPriceSuggestionModel: () => models.priceSuggestion,
        getPriceHistoryModel: () => models.priceHistory,
        getPricingSettingsModel: () => models.pricingSettings,
        getBuyboxSnapshotModel: () => models.buyboxSnapshot,
    };
}
