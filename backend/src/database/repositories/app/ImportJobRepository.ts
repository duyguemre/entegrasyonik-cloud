import { IApplicationDB } from '@interfaces/index';

/**
 * ADR-0024 Dalga 3 (P3-INT): ApplicationDB `ImportJobs` (katalog içe aktarma işleri). Kurucu: uygulama DB tutamacı +
 * doğrulanmış tenant numarası; HER sorgu `clientId` ile filtrelenir (QA-FAZ2 kritik-1 / BACKLOG C4, L-04 IDOR).
 * Tenant değeri olduğu gibi kullanılır (eski çağrılar `currentClientId`'yi dönüştürmeden geçiriyordu).
 */
export class ImportJobRepository {
    constructor(private readonly db: IApplicationDB, private readonly tenantId: any) { }

    private get model() { return this.db.getImportJobModel(); }

    /** O entegrasyon için hâlâ çalışan iş (FETCHING/PROCESSING/WAITING_FOR_FETCH/READY_TO_SYNC). */
    findActive(integrationCode: any): Promise<any> {
        return this.model.findOne({
            clientId: this.tenantId,
            integrationCode,
            status: { $in: ['FETCHING', 'PROCESSING', 'WAITING_FOR_FETCH', 'READY_TO_SYNC'] }
        });
    }

    create(doc: Record<string, any>): Promise<any> {
        return this.model.create({ ...doc, clientId: this.tenantId });
    }

    /** Arşivlenmemiş işler; `integrationCode` verilirse süzülür. Liste + toplam (iki sorgu, aynı filtre). */
    async listPage(integrationCode: any, sort: Record<string, number>, skip: number, limit: number): Promise<{ items: any[]; total: number }> {
        const query: any = { clientId: this.tenantId, status: { $ne: 'ARCHIVED' } };
        if (integrationCode) query.integrationCode = integrationCode;
        const items = await this.model
            .find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean();
        const total = await this.model.countDocuments(query);
        return { items, total };
    }

    findByJobId(jobId: any): Promise<any> {
        return this.model.findOne({ jobId: jobId, clientId: this.tenantId }).lean();
    }

    /** Yalnız COMPLETED/FAILED işler arşivlenir (devam eden işler korunur). */
    archive(ids: any[]): Promise<any> {
        return this.model.updateMany(
            {
                _id: { $in: ids },
                clientId: this.tenantId,
                status: { $in: ['COMPLETED', 'FAILED'] }
            },
            {
                $set: {
                    status: 'ARCHIVED',
                    archivedAt: new Date()
                }
            }
        );
    }
}
