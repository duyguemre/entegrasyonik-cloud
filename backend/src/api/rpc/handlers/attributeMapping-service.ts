import { InvalidatesTenantCache } from '@utils/decorator/cache'
import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import IntegrationFactory from '../../../integration/modules/IntegrationFactory'
import { ApplicationError } from '@platform/core/security/Security'
import { listIntegrationDescriptorsByCategory } from '@integration/catalog/IntegrationDescriptorRegistry'
import { deleteStaleAttributeMappings } from '@operations/catalog/mapping/mappingCleanup'
import { autoMatchAllCategories } from '@operations/catalog/mapping/autoMatch'
import { AttributeMappingRepository } from '@database/repositories/tenant/AttributeMappingRepository'
import { CategoryRepository } from '@database/repositories/tenant/CategoryRepository'
import { ChoiceRepository } from '@database/repositories/tenant/ChoiceRepository'

/** autoMatch varsayılan platformu (parametre verilmezse; eski sabit davranış). */
const AUTO_MATCH_DEFAULT_CODE = 'trendyol'
const isBlank = (v: any) => v === undefined || v === null || String(v).trim() === ''
const oid = (v: any, field: string): ObjectId => {
    if (typeof v !== 'string' || !/^[0-9a-fA-F]{24}$/.test(v)) throw new ApplicationError(`Geçersiz ${field}`, 400)
    return new ObjectId(v)
}

export default class AttributeMappingService extends BaseApi implements IService {

    // Getter: test, servisi kurduktan SONRA `svc.clientDB` atar (BrandService deseni).
    private get mappings() { return new AttributeMappingRepository(this.clientDB) }
    private get categories() { return new CategoryRepository(this.clientDB) }
    private get choices() { return new ChoiceRepository(this.clientDB) }

    async get(parentId = 0): Promise<any> {
        // Opsiyonel süzgeç/sayfalama (yanıt şekli aynı: dizi). Hiçbiri verilmezse tüm kayıtlar döner (FE sözleşmesi).
        const filterQuery: any = {}
        if (!isBlank(this.request?.integrationCode)) filterQuery.integrationCode = String(this.request.integrationCode)
        return await this.mappings.list(filterQuery, { skip: this.request?.skip, limit: this.request?.limit })
    }



    /**
     * Platform kodu: `request.integrationCode` (verilmezse 'trendyol' — eski sabit davranış). İzinli liste: kayıtlı pazaryeri adaptörleri
     * (`INTEGRATION_DESCRIPTORS`, kategori 'marketplace'); dışındaki kod 400.
     */
    private resolveAutoMatchPlatform(): string {
        const code = String(this.request?.integrationCode ?? AUTO_MATCH_DEFAULT_CODE).trim().toLowerCase()
        const allowed = listIntegrationDescriptorsByCategory('marketplace').map((d) => d.code)
        if (!allowed.includes(code)) throw new ApplicationError(`Desteklenmeyen entegrasyon: ${code}. İzinli: ${allowed.join(', ')}`, 400)
        return code
    }

    /**
     * Yerel yaprak kategorileri platform kategorilerine + özelliklerine otomatik eşler.
     *  - Yazma TOPLU (`bulkWrite`, `$setOnInsert` upsert): var olan (kullanıcının yaptığı) eşleme ASLA ezilmez; N+1 yazma yok.
     *  - Hata YUTULMAZ (ADR-0006): platform çağrısı/yazma hatası fırlar. Tek tek kategori hataları yanıtın `failed` listesinde raporlanır;
     *    HEPSİ başarısızsa 502 fırlatılır.
     *  - V2'de değerleri gömülü gelmeyen (allowCustom olmayan) özelliklerde eşleme YAZILMAZ; `skipped` listesinde raporlanır.
     */
    @InvalidatesTenantCache('PlatformMappingProvider')
    async autoMatchAllCategories() {
        const platformCode = this.resolveAutoMatchPlatform();
        const factory = new IntegrationFactory(Number(this.currentClientId));
        return autoMatchAllCategories({
            platformCode,
            mappings: this.mappings,
            categories: this.categories,
            choices: this.choices,
            getIntegration: (code) => factory.getInstance(code),
        });
    }

