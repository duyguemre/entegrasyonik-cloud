import { ObjectId } from 'mongodb';
import IntegrationFactory from '../../../modules/IntegrationFactory';
import { BaseWorker } from '../../BaseWorker';
import config from './import.config.json';
import _ from 'lodash';
import { IIntegrationEngineProvider } from '../provider/IIntegrationEngineProvider';
import { getSetting } from '@integration/config/ConfigResolver';
import { eventLog } from '@platform/core/logger';

const log = eventLog('worker', 'Importer');

export default class Importer extends BaseWorker {
    protected readonly workerName = 'Catalog Importer';

    // [ADR-0020 Aşama A] JSON'dan (`import.config.json`) doğrudan okuma yerine tek çözümleyici; DEĞERLER AYNI
    // (fetchLimit 50, retryDelay 3000 — ölü `||` yedekleri (100/2000) artık hiçbir yerde YOK, bkz. ADR K10 ve
    // katalogdaki `knownDriftNote`). `retryCount` drift'siz olduğu için JSON okuması değişmedi.
    private readonly fetchLimit = getSetting<number>('import.importer.fetchLimit');
    private readonly retryCount = config.importer.retryCount || 3;
    private readonly retryDelay = getSetting<number>('import.importer.retryDelay');
    private readonly operationTimeout = 60000;

    constructor(private engineProvider: IIntegrationEngineProvider) {
        super();
    }

