import IntegrationFactory from '../../../modules/IntegrationFactory';
import { BaseWorker } from '../../BaseWorker';
import _ from 'lodash';
import os from 'os';
import { PLATFORM_PROCESS } from '@interfaces/index';
import { IIntegrationEngineProvider } from "../provider/IIntegrationEngineProvider";
import { getSetting } from '@integration/config/ConfigResolver';

export default class Validator extends BaseWorker {
    protected readonly workerName = 'Catalog Validator';
    // [ADR-0020 Aşama A] JSON'dan (`export.config.json`) doğrudan okuma yerine tek çözümleyici; DEĞER AYNI (50
    // — ölü `||` yedek 100 artık hiçbir yerde YOK, bkz. ADR K10 ve katalogdaki `knownDriftNote`).
    private readonly internalChunkSize = getSetting<number>('export.validator.chunkSize');
    private integrationCode!: string;
    private clientId!: string;

    constructor(private engineProvider: IIntegrationEngineProvider) {
        super();
    }

    private formatUserMessage(errorMessage: string): string {
        if (!errorMessage) return 'Doğrulama hatası.';
        return errorMessage.replace(/^(\[.*?\]\s*)+/, '');
    }

    public async runOnce(clientId: string, integrationCode: string, mode: PLATFORM_PROCESS, batchId: string) {
        this.integrationCode = integrationCode;
        this.clientId = clientId;

        const podName = process.env.POD_NAME || os.hostname();
        const factory = new IntegrationFactory(Number(clientId));
        await factory.getInstance(this.integrationCode);

        const clientLogPrefix = this.getLogPrefix(clientId, this.integrationCode);
        console.log(`${clientLogPrefix} Validator started for Batch: ${batchId} on ${podName}`);

        const productCache: Map<string, any> = new Map();

        try {
            const instance = await factory.getInstance(this.integrationCode);
            const matchKey = (instance.getMatchKey() || 'barcode').toLowerCase();

            // 1. ADIM: Sadece bu paketteki işlenmeyi bekleyen girişleri al
            // [ADR-0004 Karar 6, Aşama C] `targetPublishQty` de seçime eklendi (bkz. processValidationBatch);
            // yalnızca sistem-tetiklemeli UPDATE_STOCK kayıtlarında dolu olur, diğer TÜM modlarda davranış AYNI kalır.
            const allEntries = await this.engineProvider.getExportStagedProductModel()
                .find({ batchId: batchId, status: 'PREPARING' })
                .select(`_id ${matchKey} mode targetPublishQty`)
                .lean();

            console.log(`[${this.clientId}][Validator] Found ${allEntries.length} entries. MatchKey: ${matchKey}`);

            if (!allEntries || allEntries.length === 0) {
                await this.updateSignalStatus(batchId, 'PENDING');
                return;
            }

            const chunks = _.chunk(allEntries, this.internalChunkSize);
            let processedCount = 0;

            for (const chunk of chunks) {
                const entryIds = chunk.map((c: any) => c._id);
                const matchValues = chunk.map((c: any) => c[matchKey]);

                // 2. ADIM: Varyantların EN GÜNCEL halini ana VariantModel'den çekiyoruz
                const freshVariants = await this.engineProvider.getVariantModel()
                    .find({ [matchKey]: { $in: matchValues } })
                    .lean();

                const variantMap = _.keyBy(freshVariants, matchKey);

                // 3. ADIM: Kayıtları doğrula ve payload'ı tazeleyerek kaydet
                await this.processValidationBatch(entryIds, variantMap, productCache);

                processedCount += chunk.length;
                if (productCache.size > 200) productCache.clear();
            }

            await this.updateSignalStatus(batchId, 'PENDING');
            console.log(`${clientLogPrefix} Validator finished Batch: ${batchId}. Total Validated: ${processedCount}`);

        } catch (error: any) {
            console.error(`${clientLogPrefix} Validation Critical Error for Batch ${batchId}:`, error.message);
            await this.updateSignalStatus(batchId, 'FAILED', error.message);
            throw error;
        }
    }

