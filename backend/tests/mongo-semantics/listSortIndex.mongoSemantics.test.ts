/**
 * DB-02 / DBR-06: liste aggregate'lerinde `$sort` `$facet` DIŞINDA (`$match -> $sort -> $facet`) => uygun indeks varsa
 * sıralama IXSCAN ile karşılanır (blocking SORT aşaması yok). `mongodb-memory-server` (izole/geçici; gerçek DB'ye dokunmaz).
 * CustomerService'in GERÇEK pipeline'ı yakalanıp gerçek CustomerSchema indeksleriyle `explain` edilir.
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';

jestGlobal.setTimeout(120000);

import { CustomerSchema } from '@database/client/models/Customer';
import CustomerService from '@api/services/customer-service';

let mongod: import('mongodb-memory-server').MongoMemoryServer;
let conn: mongoose.Connection;
let Customer: mongoose.Model<any>;

beforeAll(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    conn = await mongoose.createConnection(mongod.getUri() + 'db02_sort_test').asPromise();
    Customer = conn.model('Customer', CustomerSchema);
    await Customer.syncIndexes();
    await Customer.insertMany(Array.from({ length: 30 }, (_, i) => ({ firstName: `n${i}`, email: `e${String(i).padStart(2, '0')}@x.com`, metrics: { totalSpent: i } })));
});

afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
    await mongod?.stop();
});

function stagesOf(plan: any): string[] {
    const out: string[] = [];
    const walk = (n: any) => { if (!n || typeof n !== 'object') return; if (n.stage) out.push(n.stage); Object.values(n).forEach(walk); };
    walk(plan);
    return out;
}

async function capturePipeline(request: any): Promise<any[]> {
    let captured: any[] = [];
    const svc: any = new CustomerService(1, request);
    svc.clientDB = { getCustomerModel: () => ({ aggregate: async (p: any[]) => { captured = p; return Customer.aggregate(p); } }) };
    await svc.getCustomers();
    return captured;
}

describe('DB-02 liste sorgusu indeks kullanımı (explain)', () => {
    it('sonuç şekli ve sıralaması aynı: email azalan, sayfa 1/limit 15, toplam 30', async () => {
        const svc: any = new CustomerService(1, { sortBy: { key: 'email', order: 'desc' } });
        svc.clientDB = { getCustomerModel: () => Customer };
        const res = await svc.getCustomers();
        expect(res.totalNumberOfRecords).toBe(30);
        expect(res.customers).toHaveLength(15);
        expect(res.customers[0].email).toBe('e29@x.com');
        expect(res.customers[14].email).toBe('e15@x.com');
    });

    it('$sort $facet dışında => email sıralaması IXSCAN (email_1) kullanır, blocking SORT yok', async () => {
        const pipeline = await capturePipeline({ sortBy: { key: 'email', order: 'desc' } });
        expect(pipeline.map((s) => Object.keys(s)[0])).toEqual(['$match', '$sort', '$facet']);
        const plan = await Customer.aggregate(pipeline).explain('queryPlanner');
        const stages = stagesOf(plan);
        expect(stages).toContain('IXSCAN');
        expect(stages).not.toContain('SORT');
    });

    it('KARŞILAŞTIRMA (eski şekil): $sort $facet içinde => IXSCAN yok, COLLSCAN', async () => {
        const plan = await Customer.aggregate([
            { $match: {} },
            { $facet: { data: [{ $sort: { email: -1 } }, { $skip: 0 }, { $limit: 15 }] } },
        ]).explain('queryPlanner');
        const stages = stagesOf(plan);
        expect(stages).not.toContain('IXSCAN');
    });
});
