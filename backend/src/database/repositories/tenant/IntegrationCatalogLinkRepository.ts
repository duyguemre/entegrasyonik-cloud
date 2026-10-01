import { IClientDB } from '@interfaces/index';

/**
 * ADR-0024 P3-INT: entegrasyon ucunun katalog kayıtlarına yaptığı iki yazım (ürünün kanal yükleme bayrağı ve kanal marka
 * eşlemesi). Katalog repository'leri P3-CAT'in sahipliğinde olduğundan ayrı, dar bir dosya.
 */
export class IntegrationCatalogLinkRepository {
    constructor(private readonly db: IClientDB) { }

    setPlatformUploadReady(productId: unknown, integrationCode: unknown, isReady: unknown): Promise<any> {
        return this.db.getProductModel().updateOne(
            { _id: productId },
            { $set: { ['platformUploads.' + integrationCode + '.isReady']: isReady } },
            { upsert: false },
        );
    }

    upsertIntegrationBrand(integrationBrand: Record<string, any>): Promise<any> {
        return this.db.getIntegrationBrandModel().findOneAndUpdate(
            { brandId: integrationBrand.brandId, integrationCode: integrationBrand.integrationCode },
            { $set: integrationBrand },
            { upsert: true, returnDocument: 'after' },
        );
    }
}
