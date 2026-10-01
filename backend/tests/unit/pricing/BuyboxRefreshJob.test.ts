/**
 * PRC-R1 + PRC-CFG — zamanlanmış buybox işi (sahte bağımlılıklar): kapılar, bütçe/adil sıra, erteleme, hata yalıtımı,
 * "kaybedildi" bildirimi (gölge mod + soğuma), SALT OKUMA (yalnız read çağrısı; pazaryerine yazma yok).
 */
import { describe, it, expect } from '@jest/globals';
import { BuyboxRefreshJob, type BuyboxJobDeps, type TenantCandidateRow } from '@operations/pricing/BuyboxRefreshJob';
import { resolveCompetitionSettings } from '@operations/pricing/competitionSettings';
import { getSettingDef } from '@integration/config/catalog';

const NOW = new Date('2026-10-01T12:00:00Z');
const read = (k: string) => getSettingDef(k)?.default;
const settings = (o: any = {}) => resolveCompetitionSettings({ planCode: 'growth', override: o }, read);
const rows = (prefix: string, n: number, prev: any = null): TenantCandidateRow[] =>
    Array.from({ length: n }, (_, i) => ({ variantId: `${prefix}${i}`, barcode: `${prefix}-${i}`, stock: 1, checkedAt: null, changedAt: null, ownPrice: 100, prev }));

function deps(o: Partial<BuyboxJobDeps> & { tenants?: Array<{ tid: number; settings: any; rows: TenantCandidateRow[] }> } = {}) {
    const log = { reads: [] as Array<{ tid: number; barcodes: string[] }>, applied: [] as any[], notified: [] as any[], marked: [] as any[] };
    const tenants = o.tenants ?? [];
    const d: BuyboxJobDeps = {
        now: () => NOW,
        enabled: () => true,
        intakeOpen: () => true,
        budgetPerMin: () => 100,
        shadow: () => true,
        cooldownMs: () => 24 * 3600_000,
        listTenants: async () => tenants.map((t) => ({ tid: t.tid, settings: t.settings })),
        loadCandidates: async (tid) => tenants.find((t) => t.tid === tid)!.rows,
        read: async (tid, barcodes) => { log.reads.push({ tid, barcodes }); return barcodes.map((b) => ({ barcode: b, found: true, buyboxOrder: 2, buyboxPrice: 90, hasMultipleSeller: true })); },
        apply: async (tid, items) => { log.applied.push({ tid, items }); },
        notifyLost: async (tid, p, opts) => { log.notified.push({ tid, p, opts }); },
        markNotified: async (tid, ids) => { log.marked.push({ tid, ids }); },
        ...o,
    };
    return { d, log };
}

describe('kapılar', () => {
    it('features.competition kapalı -> hiç okuma yok', async () => {
        const { d, log } = deps({ enabled: () => false, tenants: [{ tid: 1, settings: settings(), rows: rows('a', 3) }] });
        expect((await new BuyboxRefreshJob(d).runOnce()).skipped).toBe('disabled');
        expect(log.reads).toHaveLength(0);
    });
    it('Trendyol intake kapalı (kill-switch) -> atlanır', async () => {
        const { d } = deps({ intakeOpen: () => false });
        expect((await new BuyboxRefreshJob(d).runOnce()).skipped).toBe('intake_closed');
    });
    it('bütçe 0 -> atlanır', async () => {
        const { d } = deps({ budgetPerMin: () => 0 });
        expect((await new BuyboxRefreshJob(d).runOnce()).skipped).toBe('no_budget');
    });
    it('tenant listesinde olmayan tenant (pilot) ve skuCap 0 okunmaz', async () => {
        const { d, log } = deps({
            enabled: (tid?: number) => tid === undefined || tid === 1,
            tenants: [{ tid: 1, settings: settings(), rows: rows('a', 2) }, { tid: 2, settings: settings(), rows: rows('b', 2) }, { tid: 3, settings: settings({ skuCap: 0 }), rows: rows('c', 2) }],
        });
        await new BuyboxRefreshJob(d).runOnce();
        expect([...new Set(log.reads.map((r) => r.tid))]).toEqual([1]);
    });
});

