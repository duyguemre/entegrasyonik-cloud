/**
 * Plans seed (ADR-0008 §2 / ADR-0014 S4a): seed dosyasının şeması + idempotent seed script'i.
 * Sahte koleksiyon (Mongo/ağ YOK) -- script GERÇEK DB'ye ÇALIŞTIRILMAZ; yalnızca mantık ve korumalar doğrulanır.
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const seedMod = require('../../../dev-tools/seed-plans.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const common = require('../../../dev-tools/_migrationCommon.js');

const SEED_FILE = path.join(__dirname, '..', '..', '..', 'src', 'database', 'application', 'seed', 'plans.seed.json');
const load = () => JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

// ---- sahte Plans koleksiyonu: findOne({code}) + updateOne(filter, {$set,$setOnInsert}, {upsert}) ----
function fakeDb(initial: any[] = []) {
    const docs = initial.map(d => ({ ...d }));
    const writes: any[] = [];
    const col = {
        findOne: async (f: any) => { const d = docs.find(x => x.code === f.code); return d ? JSON.parse(JSON.stringify(d)) : null; },
        updateOne: async (f: any, u: any, o: any) => {
            writes.push({ f, u, o });
            let d = docs.find(x => x.code === f.code);
            if (!d) { if (!o.upsert) return { matchedCount: 0 }; d = { ...f, ...u.$setOnInsert }; docs.push(d); }
            Object.assign(d, u.$set);
            return { matchedCount: 1 };
        },
    };
    return { db: { collection: (name: string) => { if (name !== 'Plans') throw new Error('beklenmeyen koleksiyon: ' + name); return col; } }, docs, writes };
}

describe('plans.seed.json (site + backend tek doğruluk kaynağı)', () => {
    const seed = load();

    it('şema geçerli ve "ÖNERİ — insan kararı bekliyor" işaretini taşır', () => {
        expect(seedMod.validateSeed(seed)).toEqual([]);
        expect(seed._meta.status).toContain('ÖNERİ');
        expect(seed._meta.status).toContain('insan kararı');
        expect(seed.vat.status).toContain('ÖNERİ');
    });

    it('ADR-0008 §2 öneri değerleri: Başlangıç ₺2.490, Büyüme ₺5.990 (KDV hariç, kuruş), Kurumsal priceMinor 0 = özel teklif', () => {
        const by = Object.fromEntries(seed.plans.map((p: any) => [p.code, p]));
        expect(by.starter).toMatchObject({ priceMinor: 249000, vatIncluded: false, currency: 'TRY', limits: { channels: 2, skus: 5000, users: 3, mcpCallsPerDay: 500 } });
        expect(by.growth).toMatchObject({ priceMinor: 599000, limits: { channels: 5, skus: 25000, users: 10, mcpCallsPerDay: 2000 }, features: ['erp', 'einvoice', 'shipping'] });
        expect(by.enterprise.priceMinor).toBe(0);
        for (const p of seed.plans) { expect(p.active).toBe(true); expect(p.public).toBe(true); }
    });

    it('deneme: 14 gün, kartsız, plan seed içinde tanımlı (ADR-0008 §3)', () => {
        expect(seed.trial).toMatchObject({ planCode: 'starter', days: 14, cardRequired: false });
        expect(seed.plans.map((p: any) => p.code)).toContain(seed.trial.planCode);
    });

    it('saf JSON: sır/bağlantı dizesi/backend import\'u yok (site derleme zamanında okur)', () => {
        const raw = fs.readFileSync(SEED_FILE, 'utf8');
        expect(raw).not.toMatch(/mongodb(\+srv)?:\/\//i);
        expect(raw).not.toMatch(/password|secret|apikey|token/i);
    });

    it('bozuk seed reddedilir: yinelenen kod, ondalıklı fiyat, ÖNERİ işareti silinmiş, bilinmeyen trial planı', () => {
        const bad = load();
        bad.plans.push({ ...bad.plans[0] });
        bad.plans[1].priceMinor = 2490.5;
        bad._meta.status = 'nihai';
        bad.trial.planCode = 'yok';
        const errs: string[] = seedMod.validateSeed(bad);
        expect(errs.some(e => e.includes('yinelenen'))).toBe(true);
        expect(errs.some(e => e.includes('priceMinor'))).toBe(true);
        expect(errs.some(e => e.includes('ÖNERİ'))).toBe(true);
        expect(errs.some(e => e.includes('trial.planCode'))).toBe(true);
    });
});

describe('seedPlans (idempotent + korumalar)', () => {
    const now = () => new Date('2026-09-28T00:00:00Z');

    it('DRY-RUN (varsayılan): hiçbir yazma yapmaz, plan eylemlerini raporlar (hepsi created)', async () => {
        const f = fakeDb();
        const r = await seedMod.seedPlans({ db: f.db, dbName: 'entegrasyonikDB', seed: load() });
        expect(r.apply).toBe(false);
        expect(f.writes).toHaveLength(0);
        expect(r.counts).toEqual({ created: 3, updated: 0, unchanged: 0, skipped_newer: 0 });
    });

    it('--apply: 3 plan yazılır; providerRefs/createdAt yalnızca ilk eklemede; yalnızca şema alanları (featureNotes YAZILMAZ)', async () => {
        const f = fakeDb();
        const r = await seedMod.seedPlans({ db: f.db, dbName: 'entegrasyonikDB', seed: load(), apply: true, now });
        expect(r.counts.created).toBe(3);
        expect(f.docs.map((d: any) => d.code).sort()).toEqual(['enterprise', 'growth', 'starter']);
        const w = f.writes[0];
        expect(w.o).toEqual({ upsert: true });
        expect(w.u.$setOnInsert).toEqual({ providerRefs: {}, createdAt: now() });
        expect(Object.keys(w.u.$set).sort()).toEqual(['active', 'currency', 'features', 'interval', 'limits', 'name', 'priceMinor', 'public', 'updatedAt', 'vatIncluded', 'version']);
    });

    it('İDEMPOTENT: ikinci çalıştırma hiçbir şey yazmaz (unchanged)', async () => {
        const f = fakeDb();
        await seedMod.seedPlans({ db: f.db, dbName: 'entegrasyonikDB', seed: load(), apply: true, now });
        const before = f.writes.length;
        const r = await seedMod.seedPlans({ db: f.db, dbName: 'entegrasyonikDB', seed: load(), apply: true, now });
        expect(r.counts).toEqual({ created: 0, updated: 0, unchanged: 3, skipped_newer: 0 });
        expect(f.writes.length).toBe(before);
    });

    it('seed değişince (fiyat + version artışı) yalnızca ilgili plan güncellenir; sağlayıcının yazdığı providerRefs EZİLMEZ', async () => {
        const f = fakeDb();
        await seedMod.seedPlans({ db: f.db, dbName: 'entegrasyonikDB', seed: load(), apply: true, now });
        f.docs.find((d: any) => d.code === 'growth').providerRefs = { iyzico: 'plan-ref-1' };
        const changed = load();
        const g = changed.plans.find((p: any) => p.code === 'growth');
        g.priceMinor = 649000; g.version = 2;
        const r = await seedMod.seedPlans({ db: f.db, dbName: 'entegrasyonikDB', seed: changed, apply: true, now });
        expect(r.counts).toEqual({ created: 0, updated: 1, unchanged: 2, skipped_newer: 0 });
        expect(r.results.find((x: any) => x.code === 'growth').fields).toEqual(expect.arrayContaining(['priceMinor', 'version']));
        const doc = f.docs.find((d: any) => d.code === 'growth');
        expect(doc.priceMinor).toBe(649000);
        expect(doc.providerRefs).toEqual({ iyzico: 'plan-ref-1' });
    });

    it('DB\'de seed\'den DAHA YENİ sürüm varsa dokunulmaz (skipped_newer; elle yükseltilmiş plan geri alınmaz)', async () => {
        const f = fakeDb([{ code: 'starter', version: 5, priceMinor: 1 }]);
        const r = await seedMod.seedPlans({ db: f.db, dbName: 'entegrasyonikDB', seed: load(), apply: true, now });
        expect(r.results.find((x: any) => x.code === 'starter').action).toBe('skipped_newer');
        expect(f.docs.find((d: any) => d.code === 'starter').priceMinor).toBe(1);
    });

    it('İZİNLİ 7 DB DIŞINA yazmayı REDDEDER (dry-run ve apply); hiçbir koleksiyona erişilmez', async () => {
        for (const bad of ['admin', 'baska_proje_db', 'entegrasyonikClient_9', '', undefined]) {
            for (const apply of [false, true]) {
                const f = fakeDb();
                let touched = false;
                const db = { collection: () => { touched = true; return f.db.collection('Plans'); } };
                await expect(seedMod.seedPlans({ db, dbName: bad, seed: load(), apply })).rejects.toThrow(/izinli listede değil/);
                expect(touched).toBe(false);
            }
        }
        expect(() => seedMod.assertAllowedDb('entegrasyonikDB')).not.toThrow();
    });

    it('izinli liste, ortak göç çerçevesindeki (CLAUDE.md kural 2) 7 isimle BİREBİR aynı', () => {
        expect(seedMod.ALLOWED_DBS).toEqual(common.ALLOWED_DBS);
        expect(seedMod.ALLOWED_DBS).toHaveLength(7);
    });

    it('geçersiz seed ile çalıştırma HATA verir (yazmadan önce)', async () => {
        const f = fakeDb();
        const bad = load();
        bad.plans[0].priceMinor = -1;
        await expect(seedMod.seedPlans({ db: f.db, dbName: 'entegrasyonikDB', seed: bad, apply: true })).rejects.toThrow(/Seed dosyası geçersiz/);
        expect(f.writes).toHaveLength(0);
    });
});

describe('npm script + CLI güvenliği', () => {
    it('package.json "seed:plans" script\'i tanımlı ve --apply\'ı varsayılan yapmaz', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf8'));
        expect(pkg.scripts['seed:plans']).toBe('node dev-tools/seed-plans.js');
    });

    it('CLI kaynağı: --apply için SEED_PLANS_BACKUP_CONFIRMED=yes şartı ve bağlantı dizesi/sır içermez', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'dev-tools', 'seed-plans.js'), 'utf8');
        expect(src).toContain("SEED_PLANS_BACKUP_CONFIRMED !== 'yes'");
        expect(src).not.toMatch(/mongodb(\+srv)?:\/\/[^\s'"<]/i);
    });
});
