'use strict';
/**
 * [K7 / ADR-0020, 2026-09-28] Tenant `ClientIntegrations.<tip>[].settings` içine yazılmış URL/host/endpoint benzeri ÜST DÜZEY alanların
 * (örn. `settings.urls`, `baseUrl`, `*Url`, `host`, `endpoint`; kural: src/api/tenantSettingsGuard.ts > isTenantUrlLikeKey) SAYIMI ve
 * (isteğe bağlı) TEMİZLİĞİ. Bu alanlar artık ne yazılabilir ne adaptöre ulaşır (K7 düzeltmesi); DB'deki kalıntılar zararsızdır ama temizlenmelidir.
 *
 * VARSAYILAN = DRY-RUN / SALT-OKUNUR: yalnızca SAYILAR ve `<tip>:<entegrasyon kodu>:<anahtar adı>` dökümü yazdırılır — DEĞER ASLA yazdırılmaz.
 * Yazma için: `--apply --confirm-backup` (CLAUDE.md kural 3: doğrulanmış yedek beyanı ŞART; yedek yoksa/doğrulanmadıysa ÇALIŞTIRMAYIN).
 * Yazma iyimser eşzamanlıdır: `$unset`, yalnızca aynı dizin konumundaki `code` hâlâ aynıysa uygulanır (yoksa "conflict" sayılır; yeniden çalıştırın).
 * İdempotent: kalıntı yoksa hiçbir şey yazmaz.
 *
 * Tenant DB'leri `Clients.dbConfig.dbname`'den; izinli 7 DB listesinde OLMAYAN ad ASLA açılmaz (atlanır ve raporlanır).
 * Varsayılan olarak yalnızca local 127.0.0.1 (uzak/Atlas için `--allow-remote` + insan onayı). Canlıda çalıştırma = insan onayı (Protokol 12).
 *
 * Önkoşul: `npm run build` (dist/ kullanılır). Kullanım:
 *   cd backend && node dev-tools/clean-tenant-url-settings.js [appDbName]                        # sayım (dry-run)
 *   cd backend && node dev-tools/clean-tenant-url-settings.js [appDbName] --apply --confirm-backup # temizlik
 */
const { ALLOWED_DBS, isAllowedDb, loadDist, runCli } = require('./_migrationCommon');

const INTEGRATION_TYPES = ['marketplace', 'shipment', 'ecommerce', 'erp', 'einvoice'];
const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && typeof v.toHexString !== 'function';

/**
 * Bir ClientIntegrations belgesindeki kalıntıları planlar. `isUrlKey`: anahtar adı -> boolean (tenantSettingsGuard.isTenantUrlLikeKey).
 * Dönüş: { unsets: {yol: ''}, conds: {'<tip>.<i>.code': code}, found: ['<tip>:<kod>:<anahtar>', ...] } (değerler asla döndürülmez)
 */
function planDocument(doc, isUrlKey) {
    const unsets = {};
    const conds = {};
    const found = [];
    for (const type of INTEGRATION_TYPES) {
        const arr = doc && doc[type];
        if (!Array.isArray(arr)) continue;
        arr.forEach((item, i) => {
            if (!item || !isPlain(item.settings)) return;
            for (const key of Object.keys(item.settings)) {
                if (!isUrlKey(key)) continue;
                unsets[`${type}.${i}.settings.${key}`] = '';
                conds[`${type}.${i}.code`] = item.code;
                found.push(`${type}:${item.code}:${key}`);
            }
        });
    }
    return { unsets, conds, found };
}

/**
 * `dbNames`: taranacak tenant DB adları; `getDb(name)` -> Mongo Db benzeri. Yalnızca SAYAÇ/ANAHTAR ADI raporu döner.
 * `apply` false ise HİÇBİR yazma yapılmaz.
 */
async function cleanTenantUrlSettings({ dbNames, getDb, isUrlKey, apply }) {
    const report = {
        apply: !!apply, dbsScanned: 0, dbsSkippedNotAllowed: [], docsScanned: 0, docsWithResidue: 0, residueFields: 0,
        fieldsRemoved: 0, docsWritten: 0, conflicts: 0, byKey: {}, perDb: {},
    };
    const unique = Array.from(new Set(dbNames.filter((n) => typeof n === 'string' && n)));
    for (const name of unique) {
        if (!isAllowedDb(name)) { report.dbsSkippedNotAllowed.push(name); continue; }
        const col = getDb(name).collection('ClientIntegrations');
        const per = { docs: 0, docsWithResidue: 0, residueFields: 0 };
        for await (const doc of col.find({})) {
            per.docs++; report.docsScanned++;
            const { unsets, conds, found } = planDocument(doc, isUrlKey);
            if (found.length === 0) continue;
            per.docsWithResidue++; report.docsWithResidue++;
            per.residueFields += found.length; report.residueFields += found.length;
            for (const f of found) report.byKey[f] = (report.byKey[f] || 0) + 1;
            if (!apply) continue;
            const res = await col.updateOne({ _id: doc._id, ...conds }, { $unset: unsets });
            if (res && res.matchedCount === 0) report.conflicts++;
            else { report.fieldsRemoved += found.length; report.docsWritten++; }
        }
        report.dbsScanned++;
        report.perDb[name] = per;
    }
    return report;
}

module.exports = { INTEGRATION_TYPES, planDocument, cleanTenantUrlSettings, ALLOWED_DBS };

if (require.main === module) {
    runCli('clean-tenant-url-settings', async ({ client, appDb, flags }) => {
        if (flags.apply && !flags.confirmBackup) {
            throw new Error('--apply için doğrulanmış yedek beyanı şart: --confirm-backup (CLAUDE.md kural 3; backup/README.md). Yedek yoksa çalıştırmayın.');
        }
        const guard = loadDist('api/tenantSettingsGuard.js');
        const names = await appDb.collection('Clients').distinct('dbConfig.dbname');
        const report = await cleanTenantUrlSettings({ dbNames: names, getDb: (n) => client.db(n), isUrlKey: guard.isTenantUrlLikeKey, apply: flags.apply });
        console.log(JSON.stringify(report, null, 2));
        if (!flags.apply) console.log(`DRY-RUN (salt-okunur): ${report.docsWithResidue} belgede ${report.residueFields} URL-benzeri kalıntı alan var. Temizlemek için --apply --confirm-backup (yedek şart).`);
        if (report.conflicts > 0) process.exitCode = 3;
    });
}
