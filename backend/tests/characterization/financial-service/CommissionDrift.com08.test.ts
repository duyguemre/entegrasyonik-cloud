/**
 * COM-08: komisyon sapma uyarisi — saf karar (esik/ornek kapisi), referans secimi (override > tablo), makinece okunabilir rapor,
 * gunluk is (bildirim params'i, ay penceresi, bildirim kapaliyken DB'siz donus, tenant hatasi izolasyonu), katalog/ayar baglari.
 * DB/ag YOK (sahte clientDB; Trendyol kategori 368 = %25 gercek kanal tablosundan, COM-03 testleriyle ayni fikstur).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
    evaluateDrift, getCommissionDrift, resolveDriftThreshold, driftWindow,
    DRIFT_THRESHOLD_FALLBACK, DRIFT_THRESHOLD_KEY, DRIFT_MIN_SAMPLES, DRIFT_CHANNELS,
} from '@operations/finance/commissionDrift';
import { runCommissionDrift, DRIFT_NOTIFY_PER_CHANNEL_MAX, type CommissionDriftJobDeps } from '@operations/finance/commissionDriftJob';
import { getSettingDef } from '@integration/config/catalog';
import { getDefinition } from '@operations/notifications/catalog';
import { resetCacheForTests } from '@utils/decorator/cache';
import FinancialService from '@api/rpc/handlers/financial-service';
import { CAPABILITY_BY_RPC } from '../../../src/capabilities';

beforeEach(() => resetCacheForTests());

describe('evaluateDrift (saf)', () => {
    const o = { thresholdPoints: 2, minSamples: 5 };
    it('esik dahil: |delta| >= esik -> drift; altinda ok; iki yon', () => {
        expect(evaluateDrift({ realizedRate: 22, sampleCount: 5, referenceRate: 20 }, o)).toEqual({ deltaPoints: 2, status: 'drift' });
        expect(evaluateDrift({ realizedRate: 18.01, sampleCount: 9, referenceRate: 20 }, o)).toEqual({ deltaPoints: -1.99, status: 'ok' });
        expect(evaluateDrift({ realizedRate: 15, sampleCount: 9, referenceRate: 20 }, o)).toEqual({ deltaPoints: -5, status: 'drift' });
    });
    it('referans yok -> no_reference (delta null); gercek %0 referans korunur', () => {
        expect(evaluateDrift({ realizedRate: 20, sampleCount: 50, referenceRate: null }, o)).toEqual({ deltaPoints: null, status: 'no_reference' });
        expect(evaluateDrift({ realizedRate: 3, sampleCount: 50, referenceRate: 0 }, o)).toEqual({ deltaPoints: 3, status: 'drift' });
    });
    it('az ornek -> insufficient_samples (gurultu kapisi; delta yine raporlanir)', () => {
        expect(evaluateDrift({ realizedRate: 30, sampleCount: 4, referenceRate: 20 }, o)).toEqual({ deltaPoints: 10, status: 'insufficient_samples' });
    });
});

function chain(result: any) { const c: any = { limit: jest.fn(() => c), lean: jest.fn(async () => result) }; return c; }
function fakeDb(o: { agg?: any[]; variants?: any[]; products?: any[]; cats?: any[]; attrMaps?: any[]; overrides?: any[] }) {
    return {
        getFinancialTransactionModel: () => ({ find: jest.fn(() => chain([])), aggregate: jest.fn(async () => o.agg ?? []) }),
        getVariantModel: () => ({ find: jest.fn(() => ({ lean: async () => o.variants ?? [] })) }),
        getProductModel: () => ({ find: jest.fn(() => ({ lean: async () => o.products ?? [] })) }),
        getCategoryModel: () => ({ find: jest.fn(() => ({ lean: async () => o.cats ?? [] })) }),
        getAttributeMappingModel: () => ({ find: jest.fn(() => ({ lean: async () => o.attrMaps ?? [] })) }),
        getCommissionOverrideModel: () => ({ find: jest.fn(() => chain(o.overrides ?? [])) }),
    };
}
// L2 -> Trendyol 368 (%25, kanal tablosu); L3 eslemesiz (referans yok); L4 -> 368, az ornek.
const base = {
    agg: [{ _id: 'A', rateSum: 21.5 * 10, count: 10 }, { _id: 'B', rateSum: 25.5 * 6, count: 6 }, { _id: 'C', rateSum: 30 * 2, count: 2 }, { _id: 'Z', rateSum: 10, count: 1 }],
    variants: [{ barcode: 'A', productId: 'p2' }, { barcode: 'B', productId: 'p3' }, { barcode: 'C', productId: 'p4' }],
    products: [{ _id: 'p2', category: 'L2' }, { _id: 'p3', category: 'L3' }, { _id: 'p4', category: 'L4' }],
    cats: [{ _id: 'L2', title: 'Giyim' }],
    attrMaps: [
        { integrationCode: 'trendyol', isCategoryMapping: true, localCategoryId: 'L2', platformCategoryId: '368' },
        { integrationCode: 'trendyol', isCategoryMapping: true, localCategoryId: 'L4', platformCategoryId: '368' },
    ],
};

describe('getCommissionDrift (rapor)', () => {
    it('tablo referansi: drift / no_reference / insufficient_samples; kategorisiz satir atlanir; drift once', async () => {
        const r = await getCommissionDrift(fakeDb(base), 'c-com08-a', { integrationCode: 'Trendyol' });
        expect(r).toMatchObject({ integrationCode: 'trendyol', days: 30, thresholdPoints: 2, minSamples: DRIFT_MIN_SAMPLES });
        expect(r.items).toEqual([
            { integrationCode: 'trendyol', categoryId: 'L2', platformCategoryId: '368', title: 'Giyim', realizedRate: 21.5, sampleCount: 10, referenceRate: 25, referenceSource: 'estimated', deltaPoints: -3.5, status: 'drift' },
            { integrationCode: 'trendyol', categoryId: 'L4', platformCategoryId: '368', title: null, realizedRate: 30, sampleCount: 2, referenceRate: 25, referenceSource: 'estimated', deltaPoints: 5, status: 'insufficient_samples' },
            { integrationCode: 'trendyol', categoryId: 'L3', platformCategoryId: null, title: null, realizedRate: 25.5, sampleCount: 6, referenceRate: null, referenceSource: null, deltaPoints: null, status: 'no_reference' },
        ]);
    });
    it('tenant override referansi tablonun yerini alir (kategori > kanal varsayilan)', async () => {
        const db = fakeDb({ ...base, overrides: [{ scope: 'category', platformCategoryId: '368', rate: 21 }, { scope: 'default', platformCategoryId: null, rate: 25 }] });
        const r = await getCommissionDrift(db, 'c-com08-b', { integrationCode: 'trendyol' });
        expect(r.items.find((i) => i.categoryId === 'L2')).toMatchObject({ referenceRate: 21, referenceSource: 'override', deltaPoints: 0.5, status: 'ok' });
        expect(r.items.find((i) => i.categoryId === 'L3')).toMatchObject({ referenceRate: 25, referenceSource: 'override', deltaPoints: 0.5, status: 'ok' });
    });
    it('acik esik parametresi ayardan oncelikli; veri yoksa bos rapor', async () => {
        const r = await getCommissionDrift(fakeDb(base), 'c-com08-c', { integrationCode: 'trendyol', thresholdPoints: 4 });
        expect(r.items.find((i) => i.categoryId === 'L2')!.status).toBe('ok');
        expect((await getCommissionDrift(fakeDb({}), 'c-com08-d', { integrationCode: 'trendyol' })).items).toEqual([]);
    });
});

describe('ayar + katalog + yetenek baglari', () => {
    it('esik anahtari kanal kapsamli (ADR-0031 _platform tavanina girmez), varsayilan kod yedegiyle ayni', () => {
        const def = getSettingDef(DRIFT_THRESHOLD_KEY)!;
        expect(def.scope).toBe('integration');
        expect(String(def.group).startsWith('platform.')).toBe(false);
        expect((def.default as any)._).toBe(DRIFT_THRESHOLD_FALLBACK);
        expect(def.schema.safeParse(0).success).toBe(false);
        expect(resolveDriftThreshold('trendyol')).toBe(DRIFT_THRESHOLD_FALLBACK);
    });
    it('COMMISSION_RATE_DRIFT: finance kategorisi, kanal:kategori:ay dedupe, ornek params semayi gecer', () => {
        const d: any = getDefinition('COMMISSION_RATE_DRIFT');
        expect(d).toMatchObject({ category: 'finance', surface: 'tenant', mandatory: false });
        expect(d.params.safeParse(d.example).success).toBe(true);
        expect(d.dedupeKey(d.example)).toBe('trendyol:64b000000000000000000001:2026-10');
        expect(d.params.safeParse({ ...d.example, referenceSource: 'actual' }).success).toBe(false);
    });
    it('RPC salt okuma (member, finance:read) yetenek kaydinda; varsayilan kanal trendyol', async () => {
        expect(CAPABILITY_BY_RPC.get('FinancialService/getCommissionDrift')).toMatchObject({ effect: 'read', minTier: 'member', permission: 'finance:read' });
        const s: any = new FinancialService(1, {}); s.clientDB = fakeDb({});
        expect(await s.getCommissionDrift()).toMatchObject({ integrationCode: 'trendyol', items: [] });
        const bad: any = new FinancialService(1, { integrationCode: { $ne: 1 } }); bad.clientDB = fakeDb({});
        await expect(bad.getCommissionDrift()).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe('driftWindow', () => {
    it('Europe/Istanbul takvim ayi (UTC ay sonu gecisi)', () => {
        expect(driftWindow(new Date('2026-10-15T12:00:00Z'))).toBe('2026-10');
        expect(driftWindow(new Date('2026-09-30T22:30:00Z'))).toBe('2026-10'); // TR 01:30, 1 Ekim
    });
});

describe('runCommissionDrift (gunluk is)', () => {
    const item = (categoryId: string, status: string, extra: any = {}) => ({
        integrationCode: 'trendyol', categoryId, platformCategoryId: '368', title: null, realizedRate: 21.5, sampleCount: 10,
        referenceRate: 25, referenceSource: 'estimated', deltaPoints: -3.5, status, ...extra,
    });
    function deps(o: Partial<CommissionDriftJobDeps> = {}) {
        const sent: Array<[number, any]> = [];
        const d: CommissionDriftJobDeps = {
            now: () => new Date('2026-10-01T09:00:00Z'),
            notifyEnabled: () => true,
            listTenants: async () => [{ tid: 7, channels: ['trendyol'] }],
            drift: async () => ({ integrationCode: 'trendyol', days: 30, thresholdPoints: 2, minSamples: 5, items: [item('L2', 'drift'), item('L4', 'insufficient_samples'), item('L5', 'ok')] as any }),
            notify: async (tid, p) => { sent.push([tid, p]); return { status: 'created' }; },
            ...o,
        };
        return { d, sent };
    }
    it('yalniz drift ogeleri bildirilir; params makinece okunabilir ve katalog semasini gecer', async () => {
        const { d, sent } = deps();
        const r = await runCommissionDrift(d);
        expect(r).toEqual({ tenants: 1, evaluated: 3, drifted: 1, notified: 1, failedTenants: 0 });
        expect(sent).toEqual([[7, { integ: 'trendyol', categoryId: 'L2', realizedRate: 21.5, referenceRate: 25, referenceSource: 'estimated', deltaPoints: -3.5, thresholdPoints: 2, sampleCount: 10, window: '2026-10' }]]);
        expect((getDefinition('COMMISSION_RATE_DRIFT') as any).params.safeParse(sent[0][1]).success).toBe(true);
    });
    it('tekrar bastirma defterde: duplicate sonuc bildirildi sayilmaz', async () => {
        const { d } = deps({ notify: async () => ({ status: 'duplicate' }) });
        expect((await runCommissionDrift(d)).notified).toBe(0);
    });
    it('bildirim kapaliyken tenant listesi bile okunmaz', async () => {
        const listTenants = jest.fn(async () => []);
        const { d } = deps({ notifyEnabled: () => false, listTenants });
        expect(await runCommissionDrift(d)).toMatchObject({ skipped: 'notify_disabled', tenants: 0 });
        expect(listTenants).not.toHaveBeenCalled();
    });
    it('bir tenant hatasi digerlerini durdurmaz; kanal basina tur ustu sinir', async () => {
        const many = Array.from({ length: DRIFT_NOTIFY_PER_CHANNEL_MAX + 5 }, (_, i) => item(`C${i}`, 'drift'));
        const { d, sent } = deps({
            listTenants: async () => [{ tid: 1, channels: ['trendyol'] }, { tid: 2, channels: ['trendyol'] }],
            drift: async (tid) => { if (tid === 1) throw new Error('tenant_db_unavailable'); return { integrationCode: 'trendyol', days: 30, thresholdPoints: 2, minSamples: 5, items: many as any }; },
        });
        const r = await runCommissionDrift(d);
        expect(r).toMatchObject({ tenants: 2, failedTenants: 1, drifted: DRIFT_NOTIFY_PER_CHANNEL_MAX + 5, notified: DRIFT_NOTIFY_PER_CHANNEL_MAX });
        expect(sent.every(([tid]) => tid === 2)).toBe(true);
    });
    it('gerceklesen orani olan kanal listesi yalniz trendyol (COM-05/06 spike sonrasi genisler)', () => {
        expect([...DRIFT_CHANNELS]).toEqual(['trendyol']);
    });
});