    /**
     * Yerel kategoriye ait platform kategori eşleşmesini getirir (Kategori Bazlı)
     */
    async getCategoryMapping(): Promise<any> {
        const { localCategoryId, integrationCode } = this.request;
        const filterQuery = {
            localCategoryId: new ObjectId(localCategoryId as string),
            integrationCode: integrationCode,
            platformAttributeId: null // Kategori eşleşmesi belirteci
        };

        const mapping = await this.mappings.findOne(filterQuery);
        return {
            platformCategoryId: mapping ? mapping.platformCategoryId : null
        };
    }

    /**
     * Kategori bazlı eşleşmeyi (isCategoryMapping: true) kaydeder veya günceller.
     *
     * Platform kategorisi DEĞİŞİYORSA (P1-4) o yerel kategorinin ESKİ platform kategorisine ait özellik eşlemeleri VARSAYILAN olarak
     * SİLİNİR; yanıtta `clearedAttributeMappings` sayısı döner. Gerekçe: bayat eşlemeler yeni kategoride var olmayan özellik/değer
     * kimlikleri taşır (yanlış yük veya asenkron ret); silinenler `autoMatchAllCategories` ile yeniden üretilebilir türev veridir. Elle
     * tutmak isteyen `keepAttributeMappings: true` yollar (açık onay bayrağı). Aynı platform kategorisi tekrar kaydedilirse hiçbir şey silinmez.
     * İşlemler iki yazma (upsert + idempotent koşullu silme) — biri düşerse aynı çağrının tekrarı durumu tamamlar.
     */
    @InvalidatesTenantCache('PlatformMappingProvider')
    async saveCategoryMapping(): Promise<any> {
        const { localCategoryId, platformCategoryId, integrationCode, keepAttributeMappings } = this.request;
        if (isBlank(platformCategoryId) || isBlank(integrationCode)) throw new ApplicationError('platformCategoryId ve integrationCode gerekli', 400);
        const platformCatStr = String(platformCategoryId);
        const localOid = oid(localCategoryId, 'localCategoryId');

        const updateQuery = {
            localCategoryId: localOid,
            integrationCode: integrationCode,
            platformAttributeId: null
        };

        const updateSet = {
            $set: {
                platformCategoryId: platformCatStr,
                isCategoryMapping: true,
                updatedAt: new Date()
            }
        };

        const mappings = this.mappings;
        const resp = await mappings.upsertOne(updateQuery, updateSet);
        const clearedAttributeMappings = keepAttributeMappings === true
            ? 0
            : await deleteStaleAttributeMappings(mappings, String(localCategoryId), String(integrationCode), platformCatStr);
        return { result: resp.upsertedCount > 0 || resp.modifiedCount > 0, clearedAttributeMappings };
    }

    /**
     * Belirli bir nitelik (Attribute) için yapılmış eşleşmeyi getirir
     */
    async getAttributeMapping(): Promise<any> {
        const { localCategoryId, platformAttributeId, integrationCode } = this.request;
        const filterQuery = {
            localCategoryId: new ObjectId(localCategoryId as string),
            platformAttributeId: platformAttributeId,
            integrationCode: integrationCode
        };

        const mapping = await this.mappings.findOne(filterQuery);
        return mapping;
    }

