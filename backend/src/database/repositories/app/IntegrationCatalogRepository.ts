import { IApplicationDB } from '@interfaces/index';

/**
 * ADR-0024 Dalga 3 (P3-INT): platform entegrasyon kataloğu (ApplicationDB `Integrations`, `IntegrationTypes`) ve
 * tenant×entegrasyon bağı üzerindeki webhook belirteci (`Clients.integrations[]`). Salt platform verisi; tenant sırları yok.
 */
export class IntegrationCatalogRepository {
    constructor(private readonly db: IApplicationDB) { }

    /** Tüm entegrasyonlar (tip doldurulmuş, `_id` artan, yalın); `projection` çağıran tarafından verilir. */
    listIntegrations(projection: Record<string, 0 | 1>): Promise<any[]> {
        return this.db.getIntegrationModel().find({}, { projection }).sort({ _id: 1 }).populate('type').lean();
    }

    listIntegrationTypes(): Promise<any> {
        return this.db.getIntegrationTypeModel().find({});
    }

    /** Dışa aktarma sinyalinin bir sonraki çalışma zamanı (paket takibi). */
    findSignalNextRun(batchId: any): Promise<any> {
        return this.db.getExportSignalModel()
            .findOne({ batchId })
            .select('nextRunAt')
            .lean();
    }

    /** `Clients.integrations.$` webhook belirtecini yazar ve sağlığı sıfırlar; eşleşme yoksa `null`. */
    rotateWebhookToken(clientId: any, integrationCode: any, webhookToken: string): Promise<any> {
        return this.db.getClientModel().findOneAndUpdate(
            { clientId, 'integrations.integrationCode': integrationCode },
            { $set: { 'integrations.$.webhookToken': webhookToken, 'integrations.$.webhookHealthy': false } },
            { returnDocument: 'after' },
        ).lean();
    }
}
