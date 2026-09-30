// ADR-0029 Karar 2/3: olay defteri (ApplicationDB `NotificationEvents`) erisimi. Idempotency (uniq idemKey), grup sayaci ve
// SURECLERARASI kisma buradadir: durum surec-ici Map'te DEGIL defterde (OrderWorker'in `overflowNotifiedAt` Map'inin yerini alir).
import { NOTIFICATION_LEDGER_RETENTION_DAYS } from '@database/application/models/NotificationEvent';

export interface LedgerModelLike {
    create(doc: any): Promise<any>;
    updateOne(filter: any, update: any): Promise<any>;
    findOneAndUpdate(filter: any, update: any, opts?: any): Promise<any>;
    deleteOne(filter: any): Promise<any>;
}

export interface LedgerEventDoc {
    tid: number; code: string; category: string; severity: string; kind: 'event' | 'dedupe';
    idemKey: string; groupKey?: string; bucket?: number; lastOccurredAt: Date;
    params?: Record<string, unknown>; source?: { module?: string; corrId?: string };
}

const isDup = (e: any) => e?.code === 11000 || (typeof e?.message === 'string' && e.message.includes('E11000'));

export class NotificationLedger {
    constructor(private readonly model: LedgerModelLike, private readonly now: () => Date = () => new Date()) {}

    /** Tekil idemKey ile ekler. Dondurur {inserted:true,id} ya da {inserted:false} (zaten var). Diger hatalar FIRLATIR. */
    async tryInsert(doc: LedgerEventDoc): Promise<{ inserted: true; id: string } | { inserted: false }> {
        const createdAt = this.now();
        try {
            const created = await this.model.create({
                ...doc, count: 1, dupCount: 0, createdAt,
                expAt: new Date(createdAt.getTime() + NOTIFICATION_LEDGER_RETENTION_DAYS * 24 * 60 * 60 * 1000),
            });
            return { inserted: true, id: String(created._id) };
        } catch (e) {
            if (isDup(e)) return { inserted: false };
            throw e;
        }
    }

    /** Ayni idemKey tekrar geldi: sayac. */
    async countDuplicate(idemKey: string): Promise<void> {
        await this.model.updateOne({ idemKey }, { $inc: { dupCount: 1 } });
    }

    /** Grup penceresinde tekrar: lider kayitta atomik `$inc count`. Dondurur lider `_id` (string) ya da undefined (lider TTL'le silinmis). */
    async bumpGroupLeader(idemKey: string, lastOccurredAt: Date, params?: Record<string, unknown>): Promise<string | undefined> {
        const leader = await this.model.findOneAndUpdate(
            { idemKey },
            { $inc: { count: 1 }, $set: { lastOccurredAt, ...(params ? { params } : {}) } },
            { new: true },
        );
        return leader ? String(leader._id) : undefined;
    }

    async finalize(id: string, counts: { recipientCount: number; inAppCount: number; emailQueued: number; suppressedCount: number }): Promise<void> {
        await this.model.updateOne({ _id: id }, { $set: counts });
    }

    /** Uygulama ici yazim basarisiz: kaydi geri al ki ayni olay yeniden denenebilsin (dedupe isareti kalmasin). */
    async rollback(ids: string[]): Promise<void> {
        for (const id of ids) {
            try { await this.model.deleteOne({ _id: id }); } catch { /* en iyi caba */ }
        }
    }
}
