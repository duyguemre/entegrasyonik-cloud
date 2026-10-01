// ADR-0029 NB7/NB8: 0017 göçü (Announcements + Alerts) model beyanlarıyla birebir; şemalar autoIndex:false; göç runner biçimine uyar. DB'siz.
import { describe, it, expect } from '@jest/globals';
import { ANNOUNCEMENT_INDEXES, AnnouncementSchema } from '../../../src/database/application/models/Announcement';
import { ALERT_INDEXES, AlertSchema } from '../../../src/database/application/models/Alert';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migrate = require('../../../dev-tools/migrate');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifest = require('../../../migrations/index-manifest.json');

const mig = migrate.findMigration(migrate.discoverMigrations(), '0017-announcements-alerts-app');
const toWanted = (xs: ReadonlyArray<{ fields: object; options: { name: string } }>) => xs.map((i) => ({ fields: i.fields, options: i.options }));

describe('0017-announcements-alerts-app', () => {
    it('biçim: app kapsamı, index türü, plan/up/down var', () => {
        expect(mig).toBeDefined();
        expect(mig).toMatchObject({ scope: 'app', kind: 'index' });
        for (const f of ['plan', 'up', 'down']) expect(typeof mig[f]).toBe('function');
    });
    it('göç hedefleri model *_INDEXES sabitleriyle birebir aynı (alan + seçenek)', () => {
        const by = Object.fromEntries((mig.TARGETS as any[]).map((t) => [t.defaultCollection, t.indexes]));
        expect(by.Announcements).toEqual(toWanted(ANNOUNCEMENT_INDEXES));
        expect(by.Alerts).toEqual(toWanted(ALERT_INDEXES));
    });
    it('manifest iki koleksiyonu taşır; Alerts (ruleId, scopeKey) tekil ve yalnız çözülünce dolan TTL', () => {
        expect(manifest.app.Announcements.map((i: any) => i.name).sort()).toEqual(['createdAt_-1', 'status_1_startsAt_1']);
        const alerts = manifest.app.Alerts as any[];
        expect(alerts.find((i) => i.name === 'uniq_rule_scope')).toMatchObject({ fields: { ruleId: 1, scopeKey: 1 }, options: { unique: true } });
        expect(alerts.find((i) => i.name === 'ttl_exp_at')).toMatchObject({ fields: { expAt: 1 }, options: { expireAfterSeconds: 0 } });
    });
    it('şemalar autoIndex:false (indeksler yalnız onaylı göçle; model kaydı sessizce koleksiyon/indeks yazmaz)', () => {
        expect(AnnouncementSchema.get('autoIndex')).toBe(false);
        expect(AlertSchema.get('autoIndex')).toBe(false);
        expect(AnnouncementSchema.get('collection')).toBe('Announcements');
        expect(AlertSchema.get('collection')).toBe('Alerts');
    });
});
