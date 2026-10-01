'use strict';
/**
 * ADR-0021 Karar 4 — ÇERÇEVE İSKELETİ/ÖRNEĞİ. GERÇEK bir üretim göçü (D3/D4b/D9/vb.) DEĞİLDİR ve üretim
 * şemasına HİÇ DOKUNMAZ: yalnız bu dosyanın kendi tanımladığı, `ApplicationDB`'de (`entegrasyonikDB`)
 * kayıtsız/self-test amaçlı bir koleksiyonda (varsayılan ad `MigrationFrameworkSelfTest`) bir indeks
 * kurar/kaldırır. Amaç: göç dosyası biçimini (`id/scope/kind/description/plan/up/down`) VE Karar 4'ün
 * "`plan` komutu `Model.diffIndexes()` ile üretir, `syncIndexes()` KULLANILMAZ" kuralını kanıtlamak.
 *
 * `ctx.collectionName`/`ctx.indexName` enjekte edilebilir (testler `zzTest_`/rastgele adlarla izole eder;
 * gerçek CLI çalıştırmasında varsayılan sabit adlar kullanılır — bu koleksiyon zaten kendisi bir framework
 * self-test kayıt alanıdır, üretim verisi TAŞIMAZ).
 */
const mongoose = require('mongoose');

const DEFAULT_COLLECTION = 'MigrationFrameworkSelfTest';
const DEFAULT_INDEX_NAME = 'probe_1';

function resolveModel(ctx) {
    const collectionName = ctx.collectionName || DEFAULT_COLLECTION;
    const indexName = ctx.indexName || DEFAULT_INDEX_NAME;
    const modelName = `MigrationFrameworkSelfTest__${collectionName}`;
    if (ctx.connection.models[modelName]) {
        return { model: ctx.connection.models[modelName], collectionName, indexName };
    }
    const schema = new mongoose.Schema({
        probe: { type: String, required: true },
    }, { collection: collectionName, versionKey: false, strict: true });
    schema.index({ probe: 1 }, { name: indexName });
    const model = ctx.connection.model(modelName, schema, collectionName);
    return { model, collectionName, indexName };
}

module.exports = {
    id: '0000-example',
    scope: 'app',
    kind: 'index',
    description: 'Çerçeve iskeleti: sentetik self-test koleksiyonunda örnek indeks (GERÇEK şemaya dokunmaz).',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: `Model.diffIndexes()` ile "şemada var/DB'de yok" + "DB'de var/şemada yok" raporu (Karar 4). */
    async plan(ctx) {
        const { model, collectionName } = resolveModel(ctx);
        await model.createCollection().catch(() => undefined); // diffIndexes koleksiyon yoksa da çalışır ama açıkça garanti eder
        // `indexOptionsToCreate:true`: `toCreate` öğeleri `[alanlar, seçenekler]` çifti döner (seçenekler `name` içerir);
        // varsayılan (`false`) yalnız ALAN nesnesini döner (`name` YOK) — adlı rapor için bu seçenek gerekli.
        const diff = await model.diffIndexes({ indexOptionsToCreate: true });
        return {
            collection: collectionName,
            toCreate: diff.toCreate.map(([, options]) => (options && options.name) || 'ad-yok'),
            toDrop: diff.toDrop,
        };
    },

    /** İndeksi kurar. `createIndex` ile — `syncIndexes()` KULLANILMAZ (Karar 4: beyan dışı indeksi habersiz SİLMEZ). */
    async up(ctx) {
        const { model, collectionName, indexName } = resolveModel(ctx);
        await model.createCollection().catch(() => undefined);
        await model.collection.createIndex({ probe: 1 }, { name: indexName });
        return { collection: collectionName, created: [indexName] };
    },

    /** İndeksi kaldırır (idempotent: yoksa sessizce geçer). */
    async down(ctx) {
        const { model, collectionName, indexName } = resolveModel(ctx);
        await model.collection.dropIndex(indexName).catch(() => undefined);
        return { collection: collectionName, dropped: [indexName] };
    },
};
