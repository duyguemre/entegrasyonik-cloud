// [eslesme-fiyat WP5, K-B, Ek B P1-2/P1-4] Yerel → kanal otomatik fiyat yayını: fark tespiti, pricePending işareti, fiyat geçmişi,
// PricePublishTrigger (aynı gövde tekrar gitmez, kill-switch işareti korur, gönderilmemiş kanal temizlenir). DB/ağ YOK (sahte modeller).
import { describe, it, expect, jest } from '@jest/globals';
import { ObjectId } from 'mongodb';
import {
    applyDotSet, diffChannelPrices, historyDocs, markPriceChanges, preserveEngineChannelFields, pricePendingFields, publishedCodes,
} from '@operations/pricing/pricePending';
import { priceBodyHash, runPricePublish, runPricePublishForClient, type PricePublishDeps } from '@operations/pricing/PricePublishTrigger';

const ID = new ObjectId();
const published = { upload: { TRANSFER: { status: 'COMPLETED' } } };
const base = (o: any = {}) => ({
    _id: ID, barcode: 'B1', stockcode: 'S1', productId: 'P1',
    prices: { isPlatformBasedPrice: false, salePrice: 100, marketPrice: 120 },
    platforms: { trendyol: { ...published }, n11: { ...published }, pazarama: { upload: { TRANSFER: { status: 'FAILED' } } } },
    ...o,
});

describe('fark tespiti', () => {
    it('yalnız gönderilmiş kanallar; ana fiyat değişince kanal özel fiyatı olmayan kanallar işaretlenir', () => {
        expect(publishedCodes(base())).toEqual(['trendyol', 'n11']);
        const before = base({ prices: { isPlatformBasedPrice: true, salePrice: 100, marketPrice: 120 }, platforms: { trendyol: { ...published, prices: { salePrice: 90, marketPrice: 95 } }, n11: { ...published } } });
        const after = { ...before, prices: { ...before.prices, salePrice: 110 } };
        const ch = diffChannelPrices(before, after);
        expect(ch.map((c) => c.code)).toEqual(['n11']); // trendyol kanal özel fiyatıyla gider, değişmedi
        expect(ch[0]).toMatchObject({ before: { sale: 100, list: 120 }, after: { sale: 110, list: 120 } });
    });

    it('yalnız liste fiyatı değişse de işaretlenir; aynı değer (yuvarlama sonrası) işaretlenmez', () => {
        const b = base();
        expect(diffChannelPrices(b, { ...b, prices: { ...b.prices, marketPrice: 130 } })).toHaveLength(2);
        expect(diffChannelPrices(b, { ...b, prices: { ...b.prices, salePrice: 100.001 } })).toHaveLength(0);
    });

    it('toplu nokta yolları belge kopyasına uygulanır (orijinal değişmez)', () => {
        const b = base();
        const a = applyDotSet(b, { 'prices.salePrice': 80, 'platforms.n11.prices.salePrice': 70 });
        expect(a.prices.salePrice).toBe(80);
        expect(a.platforms.n11.prices.salePrice).toBe(70);
        expect(b.prices.salePrice).toBe(100);
    });

    it('FE platforms gövdesi motor alanlarını (rulePrice/observed/priceSync) ezemez', () => {
        const before = { trendyol: { rulePrice: { salePrice: 99 }, priceSync: { hash: 'h' }, observed: { salePrice: 98 } } };
        const incoming = { trendyol: { prices: { salePrice: 1 }, rulePrice: { salePrice: 1 } }, n11: { attributes: {} } };
        expect(preserveEngineChannelFields(incoming, before)).toEqual({
            trendyol: { prices: { salePrice: 1 }, rulePrice: { salePrice: 99 }, priceSync: { hash: 'h' }, observed: { salePrice: 98 } }, n11: { attributes: {} },
        });
    });
});

describe('işaret + geçmiş', () => {
    const now = new Date('2026-10-04T10:00:00Z');
    const b = base();
    const changes = diffChannelPrices(b, { ...b, prices: { ...b.prices, salePrice: 90 } });

    it('pricePending.<kod> + priceDirty', () => {
        const sets = pricePendingFields(changes, 'manual', now);
        expect(sets.get(String(ID))).toEqual({ 'pricePending.trendyol': { since: now, reason: 'manual' }, 'pricePending.n11': { since: now, reason: 'manual' }, priceDirty: true });
    });

    it('PriceHistory kaynak/aktör/önceki fiyat', () => {
        expect(historyDocs(changes, 'bulk', 'u1', now)).toEqual([
            expect.objectContaining({ integrationCode: 'trendyol', salePrice: 90, previousPrice: 100, listPrice: 120, source: 'bulk', actor: 'u1', at: now }),
            expect.objectContaining({ integrationCode: 'n11', source: 'bulk' }),
        ]);
    });

    it('markPriceChanges: bulkWrite + insertMany; geçmiş hatası işaretlemeyi bozmaz', async () => {
        const bulkWrite = jest.fn(async () => ({}));
        const insertMany = jest.fn(async () => { throw new Error('x'); });
        const db: any = { getVariantModel: () => ({ bulkWrite }), getPriceHistoryModel: () => ({ insertMany }) };
        const r = await markPriceChanges(db, changes, { reason: 'manual', historySource: 'manual', now });
        expect(r).toEqual({ marked: 1, history: 0 });
        expect((bulkWrite.mock.calls[0] as any)[0][0].updateOne.update.$set.priceDirty).toBe(true);
        expect(await markPriceChanges(db, [], { reason: 'manual', historySource: 'manual' })).toEqual({ marked: 0, history: 0 });
    });
});

