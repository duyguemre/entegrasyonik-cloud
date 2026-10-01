'use strict';
/**
 * BACKLOG C22 (Trendyol API kapanışları, 15.10.2026) — ApplicationDB `Integrations` koleksiyonundaki `code:'trendyol'`
 * belgesinin YALNIZCA `urls` alt alanındaki, KESİN doğrulanmış ESKİ değerleri V2'ye çevirir.
 * Kaynak: docs/research/2026-09-28-trendyol-v2-migration-spec.md §1 (eşleme tablosu).
 *
 * KAPSAM: şimdilik yalnızca sipariş listesi (`orderListUrl`: `.../order/sellers/<SELLERID>/orders` -> `.../v2/orders`).
 * Ürün URL'leri (transferUrl/productListUrl/...) ürün ajanına aittir: o ajan AYNI araca kendi maddelerini `CHANGES` tablosuna
 * {key, from, to} satırları ekleyerek katar (yapı genişletilebilir; planlama/uygulama/geri alma satır bazında çalışır).
 *
 * KURALLAR
 *  - Bir satır YALNIZCA belgedeki mevcut değer `from` ile TAM eşleşiyorsa değişir (koşullu updateOne: `{ 'urls.<key>': from }`
 *    -> yarış-güvenli; elle özelleştirilmiş değere DOKUNULMAZ: `skipped_custom`).
 *  - İDEMPOTENT: değer zaten `to` ise `already_applied`; ikinci çalıştırma hiçbir şey yazmaz.
 *  - Yalnızca `urls.<key>` alanları okunur/yazılır (belgenin başka alanına — settings/sırlar dahil — dokunulmaz, okunmaz bile:
 *    projection yalnızca `urls`).
 *  - Çıktıda URL SORGU DİZESİ/kimlik bilgisi YOK (sorgu dizesi ve userinfo kırpılır); bağlantı dizesi/sır yazılmaz.
 *  - `--rollback-plan`: HİÇBİR şey yazmaz; önceki değerleri geri yazan mongosh komutlarını/tabloyu basar.
 *
 * VARSAYILAN = DRY-RUN (yazmaz; before/after yazdırır). Yazma: AÇIK `--apply`. Koruma zinciri (`seed-plans.js` /
 * `migrate-legacy-tenants-to-subscriptions.js` ile AYNI; CLAUDE.md kural 2/3 + `_migrationCommon.js`):
 *  - hedef DB adı izinli 7 DB listesinde değilse REDDEDİLİR (bağlantı bile açılmaz; `assertAllowedDb`),
 *  - varsayılan olarak yalnızca local 127.0.0.1 (uzak/Atlas için `--allow-remote` + insan onayı),
 *  - `--apply` için `TRENDYOL_URL_MIGRATION_BACKUP_CONFIRMED=yes` env'i ŞART (yedek doğrulandı beyanı — `backup/README.md`).
 * GERÇEK DB'ye `--apply` bir İNSAN adımıdır (Protokol 12); kod tarafı `urlSafetyNet.ts` ile DB değişmese de V2'ye gider.
 *
 * Kullanım:  cd backend && npm run migrate:trendyol-urls [-- [appDbName] [--apply] [--allow-remote] [--rollback-plan]]
 */
const { ALLOWED_DBS, isAllowedDb, runCli } = require('./_migrationCommon');

const INTEGRATIONS_COLLECTION = 'Integrations';
const INTEGRATION_CODE = 'trendyol';

/**
 * Göç tablosu. Yeni satır eklemek için: { key, from, to } — `from` değer TAM eşleşme (dize), `to` hedef.
 * Aynı `key` için birden çok eski biçim ayrı satırlarla listelenir.
 */
