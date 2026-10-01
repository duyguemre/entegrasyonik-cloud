'use strict';
/**
 * ADR-0021 Karar 3 D9 (Aşama B, expand, Tenant scope) — eksik indeksler:
 *   - `Orders {internalStatus:1,'dates.orderDate':-1}` + `{integrationCode:1,'dates.orderDate':-1}`
 *     (DATA_MODEL_CONVENTIONS.md §12 "Sipariş listesi"; order-service.ts/smart-service.ts liste sorguları).
 *   - `ExportStagedProducts {integrationCode:1,status:1,mode:1,priorityScore:-1,createdAt:1}`
 *     (DATA_MODEL_CONVENTIONS.md §12 "Dispatcher"; Dispatcher chunk seçim sorgusu).
 *
 * Bu indekslerin CANONİK BEYANI (Karar 4: "şema dosyaları indeksin beyanı, göç dosyası uygulaması") AYNI
 * commit'te `src/database/client/models/{Order,Export}.ts` dosyalarına eklendi.
 *
 * [TASARIM NOTU — 0001-d9-indexes-app.js İLE AYNI GEREKÇE] Bu göç dosyası üretim TS şema dosyasını DOĞRUDAN
 * `require` ETMEZ (CLI = düz node/dist gerektirir; jest = ts-jest/dist YOK — iki ortam arasında kırılgan bir
 * bağımlılık kurmamak için). Bunun yerine, 0000-example.js'in self-contained deseniyle AYNI şekilde, YALNIZ
 * bu göçün sorumlu olduğu alan/ad ile BİREBİR eşleşen MİNİMAL bir Mongoose şeması tanımlar ve GERÇEK
 * koleksiyon adına (`Orders`/`ExportStagedProducts`; test izolasyonu için `ctx.collectionOverrides` ile
 * `zzTest_...` önekli ada override edilebilir) bağlar. Drift riski `tests/static/indexManifest.static.test.ts`
 * ile ayrıca yakalanır (bkz. 0001-d9-indexes-app.js dosya başı notu — bu dosya için de AYNI kapsam dışı durum
 * geçerli; alan/ad eşleşmesi elle doğrulandı).
 *
 * MongoDB 4.2+ TÜM indeks kurulumlarını hibrit (arka planda) algoritmayla yapar; `background` seçeneği
 * Mongoose 8.x + mongodb sürücü 6.x'te ARTIK YOK SAYILIR (deprecated) — bilerek VERİLMEDİ.
 */
const mongoose = require('mongoose');

const TARGETS = {
    orders: {
        defaultCollection: 'Orders',
        indexes: [
            { fields: { internalStatus: 1, 'dates.orderDate': -1 }, name: 'internalStatus_1_dates.orderDate_-1' },
            { fields: { integrationCode: 1, 'dates.orderDate': -1 }, name: 'integrationCode_1_dates.orderDate_-1' },
        ],
    },
    exportStagedProducts: {
        defaultCollection: 'ExportStagedProducts',
        indexes: [
            {
                fields: { integrationCode: 1, status: 1, mode: 1, priorityScore: -1, createdAt: 1 },
                name: 'integrationCode_1_status_1_mode_1_priorityScore_-1_createdAt_1',
            },
        ],
    },
};

function resolveModel(ctx, key) {
    const target = TARGETS[key];
    const collectionName = (ctx.collectionOverrides && ctx.collectionOverrides[key]) || target.defaultCollection;
    const modelName = `D9Tenant__${key}__${collectionName}`;
    if (ctx.connection.models[modelName]) {
        return { model: ctx.connection.models[modelName], collectionName, indexes: target.indexes };
    }
    // strict:false — üretim `OrderSchema` strict:true'dur ama bu minimal şema yalnız İNDEKS BEYANI taşır,
    // alan doğrulaması yapmaz (bu göçün amacı değil; belge yazmaz).
    // autoIndex:false — KRİTİK: bu ZORUNLUDUR (bkz. 0001-d9-indexes-app.js AYNI notu). Mongoose varsayılanı
    // (`autoIndex:true`) model derlemesinden HEMEN SONRA arka planda `createIndexes()` ÇALIŞTIRIR — yalnız
    // `plan()` için (`collectionOverrides` YOKSA GERÇEK `Orders`/`ExportStagedProducts` adına) model kaydı
    // bile SESSİZCE ÜRETİM koleksiyonuna YAZARDI (bu yaşandı ve elle düzeltildi — bkz. görev raporu "Bulgu").
    const schema = new mongoose.Schema({}, { collection: collectionName, versionKey: false, strict: false, autoIndex: false });
    for (const idx of target.indexes) schema.index(idx.fields, { name: idx.name });
    const model = ctx.connection.model(modelName, schema, collectionName);
    return { model, collectionName, indexes: target.indexes };
}

async function planOne(ctx, key) {
    const { model, collectionName } = resolveModel(ctx, key);
    await model.createCollection().catch(() => undefined); // zaten varsa no-op (mevcut 'Orders'/'ExportStagedProducts' üretim koleksiyonları)
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
        await model.collection.createIndex(idx.fields, { name: idx.name }); // idempotent
        created.push(idx.name);
    }
    return { collection: collectionName, created };
}

async function downOne(ctx, key) {
    const { model, collectionName, indexes } = resolveModel(ctx, key);
    const dropped = [];
    for (const idx of indexes) {
        await model.collection.dropIndex(idx.name).catch(() => undefined); // idempotent
        dropped.push(idx.name);
    }
    return { collection: collectionName, dropped };
}

module.exports = {
    id: '0002-d9-indexes-tenant',
    scope: 'tenant',
    kind: 'index',
    description: "ADR-0021 D9 (Tenant): Orders {internalStatus,dates.orderDate}+{integrationCode,dates.orderDate} + ExportStagedProducts Dispatcher bileşiği (salt ekleme, expand, geri alınabilir).",
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: her koleksiyon için `Model.diffIndexes()` raporu (Karar 4; `syncIndexes()` KULLANILMAZ). */
    async plan(ctx) {
        return { collections: [await planOne(ctx, 'orders'), await planOne(ctx, 'exportStagedProducts')] };
    },

    /** İndeksleri kurar (`createIndex`, adlı, idempotent). */
    async up(ctx) {
        return { collections: [await upOne(ctx, 'orders'), await upOne(ctx, 'exportStagedProducts')] };
    },

    /** İndeksleri kaldırır (`dropIndex`, adlı, idempotent). */
    async down(ctx) {
        return { collections: [await downOne(ctx, 'orders'), await downOne(ctx, 'exportStagedProducts')] };
    },
};
