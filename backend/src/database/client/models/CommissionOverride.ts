import { Schema } from "mongoose";

/**
 * COM-04: `CommissionOverrides` (tenant DB) — tenant'ın kanal/kategori bazında kendi komisyon oranı (örn. özel sözleşme).
 * Tenant kapsamı DB'nin kendisidir (`clientId` yazılmaz). Oncelik: kategori override > kanal varsayilan override > gerceklesen > tahmini.
 *  - `scope: 'category'` => `platformCategoryId` ZORUNLU (kanalin kategori kimligi); `scope: 'default'` => `platformCategoryId` YOK (kanalin tum kategorileri).
 *  - `rate`: 0-100 yuzde, en cok 2 ondalik (yazim servisi dogrular).
 * `autoIndex:false` — tekil indeks YALNIZ gocle (`migrations/0016-commission-overrides-tenant.js`, CALISTIRILMADI) kurulur.
 */
const COMMISSION_OVERRIDE_SCOPES = ['category', 'default'] as const;


export const CommissionOverrideSchema = new Schema({
    integrationCode: { type: String, required: true },       // kucuk harf (trendyol, hepsiburada...)
    scope: { type: String, enum: COMMISSION_OVERRIDE_SCOPES, required: true },
    platformCategoryId: { type: String },                    // yalniz scope='category'
    rate: { type: Number, required: true, min: 0, max: 100 },
    note: { type: String, maxlength: 500 },
    updatedBy: { type: String, required: true },             // kullanici kimligi (sub)
    updatedAt: { type: Date, required: true },
    schemaVersion: { type: Number, default: 1 },
}, { collection: 'CommissionOverrides', versionKey: false, autoIndex: false });

// Tekil: kanal basina bir varsayilan, kategori basina bir override (`default` icin platformCategoryId yok -> null olarak esitlenir)
CommissionOverrideSchema.index({ integrationCode: 1, scope: 1, platformCategoryId: 1 }, { unique: true, name: 'uniq_integration_scope_category' });
