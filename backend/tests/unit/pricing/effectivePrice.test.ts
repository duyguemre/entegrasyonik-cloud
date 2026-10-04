/**
 * [eslesme-fiyat WP5, PLAN §3.4, Ek B P1-1] `effectiveChannelPrice` matrisi: bayrak × kanal nesnesi × kural sonucu.
 */
import { describe, expect, it } from '@jest/globals';
import {
    channelPricePair, describeEffectivePrice, effectiveChannelPrice, effectiveListPrice, fromKurus, hasChannelPrice, round2, toKurus,
} from '@platform/core/pricing/effectivePrice';
import { ownChannelPrice } from '@operations/pricing/buyboxState';
import { channelListPrice } from '@operations/pricing/priceRules';

const v = (o: any = {}) => ({
    prices: { isPlatformBasedPrice: o.flag ?? false, salePrice: 100, marketPrice: 120 },
    platforms: { trendyol: { ...(o.channel ? { prices: o.channel } : {}), ...(o.rule ? { rulePrice: o.rule } : {}) } },
});

describe('effectiveChannelPrice — kaynak sırası', () => {
    it.each([
        // [ad, bayrak, kanal nesnesi, kural, beklenen kaynak, satış, liste]
        ['bayrak kapalı + kanal nesnesi var (eski import) → ana fiyat', false, { salePrice: 90, marketPrice: 95 }, undefined, 'base', 100, 120],
        ['bayrak açık + kanal nesnesi → kanal', true, { salePrice: 90, marketPrice: 95 }, undefined, 'channel', 90, 95],
        ['bayrak açık + kanal nesnesi yok → ana fiyat', true, undefined, undefined, 'base', 100, 120],
        ['bayrak açık + kanal satış boş → ana fiyat', true, { salePrice: '' }, undefined, 'base', 100, 120],
        ['bayrak kapalı + kural sonucu → kural', false, undefined, { salePrice: 110.5, marketPrice: 130, ruleId: 'r1', ruleVersion: 2 }, 'rule', 110.5, 130],
        ['bayrak açık + kanal + kural → kanal (özel fiyat kuralı ezer)', true, { salePrice: 90 }, { salePrice: 110 }, 'channel', 90, null],
        ['bayrak kapalı + eski kanal nesnesi + kural → kural', false, { salePrice: 90 }, { salePrice: 110 }, 'rule', 110, null],
    ])('%s', (_n, flag, channel, rule, source, sale, list) => {
        const e = effectiveChannelPrice(v({ flag, channel, rule }), 'trendyol');
        expect(e.source).toBe(source);
        expect(e.salePrice).toBe(sale);
        expect(e.marketPrice).toBe(list);
    });

    it('ignoreRule: kural sonucu yok sayılır (kural tabanı döngüsü)', () => {
        expect(effectiveChannelPrice(v({ rule: { salePrice: 110 } }), 'trendyol', { ignoreRule: true }).source).toBe('base');
    });

    it('sayısal dizeler sayıya çevrilir; NaN/sonsuz null', () => {
        expect(effectiveChannelPrice({ prices: { salePrice: '12.5' } }, 'n11').salePrice).toBe(12.5);
        expect(effectiveChannelPrice({ prices: { salePrice: 'abc' } }, 'n11').salePrice).toBeNull();
        expect(effectiveChannelPrice({ prices: { salePrice: Infinity } }, 'n11').salePrice).toBeNull();
        expect(effectiveChannelPrice(undefined, 'n11')).toEqual({ salePrice: null, marketPrice: null, source: 'base', field: 'prices' });
    });

    it('hasChannelPrice yalnız bayrak + geçerli sayı', () => {
        expect(hasChannelPrice(v({ flag: true, channel: { salePrice: 1 } }), 'trendyol')).toBe(true);
        expect(hasChannelPrice(v({ flag: false, channel: { salePrice: 1 } }), 'trendyol')).toBe(false);
        expect(hasChannelPrice(v({ flag: true }), 'trendyol')).toBe(false);
    });

    it('channelPricePair adaptörler için undefined döner (0 değil)', () => {
        expect(channelPricePair({ prices: {} }, 'hepsiburada')).toEqual({ salePrice: undefined, marketPrice: undefined });
    });
});

describe('liste fiyatı ve para yardımcıları', () => {
    it('liste < satış ise satışa çekilir; tanımsız/0 ise satış; 2 ondalık', () => {
        expect(effectiveListPrice({ salePrice: 100, marketPrice: 90 })).toBe(100);
        expect(effectiveListPrice({ salePrice: 100, marketPrice: null })).toBe(100);
        expect(effectiveListPrice({ salePrice: 100, marketPrice: 0 })).toBe(100);
        expect(effectiveListPrice({ salePrice: 99.999, marketPrice: 149.994 })).toBe(149.99);
        expect(effectiveListPrice({ salePrice: null, marketPrice: 10 })).toBeNull();
    });

    it('kuruş dönüşümü kayan nokta hatasız', () => {
        expect(toKurus(1.005)).toBe(101);
        expect(toKurus(0.1 + 0.2)).toBe(30);
        expect(fromKurus(12999)).toBe(129.99);
        expect(round2(1.005)).toBe(1.01);
    });

    it('describe kaynak metni', () => {
        expect(describeEffectivePrice(effectiveChannelPrice(v({ rule: { salePrice: 110, ruleId: 'r1', ruleVersion: 3 } }), 'trendyol'))).toContain('kanal fiyat kuralı r1 s3');
        expect(describeEffectivePrice(effectiveChannelPrice(v(), 'trendyol'))).toContain('ana fiyat');
    });
});

describe('motor tarafı aynı kaynağı kullanır (P1-1: gönderim = kural/kâr)', () => {
    it('buybox ownChannelPrice ve kural channelListPrice effectiveChannelPrice ile aynı', () => {
        const cases = [v({ flag: true, channel: { salePrice: 90, marketPrice: 95 } }), v({ flag: true }), v({ channel: { salePrice: 90 } }), v({ rule: { salePrice: 105, marketPrice: 125 } })];
        for (const c of cases) {
            const e = effectiveChannelPrice(c, 'trendyol');
            expect(ownChannelPrice(c, 'trendyol')).toBe(e.salePrice);
            expect(channelListPrice(c, 'trendyol')).toBe(e.marketPrice);
        }
    });
});
