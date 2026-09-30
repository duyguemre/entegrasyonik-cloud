import { DatabaseManagerInstance } from "@database/DatabaseManager";
import { RedisService } from "@services/redis/RedisService";
import { deriveAvailable } from "@interfaces/stock";
import { recordStockMovement } from "./stockMovements";

/**
 * ADR-0004 — Zero-oversell (Karar 8a, Aşama C): İÇ mutabakat, saatlik.
 * bkz. docs/adr/0004-zero-oversell-rezervasyon-modeli.md
 *
 * `Variant.reserved` alanı ile `allocations[]` dizisindeki RESERVED satırlarının qty toplamının TUTARLI
 * olduğunu kontrol eder. Fark varsa `stockVersion` guard'lı optimistic `$set` ile onarır (ADR: "yalnızca o
 * varyantta TAZE [<2dk] işlem yoksa düzeltme yapar" -- race'e girmemek için). `StockAllocator` (Aşama A/B,
 * DEĞİŞTİRİLMEDİ) her geçişte `allocations[].at` yazdığından, "en son ne zaman dokunuldu" bunun MAX'ından
 * türetilir (Variant şemasında ayrı bir `updatedAt` alanı YOK -- `strict:false`, `timestamps` KAPALI).
 */
export class InternalReconciliationJob {
    private static readonly STALE_GUARD_MS = 2 * 60 * 1000;
    /** Bir turda taranacak en fazla varyant (aşırı büyük tenant'ta tek turu sınırlamak için). */
    private static readonly SCAN_LIMIT = 5000;

    public async run(): Promise<{ skipped: boolean; scannedClients: number; scanned: number; corrected: number; skippedFresh: number; conflicted: number }> {
        if (!RedisService.isReady()) {
            console.warn('[InternalReconciliationJob] Redis bağlı değil (isReady()=false); bu tur ATLANIYOR.');
            return { skipped: true, scannedClients: 0, scanned: 0, corrected: 0, skippedFresh: 0, conflicted: 0 };
        }

        let scannedClients = 0, scanned = 0, corrected = 0, skippedFresh = 0, conflicted = 0;

        try {
            const applicationDB = await DatabaseManagerInstance.getApplicationDB();
            const activeClients = await applicationDB.getClientModel().find({ status: 'ACTIVE' }).lean();

            for (const client of activeClients || []) {
                scannedClients++;
                const clientOrder = Number((client as any).order);
                try {
                    const r = await this.runForClient(clientOrder);
                    scanned += r.scanned; corrected += r.corrected; skippedFresh += r.skippedFresh; conflicted += r.conflicted;
                } catch (error) {
                    console.error(`[InternalReconciliationJob] Client hata (order=${clientOrder}):`, error);
                }
            }
        } catch (error) {
            console.error('[InternalReconciliationJob] Tur genel hata:', error);
        }

        return { skipped: false, scannedClients, scanned, corrected, skippedFresh, conflicted };
    }

    private async runForClient(clientOrder: number): Promise<{ scanned: number; corrected: number; skippedFresh: number; conflicted: number }> {
        let scanned = 0, corrected = 0, skippedFresh = 0, conflicted = 0;

        const clientDB = await DatabaseManagerInstance.getClientDB(clientOrder);
        if (!clientDB) return { scanned, corrected, skippedFresh, conflicted };

        const variantModel = clientDB.getVariantModel();
        const candidates = await variantModel
            .find({ 'allocations.0': { $exists: true } })
            .select('_id reserved allocations stockVersion')
            .limit(InternalReconciliationJob.SCAN_LIMIT)
            .lean();

        const now = Date.now();

        for (const variant of candidates || []) {
            scanned++;
            const allocations: any[] = (variant as any).allocations || [];
            const sumReserved = allocations
                .filter((a: any) => a.state === 'RESERVED')
                .reduce((acc: number, a: any) => acc + (Number(a.qty) || 0), 0);
            const currentReserved = Number((variant as any).reserved) || 0;

            if (sumReserved === currentReserved) continue;

            const lastTouchedAt = allocations.reduce((max: number, a: any) => {
                const t = a.at ? new Date(a.at).getTime() : 0;
                return t > max ? t : max;
            }, 0);
            if (lastTouchedAt && (now - lastTouchedAt) < InternalReconciliationJob.STALE_GUARD_MS) {
                skippedFresh++;
                continue;
            }

            const corrigedDoc = await variantModel.findOneAndUpdate(
                { _id: (variant as any)._id, stockVersion: (variant as any).stockVersion },
                { $set: { reserved: sumReserved }, $inc: { stockVersion: 1 } },
                { new: true },
            );
            if (corrigedDoc) {
                corrected++;
                // [ADR-0021 D14] reserved düzeltmesi kullanılabilir stoğu değiştirir -> hareket defteri (best-effort, asenkron)
                const after = deriveAvailable(corrigedDoc as any);
                recordStockMovement(clientDB, {
                    variantId: (variant as any)._id, sku: (corrigedDoc as any).stockcode || (corrigedDoc as any).barcode,
                    delta: currentReserved - sumReserved, before: after - (currentReserved - sumReserved), after,
                    stockAfter: typeof (corrigedDoc as any).stock === 'number' ? (corrigedDoc as any).stock : null,
                    reason: 'reconcile', ref: { kind: 'job', id: 'InternalReconciliationJob', key: `reconcile:${String((variant as any)._id)}:${Number((corrigedDoc as any).stockVersion) || 0}` },
                });
                console.warn(`[InternalReconciliationJob] Onarıldı: variant=${(variant as any)._id} reserved ${currentReserved} -> ${sumReserved} (allocations RESERVED toplamı).`);
            } else {
                // stockVersion o sırada değişmiş (başka bir eşzamanlı geçiş) -- bu turda ATLANIR, bir sonraki
                // saatlik turda yeniden değerlendirilir (ADR'nin "race'e girmeme" kaygısıyla tutarlı).
                conflicted++;
            }
        }

        return { scanned, corrected, skippedFresh, conflicted };
    }
}
