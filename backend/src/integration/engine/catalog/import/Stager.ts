import IntegrationFactory from '../../../modules/IntegrationFactory';

import { BaseWorker } from '../../BaseWorker';
import { IIntegrationEngineProvider } from '../provider/IIntegrationEngineProvider';
import os from 'os';
import { eventLog } from '@platform/core/logger';

const log = eventLog('worker', 'Stager');

export default class Stager extends BaseWorker {
    protected readonly workerName = 'Catalog Stager';

    constructor(private engineProvider: IIntegrationEngineProvider) {
        super();
    }


    public async runOnce(jobIdStr: string) {
        // İş merkezi ApplicationDB üzerinden kontrol edilmeye devam eder
        const job = await this.engineProvider.getImportJobModel().findById(jobIdStr).lean();
        if (!job || job.status !== 'WAITING_FOR_FETCH') return;

        const { clientId, integrationCode } = job;
        const podName = process.env.POD_NAME || os.hostname();

        try {

            const factory = new IntegrationFactory(clientId);
            const integration = await factory.getInstance(integrationCode);
            const matchKey = integration.getMatchKey() || 'barcode';

            log.info('STAGER_STARTED_USING_MATCHKEY', `Stager started for ${jobIdStr} on ${podName} using matchKey: ${matchKey}`);

            // 1. Mapping'leri Cache'le (Kritik: ClientDB üzerinden)
            const allMappings = await this.engineProvider.getAttributeMappingModel().find({ integrationCode }).lean();
            const categoryMap = new Map();
            const attributeMap = new Map();
            /*             allMappings.forEach((m: any) => {
                            if (m.isCategoryMapping) categoryMap.set(String(m.platformCategoryId), m);
                            else attributeMap.set(`${m.platformCategoryId}_${m.platformAttributeId}`, m);
                        });
             */

            allMappings.forEach((m: any) => {
                const platformId = String(m.platformCategoryId);
                if (m.isCategoryMapping) {
                    if (!categoryMap.has(platformId)) categoryMap.set(platformId, []);
                    categoryMap.get(platformId).push(m);
                } else {
                    const attrKey = `${platformId}_${m.platformAttributeId}`;
                    if (!attributeMap.has(attrKey)) attributeMap.set(attrKey, []);
                    attributeMap.get(attrKey).push(m);
                }
            });

            // Rapor temizliği (Yeni yapı: ClientDB)
            await this.engineProvider.getImportJobReportModel().deleteMany({ jobId: job._id });

            // Status güncelleme (Koordinasyon: ApplicationDB)
            await this.engineProvider.getImportJobModel().updateOne(
                { _id: job._id },
                { $set: { status: 'FETCHING', startedAt: new Date(), matchKey: matchKey } }
            );

            // Factory ve Integration instance'ı yukarıda oluşturuldu

            let totalCount = 0, vCount = 0, iCount = 0, dCount = 0;
            const globalMissingCategories = new Set<string>();
            const globalCategoryProductCounts = new Map<string, number>(); // { "platformCatId": count }
            const globalMissingAttributes = new Map<string, any>();
            const globalDuplicates = new Set<string>();

            // --- STREAM VE ALGORİTMA (KORUNDU) ---
            const result = await integration.streamProducts(async (chunk: any[]) => {
                totalCount += chunk.length;

                const stagingOps: any[] = [];
                const summaryOps = new Map<string, any>();

                for (const product of chunk) {
                    const summaryData = await integration.getSummaryFromRaw(product);
                    const matchValue = summaryData[matchKey];
                    const mCode = summaryData.maincode;

                    let status: 'VALID' | 'INVALID' | 'DUPLICATE' = 'VALID';
                    let reason = "";



                    const platformCategoryId = String(summaryData.platformCategoryId)
                    const { isValid, missingAttributes, localCategoryId } = this.validateMapping(
                        platformCategoryId,
                        summaryData.requiredAttributes,
                        categoryMap,
                        attributeMap
                    );


                    if (isValid) {
                        status = 'VALID';
                        vCount++;
                    } else {
                        status = 'INVALID';
                        iCount++;

                        // --- KATEGORİ BAZLI ÜRÜN SAYACI ---
                        const currentCount = globalCategoryProductCounts.get(platformCategoryId) || 0;
                        globalCategoryProductCounts.set(platformCategoryId, currentCount + 1);

                        // Kategori eşleşmesi yoksa missingCategories set'ine ekle (Dashboard için)
                        if (!categoryMap.has(platformCategoryId)) {
                            globalMissingCategories.add(platformCategoryId);
                            reason = "Kategori eşleşmesi eksik.";
                        } else {
                            reason = "Nitelik eşleşmesi eksik.";
                        }

                        // Metottan gelen nitelikleri her durumda Map'e bas
                        // (İster kategori eksik olsun ister nitelik, artık missingAttributes her iki durumda da dolu geliyor)
                        missingAttributes.forEach(attr => {
                            const key = `${platformCategoryId}_${attr.localCategoryId || 'NO_LOCAL'}_${attr.attributeId}_${attr.attributeValueId || attr.attributeValue}`;
                            globalMissingAttributes.set(key, { ...attr, localCategoryId });
                        });

                    }

                    // STAGING YAZIMI (Yeni yapı: ClientDB)
                    stagingOps.push({
                        updateOne: {
                            filter: { jobId: job._id, [matchKey]: matchValue },
                            update: {
                                $set: {
                                    clientId, integrationCode, maincode: mCode,
                                    barcode: summaryData.barcode, // Diğer alanları da doldurmaya devam et
                                    stockcode: summaryData.stockcode, platformProductId: summaryData.productId, localCategoryId,
                                    rawData: product, importStatus: status, skipReason: reason, updatedAt: new Date()
                                },
                                $setOnInsert: { createdAt: new Date() }
                            },
                            upsert: true
                        }
                    });

                    let op = summaryOps.get(mCode);
                    if (!op) {
                        op = {
                            updateOne: {
                                filter: { jobId: job._id, maincode: mCode },
                                update: {
                                    $set: { clientId, integrationCode, updatedAt: new Date() },
                                    $min: { minSalePrice: summaryData.salePrice, minMarketPrice: summaryData.marketPrice },
                                    $max: { maxSalePrice: summaryData.salePrice },
                                    $inc: { totalStock: summaryData.quantity },
                                    $addToSet: { allImages: { $each: summaryData.images } }
                                },
                                upsert: true
                            }
                        };
                    } else {
                        // EĞER VARSA: Değerleri güncelle/biriktir (Kritik kısım burası)
                        const update = op.updateOne.update;

                        // Stok miktarını artır
                        update.$inc.totalStock += summaryData.quantity;

                        // Fiyat sınırlarını güncelle (JS tarafında kontrol)
                        update.$min.minSalePrice = Math.min(update.$min.minSalePrice, summaryData.salePrice);
                        update.$min.minMarketPrice = Math.min(update.$min.minMarketPrice, summaryData.marketPrice);
                        update.$max.maxSalePrice = Math.max(update.$max.maxSalePrice, summaryData.salePrice);

                        // Resimleri listeye ekle (Daha sonra MongoDB bulk içinde tek seferde unique yapacak)
                        update.$addToSet.allImages.$each.push(...summaryData.images);
                    }
                    summaryOps.set(mCode, op);
                }

                // Veritabanı Yazımları (Yeni yapı: ClientDB Modelleri üzerinden)
                if (stagingOps.length > 0) {
                    await this.engineProvider.getImportStagedProductModel().bulkWrite(stagingOps, { ordered: false });
                }
                if (summaryOps.size > 0) {
                    await this.engineProvider.getImportStagedProductSummaryModel().bulkWrite(Array.from(summaryOps.values()));
                }

                // Dashboard Sayaç Güncellemesi (Koordinasyon: ApplicationDB)
                await this.engineProvider.getImportJobModel().updateOne(
                    { _id: job._id },
                    { $set: { totalCount: totalCount, validCount: vCount, invalidCount: iCount, duplicateCount: dCount, updatedAt: new Date() } }
                );
            });

            // 4. Nihai Rapor Güncellemesi (Yeni yapı: ClientDB)

            const missingCategoryProductCountsArray = Array.from(globalCategoryProductCounts.entries()).map(([catId, count]) => ({
                platformCategoryId: catId,
                productCount: count
            }));

            await this.engineProvider.getImportJobReportModel().updateOne(
                { jobId: job._id },
                {
                    $set: {
                        clientId, integrationCode, updatedAt: new Date(),

                        missingCategories: Array.from(globalMissingCategories),
                        missingCategoryProductCounts: missingCategoryProductCountsArray,
                        missingAttributes: Array.from(globalMissingAttributes.values()),
                        duplicateBarcodes: Array.from(globalDuplicates).slice(0, 500)

                    }
                },
                { upsert: true }
            );

            // İş bitti: Ready to Sync (ApplicationDB)
            await this.engineProvider.getImportJobModel().updateOne(
                { _id: job._id },
                { $set: { status: result.status == 'COMPLETED' ? 'READY_TO_SYNC' : 'FAILED', updatedAt: new Date() } }
            );

            log.info('STAGER_FINISHED', `Stager finished for ${jobIdStr}  on ${podName}`);

        } catch (error: any) {
            log.error('STAGER_FAILED', `Stager failed for ${jobIdStr}  on ${podName} error: ${error.message}`);
            await this.engineProvider.getImportJobModel().updateOne(
                { _id: job._id },
                { $set: { status: 'FAILED', error: { message: error.message } } }
            );
        }
    }


