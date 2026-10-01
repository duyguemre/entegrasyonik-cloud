import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ClientIntegrationRepository } from '@database/repositories/tenant/ClientIntegrationRepository'
import { IntegrationLinkRepository } from '@database/repositories/tenant/IntegrationLinkRepository'
import { ExportJobRepository } from '@database/repositories/tenant/ExportJobRepository'
import { ImportStagingRepository } from '@database/repositories/tenant/ImportStagingRepository'
import { ImportJobRepository } from '@database/repositories/app/ImportJobRepository'
import { IntegrationCatalogRepository } from '@database/repositories/app/IntegrationCatalogRepository'
import { ExportBatchService } from '@integration/engine/catalog/export/ExportBatchService'
import { buildIntegrationHealth } from '@operations/integrations/health'
import { testIntegrationConnection } from '@operations/integration/TestConnectionOperation'
import * as settings from '@operations/integrations/settings'
import * as stockPolicy from '@operations/integrations/stockPolicy'
import * as lookup from '@operations/integrations/platformLookup'
import * as importJobs from '@operations/integrations/importJobs'
import * as exportJobs from '@operations/integrations/exportJobs'

/**
 * Entegrasyon RPC cephesi (ADR-0024 D6, Dalga 3 P3-INT). RPC adları ve yanıt biçimleri DEĞİŞMEDİ; sorgular
 * `database/repositories/{tenant,app}`'te, iş kuralları `operations/integrations/{settings,stockPolicy,health,platformLookup,
 * importJobs,exportJobs}`'ta, toplu dışa aktarma paketi `integration/engine/catalog/export/ExportBatchService`'te.
 * Tenant = doğrulanmış `currentClientId` + `this.clientDB`; gövde alanı tenant SEÇEMEZ. Tutamaçlar çağrı anında okunur.
 */
export default class IntegrationService extends BaseApi implements IService {

    private get clientIntegrations() { return new ClientIntegrationRepository(this.clientDB) }
    private get catalog() { return new IntegrationCatalogRepository(this.applicationDB) }
    private get importJobRepo() { return new ImportJobRepository(this.applicationDB, this.currentClientId) }
    private get settingsDeps(): settings.SettingsDeps { return { repo: this.clientIntegrations, clientId: this.currentClientId, auditRequest: this.request } }

    // ---- Platform kataloğu ve tenant kanal ayarları (operations/integrations/settings) ----

    async get(): Promise<any> {
        return settings.listPlatformIntegrations(this.catalog)
    }

    async getClientIntegrations(): Promise<any> {
        return settings.getClientIntegrations(this.clientIntegrations)
    }

    async integrationTypes(): Promise<any> {
        return this.catalog.listIntegrationTypes()
    }

    async savePlatformUploadIsReadyForProduct(): Promise<any> {
        return new IntegrationLinkRepository(this.clientDB).setProductUploadReady(this.request.productId, this.request.integrationCode, this.request.isReady)
    }

    async saveClientErpSettings(): Promise<any> {
        return settings.saveItemSettings(this.settingsDeps, 'erp', this.request.clientErp)
    }

    async saveClientMarketplaceSettings(): Promise<any> {
        return settings.saveItemSettings(this.settingsDeps, 'marketplace', this.request.clientMarketplace)
    }

    async saveClientShipmentSettings(): Promise<any> {
        return settings.saveItemSettings(this.settingsDeps, 'shipment', this.request.clientShipment)
    }

    async saveClientECommerceSettings(): Promise<any> {
        return settings.saveECommerceSettings(this.settingsDeps, this.request.clientECommerce)
    }

    async retrieveClientECommerceSettings(): Promise<any> {
        return settings.retrieveItemSettings(this.clientIntegrations, 'ecommerce', this.request.integrationCode)
    }

    async retrieveClientErpSettings(): Promise<any> {
        return settings.retrieveItemSettings(this.clientIntegrations, 'erp', this.request.integrationCode)
    }

    async retrieveClientMarketplaceSettings(): Promise<any> {
        return settings.retrieveItemSettings(this.clientIntegrations, 'marketplace', this.request.integrationCode)
    }

    async retrieveClientShipmentSettings(): Promise<any> {
        return settings.retrieveItemSettings(this.clientIntegrations, 'shipment', this.request.integrationCode)
    }

