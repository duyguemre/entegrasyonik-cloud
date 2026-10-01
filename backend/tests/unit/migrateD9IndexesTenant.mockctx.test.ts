/**
 * ADR-0021 Karar 5.2 — `backend/migrations/0002-d9-indexes-tenant.js` için BİRİM testi (mock `ctx`; Mongo YOK).
 * Desen `tests/unit/migrateExample.mockctx.test.ts` / `migrateD9IndexesApp.mockctx.test.ts` ile AYNI.
 * Gerçek-Mongo kanıtı: `tests/integration/migrate.d9IndexesTenant.realmongo.test.ts`.
 */
import { describe, it, expect, jest as jestGlobal } from '@jest/globals';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require('../../migrations/0002-d9-indexes-tenant');

interface DiffResult { toCreate: Array<[Record<string, unknown>, { name?: string }]>; toDrop: string[] }

function makeMockCtx(diffByKey: Record<string, DiffResult> = {}) {
    const models: Record<string, any> = {};
    const spiesByCollection: Record<string, any> = {};

    function registerFixedModel(modelName: string, collectionName: string, diffResult: DiffResult) {
        const createIndex = jestGlobal.fn(async () => undefined);
        const dropIndex = jestGlobal.fn(async () => undefined);
        const createCollection = jestGlobal.fn(async () => undefined);
        const diffIndexes = jestGlobal.fn(async (_opts?: any) => diffResult);
        const model = { createCollection, diffIndexes, collection: { createIndex, dropIndex } };
        models[modelName] = model;
        spiesByCollection[collectionName] = { createIndex, dropIndex, createCollection, diffIndexes };
        return model;
    }

    registerFixedModel('D9Tenant__orders__Orders', 'Orders', diffByKey.orders || { toCreate: [], toDrop: [] });
    registerFixedModel(
        'D9Tenant__exportStagedProducts__ExportStagedProducts',
        'ExportStagedProducts',
        diffByKey.exportStagedProducts || { toCreate: [], toDrop: [] },
    );

    const connection = { models, model: jestGlobal.fn((name: string) => models[name]) };
    return { connection, __spies: spiesByCollection };
}

describe('0002-d9-indexes-tenant.js — biçim (id/scope/kind/description/plan/up/down)', () => {
    it('ADR-0021 Karar 4 alan listesine uyar', () => {
        expect(migration.id).toBe('0002-d9-indexes-tenant');
        expect(migration.scope).toBe('tenant');
        expect(migration.kind).toBe('index');
        expect(typeof migration.description).toBe('string');
        expect(typeof migration.plan).toBe('function');
        expect(typeof migration.up).toBe('function');
        expect(typeof migration.down).toBe('function');
    });
});

describe('0002-d9-indexes-tenant.js — plan (mock ctx, DEĞER YAZMAZ)', () => {
    it('her iki koleksiyon için diffIndexes() çağırır ve raporu ADAPTE EDER (syncIndexes YOK)', async () => {
        const ctx = makeMockCtx({
            orders: {
                toCreate: [
                    [{ internalStatus: 1, 'dates.orderDate': -1 }, { name: 'internalStatus_1_dates.orderDate_-1' }],
                    [{ integrationCode: 1, 'dates.orderDate': -1 }, { name: 'integrationCode_1_dates.orderDate_-1' }],
                ],
                toDrop: [],
            },
            exportStagedProducts: {
                toCreate: [[{ integrationCode: 1, status: 1, mode: 1, priorityScore: -1, createdAt: 1 }, { name: 'integrationCode_1_status_1_mode_1_priorityScore_-1_createdAt_1' }]],
                toDrop: [],
            },
        });
        const report = await migration.plan(ctx);
        expect(report).toEqual({
            collections: [
                { collection: 'Orders', toCreate: ['internalStatus_1_dates.orderDate_-1', 'integrationCode_1_dates.orderDate_-1'], toDrop: [] },
                { collection: 'ExportStagedProducts', toCreate: ['integrationCode_1_status_1_mode_1_priorityScore_-1_createdAt_1'], toDrop: [] },
            ],
        });
        expect(ctx.__spies.Orders.createIndex).not.toHaveBeenCalled(); // plan YAZMAZ
        expect(ctx.__spies.ExportStagedProducts.createIndex).not.toHaveBeenCalled();
    });
});

