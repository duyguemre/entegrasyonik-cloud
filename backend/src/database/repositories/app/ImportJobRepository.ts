import { IApplicationDB } from '@interfaces/index';

/** İçe aktarım işinde "devam ediyor" sayılan durumlar (yeni çekme isteği bu durumlardan biri varken açılmaz). */
export const IMPORT_JOB_ACTIVE_STATUSES = ['FETCHING', 'PROCESSING', 'WAITING_FOR_FETCH', 'READY_TO_SYNC'];

/**
 * ADR-0024 P3-INT: `ImportJobs` (ApplicationDB, tenant kapsamı `clientId` alanıyla). Sorgu biçimleri eski
 * `IntegrationService`'ten BİREBİR; her okuma/yazma `clientId` filtresi taşır (QA-FAZ2 kritik-1 / L-04 IDOR).
 */
export class ImportJobRepository {
    constructor(private readonly db: IApplicationDB) { }

    private get model() { return this.db.getImportJobModel(); }

    findActive(clientId: unknown, integrationCode: unknown): Promise<any> {
        return this.model.findOne({ clientId, integrationCode, status: { $in: IMPORT_JOB_ACTIVE_STATUSES } });
    }

    create(doc: Record<string, any>): Promise<any> {
        return this.model.create(doc);
    }

    async list(query: Record<string, any>, sort: Record<string, 1 | -1>, skip: number, limit: number): Promise<{ items: any[]; total: number }> {
        const items = await this.model.find(query).sort(sort).skip(skip).limit(limit).lean();
        const total = await this.model.countDocuments(query);
        return { items, total };
    }

    findByJobId(jobId: unknown, clientId: unknown): Promise<any> {
        return this.model.findOne({ jobId, clientId }).lean();
    }

    /** Yalnız COMPLETED/FAILED işler arşivlenir (devam eden işler korunur). */
    archiveFinished(ids: unknown[], clientId: unknown): Promise<any> {
        return this.model.updateMany(
            { _id: { $in: ids }, clientId, status: { $in: ['COMPLETED', 'FAILED'] } },
            { $set: { status: 'ARCHIVED', archivedAt: new Date() } },
        );
    }
}
