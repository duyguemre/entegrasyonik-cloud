// [eslesme-fiyat WP7a, F-04] Göç 0029 (DeadLetterQueue uniq_originalJobId + ttl_createdAt) — sahte sürücü; DB YOK, göç ÇALIŞTIRILMAZ.
import { describe, it, expect, jest } from '@jest/globals';
import { DeadLetterQueueSchema } from '../../../src/database/application/models/Common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migrate = require('../../../dev-tools/migrate');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifest = require('../../../migrations/index-manifest.json');

const m29 = migrate.findMigration(migrate.discoverMigrations(), '0029-dlq-unique-ttl-app');

function fakeCtx(indexes: any[], dupGroups: number, expiring = 0) {
    const createIndex = jest.fn(async () => 'ok');
    const dropIndex = jest.fn(async () => undefined);
    const aggregate = jest.fn(() => ({ toArray: async () => (dupGroups ? [{ groups: dupGroups }] : []) }));
    const countDocuments = jest.fn(async () => expiring);
    const coll = { collectionName: 'DeadLetterQueue', indexes: async () => indexes, createIndex, dropIndex, aggregate, countDocuments };
    return { ctx: { dbname: 'entegrasyonikDB', connection: { db: { collection: () => coll } } }, createIndex, dropIndex };
}

describe('göç 0029 — DeadLetterQueue', () => {
    it('şema beyanı = göç = manifest (tekil originalJobId, 30 günlük TTL createdAt)', () => {
        for (const i of m29.TARGETS[0].indexes) {
            const { name, ...rest } = i.options;
            const decl = (DeadLetterQueueSchema as any).indexes().find(([, o]: any) => o?.name === name);
            expect(decl[0]).toEqual(i.fields);
            expect(manifest.app.DeadLetterQueue.find((e: any) => e.name === name)).toEqual({ name, fields: i.fields, options: rest });
        }
        expect(m29.TARGETS[0].indexes[1].options.expireAfterSeconds).toBe(30 * 24 * 3600);
    });

    it('plan yinelenen grup + TTL ile silinecek kayıt sayısını raporlar (yazmaz); up yinelenen varsa REDDEDER; yoksa kurar; izinsiz DB reddedilir', async () => {
        const a = fakeCtx([], 3, 42);
        const p = await m29.plan(a.ctx);
        expect(p.collections[0]).toMatchObject({ duplicateOriginalJobIdGroups: 3, olderThanTtlDocs: 42 });
        expect(a.createIndex).not.toHaveBeenCalled();
        await expect(m29.up(a.ctx)).rejects.toThrow(/yinelenen/);
        expect(a.createIndex).not.toHaveBeenCalled();
        const b = fakeCtx([], 0);
        const up = await m29.up(b.ctx);
        expect(up.collections[0].indexes.map((x: any) => x.name)).toEqual(['uniq_originalJobId', 'ttl_createdAt']);
        await m29.down(b.ctx);
        await expect(m29.plan({ dbname: 'baska_db', connection: { db: {} } })).rejects.toThrow(/izinli/);
    });
});
