'use strict';
/**
 * ADR-0028 WP-A2 — üyelik göçü (G0 precheck / E1 backfill / G1 cleanup) ORTAK mantığı.
 *
 * KURALLAR (CLAUDE.md): yalnızca izinli 7 DB (uygulama DB'si + tenant DB'leri src/database/tenantConnection.ts
 * `isAllowedTenantDbName` ile AYNI kural); varsayılan DRY-RUN/salt-okuma; yazma = `--apply` + `--i-have-verified-backup`
 * + taze doğrulanmış yedek kaydı (`--backup-ref`, kural 3); bağlantı URL/parola/e-posta DEĞERİ çıktıya yazılmaz (e-posta maskeli).
 * Bu dosya DB'ye kendisi bağlanmaz: çağıran `Db` nesneleri verir (testler bellek-içi Mongo verir).
 */
const fs = require('fs');
const path = require('path');
const common = require('./_migrationCommon');

const BCRYPT_RE = /^\$2[aby]\$/;
const APP_DB_NAMES = ['entegrasyonikDB'];
const KNOWN_TENANT_DB_NAMES = new Set([
    'entegrasyonik', 'entegrasyonik_client', 'entegrasyonik_client_2', 'entegrasyonik_client_24',
    'entegrasyonik_client_25', 'entegrasyonikClient_1',
]);
const PROVISIONED_TENANT_DB = /^entegrasyonikClient_[1-9]\d{0,8}$/;
const DBNAME_RE = /^[A-Za-z0-9_-]{1,63}$/;
const CREATED_BY = 'migration:0004';
const ADMIN_ROLE_CODES = ['ROLE_ADMIN', 'ROLE_OWNER'];
const SAMPLE_LIMIT = 10;

/** src/database/tenantConnection.ts `isAllowedTenantDbName` ile AYNI kural (parite testi: memberships.migration.test.ts). */
function isAllowedTenantDbName(name, appDbName) {
    if (typeof name !== 'string' || !DBNAME_RE.test(name)) return false;
    if (!KNOWN_TENANT_DB_NAMES.has(name) && !PROVISIONED_TENANT_DB.test(name)) return false;
    if (APP_DB_NAMES.includes(name) || (appDbName && name === appDbName)) return false;
    return true;
}

function maskEmail(email) {
    if (typeof email !== 'string' || !email.includes('@')) return '<e-posta-yok>';
    const [local, domain] = email.split('@');
    const dot = domain.lastIndexOf('.');
    const tld = dot > 0 ? domain.slice(dot) : '';
    return `${local.slice(0, 1)}***@${domain.slice(0, 1)}***${tld}`;
}

const normEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
const isBcryptHash = (p) => typeof p === 'string' && BCRYPT_RE.test(p);

/** ADR-0028 Karar 3 eşlemesi: owner:true -> owner; ROLE_ADMIN/ROLE_OWNER -> admin; diğer/bilinmeyen -> operator. */
function legacyRole(user) {
    if (user && user.owner === true) return 'owner';
    if (user && typeof user.roleCode === 'string' && ADMIN_ROLE_CODES.includes(user.roleCode)) return 'admin';
    return 'operator';
}

const tidOf = (u) => {
    const v = u.order !== undefined && u.order !== null ? u.order : u.clientId;
    const n = Number(v);
    return v === undefined || v === null || v === '' || Number.isNaN(n) ? null : n;
};

function parseMembershipArgs(argv) {
    const f = { apply: false, verifiedBackup: false, backupRef: undefined, confirmIrreversible: false, down: false,
        acceptOwnerless: false, writeReport: false, allowRemote: false, dbName: undefined, unknown: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply') f.apply = true;
        else if (a === '--dry-run') f.apply = false;
        else if (a === '--i-have-verified-backup') f.verifiedBackup = true;
        else if (a === '--backup-ref') f.backupRef = argv[++i];
        else if (a.startsWith('--backup-ref=')) f.backupRef = a.slice('--backup-ref='.length);
        else if (a === '--confirm-irreversible-unset') f.confirmIrreversible = true;
        else if (a === '--down') f.down = true;
        else if (a === '--accept-ownerless') f.acceptOwnerless = true;
        else if (a === '--write-report') f.writeReport = true;
        else if (a === '--allow-remote') f.allowRemote = true;
        else if (a.startsWith('--')) f.unknown.push(a);
        else if (!f.dbName) f.dbName = a;
    }
    return f;
}

