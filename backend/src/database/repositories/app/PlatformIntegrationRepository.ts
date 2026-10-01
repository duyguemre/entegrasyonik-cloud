import { IApplicationDB } from '@interfaces/index';

/**
 * ADR-0024 P3-INT: platform entegrasyon tanımları (`Integrations`, `IntegrationTypes`; ApplicationDB) ve tenant'ın
 * `Client.integrations` alt belgesindeki webhook alanları. Sorgu biçimleri eski `IntegrationService`'ten BİREBİR.
 */
export class PlatformIntegrationRepository {
    constructor(private readonly db: IApplicationDB) { }

    /** Tüm entegrasyon tanımları (`_id` sıralı, `type` doldurulmuş); projeksiyon çağıranın (gizlenecek alanlar). */
    listDefinitions(projection: Record<string, 0 | 1>): Promise<any[]> {
        return this.db.getIntegrationModel().find({}, { projection }).sort({ _id: 1 }).populate('type').lean();
    }

    listTypes(): Promise<any[]> {
        return this.db.getIntegrationTypeModel().find({});
    }

    /** ADR-0005 Karar 8: webhook token'ını değiştirir, sağlığı sıfırlar; entegrasyon kaydı yoksa null. */
    rotateWebhookToken(clientId: unknown, integrationCode: unknown, webhookToken: string): Promise<any> {
        return this.db.getClientModel().findOneAndUpdate(
            { clientId, 'integrations.integrationCode': integrationCode },
            { $set: { 'integrations.$.webhookToken': webhookToken, 'integrations.$.webhookHealthy': false } },
            { returnDocument: 'after' },
        ).lean();
    }
}
