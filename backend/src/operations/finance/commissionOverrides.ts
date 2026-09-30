// COM-04: tenant komisyon override (kanal/kategori). Yazim + onbellekli okuma. Tenant izolasyonu: `clientDB` secimi (tenant DB) + tenant kapsamli @Cache.
// Oncelik (saf mantik: ./commissionSummary): kategori override > kanal varsayilan override > gerceklesen > tahmini > bilinmiyor.
import { Cache, invalidateTenantCache } from '@utils/decorator/cache';
import { ApplicationError } from '@platform/core/errors';
import type { OverrideRow } from './commissionSummary';

/** Onbellek ailesi (yazimda bu aile tenant icin dusurulur). */
const OVERRIDE_CACHE_CONTEXT = 'CommissionOverrides';

type OverrideScope = 'category' | 'default';

interface SetOverrideInput {
    integrationCode: string;
    scope: OverrideScope;
    platformCategoryId?: string;
    rate: number;
    note?: string;
}

/** 0-100, en cok 2 ondalik; aksi halde 400. Float hatasina karsi 100'le carpip tamsayi kontrolu (1e-9 toleransi). */
export function assertValidRate(rate: unknown): number {
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100) throw new ApplicationError('rate 0-100 arasinda olmali.', 400);
    const scaled = rate * 100;
    if (Math.abs(scaled - Math.round(scaled)) > 1e-7) throw new ApplicationError('rate en cok 2 ondalik olabilir.', 400);
    return Math.round(scaled) / 100;
}

const norm = (code: string) => code.trim().toLowerCase();

export class CommissionOverrideStore {
    /** `clientId`/`integrationCode` @Cache anahtar oneki icin (tenant + kanal) gerekir. */
    constructor(private readonly clientDB: any, private readonly clientId: any, private readonly integrationCode: string = '-') { }

    /** Bir kanalin tum override satirlari (yalniz cozumleme icin gereken alanlar). 10 dk; yazimda tenant icin dusurulur. */
    @Cache({ scope: 'tenant', ttl: '10m', context: OVERRIDE_CACHE_CONTEXT })
    async loadRows(): Promise<OverrideRow[]> {
        const docs: any[] = await this.clientDB.getCommissionOverrideModel()
            .find({ integrationCode: norm(this.integrationCode) }, { scope: 1, platformCategoryId: 1, rate: 1 }).limit(5000).lean();
        return docs.map(d => ({ scope: d.scope, platformCategoryId: d.platformCategoryId ?? null, rate: d.rate }));
    }
}

/** Override'lari okur (FE listesi); onbellek YOK (nadir cagri, guncel gorunum). */
export async function listCommissionOverrides(clientDB: any, input: { integrationCode?: string }) {
    const filter = input.integrationCode ? { integrationCode: norm(input.integrationCode) } : {};
    const docs: any[] = await clientDB.getCommissionOverrideModel().find(filter).sort({ integrationCode: 1, scope: 1, platformCategoryId: 1 }).limit(5000).lean();
    return docs.map(d => ({
        id: String(d._id), integrationCode: d.integrationCode, scope: d.scope, platformCategoryId: d.platformCategoryId ?? null,
        rate: d.rate, note: d.note ?? null, updatedBy: d.updatedBy, updatedAt: d.updatedAt,
    }));
}

/** Olusturur/gunceller (upsert; tekil anahtar {integrationCode, scope, platformCategoryId}). */
export async function setCommissionOverride(clientDB: any, clientId: any, actor: string, input: SetOverrideInput) {
    const rate = assertValidRate(input.rate);
    const integrationCode = norm(input.integrationCode);
    if (!integrationCode) throw new ApplicationError('integrationCode gerekli.', 400);
    let platformCategoryId: string | null = null;
    if (input.scope === 'category') {
        if (typeof input.platformCategoryId !== 'string' || input.platformCategoryId.trim() === '') throw new ApplicationError("scope 'category' icin platformCategoryId zorunlu.", 400);
        platformCategoryId = input.platformCategoryId.trim();
    } else if (input.scope === 'default') {
        if (input.platformCategoryId !== undefined && input.platformCategoryId !== null && input.platformCategoryId !== '') throw new ApplicationError("scope 'default' icin platformCategoryId verilmez.", 400);
    } else throw new ApplicationError('scope gecersiz.', 400);

    const key: any = { integrationCode, scope: input.scope, platformCategoryId };
    const set: any = { rate, updatedBy: actor, updatedAt: new Date() };
    const unset: any = {};
    if (typeof input.note === 'string' && input.note.trim() !== '') set.note = input.note.trim(); else unset.note = '';
    const update: any = { $set: set, $setOnInsert: { schemaVersion: 1 } };
    if (Object.keys(unset).length) update.$unset = unset;
    // `default` kaydinda platformCategoryId null yazilir (tekil indeks null'u tek deger sayar; eksik alanla ayni).
    const doc: any = await clientDB.getCommissionOverrideModel().findOneAndUpdate(key, update, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    invalidateTenantCache(clientId, OVERRIDE_CACHE_CONTEXT);
    return { id: String(doc._id), integrationCode, scope: input.scope, platformCategoryId, rate, note: doc.note ?? null, updatedBy: actor, updatedAt: doc.updatedAt };
}

export async function deleteCommissionOverride(clientDB: any, clientId: any, input: { id: string }) {
    const res: any = await clientDB.getCommissionOverrideModel().deleteOne({ _id: input.id });
    if (!res?.deletedCount) throw new ApplicationError('Override bulunamadi.', 404);
    invalidateTenantCache(clientId, OVERRIDE_CACHE_CONTEXT);
    return { deleted: true };
}
