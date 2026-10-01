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

export const REF_VERIFIERS: Readonly<Record<string, Verifier>> = {
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
