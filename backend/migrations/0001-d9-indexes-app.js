'use strict';
/**
 * ADR-0021 Karar 3 D9 (Aşama B, expand, App scope) — eksik indeksler:
 *   - `AuditLogs {tid:1, at:-1}` (DATA_MODEL_CONVENTIONS.md §12 "Denetim"; audit-service.ts:30-34).
 *   - merkezi `Users {clientId:1}` (DATA_MODEL_CONVENTIONS.md §12 "Tenant kullanıcıları"; user-service.ts:115-122).
 *
 * Bu indekslerin CANONİK BEYANI (Karar 4: "şema dosyaları indeksin beyanı, göç dosyası uygulaması") AYNI
 * commit'te `src/database/application/models/{AuditLog,User}.ts` dosyalarına eklendi.
 *
 * [TASARIM NOTU] Bu göç dosyası, üretim TS şema dosyasını DOĞRUDAN `require` ETMEZ. Sebep: göç dosyaları
 * GERÇEK CLI'da (`dev-tools/migrate.js`, düz `node`, TS yok) ile jest testlerinde (ts-jest, `dist/` YOK —
 * `npm test`/`npm run test:integration` derleme yapmaz) İKİ FARKLI çalışma zamanında `require()` edilir; ya
 * derlenmiş `dist/` (yalnız CLI'da var) ya da ts-jest transform'u (yalnız jest'te var) gerekir ve HİÇBİR
 * seçenek HER İKİ ortamda da çalışmaz. Bunun yerine (0000-example.js'in self-contained deseniyle AYNI),
 * bu dosya YALNIZ kendi sorumlu olduğu alan/ad ile BİREBİR eşleşen MİNİMAL bir Mongoose şeması tanımlar ve
 * GERÇEK koleksiyon adına (`AuditLogs`/`Users`; test izolasyonu için `ctx.collectionOverrides` ile
 * `zzTest_...` önekli ada override edilebilir) bağlar. Üretim şema dosyasıyla DRIFT riski
 * `tests/static/indexManifest.static.test.ts` (commit'li `index-manifest.json` ile şema dosyalarındaki
 * BEYANI karşılaştırır) tarafından ayrıca yakalanır — bu göç dosyası o kontrolün KAPSAMI DIŞINDADIR
 * (yalnız `.js`, tsc/ts-jest projesine dahil değil), bu yüzden alan/ad EŞLEŞMESİ elle (bu görev raporunda)
 * doğrulandı.
 *
 * MongoDB 4.2+ TÜM indeks kurulumlarını hibrit (arka planda, koleksiyonu kilitlemeyen) algoritmayla yapar;
 * Mongoose 8.x + mongodb sürücü 6.x'te `background` seçeneği ARTIK YOK SAYILIR (deprecated) — bilerek
 * VERİLMEDİ (Karar 3 D9 satırı "risk düşük (yazma maliyeti küçük)" notuyla tutarlı).
 */
const mongoose = require('mongoose');

const TARGETS = {
    auditLogs: {
        defaultCollection: 'AuditLogs',
        indexes: [{ fields: { tid: 1, at: -1 }, name: 'tid_1_at_-1' }],
    },
    users: {
        defaultCollection: 'Users',
        indexes: [{ fields: { clientId: 1 }, name: 'clientId_1' }],
    },
};

function resolveModel(ctx, key) {
    const target = TARGETS[key];
    const collectionName = (ctx.collectionOverrides && ctx.collectionOverrides[key]) || target.defaultCollection;
    const modelName = `D9App__${key}__${collectionName}`;
    if (ctx.connection.models[modelName]) {
        return { model: ctx.connection.models[modelName], collectionName, indexes: target.indexes };
    }
    // strict:false — mevcut üretim şemalarının ikisi de (`AuditLogSchema`, merkezi `UserSchema`) strict:false;
    // bu minimal şema yalnız İNDEKS BEYANI taşır, alan doğrulaması yapmaz (bu göçün amacı değil).
    // autoIndex:false — KRİTİK: bu ZORUNLUDUR. `ctx.connection.model(...)` GERÇEK üretim koleksiyon adıyla
    // (`collectionOverrides` YOKSA `AuditLogs`/`Users`) çağrıldığında, Mongoose varsayılanı (`autoIndex:true`)
    // model derlemesinden HEMEN SONRA arka planda `ensureIndexes()`/`createIndexes()` ÇALIŞTIRIR — bu, yalnız
    // `plan()`in (SALT-OKUMA olması gereken) `diffIndexes()` için model kaydettiği durumda bile SESSİZCE
    // ÜRETİM koleksiyonuna YAZARDI (bu tam olarak yaşandı ve elle düzeltildi — bkz. görev raporu "Bulgu").
    // `autoIndex:false` bu arka plan yazımını KAPATIR; `up()` yine de indeksleri AÇIKÇA `createIndex` ile kurar.
    const schema = new mongoose.Schema({}, { collection: collectionName, versionKey: false, strict: false, autoIndex: false });
    for (const idx of target.indexes) schema.index(idx.fields, { name: idx.name });
    const model = ctx.connection.model(modelName, schema, collectionName);
    return { model, collectionName, indexes: target.indexes };
}

async function planOne(ctx, key) {
    const { model, collectionName } = resolveModel(ctx, key);
    await model.createCollection().catch(() => undefined); // zaten varsa no-op (mevcut 'AuditLogs'/'Users' üretim koleksiyonları)
    // `indexOptionsToCreate:true`: `toCreate` öğeleri `[alanlar, seçenekler]` çifti döner (adlı rapor için gerekli).
    const diff = await model.diffIndexes({ indexOptionsToCreate: true });
    return {
        collection: collectionName,
        toCreate: diff.toCreate.map(([, options]) => (options && options.name) || 'ad-yok'),
        toDrop: diff.toDrop,
    };
}

async function upOne(ctx, key) {
    const { model, collectionName, indexes } = resolveModel(ctx, key);
    await model.createCollection().catch(() => undefined);
    const created = [];
    for (const idx of indexes) {
        await model.collection.createIndex(idx.fields, { name: idx.name }); // idempotent (aynı ad+alan varsa no-op)
        created.push(idx.name);
    }
    return { collection: collectionName, created };
}

async function downOne(ctx, key) {
    const { model, collectionName, indexes } = resolveModel(ctx, key);
    const dropped = [];
    for (const idx of indexes) {
        await model.collection.dropIndex(idx.name).catch(() => undefined); // idempotent (yoksa sessizce geçer)
        dropped.push(idx.name);
    }
    return { collection: collectionName, dropped };
}

module.exports = {
    id: '0001-d9-indexes-app',
    scope: 'app',
    kind: 'index',
    description: "ADR-0021 D9 (App): AuditLogs {tid:1,at:-1} + merkezi Users {clientId:1} (salt ekleme, expand, geri alınabilir).",
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: her koleksiyon için `Model.diffIndexes()` raporu (Karar 4; `syncIndexes()` KULLANILMAZ). */
    async plan(ctx) {
        return { collections: [await planOne(ctx, 'auditLogs'), await planOne(ctx, 'users')] };
    },

    /** İndeksleri kurar (`createIndex`, adlı, idempotent). */
    async up(ctx) {
        return { collections: [await upOne(ctx, 'auditLogs'), await upOne(ctx, 'users')] };
    },

    /** İndeksleri kaldırır (`dropIndex`, adlı, idempotent). */
    async down(ctx) {
        return { collections: [await downOne(ctx, 'auditLogs'), await downOne(ctx, 'users')] };
    },
};
