/**
 * PRC-R0 — maliyet tek yazma noktası (doğrulama, costUpdatedAt, değişmeyen yazılmaz, sil, kapsam) + genel varyant kaydında maliyet
 * alanlarının süzülmesi. PRC-CFG — backoffice tenant istisnası (doğrulama, gerekçe, önce/sonra, denetim olayı). Bellek-içi sahte model (DB yok).
 */
import { describe, it, expect } from '@jest/globals';
import { ObjectId } from 'mongodb';

/** Testin kullandığı Mongo filtre alt kümesi (eşitlik, $in, $exists, $type:number, $not, $gt, $lt, $or, noktalı yol). */
const get = (d: any, path: string) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), d);
const eq = (a: any, b: any) => (a instanceof ObjectId || b instanceof ObjectId ? String(a) === String(b) : a === b);
const cmp = (a: any, b: any) => (a instanceof Date ? a.getTime() : String(a)) < (b instanceof Date ? b.getTime() : String(b));
function opMatch(v: any, cond: any): boolean {
    if (cond === null || typeof cond !== 'object' || cond instanceof ObjectId || cond instanceof Date) return eq(v, cond);
    return Object.entries(cond).every(([op, arg]: [string, any]) => {
        switch (op) {
            case '$in': return arg.some((x: any) => eq(v, x));
            case '$exists': return (v !== undefined) === arg;
            case '$type': return arg === 'number' ? typeof v === 'number' : false;
            case '$not': return !opMatch(v, arg);
            case '$gt': return v !== undefined && cmp(arg, v);
            case '$lt': return v !== undefined && cmp(v, arg);
            default: throw new Error('desteklenmeyen operatör ' + op);
        }
    });
}
const sift = (f: any) => (d: any): boolean => Object.entries(f).every(([k, c]: [string, any]) => (k === '$or' ? c.some((x: any) => sift(x)(d)) : opMatch(get(d, k), c)));
import { listVariantCosts, setVariantCosts, coveragePercent, COST_STALE_DAYS } from '@operations/pricing/variantCost';
import { stripEngineOwnedVariantFields, PRICING_OWNED_VARIANT_FIELDS } from '../../../src/api/rpc/handlers/product-service';
import { getCompetitionSettings, setCompetitionOverride } from '@operations/backoffice/competitionAdmin';
import { getSettingDef } from '@integration/config/catalog';

const NOW = new Date('2026-10-01T12:00:00Z');

function fakeModel(docs: any[]) {
    const q = (rows: any[]) => {
        const chain: any = {
            sort: (s: Record<string, number>) => { const [k, dir] = Object.entries(s)[0]; rows = [...rows].sort((a, b) => (String(a[k]) < String(b[k]) ? -dir : String(a[k]) > String(b[k]) ? dir : 0)); return chain; },
            limit: (n: number) => { rows = rows.slice(0, n); return chain; },
            maxTimeMS: () => chain,
            lean: async () => rows.map((r) => ({ ...r })),
            then: (res: any, rej: any) => chain.lean().then(res, rej),
        };
        return chain;
    };
    return {
        docs,
        find: (f: any) => q(docs.filter(sift(f))),
        findOne: (f: any) => ({ lean: async () => { const d = docs.find(sift(f)); return d ? JSON.parse(JSON.stringify(d)) : null; } }),
        countDocuments: async (f: any) => docs.filter(sift(f)).length,
        bulkWrite: async (ops: any[]) => {
            for (const op of ops) {
                const d = docs.find(sift(op.updateOne.filter));
                if (!d) continue;
                Object.assign(d, op.updateOne.update.$set ?? {});
                for (const k of Object.keys(op.updateOne.update.$unset ?? {})) delete d[k];
            }
        },
        updateOne: async (f: any, u: any) => {
            const d = docs.find(sift(f));
            if (!d) return { matchedCount: 0 };
            for (const [k, v] of Object.entries(u.$set ?? {})) { const [a, b] = k.split('.'); if (b) { d[a] = { ...(d[a] ?? {}), [b]: v }; } else d[a] = v; }
            for (const k of Object.keys(u.$unset ?? {})) { const [a, b] = k.split('.'); if (b && d[a]) delete d[a][b]; else delete d[a]; }
            return { matchedCount: 1 };
        },
        create: async (doc: any) => { docs.push(doc); return doc; },
    };
}

