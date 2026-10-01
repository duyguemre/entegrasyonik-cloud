/**
 * ADR-0021 Karar 4/5 — `dev-tools/migrate.js` orkestrasyon çekirdeği (Mongo YOK; `ctx`/`store` mock'lu).
 * DB bağlantısı gerektiren gerçeklik kanıtı `tests/integration/migrate.exampleMigration.realmongo.test.ts`'te.
 */
import { describe, it, expect, jest as jestGlobal } from '@jest/globals';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migrate = require('../../dev-tools/migrate');

describe('validateMigrationShape', () => {
    it('geçerli göç şeması hata vermez', () => {
        expect(() => migrate.validateMigrationShape({
            id: '0001-foo', scope: 'app', kind: 'index', description: 'x', plan: async () => ({}), up: async () => ({}), down: async () => ({}),
        }, '0001-foo.js')).not.toThrow();
    });

    it('irreversible:true ise down olmadan da geçerli', () => {
        expect(() => migrate.validateMigrationShape({
            id: '0002-foo', scope: 'app', kind: 'contract', description: 'x', plan: async () => ({}), up: async () => ({}), irreversible: true,
        }, '0002-foo.js')).not.toThrow();
    });

    it('zorunlu alan eksikse fırlatır', () => {
        expect(() => migrate.validateMigrationShape({ scope: 'app', kind: 'index', description: 'x', plan: async () => ({}), up: async () => ({}) }, '0003-foo.js')).toThrow(/id/);
    });

    it('id dosya adıyla eşleşmezse fırlatır', () => {
        expect(() => migrate.validateMigrationShape({
            id: 'yanlis-id', scope: 'app', kind: 'index', description: 'x', plan: async () => ({}), up: async () => ({}), down: async () => ({}),
        }, '0004-foo.js')).toThrow(/dosya adıyla eşleşmiyor/);
    });

    it('geçersiz scope/kind fırlatır', () => {
        const base = { id: '0005-foo', description: 'x', plan: async () => ({}), up: async () => ({}), down: async () => ({}) };
        expect(() => migrate.validateMigrationShape({ ...base, scope: 'galaxy', kind: 'index' }, '0005-foo.js')).toThrow(/scope/);
        expect(() => migrate.validateMigrationShape({ ...base, scope: 'app', kind: 'yenidenyaz' }, '0005-foo.js')).toThrow(/kind/);
    });

    it('down yok VE irreversible işaretlenmemişse fırlatır', () => {
        expect(() => migrate.validateMigrationShape({
            id: '0006-foo', scope: 'app', kind: 'expand', description: 'x', plan: async () => ({}), up: async () => ({}),
        }, '0006-foo.js')).toThrow(/down.*irreversible/);
    });
});

