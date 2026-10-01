/**
 * ADR-0024 D2 / P0-DB adım 6: tek MongoClient + `useDb` semantiği — GERÇEK (geçici, bellek-içi) MongoDB'ye karşı.
 * mongodb-memory-server izole/geçici bir süreçtir (kural 1-2 kapsamı dışı; bkz. integrationConfigRevisions.mongoSemantics dosya başı).
 * Ad/kimlikler sentetiktir. Doğrulananlar: iki tenant DB'si TEK istemcide, izolasyon, dropDatabase yalnız o tenant'ı siler,
 * eşzamanlı getInstance, invalidate sonrası yeniden açılışta model yeniden derleme hatası yok, invalidate/tahliyede uçuştaki sorgu
 * korunur, ping kökte, kapanışta kök gerçekten kapanır.
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, jest as jestGlobal } from '@jest/globals';

jestGlobal.setTimeout(120000);

jestGlobal.mock('@database/rootConnection', () => ({ __esModule: true, getRootDatabase: jestGlobal.fn(), getAppDbConfig: jestGlobal.fn() }));

import Database from '@database/Database';
import ClientDB from '@database/client/ClientDB';
import { getRootDatabase } from '@database/rootConnection';

let mongod: import('mongodb-memory-server').MongoMemoryServer;
let root: Database;
const A = { _id: 'id-a', dbConfig: { dbname: 'entegrasyonikClient_9001' } };
const B = { _id: 'id-b', dbConfig: { dbname: 'entegrasyonikClient_9002' } };

beforeAll(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    jestGlobal.spyOn(console, 'log').mockImplementation(() => undefined);
    root = await Database.getInstance(
        { url: mongod.getUri() + 'entegrasyonik_test_root', user: '', password: '', dbname: 'entegrasyonik_test_root', poolsize: 5 },
        () => ({}),
    );
    (getRootDatabase as unknown as jestGlobal.Mock<any>).mockImplementation(async () => root);
    ClientDB.resetForTests();
});

afterAll(async () => {
    await root?.close();
    await mongod?.stop();
});

describe('tenant useDb — gerçek Mongo semantiği', () => {
    it('iki tenant DB\'si tek istemcide: veri izolasyonu (aynı koleksiyon adı, farklı DB)', async () => {
        const a = await ClientDB.getInstance(A as any);
        const b = await ClientDB.getInstance(B as any);
        expect(a).not.toBe(b);
        const ca = (a as any).database.getModel('order').db.collection('probe');
        const cb = (b as any).database.getModel('order').db.collection('probe');
        await ca.insertOne({ v: 'a' });
        expect(await ca.countDocuments()).toBe(1);
        expect(await cb.countDocuments()).toBe(0);
        expect((a as any).database.getModel('order').db.name).toBe(A.dbConfig.dbname);
        expect((b as any).database.getModel('order').db.name).toBe(B.dbConfig.dbname);
    });

    it('tek istemci: iki tenant tutamağı aynı MongoClient\'ı paylaşır', async () => {
        const a: any = await ClientDB.getInstance(A as any);
        const b: any = await ClientDB.getInstance(B as any);
        const ma = a.database.getModel('order').db.getClient();
        const mb = b.database.getModel('order').db.getClient();
        expect(ma).toBe(mb);
    });

    it('eşzamanlı getInstance tek tutamak döner', async () => {
        ClientDB.resetForTests();
        const res = await Promise.all([1, 2, 3, 4, 5].map(() => ClientDB.getInstance(A as any)));
        expect(new Set(res).size).toBe(1);
        expect(ClientDB.size).toBe(1);
    });

    it('invalidate sonrası yeniden açılış: model yeniden derleme hatası YOK ve sorgular çalışır', async () => {
        const first: any = await ClientDB.getInstance(A as any);
        await ClientDB.invalidate('id-a');
        const second: any = await ClientDB.getInstance(A as any);
        expect(second).not.toBe(first);
        await expect(second.getOrderModel().countDocuments({})).resolves.toBeGreaterThanOrEqual(0);
    });

    it('invalidate/tahliye uçuştaki sorguyu KESMEZ (bağlantı kapanmaz)', async () => {
        const a: any = await ClientDB.getInstance(A as any);
        const inflight = a.getOrderModel().countDocuments({});
        await ClientDB.invalidate('id-a');
        await expect(inflight).resolves.toBeGreaterThanOrEqual(0);
        await expect(a.getOrderModel().countDocuments({})).resolves.toBeGreaterThanOrEqual(0);
    });

    it('dropDatabase yalnız o tenant DB\'sini siler; diğer tenant verisi durur', async () => {
        ClientDB.resetForTests();
        const a: any = await ClientDB.getInstance(A as any);
        const b: any = await ClientDB.getInstance(B as any);
        await a.database.getModel('order').db.collection('probe').insertOne({ v: 1 });
        await b.database.getModel('order').db.collection('probe').insertOne({ v: 2 });
        await a.dropDatabase();
        expect(await a.database.getModel('order').db.collection('probe').countDocuments()).toBe(0);
        expect(await b.database.getModel('order').db.collection('probe').countDocuments()).toBe(1);
    });

    it('ping kök bağlantıda çalışır (tenant tutamağı üzerinden de)', async () => {
        const a: any = await ClientDB.getInstance(A as any);
        await expect(root.ping()).resolves.toBe(true);
        await expect(a.database.ping()).resolves.toBe(true);
    });

    it('tenant tutamağı close() kökü kapatmaz', async () => {
        const a: any = await ClientDB.getInstance(A as any);
        await a.database.close(); // no-op
        await expect(root.ping()).resolves.toBe(true);
    });
});
