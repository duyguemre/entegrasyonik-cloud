'use strict';
/**
 * ADR-0003 adım 5-6 göç betikleri için ORTAK yardımcılar (değer içermez; yalnızca kural/akış).
 *
 * Kurallar (CLAUDE.md): yalnızca izinli 7 DB; VARSAYILAN olarak yalnızca local 127.0.0.1 (uzak/Atlas için açık `--allow-remote` +
 * insan onayı; yedek şartı CLAUDE.md kural 3); DB kimlik bilgisi/URL/sır DEĞERİ çıktıya ASLA yazılmaz; varsayılan DRY-RUN.
 */
const path = require('path');

const ALLOWED_DBS = [
    'entegrasyonik', 'entegrasyonik_client', 'entegrasyonik_client_2', 'entegrasyonik_client_24',
    'entegrasyonik_client_25', 'entegrasyonikClient_1', 'entegrasyonikDB',
];

function loadEnv() {
    try { require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true }); } catch (_) { /* dotenv yok: ortam değişkenleri kullanılır */ }
}

/** `--apply` (yazma), `--rotate` (yalnız şifreleme betiği), `--allow-remote`, `--rollback-plan` (yalnız URL göçü, yazmaz); diğer (bayraksız) ilk argüman = uygulama DB adı. */
function parseArgs(argv) {
    const flags = { apply: false, rotate: false, allowRemote: false, rollbackPlan: false, dbName: undefined, unknown: [] };
    for (const a of argv) {
        if (a === '--apply') flags.apply = true;
        else if (a === '--rotate') flags.rotate = true;
        else if (a === '--allow-remote') flags.allowRemote = true;
        else if (a === '--rollback-plan') flags.rollbackPlan = true; // yalnız migrate-trendyol-integration-urls.js kullanır (yazmaz)
        else if (a === '--confirm-backup') flags.confirmBackup = true; // yalnız clean-tenant-url-settings.js (yedek beyanı)
        else if (a.startsWith('--')) flags.unknown.push(a);
        else if (!flags.dbName) flags.dbName = a;
    }
    return flags;
}

