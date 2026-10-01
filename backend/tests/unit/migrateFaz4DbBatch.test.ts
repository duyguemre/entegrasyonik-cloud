/**
 * DB göç partisi (0008-0014; DB-11/10/15/12/14 + B12 AdminMfa) — DB'siz birim testi: biçim, numara sırası, manifest eşleşmesi, DB kapısı, DB-12 süre parametresi.
 * Gerçek indeks davranışı (up→up→down→up, E11000, TTL): tests/mongo-semantics/faz4DbMigrationBatch.mongoSemantics.test.ts (bellek-içi Mongo).
 */
import { describe, it, expect } from '@jest/globals';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migrate = require('../../dev-tools/migrate');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifest = require('../../migrations/index-manifest.json');

const IDS = [
    '0008-variants-stockdirty-partial-tenant',
    '0009-notifications-metricrollups-indexes-app',
    '0010-messages-external-id-drift-tenant',
    '0011-d10-clients-users-unique-app',
    '0012-export-staged-archive-ttl-tenant',
    '0013-exportflag-clientid-number-app',
    '0014-admin-mfa-sub-unique-app',
];
const load = (id: string) => migrate.findMigration(migrate.discoverMigrations(), id);

describe('göç numaraları ve biçim', () => {
    it('numaralar benzersiz, 0007 sonrası ardışık; her göç plan/up/down taşır ve runner biçim doğrulamasından geçer', () => {
        const all = migrate.discoverMigrations() as Array<{ id: string; scope: string; kind: string; down?: unknown }>;
        const nums = all.map((m) => m.id.slice(0, 4));
        expect(new Set(nums).size).toBe(nums.length);
        expect(nums.filter((n) => n > '0007' && n <= '0014')).toEqual(['0008', '0009', '0010', '0011', '0012', '0013', '0014']);
        for (const id of IDS) {
            const m = all.find((x) => x.id === id)!;
            expect(m).toBeDefined();
            expect(typeof m.down).toBe('function');
        }
    });

    it('kapsam/tür: 0010 contract (down için --i-understand-irreversible), diğerleri index/migrate', () => {
        expect(load(IDS[2]).kind).toBe('contract');
        expect(() => migrate.assertIrreversibleUnderstood(load(IDS[2]), false)).toThrow(/irreversible/);
        expect(load(IDS[0]).scope).toBe('tenant');
        expect(load(IDS[1]).scope).toBe('app');
        expect(load(IDS[3]).scope).toBe('app');
        expect(load(IDS[4]).scope).toBe('tenant');
        expect(load(IDS[5]).scope).toBe('app');
        expect(load(IDS[6]).scope).toBe('app');
        expect(load(IDS[6]).kind).toBe('index');
    });
});

describe('göçlerdeki indeks tanımları şema manifestiyle BİREBİR (drift yok)', () => {
    const cases: Array<[string, 'app' | 'tenant']> = [[IDS[0], 'tenant'], [IDS[1], 'app'], [IDS[2], 'tenant'], [IDS[3], 'app'], [IDS[6], 'app']];
    for (const [id, section] of cases) {
        it(`${id}`, () => {
            const targets = load(id).TARGETS as Array<{ defaultCollection: string; indexes: Array<{ fields: object; options: any }> }>;
            for (const t of targets) {
                const entries = manifest[section][t.defaultCollection] as Array<{ name: string; fields: object; options: any }>;
                for (const i of t.indexes) {
                    const { name, ...rest } = i.options;
                    expect(entries.find((e) => e.name === name)).toEqual({ name, fields: i.fields, options: rest });
                }
            }
        });
    }
});

describe('DB kapısı (izinli 7 DB dışı reddedilir)', () => {
    for (const id of IDS) {
        it(`${id}: izinsiz ctx.dbname -> plan/up/down reddedilir`, async () => {
            const m = load(id);
            const ctx = { dbname: 'baska_proje_db', connection: { db: { collection: () => { throw new Error('DB ye dokunulmamali'); } } } };
            await expect(m.plan(ctx)).rejects.toThrow(/izinli/);
            await expect(m.up(ctx)).rejects.toThrow(/izinli/);
            await expect(m.down(ctx)).rejects.toThrow(/izinli/);
        });
    }
});

describe('DB-12 saklama süresi parametresi', () => {
    const m = () => load(IDS[4]);
    const fakeCtx = (params?: object) => ({
        params,
        now: () => new Date('2026-09-30T00:00:00Z'),
        connection: { db: { collection: () => ({ indexes: async () => [], countDocuments: async () => 0 }) } },
    });
    it('varsayılan 30 gün (kullanıcı kararı 2026-09-30); plan süreyi ve kaynağını gösterir', async () => {
        delete process.env.ESP_ARCHIVE_TTL_DAYS;
        const r = await m().plan(fakeCtx());
        expect(r.collections[0]).toMatchObject({ retentionDays: 30, indexes: [{ name: 'ttl_archived_at', action: 'create' }] });
        expect(r.collections[0].retentionSource).toMatch(/30 gun/);
    });
    it('ctx.params ve env ile değiştirilebilir; geçersiz değer reddedilir', async () => {
        expect((await m().plan(fakeCtx({ espArchiveTtlDays: 7 }))).collections[0].retentionDays).toBe(7);
        process.env.ESP_ARCHIVE_TTL_DAYS = '14';
        try {
            expect((await m().plan(fakeCtx())).collections[0].retentionDays).toBe(14);
            process.env.ESP_ARCHIVE_TTL_DAYS = '0';
            await expect(m().plan(fakeCtx())).rejects.toThrow(/1\.\.365/);
            process.env.ESP_ARCHIVE_TTL_DAYS = '1.5';
            await expect(m().plan(fakeCtx())).rejects.toThrow(/1\.\.365/);
        } finally { delete process.env.ESP_ARCHIVE_TTL_DAYS; }
    });
});
