import { DatabaseManagerInstance } from "@database/DatabaseManager";
import { RedisService } from "@services/redis/RedisService";
import IntegrationFactory from "@integration/modules/IntegrationFactory";
import { EVENTS, integrationEventBus } from "@integration/engine/IntegrationEventBus";
import { PLATFORM_PROCESS } from "@interfaces/index";
import { StockAllocator } from "./StockAllocator";

/**
 * ADR-0004 — Zero-oversell (Karar 5-6, Aşama C): kanal yayını/debounce köprüsü.
 * bkz. docs/adr/0004-zero-oversell-rezervasyon-modeli.md
 *
 * `StockAllocator` (Aşama A/B, DEĞİŞTİRİLMEDİ) her stok etkileyen geçişte `Variant.stockDirty=true` yapar.
 * Bu sınıf o bayrağı OKUR ve mevcut export hattına (Dispatcher -> Validator -> Publisher -> Sentinel, HİÇBİRİ
 * bu dosyada yeniden yazılmadı) `internalProcessBatch` (integration-service.ts, kullanıcı tetiklemeli toplu
 * işlem) ile AYNI desende sistem-tetiklemeli `UPDATE_STOCK` staged kayıtları ekler: `ExportStagedProduct`
 * upsert + `ExportFlag.queuedCount` `$inc` + `PROCESS_NEXT_SIGNAL` olayı. Dispatcher/Validator/Publisher'ın
 * KENDİ akışı hiç değişmedi -- yalnızca BAĞLANILDI.
 *
 * Debounce (ADR: "tenant×kanal başına 30 sn"): `AllocationSweepScheduler` emsaliyle AYNI (düz `setInterval`,
 * bkz. `StockPublishScheduler`), 30 sn'lik bir turda TÜM `stockDirty=true` varyantlar taranır -- bu, "30 sn
 * içinde biriken değişiklikleri TEK turda topla" gereksinimini karşılar (yeni bir zamanlayıcı türü icat
 * edilmedi). Stok 0'a düşen SKU'lar aynı tur içinde en yüksek `priorityScore` ile (Dispatcher'ın MEVCUT
 * `sort({priorityScore:-1, createdAt:1})` seçimini kullanarak) öncelik kazanır; 30 sn'nin TAMAMEN dışında
 * (ör. ayrı, daha sık bir "acil" turu) bir mekanizma İCAT EDİLMEDİ -- bu, `StockAllocator`/`PostOrderOperations`
 * (Aşama A/B, dokunma yasaklı) sürücüsüne bir "stok sıfıra düştü" olay kancası eklemeyi gerektirirdi; bu
 * BİLİNÇLİ bir sınırlamadır ve raporda bulgu olarak not edilmiştir.
 *
 * "Aynı gövde 15 dk" (Trendyol) koruması: PREVENTİF olarak, bir varyant×kanal için HENÜZ Sentinel tarafından
 * sonuçlandırılmamış (PREPARING/PENDING/SENT/WAITING) aktif bir UPDATE_STOCK kaydı varsa bu tur o SKU'yu
 * ATLAR (yeni bir kayıt oluşturmaz) -- Trendyol'un gerçek hata sözleşmesi (HTTP kod/mesaj) kod tabanında
 * hiçbir yerde doğrulanmadığından (yalnızca araştırma notunda var) spekülatif bir hata-sınıflandırması
 * YAZILMADI; bu koruma, "kısa sürede aynı gövdeyi tekrar gönderme" senaryosunun büyük kısmını zaten önler
 * (bkz. görev raporu, BACKLOG bulgusu).
 */
export class StockPublishTrigger {
    /** Trendyol için ADR'de açıkça belirtilen kanal üst sınırı; diğerleri için ADR'de değer YOK (BİLİNMİYOR). */
    private static readonly CHANNEL_MAX: Record<string, number> = {
        trendyol: 20000,
    };

    /** Bir turda taranacak en fazla dirty varyant (aşırı büyük tenant'ta tek turu sınırlamak için). */
    private static readonly SCAN_LIMIT = 2000;