describe('bütçe + adil sıra', () => {
    it('bütçe dolunca kalan ertelenir; tenant\'lar sırayla pay alır', async () => {
        const { d, log } = deps({ budgetPerMin: () => 3, tenants: [{ tid: 1, settings: settings(), rows: rows('a', 100) }, { tid: 2, settings: settings(), rows: rows('b', 5) }] });
        const r = await new BuyboxRefreshJob(d).runOnce();
        expect(log.reads.map((x) => x.tid)).toEqual([1, 2, 1]);
        expect(log.reads.every((x) => x.barcodes.length <= 10)).toBe(true);
        expect(r.calls).toBe(3);
        expect(r.deferred).toBe(100 - 20);
    });
    it('SKU tavanı plan/tenant istisnasından: tavan dışı barkod okunmaz', async () => {
        const { d, log } = deps({ tenants: [{ tid: 1, settings: settings({ skuCap: 12 }), rows: rows('a', 40) }] });
        await new BuyboxRefreshJob(d).runOnce();
        expect(log.reads.flatMap((x) => x.barcodes)).toHaveLength(12);
    });
    it('vadesi gelmemiş barkod (tazeleme aralığı) okunmaz', async () => {
        const fresh = rows('a', 3).map((r) => ({ ...r, checkedAt: new Date(NOW.getTime() - 5 * 60_000) }));
        const { d, log } = deps({ tenants: [{ tid: 1, settings: settings(), rows: fresh }] });
        await new BuyboxRefreshJob(d).runOnce();
        expect(log.reads).toHaveLength(0);
    });
});

describe('sonuç yazımı ve bildirim', () => {
    const winningPrev = { status: 'winning', buyboxOrder: 1, buyboxPrice: 100, checkedAt: new Date(NOW.getTime() - 3 * 3600_000), changedAt: new Date(NOW.getTime() - 3 * 3600_000), snapshotAt: new Date(NOW.getTime() - 3 * 3600_000), lostAt: null, lostNotifiedAt: null };
    it('winning -> losing: durum yazılır, gölge modda bildirim (shadow:true) + soğuma işareti', async () => {
        const { d, log } = deps({ tenants: [{ tid: 1, settings: settings(), rows: rows('a', 2, winningPrev) }] });
        const r = await new BuyboxRefreshJob(d).runOnce();
        expect(r).toMatchObject({ observed: 2, lost: 2, notified: 2 });
        expect(log.applied[0].items[0].state).toMatchObject({ status: 'losing', buyboxOrder: 2, buyboxPrice: 90 });
        expect(log.notified[0]).toMatchObject({ tid: 1, p: { integ: 'trendyol', buyboxOrder: 2, buyboxPrice: 90, day: '2026-10-01' }, opts: { shadow: true } });
        expect(log.marked[0].ids).toEqual(['a0', 'a1']);
    });
    it('soğuma dolmadıysa kayıp sayılır ama bildirilmez', async () => {
        const prev = { ...winningPrev, lostNotifiedAt: new Date(NOW.getTime() - 3600_000) };
        const { d, log } = deps({ tenants: [{ tid: 1, settings: settings(), rows: rows('a', 1, prev) }] });
        const r = await new BuyboxRefreshJob(d).runOnce();
        expect(r.lost).toBe(1);
        expect(log.notified).toHaveLength(0);
    });
    it('bir tenant\'ta okuma hatası diğerini durdurmaz; hatalı tenant\'ın kalan partileri ertelenir', async () => {
        const { d, log } = deps({
            budgetPerMin: () => 10,
            read: async (tid, barcodes) => { if (tid === 1) throw new Error('429'); log.reads.push({ tid, barcodes }); return barcodes.map((b) => ({ barcode: b, found: false, buyboxOrder: null, buyboxPrice: null, hasMultipleSeller: null })); },
            tenants: [{ tid: 1, settings: settings(), rows: rows('a', 30) }, { tid: 2, settings: settings(), rows: rows('b', 15) }],
        });
        const r = await new BuyboxRefreshJob(d).runOnce();
        expect(r.failedTenants).toBe(1);
        expect(log.reads.every((x) => x.tid === 2)).toBe(true);
        expect(log.applied.flatMap((a) => a.items)).toHaveLength(15);
        expect(r.deferred).toBe(20);
    });
    it('salt okuma: bağımlılık yüzeyinde pazaryerine yazma yok', () => {
        const { d } = deps();
        expect(Object.keys(d).sort()).toEqual(['apply', 'budgetPerMin', 'cooldownMs', 'enabled', 'intakeOpen', 'listTenants', 'loadCandidates', 'markNotified', 'notifyLost', 'now', 'read', 'shadow']);
    });
});
