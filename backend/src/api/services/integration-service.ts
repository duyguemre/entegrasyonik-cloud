import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import { randomBytes } from 'crypto'
import { containsRegex, normalizePagination, pickSortField } from '@utils/search'

/* import Marketplace from '../../integration/modules/marketplace'
import ECommerce from 'ecommerce'
import Erp from 'erp' */
import IntegrationFactory from '../../integration/modules/IntegrationFactory'
import _ from 'lodash'
import { EVENTS, integrationEventBus } from '../../integration/engine/IntegrationEventBus'
import { SendNotificationEvent, PLATFORM_PROCESS } from '@interfaces/index'
import { NotificationService } from '@services/notification/NotificationService'
import { safeErrorCode } from '@operations/notifications/safeError'
import { getRequestId } from '@platform/core/context'
import { SENSITIVE_MASK, isSecretField, maskClientIntegrationsDoc, encryptSecrets, maskIntegrationItem, resolveSecretsForWrite } from '@platform/core/security/integrationSecrets'
import { ApplicationError } from '@platform/core/security/Security'
import { stripTenantUrlFields, isTenantUrlLikeKey, hasInvalidStoreName } from '@platform/core/security/tenantSettingsGuard'
import { AuditLogger } from '@services/audit/AuditLogger'
import { buildIntegrationHealth } from '@operations/integration/IntegrationHealthOperations'
import { testIntegrationConnection } from '@operations/integration/TestConnectionOperation'
import {
    AUTO_CANCEL_SUPPORTED_CHANNELS, STOCK_POLICY_DEFAULTS, STOCK_POLICY_LIMITS, StockPolicyValidationError,
    pickChannelStockPolicy, pickLowStockThreshold, validateChannelStockPolicyPatch, validateIntegrationCode, validateLowStockThreshold,
} from '@operations/stock/stockPolicyValidation'


/** [K8] OAuth yetkilendirme adresi kuran FE bileşenlerinin (IdeasoftComponent.vue/BizimhesapComponent.vue) okuduğu tek `urls` alt kümesi. */
const FE_VISIBLE_PLATFORM_URLS: Record<string, string[]> = {
    ideasoft: ['baseUrl', 'authorizationUrl', 'redirectUrl'],
    bizimhesap: ['baseUrl', 'authorizationUrl', 'redirectUrl'],
}

/** [DB-02] ImportJobs sıralama alanı izin listesi (Import.ts şeması; FE: startedAt/completedAt/processedCount). */
export const IMPORT_JOB_SORT_FIELDS: readonly string[] = [
    '_id', 'jobId', 'integrationCode', 'status', 'startedAt', 'completedAt', 'updatedAt',
    'totalCount', 'validCount', 'invalidCount', 'duplicateCount', 'processedCount', 'failedCount',
];

export default class IntegrationService extends BaseApi implements IService {


    async get(): Promise<any> {
        try {
            const filterQuery = {}
            // [K8 2026-09-28] Üye kademesine platform dış adresleri (üst düzey `urls`) ve iç ticari alanlar (`profitRate`/`commissin`) DÖNMEZ.
            // FE kullanımı (kanıtlı, frontend/src): `urls` YALNIZCA Ideasoft/Bizimhesap bileşenlerinde OAuth yetkilendirme adresini kurmak için
            // (`urls.baseUrl/authorizationUrl/redirectUrl`); `profitRate`/`commissin` HİÇBİR FE/BE kodunda okunmuyor. Bu yüzden `urls` yalnızca
            // o iki entegrasyon için ve yalnızca o üç anahtarla döner; diğerlerinde tamamen çıkarılır.
            const projection = { 'settings.urls': 0, 'token': 0, 'profitRate': 0, 'commissin': 0 }
            const list: any[] = await this.applicationDB.getIntegrationModel().find(filterQuery, { projection }).sort({ _id: 1 }).populate('type').lean()
            return (Array.isArray(list) ? list : []).map((item: any) => {
                if (!item || typeof item !== 'object' || !('urls' in item)) return item
                const keep = FE_VISIBLE_PLATFORM_URLS[String(item.code)]
                if (!keep) { const { urls: _drop, ...rest } = item; return rest }
                return { ...item, urls: Object.fromEntries(keep.filter(k => item.urls && item.urls[k] !== undefined).map(k => [k, item.urls[k]])) }
            })
        } catch (error) {
            throw error
        }
    }
    async getClientIntegrations(): Promise<any> {
        try {
            const filterQuery = {}
            // ADR-0003 D.15/D.16: sır alanları yanıtta 'sensitive' / '' (yazılabilir-yalnız)
            return maskClientIntegrationsDoc(await this.clientDB.getClientIntegrationModel().findOne(filterQuery).sort({ order: 1 }).lean())
        } catch (error) {
            throw error
        }
    }

    async integrationTypes(): Promise<any> {
        try {
            const filterQuery = {}
            return await this.applicationDB.getIntegrationTypeModel().find(filterQuery)
        } catch (error) {
            throw error
        }
    }


    async savePlatformUploadIsReadyForProduct(): Promise<any> {
        try {
            const filterQuery = { _id: this.request.productId }

            const platformUpdate = await this.clientDB.getProductModel().updateOne(
                filterQuery,
                { $set: { ['platformUploads.' + this.request.integrationCode + '.isReady']: this.request.isReady }, },
                { upsert: false }
            )
            return platformUpdate
        } catch (error) {
            throw error
        }
    }







    /**
     * [K7 / ADR-0020, 2026-09-28] Tenant ayarındaki URL/host/endpoint benzeri ÜST DÜZEY alanlar YOK SAYILIR (bkz. tenantSettingsGuard.ts:
     * dış hedefler yalnızca platform `Integrations.urls`'tir) ve denetim kaydına yalnızca anahtar ADLARI yazılır (değer asla).
     */
    private ignoreTenantUrlFields(type: string, code: string, incoming: any): any {
        const { settings, removedKeys } = stripTenantUrlFields(incoming)
        if (removedKeys.length > 0) {
            void AuditLogger.fromRequest(this.request, 'integration.settings.url_field_ignored', 'fail', { type, integrationCode: code, ignoredKeys: removedKeys.slice(0, 20).join(',') })
        }
        return settings
    }

    /**
     * ADR-0003 D.16: gelen settings ile mevcut settings birleştirilir (sır alanları için 'sensitive' sentinel'i).
     * ADR-0003 C.10 (adım 6): sonuçtaki düz metin sır değerleri DB'ye yazılmadan önce AES-256-GCM ile şifrelenir (`enc:v1:`);
     * korunan mevcut şifreli değerlere dokunulmaz. Anahtar yapılandırması yoksa hata fırlar (sır düz yazılmaz).
     */
    private async resolveSettingsForWrite(type: 'erp' | 'marketplace' | 'shipment', code: string, incoming: any): Promise<any> {
        const existingDoc: any = await this.clientDB.getClientIntegrationModel().findOne(
            { [type + '.code']: code },
            { [type]: { $elemMatch: { code } }, _id: 0 }
        ).lean()
        const existing = stripTenantUrlFields(existingDoc?.[type]?.[0]?.settings).settings // [K7] DB'deki URL kalıntısı korunmaz (yazımla temizlenir)
        const resolved = resolveSecretsForWrite(this.ignoreTenantUrlFields(type, code, incoming), existing, code)
        // [N5 / ADR-0004] `settings.stockPolicy` (kanal başına tampon/grace/oto-iptal) bu GENEL yazma ucunun DEĞİL, doğrulamalı özel
        // ucun (saveChannelStockPolicy) sahipliğindedir: gövdedeki değer YOK SAYILIR, mevcut değer KORUNUR. Aksi halde settings
        // nesnesi tamamen değiştiği için FE stockPolicy'yi taşımadığında politika sessizce silinirdi (ve doğrulanmamış değer yazılabilirdi).
        if (type === 'marketplace' && resolved && typeof resolved === 'object' && !Array.isArray(resolved)) {
            delete resolved.stockPolicy
            if (existing && typeof existing === 'object' && existing.stockPolicy !== undefined) resolved.stockPolicy = existing.stockPolicy
        }
        return encryptSecrets(resolved, code)
    }

