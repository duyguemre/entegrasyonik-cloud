'use strict';
/**
 * ADR-0003 adım 5 (B.6, B.8) — `Clients` kayıtlarından ALTYAPI KİMLİK ALANLARINI kaldırır:
 *   dbConfig.url, dbConfig.user, dbConfig.password, archive.accessKeyId, archive.secretAccessKey, image.accessKeyId, image.secretAccessKey
 * (yeni kod bağlantıyı env'deki DB_URL/DB_USER/DB_PASSWORD'dan, R2 anahtarını env'deki R2_*'dan kurar; bu alanları okumaz).
 *
 * VARSAYILAN = DRY-RUN: yalnızca alan ADI başına kayıt SAYISI raporlanır (değer okunmaz/yazdırılmaz). Yazma için AÇIK `--apply` şart.
 * İdempotent: alan yoksa hiçbir şey yapmaz. Yalnızca uygulama DB'sindeki `Clients` koleksiyonuna dokunur (izinli 7 DB kuralı).
 *
 * SIRA (ADR E.18): (1) yeni kod (env tabanlı bağlantı/R2) deploy edilir ve env doldurulur -> (2) BU betik --apply -> (3) eski kimlik
 * bilgileri iptal edilir (insan, Protokol 12). Betik, yeni kod yayında değilken çalıştırılırsa ESKİ kod tenant bağlantısı kuramaz.
 * CLAUDE.md kural 3: veriyi değiştiren çalıştırmadan önce doğrulanmış yedek şarttır.
 *
 * Kullanım:  cd backend && node dev-tools/migrate-tenant-infra-to-env.js [appDbName] [--apply] [--allow-remote]
 */
const { runCli } = require('./_migrationCommon');

const INFRA_FIELDS = [
    'dbConfig.url', 'dbConfig.user', 'dbConfig.password',
    'archive.accessKeyId', 'archive.secretAccessKey',
    'image.accessKeyId', 'image.secretAccessKey',
];

/** `clients`: Clients koleksiyonu (find/countDocuments/updateMany). Yalnızca SAYAÇ döner. */
async function migrateTenantInfra({ clients, apply }) {
    const report = { apply: !!apply, totalClients: await clients.countDocuments({}), fields: {}, docsWithAnyField: 0, docsModified: 0 };
    for (const f of INFRA_FIELDS) report.fields[f] = await clients.countDocuments({ [f]: { $exists: true } });
    const anyFilter = { $or: INFRA_FIELDS.map(f => ({ [f]: { $exists: true } })) };
    report.docsWithAnyField = await clients.countDocuments(anyFilter);
    if (apply && report.docsWithAnyField > 0) {
        const unset = Object.fromEntries(INFRA_FIELDS.map(f => [f, '']));
        const res = await clients.updateMany(anyFilter, { $unset: unset });
        report.docsModified = res.modifiedCount || 0;
    }
    return report;
}

module.exports = { INFRA_FIELDS, migrateTenantInfra };

if (require.main === module) {
    runCli('migrate-tenant-infra-to-env', async ({ appDb, flags }) => {
        const report = await migrateTenantInfra({ clients: appDb.collection('Clients'), apply: flags.apply });
        console.log(JSON.stringify(report, null, 2));
        if (!flags.apply && report.docsWithAnyField > 0) console.log(`DRY-RUN: ${report.docsWithAnyField} kayıttan alan silinecek. Yazmak için --apply (yedek + yeni kod yayını sonrası).`);
    });
}
