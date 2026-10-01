/**
 * DB-04 / ADR-0021 D13: ExportStagedProducts `logs[]` yazma tarafında `$push {$each,$slice:-20}` ile sınırlı.
 * QueryBuilderOperations'ın GERÇEK update belgesi gerçek Mongo'da çalıştırılır (`mongodb-memory-server`, izole/geçici):
 * 50 ardışık yazımdan sonra dizi 20 eleman, SON 20 giriş, kronolojik sırada; okuma tarafı (sıralama/`FAILED` seçimi) aynı çalışır.
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';

jestGlobal.setTimeout(120000);

import { QueryBuilderOperations } from '@operations/integration/QueryBuilderOperations';
import { STAGED_LOGS_MAX } from '@operations/integration/stagedLogs';

let mongod: import('mongodb-memory-server').MongoMemoryServer;
let conn: mongoose.Connection;

beforeAll(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    conn = await mongoose.createConnection(mongod.getUri() + 'db04_logs_test').asPromise();
});
afterAll(async () => { await conn?.dropDatabase(); await conn?.close(); await mongod?.stop(); });

describe('DB-04 ESP logs $slice', () => {
    it('50 yazım sonrası logs 20 eleman, son 20 giriş, kronolojik sıra; ilk (QUEUED) girişler düşer', async () => {
        const col = conn.collection('ExportStagedProducts');
        const { insertedId } = await col.insertOne({ status: 'QUEUED', logs: [{ status: 'QUEUED', worker: 'BatchCreator', message: 'ilk', timestamp: new Date(0) }] });
        for (let i = 1; i <= 50; i++) {
            const { updateOne } = QueryBuilderOperations.prepareStagingUpdateOp(insertedId, 'W', i === 50 ? 'FAILED' : 'SENT', { message: `m${i}`, updatedAt: new Date(i * 1000) });
            await col.updateOne(updateOne.filter, updateOne.update as any);
        }
        const doc: any = await col.findOne({ _id: insertedId });
        expect(doc.logs).toHaveLength(STAGED_LOGS_MAX);
        expect(doc.logs.map((l: any) => l.message)).toEqual(Array.from({ length: 20 }, (_, k) => `m${31 + k}`));
        expect(doc.logs.filter((l: any) => l.status === 'FAILED').pop().message).toBe('m50'); // integration-service:622 okuma davranışı
    });

    it('sınırın altında dizi olduğu gibi büyür (20 altı kırpma yok)', async () => {
        const col = conn.collection('ExportStagedProducts');
        const { insertedId } = await col.insertOne({ status: 'QUEUED', logs: [] });
        for (let i = 1; i <= 3; i++) {
            const { updateOne } = QueryBuilderOperations.prepareStagingUpdateOp(insertedId, 'W', 'SENT', { message: `m${i}` });
            await col.updateOne(updateOne.filter, updateOne.update as any);
        }
        expect(((await col.findOne({ _id: insertedId })) as any).logs).toHaveLength(3);
    });
});
