'use strict';
/**
 * ADR-0003 adım 6 (C.10, C.12, C.13) — tüm tenant DB'lerindeki `ClientIntegrations` belgelerinde SIR alanlarını
 * (kayıt: src/api/integrationSecrets.ts > isSecretField) AES-256-GCM ile `enc:v1:<kid>:...` biçimine şifreler.
 *
 * VARSAYILAN = DRY-RUN: yalnızca "N alan şifrelenecek" SAYILARI ve alan ADLARI raporlanır; hiçbir DEĞER yazdırılmaz.
 * Yazma için AÇIK `--apply` şart. İdempotent: `enc:v1:` ile başlayan değer tanınır ve atlanır (yeniden çalıştırmak güvenlidir).
 *   --rotate : ek olarak kid'i aktif kid'den FARKLI olan şifreli değerleri aktif kid ile yeniden şifreler (C.13:
 *              yeni kid ekle + aktif yap -> bu betik --rotate --apply -> eski kid'i kaldır).
 *
 * Tenant DB'leri: uygulama DB'sindeki `Clients.dbConfig.dbname` değerlerinden. İzinli 7 DB listesinde OLMAYAN ad ASLA açılmaz
 * (atlanır ve raporlanır). Değeri string olmayan sır alanları (sayı/nesne) ve literal 'sensitive' (eski maske sızıntısı) ŞİFRELENMEZ, sayılır.
 * Yazma iyimser eşzamanlıdır: güncelleme, okunan eski değer değişmediyse uygulanır; değiştiyse "conflict" sayılır (betik yeniden çalıştırılır).
 *
 * Önkoşul: `npm run build` (dist/ kullanılır) ve --apply/--rotate için FIELD_ENCRYPTION_KEYS / FIELD_ENCRYPTION_ACTIVE_KID env'i
 * (biçim: src/utils/FieldCrypto.ts). CLAUDE.md kural 3: veriyi değiştiren çalıştırmadan önce doğrulanmış yedek şarttır.
 * Canlıda çalıştırma = insan onayı (Protokol 12).
 *
 * Kullanım:  cd backend && node dev-tools/migrate-encrypt-integration-secrets.js [appDbName] [--apply] [--rotate] [--allow-remote]
 */
const { ALLOWED_DBS, isAllowedDb, loadDist, runCli } = require('./_migrationCommon');

const INTEGRATION_TYPES = ['marketplace', 'shipment', 'ecommerce', 'erp', 'einvoice'];
const SENSITIVE_MASK = 'sensitive';

const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && typeof v.toHexString !== 'function';

/**
 * Bir ClientIntegrations belgesindeki sır yapraklarını gezer. `tools`: { isSecretField, isEncrypted, kidOf, getActiveKid }.
 * Dönüş: { sets: {yol: {old, kind}}, conds: {'<tip>.<i>.code': code}, stats }  (eski değerler yalnızca bellekte; rapora girmez)
 */
function planDocument(doc, tools, { rotate }) {
    const sets = {};
    const conds = {};
    const stats = { toEncrypt: {}, toRotate: {}, alreadyEncrypted: 0, skippedNonString: {}, skippedMaskLiteral: 0 };
    const bump = (obj, k) => { obj[k] = (obj[k] || 0) + 1; };
    const activeKid = rotate ? tools.getActiveKid() : undefined;

    const visit = (node, code, path, label, codeCondKey) => {
        if (Array.isArray(node)) { node.forEach((v, i) => visit(v, code, `${path}.${i}`, `${label}[]`, codeCondKey)); return; }
        if (!isPlain(node)) return;
        for (const [k, v] of Object.entries(node)) {
            const p = `${path}.${k}`;
            const l = label ? `${label}.${k}` : k;
            if (tools.isSecretField(k, code) && !isPlain(v) && !Array.isArray(v)) {
                if (v === undefined || v === null || v === '') continue;
                if (typeof v !== 'string') { bump(stats.skippedNonString, `${code}:${l}`); continue; }
                if (v === SENSITIVE_MASK) { stats.skippedMaskLiteral++; continue; }
                if (!tools.isEncrypted(v)) { sets[p] = { old: v, kind: 'encrypt' }; conds[codeCondKey] = code; bump(stats.toEncrypt, `${code}:${l}`); continue; }
                if (rotate && tools.kidOf(v) !== activeKid) { sets[p] = { old: v, kind: 'rotate' }; conds[codeCondKey] = code; bump(stats.toRotate, `${code}:${l}`); continue; }
                stats.alreadyEncrypted++;
            } else if (isPlain(v) || Array.isArray(v)) {
                visit(v, code, p, l, codeCondKey);
            }
        }
    };

    for (const type of INTEGRATION_TYPES) {
        const arr = doc[type];
        if (!Array.isArray(arr)) continue;
        arr.forEach((item, i) => {
            if (!item || !isPlain(item.settings)) return;
            visit(item.settings, item.code, `${type}.${i}.settings`, '', `${type}.${i}.code`);
        });
    }
    return { sets, conds, stats };
}

