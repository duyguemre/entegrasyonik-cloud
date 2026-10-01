/**
 * COM-04: tenant komisyon override — oncelik zinciri (kategori override > kanal varsayilan override > gerceklesen > tahmini > bilinmiyor),
 * yazma dogrulamasi, tekil anahtar upsert, onbellek (tenant kapsamli) + yazmada gecersiz kilma, RPC izin/girdi/denetim kaydi. DB/ag YOK (mock clientDB).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { tenantOverrideRate } from '@operations/finance/commissionSummary';
import { getCommissionByBarcodes } from '@operations/finance/commissionQueries';
import { assertValidRate, setCommissionOverride, deleteCommissionOverride, listCommissionOverrides, CommissionOverrideStore } from '@operations/finance/commissionOverrides';
import { resetCacheForTests } from '@utils/decorator/cache';
import FinancialService from '@api/rpc/handlers/financial-service';
import { CAPABILITY_BY_RPC } from '../../../src/capabilities';
import { COMMERCE_RPC_INPUT } from '../../../src/capabilities/rpc-input/commerce';
import { planAppWriteAudit, buildAppWriteEntry, WRITE_AUDIT_FIELDS } from '../../../src/api/appWriteAudit';

const lean = (v: any) => { const c: any = { limit: jest.fn(() => c), sort: jest.fn(() => c), lean: jest.fn(async () => v) }; return c; };
const sale = { transactionType: 'SALE', commissionRate: 20, commissionAmount: 20, sellerRevenue: 80, meta: { barcode: 'BC-1' } };

function fakeDb(o: { overrides?: any[]; fin?: any[] }) {
    const overrideFind: any = jest.fn(() => lean(o.overrides ?? []));
    return {
        overrideFind,
        getCommissionOverrideModel: () => ({ find: overrideFind }),
        getFinancialTransactionModel: () => ({ find: jest.fn(() => lean(o.fin ?? [])) }),
        getVariantModel: () => ({ find: jest.fn(() => ({ lean: async () => [{ barcode: 'BC-1', productId: 'p1' }, { barcode: 'BC-2', productId: 'p2' }] })) }),
        getProductModel: () => ({ find: jest.fn(() => ({ lean: async () => [{ _id: 'p1', category: 'L1' }, { _id: 'p2', category: 'L2' }] })) }),
        getAttributeMappingModel: () => ({ find: jest.fn(() => ({ lean: async () => [
            { integrationCode: 'trendyol', isCategoryMapping: true, localCategoryId: 'L1', platformCategoryId: '368' },
            { integrationCode: 'trendyol', isCategoryMapping: true, localCategoryId: 'L2', platformCategoryId: '999' },
        ] })) }),
    } as any;
}

beforeEach(() => resetCacheForTests());

describe('tenantOverrideRate (saf)', () => {
    const rows = [{ scope: 'default', rate: 12 }, { scope: 'category', platformCategoryId: '368', rate: 7.5 }, { scope: 'category', platformCategoryId: '555', rate: 0 }];
    it('kategori override > kanal varsayilan > null', () => {
        expect(tenantOverrideRate(rows, { platformCategoryId: '368' })).toBe(7.5);
        expect(tenantOverrideRate(rows, { platformCategoryId: '111' })).toBe(12);
        expect(tenantOverrideRate(rows, {})).toBe(12);
        expect(tenantOverrideRate([rows[1]], { platformCategoryId: '111' })).toBeNull();
        expect(tenantOverrideRate([], { platformCategoryId: '368' })).toBeNull();
    });
    it('gercek %0 override korunur', () => { expect(tenantOverrideRate(rows, { platformCategoryId: '555' })).toBe(0); });
});

describe('oncelik zinciri (barkod bazli, uctan uca)', () => {
    it('override (kategori) > override (default) > gerceklesen', async () => {
        const db = fakeDb({ fin: [sale], overrides: [{ scope: 'category', platformCategoryId: '368', rate: 9 }, { scope: 'default', rate: 11 }] });
        const r: any = await getCommissionByBarcodes(db, 'c-com04-a', { integrationCode: 'trendyol', barcodes: ['BC-1', 'BC-2'] });
        // BC-1: kategori 368 override 9 (gerceklesen 20 olsa da); BC-2: kategori 999 -> default 11
        expect(r.items[0].commission).toMatchObject({ source: 'override', rate: 9, actual: { amount: 20 } });
        expect(r.items[1].commission).toMatchObject({ source: 'override', rate: 11 });
    });
    it('override yoksa gerceklesen/tahmini/bilinmiyor davranisi degismez', async () => {
        const db = fakeDb({ fin: [sale], overrides: [] });
        const r: any = await getCommissionByBarcodes(db, 'c-com04-b', { integrationCode: 'trendyol', barcodes: ['BC-1', 'BC-2'] });
        expect(r.items[0].commission).toMatchObject({ source: 'actual', rate: 20 });
        expect(r.items[1].commission.source).not.toBe('override');
    });
    it('yalniz kategori override varsa eslesmeyen kategori override almaz (tahmini kalir)', async () => {
        const db = fakeDb({ fin: [sale], overrides: [{ scope: 'category', platformCategoryId: '368', rate: 9 }] });
        const r: any = await getCommissionByBarcodes(db, 'c-com04-c', { integrationCode: 'trendyol', barcodes: ['BC-1', 'BC-2'] });
        expect(r.items.map((i: any) => i.commission.source)).toEqual(['override', 'estimated']); // 999 kanal tablosunda tahmini oran var
    });
});

describe('onbellek (tenant kapsamli) + yazmada gecersiz kilma', () => {
    it('ikinci okuma DB ye gitmez; farkli tenant ayri; yazma yalniz kendi tenant onbellegini dusurur', async () => {
        const db = fakeDb({ overrides: [{ scope: 'default', rate: 5 }] });
        const s1 = new CommissionOverrideStore(db, 't-1', 'trendyol');
        await s1.loadRows(); await s1.loadRows();
        expect(db.overrideFind).toHaveBeenCalledTimes(1);
        await new CommissionOverrideStore(db, 't-2', 'trendyol').loadRows();
        expect(db.overrideFind).toHaveBeenCalledTimes(2);
        const w: any = { findOneAndUpdate: jest.fn(() => lean({ _id: 'x1', updatedAt: new Date() })) };
        await setCommissionOverride({ getCommissionOverrideModel: () => w }, 't-1', 'u1', { integrationCode: 'trendyol', scope: 'default', rate: 6 });
        await s1.loadRows();
        expect(db.overrideFind).toHaveBeenCalledTimes(3); // t-1 dustu
        await new CommissionOverrideStore(db, 't-2', 'trendyol').loadRows();
        expect(db.overrideFind).toHaveBeenCalledTimes(3); // t-2 kaldi
    });
});

describe('yazma dogrulamasi ve upsert', () => {
    it('rate 0-100, en cok 2 ondalik', () => {
        expect(assertValidRate(0)).toBe(0); expect(assertValidRate(12.34)).toBe(12.34); expect(assertValidRate(100)).toBe(100);
        for (const bad of [-1, 100.01, 12.345, NaN, '5', null]) expect(() => assertValidRate(bad)).toThrow();
    });
    const model = () => {
        const m: any = { findOneAndUpdate: jest.fn(() => lean({ _id: 'id1', updatedAt: new Date('2026-09-30') })), deleteOne: jest.fn(async () => ({ deletedCount: 1 })) };
        return { m, db: { getCommissionOverrideModel: () => m } as any };
    };
    it('category: platformCategoryId zorunlu; default: verilmez; scope gecerli olmali', async () => {
        const { db } = model();
        await expect(setCommissionOverride(db, 1, 'u', { integrationCode: 'trendyol', scope: 'category', rate: 5 })).rejects.toMatchObject({ statusCode: 400 });
        await expect(setCommissionOverride(db, 1, 'u', { integrationCode: 'trendyol', scope: 'default', platformCategoryId: '1', rate: 5 })).rejects.toMatchObject({ statusCode: 400 });
        await expect(setCommissionOverride(db, 1, 'u', { integrationCode: 'trendyol', scope: 'x' as any, rate: 5 })).rejects.toMatchObject({ statusCode: 400 });
    });
    it('tekil anahtar {integrationCode(kucuk), scope, platformCategoryId|null} ile upsert; updatedBy yazilir', async () => {
        const { m, db } = model();
        const r: any = await setCommissionOverride(db, 1, 'user-7', { integrationCode: 'Trendyol', scope: 'default', rate: 8.5, note: ' ozel ' });
        const [key, update, opts] = m.findOneAndUpdate.mock.calls[0] as any[];
        expect(key).toEqual({ integrationCode: 'trendyol', scope: 'default', platformCategoryId: null });
        expect(update.$set).toMatchObject({ rate: 8.5, updatedBy: 'user-7', note: 'ozel' });
        expect(opts).toMatchObject({ upsert: true });
        expect(r).toMatchObject({ id: 'id1', integrationCode: 'trendyol', scope: 'default', rate: 8.5 });
    });
    it('delete: yoksa 404', async () => {
        const { m, db } = model();
        expect(await deleteCommissionOverride(db, 1, { id: 'a'.repeat(24) })).toEqual({ deleted: true });
        m.deleteOne.mockResolvedValueOnce({ deletedCount: 0 });
        await expect(deleteCommissionOverride(db, 1, { id: 'a'.repeat(24) })).rejects.toMatchObject({ statusCode: 404 });
    });
    it('list: alan DTO (id string, note null)', async () => {
        const db = fakeDb({ overrides: [{ _id: 'o1', integrationCode: 'trendyol', scope: 'category', platformCategoryId: '368', rate: 7, updatedBy: 'u', updatedAt: new Date(0) }] });
        expect(await listCommissionOverrides(db, { integrationCode: 'Trendyol' })).toEqual([{ id: 'o1', integrationCode: 'trendyol', scope: 'category', platformCategoryId: '368', rate: 7, note: null, updatedBy: 'u', updatedAt: new Date(0) }]);
    });
});

describe('RPC sozlesmesi: yetenek kaydi, girdi semasi, denetim', () => {
    it('yazmalar admin + integrations:manage; liste member + finance:read', () => {
        expect(CAPABILITY_BY_RPC.get('FinancialService/setCommissionOverride')).toMatchObject({ effect: 'write', minTier: 'admin', permission: 'integrations:manage' });
        expect(CAPABILITY_BY_RPC.get('FinancialService/deleteCommissionOverride')).toMatchObject({ effect: 'destructive', minTier: 'admin' });
        expect(CAPABILITY_BY_RPC.get('FinancialService/listCommissionOverrides')).toMatchObject({ effect: 'read', minTier: 'member', permission: 'finance:read' });
    });
    it('zod: scope/category tutarliligi, oran araligi/ondalik, bilinmeyen alan reddi', () => {
        const s: any = COMMERCE_RPC_INPUT['FinancialService/setCommissionOverride'];
        expect(s.safeParse({ integrationCode: 'trendyol', scope: 'default', rate: 10 }).success).toBe(true);
        expect(s.safeParse({ integrationCode: 'trendyol', scope: 'category', platformCategoryId: '368', rate: 10.25, note: 'x' }).success).toBe(true);
        expect(s.safeParse({ integrationCode: 'trendyol', scope: 'category', rate: 10 }).success).toBe(false);
        expect(s.safeParse({ integrationCode: 'trendyol', scope: 'default', platformCategoryId: '1', rate: 10 }).success).toBe(false);
        expect(s.safeParse({ integrationCode: 'trendyol', scope: 'default', rate: 101 }).success).toBe(false);
        expect(s.safeParse({ integrationCode: 'trendyol', scope: 'default', rate: 1.234 }).success).toBe(false);
        expect(s.safeParse({ integrationCode: 'trendyol', scope: 'default', rate: 1, clientId: 5 }).success).toBe(false);
        expect((COMMERCE_RPC_INPUT['FinancialService/deleteCommissionOverride'] as any).safeParse({ id: 'zz' }).success).toBe(false);
    });
    it('X4 denetimi: onceki/sonraki oran + kapsam yazilir, not yazilmaz', async () => {
        const plan = planAppWriteAudit('FinancialService', 'setCommissionOverride', { sub: 'u1' })!;
        expect(plan).toBeDefined();
        const spec = WRITE_AUDIT_FIELDS['FinancialService/setCommissionOverride'];
        const findOne: any = jest.fn(() => lean({ rate: 10 }));
        const before = await spec.load!({ getCommissionOverrideModel: () => ({ findOne }) }, { integrationCode: 'Trendyol', scope: 'category', platformCategoryId: '368' });
        expect(findOne.mock.calls[0][0]).toEqual({ integrationCode: 'trendyol', scope: 'category', platformCategoryId: '368' });
        const entry: any = buildAppWriteEntry(plan, { integrationCode: 'trendyol', scope: 'category', platformCategoryId: '368', rate: 12, note: 'gizli not' }, before, { sub: 'u1' }, undefined);
        const dump = JSON.stringify(entry);
        expect(dump).toContain('"a_rate":12'); expect(dump).toContain('"b_rate":10'); expect(dump).not.toContain('gizli not');
    });
    it('servis: girdi skaler/kimlik dogrulamasi', async () => {
        const s: any = new FinancialService(1, { integrationCode: { $ne: null } }); s.clientDB = fakeDb({});
        await expect(s.listCommissionOverrides()).rejects.toMatchObject({ statusCode: 400 });
        const s2: any = new FinancialService(1, { integrationCode: 'trendyol', scope: 'default', rate: 5 }); s2.clientDB = fakeDb({});
        await expect(s2.setCommissionOverride()).rejects.toMatchObject({ statusCode: 401 });
        const s3: any = new FinancialService(1, { id: 'bad' }); s3.clientDB = fakeDb({});
        await expect(s3.deleteCommissionOverride()).rejects.toMatchObject({ statusCode: 400 });
    });
});
