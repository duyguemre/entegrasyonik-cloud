// Bellek-içi sahte Mongoose modeli (B1/B7 testleri): gerçek Mongo'nun TİP-KISITLI karşılaştırma semantiğini taklit eder
// ($lt/$lte/$gte yalnız aynı tipteki (Date/number/string) alanla eşleşir; `null` eşitliği alan-yok'u da eşler). DB/Redis/ağ YOK.
type Doc = Record<string, any>;

const isDate = (v: any) => v instanceof Date;
const cmpOk = (a: any, b: any) => (isDate(a) && isDate(b)) || (typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string'); // Mongo: aynı tip string'ler de sıralanır (MOB-08 gün anahtarı)
const val = (d: Doc, path: string) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), d);

function matchField(v: any, cond: any): boolean {
    if (cond !== null && typeof cond === 'object' && !isDate(cond) && Object.keys(cond).some((k) => k.startsWith('$'))) {
        return Object.entries(cond).every(([op, arg]: [string, any]) => {
            switch (op) {
                case '$ne': return arg === null ? v !== null && v !== undefined : v !== arg;
                case '$lt': return cmpOk(v, arg) && v < arg;
                case '$lte': return cmpOk(v, arg) && v <= arg;
                case '$gte': return cmpOk(v, arg) && v >= arg;
                case '$gt': return cmpOk(v, arg) && v > arg;
                case '$in': return (arg as any[]).some((a) => (a === null ? v == null : eq(v, a)));
                default: throw new Error('fake: desteklenmeyen operatör ' + op);
            }
        });
    }
    if (cond === null) return v === null || v === undefined;
    if (Array.isArray(v) && !Array.isArray(cond)) return v.some((x) => eq(x, cond)); // Mongo: dizi alanı, skaler koşulu 'içerir' ile eşler
    return eq(v, cond);
}
const eq = (a: any, b: any) => (isDate(a) && isDate(b) ? a.getTime() === b.getTime() : String(a) === String(b) && typeof a === typeof b || a === b);

export function matches(d: Doc, f: Doc): boolean {
    return Object.entries(f).every(([k, c]) => {
        if (k === '$or') return (c as Doc[]).some((x) => matches(d, x));
        if (k === '$and') return (c as Doc[]).every((x) => matches(d, x));
        return matchField(val(d, k), c);
    });
}

class Cursor {
    private sortSpec: Record<string, 1 | -1> = {};
    private lim = Infinity;
    public maxTime?: number;
    constructor(private rows: Doc[]) { }
    sort(s: Record<string, 1 | -1>) { this.sortSpec = s; return this; }
    limit(n: number) { this.lim = n; return this; }
    select(_: any) { return this; }
    maxTimeMS(n: number) { this.maxTime = n; return this; }
    lean() { return this; }
    then(res: (v: Doc[]) => any, rej?: (e: any) => any) {
        const out = [...this.rows];
        const keys = Object.entries(this.sortSpec);
        out.sort((a, b) => { for (const [k, dir] of keys) { const x = a[k], y = b[k]; const c = x < y ? -1 : x > y ? 1 : 0; if (c) return c * dir; } return 0; });
        return Promise.resolve(out.slice(0, this.lim)).then(res, rej);
    }
}

class OneCursor extends Cursor {
    then(res: (v: any) => any, rej?: (e: any) => any) { return super.then((rows) => rows[0] ?? null, rej).then(res, rej); }
}

class Thenable<T> {
    public maxTime?: number;
    constructor(private fn: () => T) { }
    maxTimeMS(n: number) { this.maxTime = n; return this; }
    option(_: any) { return this; }
    catch(rej: (e: any) => any) { return Promise.resolve().then(this.fn).catch(rej); }
    then(res: (v: T) => any, rej?: (e: any) => any) { return Promise.resolve().then(this.fn).then(res, rej); }
}

export class FakeModel {
    public calls: Array<{ op: string; arg: any; maxTime?: number }> = [];
    public aggregateResult: Doc[] | ((pipeline: any[]) => Doc[]) = [];
    public failWith?: Error;
    constructor(public docs: Doc[] = []) { }
    find(f: Doc = {}) { this.calls.push({ op: 'find', arg: f }); if (this.failWith) throw this.failWith; return new Cursor(this.docs.filter((d) => matches(d, f))); }
    findOne(f: Doc) { return new OneCursor(this.docs.filter((d) => matches(d, f))) as any; }
    countDocuments(f: Doc = {}) { this.calls.push({ op: 'count', arg: f }); return new Thenable(() => { if (this.failWith) throw this.failWith; return this.docs.filter((d) => matches(d, f)).length; }); }
    aggregate(p: any[]) { this.calls.push({ op: 'aggregate', arg: p }); return new Thenable(() => { if (this.failWith) throw this.failWith; return typeof this.aggregateResult === 'function' ? this.aggregateResult(p) : this.aggregateResult; }); }
    updateOne(f: Doc, u: Doc) {
        this.calls.push({ op: 'updateOne', arg: { f, u } });
        return new Thenable(() => {
            const d = this.docs.find((x) => matches(x, f));
            if (!d) return { matchedCount: 0, modifiedCount: 0 };
            Object.assign(d, u.$set ?? {});
            return { matchedCount: 1, modifiedCount: 1 };
        });
    }
}
export class FakeJob {
    removed = false; retried = false;
    constructor(public id: string, public name: string, public data: any, public state: string, public failedReason = '[UNAVAILABLE] x', public attemptsMade = 5, public finishedOn = 1_700_000_000_000, public timestamp = 1_699_999_000_000, public opts = { attempts: 5 }) { }
    async getState() { return this.state; }
    async retry(s?: string) { if (s !== 'failed') throw new Error('bad state'); this.retried = true; this.state = 'waiting'; }
    async remove() { this.removed = true; }
}

export class FakeQueue {
    constructor(public jobs: FakeJob[] = [], public counts: Record<string, number> = {}) { }
    async getJobCounts(...t: string[]) { return Object.fromEntries(t.map((k) => [k, this.counts[k] ?? 0])); }
    async getJobs(types: string[], start: number, end: number) { return this.jobs.filter((j) => types.includes(j.state)).slice(start, end + 1); }
    async getJob(id: string) { return this.jobs.find((j) => j.id === id) ?? null; }
}