    async sortClientMarketplaces(): Promise<any> {
        return settings.sortMarketplaces(this.clientIntegrations, this.request.sortedCodes)
    }

    async saveOrUpdateIntegrationBrand(): Promise<any> {
        const integrationBrand = await new IntegrationLinkRepository(this.clientDB).upsertIntegrationBrand(this.request.integrationBrand)
        if (integrationBrand)
            return { _id: integrationBrand._id }
        return undefined
    }

    /** Kayıtlı (FE IdeasoftComponent çağırır) ama gövdesi boş: OAuth belirteç akışı `ecommerce-service`'te. Yanıt `undefined`. */
    async retrieveAndSetExternalToken(): Promise<any> {
    }

    /** [ADR-0005 Karar 8] Webhook belirteci üret/döndür (rotate). Kademe: admin. */
    async generateWebhookToken(): Promise<any> {
        return settings.rotateWebhookToken(this.catalog, this.currentClientId, this.request.integrationCode)
    }

    // ---- Stok politikası (operations/integrations/stockPolicy; kademe admin) ----

    async getStockPolicy(): Promise<any> {
        return stockPolicy.getStockPolicy(this.clientIntegrations)
    }

    async saveTenantStockPolicy(): Promise<any> {
        return stockPolicy.saveTenantStockPolicy(this.settingsDeps, this.request.primaryChannel, this.request.lowStockThreshold)
    }

    async saveChannelStockPolicy(): Promise<any> {
        return stockPolicy.saveChannelStockPolicy(this.settingsDeps, this.request.integrationCode, this.request.stockPolicy)
    }

    // ---- Sağlık ve bağlantı testi ----

    /**
     * [INT-01] "Bağlantıyı test et": yan etkisiz kimlik/erişim doğrulaması. Tenant = `currentClientId` (gövde tenant SEÇEMEZ).
     * Yanıt `{ok, code: OK|AUTH_FAILED|UNREACHABLE|RATE_LIMITED|UNKNOWN, detail?, checkedAt}`; tenant+entegrasyon başına dakikada 3 (429).
     */
    async testConnection(): Promise<any> {
        return testIntegrationConnection(Number(this.currentClientId), this.request.integrationCode)
    }

    /** [N7] Kendi tenant'ının entegrasyon sağlığı (YALNIZCA OKUMA). */
    async getIntegrationHealth(): Promise<any> {
        return buildIntegrationHealth({
            applicationDB: this.applicationDB,
            clientDB: this.clientDB,
            clientId: Number(this.currentClientId),
        })
    }

    // ---- Pazaryeri vekil okumaları (operations/integrations/platformLookup) ----

    async retrievePlatformInfos() {
        return lookup.retrievePlatformInfos(this.currentClientId, this.request.integrationCode)
    }

    async retrieveCommisionForCategoryFromIntegration(): Promise<any> {
        return lookup.retrieveCategoryCommission(this.currentClientId, this.request.integrationCode, this.request.integrationCategoryId)
    }

    async retrieveCategoriesFromIntegration() {
        return lookup.retrieveCategories(this.currentClientId, this.request.integrationCode)
    }

    async retrieveBrandsFromIntegration() {
        return lookup.retrieveBrands(this.currentClientId, this.request.integrationCode, this.request.searchText)
    }

    async retrieveCategoryAttributesFromIntegration() {
        return lookup.retrieveCategoryAttributes(this.currentClientId, this.request.integrationCode, this.request.integrationCategoryId)
    }

    async retrieveCategoryAttributeValuesFromIntegration() {
        return lookup.retrieveCategoryAttributeValues(this.currentClientId, this.request.integrationCode, this.request.integrationCategoryId, this.request.integrationCategoryAttributeId)
    }

    // ---- Katalog içe aktarma işleri (operations/integrations/importJobs) ----

    async requestFetchFromPlatform() {
        const clientId = this.currentClientId
        return importJobs.requestImportFetch(
            { jobs: this.importJobRepo, staging: this.clientDB ? new ImportStagingRepository(this.clientDB, clientId) : null },
            this.request.integrationCode,
            (cleanupErr: any) => console.error(`[API] Cleanup Error for Client ${clientId}:`, cleanupErr.message),
        )
    }

    async getImportJobs() {
        return importJobs.listImportJobs(this.importJobRepo, this.request || {})
    }

