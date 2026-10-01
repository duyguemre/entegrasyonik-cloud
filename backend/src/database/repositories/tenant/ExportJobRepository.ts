import { IClientDB } from '@interfaces/index';

/** Dışa aktarım iş listesi projeksiyonu (log/payload ağır alanlar listeye girmez; detay `findById` ile okunur). */
const EXPORT_JOB_LIST_PROJECTION = {
    batchId: 1, integrationCode: 1, barcode: 1, mode: 1, status: 1, completedAt: 1, createdAt: 1, updatedAt: 1, trackingId: 1,
    title: 1, image: 1, stock: 1, price: 1, stockcode: 1, category: 1, brand: 1, choices: 1,
};

/**
 * ADR-0024 P3-INT / MM-02: dışa aktarım işleri (`ExportStagedProducts`, tenant DB). Eski `advancedSearchExportJobs` ve
 * `getExportJobs` aynı toplulaştırmayı kopyalıyordu; tek `search` (sorgu biçimi BİREBİR: $match -> $sort -> $skip -> $limit ->
 * $project, ardından ayrı `countDocuments`). ADR yolu `repositories/app/` idi; model ADR-0013'ten beri tenant DB'de olduğu için `tenant/`.
 */
export class ExportJobRepository {
    constructor(private readonly db: IClientDB) { }

    private get model() { return this.db.getExportStagedProductModel(); }

    findById(id: unknown): Promise<any> {
        return this.model.findById(id).lean();
    }

    async search(match: Record<string, any>, sort: Record<string, 1 | -1>, skip: number, limit: number): Promise<{ items: any[]; total: number }> {
        const items = await this.model.aggregate([
            { $match: match },
            { $sort: sort },
            { $skip: skip },
            { $limit: limit },
            { $project: EXPORT_JOB_LIST_PROJECTION },
        ]);
        const total = await this.model.countDocuments(match);
        return { items, total };
    }
}