    /**
     * [INT-09] Ayar kaydedilince `IntegrationFactory` örnek/ayar önbelleği (5 dk) o tenant+entegrasyon için düşürülür; aksi halde eski
     * kimlik/ayarlı örnek süre dolana dek kullanılırdı. En iyi çaba: önbellek hatası kaydı ASLA bozmaz (TTL zaten sınırlar).
     */
    private dropFactoryCache(code: unknown): void {
        try { IntegrationFactory.invalidate(Number(this.currentClientId), String(code ?? '')) } catch { /* best-effort */ }
    }

    async saveClientErpSettings(): Promise<any> {
        try {
            const filterQuery = { 'erp.code': this.request.clientErp.code }
            // ADR-0003 D.16: 'sensitive' -> mevcut sır korunur; '' -> temizlenir; başka değer -> yeni sır
            const settings = await this.resolveSettingsForWrite('erp', this.request.clientErp.code, this.request.clientErp.settings)

            const editIntegration = await this.clientDB.getClientIntegrationModel().findOneAndUpdate(filterQuery, { $set: { 'erp.$.settings': settings }, },
                { upsert: false, returnDocument: 'after' }
            )
            this.dropFactoryCache(this.request.clientErp.code)
            return maskIntegrationItem(editIntegration.erp.find((erp: any) => erp.code === this.request.clientErp.code)) || null
        } catch (error) {
            throw error
        }
    }


    async saveClientMarketplaceSettings(): Promise<any> {
        try {
            const filterQuery = { 'marketplace.code': this.request.clientMarketplace.code }
            // ADR-0003 D.16: 'sensitive' -> mevcut sır korunur; '' -> temizlenir; başka değer -> yeni sır
            const settings = await this.resolveSettingsForWrite('marketplace', this.request.clientMarketplace.code, this.request.clientMarketplace.settings)

            const editIntegration = await this.clientDB.getClientIntegrationModel().findOneAndUpdate(filterQuery, { $set: { 'marketplace.$.settings': settings }, },
                { upsert: false, returnDocument: 'after' }
            )
            this.dropFactoryCache(this.request.clientMarketplace.code)
            return maskIntegrationItem(editIntegration.marketplace.find((marketplace: any) => marketplace.code === this.request.clientMarketplace.code)) || null
        } catch (error) {
            throw error
        }
    }

    // ------------------------------------------------------------------------------------------------------------
    // [N5 / ADR-0004 Karar 1/5/6/7] STOK POLİTİKASI UÇLARI (docs/API_TENANT_SURFACE.md §1). Kademe: admin (OPERATION_POLICY).
    // `settings`'in diğer alanlarını EZMEZ: yalnızca `marketplace.$.settings.stockPolicy.<alan>` noktalı yollarına atomik
    // `$set/$unset` yapılır (oku-değiştir-yaz YOK; sır alanlarına/`SELLERID` vb. dokunulmaz). Tenant kapsamı: clientDB zaten tenant DB'sidir.
    // ------------------------------------------------------------------------------------------------------------

    private stockPolicyError(e: any): never {
        if (e instanceof StockPolicyValidationError) throw new ApplicationError(e.message, 400)
        throw e
    }

    /** Tenant birincil kanalı + kanal başına politika (yalnızca bilinen alanlar) + ADR varsayılanları/sınırları. */
    async getStockPolicy(): Promise<any> {
        try {
            const doc: any = await this.clientDB.getClientIntegrationModel().findOne({}).lean()
            const marketplaces: any[] = (Array.isArray(doc?.marketplace) ? doc.marketplace : []).filter((m: any) => m && typeof m.code === 'string')
            const configured: string | null = typeof doc?.stockPolicy?.primaryChannel === 'string' && doc.stockPolicy.primaryChannel ? doc.stockPolicy.primaryChannel : null
            // StockPublishTrigger.resolvePrimaryChannel ile AYNI kural: yapılandırılmış varsa o; yoksa en küçük `order`
            const sorted = [...marketplaces].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            const effective = configured ?? sorted[0]?.code ?? null
            return {
                primaryChannel: configured,
                lowStockThreshold: pickLowStockThreshold(doc?.stockPolicy?.lowStockThreshold),
                effectivePrimaryChannel: effective,
                primaryChannelIsConnected: configured === null ? true : marketplaces.some(m => m.code === configured),
                channels: sorted.map(m => ({
                    integrationCode: m.code,
                    order: m.order ?? null,
                    enabled: m.status !== false,
                    isPrimary: m.code === effective,
                    autoCancelSupported: AUTO_CANCEL_SUPPORTED_CHANNELS.includes(String(m.code).toLowerCase()),
                    stockPolicy: pickChannelStockPolicy(m.settings?.stockPolicy),
                })),
                defaults: STOCK_POLICY_DEFAULTS,
                limits: STOCK_POLICY_LIMITS,
            }
        } catch (error) {
            throw error
        }
    }

    /**
     * Tenant düzeyi stok politikası: `primaryChannel` (`null|''` = temizle; varsayılan: ilk bağlanan pazaryeri) ve/veya
     * `lowStockThreshold` (tamsayı; `null` = temizle/kapat, varsayılan YOK = düşük stok bildirimi kapalı). En az biri zorunludur.
     */
    async saveTenantStockPolicy(): Promise<any> {
        try {
            const raw = this.request.primaryChannel
            const rawLow = this.request.lowStockThreshold
            if (raw === undefined && rawLow === undefined) throw new ApplicationError('primaryChannel zorunludur (temizlemek için null).', 400)
            const clear = raw === null || raw === ''
            let code: string | undefined
            if (raw !== undefined && !clear) {
                try { code = validateIntegrationCode(raw) } catch (e) { this.stockPolicyError(e) }
            }
            let low: number | null | undefined
            if (rawLow !== undefined) {
                try { low = validateLowStockThreshold(rawLow) } catch (e) { this.stockPolicyError(e) }
            }

            const model = this.clientDB.getClientIntegrationModel()
            // Var olmayan/bağlı olmayan pazaryeri koda atanamaz: filtre aynı zamanda varlık korumasıdır (atomik)
            const filter: any = raw !== undefined && !clear ? { 'marketplace.code': code } : {}
            const $set: any = {}
            const $unset: any = {}
            if (raw !== undefined) { if (clear) $unset['stockPolicy.primaryChannel'] = ''; else $set['stockPolicy.primaryChannel'] = code }
            if (low !== undefined) { if (low === null) $unset['stockPolicy.lowStockThreshold'] = ''; else $set['stockPolicy.lowStockThreshold'] = low }
            const update: any = {}
            if (Object.keys($set).length) update.$set = $set
            if (Object.keys($unset).length) update.$unset = $unset
            const updated: any = await model.findOneAndUpdate(filter, update, { upsert: false, returnDocument: 'after' })
            if (!updated) throw new ApplicationError(raw !== undefined && !clear ? 'Belirtilen pazaryeri bağlı değil.' : 'Entegrasyon ayarları bulunamadı.', raw !== undefined && !clear ? 400 : 404)

            if (raw !== undefined) void AuditLogger.fromRequest(this.request, 'stock.policy.primary', 'ok', { primaryChannel: clear ? '(cleared)' : code })
            if (low !== undefined) void AuditLogger.fromRequest(this.request, 'stock.policy.lowStock', 'ok', { lowStockThreshold: low === null ? '(cleared)' : low })
            const now = updated.stockPolicy?.primaryChannel
            return {
                primaryChannel: typeof now === 'string' && now ? now : null,
                ...(rawLow !== undefined ? { lowStockThreshold: pickLowStockThreshold(updated.stockPolicy?.lowStockThreshold) } : {}),
            }
        } catch (error) {
            throw error
        }
    }