/** Yazma kapısı (CLAUDE.md kural 3): --apply + --i-have-verified-backup + taze doğrulanmış yedek kaydı. Aksi halde FIRLATIR. */
function assertWriteApproval(flags, opts) {
    const o = opts || {};
    if (!flags.apply) throw new Error('Yazma için --apply gerekir (varsayılan dry-run).');
    if (!flags.verifiedBackup) throw new Error('--apply için --i-have-verified-backup zorunlu (CLAUDE.md kural 3).');
    const check = o.assertBackup || common.assertFreshBackupRef;
    check(flags.backupRef, o.backupOpts);
    return true;
}

/** Uygulama DB'sinden Clients + merkezi Users yükler (salt-okuma). */
async function loadCentral(appDb) {
    const clients = await appDb.collection('Clients').find({}, { projection: { order: 1, clientId: 1, status: 1, dbConfig: 1 } }).toArray();
    const users = await appDb.collection('Users').find({}, { projection: { email: 1, order: 1, clientId: 1, owner: 1, roleCode: 1, resources: 1, isActive: 1, isGlobalAdmin: 1, password: 1 } }).toArray();
    const byOrder = new Map();
    for (const c of clients) { const n = Number(c.order); if (!Number.isNaN(n)) byOrder.set(n, c); }
    return { clients, users, byOrder };
}

/** Bir kullanıcının üyelik hedefi: { ok, tid, reason } — reason: 'globalAdmin'|'noOrder'|'noClient'|'purged'. */
function classifyUser(u, byOrder) {
    if (u.isGlobalAdmin === true) return { ok: false, reason: 'globalAdmin' };
    const tid = tidOf(u);
    if (tid === null) return { ok: false, reason: 'noOrder' };
    const c = byOrder.get(tid);
    if (!c) return { ok: false, reason: 'noClient', tid };
    if (c.status === 'PURGED') return { ok: false, reason: 'purged', tid };
    return { ok: true, tid, client: c };
}

const push = (arr, v) => { if (arr.length < SAMPLE_LIMIT) arr.push(v); };

