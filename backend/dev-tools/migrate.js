'use strict';
/**
 * ============================================================================================
 * ADR-0021 Karar 4 — GENEL göç çalıştırıcısı (`backend/migrations/NNNN-<kısa-ad>.js`).
 *
 * Komutlar: `status` · `plan [id]` (varsayılan, DRY-RUN, SALT-OKUMA) · `up <id|--all> --apply` ·
 * `down <id> --apply`.
 *
 * Korumalar (CLAUDE.md kural 1-6; ADR-0021 Karar 4 metniyle BİREBİR):
 *  - İzinli 7 DB dışındaki her DB atlanır/reddedilir (`_migrationCommon.isAllowedDb`).
 *  - Varsayılan yalnız `127.0.0.1`; uzak/Atlas için açık `--allow-remote` (+ insan onayı, Protokol 12).
 *  - `--apply` için `--backup-ref <backup/altındaki yol>` ZORUNLU; `docs/DB_BACKUP_VERIFICATION*.md`
 *    doğrulama kaydı yoksa veya ≤24 saat taze değilse REDDEDİLİR (`_migrationCommon.assertFreshBackupRef`).
 *  - `contract` türü / `irreversible:true` işaretli göçler için ek `--i-understand-irreversible`.
 *  - Sır/URL/bağlantı bilgisi ASLA yazdırılmaz (`redactMessage`).
 *  - Eşzamanlı çalıştırma: `@utils/mongoLease` (C23 düzeltmeli `acquireLease`/`releaseLease`) — `JobLeases`
 *    koleksiyonunda `name: 'schema-migration:<id>'` anahtarlı kilit. [TASARIM NOTU] `SchemaMigrations.lease`
 *    alanı ADR metnine sadık AYRICA saklanır ama yalnız GÖZLEM amaçlıdır; mongoLease'in kendisi ÜST-DÜZEY
 *    `leaseOwner/leaseUntil` alanlı bir belge (`JobLeases`) üzerinde çalışır (bkz. `models/SchemaMigration.ts`
 *    dosya başı not + görev raporu — bu bir ADR belirsizliği/çelişkisidir, D3'ü YENİDEN TASARLAMAZ).
 *
 * Bu dosya İKİ KATMANDAN oluşur: (1) SAF/test edilebilir orkestrasyon fonksiyonları (Mongo YOK; `ctx`/`store`
 * enjekte edilir) — birim testleri bunları çağırır; (2) `require.main === module` bloğu: GERÇEK Mongo'ya
 * bağlanan CLI. Yalnız (2) gerçek ağ/DB kullanır.
 * ============================================================================================
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { protectOwnedFromToDrop } = require('./_migrationOwnedIndexes');
const {
    loadEnv, isAllowedDb, buildConnectionUrl, redactMessage, loadDist, assertFreshBackupRef,
} = require('./_migrationCommon');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATION_ID_RE = /^(\d{4}-[a-z0-9-]+)\.js$/;
const VALID_KINDS = ['index', 'expand', 'migrate', 'contract'];
const VALID_SCOPES = ['app', 'tenant', 'both'];
const DEFAULT_RUNNER_LEASE_TTL_MS = 10 * 60 * 1000; // 10 dk

// ------------------------------------------------------------------------------------------------
// Göç dosyası keşfi / doğrulama / checksum
// ------------------------------------------------------------------------------------------------

function listMigrationFiles(dir = MIGRATIONS_DIR) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => MIGRATION_ID_RE.test(f)).sort();
}

function validateMigrationShape(mod, file) {
    const required = ['id', 'scope', 'kind', 'description', 'plan', 'up'];
    for (const k of required) {
        if (mod[k] === undefined || mod[k] === null) throw new Error(`${file}: '${k}' eksik.`);
    }
    if (mod.id !== file.replace(/\.js$/, '')) throw new Error(`${file}: 'id' (${mod.id}) dosya adıyla eşleşmiyor.`);
    if (!VALID_SCOPES.includes(mod.scope)) throw new Error(`${file}: geçersiz scope '${mod.scope}'.`);
    if (!VALID_KINDS.includes(mod.kind)) throw new Error(`${file}: geçersiz kind '${mod.kind}'.`);
    if (typeof mod.plan !== 'function' || typeof mod.up !== 'function') throw new Error(`${file}: 'plan'/'up' fonksiyon olmalı.`);
    if (!mod.irreversible && typeof mod.down !== 'function') {
        throw new Error(`${file}: 'down' yok ve 'irreversible:true' işaretlenmemiş.`);
    }
    if (mod.down !== undefined && typeof mod.down !== 'function') throw new Error(`${file}: 'down' fonksiyon olmalı.`);
}

function computeChecksum(fileContent) {
    return crypto.createHash('sha256').update(fileContent).digest('hex');
}

/** Tek bir göç dosyasını yükler + doğrular + checksum'ını hesaplar. `requireFn` test için enjekte edilebilir. */
function loadMigrationFile(file, dir = MIGRATIONS_DIR, requireFn = require) {
    const full = path.join(dir, file);
    const content = fs.readFileSync(full);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const mod = requireFn(full);
    validateMigrationShape(mod, file);
    return { ...mod, __file: file, __path: full, __checksum: computeChecksum(content) };
}