    public async runOnce(jobIdStr: string) {
        // İş merkezi ApplicationDB üzerinden kontrol edilir
        const job = await this.engineProvider.getImportJobModel().findById(jobIdStr).lean();
        if (!job || job.status !== 'READY_TO_SYNC') return;

        const { clientId, integrationCode } = job;
        const matchKey = job.matchKey || 'barcode';

        let totalProcessed = job.processedCount || 0;
        let totalFailed = job.failedCount || 0;
        let totalDuplicates = job.duplicateCount || 0;

        let lastProcessedId: string | null = null;

        try {
            const factory = new IntegrationFactory(clientId);
            const instance = await factory.getInstance(integrationCode);

            // Yeni Yapı: Staged Summary verileri artık ClientDB'den çekiliyor
            const stagedSummaries = await this.engineProvider.getImportStagedProductSummaryModel().find({ jobId: job._id }).lean();
            const summaryMap = new Map(stagedSummaries.map((s: any) => [s.maincode, s]));

            const globalProductCache = new Map<string, string>();

            // Status Güncelleme: ApplicationDB
            await this.engineProvider.getImportJobModel().updateOne(
                { _id: job._id },
                { $set: { status: 'PROCESSING', updatedAt: new Date() } }
            );

            let hasMore = true;
            while (hasMore) {
                const rawItems = await this.fetchWithRetry(async () => {
                    const query: any = { jobId: job._id, importStatus: 'VALID' };
                    if (lastProcessedId) query._id = { $gt: new ObjectId(lastProcessedId) };

                    // Yeni Yapı: Staged Product'lar artık ClientDB'den okunuyor
                    return await this.engineProvider.getImportStagedProductModel()
                        .find(query)
                        .sort({ _id: 1 })
                        .limit(this.fetchLimit)
                        .lean();
                });

                if (!rawItems?.length) { hasMore = false; break; }

                const chunkBarcodes = rawItems.map((item: any) => item[matchKey] || item.rawData[matchKey]);
                const existingByBarcode = await this.engineProvider.getVariantModel()
                    .find({ [matchKey]: { $in: chunkBarcodes } })
                    .select(`${matchKey} variantHash`)
                    .lean();

                const barcodeSet = new Set(existingByBarcode.map((v: any) => v[matchKey]));
                const hashSetByDB = new Set(existingByBarcode.map((v: any) => v.variantHash));

                const stagingMap = new Map<string, any>();
                const variantInsertOps: any[] = [];
                const productUpdateOps: Map<string, any> = new Map();
                const currentChunkProductIds = new Set<string>();

                const processedResults = await Promise.all(rawItems.map(async (item: any) => {
                    try {
                        const barcode = item[matchKey] || item.rawData[matchKey];
                        if (barcodeSet.has(barcode)) return { id: item._id, status: 'SKIP', reason: 'Barkod mevcut' };

                        const internalData = await this.withTimeout(instance.convertToInternalModel(item), `Convert ${item._id}`);
                        const mCode = internalData.product.maincode;
                        const vHash = this.hashChoices(mCode, internalData.variant.choices);

                        if (hashSetByDB.has(vHash)) return { id: item._id, status: 'SKIP', reason: 'Mükerrer Kayıt (Varyant Mevcut)' };

                        return { id: item._id, status: 'SUCCESS', data: internalData, barcode, hash: vHash };
                    } catch (e: any) {
                        return { id: item._id, status: 'FAIL', reason: e.message };
                    }
                }));

                for (const result of processedResults) {
                    lastProcessedId = result.id.toString();

                    if (result.status === 'SKIP') {
                        totalDuplicates++;
                        stagingMap.set(result.id.toString(), {
                            importStatus: 'COMPLETED',
                            skipReason: result.reason,
                            updatedAt: new Date()
                        });
                        continue;
                    }

                    if (result.status === 'FAIL') {
                        totalFailed++;
                        stagingMap.set(result.id.toString(), {
                            importStatus: 'FAILED',
                            skipReason: `Sistem Hatası: ${result.reason}`,
                            updatedAt: new Date()
                        });
                        continue;
                    }

                    const { data, barcode } = result;
                    const mCode = data.product.maincode;
                    const summary: any = summaryMap.get(mCode);

                    if (!productUpdateOps.has(mCode)) {
                        productUpdateOps.set(mCode, {
                            updateOne: {
                                filter: { maincode: mCode },
                                update: {
                                    $min: { "prices.minSalePrice": summary?.minSalePrice ?? data.variant.salePrice },
                                    $max: { "prices.maxSalePrice": summary?.maxSalePrice ?? data.variant.salePrice },
                                    $addToSet: { images: { $each: (summary?.allImages || []).map((url: string) => ({ url })) } },
                                    $set: { updatedAt: new Date() },
                                    $setOnInsert: { title: data.product.title, description: data.variant.description, taxPercentage: data.variant.taxPercentage, brand: data.product.brand, category: data.product.category, hasVariant: data.product.hasVariant, stock: 0, createdAt: new Date() }
                                },
                                upsert: true
                            }
                        });
                    }

                    variantInsertOps.push({
                        ...data.variant,
                        [matchKey]: barcode,
                        maincode: mCode,
                        integrationCode,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        stagedId: result.id.toString()
                    });

                    stagingMap.set(result.id.toString(), {
                        importStatus: 'COMPLETED',
                        updatedAt: new Date()
                    });
                    totalProcessed++;
                }

                if (productUpdateOps.size > 0) {
                    await this.engineProvider.getProductModel().bulkWrite(Array.from(productUpdateOps.values()));

                    const relevantProducts = await this.engineProvider.getProductModel().find({
                        maincode: { $in: Array.from(productUpdateOps.keys()) }
                    }).select('_id maincode').lean();

                    relevantProducts.forEach((p: any) => {
                        globalProductCache.set(p.maincode, p._id.toString());
                        currentChunkProductIds.add(p._id.toString());
                    });
                }

                if (variantInsertOps.length > 0) {
                    const finalVariants = variantInsertOps.map(v => {
                        const { stagedId, ...pureVariantData } = v;
                        return {
                            ...pureVariantData,
                            productId: new ObjectId(globalProductCache.get(v.maincode))
                        };
                    });

                    try {
                        const inserted: any[] = await this.engineProvider.getVariantModel().insertMany(finalVariants, { ordered: false });
                        await this.recordImportPriceHistory(inserted);
                    } catch (err: any) {
                        const writeErrors = err.writeErrors || [];
                        writeErrors.forEach((e: any) => {
                            const originalVariant = variantInsertOps[e.index];
                            const sId = originalVariant.stagedId;

                            if (e.err.code === 11000) {
                                totalDuplicates++;
                                totalProcessed--;
                                const current = stagingMap.get(sId);
                                stagingMap.set(sId, { ...current, skipReason: 'Mükerrer Kayıt (Yarış Durumu)' });
                            } else {
                                totalFailed++;
                                totalProcessed--;
                                const errMsg = e?.err?.errmsg || e?.err?.message || `DB Hatası: ${e.code}`;
                                stagingMap.set(sId, {
                                    importStatus: 'FAILED',
                                    skipReason: `Yazma Hatası: ${errMsg}`,
                                    updatedAt: new Date()
                                });
                            }
                        });
                    }
                }

                if (currentChunkProductIds.size > 0) {
                    await this.syncProductStocks(Array.from(currentChunkProductIds));
                }

                // Yeni Yapı: Staging tablosunu ClientDB üzerinden toplu güncelle
                if (stagingMap.size > 0) {
                    const finalStagingOps = Array.from(stagingMap.entries()).map(([id, update]) => ({
                        updateOne: {
                            filter: { _id: new ObjectId(id) },
                            update: { $set: update }
                        }
                    }));
                    await this.engineProvider.getImportStagedProductModel().bulkWrite(finalStagingOps);
                }

                // Dashboard: ApplicationDB güncelleme
                await this.engineProvider.getImportJobModel().updateOne(
                    { _id: job._id },
                    { $set: { processedCount: totalProcessed, duplicateCount: totalDuplicates, failedCount: totalFailed, updatedAt: new Date() } }
                );

                if (rawItems.length < this.fetchLimit) hasMore = false;
            }

            await this.engineProvider.getImportJobModel().updateOne(
                { _id: job._id },
                { $set: { status: 'COMPLETED', completedAt: new Date() } }
            );

        } catch (error: any) {
            await this.engineProvider.getImportJobModel().updateOne(
                { _id: job._id },
                { $set: { status: 'FAILED', completedAt: new Date(), error: { message: error.message, updatedAt: new Date() } } }
            );
        }
    }

