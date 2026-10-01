import { IClientDB } from '@interfaces/index';

/**
 * ADR-0024 Dalga 3 (P3-INT): entegrasyon cephesinin katalog belgelerine yaptığı iki dar yazım (ürünün kanal "hazır"
 * bayrağı, marka eşlemesi upsert'ü). Katalog alanının kendi repository'leri P3-CAT'tedir; bu sınıf yalnız
 * `IntegrationService` uçlarının sorgularını taşır. Kurucu tenant DB tutamacı.
 */
export class IntegrationLinkRepository {
    constructor(private readonly db: IClientDB) { }

    setProductUploadReady(productId: any, integrationCode: any, isReady: any): Promise<any> {
        return this.db.getProductModel().updateOne(
            { _id: productId },
            { $set: { ['platformUploads.' + integrationCode + '.isReady']: isReady }, },
            { upsert: false }
        );
    }

    upsertIntegrationBrand(integrationBrand: any): Promise<any> {
        const filterQuery = {
            'brandId': integrationBrand.brandId,
            'integrationCode': integrationBrand.integrationCode
        };
        return this.db.getIntegrationBrandModel().findOneAndUpdate(filterQuery, { $set: integrationBrand },
            { upsert: true, returnDocument: 'after' }
        );
    }
}
