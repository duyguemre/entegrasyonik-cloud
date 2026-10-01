import { ObjectId } from 'mongodb';
import { IClientDB } from '@interfaces/index';

/**
 * ADR-0024 Dalga 3 (P3-INT): katalog içe aktarma ara tabloları ve iş raporu (tenant DB). Kurucu: tenant DB tutamacı +
 * doğrulanmış tenant numarası (rapor belgesi `clientId` alanı taşır; eski sorgu biçimi korunur).
 */
export class ImportStagingRepository {
    constructor(private readonly db: IClientDB, private readonly tenantId: any) { }

    /** Yeni içe aktarma öncesi temizlik: o entegrasyonun ara ürün/özet kayıtları ve raporları. */
    async clearForIntegration(integrationCode: any): Promise<void> {
        await Promise.all([
            this.db.getImportStagedProductModel().deleteMany({ jobId: { $exists: true }, integrationCode }),
            this.db.getImportStagedProductSummaryModel().deleteMany({ jobId: { $exists: true }, integrationCode }),
            this.db.getImportJobReportModel().deleteMany({ integrationCode })
        ]);
    }

    findReport(jobId: any): Promise<any> {
        return this.db.getImportJobReportModel().findOne({
            jobId: new ObjectId(jobId),
            clientId: this.tenantId
        }).lean();
    }
}