    /**
     * Kanal başına stok politikası (kısmi/patch): yalnızca gelen alanlar yazılır, `null` alanı varsayılana döndürür.
     * Doğrulama: stockPolicyValidation (aralık/tip/bilinmeyen anahtar => 400). Yalnızca `marketplace` tipi kanallar.
     */
    async saveChannelStockPolicy(): Promise<any> {
        try {
            let code: string = ''
            let patch: ReturnType<typeof validateChannelStockPolicyPatch> = { set: {}, unset: [] }
            try {
                code = validateIntegrationCode(this.request.integrationCode)
                patch = validateChannelStockPolicyPatch(this.request.stockPolicy)
            } catch (e) { this.stockPolicyError(e) }

            const $set: any = {}
            const $unset: any = {}
            for (const [k, v] of Object.entries(patch.set)) $set[`marketplace.$.settings.stockPolicy.${k}`] = v
            for (const k of patch.unset) $unset[`marketplace.$.settings.stockPolicy.${k}`] = ''
            const update: any = {}
            if (Object.keys($set).length) update.$set = $set
            if (Object.keys($unset).length) update.$unset = $unset

            const updated: any = await this.clientDB.getClientIntegrationModel().findOneAndUpdate(
                { 'marketplace.code': code }, update, { upsert: false, returnDocument: 'after' }
            )
            if (!updated) throw new ApplicationError('Belirtilen pazaryeri bağlı değil.', 404)
            this.dropFactoryCache(code)
            const item = (updated.marketplace || []).find((m: any) => m.code === code)

            void AuditLogger.fromRequest(this.request, 'stock.policy.channel', 'ok', {
                integrationCode: code, ...patch.set, reset: patch.unset.join(','),
            })
            return { integrationCode: code, stockPolicy: pickChannelStockPolicy(item?.settings?.stockPolicy) }
        } catch (error) {
            throw error
        }
    }

    /**
     * [N7] Kendi tenant'ının entegrasyon sağlığı (YALNIZCA OKUMA): son başarılı senkron, son hata (`IntegrationError.code`),
     * devre kesici, son 24 sa çağrı sayıları. Tenant = `currentClientId` (doğrulanmış principal); gövde alanı tenant SEÇEMEZ.
     */
    /**
     * [INT-01] "Bağlantıyı test et": yan etkisiz kimlik/erişim doğrulaması. Tenant = `currentClientId` (gövde tenant SEÇEMEZ).
     * Yanıt `{ok, code: OK|AUTH_FAILED|UNREACHABLE|RATE_LIMITED|UNKNOWN, detail?, checkedAt}`; tenant+entegrasyon başına dakikada 3 (429).
     */
    async testConnection(): Promise<any> {
        return testIntegrationConnection(Number(this.currentClientId), this.request.integrationCode)
    }

    async getIntegrationHealth(): Promise<any> {
        try {
            return await buildIntegrationHealth({
                applicationDB: this.applicationDB,
                clientDB: this.clientDB,
                clientId: Number(this.currentClientId),
            })
        } catch (error) {
            throw error
        }
    }

    /**
     * [ADR-0005 Karar 8] Tenant×entegrasyon başına webhook token'ı üretir/DÖNDÜRÜR (rotate). `Client.integrations`
     * (ApplicationDB, `Client.ts` -- OrderQueueProducer/OrderWorker'ın imleç alanlarıyla AYNI şemasız belge) üzerine
     * yazılır; `ClientIntegration.marketplace[].settings` (tenant DB, kimlik bilgisi/sır alanları) İLE KARIŞTIRILMAZ.
     * Token ≥32 bayt kriptografik rastgelelik (hex kodlanmış, 64 karakter); DB'de DÜZ METİN tutulur -- bu bir sır
     * DEĞİL, tahmin edilemez bir URL bileşenidir (ADR-0005 Karar 8 madde 2). Her çağrı YENİ bir token üretip
     * ESKİSİNİN üzerine yazar (rotasyon = yeniden üretimle AYNI operasyon) ve `webhookHealthy`'yi false'a döndürür
     * (yeni token için sağlık durumu ilk webhook'a kadar belirsizdir). Kademe: admin (OPERATION_POLICY).
     */
    async generateWebhookToken(): Promise<any> {
        try {
            const integrationCode = this.request.integrationCode;
            if (!integrationCode) throw new Error('integrationCode zorunlu');

            const webhookToken = randomBytes(32).toString('hex');
            const ClientModel = this.applicationDB.getClientModel();

            const updated: any = await ClientModel.findOneAndUpdate(
                { clientId: this.currentClientId, 'integrations.integrationCode': integrationCode },
                { $set: { 'integrations.$.webhookToken': webhookToken, 'integrations.$.webhookHealthy': false } },
                { returnDocument: 'after' },
            ).lean();
            if (!updated) throw new Error('Entegrasyon bulunamadı');

            return { integrationCode, webhookToken };
        } catch (error) {
            throw error;
        }
    }

    async saveClientShipmentSettings(): Promise<any> {
        try {
            const filterQuery = { 'shipment.code': this.request.clientShipment.code }
            // ADR-0003 D.16: 'sensitive' -> mevcut sır korunur; '' -> temizlenir; başka değer -> yeni sır
            const settings = await this.resolveSettingsForWrite('shipment', this.request.clientShipment.code, this.request.clientShipment.settings)

            const editIntegration = await this.clientDB.getClientIntegrationModel().findOneAndUpdate(filterQuery, { $set: { 'shipment.$.settings': settings }, },
                { upsert: false, returnDocument: 'after' }
            )
            this.dropFactoryCache(this.request.clientShipment.code)
            return maskIntegrationItem(editIntegration.shipment.find((shipment: any) => shipment.code === this.request.clientShipment.code)) || null
        } catch (error) {
            throw error
        }
    }



    async sortClientMarketplaces(): Promise<any> {
        try {
            var order = 1
            var updates = []
            for (var code of this.request.sortedCodes) {
                updates.push({
                    updateOne: {
                        filter: { code: code },
                        update: { $set: { 'order': order++ } }
                    }
                },)
            }
            const resp = await this.clientDB.getClientIntegrationModel().bulkWrite(updates)
            return resp
        } catch (error) {
            throw error
        }
    }



    async saveOrUpdateIntegrationBrand(): Promise<any> {
        try {
            const filterQuery = {
                'brandId': this.request.integrationBrand.brandId,
                'integrationCode': this.request.integrationBrand.integrationCode
            }
            const integrationBrand = await this.clientDB.getIntegrationBrandModel().findOneAndUpdate(filterQuery, { $set: this.request.integrationBrand },
                { upsert: true, returnDocument: 'after' }
            )
            if (integrationBrand)
                return { _id: integrationBrand._id }
            return undefined
        } catch (error) {
            throw error
        }
    }




    async retrieveAndSetExternalToken(): Promise<any> {
        try {
            /*             const ecommerce: IBaseMarketIntegration = new ECommerce(this.currentClientId, this.applicationDB, this.clientDB)
                        return await ecommerce.getToken(this.request.integrationCode, this.request.data) */
        } catch (error) {
            throw error
        }
    }


    async retrieveClientECommerceSettings(): Promise<any> {
        try {
            const integrationCode = this.request.integrationCode;

            const doc = await this.clientDB.getClientIntegrationModel().findOne(
                { 'ecommerce.code': integrationCode },
                { ecommerce: { $elemMatch: { code: integrationCode } }, _id: 0 } // _id çıkarılır, sadece ilgili shipment elemanı döner
            ).lean();
            // ADR-0003 D.16: auth.access_token/refresh_token dahil TÜM sır alanları maskelenir (eskiden yalnızca bu ikisi)
            return maskIntegrationItem(doc?.ecommerce?.[0]) || null;
        } catch (error) {
            throw error
        }
    }

