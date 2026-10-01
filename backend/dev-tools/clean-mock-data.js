'use strict';
/**
 * DB-13 (DATABASE_REVIEW_2026-09-30, DBR-01) — yerel/tenant DB'lerde MOCK/GEÇİCİ veri temizliği.
 * VARSAYILAN = DRY-RUN (yazmaz; yalnızca SAYILAR). Silmek için AÇIK `--apply --confirm-backup` (CLAUDE.md kural 3: doğrulanmış taze yedek).
 *
 * (a) Customers: "kimliksiz" (externalIdentities boş/yok YA DA yalnızca `AUTO_FIX_` ile başlayan dış kimlikler) VE
 *     vergi no/e-posta/telefon anahtarı OLMAYAN VE hiçbir Orders/Claims/Invoices/Messages `customerId` ile referans verilmeyen belgeler.
 *     Yalnız uygulamaya KAYITLI tenant DB'leri (entegrasyonikDB.Clients.dbConfig.dbname) taranır (eski/legacy şemalı DB'lere dokunulmaz).
 * (b) ExportStagedProducts: koleksiyonun TAMAMI (geçici hazırlık kaydı; ExportStagedProducts için TTL/saklama 0012'de). İzinli tenant DB'lerin
 *     hepsinde (kayıtlı + legacy) aranır.
 * DOKUNULMAZ: Products/Variants/Categories/Brands/Attribute*, siparişler/iadeler/faturalar/mesajlar, entegrasyon ayarları, Clients, Users, Menu.
 * Çıktıya belge içeriği/kimlik DEĞERİ yazılmaz (yalnız sayaç). İzinli 7 DB dışı açılmaz; varsayılan yalnız 127.0.0.1.
 *
 * Kullanım:  cd backend && node dev-tools/clean-mock-data.js [appDbName] [--apply --confirm-backup]
 */
const { ALLOWED_DBS, isAllowedDb, runCli } = require('./_migrationCommon');

const REF_COLLECTIONS = /^(orders|claims|invoices|messages)$/i;
const CUSTOMERS = /^customers$/i;
const EXPORT_STAGED = /^ExportStagedProducts$/;
const BATCH = 1000;

const blank = (v) => v === undefined || v === null || v === '';

/** Saf yüklem: bu müşteri kimliksiz mock kaydı mı? (referans kontrolü ayrı) */
function isIdentitylessCustomer(doc) {
    const ids = Array.isArray(doc.externalIdentities) ? doc.externalIdentities : [];
    const onlyAuto = ids.every((x) => x && typeof x.externalCustomerId === 'string' && x.externalCustomerId.startsWith('AUTO_FIX_'));
    // Not: dış kimliği olmayan (ids=[]) ya da yalnız AUTO_FIX olanlar; bir de gerçek anahtar (vergi no/e-posta/telefon) yoksa.
    return onlyAuto && blank(doc.taxNumber) && blank(doc.email) && blank(doc.phone);
}

async function collectReferencedIds(db, names) {
    const ids = new Set();
    for (const n of names.filter((x) => REF_COLLECTIONS.test(x))) {
        for (const v of await db.collection(n).distinct('customerId')) if (v != null) ids.add(String(v));
    }
    return ids;
}

/**
 * `registeredDbNames`: Customers temizliği için; `allDbNames`: ExportStagedProducts için. `getDb(name)` Mongo Db benzeri döner.
 * Dönüş: yalnız sayaçlar.
 */
async function cleanMockData({ registeredDbNames, allDbNames, getDb, apply }) {
    const report = { apply: !!apply, dbsSkippedNotAllowed: [], customers: {}, exportStaged: {}, deleted: { customers: 0, exportStaged: 0 } };
    for (const name of new Set([...registeredDbNames, ...allDbNames])) {
        if (!isAllowedDb(name)) { report.dbsSkippedNotAllowed.push(name); }
    }
    for (const name of registeredDbNames.filter(isAllowedDb)) {
        const db = getDb(name);
        const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((x) => x.name);
        const cn = names.find((n) => CUSTOMERS.test(n));
        if (!cn) continue;
        const refs = await collectReferencedIds(db, names);
        const col = db.collection(cn);
        const candidates = [];
        let total = 0, identityless = 0;
        const cursor = col.find({}, { projection: { externalIdentities: 1, taxNumber: 1, email: 1, phone: 1 } });
        for await (const d of cursor) {
            total++;
            if (!isIdentitylessCustomer(d)) continue;
            identityless++;
            if (!refs.has(String(d._id))) candidates.push(d._id);
        }
        const r = { collection: cn, total, identityless, referencedIdentityless: identityless - candidates.length, toDelete: candidates.length, deleted: 0 };
        if (apply) {
            for (let i = 0; i < candidates.length; i += BATCH) {
                // Silme anında referans yokluğu yeniden garanti edilmez (yerel tek-kullanıcı); yalnız aday _id'ler silinir.
                const res = await col.deleteMany({ _id: { $in: candidates.slice(i, i + BATCH) } });
                r.deleted += res.deletedCount || 0;
            }
            report.deleted.customers += r.deleted;
        }
        report.customers[name] = r;
    }
    for (const name of allDbNames.filter(isAllowedDb)) {
        const db = getDb(name);
        const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((x) => x.name);
        const cn = names.find((n) => EXPORT_STAGED.test(n));
        if (!cn) continue;
        const col = db.collection(cn);
        const count = await col.countDocuments({});
        const r = { collection: cn, toDelete: count, deleted: 0 };
        if (apply && count > 0) { const res = await col.deleteMany({}); r.deleted = res.deletedCount || 0; report.deleted.exportStaged += r.deleted; }
        report.exportStaged[name] = r;
    }
    return report;
}

module.exports = { isIdentitylessCustomer, cleanMockData, ALLOWED_DBS };

if (require.main === module) {
    runCli('clean-mock-data', async ({ appDb, flags }) => {
        if (flags.apply && !flags.confirmBackup) {
            throw new Error('--apply için doğrulanmış yedek beyanı şart: --confirm-backup (CLAUDE.md kural 3; backup/README.md).');
        }
        const registered = await appDb.collection('Clients').distinct('dbConfig.dbname');
        const tenantAllowed = ALLOWED_DBS.filter((d) => /^entegrasyonik(_client|Client)/.test(d));
        const { client } = { client: appDb.client };
        const report = await cleanMockData({ registeredDbNames: registered, allDbNames: tenantAllowed, getDb: (n) => client.db(n), apply: flags.apply });
        console.log(JSON.stringify(report, null, 2));
        if (!flags.apply) console.log('DRY-RUN (yazmaz). Silmek için --apply --confirm-backup (yedek şart).');
    });
}
