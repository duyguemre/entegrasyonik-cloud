/**
 * ADR-0021 Karar 5.2 — `backend/migrations/0000-example.js` (çerçeve iskeleti) için BİRİM testi
 * (mock `ctx`; Mongo YOK). Gerçek-Mongo kanıtı: `tests/integration/migrate.exampleMigration.realmongo.test.ts`.
 */
import { describe, it, expect, jest as jestGlobal } from '@jest/globals';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const example = require('../../migrations/0000-example');

interface DiffResult { toCreate: Array<[Record<string, unknown>, { name?: string }]>; toDrop: string[] }

function makeMockCtx({ diffResult = { toCreate: [], toDrop: [] } }: { diffResult?: DiffResult } = {}) {
    const createIndex = jestGlobal.fn(async () => undefined);
    const dropIndex = jestGlobal.fn(async () => undefined);
    const createCollection = jestGlobal.fn(async () => undefined);
    const diffIndexes = jestGlobal.fn(async (_opts?: any) => diffResult);
    const model = { createCollection, diffIndexes, collection: { createIndex, dropIndex } };
    const models: Record<string, any> = {};
    const connection = {
        models,
        model: jestGlobal.fn((name: string) => { models[name] = model; return model; }),
    };
    return { connection, collectionName: 'MigrationFrameworkSelfTest_mock', indexName: 'probe_1_mock', __spies: { createIndex, dropIndex, createCollection, diffIndexes, modelFn: connection.model } };
}

describe('0000-example.js — biçim (id/scope/kind/description/plan/up/down)', () => {
    it('ADR-0021 Karar 4 alan listesine uyar', () => {
        expect(example.id).toBe('0000-example');
        expect(example.scope).toBe('app');
        expect(['index', 'expand', 'migrate', 'contract']).toContain(example.kind);
        expect(typeof example.description).toBe('string');
        expect(typeof example.plan).toBe('function');
        expect(typeof example.up).toBe('function');
        expect(typeof example.down).toBe('function');
        expect(typeof example.batchSize).toBe('number');
        expect(typeof example.throttleMs).toBe('number');
    });
});

describe('0000-example.js — plan (mock ctx, DEĞER YAZMAZ)', () => {
    it('diffIndexes() çağırır ve raporu ADAPTE EDER (syncIndexes YOK)', async () => {
        const ctx = makeMockCtx({ diffResult: { toCreate: [[{ probe: 1 }, { name: 'probe_1_mock' }]], toDrop: ['eski_indeks_1'] } });
        const report = await example.plan(ctx);
        expect(ctx.__spies.diffIndexes).toHaveBeenCalledWith({ indexOptionsToCreate: true });
        expect(report).toEqual({ collection: 'MigrationFrameworkSelfTest_mock', toCreate: ['probe_1_mock'], toDrop: ['eski_indeks_1'] });
        expect(ctx.__spies.createIndex).not.toHaveBeenCalled(); // plan YAZMAZ
    });
});

describe('0000-example.js — up/down (mock ctx)', () => {
    it('up: createIndex çağırır, indeks adını döner', async () => {
        const ctx = makeMockCtx();
        const result = await example.up(ctx);
        expect(ctx.__spies.createIndex).toHaveBeenCalledWith({ probe: 1 }, { name: 'probe_1_mock' });
        expect(result).toEqual({ collection: 'MigrationFrameworkSelfTest_mock', created: ['probe_1_mock'] });
    });

    it('down: dropIndex çağırır, indeks adını döner', async () => {
        const ctx = makeMockCtx();
        const result = await example.down(ctx);
        expect(ctx.__spies.dropIndex).toHaveBeenCalledWith('probe_1_mock');
        expect(result).toEqual({ collection: 'MigrationFrameworkSelfTest_mock', dropped: ['probe_1_mock'] });
    });

    it('up → down → up İDEMPOTENT çağrılabilir (aynı ctx üzerinde iki kez up hata vermez)', async () => {
        const ctx = makeMockCtx();
        await example.up(ctx);
        await example.down(ctx);
        await example.up(ctx);
        expect(ctx.__spies.createIndex).toHaveBeenCalledTimes(2);
        expect(ctx.__spies.dropIndex).toHaveBeenCalledTimes(1);
    });

    it('varsayılan koleksiyon/indeks adları (ctx override YOKSA)', async () => {
        const createIndex = jestGlobal.fn(async () => undefined);
        const model = { createCollection: jestGlobal.fn(async () => undefined), diffIndexes: jestGlobal.fn(async () => ({ toCreate: [], toDrop: [] })), collection: { createIndex, dropIndex: jestGlobal.fn(async () => undefined) } };
        const models: Record<string, any> = {};
        const ctx = { connection: { models, model: jestGlobal.fn((name: string) => { models[name] = model; return model; }) } };
        const result = await example.up(ctx as any);
        expect(result.collection).toBe('MigrationFrameworkSelfTest');
        expect(result.created).toEqual(['probe_1']);
    });
});
