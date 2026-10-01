'use strict';
/**
 * ADR-0008 §2 "Legacy (mevcut canlı tenant'lar)" satırı + "Mevcut tenant'lar bozulmaz: geçiş migration'ı onlara `legacy` plan +
 * `active` + `billingExempt` atar": `Clients` koleksiyonundaki MEVCUT (ACTIVE) tenant'lar için, aboneliği olmayanlara
 * `Subscriptions` kaydı yazar: { planCode:'legacy', status:'active', billingExempt:true, provider:'legacy' }.
 * `billingExempt:true` tenant'lar `EntitlementService`'te her zaman tam erişimlidir ve `TrialExpiryJob` onlara dokunmaz.
 *
 * KURALLAR
 *  - Yalnızca `status === 'ACTIVE'` tenant'lar taşınır. PROVISIONING/PROVISIONING_FAILED (kayıt akışı `trialing` aboneliği kendisi
 *    açar), DELETION_PENDING/PURGING/PURGED vb. ATLANIR (`skipped_status`; yalnızca durum ADI sayılarak raporlanır).
 *  - Aboneliği ZATEN olan tenant'a (trialing dahil) ASLA dokunulmaz (`skipped_existing`) — mevcut abonelik ezilmez/yükseltilmez.
 *  - `Plans` koleksiyonuna YAZMAZ: `legacy` plan belgesi gerekmez (billingExempt sınırsızdır; `EntitlementService.loadLimits`
 *    billingExempt için Plans'a bakmaz). Fiyat/limit değerleri insan kararıdır (Protokol 12).
 *  - İDEMPOTENT: `$setOnInsert` upsert + BillingEvents idempotency anahtarı `legacy-migration:<clientId>`; ikinci çalıştırma hiçbir şey yazmaz.
 *  - Denetim: her taşınan tenant için `BillingEvents` kaydı (provider:'system', type:'subscription.legacy_migrated').
 *  - Çıktıda yalnızca sayılar ve clientId (sayı) bulunur; tenant adı/unvanı/bağlantı dizesi/sır YOK.
 *
 * VARSAYILAN = DRY-RUN (yazmaz). Yazma: AÇIK `--apply`. Koruma zinciri (CLAUDE.md kural 2/3 + `_migrationCommon.js`; `seed-plans.js` ile AYNI):
 *  - hedef DB adı izinli 7 DB listesinde değilse REDDEDİLİR (bağlantı bile açılmaz; `assertAllowedDb`),
 *  - varsayılan olarak yalnızca local 127.0.0.1 (uzak/Atlas için `--allow-remote` + insan onayı),
 *  - `--apply` için `LEGACY_MIGRATION_BACKUP_CONFIRMED=yes` env'i ŞART (yedek doğrulandı beyanı — `backup/README.md`).
 * Not: `Subscriptions.clientId` unique indeksi (Subscription.ts) hedef DB'de kurulu olmalıdır (uygulama başlangıcında autoIndex);
 * yoksa eşzamanlı iki çalıştırma teorik olarak çift kayıt üretebilir — tek seferlik elle çalıştırılan araç olduğundan kabul edildi.
 *
 * Kullanım:  cd backend && npm run migrate:legacy-subscriptions [-- [appDbName] [--apply] [--allow-remote]]
 */
const { ALLOWED_DBS, isAllowedDb, runCli } = require('./_migrationCommon');

const CLIENTS_COLLECTION = 'Clients';
const SUBSCRIPTIONS_COLLECTION = 'Subscriptions';
const BILLING_EVENTS_COLLECTION = 'BillingEvents';

const LEGACY_PLAN_CODE = 'legacy';
const LEGACY_PLAN_VERSION = 1;
const LEGACY_PROVIDER = 'legacy';
const EVENT_PROVIDER = 'system';
const EVENT_TYPE = 'subscription.legacy_migrated';
const MIGRATABLE_STATUS = 'ACTIVE';

/** İzinli 7 DB dışına yazmayı reddeden koruma (bağlantıdan ÖNCE de çağrılır). */
function assertAllowedDb(name) {
    if (!isAllowedDb(name)) {
        throw new Error('Hedef DB adı izinli listede değil (' + ALLOWED_DBS.length + ' izinli DB dışında çalışılmaz).');
    }
    return name;
}

/** `--apply` için doğrulanmış yedek beyanı ŞARTI (CLAUDE.md kural 3). */
function assertApplyConfirmed(apply, env) {
    if (apply && (!env || env.LEGACY_MIGRATION_BACKUP_CONFIRMED !== 'yes')) {
        throw new Error('--apply için doğrulanmış yedek beyanı gerekli: LEGACY_MIGRATION_BACKUP_CONFIRMED=yes (backup/README.md; CLAUDE.md kural 3).');
    }
}