function redactMessage(e) {
    return e && e.message ? String(e.message).replace(/mongodb(\+srv)?:\/\/[^\s'"]*/g, 'mongodb://<gizli>') : 'bilinmiyor';
}

/** Env'den bağlantı URL'i (DB_URL/DB_USER/DB_PASSWORD; {{...}} yer tutucuları doldurulur). URL/parola ASLA yazdırılmaz. */
function buildConnectionUrl(env, appDbName, allowRemote) {
    const rawUrl = env.DB_URL || '';
    if (!rawUrl) throw new Error('DB_URL tanımlı değil.');
    if (!allowRemote && !/^mongodb:\/\/([^@/]*@)?(127\.0\.0\.1)(:\d+)?(\/|\?|$)/.test(rawUrl)) {
        throw new Error('Yalnızca local 127.0.0.1 bağlantısı kullanılır (uzak/Atlas için --allow-remote + insan onayı + doğrulanmış yedek gerekir).');
    }
    return rawUrl
        .replace('{{USER}}', encodeURIComponent(env.DB_USER || ''))
        .replace('{{PASSWORD}}', encodeURIComponent(env.DB_PASSWORD || ''))
        .replace('{{DBNAME}}', appDbName);
}

/** Derlenmiş (dist/) modülü yükler; yoksa anlaşılır hata (önce `npm run build`). */
function loadDist(relPath) {
    const full = path.join(__dirname, '..', 'dist', 'src', relPath);
    try { return require(full); } catch (e) {
        if (e && e.code === 'MODULE_NOT_FOUND') throw new Error('dist/src/' + relPath + ' bulunamadı: önce `npm run build` çalıştırın.');
        throw e;
    }
}

function isAllowedDb(name) { return typeof name === 'string' && ALLOWED_DBS.includes(name); }

/** ADR-0021 Karar 4: `--apply` öncesi doğrulanmış-taze-yedek şartı (CLAUDE.md kural 3). Yeni/genel göç
 * çalıştırıcısı (`dev-tools/migrate.js`) için buraya eklendi; mevcut 5 göç betiği kendi (daha basit)
 * `--confirm-backup`/`*_BACKUP_CONFIRMED` desenlerini kullanmaya devam eder (bu ekleme onları BOZMAZ). */
const MAX_BACKUP_AGE_HOURS = 24;

/** `docs/DB_BACKUP_VERIFICATION*.md` içindeki `**Tarih:** YYYY-AA-GG` ve `**Kaynak dump:**` satırlarını okur. */
function parseBackupVerificationRecord(markdown) {
    const dateMatch = markdown.match(/\*\*Tarih:\*\*\s*(\d{4}-\d{2}-\d{2})/);
    const sourceMatch = markdown.match(/\*\*Kaynak dump:\*\*\s*`([^`]+)`/);
    if (!dateMatch) return null;
    return { date: dateMatch[1], sourceDump: sourceMatch ? sourceMatch[1] : null };
}

/**
 * `--backup-ref <backup/altındaki yol>` doğrular: (1) yol var mı (fs var/klasör), (2) `docs/` altında bu yolu
 * REFERANS EDEN bir `DB_BACKUP_VERIFICATION*.md` doğrulama kaydı var mı, (3) kaydın tarihi `now`'a göre
 * `MAX_BACKUP_AGE_HOURS` (24 sa) içinde mi. Başarısızsa AÇIKLAYICI Error fırlatır (mesajda sır/URL YOK).
 * Test edilebilirlik için `fs`/`docsDir`/`repoRoot`/`now` enjekte edilebilir (`opts`).
 */
function assertFreshBackupRef(backupRef, opts) {
    const o = opts || {};
    const fsMod = o.fs || require('fs');
    const docsDir = o.docsDir || path.join(__dirname, '..', '..', 'docs');
    const repoRoot = o.repoRoot || path.join(__dirname, '..', '..');
    const now = (o.now || (() => new Date()))();

    if (!backupRef || typeof backupRef !== 'string') {
        throw new Error('--apply için --backup-ref <backup/altındaki yol> zorunlu (CLAUDE.md kural 3).');
    }
    const normalizedRef = backupRef.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
    if (!normalizedRef.startsWith('backup/')) {
        throw new Error('--backup-ref yalnızca "backup/" altındaki bir yolu gösterebilir.');
    }
    const backupAbsPath = require('path').join(repoRoot, normalizedRef);
    if (!fsMod.existsSync(backupAbsPath)) {
        throw new Error('--backup-ref yolu bulunamadı: ' + normalizedRef);
    }

    let docFiles = [];
    try {
        docFiles = fsMod.readdirSync(docsDir).filter((f) => /^DB_BACKUP_VERIFICATION.*\.md$/.test(f));
    } catch (_) { docFiles = []; }
    if (docFiles.length === 0) {
        throw new Error('docs/DB_BACKUP_VERIFICATION*.md doğrulama kaydı bulunamadı (yedek doğrulanmamış).');
    }

    let bestRecord = null;
    for (const f of docFiles) {
        let content = '';
        try { content = fsMod.readFileSync(require('path').join(docsDir, f), 'utf8'); } catch (_) { continue; }
        const rec = parseBackupVerificationRecord(content);
        if (!rec) continue;
        const src = rec.sourceDump ? rec.sourceDump.replace(/\/$/, '') : null;
        if (src && normalizedRef.indexOf(src) === -1 && src.indexOf(normalizedRef) === -1) {
            continue; // bu kayıt referans edilen yedeği ANLATMIYOR
        }
        if (!bestRecord || rec.date > bestRecord.date) bestRecord = rec;
    }
    if (!bestRecord) {
        throw new Error('--backup-ref için eşleşen bir DB_BACKUP_VERIFICATION kaydı (Kaynak dump satırı) bulunamadı.');
    }
    const recordDate = new Date(bestRecord.date + 'T00:00:00Z');
    const ageHours = (now.getTime() - recordDate.getTime()) / (1000 * 60 * 60);
    if (Number.isNaN(ageHours) || ageHours > MAX_BACKUP_AGE_HOURS || ageHours < -24) {
        throw new Error(`Yedek doğrulama kaydı taze değil (tarih: ${bestRecord.date}; eşik: ${MAX_BACKUP_AGE_HOURS} sa).`);
    }
    return { ok: true, record: bestRecord, backupAbsPath };
}

/**
 * Ortak CLI çerçevesi: env yükle, bayrakları ayrıştır, izinli-DB + local kontrolü, bağlan, `fn({ client, appDb, flags, env })` çalıştır, kapat.
 * Çıkış kodu: 0 = tamam, 1 = hata.
 */
async function runCli(title, fn) {
    loadEnv();
    const flags = parseArgs(process.argv.slice(2));
    let client;
    try {
        if (flags.unknown.length) throw new Error('Bilinmeyen bayrak: ' + flags.unknown.join(', '));
        const appDbName = flags.dbName || process.env.DB_NAME || '';
        if (!isAllowedDb(appDbName)) throw new Error('Uygulama DB adı izinli listede değil (7 izinli DB dışında çalışılmaz).');
        const url = buildConnectionUrl(process.env, appDbName, flags.allowRemote);
        const { MongoClient } = require('mongodb');
        client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
        await client.connect();
        console.log(`[${title}] mod: ${flags.apply ? 'APPLY (yazar)' : 'DRY-RUN (yazmaz)'}${flags.rotate ? ' + ROTATE' : ''}; uygulama DB: ${appDbName}`);
        await fn({ client, appDb: client.db(appDbName), flags, env: process.env });
    } catch (e) {
        console.error(`[${title}] hata:`, redactMessage(e));
        process.exitCode = 1;
    } finally {
        if (client) await client.close().catch(() => undefined);
    }
}

module.exports = {
    ALLOWED_DBS, loadEnv, parseArgs, redactMessage, buildConnectionUrl, loadDist, isAllowedDb, runCli,
    MAX_BACKUP_AGE_HOURS, parseBackupVerificationRecord, assertFreshBackupRef,
};
