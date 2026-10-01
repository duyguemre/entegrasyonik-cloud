// ADR-0029 Karar 3/4 (NB5): `NotificationDeliveries` outbox erisimi. TUM durum gecisleri atomik `findOneAndUpdate`/kosullu
// `updateOne` ile yapilir (cok pod / cok isci guvenli); "once oku sonra yaz" YOK. Kira (lease) `leaseUntil` ile: kira
// suresi dolmus `sending` kayit (cokme) yeniden alinabilir. Tamamlama "fencing": yalniz KENDI leaseUntil degerini tasiyan kayit guncellenir.
export interface DeliveryDoc {
    _id: any; eventId: any; tid: number; userId: string; code: string; mode: 'instant' | 'digest';
    status: string; attempts: number; nextAttemptAt: Date; leaseUntil?: Date; createdAt: Date; locale?: 'tr' | 'en';
}

export interface CompletePatch { set?: Record<string, unknown>; unset?: string[]; inc?: Record<string, number> }

export interface DeliveryStore {
    /** Siradaki anlik kaydi kiralar (pending & vadesi gelmis, ya da kirasi dolmus sending); attempts +1. */
    leaseNextInstant(now: Date, leaseUntil: Date): Promise<DeliveryDoc | null>;
    /** Vadesi gelmis pending ozet kayitlari (kiralamadan). */
    listDigestCandidates(now: Date, limit: number): Promise<DeliveryDoc[]>;
    /** Belirli ozet kaydini kiralar (baska isci almadiysa); attempts +1. */
    leaseDigestById(id: any, now: Date, leaseUntil: Date): Promise<DeliveryDoc | null>;
    /** Fenced tamamlama: `_id` + `status:'sending'` + `leaseUntil` eslesirse uygular. */
    complete(id: any, leaseUntil: Date, patch: CompletePatch): Promise<boolean>;
}

export interface DeliveryModelPort {
    findOneAndUpdate(filter: any, update: any, opts?: any): any;
    find(filter: any): any;
    updateOne(filter: any, update: any): any;
}

const run = async (q: any) => (q && typeof q.lean === 'function' ? q.lean() : q);

export class MongoDeliveryStore implements DeliveryStore {
    /** `channel`: ayni outbox'u kanal basina ayri gonderici kiralar (MOB-04: 'push'). Ozet yalniz e-postadadir. */
    constructor(private readonly model: DeliveryModelPort, private readonly channel: 'email' | 'push' = 'email') {}

    async leaseNextInstant(now: Date, leaseUntil: Date): Promise<DeliveryDoc | null> {
        const doc = await run(this.model.findOneAndUpdate(
            { channel: this.channel, mode: 'instant', $or: [{ status: 'pending', nextAttemptAt: { $lte: now } }, { status: 'sending', leaseUntil: { $lte: now } }] },
            { $set: { status: 'sending', leaseUntil }, $inc: { attempts: 1 } },
            { sort: { nextAttemptAt: 1 }, new: true },
        ));
        return doc ?? null;
    }

    async listDigestCandidates(now: Date, limit: number): Promise<DeliveryDoc[]> {
        const q = this.model.find({ channel: 'email', mode: 'digest', status: 'pending', nextAttemptAt: { $lte: now } });
        return (await run(q.sort({ nextAttemptAt: 1 }).limit(limit))) ?? [];
    }

    async leaseDigestById(id: any, now: Date, leaseUntil: Date): Promise<DeliveryDoc | null> {
        const doc = await run(this.model.findOneAndUpdate(
            { _id: id, mode: 'digest', $or: [{ status: 'pending', nextAttemptAt: { $lte: now } }, { status: 'sending', leaseUntil: { $lte: now } }] },
            { $set: { status: 'sending', leaseUntil }, $inc: { attempts: 1 } },
            { new: true },
        ));
        return doc ?? null;
    }

    async complete(id: any, leaseUntil: Date, patch: CompletePatch): Promise<boolean> {
        const update: Record<string, unknown> = { $set: { ...(patch.set ?? {}) }, $unset: { leaseUntil: '' } };
        if (patch.unset?.length) Object.assign(update.$unset as object, Object.fromEntries(patch.unset.map((k) => [k, ''])));
        if (patch.inc) update.$inc = patch.inc;
        const r = await this.model.updateOne({ _id: id, status: 'sending', leaseUntil }, update);
        return (r?.modifiedCount ?? r?.nModified ?? 0) > 0;
    }
}
