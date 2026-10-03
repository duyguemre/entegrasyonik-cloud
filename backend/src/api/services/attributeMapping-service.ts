import { InvalidatesTenantCache } from '@utils/decorator/cache'
import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import stringSimilarity from 'string-similarity'
import IntegrationFactory from '../../integration/modules/IntegrationFactory'
import { ApplicationError } from '../Security'
import { listIntegrationDescriptorsByCategory } from '@integration/catalog/IntegrationDescriptorRegistry'
import { deleteStaleAttributeMappings } from '@operations/catalog/mapping/mappingCleanup'

/** autoMatch varsayılan platformu (parametre verilmezse; eski sabit davranış). */
const AUTO_MATCH_DEFAULT_CODE = 'trendyol'
const BULK_CHUNK = 500
const REPORT_CAP = 200
const isBlank = (v: any) => v === undefined || v === null || String(v).trim() === ''
const oid = (v: any, field: string): ObjectId => {
    if (typeof v !== 'string' || !/^[0-9a-fA-F]{24}$/.test(v)) throw new ApplicationError(`Geçersiz ${field}`, 400)
    return new ObjectId(v)
}

export default class AttributeMappingService extends BaseApi implements IService {



    async get(parentId = 0): Promise<any> {
        try {
            // Opsiyonel süzgeç/sayfalama (yanıt şekli aynı: dizi). Hiçbiri verilmezse tüm kayıtlar döner (FE sözleşmesi).
            const filterQuery: any = {}
            if (!isBlank(this.request?.integrationCode)) filterQuery.integrationCode = String(this.request.integrationCode)
            let query = this.clientDB.getAttributeMappingModel().find(filterQuery).collation({ locale: "tr", strength: 2 })
            if (this.request?.skip) query = query.skip(Number(this.request.skip))
            if (this.request?.limit) query = query.limit(Number(this.request.limit))
            return await query.lean()
        } catch (error) {
            throw error
        }
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
        const CategoryModel = this.clientDB.getCategoryModel();
        const AttributeMappingModel = this.clientDB.getAttributeMappingModel();
        const ChoiceModel = this.clientDB.getChoiceModel();

        // 1. Verileri toplu çek (tek seferde DB okuma)
        const [rawChoices, allLocalCategories] = await Promise.all([
            ChoiceModel.find({}),
            CategoryModel.find({})
        ]);

        const allMyChoices = rawChoices.map((c: any) => ({
            _id: c._id?.$oid || c._id?.toString(),
            title: c.title,
            values: (c.values || []).map((v: any) => ({
                _id: v._id?.$oid || v._id?.toString(),
                title: v.title
            }))
        }));
        const allChoiceTitles = allMyChoices.map((c: any) => c.title.toLocaleUpperCase('tr'));
        const localCatMap = new Map(allLocalCategories.map((c: any) => [c._id.toString(), c]));
        const localLeafCategories = allLocalCategories.filter((c: any) => !c.children || c.children.length === 0);

        // Mevcut eşlemeler hafızada (döngü içinde sorgu yok)
        const existingMappings: any[] = await AttributeMappingModel.find({ integrationCode: platformCode }).lean();
        const existingCategoryMaps = new Map<string, any>();
        for (const m of existingMappings) if (m.isCategoryMapping === true) existingCategoryMaps.set(String(m.localCategoryId), m);
        const existingAttrKeys = new Set<string>(existingMappings.filter((m: any) => m.platformAttributeId != null).map((m: any) => `${m.localCategoryId}|${m.platformAttributeId}`));

        let matchedCount = 0;
        const categoryOps: any[] = [];
        const attributeOps: any[] = [];
        const skipped: any[] = [];
        const failed: any[] = [];
        let skippedCount = 0;

        // Platform kategori özellik önbelleği (aynı kategori için tekrar API'ye gitmez)
        const platformAttrCache = new Map<string, any>();

        const cleanTitle = (text: string) => {
            return text
                .toLocaleUpperCase('tr')
                .replace(/[&/\\-]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        };

        // Platform çağrıları hata verirse YUTULMAZ: doğrudan fırlar.
        const integration = await factory.getInstance(platformCode);
        const rawRemoteCategories = await integration.retrieveCategories();

        const flattenRemote = (items: any[], parentPath: string = ""): any[] => {
            let flat: any[] = [];
            if (!Array.isArray(items)) return flat;
            items.forEach(item => {
                const currentPath = parentPath ? `${parentPath} > ${item.title}` : item.title;
                const node = { ...item, fullPath: currentPath.toLocaleUpperCase('tr') };
                flat.push(node);
                if (item.children?.length > 0) flat = flat.concat(flattenRemote(item.children, currentPath));
            });
            return flat;
        };

        const allRemoteNodes = flattenRemote(rawRemoteCategories);
        const remoteLeafs = allRemoteNodes.filter(c => !c.children || c.children.length === 0);

        const processCategory = async (localCat: any) => {
            const localTitleRaw = localCat.title.toLocaleUpperCase('tr').trim();
            const localTitleClean = cleanTitle(localTitleRaw);

            let localPath = localTitleRaw;
            if (localCat.parentId) {
                const parent: any = localCatMap.get(localCat.parentId.toString());
                if (parent) localPath = `${parent.title.toLocaleUpperCase('tr')} > ${localPath}`;
            }

            let platformCategoryId: string | undefined = existingCategoryMaps.get(localCat._id.toString())?.platformCategoryId;

            // --- KATEGORİ EŞLEŞTİRME ---
            if (!platformCategoryId) {
                let bestMatchNode = null;
                let highestScore = 0;

                for (const remoteLeaf of remoteLeafs) {
                    const remoteTitleRaw = remoteLeaf.title.toLocaleUpperCase('tr').trim();
                    const remoteTitleClean = cleanTitle(remoteTitleRaw);

                    // KEK KORUMASI: Kelime Dizileri üzerinden tam eşleşme kontrolü
                    const localWords = localTitleClean.split(/\s+/).filter((w: string) => w.length > 1);
                    const remoteWords = remoteTitleClean.split(/\s+/).filter((w: string) => w.length > 1);

                    // ERKEK içindeki KEK'i engeller (Array.includes tam kelime arar)
                    const hasExactWordMatch = localWords.some((lw: string) => remoteWords.includes(lw)) ||
                        remoteWords.some((rw: string) => localWords.includes(rw));

                    const titleScore = stringSimilarity.compareTwoStrings(localTitleClean, remoteTitleClean);
                    const pathScore = stringSimilarity.compareTwoStrings(localPath, remoteLeaf.fullPath);

                    let totalScore = (titleScore * 0.7) + (pathScore * 0.3);

                    // GÜVENLİK: Tam kelime uyuşmuyorsa ve skor %95 değilse ÇÖP say
                    if (!hasExactWordMatch && totalScore < 0.95) {
                        totalScore = 0;
                    }

                    // Kısa kelime bariyeri
                    if (remoteTitleClean.length <= 3 && !localWords.includes(remoteTitleClean)) {
                        totalScore = 0;
                    }

                    // BONUS: İçerme (Düz Bot -> Bot & Bootie durumunu kurtarır)
                    const isIncluded = remoteTitleClean.includes(localTitleClean) || localTitleClean.includes(remoteTitleClean);
                    const finalScore = (isIncluded && totalScore > 0 && totalScore < 0.85) ? 0.86 : totalScore;

                    if (finalScore > highestScore) {
                        highestScore = finalScore;
                        bestMatchNode = remoteLeaf;
                    }
                }

                if (highestScore >= 0.85 && bestMatchNode) {
                    platformCategoryId = String((bestMatchNode as any)._id);
                    categoryOps.push({
                        updateOne: {
                            filter: { localCategoryId: localCat._id, integrationCode: platformCode, platformAttributeId: null },
                            update: { $setOnInsert: { platformCategoryId, isCategoryMapping: true, updatedAt: new Date() } },
                            upsert: true
                        }
                    });
                    matchedCount++;
                }
            }

            // --- NİTELİK EŞLEŞTİRME ---
            if (!platformCategoryId) return;
            let pAttrs = platformAttrCache.get(platformCategoryId);
            if (!pAttrs) {
                pAttrs = await integration.retrieveCategoryAttributes(platformCategoryId);
                platformAttrCache.set(platformCategoryId, pAttrs);
            }
            if (!Array.isArray(pAttrs)) return;

            for (const pAttr of pAttrs) {
                const attrMatch = stringSimilarity.findBestMatch(pAttr.title.toLocaleUpperCase('tr'), allChoiceTitles);
                if (attrMatch.bestMatch.rating < 0.80) continue;
                const matchedChoice = allMyChoices[attrMatch.bestMatchIndex];

                if (existingAttrKeys.has(`${localCat._id}|${String(pAttr._id)}`)) continue;

                const pValues = pAttr.values;
                const matchedValues: any[] = [];

                if (matchedChoice.values?.length > 0) {
                    if (pAttr.allowCustom === true) {
                        for (const myVal of matchedChoice.values) {
                            matchedValues.push({ localValueId: myVal._id, platformValueId: null, platformValueName: myVal.title });
                        }
                    } else if (Array.isArray(pValues)) {
                        const myValTitles = matchedChoice.values.map((v: any) => v.title.toLocaleUpperCase('tr'));
                        for (const pVal of pValues) {
                            const vMatch = stringSimilarity.findBestMatch(pVal.title.toLocaleUpperCase('tr'), myValTitles);
                            if (vMatch.bestMatch.rating >= 0.85) {
                                matchedValues.push({
                                    localValueId: matchedChoice.values[vMatch.bestMatchIndex]._id,
                                    platformValueId: String(pVal.id),
                                    platformValueName: pVal.title
                                });
                            }
                        }
                    } else {
                        // V2: değerler ayrı uçta; gömülü değil -> boş eşleme YAZMA, raporla.
                        skippedCount++;
                        if (skipped.length < REPORT_CAP) {
                            skipped.push({ localCategoryId: String(localCat._id), platformCategoryId, platformAttributeId: String(pAttr._id), reason: 'PLATFORM_VALUES_NOT_EMBEDDED' });
                        }
                        continue;
                    }
                }

                attributeOps.push({
                    updateOne: {
                        filter: { localCategoryId: localCat._id, integrationCode: platformCode, platformAttributeId: String(pAttr._id) },
                        update: {
                            $setOnInsert: {
                                platformCategoryId: String(platformCategoryId),
                                platformAttributeName: pAttr.title,
                                localChoiceId: matchedChoice._id,
                                isVarianter: !!pAttr.varianter,
                                isSlicer: !!pAttr.slicer,
                                isRequired: !!pAttr.required,
                                isCategoryMapping: false,
                                values: matchedValues,
                                updatedAt: new Date()
                            }
                        },
                        upsert: true
                    }
                });
            }
        };

        // Rate-limit dostu: 15'erli paketler halinde paralel; tek kategori hatası raporlanır (yutulmaz, sayılır).
        const chunkSize = 15;
        for (let i = 0; i < localLeafCategories.length; i += chunkSize) {
            const chunk = localLeafCategories.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (localCat: any) => {
                try {
                    await processCategory(localCat);
                } catch (e: any) {
                    failed.push({ localCategoryId: String(localCat._id), title: localCat.title, reason: String(e?.message ?? e).slice(0, 300) });
                }
            }));
        }