/** Tüm `backend/migrations/NNNN-*.js` dosyalarını sıralı yükler. */
function discoverMigrations(dir = MIGRATIONS_DIR) {
    return listMigrationFiles(dir).map((f) => loadMigrationFile(f, dir));
}

function findMigration(migrations, id) {
    const m = migrations.find((x) => x.id === id);
    if (!m) throw new Error(`Göç bulunamadı: '${id}'.`);
    return m;
}

// ------------------------------------------------------------------------------------------------
// Checksum mandalı (Karar 5.3.f): uygulanmış göçün dosyası DEĞİŞTİYSE çalıştırıcı DURUR.
// ------------------------------------------------------------------------------------------------

function assertChecksumMandal(existingRecord, migration) {
    if (existingRecord && existingRecord.checksum && existingRecord.checksum !== migration.__checksum) {
        throw new Error(
            `[migrate] '${migration.id}' dosyası UYGULANDIKTAN SONRA değişmiş (checksum uyuşmuyor). `
            + 'Uygulanmış göç dosyaları DEĞİŞTİRİLMEZ; düzeltme YENİ bir göç dosyasıdır (ADR-0021 Karar 4).',
        );
    }
}

// ------------------------------------------------------------------------------------------------
// CLI argüman ayrıştırma (migrate.js'e özel — `_migrationCommon.parseArgs` eski tekil-DB betiklerine özeldir)
// ------------------------------------------------------------------------------------------------

function parseMigrateArgs(argv) {
    const [cmd, ...rest] = argv;
    const flags = {
        cmd, id: undefined, all: false, apply: false, allowRemote: false,
        backupRef: undefined, understandIrreversible: false, dbName: undefined, unknown: [],
    };
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === '--all') flags.all = true;
        else if (a === '--apply') flags.apply = true;
        else if (a === '--allow-remote') flags.allowRemote = true;
        else if (a === '--i-understand-irreversible') flags.understandIrreversible = true;
        else if (a === '--backup-ref') flags.backupRef = rest[++i];
        else if (a.startsWith('--backup-ref=')) flags.backupRef = a.slice('--backup-ref='.length);
        else if (a === '--db') flags.dbName = rest[++i];
        else if (a.startsWith('--db=')) flags.dbName = a.slice('--db='.length);
        else if (a.startsWith('--')) flags.unknown.push(a);
        else if (!flags.id) flags.id = a;
    }
    return flags;
}

// ------------------------------------------------------------------------------------------------
// Hedef çözümleme: scope='app' -> [appCtx]; 'tenant'/'both' -> tenant listesi + (both için) appCtx.
// `ctxFactory({scope, clientId?, dbname})` gerçek/test bağlantısını üretir (enjekte edilir).
// ------------------------------------------------------------------------------------------------

async function buildTargets(migration, { appDbname, tenants, ctxFactory }) {
    const targets = [];
    if (migration.scope === 'app' || migration.scope === 'both') {
        targets.push(await ctxFactory({ scope: 'app', dbname: appDbname }));
    }
    if (migration.scope === 'tenant' || migration.scope === 'both') {
        for (const t of tenants || []) {
            targets.push(await ctxFactory({ scope: 'tenant', clientId: t.clientId, dbname: t.dbname }));
        }
    }
    return targets;
}

/** `Clients` (status ≠ PURGED) ∩ izinli-DB listesi (Karar 4 "tenant başına strateji"). SALT-OKUMA. */
async function resolveTenantList(clientsCollection) {
    const docs = await clientsCollection
        .find({ status: { $ne: 'PURGED' } }, { projection: { order: 1, clientId: 1, 'dbConfig.dbname': 1 } })
        .toArray();
    const out = [];
    for (const d of docs) {
        const dbname = d.dbConfig && d.dbConfig.dbname;
        const clientId = typeof d.order === 'number' ? d.order : d.clientId;
        if (!isAllowedDb(dbname)) continue; // izinli 7 DB dışı ATLA (kural 2)
        if (typeof clientId !== 'number') continue;
        out.push({ clientId, dbname });
    }
    return out;
}