    /**
     * Nitelik, Seçenek ve Değer eşleşmelerini topluca kaydeder/günceller
     */
    @InvalidatesTenantCache('PlatformMappingProvider')
    async saveAttributeMapping(): Promise<any> {
        const {
            localCategoryId,
            platformCategoryId,
            integrationCode,
            platformAttributeId,
            platformAttributeName,
            localChoiceId,
            isVarianter,
            isSlicer,
            isRequired,
            values // Array<{ localValueId, platformValueId, platformValueName }>
        } = this.request;

        if (!localChoiceId || isBlank(platformAttributeId)) {
            throw new ApplicationError("Attribute eşlemesi boş olamaz", 400)
        }
        if (!localCategoryId) {
            throw new ApplicationError("Geçersiz yerel kategori ID", 400);
        }
        // Kimlikler pazaryerinde sayı olabilir; şema String -> tek tip dizge.
        const formattedValues = values?.map((v: any) => ({
            localValueId: oid(v.localValueId, 'localValueId'),
            platformValueId: isBlank(v.platformValueId) ? null : String(v.platformValueId),
            platformValueName: v.platformValueName
        }));

        const updateQuery = {
            localCategoryId: oid(localCategoryId, 'localCategoryId'),
            integrationCode: integrationCode,
            platformAttributeId: String(platformAttributeId)
        };

        const updateSet = {
            $set: {
                platformCategoryId: isBlank(platformCategoryId) ? platformCategoryId : String(platformCategoryId),
                platformAttributeName: platformAttributeName,
                localChoiceId: oid(localChoiceId, 'localChoiceId'),
                isVarianter: isVarianter,
                isSlicer: isSlicer,
                isRequired: isRequired,
                values: formattedValues,
                isCategoryMapping: false,
                updatedAt: new Date()
            }
        };

        const resp = await this.mappings.upsertOne(updateQuery, updateSet);
        return { result: resp.upsertedCount > 0 || resp.modifiedCount > 0 };
    }

    /**
     * (integrationCode, platformCategoryId) kategori eşlemesinden yerel kategori kimliği çıkarır (istemci `localCategoryId`
     * göndermediğinde; bugünkü FE göndermez). TEK aday değilse belirsizlik -> 400 (yanlış kategoriye yazma yok).
     */
    private async resolveLocalCategoryId(integrationCode: string, platformCategoryId: string): Promise<string> {
        const rows: any[] = await this.mappings.findCategoryMappingsByPlatformCategory(integrationCode, platformCategoryId);
        if (rows.length !== 1) {
            throw new ApplicationError(rows.length === 0
                ? 'Bu platform kategorisi için yerel kategori eşlemesi yok; önce kategori eşlemesi yapın.'
                : 'Bu platform kategorisi birden çok yerel kategoriye eşli; localCategoryId gönderin.', 400);
        }
        return String(rows[0].localCategoryId);
    }

