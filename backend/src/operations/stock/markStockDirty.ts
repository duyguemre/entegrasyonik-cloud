import { metricsRegistry } from '@platform/runtime/metrics';
import { getRequestId } from '@platform/core/context';
import { recordStockMovements, StockMovementInput } from './stockMovements';

/**
 * X2 (CROSS_CUTTING_GAP 7b, ADR-0004 Karar 6): stok yazımı -> kanal yayını "TEK KAPISI".
 *
 * `available`'i etkileyen HER yazma (kullanıcı düzenlemesi, StockAllocator geçişleri, mutabakat) yayın için
 * `stockDirty=true` + `stockDirtyAt` işaretler; `StockPublishTrigger` yalnızca `stockDirty:true` varyantları tarar.
 * Yeni altyapı YOK: mevcut bayrak + mevcut trigger. `stockDirtyAt` = "son işaretleme zamanı" (yayın sonrası da kalır;
 * gecikme metriği `lastPublishedAt` ile kıyaslayarak bayat değeri eler).
 */

/** `$set`'e yayılacak işaret. Tüm stok yazma yolları BUNU kullanır. */
export function stockDirtyFields(now: Date = new Date()): { stockDirty: true; stockDirtyAt: Date } {
    return { stockDirty: true, stockDirtyAt: now };
}

/** Kullanıcı düzenlemesiyle fiziksel stoğu değişen mevcut varyantın önce/sonra değeri (hareket defteri girdisi için). */
export interface StockChange { variantId: string; before: number; after: number; reserved: number; sku?: string }

/**
 * Kullanıcı düzenlemesi için: gelen varyantlardan MEVCUT ve stoğu DEĞİŞENLERİ (önce/sonra ile) döndürür.
 * Yeni varyant (henüz `_id` yok) işaretlenmez: ilk stoğu TRANSFER ile gider, dirty bırakmak trigger taramasını şişirir.
 */
export async function findStockChanges(variantModel: any, incoming: ReadonlyArray<any>): Promise<Map<string, StockChange>> {
    const out = new Map<string, StockChange>();
    const withStock = incoming.filter((v) => v && v._id && typeof v.stock === 'number');
    if (withStock.length === 0) return out;
    const existing: any[] = await variantModel.find({ _id: { $in: withStock.map((v) => v._id) } }, { stock: 1, reserved: 1, stockcode: 1, barcode: 1 }).lean();
    const before = new Map<string, any>((existing || []).map((e) => [String(e._id), e]));
    for (const v of withStock) {
        const prev = before.get(String(v._id));
        if (!prev) continue;
        const prevStock = Number(prev.stock ?? 0);
        if (prevStock !== v.stock) out.set(String(v._id), { variantId: String(v._id), before: prevStock, after: v.stock, reserved: Number(prev.reserved ?? 0), sku: prev.stockcode || prev.barcode });
    }
    return out;
}

/** Kullanıcı düzenlemesi için: gelen varyantlardan MEVCUT ve stoğu DEĞİŞENLERİN id'lerini döndürür (bkz. `findStockChanges`). */
export async function findStockChangedVariantIds(variantModel: any, incoming: ReadonlyArray<any>): Promise<Set<string>> {
    return new Set((await findStockChanges(variantModel, incoming)).keys());
}

/**
 * [ADR-0021 D14] Kullanıcı stok düzenlemelerini hareket defterine yazar (reason `manual_set`; best-effort, asenkron, beklenmez).
 * `request`: `principal.sub` aktör kimliği; `getRequestId()` varsa `{ref.key}` = `<requestId>:<variantId>` (idempotency).
 */
export function recordManualStockMovements(clientDB: any, changes: Iterable<StockChange>, request?: any): void {
    const requestId = getRequestId();
    const actorId = request?.principal?.sub;
    const inputs: StockMovementInput[] = [];
    for (const c of changes) {
        const before = c.before - c.reserved, after = c.after - c.reserved;
        inputs.push({
            variantId: c.variantId, sku: c.sku, delta: after - before, before, after, stockAfter: c.after,
            reason: 'manual_set', actor: { type: 'user', id: actorId },
            ref: { kind: 'request', id: requestId, key: requestId ? `${requestId}:${c.variantId}` : undefined },
        });
    }
    recordStockMovements(clientDB, inputs);
}

/**
 * `stock_publish_lag_ms`: düzenleme/rezervasyon (stockDirtyAt) -> pazaryeri onayı (Sentinel COMPLETED) gecikmesi.
 * Yalnızca `stockDirtyAt > önceki lastPublishedAt` ise gözlenir (eski işaret yeni yayına yazılmaz). Asla fırlatmaz.
 */
export async function observeStockPublishLag(
    variantModel: any, matchKey: string, integrationCode: string, matchValues: string[], now: Date = new Date(),
): Promise<void> {
    try {
        if (matchValues.length === 0) return;
        const rows: any[] = await variantModel
            .find({ [matchKey]: { $in: matchValues } }, { stockDirtyAt: 1, [`platforms.${integrationCode}.stockSync.lastPublishedAt`]: 1 })
            .lean();
        for (const r of rows || []) {
            const dirtyAt = r?.stockDirtyAt ? new Date(r.stockDirtyAt).getTime() : NaN;
            if (Number.isNaN(dirtyAt)) continue;
            const prevRaw = r?.platforms?.[integrationCode]?.stockSync?.lastPublishedAt;
            const prev = prevRaw ? new Date(prevRaw).getTime() : 0;
            if (dirtyAt <= prev) continue;
            metricsRegistry.observeHistogram('stock_publish_lag_ms', { integration: integrationCode }, Math.max(0, now.getTime() - dirtyAt));
        }
    } catch { /* metrik asla akışı bozmaz */ }
}