/** G0: salt-okuma ön kontrol raporu. `getTenantDb(name)` -> Db (yalnız izinli adlar için çağrılır). */
async function runPrecheck({ appDb, getTenantDb, appDbName }) {
    const { clients, users, byOrder } = await loadCentral(appDb);
    const r = {
        central: { total: users.length, globalAdminsExcluded: 0, eligible: 0, noOrder: 0, orderNotInClients: 0, purgedTenant: 0,
            duplicateEmailGroups: 0, plaintextPasswordSuspects: 0 },
        tenants: { total: clients.length, ownerless: 0, multiOwner: 0, dbNotAllowed: 0, dbUnreadable: 0 },
        drift: { tenantOnly: 0, centralOnly: 0, roleCodeDiff: 0, tenantPlaintextPasswordSuspects: 0 },
        samples: { orphanUsers: [], ownerlessTids: [], multiOwnerTids: [], plaintext: [], tenantOnly: [], centralOnly: [], roleCodeDiff: [] },
    };
    const seen = new Map();
    const ownersByTid = new Map();
    const eligibleByTid = new Map();
    for (const u of users) {
        const n = normEmail(u.email);
        if (n) seen.set(n, (seen.get(n) || 0) + 1);
        const c = classifyUser(u, byOrder);
        if (u.isGlobalAdmin !== true && typeof u.password === 'string' && !isBcryptHash(u.password)) {
            r.central.plaintextPasswordSuspects++;
            push(r.samples.plaintext, { email: maskEmail(u.email), where: 'central' });
        }
        if (!c.ok) {
            if (c.reason === 'globalAdmin') { r.central.globalAdminsExcluded++; continue; }
            if (c.reason === 'noOrder') r.central.noOrder++;
            else if (c.reason === 'noClient') r.central.orderNotInClients++;
            else r.central.purgedTenant++;
            push(r.samples.orphanUsers, { email: maskEmail(u.email), reason: c.reason, tid: c.tid === undefined ? null : c.tid });
            continue;
        }
        r.central.eligible++;
        if (!eligibleByTid.has(c.tid)) eligibleByTid.set(c.tid, []);
        eligibleByTid.get(c.tid).push(u);
        if (u.owner === true && u.isActive !== false) ownersByTid.set(c.tid, (ownersByTid.get(c.tid) || 0) + 1);
    }
    for (const n of seen.values()) if (n > 1) r.central.duplicateEmailGroups++;

    for (const c of clients) {
        if (c.status === 'PURGED') continue;
        const tid = Number(c.order);
        const owners = ownersByTid.get(tid) || 0;
        if (owners === 0) { r.tenants.ownerless++; push(r.samples.ownerlessTids, tid); }
        else if (owners > 1) { r.tenants.multiOwner++; push(r.samples.multiOwnerTids, tid); }
        const dbname = c.dbConfig && c.dbConfig.dbname;
        if (!isAllowedTenantDbName(dbname, appDbName)) { r.tenants.dbNotAllowed++; continue; } // izinsiz DB'ye DOKUNULMAZ
        let tUsers;
        try { tUsers = await getTenantDb(dbname).collection('Users').find({}, { projection: { email: 1, roleCode: 1, password: 1 } }).toArray(); }
        catch (_) { r.tenants.dbUnreadable++; continue; }
        const central = eligibleByTid.get(tid) || [];
        const cMap = new Map(central.map((u) => [normEmail(u.email), u]));
        const tMap = new Map(tUsers.map((u) => [normEmail(u.email), u]));
        for (const [e, tu] of tMap) {
            if (typeof tu.password === 'string' && !isBcryptHash(tu.password)) {
                r.drift.tenantPlaintextPasswordSuspects++; push(r.samples.plaintext, { email: maskEmail(e), where: 'tenant', tid });
            }
            const cu = cMap.get(e);
            if (!cu) { r.drift.tenantOnly++; push(r.samples.tenantOnly, { email: maskEmail(e), tid }); continue; }
            if ((cu.roleCode || null) !== (tu.roleCode || null)) { r.drift.roleCodeDiff++; push(r.samples.roleCodeDiff, { email: maskEmail(e), tid }); }
        }
        for (const [e] of cMap) if (!tMap.has(e)) { r.drift.centralOnly++; push(r.samples.centralOnly, { email: maskEmail(e), tid }); }
    }
    const attention = r.central.noOrder + r.central.orderNotInClients + r.central.duplicateEmailGroups + r.central.plaintextPasswordSuspects
        + r.tenants.ownerless + r.tenants.multiOwner + r.tenants.dbNotAllowed + r.tenants.dbUnreadable
        + r.drift.tenantOnly + r.drift.centralOnly + r.drift.roleCodeDiff + r.drift.tenantPlaintextPasswordSuspects;
    r.exitCode = attention > 0 ? 2 : 0; // ≠0 => dur, insan karar verir
    return r;
}