const vid = () => new ObjectId();
const db = (variants: any[]) => ({ getVariantModel: () => fakeModel(variants) }) as any;

describe('setVariantCosts (PRC-R0 tek yazma noktası)', () => {
    it('yazar, costUpdatedAt ekler, değişmeyeni yazmaz, bilinmeyeni raporlar, null siler; kapsam döner', async () => {
        const a = vid(), b = vid(), c = vid();
        const variants = [{ _id: a, barcode: 'A' }, { _id: b, barcode: 'B', costPrice: 10, costUpdatedAt: new Date('2026-01-01') }, { _id: c, barcode: 'C', costPrice: 7 }];
        const d = db(variants);
        const r = await setVariantCosts(d, { items: [{ barcode: 'A', costPrice: 12.5 }, { variantId: String(b), costPrice: 10 }, { barcode: 'C', costPrice: null }, { barcode: 'ZZ', costPrice: 3 }] }, NOW);
        expect(r).toMatchObject({ updated: 2, unchanged: 1, notFound: ['ZZ'] });
        expect(r.changes).toEqual([{ variantId: String(a), before: null, after: 12.5 }, { variantId: String(c), before: 7, after: null }]);
        expect(variants[0]).toMatchObject({ costPrice: 12.5, costUpdatedAt: NOW });
        expect(variants[1].costUpdatedAt).toEqual(new Date('2026-01-01'));
        expect(variants[2].costPrice).toBeUndefined();
        expect(r.coverage).toEqual({ total: 3, withCost: 2, percent: 66.7, stale: 1 });
    });
    it('doğrulama: negatif, 2 ondalıktan fazla, variantId+barcode birlikte, >500 -> VALIDATION', async () => {
        const d = db([]);
        await expect(setVariantCosts(d, { items: [{ barcode: 'A', costPrice: -1 }] })).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(setVariantCosts(d, { items: [{ barcode: 'A', costPrice: 1.234 }] })).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(setVariantCosts(d, { items: [{ barcode: 'A', variantId: String(vid()), costPrice: 1 }] })).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(setVariantCosts(d, { items: Array.from({ length: 501 }, (_, i) => ({ barcode: `b${i}`, costPrice: 1 })) })).rejects.toMatchObject({ code: 'VALIDATION' });
    });
    it('listVariantCosts: missingOnly + eski maliyet bayrağı + imleç', async () => {
        const old = new Date(NOW.getTime() - (COST_STALE_DAYS + 1) * 86_400_000);
        const ids = [vid(), vid(), vid()].sort((x, y) => String(x).localeCompare(String(y)));
        const d = db([{ _id: ids[0], barcode: 'A', costPrice: 5, costUpdatedAt: old }, { _id: ids[1], barcode: 'B' }, { _id: ids[2], barcode: 'C' }]);
        const all = await listVariantCosts(d, { limit: 2 }, NOW);
        expect(all.items.map((x) => x.barcode)).toEqual(['A', 'B']);
        expect(all.items[0].stale).toBe(true);
        expect(all.nextCursor).toBe(String(ids[1]));
        const missing = await listVariantCosts(d, { missingOnly: true }, NOW);
        expect(missing.items.map((x) => x.barcode)).toEqual(['B', 'C']);
        expect(coveragePercent(0, 0)).toBe(0);
    });
    it('genel varyant/ürün kaydı maliyet ve rekabet alanlarını süzer (bayat form ezemez)', () => {
        expect(PRICING_OWNED_VARIANT_FIELDS).toEqual(['costPrice', 'costUpdatedAt', 'competition', 'pricePending', 'priceDirty']); // + WP5 otomatik yayın işaretleri
        expect(stripEngineOwnedVariantFields({ _id: 1, stock: 3, costPrice: 9, costUpdatedAt: 'x', competition: {} })).toEqual({ _id: 1, stock: 3 });
    });
});

