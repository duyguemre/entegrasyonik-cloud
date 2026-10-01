import { Schema } from "mongoose";

/**
 * PRC-R1: `BuyboxSnapshots` (tenant DB) — barkod başına buybox gözlem geçmişi (30 gün grafik + "buybox kaybedildi" kanıtı).
 * Tenant kapsamı DB'nin kendisidir (`clientId` yazılmaz); rakip/buybox verisi tenant'lar arasında BİRLEŞTİRİLMEZ (COMPETITION_PRICING §3).
 * Yazım seyreltilir: durum/sıra/fiyat değişince ya da 6 saatte bir (her okumada değil) — barkod başına ayda en çok ~120 belge + değişimler.
 * Saklama: `observedAt` + 90 gün (TTL). `autoIndex:false` — indeksler YALNIZ göçle (`migrations/0021-pricing-competition-tenant.js`, ÇALIŞTIRILMADI).
 */
export const BUYBOX_STATUSES = ['winning', 'losing', 'not_found'] as const;
export const BUYBOX_SNAPSHOT_TTL_SECONDS = 90 * 24 * 3600;

export const BuyboxSnapshotSchema = new Schema({
    integrationCode: { type: String, required: true },
    barcode: { type: String, required: true },
    variantId: { type: Schema.Types.ObjectId, required: false },
    observedAt: { type: Date, required: true },
    status: { type: String, enum: BUYBOX_STATUSES, required: true },
    buyboxOrder: { type: Number, required: false },
    buyboxPrice: { type: Number, required: false },
    hasMultipleSeller: { type: Boolean, required: false },
    /** Gözlem anında bizim kanal fiyatımız (KDV dahil, TL). */
    ownPrice: { type: Number, required: false },
    schemaVersion: { type: Number, default: 1 },
}, { collection: 'BuyboxSnapshots', versionKey: false, autoIndex: false });

BuyboxSnapshotSchema.index({ integrationCode: 1, barcode: 1, observedAt: -1 }, { name: 'integ_barcode_observedAt' });
BuyboxSnapshotSchema.index({ observedAt: 1 }, { name: 'ttl_observedAt_90d', expireAfterSeconds: BUYBOX_SNAPSHOT_TTL_SECONDS });