    private async processValidationBatch(entryIds: any[], variantMap: Record<string, any>, productCache: Map<string, any>) {
        const variantBulkOps: any[] = [];
        const stagingBulkOps: any[] = [];

        const factory = new IntegrationFactory(Number(this.clientId));
        const instance = await factory.getInstance(this.integrationCode);
        const matchKey = (instance.getMatchKey() || 'barcode').toLowerCase();

        // Mevcut staging kayıtlarını bul (Sadece gerekli olanları)
        // [ADR-0004 Karar 6, Aşama C] `targetPublishQty` de seçime eklendi (bkz. aşağıdaki override).
        const entries = await this.engineProvider.getExportStagedProductModel()
            .find({ _id: { $in: entryIds } })
            .select(`_id ${matchKey} mode targetPublishQty`)
            .lean();

        for (const entry of entries) {
            const now = new Date();
            const matchValue = entry[matchKey];
            try {
                // Varyantı ana koleksiyondan gelen map'ten alıyoruz
                const variant = variantMap[matchValue];
                if (!variant) {
                    console.error(`[${this.clientId}][Validator] Variant not found for matchValue: ${matchValue} (MatchKey: ${matchKey}). Entry:`, JSON.stringify(entry));
                    throw new Error(`${matchValue} değerine sahip varyant ana tabloda bulunamadı.`);
                }

                // [ADR-0004 Karar 6, Aşama C] `StockPublishTrigger`'ın önceden hesapladığı yayın adedi
                // (available - tampon, kanal sınırına clamp'lenmiş) varsa MUTLAK `variant.stock` yerine bu
                // değer kullanılır -- yalnızca sistem-tetiklemeli UPDATE_STOCK kayıtlarında (`targetPublishQty`
                // sayısal) dolu olur; diğer TÜM modlar/kullanıcı-tetiklemeli UPDATE_STOCK'ta (`targetPublishQty`
                // null/undefined) davranış BİREBİR ÖNCEKİYLE AYNI kalır (mutlak stok). `variant` mutasyona
                // uğratılır çünkü aşağıda `payload: variant` olarak AYNI referans saklanır (Trendyol/Pazarama
                // transformer'ları `payload.stock`'u okur, bkz. görev raporu).
                if (entry.mode === 'UPDATE_STOCK' && typeof entry.targetPublishQty === 'number') {
                    variant.stock = entry.targetPublishQty;
                }

                const prodId = variant.productId?.toString();
                if (!prodId) throw new Error("Varyantın productId bilgisi eksik.");

                // Ürün Cache Yönetimi
                let product = productCache.get(prodId);
                if (!product) {
                    product = await this.engineProvider.getProductModel().findById(prodId).lean();
                    if (product) productCache.set(prodId, product);
                }
                if (!product) throw new Error("Ürünün ana kaydı bulunamadı.");

                // Varyant objesini validasyon ve gönderim için zenginleştiriyoruz
                variant.product = product;

                // --- Lokal Validasyon ---
                if (!variant.product.category) throw new Error("Ürünün kategorisi bulunamadı.");
                if (!variant.product.brand) throw new Error("Ürünün markası bulunamadı.");

                // Platforma Özel (Trendyol, HB vb.) Validasyon
                const validation = await instance.validate(variant);

                if (validation.result) {
                    const nextStatus = 'PENDING';
                    const nextScore = this.calculatePriorityScore(entry.mode, nextStatus);

                    // Staging Kaydı Güncelleme (Payload burada VariantModel'den gelen taze veriyle güncellenir)
                    stagingBulkOps.push(
                        this.engineProvider.prepareStagingUpdateOp(entry._id, this.workerName, nextStatus, {
                            priorityScore: nextScore,
                            payload: variant, // TAZE PAYLOAD
                            title: variant.title || product.title,
                            price: variant.platforms?.[this.integrationCode]?.prices?.salePrice || variant.prices?.salePrice,
                            stock: variant.stock,
                            image: variant.images?.[0] || product.images?.[0],
                            category: variant.product.category,
                            brand: variant.product.brand,
                            choices: variant.choices,
                            stockcode: variant.stockcode,
                            message: "Doğrulama başarılı, yayınlanma sırasına alındı.",
                            updatedAt: now
                        })
                    );

                    variantBulkOps.push(
                        this.engineProvider.prepareVariantPlatformUpdateOp(
                            matchValue,
                            undefined,
                            this.integrationCode,
                            entry.mode,
                            nextStatus,
                            { updatedAt: now, matchKey: matchKey }
                        )
                    );
                } else {
                    throw new Error(validation.reason || "Platform kurallarına uymuyor.");
                }

            } catch (entryErr: any) {
                const cleanError = this.formatUserMessage(entryErr.message);

                stagingBulkOps.push(
                    this.engineProvider.prepareStagingUpdateOp(entry._id, this.workerName, 'FAILED', {
                        priorityScore: 0,
                        errorMessage: cleanError,
                        errorType: "VALIDATION_ERROR",
                        updatedAt: now
                    })
                );

                variantBulkOps.push(
                    this.engineProvider.prepareVariantPlatformUpdateOp(
                        matchValue,
                        undefined,
                        this.integrationCode,
                        entry.mode,
                        'FAILED',
                        { messages: [cleanError], updatedAt: now, matchKey: matchKey }
                    )
                );
            }
        }

        if (stagingBulkOps.length > 0) {
            await this.engineProvider.getExportStagedProductModel().bulkWrite(stagingBulkOps);
        }
        if (variantBulkOps.length > 0) {
            await this.engineProvider.getVariantModel().bulkWrite(variantBulkOps);
            await this.engineProvider.markStatsAsDirty();
        }
    }

    private async updateSignalStatus(batchId: string, status: string, error?: string) {
        await this.engineProvider.getExportSignalModel().updateOne(
            { batchId },
            {
                $set: {
                    status,
                    errorMessage: error || null,
                    lockedBy: null,
                    updatedAt: new Date()
                }
            }
        );
    }
}