function fakeTenant(variants: any[], inFlight = 0) {
    const calls: any = { staged: [] as any[], ops: [] as any[], cleanup: [] as any[], flags: [] as any[] };
    const db: any = {
        getVariantModel: () => ({
            find: () => ({ limit: () => ({ lean: async () => variants }) }),
            bulkWrite: async (ops: any[]) => { calls.ops.push(...ops); },
            updateMany: async (f: any, u: any) => { calls.cleanup.push([f, u]); },
        }),
        getExportStagedProductModel: () => ({
            countDocuments: async () => inFlight,
            updateOne: async (f: any, u: any, o: any) => { calls.staged.push([f, u, o]); },
        }),
    };
    const deps: PricePublishDeps = {
        redisReady: () => true, activeClients: async () => [7], clientDB: async () => db,
        exportFlagModel: async () => ({ updateOne: async (f: any, u: any) => { calls.flags.push([f, u]); } }),
        activeChannels: async () => ['trendyol', 'n11'], matchKey: async () => 'barcode', allowNewWork: (c) => c !== 'n11',
        signal: jest.fn(), now: () => new Date('2026-10-04T10:00:00Z'),
    };
    return { db, deps, calls };
}

describe('PricePublishTrigger', () => {
    const since = new Date('2026-10-04T09:59:00Z');
    const dirty = (o: any = {}) => base({ priceDirty: true, pricePending: { trendyol: { since, reason: 'manual' }, n11: { since, reason: 'manual' }, pazarama: { since, reason: 'manual' } }, ...o });

    it('UPDATE_PRICE kaydı + priceSync; kill-switch kanalı işaret korur; gönderilmemiş kanal temizlenir; ExportFlag + sinyal', async () => {
        const { deps, calls } = fakeTenant([dirty()]);
        const r = await runPricePublishForClient(deps, 7);
        expect(r).toEqual({ staged: 1, cleared: 2, deferred: 1 });
        const [filter, update, opts] = calls.staged[0];
        expect(filter).toMatchObject({ barcode: 'B1', mode: 'UPDATE_PRICE', integrationCode: 'trendyol' });
        expect(update.$set).toMatchObject({ status: 'QUEUED', price: 100, listPrice: 120, priorityScore: 110 });
        expect(opts).toEqual({ upsert: true });
        const tyOp = calls.ops.find((o: any) => o.updateOne.update.$unset['pricePending.trendyol'] !== undefined);
        expect(tyOp.updateOne.filter).toEqual({ _id: ID, 'pricePending.trendyol.since': since }); // koşullu temizlik
        expect(tyOp.updateOne.update.$set['platforms.trendyol.priceSync']).toMatchObject({ hash: priceBodyHash(100, 120), salePrice: 100, listPrice: 120 });
        expect(calls.ops.some((o: any) => o.updateOne.update.$unset['pricePending.n11'] !== undefined)).toBe(false); // kill-switch
        expect(calls.ops.some((o: any) => o.updateOne.update.$unset['pricePending.pazarama'] !== undefined)).toBe(true); // TRANSFER yok
        expect(calls.cleanup[0][1]).toEqual({ $unset: { priceDirty: '', pricePending: '' } });
        expect(calls.flags[0]).toEqual([{ clientId: 7, integrationCode: 'trendyol' }, { $inc: { queuedCount: 1 }, $set: { lastUpdatedAt: expect.any(Date) } }]);
        expect(deps.signal).toHaveBeenCalledTimes(1);
    });

    it('aynı gövde (priceSync.hash) yeniden gönderilmez; aktif kayıt varsa ertelenir', async () => {
        const same = dirty({ platforms: { trendyol: { ...published, priceSync: { hash: priceBodyHash(100, 120) } } }, pricePending: { trendyol: { since } } });
        const a = fakeTenant([same]);
        expect(await runPricePublishForClient(a.deps, 7)).toEqual({ staged: 0, cleared: 1, deferred: 0 });
        expect(a.deps.signal).not.toHaveBeenCalled();
        const b = fakeTenant([dirty({ pricePending: { trendyol: { since } } })], 1);
        expect(await runPricePublishForClient(b.deps, 7)).toEqual({ staged: 0, cleared: 0, deferred: 1 });
    });

    it('kanal fiyat kuralı sonucu ve kanal özel fiyatı gövdeye girer (tek kaynak)', async () => {
        const v = dirty({ pricePending: { trendyol: { since } }, platforms: { trendyol: { ...published, rulePrice: { salePrice: 105.5, marketPrice: 130 } } } });
        const { deps, calls } = fakeTenant([v]);
        await runPricePublishForClient(deps, 7);
        expect(calls.staged[0][1].$set).toMatchObject({ price: 105.5, listPrice: 130 });
    });

    it('Redis yoksa tur atlanır', async () => {
        const { deps } = fakeTenant([]);
        expect(await runPricePublish({ ...deps, redisReady: () => false })).toMatchObject({ skipped: true, scannedClients: 0 });
        expect(await runPricePublish(deps)).toMatchObject({ skipped: false, scannedClients: 1, staged: 0 });
    });
});
