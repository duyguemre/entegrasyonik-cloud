'use strict';
/**
 * ADR-0003 uygulama sırası adım 2 — SALT-OKUNUR ön kontrol (tekil indeks öncesi).
 *
 * Merkezi ApplicationDB'de tekil indeks kurulabilir mi? Yalnızca SAYAÇ raporlar; e-posta/kişisel veri DEĞERİ
 * ne okunur ne yazdırılır (yalnızca $group/$count agregasyonu; sonuçtan yalnızca sayılar çıkarılır).
 *
 * Kontroller:
 *   - Clients.order / Clients.clientId / Clients.dbConfig.dbname : mükerrer grup sayısı, fazlalık doküman sayısı, eksik alan sayısı
 *   - Users.email (trim + küçük harf normalize)                  : mükerrer grup sayısı, fazlalık doküman sayısı, eksik e-posta
 *   - Users.email normalize formundan farklı (büyük harf/boşluk) kayıt sayısı
 *   - Users.clientId tip dağılımı (ObjectId/number/...) — ADR-0003 A.2 tip tutarsızlığı
 *   - Counters 'tenant_order' var mı, sequence_value ve max(Clients.order) (sayaç tohumu için)
 *   - Clients/Users üzerindeki mevcut indeksler (yalnızca ad + unique bayrağı)
 *
 * Kurallar (CLAUDE.md): yalnızca izinli 7 DB; yalnızca 127.0.0.1 (Atlas'a ASLA); hiçbir yazma işlemi yok;
 * DB kimlik bilgisi/URL çıktıya YAZILMAZ. Çıkış kodu: 0 = temiz, 2 = mükerrer var (insan kararı), 1 = hata.
 *
 * Kullanım:  cd backend && node dev-tools/precheck-tenant-duplicates.js [dbName]     (varsayılan: .env DB_NAME)
 */
const path = require('path');
const ALLOWED_DBS = [
    'entegrasyonik', 'entegrasyonik_client', 'entegrasyonik_client_2', 'entegrasyonik_client_24',
    'entegrasyonik_client_25', 'entegrasyonikClient_1', 'entegrasyonikDB',
];

function loadEnv() {
    try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) { /* dotenv yok: ortam değişkenleri kullanılır */ }
}

/** Mongo tarafında normalize e-posta ifadesi (yalnızca string ise). */
const NORMALIZED_EMAIL = { $toLower: { $trim: { input: '$email' } } };

async function duplicateStats(col, keyExpr, matchNonNull) {
    const groups = await col.aggregate([
        { $match: matchNonNull },
        { $group: { _id: keyExpr, n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
        { $group: { _id: null, duplicateGroups: { $sum: 1 }, extraDocs: { $sum: { $subtract: ['$n', 1] } } } },
    ]).toArray();
    return groups[0] ? { duplicateGroups: groups[0].duplicateGroups, extraDocs: groups[0].extraDocs } : { duplicateGroups: 0, extraDocs: 0 };
}

async function main() {
    loadEnv();
    const { MongoClient } = require('mongodb');
    const rawUrl = process.env.DB_URL || '';
    const dbName = process.argv[2] || process.env.DB_NAME || '';
    if (!ALLOWED_DBS.includes(dbName)) throw new Error('DB izinli listede değil (7 izinli DB dışında çalışılmaz).');
    if (!/^mongodb:\/\/([^@/]*@)?(127\.0\.0\.1)(:\d+)?\//.test(rawUrl)) throw new Error('Yalnızca local 127.0.0.1 bağlantısı kullanılır (Atlas/uzak host yasak).');
    const user = process.env.DB_USER || '';
    const pass = process.env.DB_PASSWORD || '';
    const url = rawUrl.replace('{{USER}}', encodeURIComponent(user)).replace('{{PASSWORD}}', encodeURIComponent(pass)).replace('{{DBNAME}}', dbName);

    const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
    const report = { db: dbName, clients: {}, users: {}, counters: {}, indexes: {} };
    try {
        await client.connect();
        const db = client.db(dbName);
        const clients = db.collection('Clients');
        const users = db.collection('Users');
        const counters = db.collection('Counters');

        report.clients.total = await clients.countDocuments({});
        for (const [label, field] of [['order', 'order'], ['clientId', 'clientId'], ['dbname', 'dbConfig.dbname']]) {
            const missing = await clients.countDocuments({ $or: [{ [field]: { $exists: false } }, { [field]: null }] });
            const dup = await duplicateStats(clients, '$' + field, { [field]: { $exists: true, $ne: null } });
            report.clients[label] = { missing, ...dup };
        }
        // order ile clientId birbirinden farklı olan tenant kayıtları (kanonik kimlik: order) — sayaç
        report.clients.orderNotEqualClientId = await clients.countDocuments({ $expr: { $ne: ['$order', '$clientId'] } });
        const clientIdTypes = await clients.aggregate([{ $group: { _id: { $type: '$clientId' }, n: { $sum: 1 } } }]).toArray();
        report.clients.clientIdTypes = Object.fromEntries(clientIdTypes.map(t => [t._id, t.n]));
        const maxRow = await clients.aggregate([{ $group: { _id: null, max: { $max: '$order' } } }]).toArray();
        report.clients.maxOrder = maxRow[0] ? maxRow[0].max : null;

        report.users.total = await users.countDocuments({});
        report.users.emailMissing = await users.countDocuments({ $or: [{ email: { $exists: false } }, { email: null }, { email: '' }] });
        report.users.emailNotString = await users.countDocuments({ email: { $exists: true, $not: { $type: 'string' } } });
        const stringEmail = { email: { $type: 'string', $ne: '' } };
        report.users.emailDuplicateNormalized = await duplicateStats(users, NORMALIZED_EMAIL, stringEmail);
        report.users.emailDuplicateExact = await duplicateStats(users, '$email', stringEmail);
        report.users.emailNotInNormalizedForm = await users.countDocuments({ ...stringEmail, $expr: { $ne: ['$email', NORMALIZED_EMAIL] } });
        const uClientIdTypes = await users.aggregate([{ $group: { _id: { $type: '$clientId' }, n: { $sum: 1 } } }]).toArray();
        report.users.clientIdTypes = Object.fromEntries(uClientIdTypes.map(t => [t._id, t.n]));

        const counter = await counters.findOne({ _id: 'tenant_order' }, { projection: { sequence_value: 1 } });
        report.counters.tenantOrderExists = !!counter;
        report.counters.tenantOrderSequence = counter ? counter.sequence_value : null;

        const idxInfo = async (col) => (await col.indexes().catch(() => [])).map(i => ({ name: i.name, unique: !!i.unique }));
        report.indexes.Clients = await idxInfo(clients);
        report.indexes.Users = await idxInfo(users);
    } finally {
        await client.close().catch(() => undefined);
    }

    const dupCount = (o) => (o && o.duplicateGroups) || 0;
    const clean =
        dupCount(report.clients.order) === 0 && dupCount(report.clients.clientId) === 0 && dupCount(report.clients.dbname) === 0 &&
        dupCount(report.users.emailDuplicateNormalized) === 0;
    report.uniqueIndexSafe = clean;
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = clean ? 0 : 2;
}

main().catch((e) => { console.error('precheck hatası:', e && e.message ? String(e.message).replace(/mongodb:\/\/[^\s]*/g, 'mongodb://<gizli>') : 'bilinmiyor'); process.exitCode = 1; });