    async saveClientECommerceSettings(): Promise<any> {
        try {
            const filterQuery = { 'ecommerce.code': this.request.clientECommerce.code }
            const rawECommerceSettings = this.request.clientECommerce.settings
            delete rawECommerceSettings.auth
            // [K7] Ideasoft alt alan etiketi host'a gömülür: yalnızca tek DNS etiketi
            if (hasInvalidStoreName(rawECommerceSettings)) throw new ApplicationError('storeName geçersiz: yalnızca harf, rakam ve tire içeren tek bir alt alan adı girilmelidir.', 400)
            // [K7] URL/host/endpoint benzeri alanlar yok sayılır (yalnızca $set edilmez); DB'deki kalıntıları aşağıda $unset edilir
            const clientECommerceSettings = this.ignoreTenantUrlFields('ecommerce', this.request.clientECommerce.code, rawECommerceSettings)
            // ADR-0003 D.16: gelen değer 'sensitive' olan sır alanı yazılmaz (mevcut değer korunur); '' temizler; başka değer yeni sırdır
            const code = this.request.clientECommerce.code
            // ADR-0003 C.10: yeni (düz metin) sır değerleri yazılmadan önce şifrelenir; 'sensitive' olanlar zaten aşağıda elenir
            const encryptedSettings = encryptSecrets(clientECommerceSettings, code)
            const setObject = Object.fromEntries(
                Object.entries(encryptedSettings)
                    .filter(([key, value]) => !(isSecretField(key, code) && value === SENSITIVE_MASK))
                    .map(([key, value]) => [`ecommerce.$.settings.${key}`, value])
            )
            const existingECommerce: any = await this.clientDB.getClientIntegrationModel().findOne(
                filterQuery, { ecommerce: { $elemMatch: { code } }, _id: 0 }
            ).lean()
            const unsetObject = Object.fromEntries(
                Object.keys(existingECommerce?.ecommerce?.[0]?.settings || {}).filter(isTenantUrlLikeKey).map(k => [`ecommerce.$.settings.${k}`, ''])
            )
            const update: any = { $set: setObject }
            if (Object.keys(unsetObject).length > 0) update.$unset = unsetObject
            const editIntegration = await this.clientDB.getClientIntegrationModel().findOneAndUpdate(filterQuery, update,
                { upsert: false, returnDocument: 'after' }
            ).lean()
            this.dropFactoryCache(this.request.clientECommerce.code)
            return maskIntegrationItem(editIntegration.ecommerce.find((ecommerce: any) => ecommerce.code === this.request.clientECommerce.code)) || null
        } catch (error) {
            throw error
        }
    }


    async retrieveClientErpSettings(): Promise<any> {
        try {
            const integrationCode = this.request.integrationCode;

            const doc = await this.clientDB.getClientIntegrationModel().findOne(
                { 'erp.code': integrationCode },
                { erp: { $elemMatch: { code: integrationCode } }, _id: 0 } // _id çıkarılır, sadece ilgili marketplace elemanı döner
            ).lean();
            return maskIntegrationItem(doc?.erp?.[0]) || null;
        } catch (error) {
            throw error
        }
    }

    async retrieveClientMarketplaceSettings(): Promise<any> {
        try {
            const integrationCode = this.request.integrationCode;

            const doc = await this.clientDB.getClientIntegrationModel().findOne(
                { 'marketplace.code': integrationCode },
                { marketplace: { $elemMatch: { code: integrationCode } }, _id: 0 } // _id çıkarılır, sadece ilgili marketplace elemanı döner
            ).lean();
            return maskIntegrationItem(doc?.marketplace?.[0]) || null;
        } catch (error) {
            throw error
        }
    }

    async retrieveClientShipmentSettings(): Promise<any> {
        try {
            const integrationCode = this.request.integrationCode;

            const doc = await this.clientDB.getClientIntegrationModel().findOne(
                { 'shipment.code': integrationCode },
                { shipment: { $elemMatch: { code: integrationCode } }, _id: 0 } // _id çıkarılır, sadece ilgili shipment elemanı döner
            ).lean();
            return maskIntegrationItem(doc?.shipment?.[0]) || null;
        } catch (error) {
            throw error
        }
    }

    /*     async retrieveShipments() {
            try {
                const integrationCode = this.request.integrationCode
                const factory = new IntegrationFactory(Number(this.currentClientId));
                const integration = await factory.getInstance(integrationCode);
                return await integration.retrieveShipments()
            } catch (error) {
                throw error
            }
        }
     */

    async retrievePlatformInfos() {
        try {
            const integrationCode = this.request.integrationCode
            const factory = new IntegrationFactory(Number(this.currentClientId));
            const integration = await factory.getInstance(integrationCode);
            return await integration.retrievePlatformInfos()
        } catch (error) {
            throw error
        }
    }


    async retrieveCommisionForCategoryFromIntegration(): Promise<any> {
        try {
            const integrationCode = this.request.integrationCode
            const integrationCategoryId = this.request.integrationCategoryId
            const factory = new IntegrationFactory(Number(this.currentClientId));
            const integration = await factory.getInstance(integrationCode);
            return await integration.retrieveCategoryCommision(integrationCategoryId)
        } catch (error) {
            throw error
        }
    }



