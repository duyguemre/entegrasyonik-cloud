'use strict';
/**
 * ADR-0008 §2 / ADR-0014 S4a — `Plans` koleksiyonunu tek doğruluk kaynağı seed dosyasından
 * (`src/database/application/seed/plans.seed.json`) besler. İDEMPOTENT: aynı dosyayla ikinci çalıştırma hiçbir şey yazmaz.
 *
 * Fiyat/limit değerleri ÖNERİDİR (dosyadaki `_meta.status`); nihai değerler insan kararıdır (Protokol 12).
 *
 * VARSAYILAN = DRY-RUN (yazmaz). Yazma: AÇIK `--apply`. Koruma zinciri (CLAUDE.md kural 2/3 + `_migrationCommon.js`):
 *  - hedef DB adı izinli 7 DB listesinde değilse REDDEDİLİR (bağlantı bile açılmaz; `assertAllowedDb`),
 *  - varsayılan olarak yalnızca local 127.0.0.1 (uzak/Atlas için `--allow-remote` + insan onayı),
 *  - `--apply` için `SEED_PLANS_BACKUP_CONFIRMED=yes` env'i ŞART (yedek doğrulandı beyanı — `backup/README.md`).
 * Kural: mevcut belgede `version` seed'den BÜYÜKSE dokunulmaz (`skipped_newer`; elle yükseltilmiş plan geri alınmaz).
 * `providerRefs` yalnızca ilk eklemede boş yazılır (sağlayıcı adaptörünün yazdığı değer EZİLMEZ).
 * Çıktıda bağlantı dizesi/sır YOK.
 *
 * Kullanım:  cd backend && npm run seed:plans [-- [appDbName] [--apply] [--allow-remote]]
 */
const path = require('path');
const { ALLOWED_DBS, isAllowedDb, runCli } = require('./_migrationCommon');

const SEED_PATH = path.join(__dirname, '..', 'src', 'database', 'application', 'seed', 'plans.seed.json');
const PLANS_COLLECTION = 'Plans';
const LIMIT_KEYS = ['channels', 'skus', 'users', 'mcpCallsPerDay'];
const MANAGED_FIELDS = ['name', 'version', 'interval', 'priceMinor', 'currency', 'vatIncluded', 'limits', 'features', 'active', 'public'];

/** İzinli 7 DB dışına yazmayı reddeden koruma (bağlantıdan ÖNCE de çağrılır). */
function assertAllowedDb(name) {
    if (!isAllowedDb(name)) {
        throw new Error('Hedef DB adı izinli listede değil (' + ALLOWED_DBS.length + ' izinli DB dışında çalışılmaz).');
    }
    return name;
}

function loadSeed(file = SEED_PATH) {
    return JSON.parse(require('fs').readFileSync(file, 'utf8'));
}