    /**
 * Pazaryeri kategorisi ve niteliklerinin yerel eşleşmelerle 
 * en az bir tam yol oluşturup oluşturmadığını denetler.
 */
    private validateMapping(
        platformId: string,
        requiredAttributes: any[],
        categoryMap: Map<string, any[]>,
        attributeMap: Map<string, any[]>
    ): { isValid: boolean; missingAttributes: any[]; localCategoryId?: string } {

        const matchedLocalCategories = categoryMap.get(platformId) || [];

        // --- 1. KATEGORİ EŞLEŞMESİ HİÇ YOKSA ---
        if (matchedLocalCategories.length === 0) {
            // Kategori yoksa, altındaki TÜM zorunlu nitelikleri "missing" olarak dönüyoruz
            const allRequiredAsMissing = requiredAttributes.map(attr => ({
                category: platformId,
                localCategoryId: null, // Henüz eşleşmediği için null
                attributeId: String(attr.attributeId),
                attributeName: String(attr.attributeName),
                attributeValue: String(attr.attributeValue),
                attributeValueId: attr.attributeValueId || null,
                varianter: attr.varianter,
                slicer: attr.slicer,
                allowCustom: attr.allowCustom,
                required: attr.required,
                multiple: attr.multiple
            }));

            return {
                isValid: false,
                missingAttributes: allRequiredAsMissing,
                localCategoryId: undefined
            };
        }

        let lastFailedMissings: any[] = [];
        let lastFailedLocalId: string | undefined;
        let successfulLocalId: string | undefined;

        // --- 2. KATEGORİ VARSA (NORMAL AKIŞ) ---
        const hasValidPath = matchedLocalCategories.some((cMap) => {
            const currentCategoryMissings: any[] = [];
            const currentLocalId = String(cMap.localCategoryId);

            const isOk = requiredAttributes.every((attr) => {
                const attrKey = `${platformId}_${attr.attributeId}`;
                // [WP9] Yalnız BU yerel kategoriye ait özellik eşlemeleri sayılır: eskiden aynı platform kategorisine bağlı BAŞKA bir yerel
                // kategorinin eşlemesi bu yolu "geçerli" gösteriyordu, ürün çevirisi (yerel kategori süzmeli) ise seçenek üretemiyordu.
                const matchedAttrs = (attributeMap.get(attrKey) || []).filter((a: any) => String(a.localCategoryId) === currentLocalId);

                const hasValue = matchedAttrs.some((aMap) => {
                    return aMap.values?.some((v: any) => {
                        const pValueId = String(v.platformValueId || "").toLocaleUpperCase('tr');
                        const aValueId = String(attr.attributeValueId || "").toLocaleUpperCase('tr');
                        const pValueName = String(v.platformValueName || "").toLocaleUpperCase('tr');
                        const aValueName = String(attr.attributeValue || "").toLocaleUpperCase('tr');

                        return (v.platformValueId && attr.attributeValueId && pValueId === aValueId) ||
                            (v.platformValueName && attr.attributeValue && pValueName === aValueName);
                    });
                });

                if (!hasValue) {
                    currentCategoryMissings.push({
                        category: platformId,
                        localCategoryId: currentLocalId,
                        attributeId: String(attr.attributeId),
                        attributeName: String(attr.attributeName),
                        attributeValue: String(attr.attributeValue),
                        attributeValueId: attr.attributeValueId || null,
                        varianter: attr.varianter,
                        slicer: attr.slicer,
                        allowCustom: attr.allowCustom,
                        required: attr.required,
                        multiple: attr.multiple
                    });
                }
                return hasValue;
            });

            if (isOk) {
                successfulLocalId = currentLocalId;
            } else {
                lastFailedMissings = currentCategoryMissings;
                lastFailedLocalId = currentLocalId;
            }

            return isOk;
        });

        return {
            isValid: hasValidPath,
            missingAttributes: hasValidPath ? [] : lastFailedMissings,
            localCategoryId: hasValidPath ? successfulLocalId : lastFailedLocalId
        };
    }

    public async start() {
        log.debug('STAGER_RUNONCE_MODUNDA_CALISMAYA_HAZIR', 'runOnce modunda çalışmaya hazır.');
    }
}