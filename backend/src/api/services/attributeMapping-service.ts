import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import stringSimilarity from 'string-similarity'
import IntegrationFactory from '../../integration/modules/IntegrationFactory'

export default class AttributeMappingService extends BaseApi implements IService {
    currentClientId!: any

    constructor(clientId: number, protected request: any) {
        super(clientId, request);
        this.currentClientId = clientId;
    }


    async get(parentId = 0): Promise<any> {
        try {
            const filterQuery = {}
            return await this.clientDB.getAttributeMappingModel().find(filterQuery).collation({ locale: "tr", strength: 2 }).lean()
        } catch (error) {
            throw error
        }
    }



    async autoMatchAllCategories() {
        try {
            const factory = new IntegrationFactory(Number(this.currentClientId));
            const CategoryModel = this.clientDB.getCategoryModel();
            const AttributeMappingModel = this.clientDB.getAttributeMappingModel();
            const ChoiceModel = this.clientDB.getChoiceModel();

            // 1. Verileri Toplu Çek (Performans: Tek seferde DB okuma)
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

            // Performans: Mevcut mappingleri hafızaya al (Döngü içinde findOne yükünü kaldırır)
            const existingMappings = await AttributeMappingModel.find({ integrationCode: 'trendyol' });

            const activePlatforms = ['trendyol'];
            let matchedCount = 0;

            // Performans: Platform Attribute Cache (Aynı kategori için tekrar API'ye gitmez)
            const platformAttrCache = new Map<string, any>();

            // YARDIMCI: Bağlaç ve Gereksiz Karakter Temizleyici
            const cleanTitle = (text: string) => {
                return text
                    .toLocaleUpperCase('tr')
                    .replace(/[&/\\-]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            };

            for (const platformCode of activePlatforms) {
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

                // PERFORMANS: 5'erli paketler halinde paralel işle (Rate Limit dostu)
                const chunkSize = 15;
                for (let i = 0; i < localLeafCategories.length; i += chunkSize) {
                    const chunk = localLeafCategories.slice(i, i + chunkSize);

                    await Promise.all(chunk.map(async (localCat: any) => {
                        const localTitleRaw = localCat.title.toLocaleUpperCase('tr').trim();
                        const localTitleClean = cleanTitle(localTitleRaw);

                        let localPath = localTitleRaw;
                        if (localCat.parentId) {
                            const parent: any = localCatMap.get(localCat.parentId.toString());
                            if (parent) localPath = `${parent.title.toLocaleUpperCase('tr')} > ${localPath}`;
                        }

                        // Hafızadaki listeden kontrol et
                        let mappingRecord = existingMappings.find((m: any) =>
                            m.localCategoryId.toString() === localCat._id.toString() &&
                            m.isCategoryMapping === true
                        );

                        // --- KATEGORİ EŞLEŞTİRME ---
                        if (!mappingRecord) {
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
                                mappingRecord = await AttributeMappingModel.create({
                                    integrationCode: platformCode,
                                    localCategoryId: localCat._id,
                                    platformCategoryId: String(bestMatchNode._id),
                                    isCategoryMapping: true,
                                    updatedAt: new Date()
                                });
                                matchedCount++;
                            }
                        }

                        // --- NİTELİK EŞLEŞTİRME ---
                        if (mappingRecord && mappingRecord.platformCategoryId) {
                            // Performans: Cache'den çek (Platform kategori ID'sine göre özellikler)
                            let pAttrs = platformAttrCache.get(mappingRecord.platformCategoryId);
                            if (!pAttrs) {
                                pAttrs = await integration.retrieveCategoryAttributes(mappingRecord.platformCategoryId);
                                platformAttrCache.set(mappingRecord.platformCategoryId, pAttrs);
                            }

                            if (Array.isArray(pAttrs)) {
                                for (const pAttr of pAttrs) {
                                    const attrMatch = stringSimilarity.findBestMatch(pAttr.title.toLocaleUpperCase('tr'), allChoiceTitles);
                                    if (attrMatch.bestMatch.rating >= 0.80) {
                                        const matchedChoice = allMyChoices[attrMatch.bestMatchIndex];

                                        // Hafızadan nitelik eşleşmesi kontrolü
                                        const isAlreadyMapped = existingMappings.some((m: any) =>
                                            m.localCategoryId.toString() === localCat._id.toString() &&
                                            m.platformAttributeId === String(pAttr._id)
                                        );
                                        if (isAlreadyMapped) continue;

                                        const pValues = pAttr.values; // Servis çağırmadan içinden alıyoruz
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
                                            }
                                        }

                                        await AttributeMappingModel.create({
                                            integrationCode: platformCode,
                                            localCategoryId: localCat._id,
                                            platformCategoryId: String(mappingRecord.platformCategoryId),
                                            platformAttributeId: String(pAttr._id),
                                            platformAttributeName: pAttr.title,
                                            localChoiceId: matchedChoice._id,
                                            isVarianter: !!pAttr.varianter,
                                            isSlicer: !!pAttr.slicer,
                                            isRequired: !!pAttr.required,
                                            isCategoryMapping: false,
                                            values: matchedValues,
                                            updatedAt: new Date()
                                        });
                                    }
                                }
                            }
                        }
                    }));
                }
            }
            return { result: true, matchedCount };
        } catch (error: any) {
            console.error("Deep AutoMatch Error:", error);
            return { result: false, error: error?.message };
        }
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
     * Kategori bazlı eşleşmeyi (isCategoryMapping: true) kaydeder veya günceller
     */
    async saveCategoryMapping(): Promise<any> {
        try {
            const { localCategoryId, platformCategoryId, integrationCode } = this.request;

            const updateQuery = {
                localCategoryId: new ObjectId(localCategoryId as string),
                integrationCode: integrationCode,
                platformAttributeId: null
            };

            const updateSet = {
                $set: {
                    platformCategoryId: platformCategoryId,
                    isCategoryMapping: true,
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

            if (!localChoiceId || !platformAttributeId) {
                throw new Error("Attribute eşlemesi boş olamaz")
            }
            if (!localCategoryId) {
                throw new Error("Geçersiz yerel kategori ID");
            }
            // ObjectId dönüşümlerini yapalım
            const formattedValues = values?.map((v: any) => ({
                ...v,
                localValueId: new ObjectId(v.localValueId as string)
            }));

            const updateQuery = {
                localCategoryId: new ObjectId(localCategoryId as string),
                integrationCode: integrationCode,
                platformAttributeId: platformAttributeId
            };

            const updateSet = {
                $set: {
                    platformCategoryId: platformCategoryId,
                    platformAttributeName: platformAttributeName,
                    localChoiceId: new ObjectId(localChoiceId as string),
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
                isRequired
            } = this.request;

            // Temel validasyonlar
            if (!platformAttributeId || !localValueId || !integrationCode) {
                throw new Error("Eksik veri: attributeId, localValueId veya integrationCode boş olamaz.");
            }

            // MongoDB Query: Hangi dökümanı güncelleyeceğiz?
            // Not: localCategoryId'yi mappingDefinition'dan aldığın için query'e eklemek güvenlidir.
            const query = {
                integrationCode: integrationCode,
                platformAttributeId: platformAttributeId,
                // Eğer kategori bağımsız bir eşleme ise burayı kaldırabilirsin 
                // ama genellikle kategori bazlı tutulur:
                platformCategoryId: platformCategoryId
            };

            // Yeni eklenecek/güncellenecek değer objesi
            const newValueEntry = {
                localValueId: new ObjectId(localValueId as string),
                platformValueId: platformValueId || platformValueName,
                platformValueName: platformValueName,
                updatedAt: new Date()
            };

            /* MANTIK: 
               1. Önce dökümanın varlığını kontrol etmeden "upsert" ile genel bilgileri set ediyoruz.
               2. 'values' dizisi içinde aynı 'platformValueId' varsa onu güncelliyoruz ($), 
                  yoksa yeni bir tane ekliyoruz ($addToSet).
            */

            // 1. Adım: Genel meta verileri güncelle veya oluştur (upsert)
            await this.clientDB.getAttributeMappingModel().updateOne(
                query,
                {
                    $set: {
                        platformAttributeName,
                        localChoiceId: new ObjectId(localChoiceId as string),
                        isVarianter,
                        isSlicer,
                        isRequired,
                        isCategoryMapping: false,
                        updatedAt: new Date()
                    }
                },
                { upsert: true }
            );

            // 2. Adım: Değer dizisini güncelle
            // Önce mevcut dizide bu platformValueId var mı diye bakıp siliyoruz (update/replace yerine temiz temiz eklemek için)
            // Veya daha performanslı olsun dersen:
            await this.clientDB.getAttributeMappingModel().updateOne(
                query,
                {
                    // Önce varsa eskiyi çıkar (duplicate önleme)
                    $pull: { values: { platformValueId: platformValueId } }
                }
            );

            // Şimdi yeni değeri ekle
            const resp = await this.clientDB.getAttributeMappingModel().updateOne(
                query,
                {
                    $push: { values: newValueEntry }
                }
            );

            return { result: resp.modifiedCount > 0 || resp.upsertedCount > 0 };

        } catch (error) {
            console.error("saveAttributeValueMapping Error:", error);
            throw error;
        }
    }


    /**
     * Bir yerel kategoriye ait tüm eşleşmeleri siler (Kategori eşleşmesi dahil)
     */
    async deleteFullMapping(): Promise<any> {
        try {
            const deleteQuery = {
                localCategoryId: new ObjectId(this.request.localCategoryId as string),
                integrationCode: this.request.integrationCode
            };
            const resp = await this.clientDB.getAttributeMappingModel().deleteMany(deleteQuery);
            return resp;
        } catch (error) {
            throw error;
        }
    }
}