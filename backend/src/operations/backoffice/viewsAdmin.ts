// BE-05 (K51): backoffice kayıtlı görünümler (yönetici başına, sunucu). SAF: model enjekte edilir; yalnız çağıranın (`sub`) kayıtlarına dokunur.
// Tenant verisi/PII yok; `query` yalnız URL süzgeç modeli (NT-03). Kaydet = (sub, screen, name) upsert (idempotent); yönetici başına <=20.
import { ApplicationError } from '@platform/core/errors';

export const MAX_VIEWS_PER_ADMIN = 20;
const QUERY_MAX_TIME_MS = 5000;

export interface ViewsDeps { model: any }

const toRow = (v: any) => ({ id: String(v._id), screen: v.screen, name: v.name, query: v.query ?? {}, createdAt: v.createdAt ?? null, updatedAt: v.updatedAt ?? null });
const need = (sub: unknown): string => (typeof sub === 'string' && sub ? sub : (() => { throw new ApplicationError('Oturum bulunamadı.', 401, 'UNAUTHENTICATED'); })());

export async function listViews(d: ViewsDeps, sub: string | undefined, screen?: string): Promise<any> {
    const owner = need(sub);
    const rows: any[] = await d.model.find(screen !== undefined ? { sub: owner, screen } : { sub: owner })
        .sort({ updatedAt: -1, _id: -1 }).limit(MAX_VIEWS_PER_ADMIN).maxTimeMS(QUERY_MAX_TIME_MS).lean();
    return { items: rows.map(toRow) };
}

export async function saveView(d: ViewsDeps, sub: string | undefined, input: { screen: string; name: string; query: Record<string, unknown> }): Promise<any> {
    const owner = need(sub);
    const key = { sub: owner, screen: input.screen, name: input.name };
    const existing: any = await d.model.findOne(key).select({ _id: 1 }).maxTimeMS(QUERY_MAX_TIME_MS).lean();
    const count: number = await d.model.countDocuments({ sub: owner }).maxTimeMS(QUERY_MAX_TIME_MS);
    if (!existing && count >= MAX_VIEWS_PER_ADMIN) throw new ApplicationError(`En fazla ${MAX_VIEWS_PER_ADMIN} kayıtlı görünüm saklanabilir.`, 409, 'VIEW_LIMIT');
    const doc: any = await d.model.findOneAndUpdate(key, { $set: { query: input.query } }, { upsert: true, new: true, setDefaultsOnInsert: true }).maxTimeMS(QUERY_MAX_TIME_MS).lean();
    return { id: String(doc._id), created: !existing, count: existing ? count : count + 1 };
}

export async function deleteView(d: ViewsDeps, sub: string | undefined, id: string): Promise<any> {
    const owner = need(sub);
    const res: any = await d.model.deleteOne({ _id: id, sub: owner }).maxTimeMS(QUERY_MAX_TIME_MS);
    return { id, deleted: (res?.deletedCount ?? 0) > 0 };
}
