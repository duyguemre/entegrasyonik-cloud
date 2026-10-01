/**
 * DB-08 / ADR-0021 D8: kök bağlantıda `autoIndex:false` => `useDb` tutamağındaki modeller şema indekslerini KENDİLİĞİNDEN kurmaz;
 * `Database.ensureIndexes()` (provizyon adımı) kurar. `autoIndex` açıkken (varsayılan local) indeksler kurulur.
 * `mongodb-memory-server` (izole/geçici; gerçek DB'ye dokunmaz).
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';

jestGlobal.setTimeout(120000);

import Database from '@database/Database';
import { config } from '@config';

let mongod: import('mongodb-memory-server').MongoMemoryServer;
const opened: Database[] = [];

const getModels = (conn: mongoose.Connection) => {
    const schema = new mongoose.Schema({ email: { type: String, index: true }, sku: { type: String, unique: true, sparse: true } }, { collection: 'Things' });
    return { thing: conn.model('Thing', schema) } as any;
};

async function indexNames(db: Database, tenant: string): Promise<string[]> {
    const model: any = (db as any).getModel('thing');
    try { return (await model.collection.indexes()).map((i: any) => i.name).sort(); } catch { return []; }
}

beforeAll(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
});
afterAll(async () => { await Promise.all(opened.map((d) => d.close())); await mongod?.stop(); });

async function open(autoIndex: boolean, name: string): Promise<Database> {
    (config as any).db; // Proxy: getConfig() önbelleği
    const orig = process.env.DB_AUTO_INDEX;
    process.env.DB_AUTO_INDEX = String(autoIndex);
    const { resetConfigForTests } = require('@config');
    resetConfigForTests();
    try {
        const root = await Database.getInstance({ url: mongod.getUri() + '{{DBNAME}}', user: '', password: '', dbname: name, poolsize: 2 } as any, getModels);
        opened.push(root);
        return root;
    } finally {
        if (orig === undefined) delete process.env.DB_AUTO_INDEX; else process.env.DB_AUTO_INDEX = orig;
        resetConfigForTests();
    }
}

describe('DB-08 autoIndex bağlantı ayarı', () => {
    it('DB_AUTO_INDEX=false: tenant tutamağında indeks kendiliğinden kurulmaz; ensureIndexes() kurar (idempotent)', async () => {
        const root = await open(false, 'db08_off');
        const tenant = root.useDb('db08_off_tenant', getModels);
        await new Promise((r) => setTimeout(r, 500)); // autoIndex açık olsaydı kurulacağı süre
        expect((await indexNames(tenant, 't')).filter((n) => n !== '_id_')).toEqual([]);
        await tenant.ensureIndexes();
        await tenant.ensureIndexes();
        expect((await indexNames(tenant, 't')).filter((n) => n !== '_id_')).toEqual(['email_1', 'sku_1']);
    });

    it('DB_AUTO_INDEX=true (varsayılan local): indeksler kendiliğinden kurulur', async () => {
        const root = await open(true, 'db08_on');
        const tenant = root.useDb('db08_on_tenant', getModels);
        const model: any = (tenant as any).getModel('thing');
        await model.init();
        expect((await indexNames(tenant, 't')).filter((n) => n !== '_id_')).toEqual(['email_1', 'sku_1']);
    });
});
