import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { EVENTS, integrationEventBus } from '../../../integration/engine/IntegrationEventBus'
import { ExportBatchService, ExportBatchRequest } from '../../../integration/engine/catalog/export/ExportBatchService'
import { buildIntegrationHealth } from '@operations/integrations/health'
import { testIntegrationConnection } from '@operations/integration/TestConnectionOperation'
import * as settings from '@operations/integrations/settings'
import * as stockPolicy from '@operations/integrations/stockPolicy'
import * as jobs from '@operations/integrations/jobs'
import * as lookup from '@operations/integrations/platformLookup'
import { IntegrationCatalogLinkRepository } from '@database/repositories/tenant/IntegrationCatalogLinkRepository'
import { ClientIntegrationRepository } from '@database/repositories/tenant/ClientIntegrationRepository'
import { PlatformIntegrationRepository } from '@database/repositories/app/PlatformIntegrationRepository'

/**
 * ADR-0024 D6 / P3-INT: entegrasyon RPC cephesi. RPC adları ve yanıt biçimleri değişmez; iş kuralları
 * `operations/integrations/{settings,stockPolicy,health,jobs,platformLookup}`, sorgular `database/repositories/{app,tenant}`,
 * toplu dışa aktarım paketi `integration/engine/catalog/export/ExportBatchService`'tedir.
 */
export default class IntegrationService extends BaseApi implements IService {

    private get settingsDeps(): settings.IntegrationSettingsDeps {
        return { clientDB: this.clientDB, clientId: this.currentClientId, request: this.request }
    }

    private get jobDeps(): jobs.JobDeps {
        return { clientDB: this.clientDB, applicationDB: this.applicationDB, clientId: this.currentClientId }
    }

    // --- Platform tanımları ve tenant ayarları ---------------------------------------------------------------

    async get(): Promise<any> {
        return settings.listPlatformIntegrations(this.applicationDB)
    }

    async getClientIntegrations(): Promise<any> {
        return settings.getClientIntegrations(this.clientDB)
    }

    async integrationTypes(): Promise<any> {
        return new PlatformIntegrationRepository(this.applicationDB).listTypes()
    }

    async savePlatformUploadIsReadyForProduct(): Promise<any> {
        return new IntegrationCatalogLinkRepository(this.clientDB).setPlatformUploadReady(this.request.productId, this.request.integrationCode, this.request.isReady)
    }

    async saveClientErpSettings(): Promise<any> {
        return settings.saveSlotSettings(this.settingsDeps, 'erp', this.request.clientErp)
    }

    async saveClientMarketplaceSettings(): Promise<any> {
        return settings.saveSlotSettings(this.settingsDeps, 'marketplace', this.request.clientMarketplace)
    }

    async saveClientShipmentSettings(): Promise<any> {
        return settings.saveSlotSettings(this.settingsDeps, 'shipment', this.request.clientShipment)
    }

    async saveClientECommerceSettings(): Promise<any> {
        return settings.saveECommerceSettings(this.settingsDeps, this.request.clientECommerce)
    }

    async retrieveClientECommerceSettings(): Promise<any> {
        return settings.retrieveSlotSettings(this.clientDB, 'ecommerce', this.request.integrationCode)
    }

    async retrieveClientErpSettings(): Promise<any> {
        return settings.retrieveSlotSettings(this.clientDB, 'erp', this.request.integrationCode)
    }

    async retrieveClientMarketplaceSettings(): Promise<any> {
        return settings.retrieveSlotSettings(this.clientDB, 'marketplace', this.request.integrationCode)
    }

    async retrieveClientShipmentSettings(): Promise<any> {
        return settings.retrieveSlotSettings(this.clientDB, 'shipment', this.request.integrationCode)
    }

    async sortClientMarketplaces(): Promise<any> {
        return new ClientIntegrationRepository(this.clientDB).sortByCodes(this.request.sortedCodes)
    }

    async saveOrUpdateIntegrationBrand(): Promise<any> {
        const integrationBrand = await new IntegrationCatalogLinkRepository(this.clientDB).upsertIntegrationBrand(this.request.integrationBrand)
        return integrationBrand ? { _id: integrationBrand._id } : undefined
    }

    /** Gövdesi yorum satırıydı (no-op); RPC kaydı ve yanıtı (undefined) korunur. */
    async retrieveAndSetExternalToken(): Promise<any> {
        return undefined
    }

    // --- Stok politikası (N5 / ADR-0004; kademe admin) ---------------------------------------------------------

    async getStockPolicy(): Promise<any> {
        return stockPolicy.getStockPolicy(this.settingsDeps)
    }

