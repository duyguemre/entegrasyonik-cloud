import mongoose from "mongoose";

// BE-05 (K51): backoffice "kayıtlı görünümler" -- yönetici başına, ekran başına adlandırılmış URL süzgeç sorgusu (NT-03 modeli). Kişisel tercih;
// tenant verisi/PII YOK. `(sub, screen, name)` tekil: kaydet = upsert (idempotent). Yönetici başına en çok 20 görünüm (uygulama katmanı: operations/backoffice/viewsAdmin.ts MAX_VIEWS_PER_ADMIN).
//
// ADR-0021 deseni: `autoIndex:false`; koleksiyon/indeks YALNIZ onaylı göçle kurulur (migrations/0019-backoffice-views-app.js; CALISTIRILMADI).


export const BackofficeViewSchema = new mongoose.Schema({
    sub: { type: String, required: true },                 // merkezi Users._id (string) -- görünümün sahibi
    screen: { type: String, required: true },              // ekran anahtarı (örn. 'tenants', 'engine')
    name: { type: String, required: true },                // 1..60
    query: { type: mongoose.Schema.Types.Mixed, required: true }, // Record<string, string | string[]> (şema katmanında doğrulanır)
}, {
    collection: 'BackofficeViews',
    strict: true,
    timestamps: true,
    versionKey: false,
    autoIndex: false,
});

export const BACKOFFICE_VIEW_INDEXES = [
    { fields: { sub: 1, screen: 1, name: 1 }, options: { unique: true, name: 'uniq_sub_screen_name' } },
    { fields: { sub: 1, updatedAt: -1 }, options: { name: 'sub_1_updatedAt_-1' } },
] as const;
for (const i of BACKOFFICE_VIEW_INDEXES) BackofficeViewSchema.index(i.fields as any, i.options as any);