/** Seed şemasını doğrular; hata listesi döner (boşsa geçerli). */
function validateSeed(seed) {
    const errors = [];
    if (!seed || typeof seed !== 'object') return ['seed nesne değil'];
    if (!seed._meta || typeof seed._meta.status !== 'string' || !seed._meta.status.includes('ÖNERİ')) {
        errors.push('_meta.status "ÖNERİ" işaretini taşımalı (fiyatlar insan kararı bekliyor)');
    }
    if (!Array.isArray(seed.plans) || seed.plans.length === 0) return errors.concat('plans boş/dizi değil');
    const codes = new Set();
    for (const p of seed.plans) {
        const id = p && p.code;
        if (typeof id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(id)) { errors.push('geçersiz plan kodu: ' + String(id)); continue; }
        if (codes.has(id)) errors.push('yinelenen plan kodu: ' + id);
        codes.add(id);
        if (typeof p.name !== 'string' || !p.name) errors.push(id + ': name');
        if (!Number.isInteger(p.version) || p.version < 1) errors.push(id + ': version');
        if (p.interval !== 'month' && p.interval !== 'year') errors.push(id + ': interval');
        if (!Number.isInteger(p.priceMinor) || p.priceMinor < 0) errors.push(id + ': priceMinor kuruş cinsinden tamsayı >= 0 olmalı');
        if (p.currency !== 'TRY') errors.push(id + ': currency');
        if (typeof p.vatIncluded !== 'boolean') errors.push(id + ': vatIncluded');
        if (typeof p.active !== 'boolean' || typeof p.public !== 'boolean') errors.push(id + ': active/public');
        if (!Array.isArray(p.features) || p.features.some(f => typeof f !== 'string')) errors.push(id + ': features');
        if (!p.limits || LIMIT_KEYS.some(k => !Number.isFinite(p.limits[k]) || p.limits[k] < 0)) errors.push(id + ': limits');
    }
    if (seed.trial) {
        if (!codes.has(seed.trial.planCode)) errors.push('trial.planCode seed içinde tanımlı bir plan olmalı');
        if (!Number.isInteger(seed.trial.days) || seed.trial.days < 1) errors.push('trial.days');
    }
    return errors;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Saf planlama: mevcut belgeler + seed -> her plan için eylem. Yan etkisiz.
 * created | updated | unchanged | skipped_newer
 */
function planSeed(seed, existingByCode) {
    return seed.plans.map((p) => {
        const cur = existingByCode[p.code];
        if (!cur) return { code: p.code, action: 'created' };
        if (Number.isInteger(cur.version) && cur.version > p.version) return { code: p.code, action: 'skipped_newer' };
        const drift = MANAGED_FIELDS.filter(f => !same(cur[f], p[f]));
        return drift.length ? { code: p.code, action: 'updated', fields: drift } : { code: p.code, action: 'unchanged' };
    });
}

/**
 * `db`: MongoDB Db benzeri ({ collection(name) -> { find(filter).toArray() | findOne, updateOne } }). Testlerde sahte.
 * `apply` false ise HİÇBİR yazma yapılmaz.
 */
async function seedPlans({ db, dbName, seed, apply = false, now = () => new Date() }) {
    assertAllowedDb(dbName);
    const errors = validateSeed(seed);
    if (errors.length) throw new Error('Seed dosyası geçersiz: ' + errors.join('; '));

    const col = db.collection(PLANS_COLLECTION);
    const existingByCode = {};
    for (const p of seed.plans) {
        const cur = await col.findOne({ code: p.code });
        if (cur) existingByCode[p.code] = cur;
    }
    const plan = planSeed(seed, existingByCode);
    const report = { dbName, apply, results: plan, counts: { created: 0, updated: 0, unchanged: 0, skipped_newer: 0 } };
    for (const r of plan) report.counts[r.action]++;

    if (apply) {
        const ts = now();
        for (const r of plan) {
            if (r.action !== 'created' && r.action !== 'updated') continue;
            const p = seed.plans.find(x => x.code === r.code);
            const $set = { updatedAt: ts };
            for (const f of MANAGED_FIELDS) $set[f] = p[f];
            await col.updateOne(
                { code: p.code },
                { $set, $setOnInsert: { providerRefs: {}, createdAt: ts } },
                { upsert: true },
            );
        }
    }
    return report;
}

module.exports = { SEED_PATH, ALLOWED_DBS, assertAllowedDb, loadSeed, validateSeed, planSeed, seedPlans };

if (require.main === module) {
    runCli('seed-plans', async ({ appDb, flags, env }) => {
        if (flags.apply && env.SEED_PLANS_BACKUP_CONFIRMED !== 'yes') {
            throw new Error('--apply için doğrulanmış yedek beyanı gerekli: SEED_PLANS_BACKUP_CONFIRMED=yes (backup/README.md; CLAUDE.md kural 3).');
        }
        const report = await seedPlans({ db: appDb, dbName: appDb.databaseName, seed: loadSeed(), apply: flags.apply });
        console.log(JSON.stringify(report, null, 2));
        if (!flags.apply) console.log('DRY-RUN: yazılmadı. Yazmak için --apply (+ SEED_PLANS_BACKUP_CONFIRMED=yes).');
    });
}