    async saveTenantStockPolicy(): Promise<any> {
        return stockPolicy.saveTenantStockPolicy(this.settingsDeps, this.request.primaryChannel, this.request.lowStockThreshold)
    }

    async saveChannelStockPolicy(): Promise<any> {
        return stockPolicy.saveChannelStockPolicy(this.settingsDeps, this.request.integrationCode, this.request.stockPolicy)
    }

    // --- Bağlantı, sağlık, webhook ------------------------------------------------------------------------------

    /**
     * [INT-01] "Bağlantıyı test et": yan etkisiz kimlik/erişim doğrulaması. Tenant = `currentClientId` (gövde tenant SEÇEMEZ).
     * Yanıt `{ok, code: OK|AUTH_FAILED|UNREACHABLE|RATE_LIMITED|UNKNOWN, detail?, checkedAt}`; tenant+entegrasyon başına dakikada 3 (429).
     */
    async testConnection(): Promise<any> {
        return testIntegrationConnection(Number(this.currentClientId), this.request.integrationCode)
    }

    /** [N7] Kendi tenant'ının entegrasyon sağlığı (YALNIZCA OKUMA). Tenant = `currentClientId`; gövde alanı tenant SEÇEMEZ. */
    async getIntegrationHealth(): Promise<any> {
        return buildIntegrationHealth({ applicationDB: this.applicationDB, clientDB: this.clientDB, clientId: Number(this.currentClientId) })
    }

    /** [ADR-0005 Karar 8] Webhook token'ı üretir/döndürür (rotate). Kademe: admin. */
    async generateWebhookToken(): Promise<any> {
        return settings.generateWebhookToken(this.applicationDB, this.currentClientId, this.request.integrationCode)
    }

    // --- Platform vekil okumaları ----------------------------------------------------------------------------

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
        const { integrationCode, integrationCategoryId, integrationCategoryAttributeId } = this.request
        return lookup.retrieveCategoryAttributeValues(this.currentClientId, integrationCode, integrationCategoryId, integrationCategoryAttributeId)
    }

    /** [ADR-0018 Aşama A] Entegrasyon yetenek manifestoları (salt-okuma, statik kod verisi; DB/ağ yok, sır içermez). */
    async getCatalog(): Promise<any[]> {
        return lookup.listIntegrationCatalog()
    }

    // --- İçe/dışa aktarım işleri ------------------------------------------------------------------------------

    /** Yeni ürün çekme isteği; iş açıldıysa orkestratör beklemeden uyandırılır. */
    async requestFetchFromPlatform() {
        const { created, response } = await jobs.requestFetchFromPlatform(this.jobDeps, this.request.integrationCode)
        if (created) integrationEventBus.emit(EVENTS.PROCESS_NEXT_IMPORT_JOB)
        return response
    }

    async getExportJobDetail() {
        return jobs.getExportJobDetail(this.jobDeps, this.request || {})
    }

    async advancedSearchExportJobs() {
        return jobs.advancedSearchExportJobs(this.jobDeps, this.request || {})
    }

    async getExportJobs() {
        return jobs.getExportJobs(this.jobDeps, this.request || {})
    }

    async getImportJobs() {
        return jobs.getImportJobs(this.jobDeps, this.request || {})
    }

    async getImportJobByJobId() {
        return jobs.getImportJobByJobId(this.jobDeps, this.request)
    }

    /** Yalnız COMPLETED/FAILED içe aktarım işleri arşivlenir. */
    async archiveImportJobs() {
        return jobs.archiveImportJobs(this.jobDeps, this.request)
    }

    async getJobReport() {
        return jobs.getJobReport(this.jobDeps, this.request.jobId)
    }

    // --- Toplu dışa aktarım paketi ------------------------------------------------------------------------------

    /** Ön doğrulama sonrası paket arka planda kurulur (await edilmez); kullanıcıya hemen yanıt döner. */
    async batchCreator() {
        try {
            const { mode, selectedIntegrations, barcodeList, scope } = this.request
            if (!mode || !selectedIntegrations?.length) return { result: false, message: 'Geçersiz veri girişi.' }
            if (scope !== 2 && !barcodeList?.length) return { result: false, message: 'Lütfen varyant seçiniz.' }

            this.internalProcessBatch(this.request).catch(err => {
                console.error("BatchCreator Background Error:", err)
            })
            return { result: true, message: 'İşleminiz  başlatıldı. Ürünler işleme alınıyor.' }
        } catch (error: any) {
            console.error("Batch Creator Entry Error:", error)
            return { result: false, message: 'Sistemsel bir hata oluştu.' }
        }
    }

    private async internalProcessBatch(request: ExportBatchRequest) {
        return new ExportBatchService(this.currentClientId, this.applicationDB, this.clientDB).run(request)
    }
}
