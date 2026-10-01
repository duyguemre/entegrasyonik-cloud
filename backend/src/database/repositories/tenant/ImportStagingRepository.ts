import { IClientDB } from '@interfaces/index';

/** ADR-0024 P3-INT: içe aktarım ara (staging) koleksiyonları ve iş raporu (tenant DB). */
export class ImportStagingRepository {
    constructor(private readonly db: IClientDB) { }

    /** Yeni çekme öncesi temizlik: entegrasyonun önceki işlerine ait staged ürün/özet ve raporlar silinir. */
    async clearForIntegration(integrationCode: unknown): Promise<void> {
        await Promise.all([
            this.db.getImportStagedProductModel().deleteMany({ jobId: { $exists: true }, integrationCode }),
            this.db.getImportStagedProductSummaryModel().deleteMany({ jobId: { $exists: true }, integrationCode }),
            this.db.getImportJobReportModel().deleteMany({ integrationCode }),
        ]);
    }

    findReport(jobId: unknown, clientId: unknown): Promise<any> {
        return this.db.getImportJobReportModel().findOne({ jobId, clientId }).lean();
    }
}
