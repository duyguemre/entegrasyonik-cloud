'use strict';
/**
 * ADR-0020 Karar 7.1 (Aşama B) — ApplicationDB `Integrations.urls` (+ görünüm alanları `title/color/logo`) değerlerini
 * manifestoyla (host izin listesi + emekli uç desenleri) KARŞILAŞTIRIR ve rapor üretir.
 *
 * NE YAPAR (salt-okuma, varsayılan): her `urls.<key>` değerini 5 sınıftan birine ayırır (aynı/host farkı/yol farkı/
 * emekli/ayrışmıyor — bkz. `src/integration/config/migrationClassifier.ts`).
 *
 * `--apply` VERİLİRSE: YALNIZ "host farkı" (`host_diff`) sınıfındaki anahtarları ve görünüm alanlarını
 * (`title/color/logo`) `IntegrationConfigRevisions`/`IntegrationConfigHeads`'e TEK bir v1 revizyonu olarak yazar
 * (`origin.kind:'migration'`). `Integrations` belgesine HİÇ DOKUNULMAZ (okuma dahil yalnız `code/urls/title/color/
 * logo` projeksiyonu). Emekli ve yol-farkı olan değerler TAŞINMAZ (rapor: "kod varsayılanı kullanılacak").
 * Hedefin ZATEN bir `IntegrationConfigHeads` belgesi varsa (daha önce göç edilmiş/panelden yayın yapılmış) o hedef
 * ATLANIR (`head_already_exists`) — göç aracı asla ÜZERİNE YAZMAZ.
 *
 * BİLİNÇLİ KAPSAM SINIRI (bu görevin raporunda da belirtilir): yazılan anahtarlar (`endpoints.<key>.host`,
 * `view.title/color/logo`) BUGÜN katalogda (ADR-0020 Aşama A) TANIMLI DEĞİL (`config.endpoints`/görünüm ayarları
 * henüz yazılmadı). Bu araç YİNE DE tamamlanıp test edildi (Karar 7.2 "B" satırı DoD'si); GERÇEK bir DB'ye `--apply`
 * ile YAZILMASI bu görevde YAPILMADI (görev talimatı: "yalnız kodla ve test et").
 *
 * VARSAYILAN = DRY-RUN. Yazma: açık `--apply` + `INTEGRATION_CONFIG_MIGRATION_BACKUP_CONFIRMED=yes` (CLAUDE.md kural 3).
 * Koruma zinciri `migrate-trendyol-integration-urls.js` ile AYNI (`_migrationCommon.js`): izinli 7 DB, varsayılan
 * yalnız local 127.0.0.1, çıktıda sır/bağlantı bilgisi yok.
 *
 * Kullanım: cd backend && npm run build && node dev-tools/migrate-integration-config.js [appDbName] [--apply]
 */
const { runCli, loadDist } = require('./_migrationCommon');

const INTEGRATIONS_COLLECTION = 'Integrations';
const REVISIONS_COLLECTION = 'IntegrationConfigRevisions';
const HEADS_COLLECTION = 'IntegrationConfigHeads';

function loadDescriptors() {
    return {
        trendyol: loadDist('integration/modules/marketplace/trendyol/descriptor.js').default,
        hepsiburada: loadDist('integration/modules/marketplace/hepsiburada/descriptor.js').default,
        n11: loadDist('integration/modules/marketplace/n11/descriptor.js').default,
        pazarama: loadDist('integration/modules/marketplace/pazarama/descriptor.js').default,
        ideasoft: loadDist('integration/modules/ecommerce/ideasoft/descriptor.js').default,
        bizimhesap: loadDist('integration/modules/erp/bizimhesap/descriptor.js').default,
    };
}

/** Yalnız RAPOR üretir; hiçbir koleksiyona yazmaz. `descriptors`/`classify` enjekte edilebilir (testler için). */
async function buildReports({ db, descriptors, classify }) {
    const docs = await db.collection(INTEGRATIONS_COLLECTION)
        .find({}, { projection: { code: 1, urls: 1, title: 1, color: 1, logo: 1 } })
        .toArray();
    return classify(docs, descriptors);
}

