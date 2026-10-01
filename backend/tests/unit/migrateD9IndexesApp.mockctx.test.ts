/**
 * ADR-0021 Karar 5.2 — `backend/migrations/0001-d9-indexes-app.js` için BİRİM testi (mock `ctx`; Mongo YOK).
 * Desen `tests/unit/migrateExample.mockctx.test.ts` ile AYNI. Gerçek-Mongo kanıtı:
 * `tests/integration/migrate.d9IndexesApp.realmongo.test.ts`.
 */
import { describe, it, expect, jest as jestGlobal } from '@jest/globals';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require('../../migrations/0001-d9-indexes-app');

interface DiffResult { toCreate: Array<[Record<string, unknown>, { name?: string }]>; toDrop: string[] }

/** Her koleksiyon (`AuditLogs`/`Users`) için AYRI bir mock model kaydeder; `ctx.connection.models` ÖNCEDEN
 * doldurulur ki `resolveModel`'in cache-hit dalı çalışsın (schema oluşturma/loadDist YOLU hiç tetiklenmez —
 * bu göç dosyası zaten dist/TS şema dosyasına bağımlı DEĞİLDİR, ama bu test tasarımı 0000-example.js ile
 * BİREBİR aynı "önceden kayıtlı model" desenini kullanır). */
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

    registerFixedModel('D9App__auditLogs__AuditLogs', 'AuditLogs', diffByKey.auditLogs || { toCreate: [], toDrop: [] });
    registerFixedModel('D9App__users__Users', 'Users', diffByKey.users || { toCreate: [], toDrop: [] });

    const connection = { models, model: jestGlobal.fn((name: string) => models[name]) };
    return { connection, __spies: spiesByCollection };
}

describe('0001-d9-indexes-app.js — biçim (id/scope/kind/description/plan/up/down)', () => {
    it('ADR-0021 Karar 4 alan listesine uyar', () => {
        expect(migration.id).toBe('0001-d9-indexes-app');
        expect(migration.scope).toBe('app');
        expect(migration.kind).toBe('index');
        expect(typeof migration.description).toBe('string');
        expect(typeof migration.plan).toBe('function');
        expect(typeof migration.up).toBe('function');
        expect(typeof migration.down).toBe('function');
        expect(typeof migration.batchSize).toBe('number');
        expect(typeof migration.throttleMs).toBe('number');
    });
});

describe('0001-d9-indexes-app.js — plan (mock ctx, DEĞER YAZMAZ)', () => {
    it('her iki koleksiyon için diffIndexes() çağırır ve raporu ADAPTE EDER (syncIndexes YOK)', async () => {
        const ctx = makeMockCtx({
            auditLogs: { toCreate: [[{ tid: 1, at: -1 }, { name: 'tid_1_at_-1' }]], toDrop: [] },
            users: { toCreate: [[{ clientId: 1 }, { name: 'clientId_1' }]], toDrop: ['eski_indeks_1'] },
        });
        const report = await migration.plan(ctx);
        expect(ctx.__spies.AuditLogs.diffIndexes).toHaveBeenCalledWith({ indexOptionsToCreate: true });
        expect(ctx.__spies.Users.diffIndexes).toHaveBeenCalledWith({ indexOptionsToCreate: true });
        expect(report).toEqual({
            collections: [
                { collection: 'AuditLogs', toCreate: ['tid_1_at_-1'], toDrop: [] },
                { collection: 'Users', toCreate: ['clientId_1'], toDrop: ['eski_indeks_1'] },
            ],
        });
        expect(ctx.__spies.AuditLogs.createIndex).not.toHaveBeenCalled(); // plan YAZMAZ
        expect(ctx.__spies.Users.createIndex).not.toHaveBeenCalled();
    });
});

describe('0001-d9-indexes-app.js — up/down (mock ctx)', () => {
    it('up: her iki koleksiyonda adlı createIndex çağırır', async () => {
        const ctx = makeMockCtx();
        const result = await migration.up(ctx);
        expect(ctx.__spies.AuditLogs.createIndex).toHaveBeenCalledWith({ tid: 1, at: -1 }, { name: 'tid_1_at_-1' });
        expect(ctx.__spies.Users.createIndex).toHaveBeenCalledWith({ clientId: 1 }, { name: 'clientId_1' });
        expect(result).toEqual({
            collections: [
                { collection: 'AuditLogs', created: ['tid_1_at_-1'] },
                { collection: 'Users', created: ['clientId_1'] },
            ],
        });
    });

    it('down: her iki koleksiyonda adlı dropIndex çağırır', async () => {
        const ctx = makeMockCtx();
        const result = await migration.down(ctx);
        expect(ctx.__spies.AuditLogs.dropIndex).toHaveBeenCalledWith('tid_1_at_-1');
        expect(ctx.__spies.Users.dropIndex).toHaveBeenCalledWith('clientId_1');
        expect(result).toEqual({
            collections: [
                { collection: 'AuditLogs', dropped: ['tid_1_at_-1'] },
                { collection: 'Users', dropped: ['clientId_1'] },
            ],
        });
    });

    it('up → down → up İDEMPOTENT çağrılabilir (aynı ctx üzerinde iki kez up hata vermez)', async () => {
        const ctx = makeMockCtx();
        await migration.up(ctx);
        await migration.down(ctx);
        await migration.up(ctx);
        expect(ctx.__spies.AuditLogs.createIndex).toHaveBeenCalledTimes(2);
        expect(ctx.__spies.AuditLogs.dropIndex).toHaveBeenCalledTimes(1);
        expect(ctx.__spies.Users.createIndex).toHaveBeenCalledTimes(2);
        expect(ctx.__spies.Users.dropIndex).toHaveBeenCalledTimes(1);
    });
});

describe('0001-d9-indexes-app.js — collectionOverrides (test izolasyonu deseni)', () => {
    it('ctx.collectionOverrides ile FARKLI model adı/koleksiyon kullanılır (gerçek üretim koleksiyonuna dokunmaz)', async () => {
        const createIndex = jestGlobal.fn(async () => undefined);
        const model = {
            createCollection: jestGlobal.fn(async () => undefined),
            diffIndexes: jestGlobal.fn(async () => ({ toCreate: [], toDrop: [] })),
            collection: { createIndex, dropIndex: jestGlobal.fn(async () => undefined) },
        };
        const models: Record<string, any> = {
            'D9App__auditLogs__zzTest_Foo_AuditLogs': model,
            'D9App__users__zzTest_Foo_Users': model,
        };
        const ctx = {
            connection: { models, model: jestGlobal.fn((name: string) => models[name]) },
            collectionOverrides: { auditLogs: 'zzTest_Foo_AuditLogs', users: 'zzTest_Foo_Users' },
        };
        const result = await migration.up(ctx as any);
        expect(result.collections[0].collection).toBe('zzTest_Foo_AuditLogs');
        expect(result.collections[1].collection).toBe('zzTest_Foo_Users');
    });
});