    async getImportJobByJobId() {
        try {
            return await importJobs.getImportJob(this.importJobRepo, this.request.jobId)
        } catch (error: any) {
            console.error("getJobByJobId Error:", error)
            return { success: false, message: "İşlem detayları getirilirken teknik bir hata oluştu.", error: error?.message }
        }
    }

    /** Import işlerini arşivleme: yalnız COMPLETED/FAILED (devam eden işler korunur). */
    async archiveImportJobs() {
        try {
            return await importJobs.archiveImportJobs(this.importJobRepo, this.request.ids)
        } catch (error) {
            console.error("archiveImportJobs Error:", error)
            return { success: false, message: "Arşivleme işlemi sırasında hata oluştu." }
        }
    }

    async getJobReport() {
        return importJobs.getImportJobReport(new ImportStagingRepository(this.clientDB, this.currentClientId), this.request.jobId)
    }

    // ---- Dışa aktarma işleri (operations/integrations/exportJobs; MM-02 tek arama) ----

    async getExportJobDetail() {
        return exportJobs.getExportJobDetail(new ExportJobRepository(this.clientDB), this.catalog, (this.request || {}).id,
            (err: any) => console.error(`[getExportJobDetail] Error:`, err.message))
    }

    async advancedSearchExportJobs() {
        return exportJobs.advancedSearchExportJobs(new ExportJobRepository(this.clientDB), this.request || {},
            (err: any) => console.error(`[advancedSearchExportJobs] Error:`, err.message))
    }

    async getExportJobs() {
        return exportJobs.listExportJobs(new ExportJobRepository(this.clientDB), this.request || {},
            (err: any) => console.error(`[getExportJobs] Error:`, err.message))
    }

    /** Toplu dışa aktarma: doğrulayıp hemen yanıt döner; paket arka planda (await edilmeden) oluşturulur. */
    async batchCreator() {
        try {
            const { mode, selectedIntegrations, barcodeList, scope } = this.request
            if (!mode || !selectedIntegrations?.length) {
                return { result: false, message: 'Geçersiz veri girişi.' }
            }
            if (scope !== 2 && !barcodeList?.length) {
                return { result: false, message: 'Lütfen varyant seçiniz.' }
            }
            this.internalProcessBatch(this.request).catch(err => {
                console.error("BatchCreator Background Error:", err)
            })
            return { result: true, message: 'İşleminiz  başlatıldı. Ürünler işleme alınıyor.' }
        } catch (error: any) {
            console.error("Batch Creator Entry Error:", error)
            return { result: false, message: 'Sistemsel bir hata oluştu.' }
        }
    }

    private async internalProcessBatch(request: any): Promise<void> {
        return new ExportBatchService({ clientDB: this.clientDB, applicationDB: this.applicationDB, clientId: this.currentClientId }).process(request)
    }

    /**
     * [ADR-0018 Aşama A / kategori belgesi §4] Tüm entegrasyon yetenek manifestolarını (salt-okuma) döner.
     * Frontend kapsam rozetleri ve "yakında" (roadmap) durumları BURADAN beslenir (E3 dürüstlük ilkesi — tek
     * kaynak). Yalnız statik kod verisidir: DB/ağ erişimi YOK, sır/kimlik bilgisi İÇERMEZ. `platformAdmin`
     * özel bulgu/uyum özeti (IntegrationFinding) Aşama B `IntegrationComplianceService`'in işidir; bu uç
     * yalnız manifestoyu döner (ADR-0018 Karar 4 Aşama A DoD: "getCatalog salt-okunur uç (member)").
     */
    async getCatalog(): Promise<any[]> {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- TS6-01: node16 CJS, tembel yukleme (dinamik import yerine)
        const { listIntegrationDescriptors } = (require('../../../integration/catalog/IntegrationDescriptorRegistry') as typeof import('../../../integration/catalog/IntegrationDescriptorRegistry'));
        return listIntegrationDescriptors().map((d) => ({
            code: d.code,
            displayName: d.displayName,
            category: d.category,
            status: d.status,
            adapterVersion: d.adapterVersion,
            capabilities: Object.fromEntries(
                Object.entries(d.capabilities).map(([key, cap]) => [key, { level: cap!.level, note: cap!.note }]),
            ),
            limitations: d.limitations,
            verification: d.verification,
        }));
    }
}
