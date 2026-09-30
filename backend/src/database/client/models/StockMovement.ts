import { Schema } from "mongoose";

/**
 * ADR-0021 D14: `StockMovements` (tenant DB, EKLEME-YALNIZ stok hareket defteri). Tenant kapsamı DB'nin kendisidir (`clientId` yazılmaz).
 * Yazım best-effort ve asenkron (`operations/stock/stockMovements.ts`): hareket yazımı hiçbir stok/istek akışını bloklamaz ya da bozmaz.
 *
 *  - `delta/before/after`: KULLANILABİLİR stok (`available = stock - reserved`) değişimi (kanalın gördüğü sayı). Rezervasyondan sevke
 *    (RESERVED->COMMITTED) geçişte available değişmez (delta 0) ama fiziksel stok düşer -> `stockAfter` (fiziksel `stock`) ile izlenir.
 *  - `reason` (yeni enum'lar lower_snake, DATA_MODEL_CONVENTIONS §1): order_reserve | order_commit | order_release | return_restock |
 *    manual_set | manual_adjust | import | reconcile.
 *  - `ref.key`: idempotency (aynı `{ref.key, reason}` iki kez yazılamaz; tekrar oynatma E11000 ile sessizce yutulur).
 *  - Saklama: 730 g (`purgeAt`, DATA_MODEL_CONVENTIONS §10 / ADR-0021 D14). PII YOK (yalnız kimlik/adet/dış sipariş anahtarı).
 * `autoIndex:false` — indeksler YALNIZ göçle (`migrations/0015-stock-movements-tenant.js`, ÇALIŞTIRILMADI) kurulur.
 */
export const STOCK_MOVEMENT_REASONS = [
    'order_reserve', 'order_commit', 'order_release', 'return_restock', 'manual_set', 'manual_adjust', 'import', 'reconcile',
] as const;
export type StockMovementReason = typeof STOCK_MOVEMENT_REASONS[number];

export const STOCK_MOVEMENT_RETENTION_DAYS = 730;

export const StockMovementSchema = new Schema({
    variantId: { type: Schema.Types.ObjectId, required: true },
    sku: { type: String },                                   // stockcode (yoksa barkod)
    delta: { type: Number, required: true },
    before: { type: Number, required: true },
    after: { type: Number, required: true },
    stockAfter: { type: Number },
    reason: { type: String, enum: STOCK_MOVEMENT_REASONS, required: true },
    ref: {
        kind: { type: String },                              // order | claim | request | job
        id: { type: String },                                // dış sipariş/iade kimliği ya da requestId
        key: { type: String },                               // idempotency anahtarı
    },
    actor: {
        type: { type: String, enum: ['system', 'user', 'agent'] },
        id: { type: String },
    },
    channel: { type: String },
    at: { type: Date, required: true },
    purgeAt: { type: Date, required: true },
    schemaVersion: { type: Number, default: 1 },
}, { collection: 'StockMovements', versionKey: false, autoIndex: false });

// Sıcak sorgu (DATA_MODEL_CONVENTIONS §12): stok hareket raporu `{variantId}` sort `at`
StockMovementSchema.index({ variantId: 1, at: -1 }, { name: 'variantId_1_at_-1' });
// idempotency: `{ref.key, reason}` (yalnız anahtarı olan satırlar)
StockMovementSchema.index({ 'ref.key': 1, reason: 1 }, { unique: true, name: 'uniq_refkey_reason', partialFilterExpression: { 'ref.key': { $type: 'string' } } });
// saklama (730 g; `purgeAt` yazıcıdan hesaplanır)
StockMovementSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_purge_at' });