/** `--apply` için doğrulanmış yedek beyanı ŞARTI (CLAUDE.md kural 3; `migrate-trendyol-integration-urls.js` ile AYNI desen). */
function assertApplyConfirmed(apply, env) {
    if (apply && (!env || env.INTEGRATION_CONFIG_MIGRATION_BACKUP_CONFIRMED !== 'yes')) {
        throw new Error('--apply için doğrulanmış yedek beyanı gerekli: INTEGRATION_CONFIG_MIGRATION_BACKUP_CONFIRMED=yes (backup/README.md; CLAUDE.md kural 3).');
    }
}

/**
 * Ana orkestrasyon. `db`/`descriptors`/`classify`/`now` enjekte edilebilir (Mongo/ağ YOK testlerde).
 * DRY-RUN (`apply:false`): SIFIR yazma (hiçbir `insertOne`/`updateOne` çağrılmaz).
 */
async function migrateIntegrationConfig({ db, apply, now = () => new Date(), catalogVersion, descriptors, classify }) {
    const effectiveDescriptors = descriptors ?? loadDescriptors();
    const effectiveClassify = classify ?? loadDist('integration/config/migrationClassifier.js').buildMigrationReport;

    const reports = await buildReports({ db, descriptors: effectiveDescriptors, classify: effectiveClassify });
    const written = [];
    const skipped = [];

    for (const r of reports) {
        if (!r.code) { skipped.push({ code: r.code, reason: 'code_missing' }); continue; }

        const overrides = {};
        for (const key of r.migratableHostOverrides) {
            const cls = r.urls.find((u) => u.key === key);
            if (cls && cls.host) overrides[`endpoints.${key}.host`] = cls.host;
        }
        if (r.viewFields.title !== undefined) overrides['view.title'] = r.viewFields.title;
        if (r.viewFields.color !== undefined) overrides['view.color'] = r.viewFields.color;
        if (r.viewFields.logo !== undefined) overrides['view.logo'] = r.viewFields.logo;

        if (Object.keys(overrides).length === 0) { skipped.push({ code: r.code, reason: 'nothing_to_migrate' }); continue; }

        const existingHead = await db.collection(HEADS_COLLECTION).findOne({ _id: r.code });
        if (existingHead) { skipped.push({ code: r.code, reason: 'head_already_exists' }); continue; }

        if (!apply) { written.push({ code: r.code, wouldWrite: Object.keys(overrides) }); continue; }

        const at = now();
        await db.collection(REVISIONS_COLLECTION).insertOne({
            target: r.code, version: 1, status: 'published', overrides,
            basedOnVersion: 0, catalogVersion, origin: { kind: 'migration' }, diff: [],
            createdBy: 'migration-tool', createdAt: at, draftRev: 0, publishedBy: 'migration-tool', publishedAt: at,
        });
        await db.collection(HEADS_COLLECTION).insertOne({ _id: r.code, publishedVersion: 1, intake: 'on', updatedAt: at });
        written.push({ code: r.code, wrote: Object.keys(overrides) });
    }

    return { apply: !!apply, reports, written, skipped };
}

module.exports = { buildReports, migrateIntegrationConfig, assertApplyConfirmed, loadDescriptors };

if (require.main === module) {
    runCli('migrate-integration-config', async ({ appDb, flags, env }) => {
        assertApplyConfirmed(flags.apply, env);
        const { CATALOG_VERSION } = loadDist('integration/config/catalog/index.js');
        const report = await migrateIntegrationConfig({ db: appDb, apply: flags.apply, catalogVersion: CATALOG_VERSION });
        const summary = report.reports.map((r) => ({ code: r.code, urls: r.urls.map((u) => ({ key: u.key, outcome: u.outcome, note: u.note })) }));
        console.log(JSON.stringify({ apply: report.apply, written: report.written, skipped: report.skipped, summary }, null, 2));
        if (!flags.apply) console.log('[migrate-integration-config] DRY-RUN: yazılmadı. Yazmak için --apply (+ INTEGRATION_CONFIG_MIGRATION_BACKUP_CONFIRMED=yes).');
    });
}
