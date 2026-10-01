/**
 * `platform/runtime/scheduler` testleri için paylaşılan sahte Mongo modelleri.
 * Lease koleksiyonu `tests/unit/mongoLease.test.ts`'teki `FakeLeaseCollection` ile AYNI gerçek-Mongo semantiğini
 * (tip-kısıtlı `$lt`, `{field:null}` hem null hem alan-yok eşler -- C23 düzeltmesi) taklit eder; ek olarak
 * `updateOne(..., {upsert:true})` (JobLeases dokümanının ilk kullanımda yaratılması için, `leaseGate.ts`) destekler.
 */
export class FakeJobLeaseCollection {
    docs: any[];
    constructor(docs: any[] = []) { this.docs = docs.map((d) => ({ ...d })); }

    private matchesOr(doc: any, or: any[]): boolean {
        return or.some((cond) => {
            if ('leaseUntil' in cond && cond.leaseUntil === null) {
                return doc.leaseUntil === null || doc.leaseUntil === undefined;
            }
            if (cond.leaseUntil && typeof cond.leaseUntil === 'object' && '$lt' in cond.leaseUntil) {
                const bound = cond.leaseUntil.$lt as Date;
                const val = doc.leaseUntil;
                if (!(val instanceof Date)) return false;
                return val.getTime() < bound.getTime();
            }
            if ('leaseOwner' in cond) return doc.leaseOwner === cond.leaseOwner;
            return false;
        });
    }

    async findOneAndUpdate(filter: any, update: any, _options: any): Promise<any | null> {
        const { $or, ...rest } = filter;
        const doc = this.docs.find((d) => {
            for (const [k, v] of Object.entries(rest)) if (d[k] !== v) return false;
            return $or ? this.matchesOr(d, $or) : true;
        });
        if (!doc) return null;
        Object.assign(doc, update.$set);
        return { ...doc };
    }

    async updateOne(filter: any, update: any, options: any = {}): Promise<any> {
        const doc = this.docs.find((d) => Object.entries(filter).every(([k, v]) => d[k] === v));
        if (doc) {
            if (update.$set) Object.assign(doc, update.$set);
            return { acknowledged: true, matchedCount: 1 };
        }
        if (options.upsert) {
            const created: any = { ...filter, ...(update.$setOnInsert ?? {}), ...(update.$set ?? {}) };
            this.docs.push(created);
            return { acknowledged: true, matchedCount: 0, upsertedCount: 1 };
        }
        return { acknowledged: true, matchedCount: 0 };
    }
}

export class FakeJobStateCollection {
    docs: any[] = [];

    async findOneAndUpdate(filter: any, update: any, _options: any): Promise<any> {
        let doc = this.docs.find((d) => Object.entries(filter).every(([k, v]) => d[k] === v));
        if (!doc) {
            doc = { ...filter };
            this.docs.push(doc);
        }
        if (update.$set) Object.assign(doc, update.$set);
        if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) doc[k] = (doc[k] ?? 0) + (v as number);
        return { ...doc };
    }

    async findOne(filter: any): Promise<any | null> {
        const doc = this.docs.find((d) => Object.entries(filter).every(([k, v]) => d[k] === v));
        return doc ? { ...doc } : null;
    }
}

export class FakeJobRunCollection {
    docs: any[] = [];
    async create(doc: Record<string, unknown>): Promise<any> {
        const stored = { ...doc };
        this.docs.push(stored);
        return stored;
    }
}