/**
 * Saf planlama (yan etkisiz): Clients + mevcut Subscriptions -> tenant başına eylem.
 * create | skipped_existing | skipped_status | skipped_invalid
 */
function planMigration(clients, subscriptions) {
    const hasSub = new Set((subscriptions || []).map(s => s && s.clientId));
    const seen = new Set();
    const results = [];
    for (const c of clients || []) {
        const clientId = c && c.clientId;
        if (!Number.isInteger(clientId) || seen.has(clientId)) { results.push({ clientId: Number.isInteger(clientId) ? clientId : null, action: 'skipped_invalid' }); continue; }
        seen.add(clientId);
        if (c.status !== MIGRATABLE_STATUS) { results.push({ clientId, action: 'skipped_status', status: String(c.status) }); continue; }
        if (hasSub.has(clientId)) { results.push({ clientId, action: 'skipped_existing' }); continue; }
        results.push({ clientId, action: 'create' });
    }
    return results;
}

function buildSubscriptionDoc(clientId, ts) {
    return {
        clientId,
        planCode: LEGACY_PLAN_CODE,
        planVersion: LEGACY_PLAN_VERSION,
        status: 'active',
        cancelAtPeriodEnd: false,
        billingExempt: true,
        provider: LEGACY_PROVIDER,
        createdAt: ts,
        updatedAt: ts,
    };
}

/**
 * `db`: MongoDB Db benzeri ({ collection(name) -> { find(filter, opts).toArray(), updateOne(filter, update, opts) } }). Testlerde sahte.
 * `apply` false ise HİÇBİR yazma yapılmaz.
 */
async function migrateLegacyTenants({ db, dbName, apply = false, now = () => new Date() }) {
    assertAllowedDb(dbName);

    const clients = await db.collection(CLIENTS_COLLECTION).find({}, { projection: { clientId: 1, status: 1 } }).toArray();
    const subscriptions = await db.collection(SUBSCRIPTIONS_COLLECTION).find({}, { projection: { clientId: 1 } }).toArray();
    const results = planMigration(clients, subscriptions);

    const counts = { create: 0, skipped_existing: 0, skipped_status: 0, skipped_invalid: 0 };
    const skippedStatuses = {};
    for (const r of results) {
        counts[r.action]++;
        if (r.action === 'skipped_status') skippedStatuses[r.status] = (skippedStatuses[r.status] || 0) + 1;
    }
    const report = { dbName, apply, counts, skippedStatuses, results: results.map(({ clientId, action }) => ({ clientId, action })) };

    if (apply) {
        const ts = now();
        const subs = db.collection(SUBSCRIPTIONS_COLLECTION);
        const events = db.collection(BILLING_EVENTS_COLLECTION);
        report.written = { created: 0, raced_existing: 0 };
        for (const r of results) {
            if (r.action !== 'create') continue;
            const res = await subs.updateOne({ clientId: r.clientId }, { $setOnInsert: buildSubscriptionDoc(r.clientId, ts) }, { upsert: true });
            const inserted = !!res && (res.upsertedCount > 0 || !!res.upsertedId);
            if (!inserted) { report.written.raced_existing++; continue; } // planlama ile yazma arasında başka bir kayıt oluştu: dokunulmadı
            report.written.created++;
            await events.updateOne(
                { provider: EVENT_PROVIDER, providerEventId: 'legacy-migration:' + r.clientId },
                {
                    $setOnInsert: {
                        provider: EVENT_PROVIDER,
                        providerEventId: 'legacy-migration:' + r.clientId,
                        type: EVENT_TYPE,
                        clientId: r.clientId,
                        receivedAt: ts,
                        processedAt: ts,
                        status: 'processed',
                        payloadRedacted: { to: 'active', planCode: LEGACY_PLAN_CODE, billingExempt: true, reason: 'legacy_tenant_migration' },
                    },
                },
                { upsert: true },
            );
        }
    }
    return report;
}

module.exports = {
    ALLOWED_DBS, LEGACY_PLAN_CODE, LEGACY_PROVIDER, EVENT_TYPE,
    assertAllowedDb, assertApplyConfirmed, planMigration, buildSubscriptionDoc, migrateLegacyTenants,
};

if (require.main === module) {
    runCli('migrate-legacy-tenants-to-subscriptions', async ({ appDb, flags, env }) => {
        assertApplyConfirmed(flags.apply, env);
        const report = await migrateLegacyTenants({ db: appDb, dbName: appDb.databaseName, apply: flags.apply });
        console.log(JSON.stringify(report, null, 2));
        if (!flags.apply) console.log('DRY-RUN: yazılmadı. Yazmak için --apply (+ LEGACY_MIGRATION_BACKUP_CONFIRMED=yes).');
    });
}