        if (localLeafCategories.length > 0 && failed.length === localLeafCategories.length) {
            throw new ApplicationError(`Otomatik eşleme başarısız (${platformCode}): ${failed[0].reason}`, 502);
        }

        // Toplu yazma (yazma hatası fırlar). Kategori kayıtları önce: özellik kayıtları onlara referans verir.
        for (const ops of [categoryOps, attributeOps]) {
            for (let i = 0; i < ops.length; i += BULK_CHUNK) {
                await AttributeMappingModel.bulkWrite(ops.slice(i, i + BULK_CHUNK), { ordered: false });
            }
        }

        return {
            result: true,
            matchedCount,
            attributeMappingCount: attributeOps.length,
            skippedCount,
            skipped,
            failedCount: failed.length,
            failed: failed.slice(0, REPORT_CAP),
        };
    }

    /**
     * Yerel kategoriye ait platform kategori eşleşmesini getirir (Kategori Bazlı)
     */
    async getCategoryMapping(): Promise<any> {
        try {
            const { localCategoryId, integrationCode } = this.request;
            const filterQuery = {
                localCategoryId: new ObjectId(localCategoryId as string),
                integrationCode: integrationCode,
                platformAttributeId: null // Kategori eşleşmesi belirteci
            };

            const mapping = await this.clientDB.getAttributeMappingModel().findOne(filterQuery).lean();
            return {
                platformCategoryId: mapping ? mapping.platformCategoryId : null
            };
        } catch (error) {
            throw error;
        }
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
        try {
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

            const model = this.clientDB.getAttributeMappingModel();
            const resp = await model.updateOne(updateQuery, updateSet, { upsert: true });
            const clearedAttributeMappings = keepAttributeMappings === true
                ? 0
                : await deleteStaleAttributeMappings(model, String(localCategoryId), String(integrationCode), platformCatStr);
            return { result: resp.upsertedCount > 0 || resp.modifiedCount > 0, clearedAttributeMappings };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Belirli bir nitelik (Attribute) için yapılmış eşleşmeyi getirir
     */
    async getAttributeMapping(): Promise<any> {
        try {
            const { localCategoryId, platformAttributeId, integrationCode } = this.request;
            const filterQuery = {
                localCategoryId: new ObjectId(localCategoryId as string),
                platformAttributeId: platformAttributeId,
                integrationCode: integrationCode
            };

            const mapping = await this.clientDB.getAttributeMappingModel().findOne(filterQuery).lean();
            return mapping;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Nitelik, Seçenek ve Değer eşleşmelerini topluca kaydeder/günceller
     */
    @InvalidatesTenantCache('PlatformMappingProvider')
    async saveAttributeMapping(): Promise<any> {
        try {
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

            const resp = await this.clientDB.getAttributeMappingModel().updateOne(updateQuery, updateSet, { upsert: true });
            return { result: resp.upsertedCount > 0 || resp.modifiedCount > 0 };
        } catch (error) {
            throw error;
        }
    }

    /**
     * (integrationCode, platformCategoryId) kategori eşlemesinden yerel kategori kimliği çıkarır (istemci `localCategoryId`
     * göndermediğinde; bugünkü FE göndermez). TEK aday değilse belirsizlik -> 400 (yanlış kategoriye yazma yok).
     */
    private async resolveLocalCategoryId(integrationCode: string, platformCategoryId: string): Promise<string> {
        const rows: any[] = await this.clientDB.getAttributeMappingModel()
            .find({ integrationCode, platformCategoryId, platformAttributeId: null, isCategoryMapping: true }).limit(2).lean();
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

            const model = this.clientDB.getAttributeMappingModel();
            let resp: any;
            try {
                resp = await model.updateOne(query, pipeline as any, { upsert: true });
            } catch (e: any) {
                // Aynı anahtarla eşzamanlı ilk yazma: benzersiz indeks yarışını kaybeden, belge artık var -> güvenle bir kez daha dene.
                if (e?.code !== 11000) throw e;
                resp = await model.updateOne(query, pipeline as any, { upsert: true });
            }
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
        try {
            const { localCategoryId, integrationCode } = this.request;
            if (typeof integrationCode !== 'string' || !integrationCode) return { acknowledged: true, deletedCount: 0 };
            const deleteQuery = {
                localCategoryId: oid(localCategoryId, 'localCategoryId'),
                integrationCode
            };
            const resp = await this.clientDB.getAttributeMappingModel().deleteMany(deleteQuery);
            return resp;
        } catch (error) {
            throw error;
        }
    }
}
