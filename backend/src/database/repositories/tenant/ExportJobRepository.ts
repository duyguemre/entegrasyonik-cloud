import { IClientDB } from '@interfaces/index';

/** Dışa aktarma iş listesi projeksiyonu (FE log listesi; `logs` performans için dahil DEĞİL). */
const EXPORT_JOB_LIST_PROJECTION = {
    batchId: 1,
    integrationCode: 1,
    barcode: 1,
    mode: 1,
    status: 1,
    completedAt: 1,
    createdAt: 1,
    updatedAt: 1,
    trackingId: 1,
    title: 1,
    image: 1,
    stock: 1,
    price: 1,
    stockcode: 1,
    category: 1,
    brand: 1,
    choices: 1,
};

/**
 * ADR-0024 D6 / MM-02 (P3-INT): `ExportStagedProducts` (dışa aktarma iş kalemleri). ADR'de `repositories/app/` yazar; model
 * staging göçünden beri TENANT DB'dedir, bu yüzden `tenant/` altında. `advancedSearchExportJobs` ve `getExportJobs` tek
 * `search`'ü kullanır (filtre kurucuları `operations/integrations/exportJobs.ts`). Sorgu biçimi (aggregate + countDocuments)
 * eskisiyle aynıdır.
 */
export class ExportJobRepository {
    constructor(private readonly db: IClientDB) { }

    async search(match: Record<string, any>, sort: Record<string, 1 | -1>, skip: number, limit: number): Promise<{ items: any[]; total: number }> {
        const model = this.db.getExportStagedProductModel();
        const items = await model.aggregate([
            { $match: match },
            { $sort: sort },
            { $skip: skip },
            { $limit: limit },
            { $project: EXPORT_JOB_LIST_PROJECTION }
        ]);
        const total = await model.countDocuments(match);
        return { items, total };
    }

    findById(id: any): Promise<any> {
        return this.db.getExportStagedProductModel().findById(id).lean();
    }
}