// ------------------------------------------------------------------------------------------------
// plan (DRY-RUN, SALT-OKUMA)
// ------------------------------------------------------------------------------------------------

async function planMigration(migration, targets) {
    const results = [];
    for (const t of targets) {
        // Göç-sahipli (manifest dışı) indeksler hiçbir göçün `toDrop` raporunda görünmez (_migrationOwnedIndexes.js).
        const report = protectOwnedFromToDrop(await migration.plan(t.ctx));
        results.push({ scope: t.ctx.scope, dbname: t.ctx.dbname, clientId: t.ctx.clientId, report });
    }
    return { id: migration.id, kind: migration.kind, scope: migration.scope, targets: results };
}

// ------------------------------------------------------------------------------------------------
// up / down (yalnız `--apply` onaylanmış çağırandan çağrılır — bu fonksiyonlar apply'ı VARSAYAR)
// `store`: {getRecord(id), startRun(doc), finishRun(id,patch), upsertTenantProgress(id,clientId,patch)}
// ------------------------------------------------------------------------------------------------

async function runDirection(direction, migration, targets, { store, appliedBy, backupRef, now = () => new Date() }) {
    const fn = direction === 'up' ? migration.up : migration.down;
    if (typeof fn !== 'function') throw new Error(`[migrate] '${migration.id}': '${direction}' fonksiyonu yok.`);

    const existing = await store.getRecord(migration.id);
    assertChecksumMandal(existing, migration);

    await store.startRun({
        id: migration.id,
        checksum: migration.__checksum,
        kind: migration.kind,
        scope: migration.scope,
        status: 'running',
        startedAt: now(),
        appliedBy,
        backupRef,
        tenants: targets
            .filter((t) => t.ctx.scope === 'tenant')
            .map((t) => ({ clientId: t.ctx.clientId, dbname: t.ctx.dbname, status: 'pending', processed: 0 })),
    });

    const perTarget = [];
    let anyFailed = false;
    let anySucceeded = false;
    for (const t of targets) {
        try {
            const result = await fn(t.ctx);
            anySucceeded = true;
            perTarget.push({ scope: t.ctx.scope, dbname: t.ctx.dbname, clientId: t.ctx.clientId, status: 'done', result });
            if (t.ctx.scope === 'tenant') {
                await store.upsertTenantProgress(migration.id, t.ctx.clientId, { status: 'done', finishedAt: now() });
            }
        } catch (e) {
            anyFailed = true;
            const errMsg = redactMessage(e).slice(0, 500);
            perTarget.push({ scope: t.ctx.scope, dbname: t.ctx.dbname, clientId: t.ctx.clientId, status: 'failed', error: errMsg });
            if (t.ctx.scope === 'tenant') {
                await store.upsertTenantProgress(migration.id, t.ctx.clientId, { status: 'failed', error: errMsg, finishedAt: now() });
            }
            // Tenant döngüsü sürer (Karar 4: "Başarısız tenant failed işaretlenir, diğerleri sürer").
            // App-scope hedef başarısız olursa (tenant yok) döngüde başka hedef kalmaz, doğal olarak durur.
        }
    }

    const overallStatus = !anyFailed ? 'done' : (anySucceeded ? 'partial' : 'failed');
    await store.finishRun(migration.id, { status: overallStatus, finishedAt: now() });
    return { id: migration.id, direction, status: overallStatus, targets: perTarget };
}

const runUp = (migration, targets, opts) => runDirection('up', migration, targets, opts);
const runDown = (migration, targets, opts) => runDirection('down', migration, targets, opts);

// ------------------------------------------------------------------------------------------------
// status (SALT-OKUMA)
// ------------------------------------------------------------------------------------------------

async function statusReport(migrations, store) {
    const rows = [];
    for (const m of migrations) {
        const record = await store.getRecord(m.id);
        rows.push({
            id: m.id,
            kind: m.kind,
            scope: m.scope,
            applied: !!record,
            status: record ? record.status : 'pending',
            checksumMismatch: !!(record && record.checksum && record.checksum !== m.__checksum),
            tenants: record ? (record.tenants || []).map((t) => ({ clientId: t.clientId, status: t.status })) : [],
        });
    }
    return rows;
}

// ------------------------------------------------------------------------------------------------
// JobLease tabanlı eşzamanlı-çalıştırma kilidi (`@utils/mongoLease` OLDUĞU GİBİ tüketilir — bkz. dosya başı).
// ------------------------------------------------------------------------------------------------