    /** Halihazırda pipeline'da (Dispatcher/Validator/Publisher/Sentinel) sonuçlanmamış sayılan statüler. */
    private static readonly ACTIVE_STAGE_STATUSES = ['QUEUED', 'PREPARING', 'PENDING', 'SENT', 'WAITING'];

    public static clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(value, max));
    }

    /**
     * ADR Karar 5-6: `publish = clamp(available - max(bufferUnits, floor(available*bufferPercent/100)), 0, kanalMax)`.
     * Saf/testable fonksiyon: politika okuma bu sınıfın `run()` metodunda, hesap burada.
     */
    public static computePublishQuantity(
        available: number,
        opts: { isPrimary: boolean; bufferUnits?: number; bufferPercent?: number; channelMax?: number },
    ): number {
        const bufferUnits = opts.isPrimary ? 0 : (opts.bufferUnits ?? 1);
        const bufferPercent = opts.bufferPercent ?? 0;
        const buffer = Math.max(bufferUnits, Math.floor(available * bufferPercent / 100));
        const channelMax = opts.channelMax ?? Number.POSITIVE_INFINITY;
        return StockPublishTrigger.clamp(available - buffer, 0, channelMax);
    }

    public async run(): Promise<{ skipped: boolean; scannedClients: number; staged: number }> {
        // [ADR-0005 Karar 2 ile AYNI dayanıklılık kapısı, bkz. AllocationSweepJob] tek bir aç/kapa sözleşmesi.
        if (!RedisService.isReady()) {
            console.warn('[StockPublishTrigger] Redis bağlı değil (isReady()=false); bu tur ATLANIYOR.');
            return { skipped: true, scannedClients: 0, staged: 0 };
        }

        let scannedClients = 0;
        let staged = 0;

        try {
            const applicationDB = await DatabaseManagerInstance.getApplicationDB();
            const clientModel = applicationDB.getClientModel();
            const activeClients = await clientModel.find({ status: 'ACTIVE' }).lean();

            for (const client of activeClients || []) {
                scannedClients++;
                const clientOrder = Number((client as any).order);
                try {
                    staged += await this.runForClient(applicationDB, clientOrder);
                } catch (error) {
                    console.error(`[StockPublishTrigger] Client hata (order=${clientOrder}):`, error);
                }
            }
        } catch (error) {
            console.error('[StockPublishTrigger] Tur genel hata:', error);
        }

        return { skipped: false, scannedClients, staged };
    }

    private async runForClient(applicationDB: any, clientOrder: number): Promise<number> {
        const clientDB = await DatabaseManagerInstance.getClientDB(clientOrder);
        if (!clientDB) return 0;

        const integrationDoc: any = await clientDB.getClientIntegrationModel().findOne().lean();
        const marketplaces: any[] = (integrationDoc?.marketplace || []).filter((m: any) => m.status !== false);
        if (marketplaces.length === 0) return 0;

        const primaryChannel = this.resolvePrimaryChannel(integrationDoc, marketplaces);

        const dirtyVariants: any[] = await clientDB.getVariantModel()
            .find({ stockDirty: true })
            .limit(StockPublishTrigger.SCAN_LIMIT)
            .lean();
        if (!dirtyVariants || dirtyVariants.length === 0) return 0;

        const matchKeyCache: Record<string, string> = {};
        const factory = new IntegrationFactory(clientOrder);

        let stagedCount = 0;
        const clearedVariantIds: any[] = [];
        const perChannelCount: Record<string, number> = {};

        for (const variant of dirtyVariants) {
            const available = StockAllocator.available(variant as any);
            let touchedAnyChannel = false;

            for (const mp of marketplaces) {
                const code = mp.code;
                const platformInfo = (variant as any).platforms?.[code];
                // Var olan iş kuralıyla AYNI (`internalProcessBatch`): sadece TRANSFER tamamlanmış SKU'lar
                // diğer modlarda (burada UPDATE_STOCK) işlenir.
                if (platformInfo?.upload?.TRANSFER?.status !== 'COMPLETED') continue;
                touchedAnyChannel = true;

                if (!matchKeyCache[code]) {
                    const instance = await factory.getInstance(code);
                    matchKeyCache[code] = (instance.getMatchKey() || 'barcode').toLowerCase();
                }
                const matchKey = matchKeyCache[code];
                const matchValue = (variant as any)[matchKey];
                if (!matchValue) continue;

                const isPrimary = code === primaryChannel;
                const stockPolicy = mp.settings?.stockPolicy || {};
                const channelMax = StockPublishTrigger.CHANNEL_MAX[code];

                const publish = StockPublishTrigger.computePublishQuantity(available, {
                    isPrimary,
                    bufferUnits: stockPolicy.bufferUnits,
                    bufferPercent: stockPolicy.bufferPercent,
                    channelMax,
                });

                const lastPublishedQty = platformInfo?.stockSync?.lastPublishedQty;
                if (publish === lastPublishedQty) continue; // ADR: yalnızca değişen SKU gönderilir.

                const activeInFlightCount = await clientDB.getExportStagedProductModel().countDocuments({
                    integrationCode: code,
                    mode: PLATFORM_PROCESS.UPDATE_STOCK,
                    [matchKey]: matchValue,
                    status: { $in: StockPublishTrigger.ACTIVE_STAGE_STATUSES },
                });
                if (activeInFlightCount > 0) continue; // "aynı gövde 15dk" senaryosunu önleyen preventif atlama.

                await this.upsertStagedRecord(clientDB, {
                    matchKey, matchValue, code, variant, publish,
                });
                perChannelCount[code] = (perChannelCount[code] || 0) + 1;
                stagedCount++;
            }

            if (touchedAnyChannel) clearedVariantIds.push((variant as any)._id);
        }

        if (clearedVariantIds.length > 0) {
            await clientDB.getVariantModel().updateMany(
                { _id: { $in: clearedVariantIds } },
                { $set: { stockDirty: false } },
            );
        }

        for (const [code, count] of Object.entries(perChannelCount)) {
            await applicationDB.getExportFlagModel().updateOne(
                { clientId: clientOrder, integrationCode: code },
                { $inc: { queuedCount: count }, $set: { lastUpdatedAt: new Date() } },
                { upsert: true },
            );
        }
        if (stagedCount > 0) integrationEventBus.emit(EVENTS.PROCESS_NEXT_SIGNAL);

        return stagedCount;
    }

    /** ADR Karar 5: tenant `stockPolicy.primaryChannel` varsa o; yoksa `order` alanına göre ilk bağlanan (en küçük `order`). */
    private resolvePrimaryChannel(integrationDoc: any, marketplaces: any[]): string | undefined {
        const configured = integrationDoc?.stockPolicy?.primaryChannel;
        if (configured) return configured;
        const sorted = [...marketplaces].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
        return sorted[0]?.code;
    }

    private async upsertStagedRecord(
        clientDB: any,
        opts: { matchKey: string; matchValue: any; code: string; variant: any; publish: number },
    ): Promise<void> {
        const { matchKey, matchValue, code, variant, publish } = opts;
        const now = new Date();
        // Sıfıra düşen SKU'lar Dispatcher'ın MEVCUT `sort({priorityScore:-1, createdAt:1})` seçimiyle
        // öncelik kazanır (yeni bir sıralama kuralı İCAT EDİLMEDİ, sadece skor yükseltildi).
        const priorityScore = publish === 0 ? 500 : 120;

        await clientDB.getExportStagedProductModel().updateOne(
            { [matchKey]: matchValue, mode: PLATFORM_PROCESS.UPDATE_STOCK, integrationCode: code, status: { $in: ['QUEUED', 'PREPARING'] } },
            {
                $set: {
                    productId: variant.productId,
                    payload: { barcode: variant.barcode, stockcode: variant.stockcode, productId: variant.productId },
                    status: 'QUEUED',
                    priorityScore,
                    targetPublishQty: publish,
                    nextRunAt: now,
                    updatedAt: now,
                    barcode: variant.barcode,
                    stockcode: variant.stockcode,
                },
                $setOnInsert: {
                    createdAt: now,
                    requestId: `stock-publish-${now.getTime()}`,
                    batchId: null,
                    logs: [{ status: 'QUEUED', worker: 'StockPublishTrigger', message: 'Sistem tetiklemeli stok yayını sıraya alındı.', timestamp: now }],
                },
            },
            { upsert: true },
        );
    }
}