    // Controller içindeki metodun yeni hali
    async requestFetchFromPlatform() {
        const { integrationCode } = this.request;
        const clientId = this.currentClientId;

        // 1. HALA ÇALIŞAN bir iş var mı?
        // Bu kontrol merkezi ApplicationDB'de kalmaya devam ediyor (Doğru yaklaşım).
        const activeJob = await this.applicationDB.getImportJobModel().findOne({
            clientId: clientId,
            integrationCode,
            status: { $in: ['FETCHING', 'PROCESSING', 'WAITING_FOR_FETCH', 'READY_TO_SYNC'] }
        });

        if (activeJob) {
            return {
                success: false,
                message: `Bu platform için devam eden bir işlem var. (JobId: ${activeJob.jobId})`,
                jobId: activeJob.jobId
            };
        }

        // 2. TEMİZLİK (Cleanup) - KRİTİK DEĞİŞİKLİK
        // Staging modelleri artık ClientDB'de olduğu için client-specific DB'ye bağlanıyoruz.
        try {
            if (this.clientDB) {
                await Promise.all([
                    this.clientDB.getImportStagedProductModel().deleteMany({ jobId: { $exists: true }, integrationCode }),
                    this.clientDB.getImportStagedProductSummaryModel().deleteMany({ jobId: { $exists: true }, integrationCode }),
                    this.clientDB.getImportJobReportModel().deleteMany({ integrationCode })
                ]);
            }
        } catch (cleanupErr: any) {
            console.error(`[API] Cleanup Error for Client ${clientId}:`, cleanupErr.message);
            // Cleanup hatası kritik değilse devam edilebilir ama loglamak şart.
        }

        // 3. TAMAMEN YENİ KAYIT OLUŞTURMA (ApplicationDB)
        const newJobId = new ObjectId();

        await this.applicationDB.getImportJobModel().create({
            _id: newJobId,
            jobId: newJobId.toString(),
            clientId: clientId,
            integrationCode: integrationCode,
            status: 'WAITING_FOR_FETCH',
            totalCount: 0,
            processedCount: 0,
            failedCount: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // 4. ORCHESTRATOR'I UYANDIR - YENİ ADIM
        // Orchestrator'ın 5 saniye beklemesine gerek kalmadan işi hemen kapmasını sağlar.
        integrationEventBus.emit(EVENTS.PROCESS_NEXT_IMPORT_JOB);

        return {
            success: true,
            message: "Yeni ürün çekme isteği başarıyla oluşturuldu ve sıraya alındı.",
            jobId: newJobId.toString()
        };
    }


    async getExportJobDetail() {
        const body = this.request || {};
        const { id } = body; // Frontend'den gelen döküman _id'si (ObjectId)

        if (!id) {
            return { success: false, message: "Geçerli bir işlem ID'si gerekli." };
        }

        try {
            // KRİTİK: Artık veriyi Müşteri DB'sinden (clientDB) çekiyoruz
            const model = this.clientDB.getExportStagedProductModel();

            // 1. Kaydı buluyoruz
            const job = await model.findById(id).lean();

            if (!job) {
                return { success: false, message: "İşlem detayları bulunamadı." };
            }

            // 2. Logları tarihe göre sıralıyoruz
            if (job.logs && Array.isArray(job.logs)) {
                job.logs.sort((a: any, b: any) =>
                    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );
            }

            // [EKLE] Bağlı olunan Job'ın (ExportSignal) bir sonraki çalışma zamanını çek
            let nextRunAt = null;
            if (job.batchId) {
                const signal = await this.applicationDB.getExportSignalModel()
                    .findOne({ batchId: job.batchId })
                    .select('nextRunAt')
                    .lean();
                nextRunAt = signal?.nextRunAt;
            }

            // 3. Frontend'deki stepper ve timeline için veriyi zenginleştiriyoruz
            // Yeni payload hiyerarşisine göre null-check kontrolleri eklendi
            const detail = {
                ...job,
                nextRunAt, // [EKLE]
                // UI'da hata mesajını belirginleştirmek için:
                lastErrorMessage: job.status === 'FAILED'
                    ? (job.errorMessage || job.logs?.filter((l: any) => l.status === 'FAILED').pop()?.message)
                    : null,

                // Batch bilgisi (UI'da paket takibi için gerekebilir)
                batchId: job.batchId || null
            };

            return {
                success: true,
                data: detail
            };

        } catch (err: any) {
            console.error(`[getExportJobDetail] Error:`, err.message);
            return { success: false, message: "Sunucu hatası: " + err.message };
        }
    }


    async advancedSearchExportJobs() {
        const body = this.request || {};
        const {
            sortBy = 'createdAt',
            sortOrder = 'desc',
            globalSearch,
            title,
            barcode,
            stockcode,
            category,
            brand,
            integrationCode,
            mode,
            statuses,
            selectedChoices,
            startDate,
            endDate,
            batchId // YENİ: Paket bazlı arama desteği
        } = body;

        // [DÜZELTME 2026-09-29, BACKLOG C22/GV-01] page/limit artık @utils/search.normalizePagination ile
        // sınırlanır (limit üst sınırı 200 -- FE bu listede sabit 13 kullanıyor, frontend/src/components/
        // logListView/ExportLogList.vue; page<1 -> 1). Eskiden ham istek değeri doğrudan $skip/$limit'e
        // gidiyordu -- aşırı büyük `limit` tam koleksiyon taraması/DoS riskiydi (GV-01 raporundaki emsalle
        // AYNI sınıf; GV-01'de yalnızca bu dosyanın `$regex` satırları düzeltilmiş, `limit` sınırları K7
        // çakışması nedeniyle ERTELENMİŞTİ).
        const { page, limit } = normalizePagination(body, 13);
        const skip = (page - 1) * limit;

        // 1. FİLTRELEME BLOĞU (Müşteri DB - ExportStagedProducts)
        const query: any = { status: { $ne: 'ARCHIVED' } };

        // --- Tarih Filtresi ---
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                query.createdAt.$gte = start;
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }

        // --- Hızlı/Genel Arama (Regex optimizasyonu ile) ---
        if (globalSearch) {
            query.$or = [
                { "barcode": containsRegex(globalSearch) }, // [GV-01]
                { "batchId": containsRegex(globalSearch) },
                { "payload.stockcode": containsRegex(globalSearch) }
            ];
        }

        // --- Spesifik Filtreler ---
        if (title) query["payload.title"] = containsRegex(title); // [GV-01]
        if (barcode) query.barcode = containsRegex(barcode); // [GV-01]
        if (stockcode) query["payload.stockcode"] = containsRegex(stockcode); // [GV-01]
        if (batchId) query.batchId = batchId;

        // --- Kategori ve Marka (ObjectId Check) ---
        if (category && category !== -1) query["payload.product.category"] = new ObjectId(category);
        if (brand && brand !== -1) query["payload.product.brand"] = new ObjectId(brand);

        // --- Çoklu Seçim Filtreleri ---
        if (Array.isArray(integrationCode) && integrationCode.length > 0) query.integrationCode = { $in: integrationCode };
        if (Array.isArray(statuses) && statuses.length > 0) query.status = { $in: statuses };
        if (mode) query.mode = mode;

        // --- Varyant (Choices) Filtreleri ---
        if (selectedChoices && Object.keys(selectedChoices).length > 0) {
            const choiceConditions: any[] = [];
            Object.entries(selectedChoices).forEach(([choiceId, choiceValueId]) => {
                if (choiceValueId) {
                    choiceConditions.push({
                        "payload.choices": {
                            $elemMatch: {
                                choiceId: isNaN(Number(choiceId)) ? choiceId : Number(choiceId),
                                choiceValueId: choiceValueId
                            }
                        }
                    });
                }
            });
            if (choiceConditions.length > 0) {
                query.$and = query.$and ? [...query.$and, ...choiceConditions] : choiceConditions;
            }
        }

        try {
            // DİKKAT: Artık Müşteri DB'den (clientDB) çekiyoruz
            const model = this.clientDB.getExportStagedProductModel();

            const pipeline = [
                { $match: query },
                { $sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 } },
                { $skip: Number(skip) },
                { $limit: Number(limit) },
                {
                    $project: {


                        batchId: 1,
                        integrationCode: 1,
                        barcode: 1,
                        mode: 1,
                        status: 1,
                        completedAt: 1,
                        createdAt: 1,
                        updatedAt: 1,
                        trackingId: 1,
                        title: 1,
                        image: 1,
                        stock: 1,
                        price: 1,
                        stockcode: 1,
                        category: 1,
                        brand: 1,
                        choices: 1,


/*                         integrationCode: 1,
                        barcode: 1,
                        batchId: 1,
                        mode: 1,
                        status: 1,
                        completedAt: 1,
                        createdAt: 1,
                        updatedAt: 1,
                        trackingId: 1,
                        // Önyüzün beklediği "payload" içindeki başlık ve stok kodu
                        "title": { $ifNull: ["$payload.product.title", "$payload.title"] },
                        "stockcode": "$payload.stockcode",
                        "choices": "$payload.choices",
                        "images": { $slice: ["$payload.images", 1] }, // Sadece ilk resim (Performans)

                        // Dinamik Fiyat Projeksiyonu
                        "platformPrices": {
                            $getField: {
                                field: "prices",
                                input: {
                                    $getField: {
                                        field: "$integrationCode",
                                        input: "$payload.platforms"
                                    }
                                }
                            }
                        }
 */                    }
                }
            ];

            const jobs = await model.aggregate(pipeline);
            const total = await model.countDocuments(query);

            // Önyüz Formatına Map'leme
            const formattedJobs = jobs.map((job: any) => ({
                ...job,
                // UI'ın beklediği mapping'ler
                totalCount: 1,
                processedCount: ['COMPLETED', 'FAILED'].includes(job.status) ? 1 : 0,
                isProcessing: !['COMPLETED', 'FAILED'].includes(job.status)
            }));

            return {
                success: true,
                data: formattedJobs,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    totalNumberOfRecords: total,
                    totalNumberOfPages: Math.ceil(total / Number(limit))
                }
            };

        } catch (err: any) {
            console.error(`[advancedSearchExportJobs] Error:`, err.message);
            return { success: false, message: err.message };
        }
    }


    async getExportJobs() {
        const body = this.request || {};
        const {
            integrationCode,
            barcode,
            correlationId, // Bu artık Signal tablosundaki groupId veya batchId olabilir
            sortBy = 'createdAt',
            sortOrder = 'desc',
            globalSearch,
            startDate,
            endDate
        } = body;

        // [DÜZELTME 2026-09-29, BACKLOG C22/GV-01] bkz. advancedSearchExportJobs (aynı desen/gerekçe).
        const { page, limit } = normalizePagination(body, 13);
        const skip = (page - 1) * limit;

        // 1. FİLTRELEME BLOĞU (Yeni Mimariye Uygun)
        // Kullanıcı hem genel paket durumunu hem de tekil ürün durumunu görebilmeli.
        const query: any = { status: { $ne: 'ARCHIVED' } };

        if (integrationCode) query.integrationCode = integrationCode;
        if (barcode) query.barcode = barcode;

        // correlationId gönderilirse bunu batchId veya groupId (correlationId) olarak ara
        if (correlationId) {
            query.$or = [
                { batchId: correlationId },
                { groupId: correlationId }
            ];
        }

        // --- 2. TARİH FİLTRESİ ---
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                query.createdAt.$gte = start;
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }

        // --- 3. GLOBAL SEARCH (Performans uyarısı: regex büyük datada yavaştır) ---
        if (globalSearch) {
            query.$or = [
                { "barcode": containsRegex(globalSearch) }, // [GV-01]
                { "batchId": containsRegex(globalSearch) },
                { "payload.stockcode": containsRegex(globalSearch) }
            ];
        }

        try {
            const model = this.clientDB.getExportStagedProductModel();

            // 4. AGGREGATION PIPELINE (Yeni Projeksiyonlarla)
            const pipeline = [
                { $match: query },
                { $sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 } },
                { $skip: skip },
                { $limit: Number(limit) },
                {
                    $project: {
                        batchId: 1,
                        integrationCode: 1,
                        barcode: 1,
                        mode: 1,
                        status: 1,
                        completedAt: 1,
                        createdAt: 1,
                        updatedAt: 1,
                        trackingId: 1,
                        title: 1,
                        image: 1,
                        stock: 1,
                        price: 1,
                        stockcode: 1,
                        category: 1,
                        brand: 1,
                        choices: 1,
                    }
                }
            ];

            const jobs = await model.aggregate(pipeline);
            const total = await model.countDocuments(query);

            // 5. VERİ FORMATLAMA (Önyüz için ek bilgiler)
            const formattedJobs = jobs.map((job: any) => ({
                ...job,
                // Önyüzdeki Progress Bar için ipucu:
                isProcessing: !['COMPLETED', 'FAILED'].includes(job.status),
                // Logları her zaman çekmek yerine önyüzde tıklandığında çekmek daha mantıklı (Performans için select'ten çıkardık)
            }));

            return {
                success: true,
                data: formattedJobs,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    totalNumberOfRecords: total,
                    totalNumberOfPages: Math.ceil(total / Number(limit))
                }
            };

        } catch (err: any) {
            console.error(`[getExportJobs] Error:`, err.message);
            return { success: false, message: err.message };
        }
    }



    // ProductService.ts içindeki metodlar

    async getImportJobs() {
        // Body'den alıyoruz (undefined hatası için fallback eklendi)
        const body = this.request || {};
        // sortBy ve sortOrder parametrelerini ekledik
        const { integrationCode, sortBy, sortOrder } = body;
        // [DÜZELTME 2026-09-29, BACKLOG C22/GV-01] bkz. advancedSearchExportJobs (aynı desen/gerekçe).
        const { page, limit } = normalizePagination(body, 10);
        const skip = (page - 1) * limit;

        const query: any = { clientId: this.currentClientId, status: { $ne: 'ARCHIVED' } };
        if (integrationCode) query.integrationCode = integrationCode;

        // Dinamik sıralama objesi oluşturma
        // Eğer sortBy gelirse onu kullan, gelmezse varsayılan startedAt: -1 kullan
        const sortQuery: any = {};
        // [DB-02] sıralama alanı izin listesi; bilinmeyen alan => varsayılan (jobId azalan)
        const pickedSort = pickSortField(sortBy, IMPORT_JOB_SORT_FIELDS, 'jobId');
        if (!pickedSort.usedFallback) {
            sortQuery[pickedSort.field] = sortOrder === 'desc' ? -1 : 1;
        } else {
            sortQuery.jobId = -1;
        }

        const jobs = await this.applicationDB.getImportJobModel()
            .find(query)
            .sort(sortQuery) // Dinamik sort burada uygulanıyor
            .skip(skip)
            .limit(Number(limit))
            .lean();

        const total = await this.applicationDB.getImportJobModel().countDocuments(query);

        return {
            success: true,
            data: jobs,
            total,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                totalNumberOfRecords: total,
                totalNumberOfPages: Math.ceil(total / Number(limit))
            }
        };
    }

    /**
 * jobId'ye göre Job detaylarını getirir
 * @param {Object} req - Request objesi (body içinde jobId bekler)
 * @param {Object} res - Response objesi
 */
    async getImportJobByJobId() {
        try {
            const { jobId } = this.request;

            if (!jobId) {
                return {
                    success: false,
                    message: "jobId parametresi eksik."
                }
            }

            // Kendi Model ismine göre güncelle (Örn: ImportJob, IntegrationJob vb.)
            // QA-FAZ2 kritik-1 / BACKLOG C4 (L-04 IDOR): clientId filtresi eklendi — getImportJobs ile aynı desen
            const job = await this.applicationDB.getImportJobModel().findOne({ jobId: jobId, clientId: this.currentClientId }).lean();

            if (!job) {
                return {
                    success: false,
                    message: "Belirtilen ID ile eşleşen bir işlem bulunamadı."
                };
            }

            // Frontend'in beklediği formatta (data sarmalıyla veya direkt) dönüyoruz
            return {
                success: true,
                data: job
            }

        } catch (error: any) {
            console.error("getJobByJobId Error:", error);
            return {
                success: false,
                message: "İşlem detayları getirilirken teknik bir hata oluştu.",
                error: error?.message
            }
        }
    }


    /**
 * Import İşlerini Silme (Güvenlikli)
 * Sadece COMPLETED veya FAILED olanlar silinebilir.
 */
    async archiveImportJobs() {
        try {
            const { ids } = this.request;

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return { success: false, message: "Geçerli ID listesi gerekli." }
            }

            // Sadece COMPLETED veya FAILED olanları arşivle
            // QA-FAZ2 kritik-1 / BACKLOG C4 (L-04 IDOR): clientId filtresi eklendi — getImportJobs ile aynı desen
            const result = await this.applicationDB.getImportJobModel().updateMany(
                {
                    _id: { $in: ids },
                    clientId: this.currentClientId,
                    status: { $in: ['COMPLETED', 'FAILED'] } // Devam eden işler korunur
                },
                {
                    $set: {
                        status: 'ARCHIVED',
                        archivedAt: new Date()
                    }
                }
            );

            if (result.matchedCount === 0) {
                return {
                    success: false,
                    message: "Arşivlenebilir (tamamlanmış) kayıt bulunamadı."
                }
            }

            return {
                success: true,
                message: `${result.modifiedCount} kayıt başarıyla arşivlendi.`,
                modifiedCount: result.modifiedCount
            }

        } catch (error) {
            console.error("archiveImportJobs Error:", error);
            return { success: false, message: "Arşivleme işlemi sırasında hata oluştu." }
        }
    }


    async getJobReport() {
        const { jobId } = this.request;
        if (!jobId) return { success: false, message: "JobId required" };

        const report = await this.clientDB.getImportJobReportModel().findOne({
            jobId: new ObjectId(jobId),
            clientId: this.currentClientId
        }).lean();

        return { success: report ? true : false, data: report || null };
    }

    async batchCreator() {
        try {
            const { mode, selectedIntegrations, barcodeList, scope } = this.request;

            // Ön doğrulamalar (Hemen yanıt dönmek için)
            if (!mode || !selectedIntegrations?.length) {
                return { result: false, message: 'Geçersiz veri girişi.' };
            }
            if (scope !== 2 && !barcodeList?.length) {
                return { result: false, message: 'Lütfen varyant seçiniz.' };
            }

            // AĞIR İŞİ ARKA PLANA AT (Await etmiyoruz)
            this.internalProcessBatch(this.request).catch(err => {
                console.error("BatchCreator Background Error:", err);
            });

            // Kullanıcıyı bekletmeden yanıt dön
            return {
                result: true,
                message: 'İşleminiz  başlatıldı. Ürünler işleme alınıyor.'
            };

        } catch (error: any) {
            console.error("Batch Creator Entry Error:", error);
            return { result: false, message: 'Sistemsel bir hata oluştu.' };
        }
    }

    /**
         * 2. ARKA PLAN YÜRÜTÜCÜ: Orijinal algoritmanın tamamı burada çalışır.
         */
    private async internalProcessBatch(request: any) {
        const { mode, selectedIntegrations, barcodeList, scope } = request;
        const requestId = new ObjectId().toString();
        try {
            const now = new Date();
            const clientId = this.currentClientId;
            const initialScore = this.getInitialPriorityScore(mode);

            const BULK_LIMIT = 1000;
            const stagedOpsMap: Record<string, any[]> = {};
            const variantOpsMap: Record<string, any[]> = {};
            const acceptedCountMap: Record<string, number> = {};
            const skippedForNoTransferCountMap: Record<string, number> = {};
            const skippedForAlreadyTransferCountMap: Record<string, number> = {};

            // Map'leri ilklendir
            const matchKeyMap: Record<string, string> = {};

            // Map'leri ilklendir
            for (const integrationCode of selectedIntegrations) {
                stagedOpsMap[integrationCode] = [];
                variantOpsMap[integrationCode] = [];
                acceptedCountMap[integrationCode] = 0;
                skippedForNoTransferCountMap[integrationCode] = 0;
                skippedForAlreadyTransferCountMap[integrationCode] = 0;

                const factory = new IntegrationFactory(Number(clientId));
                const instance = await factory.getInstance(integrationCode);
                matchKeyMap[integrationCode] = (instance.getMatchKey() || 'barcode').toLowerCase();
            }

            const query: any = {};
            if (scope !== 2) {
                query.$or = [
                    { barcode: { $in: barcodeList } },
                    { stockcode: { $in: barcodeList } }
                ];
            }

            // 1. Önce string'i oluşturuyorsun (Mevcut kodun)
            const integrationSelectFieldsString = selectedIntegrations
                .map((code: string) => `platforms.${code}.upload`)
                .join(' ');

            console.log(`[BatchCreator] Starting search with query:`, JSON.stringify(query));
            console.log(`[BatchCreator] Selected integrations:`, selectedIntegrations);
            console.log(`[BatchCreator] MatchKeyMap:`, matchKeyMap);

            // 2. String'i objeye çeviriyoruz
            const projection: any = {
                barcode: 1,
                stockcode: 1,
                productId: 1,
                images: { $slice: 1 } // Sadece ilk resmi al
            };

            // String içindeki her alanı objeye "1" (true) olarak ekle
            integrationSelectFieldsString.split(' ').forEach((field: string) => {
                if (field) projection[field] = 1;
            });

            // Dinamik matchKey'leri de ekle (Örn: stockcode)
            Object.values(matchKeyMap).forEach(key => {
                projection[key] = 1;
            });

            // 3. Sorguyu çalıştır
            const cursor = this.clientDB.getVariantModel()
                .find(query)
                .select(projection) // Hazırladığımız objeyi veriyoruz
                .batchSize(BULK_LIMIT)
                .lean()
                .cursor();

            let totalVariantsProcessed = 0;
            // SINGLE PASS: Varyantları bir kez oku, tüm entegrasyonlara dağıt
            for await (const v of cursor) {
                totalVariantsProcessed++;
                for (const integrationCode of selectedIntegrations) {
                    const platformInfo = v.platforms?.[integrationCode]?.upload;
                    const transferStatus = platformInfo?.TRANSFER?.status;

                    // İş Mantığı Kontrolü (Orijinal haliyle)
                    // İş Mantığı Kontrolü - Burada atlananları sayıyoruz
                    if (
                        (mode !== 'TRANSFER' && transferStatus !== 'COMPLETED')
                    ) {
                        skippedForNoTransferCountMap[integrationCode]++; // Atlanan ürünleri say
                        continue;
                    }
                    if (
                        (mode === 'TRANSFER' && transferStatus === 'COMPLETED')
                    ) {
                        skippedForAlreadyTransferCountMap[integrationCode]++; // Atlanan ürünleri say
                        continue;
                    }

                    const matchKey = matchKeyMap[integrationCode];
                    const matchValue = v[matchKey];

                    if (!matchValue) {
                        console.error(`[integration-service] MatchValue missing for variant ${v._id} on ${integrationCode}. MatchKey: ${matchKey}`);
                        continue;
                    }

                    const minimalPayload = { barcode: v.barcode, stockcode: v.stockcode, productId: v.productId, upload: platformInfo };

                    // StagedProduct Operasyonu
                    stagedOpsMap[integrationCode].push({
                        updateOne: {
                            filter: { [matchKey]: matchValue, mode, integrationCode, status: { $in: ['QUEUED', 'PREPARING'] } },
                            update: {
                                $set: { clientId, productId: v.productId, image: v.images?.[0], payload: minimalPayload, status: 'QUEUED', priorityScore: initialScore, nextRunAt: now, updatedAt: now, barcode: v.barcode, stockcode: v.stockcode },
                                $setOnInsert: { createdAt: now, requestId, changeType: 'CONTENT', batchId: null, logs: [{ status: 'QUEUED', worker: 'BatchCreator', message: `İşlem sıraya alındı.`, timestamp: now }] }
                            },
                            upsert: true
                        }
                    });

                    /*                     if (mode == 'UPDATE' && integrationCode == "trendyol") {
                                            stagedOpsMap[integrationCode].push({
                                                updateOne: {
                                                    filter: { barcode: v.barcode, mode: 'UPDATE_VARIANT', integrationCode, status: { $in: ['QUEUED', 'PREPARING'] } },
                                                    update: {
                                                        $set: { clientId, productId: v.productId, image: v.images?.[0], payload: minimalPayload, status: 'QUEUED', priorityScore: initialScore, nextRunAt: now, updatedAt: now },
                                                        $setOnInsert: { createdAt: now, requestId, batchId: null, logs: [{ status: 'QUEUED', worker: 'BatchCreator', message: `İşlem sıraya alındı.`, timestamp: now }] }
                                                    },
                                                    upsert: true
                                                }
                                            });
                                            stagedOpsMap[integrationCode].push({
                                                updateOne: {
                                                    filter: { barcode: v.barcode, mode: 'UPDATE_DELIVERY', integrationCode, status: { $in: ['QUEUED', 'PREPARING'] } },
                                                    update: {
                                                        $set: { clientId, productId: v.productId, image: v.images?.[0], payload: minimalPayload, status: 'QUEUED', priorityScore: initialScore, nextRunAt: now, updatedAt: now },
                                                        $setOnInsert: { createdAt: now, requestId, batchId: null, logs: [{ status: 'QUEUED', worker: 'BatchCreator', message: `İşlem sıraya alındı.`, timestamp: now }] }
                                                    },
                                                    upsert: true
                                                }
                                            });
                                        }
                     */
                    // Variant Operasyonu
                    variantOpsMap[integrationCode].push({
                        updateOne: {
                            filter: { [matchKey]: matchValue },
                            update: {
                                $set: { [`platforms.${integrationCode}.upload.${mode}.status`]: 'QUEUED', [`platforms.${integrationCode}.upload.${mode}.updatedAt`]: now }
                            }
                        }
                    });

                    // Limit dolduğunda yaz
                    if (stagedOpsMap[integrationCode].length >= BULK_LIMIT) {
                        await this.flushIntegration(integrationCode, stagedOpsMap, variantOpsMap, acceptedCountMap);
                    }
                }
            }

            console.log(`[BatchCreator] Process finished. Total variants found: ${totalVariantsProcessed}`);
            for (const integrationCode of selectedIntegrations) {
                console.log(`[BatchCreator] Result for ${integrationCode}: Accepted: ${acceptedCountMap[integrationCode]}, Skipped (Already Completed): ${skippedForAlreadyTransferCountMap[integrationCode]}, Skipped (No Transfer): ${skippedForNoTransferCountMap[integrationCode]}`);
                
                // Kalan son kayıtları işle
                await this.flushIntegration(integrationCode, stagedOpsMap, variantOpsMap, acceptedCountMap);

                const totalAccepted = acceptedCountMap[integrationCode];
                const totalNoTransferSkipped = skippedForNoTransferCountMap[integrationCode]
                const totalAlreadyTransfer = skippedForAlreadyTransferCountMap[integrationCode];

                if (totalAccepted > 0) {
                    await this.applicationDB.getExportFlagModel().updateOne(
                        { clientId, integrationCode },
                        {
                            $inc: { queuedCount: totalAccepted },
                            $set: { lastUpdatedAt: now }
                        },
                        { upsert: true }
                    );
                    // Orchestrator'ı tetikle
                    integrationEventBus.emit(EVENTS.PROCESS_NEXT_SIGNAL);
                }

                // 3. GLOBAL BİLDİRİM FIRLATMA (Yeni eklenen kısım)
                // [ADR-0029 NB3] CATALOG_BATCH_SUBMITTED; bayrak kapaliyken eski olay birebir.
                void NotificationService.notify('CATALOG_BATCH_SUBMITTED', Number(clientId), {
                    integ: integrationCode, mode, batchId: requestId, itemCount: Number(totalAccepted) || 0, hasWarnings: !(totalAccepted > 0),
                }, {
                    idempotencyKey: `batch:${requestId}:${integrationCode}`,
                    corrId: getRequestId(),
                    module: 'IntegrationService',
                    legacy: { event: {
                        clientId: clientId,
                        notificationData: {
                            type: 'BATCH_PROCESS',
                            mode: mode,
                            severity: totalAccepted > 0 ? 'success' : 'warning',
                            title: 'İşlem Özeti',
                            message: `İşlemler sekmesinden takip edebilirsiniz.`,
                            metaData: { integrationCode, mode, totalAccepted, totalAlreadyTransfer, totalNoTransferSkipped }
                        }
                    } as SendNotificationEvent },
                }).catch(() => undefined);

            }
        } catch (error: any) {
            console.error("internalProcessBatch Critical Error:", error);

            // [ADR-0029 NB3, N-05] Kullaniciya ham error.message GITMEZ: guvenli hata kodu + corrId. Bayrak kapaliyken eski olay
            // (ham mesaj dahil) birebir korunur; bayrak acilinca bu yol devreye girmez.
            const integs: string[] = Array.isArray(selectedIntegrations) ? selectedIntegrations : [];
            void NotificationService.notify('CATALOG_BATCH_FAILED', Number(this.currentClientId), {
                integ: (integs.length === 1 ? integs[0] : 'multi').slice(0, 60), mode: String(mode ?? 'unknown'), batchId: requestId,
                errorCode: safeErrorCode(error), corrId: getRequestId(),
            }, {
                idempotencyKey: `batch-failed:${requestId}`,
                corrId: getRequestId(),
                module: 'IntegrationService',
                legacy: { event: {
                    clientId: this.currentClientId,
                    notificationData: {
                        type: 'BATCH_PROCESS',
                        mode: mode,
                        severity: 'error',
                        title: 'İşlem Başarısız',
                        message: `Toplu işlem sırasında bir hata oluştu: ${error.message || 'Sistemsel hata'}`,
                        metaData: { mode: request.mode, error: error.message }
                    }
                } as SendNotificationEvent },
            }).catch(() => undefined);
        }
    }



    /**
     * YARDIMCI METOT 1: Veritabanına bulk yazma işlemini yapar.
     */
    private async flushIntegration(integrationCode: string, stagedOpsMap: any, variantOpsMap: any, acceptedCountMap: any) {
        const stagedOps = stagedOpsMap[integrationCode];
        const variantOps = variantOpsMap[integrationCode];

        if (!stagedOps || stagedOps.length === 0) return;

        const [stagedResult] = await Promise.all([
            this.clientDB.getExportStagedProductModel().bulkWrite(stagedOps, { ordered: false }),
            this.clientDB.getVariantModel().bulkWrite(variantOps, { ordered: false })
        ]);

        // Sayaç için sadece yeni veya değişen kayıtları alıyoruz
        acceptedCountMap[integrationCode] += (stagedResult.upsertedCount + stagedResult.modifiedCount);

        // Belleği boşalt
        stagedOpsMap[integrationCode] = [];
        variantOpsMap[integrationCode] = [];
    }

    /**
     * YARDIMCI METOT 2: Mod bazlı başlangıç skorunu döner.
     */
    private getInitialPriorityScore(mode: string): number {
        const scores: Record<string, number> = {
            [PLATFORM_PROCESS.UPDATE_PRICE]: 130,
            [PLATFORM_PROCESS.UPDATE_STOCK]: 120,
            [PLATFORM_PROCESS.UPDATE]: 70,
            [PLATFORM_PROCESS.TRANSFER]: 60,
            [PLATFORM_PROCESS.UPDATE_VARIANT]: 50,
            [PLATFORM_PROCESS.UPDATE_DELIVERY]: 40
        };
        return scores[mode] || 50;
    }


    async retrieveCategoriesFromIntegration() {
        try {
            const integrationCode = this.request.integrationCode
            const factory = new IntegrationFactory(Number(this.currentClientId));
            const integration = await factory.getInstance(integrationCode);
            return await integration.retrieveCategories?.()
        } catch (error) {
            throw error
        }
    }


    async retrieveBrandsFromIntegration() {
        try {
            const integrationCode = this.request.integrationCode
            const query = this.request.searchText
            const factory = new IntegrationFactory(Number(this.currentClientId));
            const integration = await factory.getInstance(integrationCode);
            return await integration.retrieveBrands(query)
        } catch (error) {
            throw error
        }
    }


    async retrieveCategoryAttributesFromIntegration() {
        try {
            const integrationCode = this.request.integrationCode
            const integrationCategoryId = this.request.integrationCategoryId
            const factory = new IntegrationFactory(Number(this.currentClientId));
            const integration = await factory.getInstance(integrationCode);
            return await integration.retrieveCategoryAttributes?.(integrationCategoryId)
        } catch (error) {
            throw error
        }

    }


    async retrieveCategoryAttributeValuesFromIntegration() {
        try {
            const integrationCode = this.request.integrationCode;
            const integrationCategoryId = this.request.integrationCategoryId;
            const integrationCategoryAttributeId = this.request.integrationCategoryAttributeId;

            const factory = new IntegrationFactory(Number(this.currentClientId));
            const integration = await factory.getInstance(integrationCode);

            // getCategoryAttributeValues metodu var mı kontrol et
            if (typeof integration.retrieveCategoryAttributeValues === "function") {
                return await integration.retrieveCategoryAttributeValues(
                    integrationCategoryId,
                    integrationCategoryAttributeId
                );
            } else {
                // metod yoksa hata fırlatabilir veya boş dönersin
                return []; // ya da: throw new Error(`${integrationCode} entegrasyonu bu methodu desteklemiyor`);
            }
        } catch (error) {
            throw error;
        }
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
        const { listIntegrationDescriptors } = (require('../../integration/catalog/IntegrationDescriptorRegistry') as typeof import('../../integration/catalog/IntegrationDescriptorRegistry'));
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