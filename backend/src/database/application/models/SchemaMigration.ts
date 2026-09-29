import mongoose from 'mongoose';

// ADR-0021 Karar 4 — kalıcı göç altyapısı kaydı. `dev-tools/migrate.js` bu koleksiyona (ApplicationDB,
// `entegrasyonikDB`) her göç çalıştırmasının durumunu yazar. Alan listesi Karar 4'ün metniyle BİREBİR:
// `{_id: id, checksum, kind, scope, status, startedAt, finishedAt, appliedBy, backupRef, tenants[], lease}`.
//
// [TASARIM NOTU / ADR BELİRSİZLİĞİ] Karar 4 metni `lease: {owner, until}` (İÇ İÇE) yazıyor, ama projedeki
// TEK genel lease yardımcısı (`@utils/mongoLease`) ÜST DÜZEY `leaseOwner`/`leaseUntil` alanlarını bekler
// (ExportFlag/JobLease deseni, C23 düzeltmesi). Bu göreve "mongoLease'i OLDUĞU GİBİ tüket, D3'ü uygulama"
// talimatı verildiği için: `dev-tools/migrate.js`'in KENDİ eşzamanlı-çalıştırma kilidi mongoLease'i
// DOĞRUDAN üst-düzey alanlı `JobLeases` koleksiyonu (mevcut `job_lease` modeli, ADR-0016 §2.1 deseni)
// üzerinden tüketir (bkz. migrate.js `acquireRunnerLease`). Buradaki `lease` alanı ADR'nin metnine sadık
// kalınarak AYNEN saklanır ama yalnız GÖZLEM/rapor amaçlıdır (`status` komutunun gösterdiği "son bilinen
// kilit sahibi" bilgisi); mongoLease onu OKUMAZ/YAZMAZ. Bu çelişki görev raporunda AÇIKÇA belirtildi.
// NOT: türetilmiş `type X = ...[number]` alias'ları ve ayrı bir eşik sabiti BİLEREK EKLENMEDİ (knip mandalı,
// quality/baseline.json — hiçbir tüketicisi olmayan yeni export/type ratchet ihlali sayılır). `migrate.js`
// (CommonJS, tip YOK) veya başka bir TS modülü bu enum'ları gerçekten tüketmeye başladığında eklenir.
export const SCHEMA_MIGRATION_KINDS = ['index', 'expand', 'migrate', 'contract'] as const;
export const SCHEMA_MIGRATION_SCOPES = ['app', 'tenant', 'both'] as const;
export const SCHEMA_MIGRATION_STATUSES = ['running', 'done', 'failed', 'partial'] as const;
export const SCHEMA_MIGRATION_TENANT_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
// Eşik (Karar 4): > 500 tenant'ta `tenants[]` yerine tenant-başına-ayrı-belge tasarımına geçilir.

const TenantMigrationProgressSchema = new mongoose.Schema({
    clientId: { type: Number, required: true },
    dbname: { type: String, required: true },
    status: { type: String, enum: SCHEMA_MIGRATION_TENANT_STATUSES, required: true, default: 'pending' },
    processed: { type: Number, required: true, default: 0 },
    /** Batch imleci (`_id` artan) — kesinti sonrası `up` kaldığı yerden sürer (Karar 4). String'e çevrilmiş saklanır (ObjectId/Number olabilir). */
    lastId: { type: String, required: false },
    startedAt: { type: Date, required: false },
    finishedAt: { type: Date, required: false },
    /** Redakte edilmiş hata metni, ≤500 karakter — sır/URL YOK (CLAUDE.md kural 4). */
    error: { type: String, required: false, maxlength: 500 },
}, { _id: false, strict: true });

const RunnerLeaseObservationSchema = new mongoose.Schema({
    owner: { type: String, required: false },
    until: { type: Date, required: false },
}, { _id: false, strict: true });

export const SchemaMigrationSchema = new mongoose.Schema({
    /** Göç id'si (ör. `'0001-audit-tid-at-index'`) — dosya adıyla birebir, göçün birincil anahtarı. */
    _id: { type: String, required: true },
    /** `sha256(dosya)` — uygulanmış göçün dosya checksum'ı değişirse çalıştırıcı DURUR (Karar 4). */
    checksum: { type: String, required: true },
    kind: { type: String, enum: SCHEMA_MIGRATION_KINDS, required: true },
    scope: { type: String, enum: SCHEMA_MIGRATION_SCOPES, required: true },
    status: { type: String, enum: SCHEMA_MIGRATION_STATUSES, required: true, default: 'running' },
    startedAt: { type: Date, required: true, default: Date.now },
    finishedAt: { type: Date, required: false },
    /** İşletim ortamı kullanıcı/host/pod etiketi — E-POSTA/kişi adı DEĞİL (CLAUDE.md kural 4). */
    appliedBy: { type: String, required: true },
    /** `backup/` altındaki doğrulanmış yedek yolu (Karar 4 `--backup-ref`); `plan`/dry-run'da yok. */
    backupRef: { type: String, required: false },
    tenants: { type: [TenantMigrationProgressSchema], required: true, default: [] },
    /** Yalnız GÖZLEM (bkz. dosya başı not) — mongoLease bunu tüketmez. */
    lease: { type: RunnerLeaseObservationSchema, required: false },
}, {
    collection: 'SchemaMigrations',
    versionKey: false,
    timestamps: false,
    strict: true,
});

// Sıcak sorgu: `status` komutu "hangi göçler running/partial/failed" filtreler (DATA_MODEL_CONVENTIONS §9: adlı indeks).
SchemaMigrationSchema.index({ status: 1 }, { name: 'status_1' });
