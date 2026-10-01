/**
 * BACKLOG bulgusu (BACKLOG.md ~satır 288, "image-service.ts getIntegrations()... GENİŞLETİLMİŞ bulgu"):
 * `image-service.ts`/`product-service.ts`/`variant-service.ts` içindeki `getIntegrations()`
 * (ve `image-service.ts`'in `getProduct()`) metotları `find(filterQuery, { projection })` şeklinde
 * ÇAĞRI YAPIYORDU — mongoose'un ikinci argümanı DOĞRUDAN alan-seçim nesnesi bekler (ör. `{settings:0}`),
 * burada `{projection:{settings:0}}` ile YANLIŞ SARMALANMIŞTI.
 *
 * Bu test GERÇEK bir MongoDB sürecine (mongodb-memory-server; izole/geçici, kural 1-2 kapsamı DIŞI — bkz.
 * `integrationConfigRevisions.mongoSemantics.test.ts` dosya başı notu) karşı İKİ ŞEKLİ de çalıştırıp GÖZLEMLER:
 * (a) YANLIŞ şekil (`{projection:{...}}`) sunucu hatası mı fırlatır yoksa sessizce TÜM alanları mı döner,
 * (b) DOĞRU şekil (`projection` doğrudan) `settings` alanını gerçekten dışarıda bırakır mı.
 *
 * Gözlemlenen sonuç (2026-09-29, gerçek çalıştırma): YANLIŞ şekil HATA FIRLATMAZ, sessizce TÜM alanları
 * (settings dahil) döner — mongoose ikinci argümanı bir "options" nesnesi olarak yorumlar, tanımadığı
 * `projection` anahtarını yok sayar (driver seviyesinde no-op). Yani gerçek üretimde bu ÇÖKME değil, B4
 * (gereksiz alan sızıntısı) türünde sessiz bir bug'dı: `settings` (entegrasyon API anahtarları/URL şablonları
 * içerebilir) istemciye/aramaya HER ZAMAN sızıyordu.
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';

jestGlobal.setTimeout(120000);

import { IntegrationSchema, IntegrationTypeSchema } from '@database/application/models/Integration';

let mongod: import('mongodb-memory-server').MongoMemoryServer;
let conn: mongoose.Connection;
let IntegrationModel: mongoose.Model<any>;
let IntegrationTypeModel: mongoose.Model<any>;

beforeAll(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    conn = await mongoose.createConnection(mongod.getUri() + 'integration_projection_test').asPromise();
    IntegrationModel = conn.model('Integration', IntegrationSchema);
    IntegrationTypeModel = conn.model('integration_type', IntegrationTypeSchema);
});

afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
    await mongod?.stop();
});

beforeEach(async () => {
    await IntegrationModel.deleteMany({});
    await IntegrationTypeModel.deleteMany({});
});

async function seed() {
    const type = await IntegrationTypeModel.create({ code: 'marketplace' });
    await IntegrationModel.create([
        {
            code: 'trendyol',
            title: 'Trendyol',
            type: type._id,
            color: '#f27a1a',
            urls: { base: 'https://api.trendyol.com' },
            logo: 'trendyol.png',
            width: 100,
            settings: { apiKey: 'gizli-anahtar-123', apiSecret: 'gizli-sir-456' },
        },
        {
            code: 'n11',
            title: 'N11',
            type: type._id,
            color: '#6d2077',
            urls: { base: 'https://api.n11.com' },
            logo: 'n11.png',
            width: 100,
            settings: {},
        },
    ]);
    return type;
}

describe('Integration.find() projeksiyon şekli — gerçek MongoDB davranışı', () => {
    it('[GÖZLEM] üretim kodundaki YANLIŞ şekil find(filter, { projection }) HATA FIRLATMAZ, sessizce TÜM alanları (settings dahil) döner', async () => {
        await seed();
        const filterQuery = {};
        const projection = { settings: 0 };
        // Üretim kodunda olduğu GİBİ: { projection } ile sarmalanmış ikinci argüman.
        const docs: any[] = await IntegrationModel.find(filterQuery, { projection } as any);

        expect(docs.length).toBe(2);
        const trendyol = docs.find((d) => d.code === 'trendyol');
        // GÖZLEM: settings alanı SIZIYOR — projeksiyon hiç uygulanmamış.
        expect(trendyol.settings).toBeDefined();
        expect(trendyol.settings.apiKey).toBe('gizli-anahtar-123');
    });

    it('[DÜZELTME DOĞRULAMASI] doğru şekil find(filter, projection) settings alanını GERÇEKTEN dışarıda bırakır', async () => {
        await seed();
        const filterQuery = {};
        const projection = { settings: 0 };
        // Düzeltilmiş üretim koduyla BİREBİR aynı: projection doğrudan ikinci argüman.
        const docs: any[] = await IntegrationModel.find(filterQuery, projection);

        expect(docs.length).toBe(2);
        const trendyol = docs.find((d) => d.code === 'trendyol');
        expect(trendyol.settings).toBeUndefined();
        // Diğer alanlar hâlâ mevcut (yalnızca settings dışlandı).
        expect(trendyol.title).toBe('Trendyol');
        expect(trendyol.color).toBe('#f27a1a');
    });

    it('[DÜZELTME DOĞRULAMASI] getProduct şeklindeki dahil-etme projeksiyonu (title:1,_id:0) da doğrudan verilince çalışır', async () => {
        const type = await IntegrationTypeModel.create({ code: 'marketplace' });
        const doc: any = await IntegrationModel.create({
            code: 'hb', title: 'Hepsiburada', type: type._id, color: '#ff6000',
            urls: {}, logo: 'hb.png', width: 100, settings: { apiKey: 'x' },
        });
        const projection = { title: 1, _id: 0 };
        const docs: any[] = await IntegrationModel.find({ _id: doc._id }, projection);
        expect(docs.length).toBe(1);
        expect(docs[0].toObject()).toEqual({ title: 'Hepsiburada' });
    });
});
