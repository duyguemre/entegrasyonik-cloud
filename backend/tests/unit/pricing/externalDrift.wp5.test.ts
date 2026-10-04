// [eslesme-fiyat WP5, K-B] Dış fiyat gözlemi: yerel fiyata yazılmaz; bekleyen/yeni gönderilmiş değişiklikte fark sayılmaz; aynı dış değer
// geçmişe bir kez yazılır; kullanıcı çözümü pushLocal (yeniden gönder) / acceptChannel (kanal özel fiyatı; diğer kanallar değişmez). DB YOK.
import { describe, it, expect, beforeEach } from '@jest/globals';
import { ObjectId } from 'mongodb';
import { evaluateDrift, parseMoney, recordObservation, resolvePriceDrift, DRIFT_GRACE_MS } from '@operations/pricing/externalDrift';
import { effectiveChannelPrice } from '@platform/core/pricing/effectivePrice';
import { checkChannelReadiness } from '@integration/catalog/preflight/readiness';
import { fakeClientDb } from './helpers/fakeClientDb';

const NOW = new Date('2026-10-04T10:00:00Z');
const COMPLETED = { upload: { TRANSFER: { status: 'COMPLETED' } } };
const variant = (o: any = {}) => ({
    _id: new ObjectId(), barcode: 'B1', prices: { isPlatformBasedPrice: false, salePrice: 100, marketPrice: 120 },
    platforms: { trendyol: { ...COMPLETED }, n11: { ...COMPLETED, prices: { salePrice: 77 } } }, ...o,
});

describe('evaluateDrift / parseMoney', () => {
    it('TR biçimli tutar', () => {
        expect(parseMoney('130,50')).toBe(130.5);
        expect(parseMoney('1.299,90')).toBe(1299.9);
        expect(parseMoney(99.9)).toBe(99.9);
        expect(parseMoney('x')).toBeNull();
    });
    it('etkin fiyattan farklıysa drift; bekleyen ya da yeni kuyruğa alınmış değişiklikte drift yok', () => {
        expect(evaluateDrift(variant(), 'trendyol', { salePrice: 95, marketPrice: 120 }, NOW)).toMatchObject({ drift: true, expected: 100, observed: { salePrice: 95, marketPrice: 120 } });
        expect(evaluateDrift(variant(), 'trendyol', { salePrice: '100,00' }, NOW)?.drift).toBe(false);
        expect(evaluateDrift(variant({ pricePending: { trendyol: { since: NOW } } }), 'trendyol', { salePrice: 95 }, NOW)?.drift).toBe(false);
        const queued = variant({ platforms: { trendyol: { ...COMPLETED, priceSync: { queuedAt: new Date(NOW.getTime() - 60_000) } } } });
        expect(evaluateDrift(queued, 'trendyol', { salePrice: 95 }, NOW)?.drift).toBe(false);
        expect(evaluateDrift(queued, 'trendyol', { salePrice: 95 }, new Date(NOW.getTime() + DRIFT_GRACE_MS))?.drift).toBe(true);
        expect(evaluateDrift(variant(), 'trendyol', { salePrice: 0 }, NOW)).toBeNull();
    });
});

describe('recordObservation + hazırlık uyarısı + çözüm', () => {
    let db: any;
    beforeEach(() => { db = fakeClientDb(); });

    it('observed yazılır, yerel fiyat değişmez; aynı dış değer geçmişe bir kez; readiness PRICE_EXTERNAL_DRIFT', async () => {
        const v = variant();
        await db.getVariantModel().create(v);
        expect(await recordObservation(db, v, 'trendyol', { salePrice: 95, marketPrice: 120 }, NOW)).toBe(true);
        const a = await db.getVariantModel().findOne({ _id: v._id }).lean();
        expect(a.prices.salePrice).toBe(100);
        expect(a.platforms.trendyol.observed).toMatchObject({ salePrice: 95, drift: true, expectedSalePrice: 100, source: 'reconciliation' });
        expect(await recordObservation(db, a, 'trendyol', { salePrice: 95 }, NOW)).toBe(true);
        expect(await db.getPriceHistoryModel().find({}).lean()).toEqual([expect.objectContaining({ source: 'external', salePrice: 95, previousPrice: 100 })]);
        const issues = checkChannelReadiness({ variant: a, product: { category: 'c', brand: 'b', taxPercentage: 20 }, integrationCode: 'trendyol', mode: 'UPDATE_PRICE' });
        expect(issues.map((i) => i.code)).toContain('PRICE_EXTERNAL_DRIFT');
    });

    it('pushLocal: pricePending (resync) + gövde özeti sıfırlanır; acceptChannel: kanal özel fiyatı, diğer kanalların etkin fiyatı aynı', async () => {
        const v = variant();
        await db.getVariantModel().create(v);
        await recordObservation(db, v, 'trendyol', { salePrice: 95, marketPrice: 110 }, NOW);
        await expect(resolvePriceDrift(db, 'u1', { variantId: String(v._id), integrationCode: 'n11', action: 'pushLocal' }, NOW)).rejects.toThrow(/farkı yok/);
        const r1 = await resolvePriceDrift(db, 'u1', { variantId: String(v._id), integrationCode: 'trendyol', action: 'pushLocal' }, NOW);
        expect(r1).toEqual({ action: 'pushLocal', integrationCode: 'trendyol', salePrice: 100 });
        let a = await db.getVariantModel().findOne({ _id: v._id }).lean();
        expect(a.pricePending.trendyol).toMatchObject({ reason: 'resync' });
        expect(a.priceDirty).toBe(true);
        expect(a.platforms.trendyol.observed.drift).toBe(false);

        await recordObservation(db, { ...a, pricePending: undefined }, 'trendyol', { salePrice: 95, marketPrice: 110 }, NOW);
        const n11Before = effectiveChannelPrice(a, 'n11');
        await resolvePriceDrift(db, 'u1', { variantId: String(v._id), integrationCode: 'trendyol', action: 'acceptChannel' }, NOW);
        a = await db.getVariantModel().findOne({ _id: v._id }).lean();
        expect(effectiveChannelPrice(a, 'trendyol')).toMatchObject({ salePrice: 95, marketPrice: 110, source: 'channel' });
        expect(effectiveChannelPrice(a, 'n11')).toMatchObject({ salePrice: n11Before.salePrice, source: 'base' }); // eski etkisiz nesne canlanmadı
        expect(a.platforms.n11.prices).toBeUndefined();
        const hist = await db.getPriceHistoryModel().find({ source: 'manual' }).lean();
        expect(hist[0]).toMatchObject({ salePrice: 95, previousPrice: 100, actor: 'u1' });
    });
});
