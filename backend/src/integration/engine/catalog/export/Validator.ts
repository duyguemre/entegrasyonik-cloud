import IntegrationFactory from '../../../modules/IntegrationFactory';
import { BaseWorker } from '../../BaseWorker';
import _ from 'lodash';
import os from 'os';
import { PLATFORM_PROCESS } from '@interfaces/index';
import { IIntegrationEngineProvider } from "../provider/IIntegrationEngineProvider";
import { AttributeResolver } from '@integration/catalog/attributeResolver';
import { getSetting } from '@integration/config/ConfigResolver';
import { eventLog } from '@platform/core/logger';
import { IntegrationIssue, IssueError, hasBlockingIssue, issuesToMessage, makeIssue } from '@platform/core/errors/integrationIssues';
import { issuesFromError, mapPlatformMessage } from '@integration/modules/common/errors/errorMap';
import { errorRulesFor } from '@integration/modules/common/errors/registry';
import { checkChannelReadiness } from '@integration/catalog/preflight/readiness';
import { effectiveChannelPrice, effectiveListPrice } from '@platform/core/pricing/effectivePrice';

const log = eventLog('worker', 'Validator');

export default class Validator extends BaseWorker {
    protected readonly workerName = 'Catalog Validator';
    // [ADR-0020 Aşama A] JSON'dan (`export.config.json`) doğrudan okuma yerine tek çözümleyici; DEĞER AYNI (50
    // — ölü `||` yedek 100 artık hiçbir yerde YOK, bkz. ADR K10 ve katalogdaki `knownDriftNote`).
    private readonly internalChunkSize = getSetting<number>('export.validator.chunkSize');
    private integrationCode!: string;
    private clientId!: string;
    private attrResolver?: AttributeResolver;

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

        log.info('VALIDATOR_STARTED_BATCH', `Validator started for Batch: ${batchId} on ${podName}`);

        const productCache: Map<string, any> = new Map();
        // [WP12] Özellik çözümleyici: paket başına tek örnek (kategori bazlı eşleme bellekte paylaşılır).
        this.attrResolver = typeof this.engineProvider.getPlatformMappingProvider === 'function'
            ? new AttributeResolver(this.engineProvider.getPlatformMappingProvider(clientId, integrationCode), integrationCode)
            : undefined;

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

            log.debug('VALIDATOR_FOUND_ENTRIES_MATCHKEY', `Found ${allEntries.length} entries. MatchKey: ${matchKey}`);

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
            log.info('VALIDATOR_FINISHED_BATCH_TOTAL', `Validator finished Batch: ${batchId}. Total Validated: ${processedCount}`);

        } catch (error: any) {
            log.error('VALIDATOR_VALIDATION_CRITICAL_ERROR_BATCH', `Validation Critical Error for Batch ${batchId}:`, { err: error });
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

        const errorRules = errorRulesFor(this.integrationCode);

        for (const entry of entries) {
            const now = new Date();
            const matchValue = entry[matchKey];
            // [eslesme-fiyat WP1] issue bağlamı; varyant/ürün bulundukça zenginleşir.
            const issueCtx: { integrationCode: string; barcode: unknown; variantId?: unknown; productId?: unknown } = { integrationCode: this.integrationCode, barcode: matchValue };
            try {
                // Varyantı ana koleksiyondan gelen map'ten alıyoruz
                const variant = variantMap[matchValue];
                if (!variant) {
                    log.error('VALIDATOR_VARIANT_NOT_FOUND', `Variant not found for matchValue: ${matchValue} (MatchKey: ${matchKey}). Entry:`, { detail: JSON.stringify(entry) });
                    throw new IssueError(`${matchValue} değerine sahip varyant ana tabloda bulunamadı.`, [makeIssue('VARIANT_NOT_FOUND', issueCtx)]);
                }
                issueCtx.variantId = variant._id;
                issueCtx.productId = variant.productId;

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
                if (!product) throw new IssueError("Ürünün ana kaydı bulunamadı.", [makeIssue('PRODUCT_NOT_FOUND', issueCtx)]);

                // Varyant objesini validasyon ve gönderim için zenginleştiriyoruz
                variant.product = product;

                // --- Lokal Validasyon ---
                // [eslesme-fiyat WP1, D-VAL-1/2] Tek kaynak hazırlık denetimi (preflightExport ile AYNI fonksiyon). Eski iki kural
                // (kategori/marka) aynı sırada ve aynı metinle ilk sıradadır; hata düzeyindeki sorun gönderimi durdurur.
                const readiness = checkChannelReadiness({ variant, product, integrationCode: this.integrationCode, mode: entry.mode });
                const blocking = readiness.filter((i) => i.severity === 'error');
                if (blocking.length) throw new IssueError(issuesToMessage(blocking), readiness);
                const warnings: IntegrationIssue[] = readiness.filter((i) => i.severity !== 'error');

                // [WP12, ADR-0025] Yerel seçeneklerden platform özelliklerini TEK noktada çöz (dolu olanlara dokunmaz).
                // Çözümleyici hatası yayını durdurmaz (eski davranış); zorunlu özellik eksikse dönüştürücü VALIDATION verir.
                if (this.attrResolver) {
                    try {
                        const r = await this.attrResolver.resolveInto(variant, product.category);
                        if (r.warnings.length) {
                            log.warn('VALIDATOR_OZELLIK_UYARISI', `${matchValue} özellik uyarısı: ${r.warnings.join('; ')}`);
                            for (const w of r.warnings) warnings.push(makeIssue('MAP_ATTR_WARNING', { ...issueCtx, field: 'attributes', params: { detail: w } }));
                        }
                    } catch (resErr: any) {
                        log.warn('VALIDATOR_OZELLIK_COZUMLENEMEDI', `${matchValue} özellik çözümlenemedi: ${resErr?.message}`);
                    }
                }

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
                            // [eslesme-fiyat WP5] tek kaynak: kanal özel fiyatı (bayrak) → kanal kuralı → ana fiyat; liste fiyatı ayrı alan.
                            price: effectiveChannelPrice(variant, this.integrationCode).salePrice ?? undefined,
                            listPrice: effectiveListPrice(effectiveChannelPrice(variant, this.integrationCode)) ?? undefined,
                            stock: variant.stock,
                            image: variant.images?.[0] || product.images?.[0],
                            category: variant.product.category,
                            brand: variant.product.brand,
                            choices: variant.choices,
                            stockcode: variant.stockcode,
                            message: "Doğrulama başarılı, yayınlanma sırasına alındı.",
                            issues: warnings,
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
                            { updatedAt: now, matchKey: matchKey, issues: warnings }
                        )
                    );
                } else {
                    const reason = validation.reason || "Platform kurallarına uymuyor.";
                    throw new IssueError(reason, [mapPlatformMessage(reason, issueCtx, errorRules), ...warnings]);
                }

            } catch (entryErr: any) {
                const cleanError = this.formatUserMessage(entryErr.message);
                const issues = issuesFromError(entryErr, issueCtx, errorRules);
                if (!hasBlockingIssue(issues)) issues.unshift(makeIssue('PLATFORM_REJECTED', { ...issueCtx, platformMessage: cleanError }));

                stagingBulkOps.push(
                    this.engineProvider.prepareStagingUpdateOp(entry._id, this.workerName, 'FAILED', {
                        priorityScore: 0,
                        errorMessage: cleanError,
                        errorType: "VALIDATION_ERROR",
                        issues,
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
                        { messages: [cleanError], updatedAt: now, matchKey: matchKey, issues }
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