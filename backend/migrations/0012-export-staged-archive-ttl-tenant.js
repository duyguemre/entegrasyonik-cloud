'use strict';
/**
 * DB-12 / DBR-05 (Tenant, expand): `ExportStagedProducts` saklama TTL'i. Indeks `ttl_archived_at` = `{archivedAt:1}` +
 * `expireAfterSeconds` + `partialFilterExpression:{isArchived:true}` (yalniz ARSIVLENMIS kayitlar silinir; aktif is akisi ETKILENMEZ).
 * Arsivleme yalniz `payload`'i siler (ExportOrchestrator ~295); belge kalir ve sinirsiz buyurdu (`logs[]`, en buyuk belge 281 KB).
 *
 * SURE = INSAN KARARI: KULLANICI KARARI 2026-09-30 -> 30 gun (varsayilan). Degistirmek icin `ESP_ARCHIVE_TTL_DAYS` (1..365, tam sayi) ya da
 * `ctx.params.espArchiveTtlDays`. `plan` secilen sureyi ve kaynagini gosterir. Ayni adli indeks farkli sureyle varsa `collMod` ile guncellenir.
 * DIKKAT (plan raporu): `wouldExpireNow` = TTL kurulur kurulmaz (<= ~60 sn) SILINECEK arsivli belge sayisi (archivedAt < simdi - sure).
 * Bu bir VERI SILME etkisidir: yedek dogrulanmadan up calistirilmaz. Indeks bilerek semaya (`client/models/Export.ts`) BAGLANMADI:
 * ESP semasinin autoIndex'i acik, baglansaydi uygulama acilisinda onaysiz kurulurdu; kurulum YALNIZ bu goc ile.
 * YALNIZ onayli gocte calisir (kural 3; once yerel, Atlas ayri onay). CALISTIRILMADI. Idempotent (ikinci up no-op).
 * down: `ttl_archived_at` indeksini dusurur (silinmis belgeler geri gelmez -- yedekten tenant bazli restore).
 * Mevcut sisman `logs` dizileri icin kirpma gocu YOK (mock veri karari): kayitlar TTL ile duser ya da ESP mock sifirlamasi ile temizlenir.
 */
const {
    assertCtxDbAllowed, collectionFor, listIndexes, classify, ensureIndex, dropIndexIfExists,
} = require('../dev-tools/_migrationIndexes');

const KEY = 'exportStagedProducts';
const COLL = 'ExportStagedProducts';
const NAME = 'ttl_archived_at';
const DEFAULT_DAYS = 30;
const DAY_S = 24 * 60 * 60;

function resolveRetention(ctx) {
    let raw; let source;
    if (ctx.params && ctx.params.espArchiveTtlDays !== undefined) { raw = ctx.params.espArchiveTtlDays; source = 'ctx.params'; }
    else if (process.env.ESP_ARCHIVE_TTL_DAYS !== undefined && process.env.ESP_ARCHIVE_TTL_DAYS !== '') { raw = process.env.ESP_ARCHIVE_TTL_DAYS; source = 'env ESP_ARCHIVE_TTL_DAYS'; }
    else { raw = DEFAULT_DAYS; source = 'varsayilan (kullanici karari 2026-09-30: 30 gun)'; }
    const days = Number(raw);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('[migration] ESP arsiv TTL gunu 1..365 tam sayi olmali.');
    return { days, source };
}

function wanted(days) {
    return { fields: { archivedAt: 1 }, options: { name: NAME, expireAfterSeconds: days * DAY_S, partialFilterExpression: { isArchived: true } } };
}

module.exports = {
    id: '0012-export-staged-archive-ttl-tenant',
    scope: 'tenant',
    kind: 'index',
    description: 'DB-12 (Tenant): ExportStagedProducts TTL ttl_archived_at {archivedAt} partial {isArchived:true}, sure 30 gun (parametre: ESP_ARCHIVE_TTL_DAYS).',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: sure + eylem + hemen silinecek arsivli belge sayisi (yalniz sayilar). */
    async plan(ctx) {
        assertCtxDbAllowed(ctx);
        const { days, source } = resolveRetention(ctx);
        const { name, c } = collectionFor(ctx, KEY, COLL);
        const list = await listIndexes(c);
        const w = wanted(days);
        const cutoff = new Date((ctx.now ? ctx.now() : new Date()).getTime() - days * DAY_S * 1000);
        let archivedTotal = 0; let wouldExpireNow = 0;
        if (list.length) { // koleksiyon yoksa sayim yok (0)
            archivedTotal = await c.countDocuments({ isArchived: true }, { maxTimeMS: 30000 });
            wouldExpireNow = await c.countDocuments({ isArchived: true, archivedAt: { $lt: cutoff } }, { maxTimeMS: 30000 });
        }
        return { collections: [{ collection: name, retentionDays: days, retentionSource: source, indexes: [{ name: NAME, ...classify(list, w) }], archivedTotal, wouldExpireNow }] };
    },

    async up(ctx) {
        assertCtxDbAllowed(ctx);
        const { days } = resolveRetention(ctx);
        const { name, c, db } = collectionFor(ctx, KEY, COLL);
        return { collections: [{ collection: name, retentionDays: days, indexes: [await ensureIndex(c, db, wanted(days))] }] };
    },

    async down(ctx) {
        assertCtxDbAllowed(ctx);
        const { name, c } = collectionFor(ctx, KEY, COLL);
        return { collections: [{ collection: name, indexes: [await dropIndexIfExists(c, NAME)] }] };
    },
};
module.exports.DEFAULT_DAYS = DEFAULT_DAYS;