/** Raw MongoDB `Collection` -> `@utils/mongoLease`'in beklediği `{findOneAndUpdate,updateOne}` arayüzüne adapte eder. */
function jobLeaseCollectionAdapter(collection) {
    return {
        async findOneAndUpdate(filter, update, options) {
            const returnDocument = options && options.new ? 'after' : 'before';
            return collection.findOneAndUpdate(filter, update, { returnDocument });
        },
        async updateOne(filter, update) {
            return collection.updateOne(filter, update);
        },
    };
}

async function acquireRunnerLease(jobLeaseCollection, migrationId, owner, { acquireLease, ttlMs = DEFAULT_RUNNER_LEASE_TTL_MS, now } = {}) {
    const name = `schema-migration:${migrationId}`;
    await jobLeaseCollection.updateOne(
        { name },
        { $setOnInsert: { name, leaseOwner: null, leaseUntil: null } },
        { upsert: true },
    );
    const adapter = jobLeaseCollectionAdapter(jobLeaseCollection);
    return acquireLease(adapter, { name }, owner, { ttlMs, now });
}

async function releaseRunnerLease(jobLeaseCollection, migrationId, owner, { releaseLease } = {}) {
    const name = `schema-migration:${migrationId}`;
    const adapter = jobLeaseCollectionAdapter(jobLeaseCollection);
    await releaseLease(adapter, { name }, owner);
}

// ------------------------------------------------------------------------------------------------
// `--i-understand-irreversible` kapısı (contract/irreversible göçler için).
// ------------------------------------------------------------------------------------------------

function assertIrreversibleUnderstood(migration, understood) {
    const needsFlag = migration.kind === 'contract' || migration.irreversible === true;
    if (needsFlag && !understood) {
        throw new Error(`[migrate] '${migration.id}' geri dönüşsüz (kind=${migration.kind}${migration.irreversible ? ', irreversible' : ''}); --i-understand-irreversible gerekli.`);
    }
}

module.exports = {
    MIGRATIONS_DIR,
    listMigrationFiles,
    validateMigrationShape,
    computeChecksum,
    loadMigrationFile,
    discoverMigrations,
    findMigration,
    assertChecksumMandal,
    parseMigrateArgs,
    buildTargets,
    resolveTenantList,
    planMigration,
    runUp,
    runDown,
    statusReport,
    jobLeaseCollectionAdapter,
    acquireRunnerLease,
    releaseRunnerLease,
    assertIrreversibleUnderstood,
};