describe('computeChecksum', () => {
    it('deterministik ve içerik-duyarlıdır', () => {
        const a = migrate.computeChecksum(Buffer.from('merhaba'));
        const b = migrate.computeChecksum(Buffer.from('merhaba'));
        const c = migrate.computeChecksum(Buffer.from('merhaba!'));
        expect(a).toBe(b);
        expect(a).not.toBe(c);
        expect(a).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe('discoverMigrations — gerçek backend/migrations/ dizini (dosya sistemi, DB YOK)', () => {
    it('0000-example.js bulunur, doğrulanır ve checksum hesaplanır', () => {
        const migrations = migrate.discoverMigrations();
        const example = migrations.find((m: any) => m.id === '0000-example');
        expect(example).toBeDefined();
        expect(example.scope).toBe('app');
        expect(example.kind).toBe('index');
        expect(typeof example.__checksum).toBe('string');
        expect(example.__checksum).toMatch(/^[0-9a-f]{64}$/);
    });

    it('boş/olmayan dizin için boş liste döner', () => {
        const empty = migrate.discoverMigrations(path.join(__dirname, '__does_not_exist__'));
        expect(empty).toEqual([]);
    });
});

describe('findMigration', () => {
    it('id ile bulur; yoksa fırlatır', () => {
        const list = [{ id: 'a' }, { id: 'b' }];
        expect(migrate.findMigration(list, 'b')).toEqual({ id: 'b' });
        expect(() => migrate.findMigration(list, 'z')).toThrow(/bulunamadı/);
    });
});

describe('assertChecksumMandal (Karar 5.3.f)', () => {
    it('kayıt yoksa sorun çıkarmaz', () => {
        expect(() => migrate.assertChecksumMandal(null, { id: 'x', __checksum: 'abc' })).not.toThrow();
    });
    it('checksum eşleşirse sorun çıkarmaz', () => {
        expect(() => migrate.assertChecksumMandal({ checksum: 'abc' }, { id: 'x', __checksum: 'abc' })).not.toThrow();
    });
    it('checksum UYUŞMAZSA çalıştırıcı DURUR (hata)', () => {
        expect(() => migrate.assertChecksumMandal({ checksum: 'abc' }, { id: 'x', __checksum: 'DEĞİŞTİ' })).toThrow(/checksum/);
    });
});

describe('parseMigrateArgs', () => {
    it('plan [id]', () => {
        expect(migrate.parseMigrateArgs(['plan', '0001-foo'])).toMatchObject({ cmd: 'plan', id: '0001-foo', apply: false });
    });
    it('up <id> --apply --backup-ref <yol>', () => {
        const f = migrate.parseMigrateArgs(['up', '0001-foo', '--apply', '--backup-ref', 'backup/atlas/20260101']);
        expect(f).toMatchObject({ cmd: 'up', id: '0001-foo', apply: true, backupRef: 'backup/atlas/20260101' });
    });
    it('--backup-ref=... (eşittili biçim)', () => {
        const f = migrate.parseMigrateArgs(['up', '0001-foo', '--apply', '--backup-ref=backup/x']);
        expect(f.backupRef).toBe('backup/x');
    });
    it('up --all --apply', () => {
        const f = migrate.parseMigrateArgs(['up', '--all', '--apply', '--backup-ref', 'backup/x']);
        expect(f).toMatchObject({ cmd: 'up', all: true, apply: true });
    });
    it('down --i-understand-irreversible', () => {
        const f = migrate.parseMigrateArgs(['down', '0009-contract', '--apply', '--backup-ref', 'b', '--i-understand-irreversible']);
        expect(f.understandIrreversible).toBe(true);
    });
    it('bilinmeyen bayrak unknown listesine düşer', () => {
        const f = migrate.parseMigrateArgs(['plan', '--wat']);
        expect(f.unknown).toEqual(['--wat']);
    });
});

describe('buildTargets', () => {
    const ctxFactory = jestGlobal.fn(async (t: any) => ({ ctx: t }));

    it('scope=app -> yalnız 1 App hedefi', async () => {
        const targets = await migrate.buildTargets({ scope: 'app' }, { appDbname: 'entegrasyonikDB', tenants: [{ clientId: 1, dbname: 'entegrasyonikClient_1' }], ctxFactory });
        expect(targets).toHaveLength(1);
        expect(targets[0].ctx.scope).toBe('app');
    });

    it('scope=tenant -> yalnız tenant hedefleri', async () => {
        const tenants = [{ clientId: 1, dbname: 'entegrasyonikClient_1' }, { clientId: 2, dbname: 'entegrasyonik_client_2' }];
        const targets = await migrate.buildTargets({ scope: 'tenant' }, { appDbname: 'entegrasyonikDB', tenants, ctxFactory });
        expect(targets).toHaveLength(2);
        expect(targets.every((t: any) => t.ctx.scope === 'tenant')).toBe(true);
    });

    it('scope=both -> App + tüm tenant hedefleri', async () => {
        const tenants = [{ clientId: 1, dbname: 'entegrasyonikClient_1' }];
        const targets = await migrate.buildTargets({ scope: 'both' }, { appDbname: 'entegrasyonikDB', tenants, ctxFactory });
        expect(targets).toHaveLength(2);
        expect(targets[0].ctx.scope).toBe('app');
        expect(targets[1].ctx.scope).toBe('tenant');
    });
});

describe('resolveTenantList — izinli-DB + PURGED filtresi (mock collection, DB YOK)', () => {
    function fakeCollection(docs: any[]) {
        return { find: () => ({ toArray: async () => docs }) };
    }

    it('PURGED tenant\'ları hariç tutar', async () => {
        const docs = [
            { order: 1, dbConfig: { dbname: 'entegrasyonikClient_1' } },
        ];
        const col = fakeCollection(docs);
        const out = await migrate.resolveTenantList(col);
        expect(out).toEqual([{ clientId: 1, dbname: 'entegrasyonikClient_1' }]);
    });

    it('izinli 7 DB dışındaki dbname\'i ATLAR (kural 2)', async () => {
        const docs = [
            { order: 1, dbConfig: { dbname: 'entegrasyonikClient_1' } },
            { order: 99, dbConfig: { dbname: 'entegrasyonikClient_99' } }, // izinli DEĞİL
        ];
        const col = fakeCollection(docs);
        const out = await migrate.resolveTenantList(col);
        expect(out).toEqual([{ clientId: 1, dbname: 'entegrasyonikClient_1' }]);
    });

    it('sayısal olmayan clientId\'yi ATLAR', async () => {
        const docs = [{ order: 'not-a-number', dbConfig: { dbname: 'entegrasyonikClient_1' } }];
        const col = fakeCollection(docs);
        expect(await migrate.resolveTenantList(col)).toEqual([]);
    });
});

describe('planMigration (DRY-RUN, mock ctx)', () => {
    it('her hedef için migration.plan(ctx) çağırır ve raporları toplar', async () => {
        const planFn = jestGlobal.fn(async (ctx: any) => ({ echo: ctx.dbname }));
        const migration = { id: 'x', kind: 'index', scope: 'both', plan: planFn };
        const targets = [
            { ctx: { scope: 'app', dbname: 'entegrasyonikDB' } },
            { ctx: { scope: 'tenant', dbname: 'entegrasyonikClient_1', clientId: 1 } },
        ];
        const result = await migrate.planMigration(migration, targets);
        expect(planFn).toHaveBeenCalledTimes(2);
        expect(result.targets).toHaveLength(2);
        expect(result.targets[1].report.echo).toBe('entegrasyonikClient_1');
    });
});

function makeFakeStore() {
    const records: Record<string, any> = {};
    return {
        records,
        async getRecord(id: string) { return records[id] || null; },
        async startRun(doc: any) { records[doc.id] = { ...doc, _id: doc.id }; },
        async finishRun(id: string, patch: any) { records[id] = { ...records[id], ...patch }; },
        async upsertTenantProgress(id: string, clientId: number, patch: any) {
            const rec = records[id];
            const t = (rec.tenants || []).find((x: any) => x.clientId === clientId);
            if (t) Object.assign(t, patch);
        },
    };
}

describe('runUp / runDown (mock store + mock ctx, Mongo YOK)', () => {
    it('tüm hedefler başarılıysa status=done', async () => {
        const store = makeFakeStore();
        const migration = { id: 'm1', kind: 'expand', scope: 'app', __checksum: 'abc', up: jestGlobal.fn(async () => ({ ok: true })) };
        const targets = [{ ctx: { scope: 'app', dbname: 'entegrasyonikDB' } }];
        const result = await migrate.runUp(migration, targets, { store, appliedBy: 'test-host' });
        expect(result.status).toBe('done');
        expect(store.records.m1.status).toBe('done');
    });

    it('tenant hedeflerinden biri başarısız olursa status=partial, diğer tenant SÜRER', async () => {
        const store = makeFakeStore();
        let call = 0;
        const migration = {
            id: 'm2', kind: 'migrate', scope: 'tenant', __checksum: 'abc',
            up: jestGlobal.fn(async (ctx: any) => {
                call++;
                if (ctx.clientId === 2) throw new Error('boom (clientId 2)');
                return { ok: true };
            }),
        };
        const targets = [
            { ctx: { scope: 'tenant', clientId: 1, dbname: 'entegrasyonikClient_1' } },
            { ctx: { scope: 'tenant', clientId: 2, dbname: 'entegrasyonik_client_2' } },
        ];
        const result = await migrate.runUp(migration, targets, { store, appliedBy: 'test-host' });
        expect(call).toBe(2); // ikinci hedef de DENENDİ (döngü durmadı)
        expect(result.status).toBe('partial');
        const rec = store.records.m2;
        expect(rec.tenants.find((t: any) => t.clientId === 1).status).toBe('done');
        expect(rec.tenants.find((t: any) => t.clientId === 2).status).toBe('failed');
    });

    it('tüm hedefler başarısızsa status=failed', async () => {
        const store = makeFakeStore();
        const migration = { id: 'm3', kind: 'expand', scope: 'app', __checksum: 'abc', up: jestGlobal.fn(async () => { throw new Error('kirik'); }) };
        const targets = [{ ctx: { scope: 'app', dbname: 'entegrasyonikDB' } }];
        const result = await migrate.runUp(migration, targets, { store, appliedBy: 'test-host' });
        expect(result.status).toBe('failed');
    });

    it('checksum UYUŞMUYORSA up ÇALIŞMADAN durur', async () => {
        const store = makeFakeStore();
        store.records.m4 = { checksum: 'ESKİ' };
        const upFn = jestGlobal.fn(async () => ({ ok: true }));
        const migration = { id: 'm4', kind: 'expand', scope: 'app', __checksum: 'YENİ', up: upFn };
        const targets = [{ ctx: { scope: 'app', dbname: 'entegrasyonikDB' } }];
        await expect(migrate.runUp(migration, targets, { store, appliedBy: 'x' })).rejects.toThrow(/checksum/);
        expect(upFn).not.toHaveBeenCalled();
    });

    it('down: migration.down çağrılır, sonuç kaydedilir', async () => {
        const store = makeFakeStore();
        const downFn = jestGlobal.fn(async () => ({ dropped: true }));
        const migration = { id: 'm5', kind: 'index', scope: 'app', __checksum: 'abc', down: downFn };
        const targets = [{ ctx: { scope: 'app', dbname: 'entegrasyonikDB' } }];
        const result = await migrate.runDown(migration, targets, { store, appliedBy: 'x' });
        expect(downFn).toHaveBeenCalledTimes(1);
        expect(result.status).toBe('done');
    });
});

describe('statusReport (mock store, Mongo YOK)', () => {
    it('uygulanmamış göçü pending gösterir; checksum uyuşmazlığını işaretler', async () => {
        const store = makeFakeStore();
        store.records.applied = { checksum: 'AYNI', status: 'done', tenants: [] };
        store.records.mismatch = { checksum: 'ESKİ', status: 'done', tenants: [] };
        const migrations = [
            { id: 'applied', kind: 'index', scope: 'app', __checksum: 'AYNI' },
            { id: 'mismatch', kind: 'index', scope: 'app', __checksum: 'YENİ' },
            { id: 'never-run', kind: 'index', scope: 'app', __checksum: 'X' },
        ];
        const rows = await migrate.statusReport(migrations, store);
        expect(rows.find((r: any) => r.id === 'applied')).toMatchObject({ applied: true, checksumMismatch: false });
        expect(rows.find((r: any) => r.id === 'mismatch')).toMatchObject({ applied: true, checksumMismatch: true });
        expect(rows.find((r: any) => r.id === 'never-run')).toMatchObject({ applied: false, status: 'pending' });
    });
});

describe('assertIrreversibleUnderstood', () => {
    it('kind=contract, bayrak yoksa fırlatır', () => {
        expect(() => migrate.assertIrreversibleUnderstood({ id: 'x', kind: 'contract' }, false)).toThrow(/irreversible/);
    });
    it('kind=contract, bayrak varsa geçer', () => {
        expect(() => migrate.assertIrreversibleUnderstood({ id: 'x', kind: 'contract' }, true)).not.toThrow();
    });
    it('irreversible:true (kind ne olursa olsun) bayraksız fırlatır', () => {
        expect(() => migrate.assertIrreversibleUnderstood({ id: 'x', kind: 'expand', irreversible: true }, false)).toThrow(/irreversible/);
    });
    it('normal (contract/irreversible değil) bayraksız da geçer', () => {
        expect(() => migrate.assertIrreversibleUnderstood({ id: 'x', kind: 'index' }, false)).not.toThrow();
    });
});
