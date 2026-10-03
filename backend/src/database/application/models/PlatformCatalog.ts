import mongoose from "mongoose";

// [eslesme-fiyat WP2, PLAN §3.1] Platform katalog önbelleği (App DB, tenant'tan BAĞIMSIZ): eşlenmiş platform kategorilerinin
// özellik ve değer listeleri + kategori ağacı kimlikleri. `catalog.platformRefresh` (haftalık) yazar, aynı iş bayatlık taramasında okur.
// `ids`: o listedeki platform kimlikleri (bayatlık karşılaştırması); `payload`: ham normalize liste (FE/preflight için, isteğe bağlı).
// Sır/PII YOK (pazaryerinin herkese açık katalog verisi). Saklama 7 gün (`fetchedAt` TTL); `@Cache` 6 sa sıcak katman olarak kalır.
// ADR-0021 deseni: `autoIndex:false`; indeksler YALNIZ onaylı göçle (migrations/0030-platform-catalog-app.js; ÇALIŞTIRILMADI).

export const PLATFORM_CATALOG_TTL_DAYS = 7;
export type PlatformCatalogKind = 'category' | 'attribute' | 'value';

export const PlatformCatalogSchema = new mongoose.Schema({
    integrationCode: { type: String, required: true },
    kind: { type: String, required: true, enum: ['category', 'attribute', 'value'] },
    /** kind=category: '' (ağacın tamamı); attribute/value: platform kategori kimliği. */
    platformCategoryId: { type: String, default: '' },
    /** kind=value: platform özellik kimliği; diğerleri ''. */
    platformAttributeId: { type: String, default: '' },
    ids: { type: [String], default: [] },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    fetchedAt: { type: Date, required: true },
}, {
    collection: 'PlatformCatalog',
    strict: true,
    versionKey: false,
    autoIndex: false,
});

export const PLATFORM_CATALOG_INDEXES = [
    { fields: { integrationCode: 1, kind: 1, platformCategoryId: 1, platformAttributeId: 1 }, options: { unique: true, name: 'uniq_integration_kind_cat_attr' } },
    { fields: { fetchedAt: 1 }, options: { expireAfterSeconds: PLATFORM_CATALOG_TTL_DAYS * 24 * 3600, name: 'ttl_fetchedAt' } },
] as const;
for (const i of PLATFORM_CATALOG_INDEXES) PlatformCatalogSchema.index(i.fields as any, i.options as any);
