// ADR-0034 BR-3: ONAY KARTINDAN ONCE model kaynakli kimliklerin varlik/sahiplik dogrulamasi. Model kimlik UYDURABILIR ya da baska tenant'in kimligini
// deneyebilir; kart yalniz bu tenant'ta GERCEKTEN var olan kayitlar icin uretilir. Tenant verisi ayri DB'de oldugundan (ClientDB) "var" = "tenant'a ait".
// Yazma yetenegi basina tek dogrulayici; tanimsiz yetenek icin dogrulama yoktur (yeni yazma yetenegi acan kisi buraya ekler -- statik test hatirlatir).
import type { AgentCtx } from './types';
import type { RefProblem } from './tools';

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/** Dogrulayici: verilen girdideki `missing` (var olmayan) kimlikleri doner. Saf I/O dogrulayici, yan etkisi yoktur. */
type Verifier = (tid: number, input: any) => Promise<string[]>;

async function existingOrderIds(tid: number, ids: string[]): Promise<Set<string>> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- tembel yukleme: bu modulu yuklemek DB katmanini yuklemez
    const { DatabaseManagerInstance } = require('@database/DatabaseManager') as typeof import('@database/DatabaseManager');
    const db = await DatabaseManagerInstance.getClientDB(tid);
    if (!db) throw new Error('tenant db yok');
    const rows: Array<{ _id: unknown }> = await db.getOrderModel().find({ _id: { $in: ids } }, { _id: 1 }).lean();
    return new Set(rows.map((r) => String(r._id)));
}

async function existingVariantRefs(tid: number, ids: string[], barcodes: string[]): Promise<{ ids: Set<string>; barcodes: Set<string> }> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- tembel yukleme (bkz. existingOrderIds)
    const { DatabaseManagerInstance } = require('@database/DatabaseManager') as typeof import('@database/DatabaseManager');
    const db = await DatabaseManagerInstance.getClientDB(tid);
    if (!db) throw new Error('tenant db yok');
    const or: any[] = [];
    if (ids.length) or.push({ _id: { $in: ids } });
    if (barcodes.length) or.push({ barcode: { $in: barcodes } });
    const rows: Array<{ _id: unknown; barcode?: string }> = or.length ? await db.getVariantModel().find({ $or: or }, { _id: 1, barcode: 1 }).lean() : [];
    return { ids: new Set(rows.map((r) => String(r._id))), barcodes: new Set(rows.map((r) => String(r.barcode ?? ''))) };
}

export const REF_VERIFIERS: Readonly<Record<string, Verifier>> = {
    // PRC-R0: maliyet yazımı — kart yalnız bu tenant'ta VAR OLAN varyantlar için (variantId ya da barkod).
    'pricing.cost.set': async (tid, input) => {
        const items: any[] = Array.isArray(input?.items) ? input.items : [];
        const ids = [...new Set(items.map((x) => x?.variantId).filter((x): x is string => typeof x === 'string'))];
        const bcs = [...new Set(items.map((x) => x?.barcode).filter((x): x is string => typeof x === 'string' && x !== ''))];
        const wellFormed = ids.filter((id) => OBJECT_ID.test(id));
        const found = (wellFormed.length || bcs.length) ? await existingVariantRefs(tid, wellFormed, bcs) : { ids: new Set<string>(), barcodes: new Set<string>() };
        return [...ids.filter((id) => !found.ids.has(id)), ...bcs.filter((b) => !found.barcodes.has(b))];
    },
    'orders.approve': async (tid, input) => {
        const raw: unknown[] = Array.isArray(input?.orderIds) ? input.orderIds : [];
        const ids = raw.filter((x): x is string => typeof x === 'string');
        const unique = [...new Set(ids)];
        const wellFormed = unique.filter((id) => OBJECT_ID.test(id));
        const found = wellFormed.length ? await existingOrderIds(tid, wellFormed) : new Set<string>();
        return unique.filter((id) => !found.has(id));
    },
};

/** `ToolRuntime.verifyRefs` canli uygulamasi. */
export async function dbVerifyRefs(ctx: AgentCtx, capId: string, input: unknown): Promise<RefProblem | undefined> {
    const v = REF_VERIFIERS[capId];
    if (!v) return undefined;
    const missing = await v(ctx.tid, input);
    return missing.length ? { code: 'ENTITY_NOT_FOUND', missing } : undefined;
}