describe('0002-d9-indexes-tenant.js — up/down (mock ctx)', () => {
    it('up: Orders için İKİ adlı createIndex + ExportStagedProducts için BİR adlı createIndex çağırır', async () => {
        const ctx = makeMockCtx();
        const result = await migration.up(ctx);
        expect(ctx.__spies.Orders.createIndex).toHaveBeenNthCalledWith(1, { internalStatus: 1, 'dates.orderDate': -1 }, { name: 'internalStatus_1_dates.orderDate_-1' });
        expect(ctx.__spies.Orders.createIndex).toHaveBeenNthCalledWith(2, { integrationCode: 1, 'dates.orderDate': -1 }, { name: 'integrationCode_1_dates.orderDate_-1' });
        expect(ctx.__spies.ExportStagedProducts.createIndex).toHaveBeenCalledWith(
            { integrationCode: 1, status: 1, mode: 1, priorityScore: -1, createdAt: 1 },
            { name: 'integrationCode_1_status_1_mode_1_priorityScore_-1_createdAt_1' },
        );
        expect(result).toEqual({
            collections: [
                { collection: 'Orders', created: ['internalStatus_1_dates.orderDate_-1', 'integrationCode_1_dates.orderDate_-1'] },
                { collection: 'ExportStagedProducts', created: ['integrationCode_1_status_1_mode_1_priorityScore_-1_createdAt_1'] },
            ],
        });
    });

    it('down: Orders için İKİ adlı dropIndex + ExportStagedProducts için BİR adlı dropIndex çağırır', async () => {
        const ctx = makeMockCtx();
        const result = await migration.down(ctx);
        expect(ctx.__spies.Orders.dropIndex).toHaveBeenNthCalledWith(1, 'internalStatus_1_dates.orderDate_-1');
        expect(ctx.__spies.Orders.dropIndex).toHaveBeenNthCalledWith(2, 'integrationCode_1_dates.orderDate_-1');
        expect(ctx.__spies.ExportStagedProducts.dropIndex).toHaveBeenCalledWith('integrationCode_1_status_1_mode_1_priorityScore_-1_createdAt_1');
        expect(result).toEqual({
            collections: [
                { collection: 'Orders', dropped: ['internalStatus_1_dates.orderDate_-1', 'integrationCode_1_dates.orderDate_-1'] },
                { collection: 'ExportStagedProducts', dropped: ['integrationCode_1_status_1_mode_1_priorityScore_-1_createdAt_1'] },
            ],
        });
    });

    it('up → down → up İDEMPOTENT çağrılabilir', async () => {
        const ctx = makeMockCtx();
        await migration.up(ctx);
        await migration.down(ctx);
        await migration.up(ctx);
        expect(ctx.__spies.Orders.createIndex).toHaveBeenCalledTimes(4); // 2 indeks x 2 up
        expect(ctx.__spies.Orders.dropIndex).toHaveBeenCalledTimes(2); // 2 indeks x 1 down
        expect(ctx.__spies.ExportStagedProducts.createIndex).toHaveBeenCalledTimes(2);
        expect(ctx.__spies.ExportStagedProducts.dropIndex).toHaveBeenCalledTimes(1);
    });
});

describe('0002-d9-indexes-tenant.js — collectionOverrides (test izolasyonu deseni)', () => {
    it('ctx.collectionOverrides ile FARKLI model adı/koleksiyon kullanılır (gerçek üretim koleksiyonuna dokunmaz)', async () => {
        const model = {
            createCollection: jestGlobal.fn(async () => undefined),
            diffIndexes: jestGlobal.fn(async () => ({ toCreate: [], toDrop: [] })),
            collection: { createIndex: jestGlobal.fn(async () => undefined), dropIndex: jestGlobal.fn(async () => undefined) },
        };
        const models: Record<string, any> = {
            'D9Tenant__orders__zzTest_Foo_Orders': model,
            'D9Tenant__exportStagedProducts__zzTest_Foo_ExportStagedProducts': model,
        };
        const ctx = {
            connection: { models, model: jestGlobal.fn((name: string) => models[name]) },
            collectionOverrides: { orders: 'zzTest_Foo_Orders', exportStagedProducts: 'zzTest_Foo_ExportStagedProducts' },
        };
        const result = await migration.up(ctx as any);
        expect(result.collections[0].collection).toBe('zzTest_Foo_Orders');
        expect(result.collections[1].collection).toBe('zzTest_Foo_ExportStagedProducts');
    });
});