// ==================================================================================================
// CLI (GERÇEK Mongo bağlantısı YALNIZ burada)
// ==================================================================================================
if (require.main === module) {
    (async () => {
        loadEnv();
        const flags = parseMigrateArgs(process.argv.slice(2));
        if (flags.unknown.length) {
            console.error('[migrate] Bilinmeyen bayrak: ' + flags.unknown.join(', '));
            process.exitCode = 1;
            return;
        }
        if (!['status', 'plan', 'up', 'down'].includes(flags.cmd)) {
            console.error('[migrate] Kullanım: migrate.js status | plan [id] | up <id|--all> --apply --backup-ref <yol> | down <id> --apply --backup-ref <yol>');
            process.exitCode = 1;
            return;
        }

        const appDbName = flags.dbName || process.env.DB_NAME || 'entegrasyonikDB';
        if (!isAllowedDb(appDbName)) {
            console.error('[migrate] Uygulama DB adı izinli listede değil.');
            process.exitCode = 1;
            return;
        }

        const mongoose = require('mongoose');
        const { acquireLease, releaseLease } = loadDist('utils/mongoLease.js');
        const { withDbName } = loadDist('database/tenantConnection.js');

        let appConnection;
        const tenantConnections = [];
        try {
            const url = buildConnectionUrl(process.env, appDbName, flags.allowRemote);
            appConnection = await mongoose.createConnection(url, { serverSelectionTimeoutMS: 5000 }).asPromise();
            const appDb = appConnection.db;

            const migrations = discoverMigrations();

            async function ctxFactory({ scope, clientId, dbname }) {
                let connection = appConnection;
                if (scope === 'tenant') {
                    const tenantUrl = withDbName(url, dbname)
                        .replace('{{USER}}', encodeURIComponent(process.env.DB_USER || ''))
                        .replace('{{PASSWORD}}', encodeURIComponent(process.env.DB_PASSWORD || ''))
                        .replace('{{DBNAME}}', dbname);
                    connection = await mongoose.createConnection(tenantUrl, { serverSelectionTimeoutMS: 5000 }).asPromise();
                    tenantConnections.push(connection);
                }
                return {
                    ctx: {
                        scope, clientId, dbname,
                        connection,
                        db: connection.db,
                        now: () => new Date(),
                        batchSize: 500,
                        throttleMs: 50,
                        log: (...a) => console.log('[migrate]', ...a),
                    },
                };
            }

            const store = {
                async getRecord(id) { return appDb.collection('SchemaMigrations').findOne({ _id: id }); },
                async startRun(doc) {
                    await appDb.collection('SchemaMigrations').updateOne(
                        { _id: doc.id },
                        { $set: { checksum: doc.checksum, kind: doc.kind, scope: doc.scope, status: doc.status, startedAt: doc.startedAt, appliedBy: doc.appliedBy, backupRef: doc.backupRef, tenants: doc.tenants } },
                        { upsert: true },
                    );
                },
                async finishRun(id, patch) {
                    await appDb.collection('SchemaMigrations').updateOne({ _id: id }, { $set: patch });
                },
                async upsertTenantProgress(id, clientId, patch) {
                    await appDb.collection('SchemaMigrations').updateOne(
                        { _id: id, 'tenants.clientId': clientId },
                        { $set: Object.fromEntries(Object.entries(patch).map(([k, v]) => [`tenants.$.${k}`, v])) },
                    );
                },
            };

            if (flags.cmd === 'status') {
                const rows = await statusReport(migrations, store);
                console.log(JSON.stringify(rows, null, 2));
                return;
            }

            if (flags.cmd === 'plan') {
                const clientsCollection = appDb.collection('Clients');
                const targetIds = flags.id ? [flags.id] : migrations.map((m) => m.id);
                const out = [];
                for (const id of targetIds) {
                    const migration = findMigration(migrations, id);
                    const tenants = (migration.scope === 'tenant' || migration.scope === 'both')
                        ? await resolveTenantList(clientsCollection) : [];
                    const targets = await buildTargets(migration, { appDbname: appDbName, tenants, ctxFactory });
                    out.push(await planMigration(migration, targets));
                }
                console.log(JSON.stringify(out, null, 2));
                console.log('[migrate] plan: DRY-RUN, hiçbir şey yazılmadı.');
                return;
            }

            // up / down: --apply zorunlu
            if (!flags.apply) {
                console.error(`[migrate] '${flags.cmd}' için --apply zorunlu (varsayılan güvenli mod yalnız 'plan'dır).`);
                process.exitCode = 1;
                return;
            }
            if (!flags.all && !flags.id) {
                console.error(`[migrate] '${flags.cmd} <id>' ya da 'up --all' gerekli.`);
                process.exitCode = 1;
                return;
            }
            assertFreshBackupRef(flags.backupRef);

            const ids = flags.all ? migrations.map((m) => m.id) : [flags.id];
            const owner = `${process.env.POD_NAME || 'local'}:${process.pid}`;
            const appliedBy = process.env.POD_NAME || process.env.USERNAME || process.env.USER || 'unknown-host';

            for (const id of ids) {
                const migration = findMigration(migrations, id);
                if (flags.cmd === 'down') assertIrreversibleUnderstood(migration, flags.understandIrreversible);

                const jobLeaseCollection = appDb.collection('JobLeases');
                const lease = await acquireRunnerLease(jobLeaseCollection, id, owner, { acquireLease });
                if (!lease) {
                    console.error(`[migrate] '${id}' için kilit alınamadı (başka bir çalıştırma sürüyor).`);
                    process.exitCode = 1;
                    continue;
                }
                try {
                    // Karar 4 `lease` alanı: yalnız GÖZLEM (bkz. dosya başı not) — best-effort.
                    await appDb.collection('SchemaMigrations').updateOne(
                        { _id: id }, { $set: { lease: { owner, until: lease.leaseUntil } } }, { upsert: true },
                    );
                    const clientsCollection = appDb.collection('Clients');
                    const tenants = (migration.scope === 'tenant' || migration.scope === 'both')
                        ? await resolveTenantList(clientsCollection) : [];
                    const targets = await buildTargets(migration, { appDbname: appDbName, tenants, ctxFactory });
                    const runner = flags.cmd === 'up' ? runUp : runDown;
                    const result = await runner(migration, targets, { store, appliedBy, backupRef: flags.backupRef });
                    console.log(JSON.stringify(result, null, 2));
                } finally {
                    await releaseRunnerLease(jobLeaseCollection, id, owner, { releaseLease });
                }
            }
        } catch (e) {
            console.error('[migrate] hata:', redactMessage(e));
            process.exitCode = 1;
        } finally {
            for (const c of tenantConnections) await c.close().catch(() => undefined);
            if (appConnection) await appConnection.close().catch(() => undefined);
        }
    })();
}
