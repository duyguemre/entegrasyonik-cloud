import type { IClientDB } from '@interfaces/index';
import { maskClientIntegrationsDoc } from '../../api/integrationSecrets';
import { sanitizeResponse } from '../../api/responseSanitizer';

/**
 * ADR-0003 adım 8 (Karar F.22): tenant DB dışa aktarma koleksiyon envanteri. Her koleksiyon NDJSON dosyasına döner.
 * Sır alanları HARİÇ (ADR D.15): `client_integration` için özel maskeleme (`maskClientIntegrationsDoc`,
 * integrationSecrets.ts kaydı), TÜM koleksiyonlar için son savunma hattı olarak `sanitizeResponse`
 * (responseSanitizer.ts — FORBIDDEN_RESPONSE_KEYS + `enc:v1:` şifreli değerler; tenant Users.password bcrypt özeti
 * de bu şekilde silinir).
 *
 * BULGU (insan kararı gerektirir, dışa aktarma kapsamı): aşağıdaki liste iş verisi (katalog/sipariş/CRM/finans) ile
 * sınırlıdır. KASITLI OLARAK HARİÇ TUTULANLAR (belirsiz/iç işleyiş, export'a değer katmıyor kabul edildi — insan
 * onayı istenebilir): export_staged_product / import_staged_product* / import_job_report (geçici pipeline
 * durumları), counter (iç sayaç). Emin olunamayan bir alan/koleksiyon LİSTEYE EKLENMEDİ (bkz. görev raporu).
 */
export interface ExportCollectionSpec {
    file: string;
    getModel: (db: IClientDB) => any;
    mask?: (doc: any) => any;
}

export const EXPORT_COLLECTIONS: ReadonlyArray<ExportCollectionSpec> = [
    { file: 'client_integrations.ndjson', getModel: (db) => db.getClientIntegrationModel(), mask: maskClientIntegrationsDoc },
    { file: 'products.ndjson', getModel: (db) => db.getProductModel() },
    { file: 'variants.ndjson', getModel: (db) => db.getVariantModel() },
    { file: 'categories.ndjson', getModel: (db) => db.getCategoryModel() },
    { file: 'brands.ndjson', getModel: (db) => db.getBrandModel() },
    { file: 'choices.ndjson', getModel: (db) => db.getChoiceModel() },
    { file: 'hashtags.ndjson', getModel: (db) => db.getHashtagModel() },
    { file: 'orders.ndjson', getModel: (db) => db.getOrderModel() },
    { file: 'customers.ndjson', getModel: (db) => db.getCustomerModel() },
    { file: 'claims.ndjson', getModel: (db) => db.getClaimModel() },
    { file: 'invoices.ndjson', getModel: (db) => db.getInvoiceModel() },
    { file: 'messages.ndjson', getModel: (db) => db.getMessageModel() },
    { file: 'settings.ndjson', getModel: (db) => db.getSettingModel() },
    { file: 'financial_transactions.ndjson', getModel: (db) => db.getFinancialTransactionModel() },
    { file: 'cargo_invoices.ndjson', getModel: (db) => db.getCargoInvoiceModel() },
    { file: 'users.ndjson', getModel: (db) => db.getUserModel() }, // password alanı sanitizeResponse ile silinir
    { file: 'attribute_mappings.ndjson', getModel: (db) => db.getAttributeMappingModel() },
    { file: 'statistics.ndjson', getModel: (db) => db.getStatisticsModel() },
    { file: 'images.ndjson', getModel: (db) => db.getImageModel() },
    { file: 'notifications.ndjson', getModel: (db) => db.getNotificationModel() },
    { file: 'favorites.ndjson', getModel: (db) => db.getFavoriteModel() },
];

/** Test yardımcısı: EXPORT_COLLECTIONS'ın kullandığı IClientDB getter metot adları (sahte clientDB üretmek için). */
export const GETTER_NAMES_FOR_TEST: ReadonlyArray<string> = [
    'getClientIntegrationModel', 'getProductModel', 'getVariantModel', 'getCategoryModel', 'getBrandModel',
    'getChoiceModel', 'getHashtagModel', 'getOrderModel', 'getCustomerModel', 'getClaimModel', 'getInvoiceModel',
    'getMessageModel', 'getSettingModel', 'getFinancialTransactionModel', 'getCargoInvoiceModel', 'getUserModel',
    'getAttributeMappingModel', 'getStatisticsModel', 'getImageModel', 'getNotificationModel', 'getFavoriteModel',
];

/** Tek bir dokümanı export için güvenli hâle getirir: özel maske (varsa) + genel sır temizleyici (son savunma). */
export function sanitizeExportDoc(doc: any, mask?: (doc: any) => any): any {
    const masked = mask ? mask(doc) : doc;
    return sanitizeResponse(masked, { service: 'TenantDataService', operation: 'exportTenantData' });
}
