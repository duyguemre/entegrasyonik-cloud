import mongoose from 'mongoose';

// ADR-0020 Karar 3.1 (Aşama B) — sürümlü platform geçersiz kılmaları.
// `IntegrationConfigRevisions`: hedef (entegrasyon kodu ya da `_engine`) başına anlık görüntü dizisi (taslak/yayın/geçmiş).
// `IntegrationConfigHeads`: hedef başına TEK küçük belge — yayındaki sürüm (pod'ların 15 sn'de bir yokladığı belge, Karar 3.6).
//
// C23 dersi (BACKLOG C23): `status`/`publishedVersion` gibi filtrelenen alanlar HER ZAMAN required+default'ludur;
// `null`/eksik alan `$lt`/`$eq` ile anlam taşımaz. Bu şema bilinçli olarak hiçbir filtrelenen alanı optional bırakmaz.

// NOT (knip/D3 modülerlik): bu sabitler/tipler yalnız AŞAĞIDAKİ şema tanımları içinde kullanılır (dışarıdan
// içe aktarılmaz) — bilerek dışa AÇILMAZ. Hedef adı sabiti (`_engine`) ayrıca `integration/config/targets.ts`'te
// GERÇEK tüketiciler için durur (`targets.ts` dosya başı notu: database katmanı integration'ı içe aktaramaz).
const INTEGRATION_CONFIG_REVISION_STATUSES = ['draft', 'published', 'superseded', 'discarded'] as const;
const INTEGRATION_CONFIG_ORIGIN_KINDS = ['manual', 'rollback', 'finding', 'migration', 'agent'] as const;
const INTEGRATION_CONFIG_DANGER_LEVELS = ['safe', 'caution', 'dangerous'] as const;

const OriginSchema = new mongoose.Schema({
    kind: { type: String, enum: INTEGRATION_CONFIG_ORIGIN_KINDS, required: true },
    ref: { type: String, required: false },
}, { _id: false });

const DiffEntrySchema = new mongoose.Schema({
    key: { type: String, required: true },
    from: { type: mongoose.Schema.Types.Mixed, required: false },
    to: { type: mongoose.Schema.Types.Mixed, required: false },
    danger: { type: String, enum: INTEGRATION_CONFIG_DANGER_LEVELS, required: true },
}, { _id: false });

const ImpactSchema = new mongoose.Schema({
    activeTenants: { type: Number, required: true, default: 0 },
    perTenantOverrides: { type: Number, required: false },
}, { _id: false });

/**
 * Bir hedef (entegrasyon kodu | `_engine`) için TEK anlık görüntü. `overrides` yalnız varsayılandan FARKLI
 * anahtarları taşır (Karar 3.1 "tam anlık görüntü"). `version` hedef başına artan (unique(target,version)).
 */
export const IntegrationConfigRevisionSchema = new mongoose.Schema({
    target: { type: String, required: true },
    version: { type: Number, required: true },
    status: { type: String, enum: INTEGRATION_CONFIG_REVISION_STATUSES, required: true, default: 'draft' },
    overrides: { type: mongoose.Schema.Types.Mixed, required: true, default: () => ({}) },
    basedOnVersion: { type: Number, required: true, default: 0 }, // 0 = henüz hiç yayın yok
    catalogVersion: { type: String, required: true },
    origin: { type: OriginSchema, required: true, default: () => ({ kind: 'manual' }) },
    /** caution/dangerous içeren yayında zorunlu (servis katmanında doğrulanır, şema burada yalnız uzunluk sınırlar). */
    reason: { type: String, required: false, maxlength: 500 },
    diff: { type: [DiffEntrySchema], required: true, default: () => [] },
    impact: { type: ImpactSchema, required: false },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    /** İyimser kilit sayacı (Karar 3.2/3.7): her `saveDraft` +1 artırır. */
    draftRev: { type: Number, required: true, default: 0 },
    lockedBy: { type: String, required: false },
    lockedAt: { type: Date, required: false },
    publishedBy: { type: String, required: false },
    publishedAt: { type: Date, required: false },
    /** İki kişi kuralı açıkken ikinci onaylayan (Karar 3.2/Karar 9.1); kapalıyken hiç dolmaz. */
    approvedBy: { type: String, required: false },
}, {
    collection: 'IntegrationConfigRevisions',
    versionKey: false,
    timestamps: false,
});

IntegrationConfigRevisionSchema.index({ target: 1, version: 1 }, { unique: true });
// Kısmi tekil indeks (Karar 3.1): hedef başına en fazla BİR taslak. `status` her zaman set olduğundan (required+default)
// bu partialFilterExpression güvenilir şekilde eşleşir (C23 dersi: filtrelenen alan asla null/eksik değildir).
IntegrationConfigRevisionSchema.index({ target: 1 }, { unique: true, partialFilterExpression: { status: 'draft' } });
IntegrationConfigRevisionSchema.index({ target: 1, status: 1, version: -1 });

/**
 * Hedef başına TEK belge (`_id` = target). Pod'ların 15 sn'de bir yokladığı küçük belge (Karar 3.6).
 * `publishedVersion` HER ZAMAN sayısaldır (0 = hiç yayın yok) — `null`/eksik DEĞİL (C23 dersi).
 */
export const IntegrationConfigHeadSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // target
    publishedVersion: { type: Number, required: true, default: 0 },
    /** Karar 3.8 (Aşama D kapsamı) — yalnız şema yer tutucu, bu aşamada motor davranışına BAĞLANMAZ. */
    intake: { type: String, enum: ['on', 'drain', 'off'], required: true, default: 'on' },
    maintenance: {
        type: new mongoose.Schema({
            message: { tr: { type: String }, en: { type: String } },
            until: { type: Date, required: false },
        }, { _id: false }),
        required: false,
    },
    updatedAt: { type: Date, required: true, default: Date.now },
}, {
    collection: 'IntegrationConfigHeads',
    versionKey: false,
    timestamps: false,
    _id: false,
});
