import { NotificationService } from '@services/notification/NotificationService';
import { deriveAvailable } from '@interfaces/stock';

/**
 * Düşük stok (Faz-3). Tenant eşiği `ClientIntegrations.stockPolicy.lowStockThreshold` (varsayılan YOK = kapalı; bkz. stockPolicyValidation).
 * Ölçüt KULLANILABİLİR stoktur (`stock - reserved`): kanalın gördüğü/satabileceğimiz miktar (zero-oversell kimliği).
 *
 * Bildirim (`STOCK_LOW`, ADR-0029): StockPublishTrigger'ın zaten taradığı stoğu DEĞİŞMİŞ (dirty) varyantlarda eşik aşımı
 * kontrol edilir (ek sorgu yok). Günde en fazla bir kez / varyant: katalog `dedupeKey = <variantId>:<gün>` (defter idempotency,
 * gün = Europe/Istanbul). Tur başına üst sınır: patlama koruması (kalanlar stok tekrar değişince/ertesi tur denenir).
 */
export const LOW_STOCK_NOTIFY_PER_RUN_MAX = 50;

/** `YYYY-MM-DD` (Europe/Istanbul; DATA_MODEL_CONVENTIONS §3). */
export function istanbulDay(now: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export const isLowStock = (available: number, threshold: number): boolean => available <= threshold;

/** Eşik altındaki varyantlar için `STOCK_LOW` üretir (asla fırlatmaz). Dönüş: denenen bildirim sayısı. */
export async function notifyLowStockVariants(
    clientOrder: number, variants: ReadonlyArray<any>, threshold: number | null | undefined, now: Date = new Date(),
): Promise<number> {
    if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0) return 0;
    let attempted = 0;
    const day = istanbulDay(now);
    for (const v of variants) {
        if (attempted >= LOW_STOCK_NOTIFY_PER_RUN_MAX) break;
        const available = deriveAvailable(v);
        if (!isLowStock(available, threshold)) continue;
        attempted++;
        try {
            await NotificationService.notify('STOCK_LOW', clientOrder, {
                variantId: String(v._id),
                sku: String(v.stockcode || v.barcode || v._id).slice(0, 80),
                available, threshold, day,
            }, { module: 'StockPublishTrigger' });
        } catch { /* bildirim yayın turunu asla bozmaz */ }
    }
    return attempted;
}
