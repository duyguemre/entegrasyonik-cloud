/**
 * DB-03: sıcak okuma projeksiyonları GERÇEK Mongo semantiğiyle: (1) ClientIntegrations `-erp.settings.catalog` dizi içi
 * alt alanı düşürür, gerisini korur; (2) stok tarama projeksiyonu StockPublishTrigger'ın okuduğu her alanı döndürür ve
 * `platforms.<kod>.attributes` gibi ağır alanları taşımaz. `mongodb-memory-server` (izole/geçici).
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';

jestGlobal.setTimeout(120000);

import { ClientIntegrationSchema } from '@database/client/models/ClientIntegration';
import { VariantSchema } from '@database/client/models/Variant';
import { CLIENT_INTEGRATION_HOT_PROJECTION, stockScanProjection } from '@database/projections';
import { StockAllocator } from '@operations/stock/StockAllocator';

let mongod: import('mongodb-memory-server').MongoMemoryServer;
let conn: mongoose.Connection;

beforeAll(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    conn = await mongoose.createConnection(mongod.getUri() + 'db03_projection_test').asPromise();
});
afterAll(async () => { await conn?.dropDatabase(); await conn?.close(); await mongod?.stop(); });

describe('DB-03 projeksiyonlar', () => {
    it('ClientIntegrations: -erp.settings.catalog dizi içinde katalogu düşürür, marketplace/erp diğer alanlarını korur', async () => {
        const col = conn.collection('ClientIntegrations');
        await col.insertOne({
            marketplace: [{ code: 'trendyol', order: 1, status: true, settings: { a: 1 } }],
            erp: [{ code: 'bizimhesap', order: 1, settings: { key: 'k', catalog: { brands: new Array(50).fill({ id: 1, name: 'x' }) } } }],
            stockPolicy: { primaryChannel: 'trendyol' },
        });
        const doc: any = await conn.model('CI', ClientIntegrationSchema, 'ClientIntegrations').findOne({}, CLIENT_INTEGRATION_HOT_PROJECTION).lean();
        expect(doc.marketplace[0]).toMatchObject({ code: 'trendyol', settings: { a: 1 } });
        expect(doc.stockPolicy.primaryChannel).toBe('trendyol');
        expect(doc.erp[0].code).toBe('bizimhesap');
        expect(doc.erp[0].settings.key).toBe('k');
        expect(doc.erp[0].settings.catalog).toBeUndefined();
    });

    it('Variants tarama projeksiyonu: gereken alanlar gelir (available, TRANSFER durumu, stockSync, X2 alanları), ağır alanlar gelmez', async () => {
        const Variant = conn.model('V', VariantSchema, 'Variants');
        const now = new Date();
        await conn.collection('Variants').insertOne({
            productId: new mongoose.Types.ObjectId(), stockcode: 'S1', barcode: 'B1', stock: 10, reserved: 3, stockDirty: true, stockDirtyAt: now, stockVersion: 4,
            description: 'x'.repeat(5000),
            platforms: { trendyol: { upload: { TRANSFER: { status: 'COMPLETED' }, UPDATE_STOCK: { status: 'X' } }, attributes: { big: 'y'.repeat(5000) }, stockSync: { lastPublishedQty: 7 } }, n11: { attributes: { z: 1 } } },
        });
        const proj = stockScanProjection(['trendyol', 'n11'])!;
        const [v]: any[] = await Variant.find({ stockDirty: true }, proj).lean();
        expect(StockAllocator.available(v)).toBe(7);
        expect(v.barcode).toBe('B1'); expect(v.stockcode).toBe('S1'); expect(v.productId).toBeDefined();
        expect(v.stockVersion).toBe(4); expect(v.stockDirtyAt.getTime()).toBe(now.getTime());
        expect(v.platforms.trendyol.upload.TRANSFER.status).toBe('COMPLETED');
        expect(v.platforms.trendyol.stockSync.lastPublishedQty).toBe(7);
        expect(v.platforms.trendyol.attributes).toBeUndefined();
        expect(v.platforms.trendyol.upload.UPDATE_STOCK).toBeUndefined();
        expect(v.description).toBeUndefined();
        expect(Buffer.byteLength(JSON.stringify(v))).toBeLessThan(600);
    });

    it('güvensiz kanal kodu => projeksiyon yok (tam belge, eski davranış)', () => {
        expect(stockScanProjection(['a.b'])).toBeUndefined();
        expect(stockScanProjection([undefined])).toBeUndefined();
    });
});