/** E1/E2 backfill. Dry-run: diff raporu (yazmaz). --apply: onay kapısı + benzersiz indeks şartı, sonra $setOnInsert upsert. */
async function runBackfill({ appDb, getTenantDb, appDbName, flags, now, approval }) {
    const { users, byOrder } = await loadCentral(appDb);
    const memCol = appDb.collection('Memberships');
    const rep = { mode: flags.apply ? 'apply' : 'dry-run', direction: flags.down ? 'down' : 'up',
        toInsert: 0, unchanged: 0, existingDiffers: 0, skipped: { globalAdmin: 0, noOrder: 0, noClient: 0, purged: 0 },
        ownerlessTenants: [], multiOwnerTenants: [], divergenceRoleCodeCentralWins: 0, tenantDbNotAllowed: 0,
        written: 0, removed: 0, samples: { toInsert: [], existingDiffers: [] } };

    if (flags.down) {
        rep.toRemove = await memCol.countDocuments({ createdBy: CREATED_BY });
        if (flags.apply) { assertWriteApproval(flags, approval); rep.removed = (await memCol.deleteMany({ createdBy: CREATED_BY })).deletedCount; }
        return rep;
    }

    const planned = [];
    const ownerActive = new Map();
    const tids = new Set();
    for (const u of users) {
        const c = classifyUser(u, byOrder);
        if (!c.ok) { rep.skipped[c.reason] = (rep.skipped[c.reason] || 0) + 1; continue; }
        const role = legacyRole(u);
        const status = u.isActive === false ? 'suspended' : 'active';
        planned.push({ userId: u._id, tid: c.tid, role, status, email: u.email, roleCode: u.roleCode });
        tids.add(c.tid);
        if (role === 'owner' && status === 'active') ownerActive.set(c.tid, (ownerActive.get(c.tid) || 0) + 1);
    }
    for (const t of tids) {
        const n = ownerActive.get(t) || 0;
        if (n === 0) rep.ownerlessTenants.push(t); else if (n > 1) rep.multiOwnerTenants.push(t);
    }
    // tenant kopyası roleCode ayrışması (yalnız bilgi; merkezi kaynak kazanır). İzinsiz tenant DB'sine DOKUNULMAZ.
    if (getTenantDb) {
        for (const t of tids) {
            const dbname = byOrder.get(t).dbConfig && byOrder.get(t).dbConfig.dbname;
            if (!isAllowedTenantDbName(dbname, appDbName)) { rep.tenantDbNotAllowed++; continue; }
            let tu = [];
            try { tu = await getTenantDb(dbname).collection('Users').find({}, { projection: { email: 1, roleCode: 1 } }).toArray(); } catch (_) { continue; }
            const tm = new Map(tu.map((x) => [normEmail(x.email), x]));
            for (const p of planned.filter((x) => x.tid === t)) {
                const x = tm.get(normEmail(p.email));
                if (x && (x.roleCode || null) !== (p.roleCode || null)) rep.divergenceRoleCodeCentralWins++;
            }
        }
    }
    const existing = await memCol.find({ userId: { $in: planned.map((p) => p.userId) } }).toArray();
    const exMap = new Map(existing.map((m) => [`${m.userId}|${m.tid}`, m]));
    const toWrite = [];
    for (const p of planned) {
        const m = exMap.get(`${p.userId}|${p.tid}`);
        if (!m) { rep.toInsert++; push(rep.samples.toInsert, { email: maskEmail(p.email), tid: p.tid, role: p.role, status: p.status }); toWrite.push(p); }
        else if (m.role === p.role && m.status === p.status) rep.unchanged++;
        else { rep.existingDiffers++; push(rep.samples.existingDiffers, { email: maskEmail(p.email), tid: p.tid, has: `${m.role}/${m.status}`, derived: `${p.role}/${p.status}` }); }
    }
    if (!flags.apply) return rep;

    assertWriteApproval(flags, approval);
    if (rep.ownerlessTenants.length && !flags.acceptOwnerless) throw new Error(`Sahipsiz tenant var (${rep.ownerlessTenants.length}); insan kararı olmadan yazılmaz (--accept-ownerless).`);
    const idx = await memCol.indexes().catch(() => []);
    if (!idx.some((i) => i.unique && i.key && i.key.userId === 1 && i.key.tid === 1)) {
        throw new Error('Memberships {userId,tid} benzersiz indeksi yok: önce onaylı göç 0003-memberships-app up (yarışta çift üyelik riski).');
    }
    const at = (now || (() => new Date()))();
    for (const p of toWrite) {
        // $setOnInsert: var olan üyeliğe (uygulamada sonradan değişmiş olabilir) ASLA dokunulmaz => idempotent + yıkıcı değil.
        const res = await memCol.updateOne({ userId: p.userId, tid: p.tid },
            { $setOnInsert: { userId: p.userId, tid: p.tid, role: p.role, status: p.status, createdBy: CREATED_BY, createdAt: at, updatedAt: at } }, { upsert: true });
        if (res.upsertedCount) rep.written++;
    }
    return rep;
}

