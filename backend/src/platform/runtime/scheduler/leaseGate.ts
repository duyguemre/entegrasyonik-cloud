// ADR-0016 §2.1 adım 3/6: iş başına Mongo lease. Mevcut `@utils/mongoLease` (C23 dersiyle DÜZELTİLMİŞ, gerçek
// Mongo tip-kısıtlı `$lt` semantiğini doğru taklit eden desen) AYNEN kullanılır -- bu dosya yalnız `JobLeases`
// koleksiyonuna (iş adı anahtarlı) bağlayan İNCE bir katmandır; lease MANTIĞINA dokunmaz.
import { acquireLease, releaseLease } from '@utils/mongoLease';

export interface JobLeaseModel {
    findOneAndUpdate(filter: any, update: any, options: any): Promise<any>;
    updateOne(filter: any, update: any, options?: any): Promise<any>;
}

/**
 * `JobLeases` dokümanı ilk kullanımda YOK olabilir (statik seed yok, §"JobLease.ts" JSDoc'u). `acquireLease`
 * (mongoLease) `upsert` YAPMAZ (bilinçli -- ExportFlag emsalinde doküman başka bir akışla önceden yaratılır);
 * bu yüzden burada AYRI bir idempotent `upsert` adımıyla doküman güvenceye alınır, ardından değişmeyen
 * `acquireLease` çağrılır. Böylece `@utils/mongoLease` MODÜLÜ değişmez (Sv0, geniş çaplı etki riski taşır).
 */
async function ensureLeaseDoc(model: JobLeaseModel, name: string): Promise<void> {
    await model.updateOne(
        { name },
        { $setOnInsert: { name, leaseOwner: null, leaseUntil: null } },
        { upsert: true },
    );
}

/** Lease alınırsa güncel dokümanı, başka sahipteyse (veya eşzamanlı yarışta kaybedilirse) `null` döner. */
export async function acquireJobLease(
    model: JobLeaseModel,
    name: string,
    owner: string,
    ttlMs: number,
    now?: Date,
): Promise<any | null> {
    await ensureLeaseDoc(model, name);
    return acquireLease(model, { name }, owner, { ttlMs, now });
}

/** Yalnızca hâlâ `owner`'a aitse bırakır (başka pod devraldıysa DOKUNULMAZ -- mongoLease ile AYNI garanti). */
export async function releaseJobLease(model: JobLeaseModel, name: string, owner: string): Promise<void> {
    await releaseLease(model, { name }, owner);
}
