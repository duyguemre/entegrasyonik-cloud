/**
 * Legacy tenant migration aracı (ADR-0008 §2 Legacy satırı): mevcut ACTIVE tenant'lara billingExempt/legacy abonelik.
 * Sahte koleksiyonlar (Mongo/ağ YOK) -- araç GERÇEK DB'ye ÇALIŞTIRILMAZ; yalnızca mantık ve korumalar doğrulanır.
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mig = require('../../../dev-tools/migrate-legacy-tenants-to-subscriptions.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const common = require('../../../dev-tools/_migrationCommon.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seedMod = require('../../../dev-tools/seed-plans.js');

const TOOL = path.join(__dirname, '..', '..', '..', 'dev-tools', 'migrate-legacy-tenants-to-subscriptions.js');

// ---- sahte DB: Clients/Subscriptions/BillingEvents; yalnızca bu araç için gereken çağrılar ----
function fakeDb(clients: any[], subscriptions: any[] = []) {
    const cols: Record<string, any[]> = { Clients: clients.map(d => ({ ...d })), Subscriptions: subscriptions.map(d => ({ ...d })), BillingEvents: [] };
    const writes: Array<{ col: string; f: any; u: any; o: any }> = [];
    const touched: string[] = [];
    const db = {
        collection: (name: string) => {
            if (!(name in cols)) throw new Error('beklenmeyen koleksiyon: ' + name); // Plans/Users/... yazılmamalı
            touched.push(name);
            return {
                find: (_f: any, _o: any) => ({ toArray: async () => cols[name].map(d => ({ ...d })) }),
                updateOne: async (f: any, u: any, o: any) => {
                    writes.push({ col: name, f, u, o });
                    const key = name === 'BillingEvents' ? 'providerEventId' : 'clientId';
                    let d = cols[name].find(x => x[key] === f[key]);
                    if (!d) {
                        if (!o.upsert) return { matchedCount: 0, upsertedCount: 0 };
                        d = { ...f, ...u.$setOnInsert };
                        cols[name].push(d);
                        return { matchedCount: 0, upsertedCount: 1, upsertedId: 'x' };
                    }
                    return { matchedCount: 1, upsertedCount: 0 };
                },
            };
        },
    };
    return { db, cols, writes, touched };
}

const now = () => new Date('2026-09-28T00:00:00Z');
const c = (clientId: number, status = 'ACTIVE') => ({ clientId, status, title: 'GİZLİ TİCARİ UNVAN', name: 'gizli' });

describe('planMigration (saf)', () => {
    it('ACTIVE + aboneliksiz -> create; abonelikli -> skipped_existing; ACTIVE değil -> skipped_status; clientId geçersiz/yinelenen -> skipped_invalid', () => {
        const r = mig.planMigration(
            [c(1), c(2), c(3, 'PROVISIONING'), c(4, 'DELETION_PENDING'), c(5, 'PURGED'), { clientId: 'x', status: 'ACTIVE' }, { status: 'ACTIVE' }, c(1)],
            [{ clientId: 2 }],
        );
        expect(r.map((x: any) => x.action)).toEqual(['create', 'skipped_existing', 'skipped_status', 'skipped_status', 'skipped_status', 'skipped_invalid', 'skipped_invalid', 'skipped_invalid']);
    });

    it('trialing aboneliği olan ACTIVE tenant\'a DOKUNMAZ (skipped_existing) — deneme legacy\'e yükseltilmez', () => {
        const r = mig.planMigration([c(7)], [{ clientId: 7, status: 'trialing' }]);
        expect(r[0].action).toBe('skipped_existing');
    });
});

describe('migrateLegacyTenants', () => {
    it('DRY-RUN (varsayılan): HİÇBİR yazma yapmaz, rapor sayıları doğru; çıktıda tenant adı/unvanı YOK', async () => {
        const f = fakeDb([c(1), c(2), c(3, 'PROVISIONING_FAILED')], [{ clientId: 2 }]);
        const r = await mig.migrateLegacyTenants({ db: f.db, dbName: 'entegrasyonikDB' });
        expect(r.apply).toBe(false);
        expect(f.writes).toHaveLength(0);
        expect(r.counts).toEqual({ create: 1, skipped_existing: 1, skipped_status: 1, skipped_invalid: 0 });
        expect(r.skippedStatuses).toEqual({ PROVISIONING_FAILED: 1 });
        expect(r.written).toBeUndefined();
        expect(JSON.stringify(r)).not.toMatch(/GİZLİ|gizli/);
    });

    it('--apply: legacy abonelik ADR §2 alan sözleşmesiyle yazılır (active + billingExempt + legacy plan), denetim kaydı BillingEvents\'e', async () => {
        const f = fakeDb([c(1), c(2)]);
        const r = await mig.migrateLegacyTenants({ db: f.db, dbName: 'entegrasyonikDB', apply: true, now });
        expect(r.written).toEqual({ created: 2, raced_existing: 0 });

        expect(f.cols.Subscriptions).toHaveLength(2);
        expect(f.cols.Subscriptions[0]).toEqual({
            clientId: 1, planCode: 'legacy', planVersion: 1, status: 'active', cancelAtPeriodEnd: false,
            billingExempt: true, provider: 'legacy', createdAt: now(), updatedAt: now(),
        });
        expect(f.cols.BillingEvents.map((e: any) => e.providerEventId)).toEqual(['legacy-migration:1', 'legacy-migration:2']);
        expect(f.cols.BillingEvents[0]).toMatchObject({ provider: 'system', type: 'subscription.legacy_migrated', clientId: 1, status: 'processed' });
        expect(JSON.stringify(f.cols.BillingEvents)).not.toMatch(/GİZLİ|gizli/);
    });

    it('yalnızca $setOnInsert + upsert kullanır ($set YOK): mevcut belge asla ezilmez; Plans/Users/Clients koleksiyonlarına YAZILMAZ', async () => {
        const f = fakeDb([c(1)]);
        await mig.migrateLegacyTenants({ db: f.db, dbName: 'entegrasyonikDB', apply: true, now });
        for (const w of f.writes) {
            expect(w.o).toEqual({ upsert: true });
            expect(Object.keys(w.u)).toEqual(['$setOnInsert']);
        }
        expect(new Set(f.writes.map(w => w.col))).toEqual(new Set(['Subscriptions', 'BillingEvents']));
        expect(f.touched).not.toContain('Plans');
    });

    it('İDEMPOTENT: ikinci --apply hiçbir şey yazmaz', async () => {
        const f = fakeDb([c(1), c(2)]);
        await mig.migrateLegacyTenants({ db: f.db, dbName: 'entegrasyonikDB', apply: true, now });
        const before = f.writes.length;
        const r = await mig.migrateLegacyTenants({ db: f.db, dbName: 'entegrasyonikDB', apply: true, now });
        expect(r.counts).toEqual({ create: 0, skipped_existing: 2, skipped_status: 0, skipped_invalid: 0 });
        expect(f.writes.length).toBe(before);
        expect(f.cols.Subscriptions).toHaveLength(2);
    });

    it('mevcut (ör. trialing/active) abonelik ezilmez; billingExempt olmayan tenant\'a legacy yazılmaz', async () => {
        const existing = { clientId: 5, planCode: 'starter', status: 'trialing', billingExempt: false, trialEndsAt: new Date('2026-10-01') };
        const f = fakeDb([c(5)], [existing]);
        await mig.migrateLegacyTenants({ db: f.db, dbName: 'entegrasyonikDB', apply: true, now });
        expect(f.writes).toHaveLength(0);
        expect(f.cols.Subscriptions[0]).toEqual(existing);
    });

    it('planlama ile yazma arasında araya giren abonelik (upsert eşleşti) ezilmez: raced_existing sayılır, denetim kaydı YAZILMAZ', async () => {
        const f = fakeDb([c(6)]);
        // Planlama (find) boş görür; ama updateOne anında kayıt vardır -> upsertedCount 0
        const realCollection = f.db.collection;
        f.db.collection = (name: string) => {
            const col: any = realCollection(name);
            if (name === 'Subscriptions') {
                let first = true;
                const realFind = col.find;
                col.find = (...a: any[]) => { if (first) { first = false; return { toArray: async () => [] }; } return realFind(...a); };
                col.updateOne = async () => ({ matchedCount: 1, upsertedCount: 0 });
            }
            return col;
        };
        const r = await mig.migrateLegacyTenants({ db: f.db, dbName: 'entegrasyonikDB', apply: true, now });
        expect(r.written).toEqual({ created: 0, raced_existing: 1 });
        expect(f.cols.BillingEvents).toHaveLength(0);
    });

    it('İZİNLİ 7 DB DIŞINA yazmayı REDDEDER (dry-run ve apply); hiçbir koleksiyona erişilmez', async () => {
        for (const bad of ['admin', 'baska_proje_db', 'entegrasyonikClient_9', '', undefined]) {
            for (const apply of [false, true]) {
                const f = fakeDb([c(1)]);
                await expect(mig.migrateLegacyTenants({ db: f.db, dbName: bad, apply })).rejects.toThrow(/izinli listede değil/);
                expect(f.touched).toHaveLength(0);
                expect(f.writes).toHaveLength(0);
            }
        }
        expect(() => mig.assertAllowedDb('entegrasyonikDB')).not.toThrow();
    });

    it('izinli liste ortak göç çerçevesi ve seed-plans ile BİREBİR aynı (7 isim)', () => {
        expect(mig.ALLOWED_DBS).toEqual(common.ALLOWED_DBS);
        expect(mig.ALLOWED_DBS).toEqual(seedMod.ALLOWED_DBS);
        expect(mig.ALLOWED_DBS).toHaveLength(7);
    });
});

describe('--apply yedek beyanı ve CLI güvenliği', () => {
    it('assertApplyConfirmed: --apply LEGACY_MIGRATION_BACKUP_CONFIRMED=yes olmadan REDDEDİLİR; dry-run şart aramaz; "yes" dışı değer (true/1/YES) kabul EDİLMEZ', () => {
        expect(() => mig.assertApplyConfirmed(true, {})).toThrow(/LEGACY_MIGRATION_BACKUP_CONFIRMED=yes/);
        for (const v of ['true', '1', 'YES', 'y', '']) expect(() => mig.assertApplyConfirmed(true, { LEGACY_MIGRATION_BACKUP_CONFIRMED: v })).toThrow();
        expect(() => mig.assertApplyConfirmed(true, { LEGACY_MIGRATION_BACKUP_CONFIRMED: 'yes' })).not.toThrow();
        expect(() => mig.assertApplyConfirmed(false, {})).not.toThrow();
    });

    it('package.json "migrate:legacy-subscriptions" script\'i tanımlı ve --apply\'ı varsayılan yapmaz', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf8'));
        expect(pkg.scripts['migrate:legacy-subscriptions']).toBe('node dev-tools/migrate-legacy-tenants-to-subscriptions.js');
    });

    it('CLI kaynağı: yedek beyanı çağrılır, apply yalnızca flags.apply\'dan gelir, bağlantı dizesi/sır içermez', () => {
        const src = fs.readFileSync(TOOL, 'utf8');
        expect(src).toContain('assertApplyConfirmed(flags.apply, env)');
        expect(src).toContain('apply: flags.apply');
        expect(src).not.toMatch(/apply\s*=\s*true/);
        expect(src).not.toMatch(/mongodb(\+srv)?:\/\/[^\s'"<]/i);
    });

    it('CLI süreci: izinli listede OLMAYAN DB adıyla --apply denendiğinde hata verir (exit 1) ve hiçbir bağlantı kurulmaz', () => {
        const r = spawnSync(process.execPath, [TOOL, 'admin', '--apply'], {
            encoding: 'utf8', timeout: 20000,
            env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, LEGACY_MIGRATION_BACKUP_CONFIRMED: 'yes', DB_URL: '', DB_NAME: '' },
        });
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/izinli listede değil/);
        expect(r.stdout).not.toMatch(/APPLY \(yazar\)/); // çerçeve "mod:" satırını yalnızca bağlantıdan SONRA yazar
    });
});