/** G1: GERİ ALINAMAZ $unset. İki onay bayrağı + yedek kapısı + üyelik kapsama şartı + öncesinde döküm. Varsayılan dry-run. */
async function runCleanup({ appDb, getTenantDb, appDbName, flags, now, approval, dumpDir }) {
    const { users, clients, byOrder } = await loadCentral(appDb);
    const memCol = appDb.collection('Memberships');
    const rep = { mode: flags.apply ? 'apply' : 'dry-run', irreversible: true, central: { usersWithLegacyFields: 0, withoutMembership: 0 },
        tenants: { dbNotAllowed: 0, usersWithPassword: 0, dbs: 0 }, dumpFile: null, unsetCentral: 0, unsetTenant: 0 };
    const missing = [];
    for (const u of users) {
        if (u.owner !== undefined || u.roleCode !== undefined || u.resources !== undefined) rep.central.usersWithLegacyFields++;
        const c = classifyUser(u, byOrder);
        if (!c.ok) continue;
        if (!(await memCol.findOne({ userId: u._id, tid: c.tid }, { projection: { _id: 1 } }))) missing.push(u._id);
    }
    rep.central.withoutMembership = missing.length;
    const targets = [];
    for (const c of clients) {
        if (c.status === 'PURGED') continue;
        const dbname = c.dbConfig && c.dbConfig.dbname;
        if (!isAllowedTenantDbName(dbname, appDbName)) { rep.tenants.dbNotAllowed++; continue; }
        const n = await getTenantDb(dbname).collection('Users').countDocuments({ password: { $exists: true } });
        rep.tenants.dbs++; rep.tenants.usersWithPassword += n; targets.push(dbname);
    }
    if (!flags.apply) return rep;

    assertWriteApproval(flags, approval);
    if (!flags.confirmIrreversible) throw new Error('G1 geri alınamaz: --confirm-irreversible-unset (ikinci onay) zorunlu.');
    if (missing.length) throw new Error(`Üyeliği olmayan ${missing.length} uygun kullanıcı var: G1 önce E1 backfill gerektirir.`);

    // ÖNCE döküm (backup/ altı, git-ignored): merkezi eski alanlar + tenant parola özetleri.
    const dir = dumpDir || path.join(__dirname, '..', '..', 'backup', 'g1-dumps');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = (now || (() => new Date()))().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `g1-${stamp}.ndjson`);
    const lines = [];
    for (const u of users) lines.push(JSON.stringify({ scope: 'central', _id: String(u._id), owner: u.owner, roleCode: u.roleCode, resources: u.resources }));
    for (const dbname of targets) {
        const tu = await getTenantDb(dbname).collection('Users').find({ password: { $exists: true } }, { projection: { email: 1, password: 1 } }).toArray();
        for (const x of tu) lines.push(JSON.stringify({ scope: 'tenant', db: dbname, _id: String(x._id), email: x.email, password: x.password }));
    }
    fs.writeFileSync(file, lines.join('\n') + '\n', { flag: 'wx' });
    rep.dumpFile = path.relative(path.join(__dirname, '..', '..'), file).replace(/\\/g, '/');

    rep.unsetCentral = (await appDb.collection('Users').updateMany({}, { $unset: { owner: '', roleCode: '', resources: '' } })).modifiedCount;
    for (const dbname of targets) rep.unsetTenant += (await getTenantDb(dbname).collection('Users').updateMany({ password: { $exists: true } }, { $unset: { password: '' } })).modifiedCount;
    return rep;
}

/** Ortak CLI: bağlan (yalnız izinli app DB, local), fn({appDb, getTenantDb, appDbName, flags}) çağır, JSON raporu yaz. */
async function runMembershipsCli(title, fn) {
    common.loadEnv();
    const flags = parseMembershipArgs(process.argv.slice(2));
    let client;
    try {
        if (flags.unknown.length) throw new Error('Bilinmeyen bayrak: ' + flags.unknown.join(', '));
        const appDbName = flags.dbName || process.env.DB_NAME || '';
        if (!common.isAllowedDb(appDbName)) throw new Error('Uygulama DB adı izinli listede değil.');
        // Yazma yolu için onay kapısı BAĞLANMADAN ÖNCE de denenir (onaysız yazma isteği DB'ye hiç dokunmaz).
        if (flags.apply) assertWriteApproval(flags);
        const url = common.buildConnectionUrl(process.env, appDbName, flags.allowRemote);
        const { MongoClient } = require('mongodb');
        client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
        await client.connect();
        console.error(`[${title}] mod: ${flags.apply ? 'APPLY (yazar)' : 'DRY-RUN/salt-okuma'}; uygulama DB: ${appDbName}`);
        const report = await fn({ appDb: client.db(appDbName), getTenantDb: (n) => client.db(n), appDbName, flags });
        const text = JSON.stringify(report, null, 2);
        if (flags.writeReport) {
            const dir = path.join(__dirname, 'reports'); // git-ignored
            fs.mkdirSync(dir, { recursive: true });
            const f = path.join(dir, `${title}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
            fs.writeFileSync(f, text + '\n');
            console.error(`[${title}] rapor: dev-tools/reports/${path.basename(f)}`);
        } else console.log(text);
        if (report.exitCode) process.exitCode = report.exitCode;
    } catch (e) {
        console.error(`[${title}] hata:`, common.redactMessage(e));
        process.exitCode = 1;
    } finally { if (client) await client.close().catch(() => undefined); }
}

module.exports = { isAllowedTenantDbName, maskEmail, legacyRole, isBcryptHash, parseMembershipArgs, assertWriteApproval,
    runPrecheck, runBackfill, runCleanup, runMembershipsCli, CREATED_BY };