    private async withTimeout(promise: Promise<any>, opName: string): Promise<any> {
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`${opName} işlemi zaman aşımına uğradı (Timeout)`)), this.operationTimeout));
        return Promise.race([promise, timeout]);
    }

    private async syncProductStocks(productIds: string[]) {
        try {
            const uniqueProductIds = [...new Set(productIds)].map(id => new ObjectId(id));
            const stockTotals = await this.engineProvider.getVariantModel().aggregate([
                { $match: { productId: { $in: uniqueProductIds } } },
                { $group: { _id: '$productId', total: { $sum: '$stock' } } }
            ]);

            const productOps = stockTotals.map((item: any) => ({
                updateOne: {
                    filter: { _id: item._id },
                    update: { $set: { stock: item.total, updatedAt: new Date() } }
                }
            }));

            if (productOps.length > 0) await this.engineProvider.getProductModel().bulkWrite(productOps);
        } catch (err: any) {
            log.error('IMPORTER_STOK_SENKRONIZASYON_HATASI', "Stok senkronizasyon hatası:", { err });
        }
    }

    private async fetchWithRetry(fn: () => Promise<any>): Promise<any> {
        let retries = this.retryCount;
        while (retries >= 0) {
            try { return await fn(); }
            catch (error: any) {
                if (retries === 0) throw error;
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                retries--;
            }
        }
    }

    private hashChoices(maincode: string, choices: any[]): string {
        const crypto = require('crypto');
        const sortedChoices = [...(choices || [])].sort((a, b) => {
            const valA = a?.choiceId !== undefined ? String(a.choiceId) : "";
            const valB = b?.choiceId !== undefined ? String(b.choiceId) : "";
            return valA.localeCompare(valB);
        });
        const hashString = `${maincode}:${sortedChoices.map(c => `${c.choiceId}:${c.choiceValueId}`).join('|')}`;
        return crypto.createHash('md5').update(hashString).digest('hex');
    }

    public async start() { log.debug('IMPORTER_RUNONCE_MODUNDA_CALISMAYA_HAZIR', 'runOnce modunda çalışmaya hazır.'); }

    /**
     * [eslesme-fiyat WP5, PLAN §3.4, Ek B P1-4] İçe aktarılan YENİ varyantların kanal fiyatı geçmişe `source:'import'` ile yazılır
     * (K10 "son 30 gün en düşük" tabanı). Best-effort: hata içe aktarmayı bozmaz. Kısmi insertMany hatasında kayıt atlanır.
     */
    private async recordImportPriceHistory(inserted: any[]): Promise<void> {
        const model = this.engineProvider.getPriceHistoryModel?.();
        if (!model || !Array.isArray(inserted) || inserted.length === 0) return;
        const now = new Date();
        const docs: any[] = [];
        for (const v of inserted) {
            for (const [code, info] of Object.entries<any>(v?.platforms || {})) {
                const sale = Number(info?.observed?.salePrice ?? v?.prices?.salePrice);
                if (!Number.isFinite(sale) || sale <= 0) continue;
                const list = Number(info?.observed?.marketPrice ?? v?.prices?.marketPrice);
                docs.push({ integrationCode: code, variantId: v._id, barcode: v.barcode, at: now, salePrice: sale, listPrice: Number.isFinite(list) ? list : undefined, source: 'import' });
            }
        }
        if (docs.length === 0) return;
        try { await model.insertMany(docs, { ordered: false }); } catch (err: any) { console.error('[Importer] fiyat geçmişi yazılamadı:', err?.message); }
    }
}