const CHANGES = Object.freeze([
    // Sipariş listesi: V1 (V2'siz) -> V2. Bugünkü yerel DB değeri göreli biçimdir (C22).
    { key: 'orderListUrl', from: 'order/sellers/<SELLERID>/orders', to: 'order/sellers/<SELLERID>/v2/orders' },
    { key: 'orderListUrl', from: 'https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/orders', to: 'https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/v2/orders' },
    { key: 'orderListUrl', from: 'https://stageapigw.trendyol.com/integration/order/sellers/<SELLERID>/orders', to: 'https://stageapigw.trendyol.com/integration/order/sellers/<SELLERID>/v2/orders' },
    // Eski `sapigw` gateway biçimleri -> güncel gateway V2 (spec §1: PROD tabanı apigw.trendyol.com/integration).
    { key: 'orderListUrl', from: 'https://api.trendyol.com/sapigw/suppliers/<SELLERID>/orders', to: 'https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/v2/orders' },
    { key: 'orderListUrl', from: 'https://api.trendyol.com/sapigw/sellers/<SELLERID>/orders', to: 'https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/v2/orders' },
    // Ürün/katalog (C22, ürün V1 kapanışı 15 Ekim 2026): kaynak `PRODUCT_URL_MIGRATIONS` (trendyol/api/productUrls.ts) ile AYNI eşleme.
    { key: 'transferUrl', from: 'product/sellers/<SELLERID>/products', to: 'product/sellers/<SELLERID>/v2/products' },
    { key: 'transferUrl', from: 'https://apigw.trendyol.com/integration/product/sellers/<SELLERID>/products', to: 'https://apigw.trendyol.com/integration/product/sellers/<SELLERID>/v2/products' },
    { key: 'productListUrl', from: 'product/sellers/<SELLERID>/products', to: 'product/sellers/<SELLERID>/products/approved' },
    { key: 'productListUrl', from: 'https://apigw.trendyol.com/integration/product/sellers/<SELLERID>/products', to: 'https://apigw.trendyol.com/integration/product/sellers/<SELLERID>/products/approved' },
    { key: 'updateDeliveryUrl', from: 'product/sellers/<SELLERID>/products/delivery-bulk-update', to: 'product/sellers/<SELLERID>/products/delivery-info-bulk-update' },
    { key: 'updateDeliveryUrl', from: 'https://apigw.trendyol.com/integration/product/sellers/<SELLERID>/products/delivery-bulk-update', to: 'https://apigw.trendyol.com/integration/product/sellers/<SELLERID>/products/delivery-info-bulk-update' },
    { key: 'categoryAttributeListUrl', from: 'product/product-categories/<CATEGORYID>/attributes', to: 'product/categories/<CATEGORYID>/attributes' },
    { key: 'categoryAttributeListUrl', from: 'https://apigw.trendyol.com/integration/product/product-categories/<CATEGORYID>/attributes', to: 'https://apigw.trendyol.com/integration/product/categories/<CATEGORYID>/attributes' },
]);

/** İzinli 7 DB dışına yazmayı reddeden koruma (bağlantıdan ÖNCE de çağrılır). */
function assertAllowedDb(name) {
    if (!isAllowedDb(name)) {
        throw new Error('Hedef DB adı izinli listede değil (' + ALLOWED_DBS.length + ' izinli DB dışında çalışılmaz).');
    }
    return name;
}

/** `--apply` için doğrulanmış yedek beyanı ŞARTI (CLAUDE.md kural 3). */
function assertApplyConfirmed(apply, env) {
    if (apply && (!env || env.TRENDYOL_URL_MIGRATION_BACKUP_CONFIRMED !== 'yes')) {
        throw new Error('--apply için doğrulanmış yedek beyanı gerekli: TRENDYOL_URL_MIGRATION_BACKUP_CONFIRMED=yes (backup/README.md; CLAUDE.md kural 3).');
    }
}