describe('competitionAdmin (PRC-CFG backoffice)', () => {
    const read = (k: string) => getSettingDef(k)?.default;
    const mk = () => {
        const subs = [{ clientId: 5, planCode: 'starter' }, { clientId: 6, planCode: 'growth', limitOverrides: { competition: { skuCap: 2000 } } }];
        const events: any[] = [];
        const d = { subscriptionModel: fakeModel(subs), clientModel: fakeModel([{ order: 6, title: 'Tenant Six' }]), billingEventModel: { create: async (e: any) => { events.push(e); } }, read, now: () => NOW };
        return { d, subs, events };
    };
    it('ayar görünümü: plan varsayılanları, bütçe, bildirim, istisnası olan tenant\'lar', async () => {
        const { d } = mk();
        const r = await getCompetitionSettings(d);
        expect(r.plans.map((p) => [p.plan, p.skuCap, p.refreshMin])).toEqual([['starter', 100, 360], ['growth', 1000, 30], ['enterprise', 5000, 30]]);
        expect(r.budgets).toEqual([{ channel: 'trendyol', perMin: 60, key: 'pricing.buybox.budget.trendyol.perMin' }]);
        expect(r.notify).toEqual({ shadow: true, cooldownHours: 24 });
        expect(r.overrides).toHaveLength(1);
        expect(r.overrides[0]).toMatchObject({ tid: 6, tenantName: 'Tenant Six', override: { skuCap: 2000 }, effective: { skuCap: 2000 } });
    });
    it('istisna yazımı: gerekçe zorunlu, sınır dışı reddedilir, önce/sonra + denetim olayı', async () => {
        const { d, subs, events } = mk();
        await expect(setCompetitionOverride(d, { tid: 5, override: { skuCap: 300 } }, { reason: 'kısa' })).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(setCompetitionOverride(d, { tid: 5, override: { refreshMin: 1 } }, { reason: 'pilot müşteri talebi' })).rejects.toMatchObject({ code: 'VALIDATION' });
        const r = await setCompetitionOverride(d, { tid: 5, override: { skuCap: 300, refreshMin: 60 }, note: 'pilot' }, { sub: 'admin1', reason: 'pilot müşteri talebi' });
        expect(r).toMatchObject({ tid: 5, cleared: false, before: {}, after: { skuCap: 300, refreshMin: 60 }, effective: { skuCap: 300, refreshMin: 60, freshnessMin: 30 } });
        expect(subs[0].limitOverrides!.competition).toMatchObject({ skuCap: 300, note: 'pilot', updatedBy: 'admin1', updatedAt: NOW });
        expect(events[0]).toMatchObject({ type: 'subscription.competition_override', clientId: 5, payloadRedacted: { before: {}, after: { skuCap: 300, refreshMin: 60 }, actor: 'admin1' } });
    });
    it('istisna kaldırma (null) plan varsayılanına döner; bilinmeyen tenant 404', async () => {
        const { d } = mk();
        const r = await setCompetitionOverride(d, { tid: 6, override: null }, { reason: 'standart plana dönüş' });
        expect(r).toMatchObject({ cleared: true, before: { skuCap: 2000 }, after: {}, effective: { skuCap: 1000 } });
        await expect(setCompetitionOverride(d, { tid: 99, override: null }, { reason: 'standart plana dönüş' })).rejects.toMatchObject({ code: 'SUBSCRIPTION_NOT_FOUND' });
    });
});
