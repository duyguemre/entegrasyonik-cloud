// [eslesme-fiyat WP5] Göç 0028 (Variants priceDirty_true) ve 0031 (PriceHistory TTL 90 → 400 g): biçim, şema manifestiyle eşleşme,
// sahte sürücüyle plan/up/down eylemleri. ÇALIŞTIRILMADI (gerçek DB yerelde, onayla). DB YOK.
import { describe, it, expect, jest } from '@jest/globals';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migrate = require('../../../dev-tools/migrate');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifest = require('../../../migrations/index-manifest.json');

const all = migrate.discoverMigrations();
const m28 = migrate.findMigration(all, '0028-variants-price-dirty-tenant');
const m31 = migrate.findMigration(all, '0031-price-history-ttl-tenant');

function fakeCtx(indexes: any[]) {
    const createIndex = jest.fn(async () => 'ok');
    const dropIndex = jest.fn(async () => undefined);
    const command = jest.fn(async () => ({ ok: 1 }));
    const coll = { collectionName: 'X', indexes: async () => indexes, createIndex, dropIndex, countDocuments: jest.fn(async () => 3) };
    return { ctx: { dbname: 'entegrasyonik_client', connection: { db: { collection: () => coll, command } } }, createIndex, dropIndex, command };
}

describe('0028-variants-price-dirty-tenant', () => {
    it('tenant/index; şema manifestiyle birebir', () => {
        expect(m28.scope).toBe('tenant');
        expect(m28.kind).toBe('index');
        const i = m28.TARGETS[0].indexes[0];
        const { name, ...rest } = i.options;
        expect(manifest.tenant.Variants.find((e: any) => e.name === name)).toEqual({ name, fields: i.fields, options: rest });
    });
    it('up kurar, ikinci kez no-op; down düşürür; izinsiz DB reddedilir', async () => {
        const a = fakeCtx([]);
        expect((await m28.up(a.ctx)).collections[0].indexes[0]).toMatchObject({ name: 'priceDirty_true', action: 'created' });
        const b = fakeCtx([{ name: 'priceDirty_true', key: { priceDirty: 1 }, partialFilterExpression: { priceDirty: true } }]);
        expect((await m28.up(b.ctx)).collections[0].indexes[0].action).toBe('noop');
        expect(b.createIndex).not.toHaveBeenCalled();
        await m28.down(b.ctx);
        expect(b.dropIndex).toHaveBeenCalledWith('priceDirty_true');
        await expect(m28.plan({ dbname: 'baska_db', connection: { db: {} } })).rejects.toThrow(/izinli/);
    });
});

describe('0031-price-history-ttl-tenant', () => {
    const at90 = { name: 'ttl_at_90d', key: { at: 1 }, expireAfterSeconds: 90 * 86400 };
    it('şema beyanı 400 gün; plan collMod + belge sayıları (yazmaz)', async () => {
        expect(manifest.tenant.PriceHistory.find((e: any) => e.name === 'ttl_at_90d').options).toEqual({ expireAfterSeconds: 400 * 86400 });
        const f = fakeCtx([at90]);
        const p = await m31.plan(f.ctx);
        expect(p.collections[0]).toMatchObject({ retentionDays: 400, indexes: [{ name: 'ttl_at_90d', action: 'collMod', from: 90 * 86400, to: 400 * 86400 }], total: 3, last30: 3 });
        expect(f.command).not.toHaveBeenCalled();
    });
    it('up collMod 400 g; down collMod 90 g (indeks düşürülmez)', async () => {
        const f = fakeCtx([at90]);
        await m31.up(f.ctx);
        expect(f.command).toHaveBeenCalledWith({ collMod: 'X', index: { name: 'ttl_at_90d', expireAfterSeconds: 400 * 86400 } });
        const g = fakeCtx([{ ...at90, expireAfterSeconds: 400 * 86400 }]);
        await m31.down(g.ctx);
        expect(g.command).toHaveBeenCalledWith({ collMod: 'X', index: { name: 'ttl_at_90d', expireAfterSeconds: 90 * 86400 } });
        expect(g.dropIndex).not.toHaveBeenCalled();
    });
    it('indeks yoksa (0022 koşulmamış) 400 g ile kurar', async () => {
        const f = fakeCtx([]);
        expect((await m31.up(f.ctx)).collections[0].indexes[0].action).toBe('created');
        expect(f.createIndex).toHaveBeenCalledWith({ at: 1 }, { name: 'ttl_at_90d', expireAfterSeconds: 400 * 86400 });
    });
});
