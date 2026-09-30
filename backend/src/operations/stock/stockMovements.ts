import { metricsRegistry } from '@platform/runtime/metrics';
import { STOCK_MOVEMENT_RETENTION_DAYS, StockMovementReason } from '@database/client/models/StockMovement';

/**
 * ADR-0021 D14: stok hareket defterine TEK yazım noktası. Tüm stok yazma yolları (StockAllocator, kullanıcı düzenlemesi,
 * mutabakat) BURAYI kullanır. Yazım FIRE-AND-FORGET (X4 denetim deseni): çağıran beklemez, hata asla fırlamaz; başarısızlık
 * `stock_movement_write_failures_total` sayacı olur. Tekrar oynatma (`{ref.key, reason}` unique -> E11000) sessizce yutulur.
 * `clientDB.getStockMovementModel` yoksa (eski sahte DB'ler) sessizce no-op.
 */
export interface StockMovementInput {
    variantId: any;
    sku?: string | null;
    /** Kullanılabilir stok (`stock - reserved`) değişimi. */
    delta: number;
    before: number;
    after: number;
    /** Hareket sonrası fiziksel `stock`. */
    stockAfter?: number | null;
    reason: StockMovementReason;
    ref?: { kind?: string; id?: string | null; key?: string | null };
    actor?: { type: 'system' | 'user' | 'agent'; id?: string | null };
    channel?: string | null;
    at?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function toMovementDoc(i: StockMovementInput): Record<string, unknown> {
    const at = i.at ?? new Date();
    const doc: Record<string, unknown> = {
        variantId: i.variantId,
        delta: i.delta, before: i.before, after: i.after,
        reason: i.reason,
        actor: { type: i.actor?.type ?? 'system', ...(i.actor?.id ? { id: String(i.actor.id) } : {}) },
        at,
        purgeAt: new Date(at.getTime() + STOCK_MOVEMENT_RETENTION_DAYS * DAY_MS),
        schemaVersion: 1,
    };
    if (i.sku) doc.sku = String(i.sku).slice(0, 200);
    if (typeof i.stockAfter === 'number') doc.stockAfter = i.stockAfter;
    if (i.channel) doc.channel = String(i.channel).slice(0, 64);
    if (i.ref && (i.ref.kind || i.ref.id || i.ref.key)) {
        doc.ref = {
            ...(i.ref.kind ? { kind: i.ref.kind } : {}),
            ...(i.ref.id ? { id: String(i.ref.id).slice(0, 200) } : {}),
            ...(i.ref.key ? { key: String(i.ref.key).slice(0, 400) } : {}),
        };
    }
    return doc;
}

const isDuplicateOnly = (err: any): boolean => {
    if (err?.code === 11000) return true;
    const we = err?.writeErrors;
    return Array.isArray(we) && we.length > 0 && we.every((e: any) => (e?.err?.code ?? e?.code) === 11000);
};

const countFailure = (): void => {
    try { metricsRegistry.incCounter('stock_movement_write_failures_total', {}, 1); } catch { /* yut */ }
};

/** Bir ya da birden çok hareket yazar; ASLA beklemez/fırlatmaz. */
export function recordStockMovements(clientDB: any, inputs: ReadonlyArray<StockMovementInput>): void {
    try {
        if (!inputs || inputs.length === 0) return;
        const model = typeof clientDB?.getStockMovementModel === 'function' ? clientDB.getStockMovementModel() : undefined;
        if (!model || typeof model.insertMany !== 'function') return;
        const docs = inputs.map(toMovementDoc);
        Promise.resolve()
            .then(() => model.insertMany(docs, { ordered: false }))
            .catch((err: any) => { if (!isDuplicateOnly(err)) countFailure(); });
    } catch {
        countFailure();
    }
}

export function recordStockMovement(clientDB: any, input: StockMovementInput): void {
    recordStockMovements(clientDB, [input]);
}