/** Çıktıya yazılacak URL: sorgu dizesi/parça ve userinfo (kullanıcı:parola@) kırpılır. Dize değilse tür adı. */
function safeUrl(v) {
    if (typeof v !== 'string') return v === undefined ? undefined : '<' + typeof v + '>';
    return v.replace(/[?#].*$/, '').replace(/^(https?:\/\/)[^/@]*@/i, '$1');
}

/** Tablo bütünlüğü: her satır {key,from,to} dizeleri, from!==to; aynı (key,from) tekrarı yok. */
function validateChanges(changes) {
    const errors = [];
    const seen = new Set();
    for (const c of changes) {
        if (!c || typeof c.key !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(c.key)) { errors.push('geçersiz key'); continue; }
        if (typeof c.from !== 'string' || typeof c.to !== 'string' || !c.from || !c.to) errors.push(c.key + ': from/to dize olmalı');
        if (c.from === c.to) errors.push(c.key + ': from === to');
        const id = c.key + '\u0000' + c.from;
        if (seen.has(id)) errors.push(c.key + ': yinelenen from');
        seen.add(id);
    }
    return errors;
}

/**
 * Saf planlama (yan etkisiz): mevcut `urls` nesnesi + göç tablosu -> anahtar başına eylem.
 * change | already_applied | skipped_custom (elle özelleştirilmiş/bilinmeyen değer) | absent (anahtar yok)
 * `before/after` sorgu dizesiz gösterimdir.
 */
function planUrlChanges(urls, changes = CHANGES) {
    const cur = urls && typeof urls === 'object' ? urls : {};
    const keys = [...new Set(changes.map(c => c.key))];
    return keys.map((key) => {
        const rows = changes.filter(c => c.key === key);
        const value = cur[key];
        if (value === undefined || value === null) return { key, action: 'absent' };
        const target = rows.find(r => r.from === value);
        if (target) return { key, action: 'change', before: safeUrl(value), after: safeUrl(target.to), _from: target.from, _to: target.to };
        if (rows.some(r => r.to === value)) return { key, action: 'already_applied', before: safeUrl(value), after: safeUrl(value), _to: value };
        return { key, action: 'skipped_custom', before: safeUrl(value) };
    });
}

/**
 * Geri alma planı: her satır için mevcut (göç sonrası) değeri önceki değere döndüren mongosh komutu.
 * Uygulanmış (`already_applied`) satırın orijinal biçimi tabloda birden çok aday olabilir -> ilk aday + tüm adaylar listelenir.
 * Yazmaz. Komutlar yalnızca URL şablonu içerir (sır yok; sorgu dizesi yok).
 */
function buildRollbackPlan(plan, changes = CHANGES) {
    const out = [];
    for (const p of plan) {
        if (p.action !== 'change' && p.action !== 'already_applied') continue;
        const currentAfter = p._to;
        const candidates = changes.filter(c => c.key === p.key && c.to === currentAfter).map(c => c.from);
        const restoreTo = p.action === 'change' ? p._from : candidates[0];
        if (!restoreTo || !currentAfter) continue;
        out.push({
            key: p.key,
            currentExpected: safeUrl(currentAfter),
            restoreTo: safeUrl(restoreTo),
            candidates: candidates.map(safeUrl),
            mongosh: 'db.' + INTEGRATIONS_COLLECTION + '.updateOne({ code: ' + JSON.stringify(INTEGRATION_CODE) + ', ' + JSON.stringify('urls.' + p.key) + ': ' + JSON.stringify(currentAfter) + ' }, { $set: { ' + JSON.stringify('urls.' + p.key) + ': ' + JSON.stringify(restoreTo) + ' } })',
        });
    }
    return out;
}

/**
 * `db`: MongoDB Db benzeri ({ collection(name) -> { findOne(filter, opts), updateOne(filter, update) } }). Testlerde sahte.
 * `apply` false ise HİÇBİR yazma yapılmaz.
 */
async function migrateTrendyolUrls({ db, dbName, apply = false, changes = CHANGES }) {
    assertAllowedDb(dbName);
    const tableErrors = validateChanges(changes);
    if (tableErrors.length) throw new Error('Göç tablosu geçersiz: ' + tableErrors.join('; '));

    const col = db.collection(INTEGRATIONS_COLLECTION);
    const doc = await col.findOne({ code: INTEGRATION_CODE }, { projection: { urls: 1 } });
    if (!doc) return { dbName, apply, document: 'not_found', results: [], counts: {}, rollback: [] };

    const plan = planUrlChanges(doc.urls, changes);
    const counts = { change: 0, already_applied: 0, skipped_custom: 0, absent: 0 };
    for (const p of plan) counts[p.action]++;
    const report = {
        dbName, apply, document: 'found', counts,
        results: plan.map(({ key, action, before, after }) => ({ key, action, before, after })),
        rollback: buildRollbackPlan(plan, changes),
    };

    if (apply) {
        report.written = { changed: 0, raced: 0 };
        for (const p of plan) {
            if (p.action !== 'change') continue;
            // Koşullu (compare-and-set): yalnızca değer HÂLÂ `from` ise yazılır; yalnızca urls.<key>.
            const res = await col.updateOne({ _id: doc._id, ['urls.' + p.key]: p._from }, { $set: { ['urls.' + p.key]: p._to } });
            if (res && res.modifiedCount > 0) report.written.changed++;
            else report.written.raced++;
        }
    }
    return report;
}

module.exports = {
    ALLOWED_DBS, CHANGES, INTEGRATION_CODE,
    assertAllowedDb, assertApplyConfirmed, safeUrl, validateChanges, planUrlChanges, buildRollbackPlan, migrateTrendyolUrls,
};

if (require.main === module) {
    runCli('migrate-trendyol-integration-urls', async ({ appDb, flags, env }) => {
        if (flags.rollbackPlan && flags.apply) throw new Error('--rollback-plan yazmaz; --apply ile birlikte kullanılamaz.');
        assertApplyConfirmed(flags.apply, env);
        const report = await migrateTrendyolUrls({ db: appDb, dbName: appDb.databaseName, apply: flags.apply });
        if (flags.rollbackPlan) {
            console.log(JSON.stringify({ dbName: report.dbName, rollback: report.rollback }, null, 2));
            console.log('GERİ ALMA PLANI: yazılmadı; komutları yalnızca yedek doğrulaması sonrası bilinçli çalıştırın.');
            return;
        }
        console.log(JSON.stringify(report, null, 2));
        if (!flags.apply) console.log('DRY-RUN: yazılmadı. Yazmak için --apply (+ TRENDYOL_URL_MIGRATION_BACKUP_CONFIRMED=yes).');
    });
}