    /**
     * Tek bir değer eşlemesini ATOMİK kaydeder (tek `updateOne`, aggregation-pipeline güncellemesi + upsert):
     * belge meta alanları + `values` dizisi (aynı yerel değer VEYA aynı platform değer kimliği varsa eski girdi çıkarılır, yenisi eklenir)
     * tek yazmada güncellenir. Eski 3 ayrı yazma ($set/$pull/$push) yarış koşuluyla aynı değeri iki kez/eksik yazabiliyordu.
     * Belge anahtarı (localCategoryId, integrationCode, platformAttributeId) = benzersiz indeks; `platformCategoryId` sorguda DEĞİL
     * $set'te (kategori yeniden eşlenince ikinci belge/indeks çakışması oluşmaz).
     * Kimlik zorunlu: `platformValueId` yoksa yalnız `isAllowCustom: true` ile serbest metin (platformValueId=null) kabul edilir.
     */
    @InvalidatesTenantCache('PlatformMappingProvider')
    async saveAttributeValueMapping(): Promise<any> {
        try {
            const {
                integrationCode,
                platformCategoryId,
                platformAttributeId,
                platformAttributeName,
                localChoiceId,
                platformValueName,
                platformValueId,
                localValueId,
                isVarianter,
                isSlicer,
                isRequired,
                isAllowCustom
            } = this.request;

            if (isBlank(platformAttributeId) || isBlank(localValueId) || isBlank(integrationCode) || isBlank(platformCategoryId) || isBlank(localChoiceId)) {
                throw new ApplicationError("Eksik veri: platformAttributeId, platformCategoryId, localChoiceId, localValueId veya integrationCode boş olamaz.", 400);
            }
            const valueId: string | null = isBlank(platformValueId) ? null : String(platformValueId);
            const valueName = isBlank(platformValueName) ? '' : String(platformValueName);
            if (valueId === null && isAllowCustom !== true) {
                throw new ApplicationError("platformValueId zorunlu; serbest metin yalnızca isAllowCustom=true olan özelliklerde kabul edilir.", 400);
            }
            if (!valueName) throw new ApplicationError("platformValueName boş olamaz.", 400);

            const platformCatStr = String(platformCategoryId);
            const localCategoryId = !isBlank(this.request.localCategoryId)
                ? String(this.request.localCategoryId)
                : await this.resolveLocalCategoryId(String(integrationCode), platformCatStr);

            const localValueOid = oid(localValueId, 'localValueId');
            const now = new Date();
            const entry = { localValueId: localValueOid, platformValueId: valueId, platformValueName: valueName, updatedAt: now };

            // Kullanıcı değerleri aggregation ifadesi SAYILMASIN ($ ile başlayan metin): hepsi $literal içinde.
            const lit = (v: any) => ({ $literal: v });
            const meta: any = {
                platformCategoryId: lit(platformCatStr),
                localChoiceId: lit(oid(localChoiceId, 'localChoiceId')),
                isCategoryMapping: lit(false),
                updatedAt: lit(now),
            };
            if (!isBlank(platformAttributeName)) meta.platformAttributeName = lit(String(platformAttributeName));
            if (typeof isVarianter === 'boolean') meta.isVarianter = lit(isVarianter);
            if (typeof isSlicer === 'boolean') meta.isSlicer = lit(isSlicer);
            if (typeof isRequired === 'boolean') meta.isRequired = lit(isRequired);

            const sameLocalValue = { $eq: ['$$v.localValueId', lit(localValueOid)] };
            const dropCond = valueId === null ? sameLocalValue : { $or: [sameLocalValue, { $eq: ['$$v.platformValueId', lit(valueId)] }] };
            const pipeline = [{
                $set: {
                    ...meta,
                    values: {
                        $concatArrays: [
                            { $filter: { input: { $ifNull: ['$values', []] }, as: 'v', cond: { $not: [dropCond] } } },
                            [lit(entry)]
                        ]
                    }
                }
            }];

            const query = {
                localCategoryId: oid(localCategoryId, 'localCategoryId'),
                integrationCode: String(integrationCode),
                platformAttributeId: String(platformAttributeId)
            };

            // Aynı anahtarla eşzamanlı ilk yazmada benzersiz indeks yarışı (11000) depo içinde bir kez yeniden denenir.
            const resp = await this.mappings.upsertWithRaceRetry(query, pipeline);
            return { result: resp.modifiedCount > 0 || resp.upsertedCount > 0 };

        } catch (error) {
            console.error("saveAttributeValueMapping Error:", error);
            throw error;
        }
    }


    /**
     * Bir yerel kategoriye ait tüm eşleşmeleri siler (Kategori eşleşmesi dahil).
     * Geçerli entegrasyon kodu yoksa (FE kategori silme akışı `-1` yollayabilir) hiçbir şey silmez (eski davranış: eşleşen kayıt yok).
     */
    @InvalidatesTenantCache('PlatformMappingProvider')
    async deleteFullMapping(): Promise<any> {
        const { localCategoryId, integrationCode } = this.request;
        if (typeof integrationCode !== 'string' || !integrationCode) return { acknowledged: true, deletedCount: 0 };
        return await this.mappings.deleteAllOfCategory(oid(localCategoryId, 'localCategoryId'), integrationCode);
    }
}
