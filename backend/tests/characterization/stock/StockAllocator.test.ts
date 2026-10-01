/**
 * CHARACTERIZATION/BİRİM: StockAllocator (backend/src/operations/stock/StockAllocator.ts)
 * ADR-0004 Karar 1-2 (zero-oversell). `Variant` mongoose modeli TAMAMEN mock'lanır (jest.fn) — gerçek
 * MongoDB/ağ YOK. Amaç: her metodun kurduğu Mongo filtresi/güncelleme belgesinin (Karar 2'de bağlayıcı
 * olarak tanımlanan atomik geçişlerle) BİREBİR eşleştiğini doğrulamak. Eşzamanlılık KANITI (gerçek
 * paralel yarış) burada değil, `tests/integration/StockAllocator.concurrency.test.ts`'te (gerçek local
 * Mongo) yapılır — bu dosya yalnızca çağrı argümanlarını/dallanma mantığını sabitler.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { StockAllocator } from '@operations/stock/StockAllocator';

function makeModel() {
    return {
        findOneAndUpdate: jest.fn(),
        findOne: jest.fn(),
    };
}

function leanReturns(model: ReturnType<typeof makeModel>, doc: any) {
    (model.findOne as any).mockReturnValue({ lean: jest.fn(async () => doc) });
}

function clientDBWith(model: ReturnType<typeof makeModel>) {
    return { getVariantModel: () => model } as any;
}

const VARIANT_ID = 'variant-1';
const KEY = 'trendyol:ORD-1:LINE-1';

describe('StockAllocator.available (türetilen, saklanmaz)', () => {
    it('stock - reserved döner', () => {
        expect(StockAllocator.available({ stock: 10, reserved: 3 })).toBe(7);
    });
    it('eksik alanlarda 0 varsayar', () => {
        expect(StockAllocator.available({})).toBe(0);
        expect(StockAllocator.available(null)).toBe(0);
        expect(StockAllocator.available(undefined)).toBe(0);
    });
});

describe('StockAllocator.reserve', () => {
    let model: ReturnType<typeof makeModel>;
    let allocator: StockAllocator;

    beforeEach(() => {
        model = makeModel();
        allocator = new StockAllocator(clientDBWith(model));
    });

    it('yeterli stokta tek atomik findOneAndUpdate ile RESERVED push eder ($ne + $expr guard, $inc reserved+stockVersion, stockDirty)', async () => {
        const updated = { _id: VARIANT_ID, stock: 10, reserved: 1, allocations: [{ key: KEY, qty: 1, state: 'RESERVED' }] };
        (model.findOneAndUpdate as any).mockResolvedValueOnce(updated);

        const result = await allocator.reserve(VARIANT_ID, KEY, 1);

        expect(result).toEqual({ state: 'RESERVED', idempotent: false, variant: updated });
        expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
        const [filter, update, options] = (model.findOneAndUpdate as any).mock.calls[0];
        expect(filter._id).toBe(VARIANT_ID);
        expect(filter['allocations.key']).toEqual({ $ne: KEY });
        expect(filter.$expr).toEqual({
            $gte: [{ $subtract: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$reserved', 0] }] }, 1],
        });
        expect(update.$inc).toEqual({ reserved: 1, stockVersion: 1 });
        expect(update.$push.allocations).toMatchObject({ key: KEY, qty: 1, state: 'RESERVED' });
        expect(update.$push.allocations.at).toBeInstanceOf(Date);
        expect(update.$set).toEqual({ stockDirty: true, stockDirtyAt: expect.any(Date) });
        expect(options).toEqual({ new: true });
    });

    it('aynı key ile tekrar çağrı: eşleşme yok, mevcut durum idempotent no-op olarak döner (ikinci findOneAndUpdate ÇAĞRILMAZ)', async () => {
        (model.findOneAndUpdate as any).mockResolvedValueOnce(null);
        leanReturns(model, { _id: VARIANT_ID, allocations: [{ key: KEY, qty: 1, state: 'RESERVED' }] });

        const result = await allocator.reserve(VARIANT_ID, KEY, 1);

        expect(result.idempotent).toBe(true);
        expect(result.state).toBe('RESERVED');
        expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    it('yetersiz stok + key yok: guard\'lı OVERSOLD push edilir (stockDirty SET EDİLMEZ)', async () => {
        (model.findOneAndUpdate as any)
            .mockResolvedValueOnce(null) // ana rezerve denemesi başarısız
            .mockResolvedValueOnce({ _id: VARIANT_ID, allocations: [{ key: KEY, qty: 5, state: 'OVERSOLD' }] }); // oversold push
        leanReturns(model, { _id: VARIANT_ID, allocations: [] });

        const result = await allocator.reserve(VARIANT_ID, KEY, 5);

        expect(result.state).toBe('OVERSOLD');
        expect(result.idempotent).toBe(false);
        expect(model.findOneAndUpdate).toHaveBeenCalledTimes(2);
        const [filter, update] = (model.findOneAndUpdate as any).mock.calls[1];
        expect(filter).toEqual({ _id: VARIANT_ID, 'allocations.key': { $ne: KEY } });
        expect(update.$push.allocations).toMatchObject({ key: KEY, qty: 5, state: 'OVERSOLD' });
        expect(update.$set).toBeUndefined();
    });

    it('OVERSOLD push da yarışı kaybederse (araya başka çağrı girdi), döngü tekrar okuyup idempotent no-op döner', async () => {
        (model.findOneAndUpdate as any)
            .mockResolvedValueOnce(null) // ana rezerve
            .mockResolvedValueOnce(null); // oversold push da race'te kaybetti
        (model.findOne as any)
            .mockReturnValueOnce({ lean: jest.fn(async () => ({ _id: VARIANT_ID, allocations: [] })) })
            .mockReturnValueOnce({ lean: jest.fn(async () => ({ _id: VARIANT_ID, allocations: [{ key: KEY, qty: 5, state: 'RESERVED' }] })) });

        const result = await allocator.reserve(VARIANT_ID, KEY, 5);

        expect(result).toEqual({
            state: 'RESERVED',
            idempotent: true,
            variant: { _id: VARIANT_ID, allocations: [{ key: KEY, qty: 5, state: 'RESERVED' }] },
        });
    });

    it('variant bulunamazsa hata fırlatır', async () => {
        (model.findOneAndUpdate as any).mockResolvedValueOnce(null);
        leanReturns(model, null);

        await expect(allocator.reserve(VARIANT_ID, KEY, 1)).rejects.toThrow(/bulunamadı/);
    });
});

describe('StockAllocator.commit', () => {
    let model: ReturnType<typeof makeModel>;
    let allocator: StockAllocator;

    beforeEach(() => {
        model = makeModel();
        allocator = new StockAllocator(clientDBWith(model));
    });

    it('RESERVED -> COMMITTED: stock VE reserved birlikte düşer, positional $ ile state güncellenir', async () => {
        const updated = { _id: VARIANT_ID, stock: 9, reserved: 0 };
        (model.findOneAndUpdate as any).mockResolvedValueOnce(updated);

        const result = await allocator.commit(VARIANT_ID, KEY, 1);

        expect(result).toEqual({ state: 'COMMITTED', idempotent: false, variant: updated });
        const [filter, update] = (model.findOneAndUpdate as any).mock.calls[0];
        expect(filter).toEqual({ _id: VARIANT_ID, allocations: { $elemMatch: { key: KEY, state: 'RESERVED' } } });
        expect(update.$inc).toEqual({ stock: -1, reserved: -1 });
        expect(update.$set).toEqual({ 'allocations.$.state': 'COMMITTED', stockDirty: true, stockDirtyAt: expect.any(Date) });
    });

    it('ilk kez sevk edilmiş görülen sipariş (anahtar hiç yok): reserved\'a DOKUNULMAZ, yalnızca stock düşer', async () => {
        (model.findOneAndUpdate as any)
            .mockResolvedValueOnce(null) // normal RESERVED yolu yok
            .mockResolvedValueOnce({ _id: VARIANT_ID, stock: 9 }); // guard'lı insert
        leanReturns(model, { _id: VARIANT_ID, allocations: [] });

        const result = await allocator.commit(VARIANT_ID, KEY, 1);

        expect(result.state).toBe('COMMITTED');
        expect(result.idempotent).toBe(false);
        const [filter, update] = (model.findOneAndUpdate as any).mock.calls[1];
        expect(filter).toEqual({ _id: VARIANT_ID, 'allocations.key': { $ne: KEY } });
        expect(update.$inc).toEqual({ stock: -1 });
        expect(update.$inc.reserved).toBeUndefined();
        expect(update.$push.allocations).toMatchObject({ key: KEY, qty: 1, state: 'COMMITTED' });
        expect(update.$set).toEqual({ stockDirty: true, stockDirtyAt: expect.any(Date) });
    });

    it('OVERSOLD -> COMMITTED: reserved hiç artırılmamıştı, yalnızca stock düşer', async () => {
        (model.findOneAndUpdate as any)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ _id: VARIANT_ID, stock: 9 });
        leanReturns(model, { _id: VARIANT_ID, allocations: [{ key: KEY, qty: 1, state: 'OVERSOLD' }] });

        const result = await allocator.commit(VARIANT_ID, KEY, 1);

        expect(result.state).toBe('COMMITTED');
        const [filter, update] = (model.findOneAndUpdate as any).mock.calls[1];
        expect(filter).toEqual({ _id: VARIANT_ID, allocations: { $elemMatch: { key: KEY, state: 'OVERSOLD' } } });
        expect(update.$inc).toEqual({ stock: -1 });
        expect(update.$set).toEqual({ 'allocations.$.state': 'COMMITTED', stockDirty: true, stockDirtyAt: expect.any(Date) });
    });

    it.each(['COMMITTED', 'RELEASED', 'RESTOCKED'])(
        'terminal state (%s) -> geri dönüş YOK, idempotent no-op (ek findOneAndUpdate çağrılmaz)',
        async (terminalState) => {
            (model.findOneAndUpdate as any).mockResolvedValueOnce(null);
            leanReturns(model, { _id: VARIANT_ID, allocations: [{ key: KEY, qty: 1, state: terminalState }] });

            const result = await allocator.commit(VARIANT_ID, KEY, 1);

            expect(result).toEqual({
                state: terminalState,
                idempotent: true,
                variant: { _id: VARIANT_ID, allocations: [{ key: KEY, qty: 1, state: terminalState }] },
            });
            expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
        },
    );

    it('variant bulunamazsa hata fırlatır', async () => {
        (model.findOneAndUpdate as any).mockResolvedValueOnce(null);
        leanReturns(model, null);

        await expect(allocator.commit(VARIANT_ID, KEY, 1)).rejects.toThrow(/bulunamadı/);
    });
});

describe('StockAllocator.release', () => {
    let model: ReturnType<typeof makeModel>;
    let allocator: StockAllocator;

    beforeEach(() => {
        model = makeModel();
        allocator = new StockAllocator(clientDBWith(model));
    });

    it('RESERVED -> RELEASED: qty allocations dizisinden okunur, reserved geri düşer', async () => {
        leanReturns(model, { _id: VARIANT_ID, allocations: [{ key: KEY, qty: 3, state: 'RESERVED' }] });
        (model.findOneAndUpdate as any).mockResolvedValueOnce({ _id: VARIANT_ID, reserved: 0 });

        const result = await allocator.release(VARIANT_ID, KEY);

        expect(result.state).toBe('RELEASED');
        expect(result.idempotent).toBe(false);
        const [filter, update] = (model.findOneAndUpdate as any).mock.calls[0];
        expect(filter).toEqual({ _id: VARIANT_ID, allocations: { $elemMatch: { key: KEY, state: 'RESERVED' } } });
        expect(update.$inc).toEqual({ reserved: -3 });
        expect(update.$set).toEqual({ 'allocations.$.state': 'RELEASED', stockDirty: true, stockDirtyAt: expect.any(Date) });
    });

    it('OVERSOLD -> RELEASED: stok/reserved etkisi YOK, yalnızca state değişir', async () => {
        leanReturns(model, { _id: VARIANT_ID, allocations: [{ key: KEY, qty: 3, state: 'OVERSOLD' }] });
        (model.findOneAndUpdate as any).mockResolvedValueOnce({ _id: VARIANT_ID });

        const result = await allocator.release(VARIANT_ID, KEY);

        expect(result.state).toBe('RELEASED');
        const [filter, update] = (model.findOneAndUpdate as any).mock.calls[0];
        expect(filter).toEqual({ _id: VARIANT_ID, allocations: { $elemMatch: { key: KEY, state: 'OVERSOLD' } } });
        expect(update).toEqual({ $set: { 'allocations.$.state': 'RELEASED' } });
    });

    it('hiç görülmemiş satır: "mezar taşı" RELEASED push edilir (qty=0, stok/reserved etkisi yok)', async () => {
        leanReturns(model, { _id: VARIANT_ID, allocations: [] });
        (model.findOneAndUpdate as any).mockResolvedValueOnce({ _id: VARIANT_ID });

        const result = await allocator.release(VARIANT_ID, KEY);

        expect(result.state).toBe('RELEASED');
        expect(result.idempotent).toBe(false);
        const [filter, update] = (model.findOneAndUpdate as any).mock.calls[0];
        expect(filter).toEqual({ _id: VARIANT_ID, 'allocations.key': { $ne: KEY } });
        expect(update.$push.allocations).toMatchObject({ key: KEY, qty: 0, state: 'RELEASED' });
        expect(update.$inc).toBeUndefined();
    });

    it.each(['COMMITTED', 'RELEASED', 'RESTOCKED'])(
        'terminal state (%s) -> geri dönüş YOK, idempotent no-op (findOneAndUpdate ÇAĞRILMAZ)',
        async (terminalState) => {
            leanReturns(model, { _id: VARIANT_ID, allocations: [{ key: KEY, qty: 1, state: terminalState }] });

            const result = await allocator.release(VARIANT_ID, KEY);

            expect(result).toEqual({
                state: terminalState,
                idempotent: true,
                variant: { _id: VARIANT_ID, allocations: [{ key: KEY, qty: 1, state: terminalState }] },
            });
            expect(model.findOneAndUpdate).not.toHaveBeenCalled();
        },
    );

    it('sonradan gelen bayat "oluşturuldu" durumu: anahtar zaten var (RELEASED) -> no-op', async () => {
        leanReturns(model, { _id: VARIANT_ID, allocations: [{ key: KEY, qty: 0, state: 'RELEASED' }] });

        const result = await allocator.release(VARIANT_ID, KEY);

        expect(result.idempotent).toBe(true);
        expect(result.state).toBe('RELEASED');
        expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('variant bulunamazsa hata fırlatır', async () => {
        leanReturns(model, null);

        await expect(allocator.release(VARIANT_ID, KEY)).rejects.toThrow(/bulunamadı/);
    });
});

describe('StockAllocator.restock', () => {
    let model: ReturnType<typeof makeModel>;
    let allocator: StockAllocator;
    const CLAIM_KEY = 'return:trendyol:CLM-1:LINE-1';

    beforeEach(() => {
        model = makeModel();
        allocator = new StockAllocator(clientDBWith(model));
    });

    it('varsayılan (opts verilmezse) KAPALI: hiçbir DB çağrısı yapılmaz, SKIPPED_POLICY döner', async () => {
        const result = await allocator.restock(VARIANT_ID, CLAIM_KEY, 2);

        expect(result).toEqual({ state: 'SKIPPED_POLICY', idempotent: true, variant: null });
        expect(model.findOneAndUpdate).not.toHaveBeenCalled();
        expect(model.findOne).not.toHaveBeenCalled();
    });

    it('opts.allowed=false açıkça verilirse de KAPALI kalır', async () => {
        const result = await allocator.restock(VARIANT_ID, CLAIM_KEY, 2, { allowed: false });
        expect(result.state).toBe('SKIPPED_POLICY');
        expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('opts.allowed=true: guard\'lı RESTOCKED push + stock artışı', async () => {
        (model.findOneAndUpdate as any).mockResolvedValueOnce({ _id: VARIANT_ID, stock: 12 });

        const result = await allocator.restock(VARIANT_ID, CLAIM_KEY, 2, { allowed: true });

        expect(result).toEqual({ state: 'RESTOCKED', idempotent: false, variant: { _id: VARIANT_ID, stock: 12 } });
        const [filter, update] = (model.findOneAndUpdate as any).mock.calls[0];
        expect(filter).toEqual({ _id: VARIANT_ID, 'allocations.key': { $ne: CLAIM_KEY } });
        expect(update.$inc).toEqual({ stock: 2 });
        expect(update.$push.allocations).toMatchObject({ key: CLAIM_KEY, qty: 2, state: 'RESTOCKED' });
        expect(update.$set).toEqual({ stockDirty: true, stockDirtyAt: expect.any(Date) });
    });

    it('aynı claimKey ile tekrar (allowed=true): terminal RESTOCKED -> idempotent no-op', async () => {
        (model.findOneAndUpdate as any).mockResolvedValueOnce(null);
        leanReturns(model, { _id: VARIANT_ID, allocations: [{ key: CLAIM_KEY, qty: 2, state: 'RESTOCKED' }] });

        const result = await allocator.restock(VARIANT_ID, CLAIM_KEY, 2, { allowed: true });

        expect(result.idempotent).toBe(true);
        expect(result.state).toBe('RESTOCKED');
    });

    it('variant bulunamazsa hata fırlatır', async () => {
        (model.findOneAndUpdate as any).mockResolvedValueOnce(null);
        leanReturns(model, null);

        await expect(allocator.restock(VARIANT_ID, CLAIM_KEY, 2, { allowed: true })).rejects.toThrow(/bulunamadı/);
    });
});

describe('StockAllocator.retryOversold (ADR-0004 Karar 7b, Aşama C — YENİ, ADDITIVE metot)', () => {
    let model: ReturnType<typeof makeModel>;
    let allocator: StockAllocator;

    beforeEach(() => {
        model = makeModel();
        allocator = new StockAllocator(clientDBWith(model));
    });

    it('stok yeterli hale geldiyse tek atomik findOneAndUpdate ile OVERSOLD -> RESERVED geçer ($expr guard, $inc reserved+stockVersion, stockDirty)', async () => {
        const updated = { _id: VARIANT_ID, stock: 5, reserved: 1, allocations: [{ key: KEY, qty: 1, state: 'RESERVED' }] };
        (model.findOneAndUpdate as any).mockResolvedValueOnce(updated);

        const result = await allocator.retryOversold(VARIANT_ID, KEY, 1);

        expect(result).toEqual({ state: 'RESERVED', idempotent: false, variant: updated });
        expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
        const [filter, update, options] = (model.findOneAndUpdate as any).mock.calls[0];
        expect(filter._id).toBe(VARIANT_ID);
        expect(filter.allocations).toEqual({ $elemMatch: { key: KEY, state: 'OVERSOLD' } });
        expect(filter.$expr).toEqual({
            $gte: [{ $subtract: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$reserved', 0] }] }, 1],
        });
        expect(update.$inc).toEqual({ reserved: 1, stockVersion: 1 });
        expect(update.$set['allocations.$.state']).toBe('RESERVED');
        expect(update.$set['allocations.$.at']).toBeInstanceOf(Date);
        expect(update.$set.stockDirty).toBe(true);
        expect(options).toEqual({ new: true });
        expect(model.findOne).not.toHaveBeenCalled();
    });

    it('stok hâlâ yetersiz: findOneAndUpdate eşleşmez, satır OVERSOLD olarak idempotent no-op döner (DB DEĞİŞMEZ)', async () => {
        (model.findOneAndUpdate as any).mockResolvedValueOnce(null);
        leanReturns(model, { _id: VARIANT_ID, allocations: [{ key: KEY, qty: 5, state: 'OVERSOLD' }] });

        const result = await allocator.retryOversold(VARIANT_ID, KEY, 5);

        expect(result).toEqual({ state: 'OVERSOLD', idempotent: true, variant: { _id: VARIANT_ID, allocations: [{ key: KEY, qty: 5, state: 'OVERSOLD' }] } });
        expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    it('satır bu arada başka bir yola geçmiş (ör. süpürme RESERVED/COMMITTED/RELEASED yapmış): idempotent no-op, o durum döner', async () => {
        (model.findOneAndUpdate as any).mockResolvedValueOnce(null);
        leanReturns(model, { _id: VARIANT_ID, allocations: [{ key: KEY, qty: 1, state: 'COMMITTED' }] });

        const result = await allocator.retryOversold(VARIANT_ID, KEY, 1);

        expect(result).toEqual({ state: 'COMMITTED', idempotent: true, variant: { _id: VARIANT_ID, allocations: [{ key: KEY, qty: 1, state: 'COMMITTED' }] } });
    });

    it('anahtar hiç görülmemiş (yeniden denenecek OVERSOLD kaydı yok): idempotent no-op, RELEASED gibi ele alınır', async () => {
        (model.findOneAndUpdate as any).mockResolvedValueOnce(null);
        leanReturns(model, { _id: VARIANT_ID, allocations: [] });

        const result = await allocator.retryOversold(VARIANT_ID, KEY, 1);

        expect(result).toEqual({ state: 'RELEASED', idempotent: true, variant: { _id: VARIANT_ID, allocations: [] } });
    });

    it('variant bulunamazsa hata fırlatır', async () => {
        (model.findOneAndUpdate as any).mockResolvedValueOnce(null);
        leanReturns(model, null);

        await expect(allocator.retryOversold(VARIANT_ID, KEY, 1)).rejects.toThrow(/bulunamadı/);
    });
});