function mergeStats(total, s) {
    for (const key of ['toEncrypt', 'toRotate', 'skippedNonString']) {
        for (const [k, n] of Object.entries(s[key])) total[key][k] = (total[key][k] || 0) + n;
    }
    total.alreadyEncrypted += s.alreadyEncrypted;
    total.skippedMaskLiteral += s.skippedMaskLiteral;
}
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

/**
 * `dbNames`: taranacak tenant DB adları; `getDb(name)`: `{ collection(name) }` döner (Mongo Db benzeri). İzinli olmayan ad ATLANIR.
 * `tools`: { isSecretField, isEncrypted, encryptField, decryptField, kidOf, getActiveKid }. Yalnızca SAYAÇ/ALAN ADI raporu döner.
 */
async function migrateEncryptSecrets({ dbNames, getDb, tools, apply, rotate }) {
    const report = {
        apply: !!apply, rotate: !!rotate, dbsScanned: 0, dbsSkippedNotAllowed: [], docsScanned: 0,
        fieldsToEncrypt: 0, fieldsToRotate: 0, alreadyEncrypted: 0, skippedNonString: 0, skippedMaskLiteral: 0, undecryptable: 0,
        fieldsWritten: 0, docsWritten: 0, conflicts: 0,
        byField: { toEncrypt: {}, toRotate: {}, skippedNonString: {} }, perDb: {},
    };
    const total = { toEncrypt: {}, toRotate: {}, skippedNonString: {}, alreadyEncrypted: 0, skippedMaskLiteral: 0 };
    const unique = Array.from(new Set(dbNames.filter((n) => typeof n === 'string' && n)));

    for (const name of unique) {
        if (!isAllowedDb(name)) { report.dbsSkippedNotAllowed.push(name); continue; }
        const col = getDb(name).collection('ClientIntegrations');
        const per = { docs: 0, fieldsToEncrypt: 0, fieldsToRotate: 0, fieldsWritten: 0, conflicts: 0 };
        for await (const doc of col.find({})) {
            per.docs++;
            report.docsScanned++;
            const { sets, conds, stats } = planDocument(doc, tools, { rotate });
            mergeStats(total, stats);
            const paths = Object.keys(sets);
            per.fieldsToEncrypt += sum(stats.toEncrypt);
            per.fieldsToRotate += sum(stats.toRotate);
            if (!apply || paths.length === 0) continue;

            const $set = {};
            const filter = { _id: doc._id, ...conds };
            for (const p of paths) {
                const { old, kind } = sets[p];
                let plain = old;
                if (kind === 'rotate') {
                    try { plain = tools.decryptField(old); } catch (_) { report.undecryptable++; continue; }
                }
                $set[p] = tools.encryptField(plain);
                filter[p] = old; // iyimser eşzamanlılık: yalnız okunan eski değer değişmediyse yaz
            }
            const setPaths = Object.keys($set);
            if (setPaths.length === 0) continue;
            const res = await col.updateOne(filter, { $set });
            if (res && res.matchedCount === 0) { per.conflicts++; report.conflicts++; }
            else { per.fieldsWritten += setPaths.length; report.fieldsWritten += setPaths.length; report.docsWritten++; }
        }
        report.dbsScanned++;
        report.perDb[name] = per;
    }
    report.fieldsToEncrypt = sum(total.toEncrypt);
    report.fieldsToRotate = sum(total.toRotate);
    report.alreadyEncrypted = total.alreadyEncrypted;
    report.skippedNonString = sum(total.skippedNonString);
    report.skippedMaskLiteral = total.skippedMaskLiteral;
    report.byField = { toEncrypt: total.toEncrypt, toRotate: total.toRotate, skippedNonString: total.skippedNonString };
    return report;
}

module.exports = { INTEGRATION_TYPES, planDocument, migrateEncryptSecrets, ALLOWED_DBS };

if (require.main === module) {
    runCli('migrate-encrypt-integration-secrets', async ({ client, appDb, flags }) => {
        const cryptoMod = loadDist('utils/FieldCrypto.js');
        const secrets = loadDist('api/integrationSecrets.js');
        // yazma/rotasyon için anahtarlar ŞART (fail-fast); saf dry-run için gerekmez
        if (flags.apply || flags.rotate) cryptoMod.assertFieldCryptoConfig();
        const tools = {
            isSecretField: secrets.isSecretField, isEncrypted: cryptoMod.isEncrypted, encryptField: cryptoMod.encryptField,
            decryptField: cryptoMod.decryptField, kidOf: cryptoMod.kidOf, getActiveKid: () => cryptoMod.getActiveKid(),
        };
        const names = await appDb.collection('Clients').distinct('dbConfig.dbname');
        const report = await migrateEncryptSecrets({ dbNames: names, getDb: (n) => client.db(n), tools, apply: flags.apply, rotate: flags.rotate });
        console.log(JSON.stringify(report, null, 2));
        if (!flags.apply) {
            console.log(`DRY-RUN: ${report.fieldsToEncrypt} alan şifrelenecek${flags.rotate ? `, ${report.fieldsToRotate} alan yeniden şifrelenecek` : ''}. Yazmak için --apply (yedek + anahtar env'i şart).`);
        }
        if (report.conflicts > 0) process.exitCode = 3;
    });
}
