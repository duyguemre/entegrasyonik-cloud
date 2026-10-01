/**
 * PRC-R2 — operasyonlar (bellek-içi sahte ClientDB): KURU öneri üretimi, İNSAN ONAYLI uygulama (sigorta yeniden çalışır), anahtarlar
 * (K19), sorumluluk metni (K3), tenant izolasyonu (K2/K5), liste fiyatı korunur (K9), fiyat geçmişi (K10), denetim alanları (K18),
 * dış değişiklikte kural durur (K17), S6 toplu onay kota sayımı.
 */
import { describe, expect, it, beforeEach } from '@jest/globals';
import { ObjectId } from 'mongodb';
import {
    applySuggestions, deleteRule, dismissSuggestions, generateSuggestions, getRulesState, listPriceHistory, listSuggestions, priceWrite,
    saveRule, setPricingSettings, type PricingEnv,
} from '@operations/pricing/priceRules';
import { PRICING_CONSENT } from '@operations/pricing/priceRule';
import type { MarginContext } from '@operations/pricing/margin';
import { actionQuotaCost } from '@operations/agent/agentEntitlement';
import { fakeClientDb } from './helpers/fakeClientDb';

const NOW = new Date('2026-10-01T12:00:00Z');
const MIN = 60_000;
const MARGIN: MarginContext = {
    costPrice: 50, vatRate: 20, commission: { rate: 10, source: 'estimated' },
    deductions: { commissionVatRate: 0, serviceFeeFixed: 0, serviceFeeRate: 0, shippingContribution: 0, withholdingRate: 0 },
};
const PARAMS = {
    mode: 'below' as const, deltaAmount: 1, deltaPercent: null, floorMarginPercent: 10, ceiling: 200, step: 0.01,
    maxChangesPerDay: 6, cooldownMin: 30, maxIncreasePercentPerDay: 5, excludeIfOutOfStock: true,
};

interface Env extends PricingEnv { audits: any[]; published: string[][]; paused: any[]; flags: { platform: boolean; competition: boolean }; clock: { now: Date } }

function mkEnv(margins: (v: any) => MarginContext | undefined = (v) => (v.costPrice === undefined ? { ...MARGIN, costPrice: null } : { ...MARGIN, costPrice: v.costPrice })): Env {
    const e: any = {
        audits: [], published: [], paused: [], flags: { platform: true, competition: true }, clock: { now: NOW },
    };
    Object.assign(e, {
        now: () => e.clock.now,
        platformEnabled: () => e.flags.platform,
        competitionEnabled: () => e.flags.competition,
        freshnessMin: async () => 30,
        marginContexts: async (_db: any, _tid: number, variants: any[]) => {
            const m = new Map<string, MarginContext>();
            for (const v of variants) { const c = margins(v); if (c) m.set(String(v._id), c); }
            return m;
        },
        publish: async (_db: any, _tid: number, barcodes: string[]) => { e.published.push(barcodes); },
        notifyPaused: async (tid: number, p: any) => { e.paused.push({ tid, ...p }); },
        audit: (event: string, tid: number, actor: string | null, meta: any) => { e.audits.push({ event, tid, actor, meta }); },
    });
    return e as Env;
}

function variant(over: any = {}) {
    const c = over.competition ?? { status: 'losing', buyboxOrder: 2, buyboxPrice: 110, checkedAt: new Date(NOW.getTime() - 5 * MIN) };
    return {
        _id: new ObjectId(), productId: new ObjectId(), barcode: over.barcode ?? `869${Math.floor(Math.random() * 1e9)}`, stockcode: 'SKU-1', stock: 5,
        prices: { isPlatformBasedPrice: false, salePrice: 120, marketPrice: 120 }, costPrice: 50,
        platforms: { trendyol: { upload: { TRANSFER: { status: 'COMPLETED' } } }, hepsiburada: { upload: { TRANSFER: { status: 'COMPLETED' } } } },
        competition: { trendyol: c },
        ...over,
    };
}

async function enable(db: any, env: Env) {
    await setPricingSettings(db, 7, 'u1', { enabled: true, consentVersion: PRICING_CONSENT.version, dualEngineAcknowledged: true }, env);
}
async function rule(db: any, env: Env, over: any = {}) {
    return saveRule(db, 7, 'u1', { name: 'Buybox altı', enabled: true, integrationCode: 'trendyol', competition: { ...PARAMS, ...(over.competition ?? {}) }, ...(over.scope ? { scope: over.scope } : {}) }, env);
}

let db: ReturnType<typeof fakeClientDb>;
let env: Env;
beforeEach(() => { db = fakeClientDb(); env = mkEnv(); });

describe('legal-K3-default-off: varsayılan kapalı; açarken sorumluluk metni (taslak) onaylanır', () => {
    it('legal-K3-default-off: ayar belgesi yokken kurallar çalışmaz, öneri üretilmez', async () => {
        db.models.variant.docs.push(variant());
        await rule(db, env);
        expect(await generateSuggestions(db, 7, env)).toMatchObject({ skipped: 'tenant_disabled', suggested: 0 });
        expect(db.models.priceSuggestion.docs).toHaveLength(0);
        const st = await getRulesState(db, 7, env);
        expect(st).toMatchObject({ active: false, inactiveReason: 'tenant_disabled', consent: { version: PRICING_CONSENT.version, draft: true } });
    });
    it('legal-K3-default-off: metin sürümü onaylanmadan / çift motor uyarısı onaylanmadan açılamaz; kabul zamanı + kişi kaydedilir, denetime yazılır', async () => {
        await expect(setPricingSettings(db, 7, 'u1', { enabled: true }, env)).rejects.toThrow(/sorumluluk metnini/);
        await expect(setPricingSettings(db, 7, 'u1', { enabled: true, consentVersion: 'eski' }, env)).rejects.toThrow(/sorumluluk metnini/);
        await expect(setPricingSettings(db, 7, 'u1', { enabled: true, consentVersion: PRICING_CONSENT.version }, env)).rejects.toThrow(/çift kullanım/);
        await enable(db, env);
        const s = db.models.pricingSettings.docs[0];
        expect(s).toMatchObject({ _id: 'pricing', enabled: true, consent: { version: PRICING_CONSENT.version, acceptedBy: 'u1' } });
        expect(s.consent.acceptedAt).toEqual(NOW);
        expect(env.audits.find((a) => a.event === 'pricing.settings.enabled')?.meta).toMatchObject({ consentVersion: PRICING_CONSENT.version, consentDraft: true });
        expect(PRICING_CONSENT.text.tr).toMatch(/sorumluluğu size aittir/);
        expect(PRICING_CONSENT.text.tr).toMatch(/başka hiçbir satıcının/);
    });
});

describe('KURU öneri üretimi (yalnız öneri yazar; fiyat DEĞİŞMEZ)', () => {
    it('öneri: önce/sonra fiyat, kâr, gerekçe, kural sürümü, buybox değeri+zamanı; varyant fiyatına dokunulmaz', async () => {
        const v = variant();
        db.models.variant.docs.push(v);
        await enable(db, env);
        await rule(db, env);
        const s = db.models.priceSuggestion.docs;
        expect(s).toHaveLength(1);
        expect(s[0]).toMatchObject({ status: 'open', current: true, beforePrice: 120, afterPrice: 109, ruleVersion: 1, buyboxPrice: 110, floor: 78.95, reasons: ['mode_below', 'buybox_held_by_other', 'price_down'] });
        expect(typeof s[0].profitAfter).toBe('number');
        expect(db.models.variant.docs[0].prices.salePrice).toBe(120);
        expect(db.models.variant.docs[0].platforms.trendyol.prices).toBeUndefined();
        expect(env.published).toEqual([]);
    });
    it('maliyeti olmayan ürün "engellendi: cost_missing" olarak görünür (K7), öneri değil', async () => {
        const v = variant(); delete (v as any).costPrice;
        db.models.variant.docs.push(v);
        await enable(db, env);
        await rule(db, env);
        expect(db.models.priceSuggestion.docs[0]).toMatchObject({ status: 'blocked', blockedReason: 'cost_missing', current: true });
        const list = await listSuggestions(db, 7, { status: 'blocked' }, env);
        expect(list.items[0]).toMatchObject({ blockedReason: 'cost_missing', afterPrice: null });
    });
    it('tekrar koşu aynı (kural, varyant) için tek GÜNCEL kayıt tutar; koşul kalkınca kayıt kapanır', async () => {
        const v = variant();
        db.models.variant.docs.push(v);
        await enable(db, env);
        await rule(db, env);
        await generateSuggestions(db, 7, env);
        expect(db.models.priceSuggestion.docs.filter((x) => x.current)).toHaveLength(1);
        db.models.variant.docs[0].competition.trendyol = { status: 'winning', buyboxOrder: 1, buyboxPrice: 120, checkedAt: NOW };
        await generateSuggestions(db, 7, env);
        expect(db.models.priceSuggestion.docs.filter((x) => x.current)).toHaveLength(0);
        expect(db.models.priceSuggestion.docs[0]).toMatchObject({ status: 'expired', closedReason: 'already_winning' });
    });
    it('en özel kural önce: barkod kapsamlı kural genel kuralın önüne geçer; bir varyant tek kurala düşer', async () => {
        const v = variant({ barcode: 'B1' });
        db.models.variant.docs.push(v);
        await enable(db, env);
        await rule(db, env);
        await rule(db, env, { scope: { barcodes: ['B1'] }, competition: { deltaAmount: 2 } });
        const cur = db.models.priceSuggestion.docs.filter((x) => x.current);
        expect(cur).toHaveLength(1);
        expect(cur[0].afterPrice).toBe(108);
    });
    it('K19: platform kapalı / buybox verisi kapalı / kural kapalı → öneri yok', async () => {
        db.models.variant.docs.push(variant());
        await enable(db, env);
        env.flags.platform = false;
        expect(await generateSuggestions(db, 7, env)).toMatchObject({ skipped: 'platform_disabled' });
        env.flags.platform = true; env.flags.competition = false;
        expect(await generateSuggestions(db, 7, env)).toMatchObject({ skipped: 'competition_disabled' });
        env.flags.competition = true;
        await saveRule(db, 7, 'u1', { name: 'kapalı', enabled: false, integrationCode: 'trendyol', competition: PARAMS }, env);
        expect(await generateSuggestions(db, 7, env)).toMatchObject({ rules: 0, suggested: 0 });
    });
});

describe('legal-K17-dual-engine (operasyon): dış değişiklikte kural durur, bildirilir, geçmişe yazılır', () => {
    it('legal-K17-dual-engine: buybox bizde ama fiyat farklı → kural duraklatılır, açık öneriler kapanır, PRICE_RULE_PAUSED, dış değişiklik geçmişte', async () => {
        const v1 = variant({ barcode: 'A' });
        db.models.variant.docs.push(v1);
        await enable(db, env);
        const r = await rule(db, env);
        expect(db.models.priceSuggestion.docs.filter((x) => x.current)).toHaveLength(1);
        db.models.variant.docs[0].competition.trendyol = { status: 'winning', buyboxOrder: 1, buyboxPrice: 99.9, checkedAt: NOW };
        expect(await generateSuggestions(db, 7, env)).toMatchObject({ paused: 1 });
        expect(db.models.priceRule.docs[0]).toMatchObject({ pausedReason: 'external_change' });
        expect(db.models.priceSuggestion.docs.filter((x) => x.current)).toHaveLength(0);
        expect(env.paused).toEqual([{ tid: 7, integ: 'trendyol', ruleId: r.id, reason: 'external_change', day: '2026-10-01' }]);
        expect(db.models.priceHistory.docs[0]).toMatchObject({ source: 'external', salePrice: 99.9, previousPrice: 120 });
        // Kaydetmek duraklatmayı kaldırır ve sürümü artırır.
        const saved = await saveRule(db, 7, 'u1', { id: r.id, name: 'x', enabled: true, integrationCode: 'trendyol', competition: PARAMS }, env);
        expect(saved).toMatchObject({ pausedReason: null, version: 2 });
    });
});

describe('İNSAN ONAYLI uygulama (sigorta yeniden çalışır)', () => {
    async function setup(over: any = {}) {
        const v = variant(over);
        db.models.variant.docs.push(v);
        await enable(db, env);
        await rule(db, env);
        const s = db.models.priceSuggestion.docs.find((x) => x.status === 'open');
        return { v, sid: String(s?._id) };
    }
    it('uygular: yalnız Trendyol satış fiyatı; ortak fiyatlı varyant kanal bazlıya geçer, diğer kanal aynen korunur; liste fiyatı değişmez (legal-K9-list-price)', async () => {
        const { sid, v } = await setup();
        const out = await applySuggestions(db, 7, 'u1', { suggestionIds: [sid] }, env);
        expect(out).toEqual({ applied: [{ suggestionId: sid, barcode: v.barcode, before: 120, after: 109 }], rejected: [], published: 1 });
        const after = db.models.variant.docs[0];
        expect(after.prices).toEqual({ isPlatformBasedPrice: true, salePrice: 120, marketPrice: 120 });
        expect(after.platforms.trendyol.prices).toEqual({ salePrice: 109, marketPrice: 120 });
        expect(after.platforms.hepsiburada.prices).toEqual({ salePrice: 120, marketPrice: 120 });
        expect(env.published).toEqual([[v.barcode]]);
        expect(db.models.priceSuggestion.docs[0]).toMatchObject({ status: 'applied', appliedBy: 'u1' });
        expect(db.models.priceSuggestion.docs[0].current).toBeUndefined();
    });
    it('legal-K10-price-history + legal-K18-audit: geçmiş kaydı ve denetim alanları (tenant, SKU, kanal, eski/yeni, buybox+zaman, kural sürümü, tetikleyen, sigorta)', async () => {
        const { sid, v } = await setup();
        await applySuggestions(db, 7, 'u1', { suggestionIds: [sid] }, env);
        expect(db.models.priceHistory.docs[0]).toMatchObject({ integrationCode: 'trendyol', barcode: v.barcode, salePrice: 109, previousPrice: 120, listPrice: 120, source: 'suggestion', ruleVersion: 1, buyboxPrice: 110, actor: 'u1' });
        const a = env.audits.find((x) => x.event === 'pricing.suggestion.applied');
        expect(a).toMatchObject({ tid: 7, actor: 'u1', meta: { barcode: v.barcode, channel: 'trendyol', before: 120, after: 109, buyboxPrice: 110, ruleVersion: 1, source: 'rule_approved', fuse: 'pass' } });
        expect(typeof a.meta.buyboxAt).toBe('string');
        expect(Object.keys(a.meta).length).toBeLessThanOrEqual(10); // AuditLogger meta sınırı
        const h = await listPriceHistory(db, {}, env);
        expect(h.items[0]).toMatchObject({ source: 'suggestion', previousPrice: 120, salePrice: 109 });
        // K10: son 10 gün en düşük fiyat (geçmiş + güncel)
        db.models.variant.docs[0].competition.trendyol = { status: 'losing', buyboxOrder: 2, buyboxPrice: 100, checkedAt: new Date(NOW.getTime() + 40 * MIN) };
        env.clock.now = new Date(NOW.getTime() + 41 * MIN);
        await generateSuggestions(db, 7, env);
        const l = await listSuggestions(db, 7, {}, env);
        expect(l.items[0]).toMatchObject({ beforePrice: 109, afterPrice: 99, lowestPrice10d: 109 });
    });
    it('sigorta: öneriden sonra fiyat dışarıda değiştiyse uygulanmaz (price_changed)', async () => {
        const { sid } = await setup();
        db.models.variant.docs[0].prices.salePrice = 118;
        const out = await applySuggestions(db, 7, 'u1', { suggestionIds: [sid] }, env);
        expect(out).toMatchObject({ applied: [], rejected: [{ suggestionId: sid, reason: 'price_changed' }], published: 0 });
        expect(env.published).toEqual([]);
    });
    it('legal-K13-stale-data (uygulamada): veri bayatladıysa uygulanmaz', async () => {
        const { sid } = await setup();
        env.clock.now = new Date(NOW.getTime() + 40 * MIN);
        expect((await applySuggestions(db, 7, 'u1', { suggestionIds: [sid] }, env)).rejected[0].reason).toBe('stale_data');
    });
    it('sigorta: buybox değiştiyse (farklı hedef) uygulanmaz; kural sürümü değiştiyse uygulanmaz', async () => {
        const { sid } = await setup();
        db.models.variant.docs[0].competition.trendyol.buyboxPrice = 105;
        expect((await applySuggestions(db, 7, 'u1', { suggestionIds: [sid] }, env)).rejected[0].reason).toBe('suggestion_changed');
        db.models.variant.docs[0].competition.trendyol.buyboxPrice = 110;
        db.models.priceRule.docs[0].version = 2;
        expect((await applySuggestions(db, 7, 'u1', { suggestionIds: [sid] }, env)).rejected[0].reason).toBe('rule_changed');
    });
    it('legal-K12-frequency (uygulamada): soğuma içinde ikinci uygulama reddedilir', async () => {
        const { sid } = await setup();
        await applySuggestions(db, 7, 'u1', { suggestionIds: [sid] }, env);
        // yeni öneri anı: 35 dk sonra gözlem (yayın payı dolmuş) ama soğuma 30 dk → geçer; soğumayı 60 yap → red
        db.models.priceRule.docs[0].competition.cooldownMin = 60;
        db.models.variant.docs[0].competition.trendyol = { status: 'losing', buyboxOrder: 2, buyboxPrice: 105, checkedAt: new Date(NOW.getTime() + 35 * MIN) };
        env.clock.now = new Date(NOW.getTime() + 36 * MIN);
        await generateSuggestions(db, 7, env);
        expect(db.models.priceSuggestion.docs.filter((x) => x.status === 'open')).toHaveLength(0); // cooldown → öneri yok
    });
    it('legal-K19-kill-switch: platform / tenant / kural kapalıyken uygulama reddedilir', async () => {
        const { sid } = await setup();
        env.flags.platform = false;
        await expect(applySuggestions(db, 7, 'u1', { suggestionIds: [sid] }, env)).rejects.toMatchObject({ code: 'CAPABILITY_DISABLED' });
        env.flags.platform = true;
        db.models.pricingSettings.docs[0].enabled = false;
        await expect(applySuggestions(db, 7, 'u1', { suggestionIds: [sid] }, env)).rejects.toMatchObject({ code: 'CAPABILITY_DISABLED' });
        db.models.pricingSettings.docs[0].enabled = true;
        db.models.priceRule.docs[0].enabled = false;
        expect((await applySuggestions(db, 7, 'u1', { suggestionIds: [sid] }, env)).rejected[0].reason).toBe('rule_disabled');
        expect(env.published).toEqual([]);
    });
    it('tenant kapatılınca açık öneriler kapanır; reddet (dismiss) öneriyi kapatır', async () => {
        const { sid } = await setup();
        expect(await dismissSuggestions(db, 7, 'u1', { suggestionIds: [sid] }, env)).toEqual({ dismissed: 1 });
        expect(db.models.priceSuggestion.docs[0]).toMatchObject({ status: 'dismissed' });
        await setPricingSettings(db, 7, 'u1', { enabled: false }, env);
        expect((await getRulesState(db, 7, env)).active).toBe(false);
    });
    it('aynı öneri iki kez uygulanmaz; bilinmeyen kimlik reddedilir; ≤50 sınırı', async () => {
        const { sid } = await setup();
        await applySuggestions(db, 7, 'u1', { suggestionIds: [sid] }, env);
        expect((await applySuggestions(db, 7, 'u1', { suggestionIds: [sid] }, env)).rejected[0].reason).toBe('not_open_applied');
        expect((await applySuggestions(db, 7, 'u1', { suggestionIds: [String(new ObjectId())] }, env)).rejected[0].reason).toBe('not_found');
        await expect(applySuggestions(db, 7, 'u1', { suggestionIds: Array.from({ length: 51 }, () => String(new ObjectId())) }, env)).rejects.toMatchObject({ code: 'VALIDATION' });
    });
    it('priceWrite: kanal bazlı fiyatlı varyantta yalnız kanal satış fiyatı + iyimser koruma', () => {
        const w = priceWrite({ prices: { isPlatformBasedPrice: true }, platforms: { trendyol: { prices: { salePrice: 120, marketPrice: 150 } } } }, 109);
        expect(w).toEqual({ guard: { 'platforms.trendyol.prices.salePrice': 120 }, set: { 'platforms.trendyol.prices.salePrice': 109 } });
        expect(JSON.stringify(w.set)).not.toMatch(/marketPrice/);
    });
});

describe('legal-K2-tenant-isolation: tenant\'lar arası veri yok (K2/K5)', () => {
    it('legal-K2-tenant-isolation: aynı barkodu satan iki tenant — biri diğerinin kuralını/önerisini/fiyatını görmez ve etkilemez', async () => {
        const dbA = fakeClientDb(), dbB = fakeClientDb();
        const envA = mkEnv(), envB = mkEnv();
        dbA.models.variant.docs.push(variant({ barcode: 'SAME' }));
        dbB.models.variant.docs.push(variant({ barcode: 'SAME', prices: { isPlatformBasedPrice: false, salePrice: 95, marketPrice: 95 }, competition: { status: 'winning', buyboxOrder: 1, buyboxPrice: 95, checkedAt: NOW } }));
        await enable(dbA, envA);
        await rule(dbA, envA);
        // B'nin verisi (B'nin fiyatı 95 buybox'ı tutuyor) A'nın kararına GİRMEZ: A yalnız kendi gözlemini (110) kullanır.
        expect(dbA.models.priceSuggestion.docs[0]).toMatchObject({ afterPrice: 109, buyboxPrice: 110 });
        expect(dbB.models.priceRule.docs).toHaveLength(0);
        expect(dbB.models.priceSuggestion.docs).toHaveLength(0);
        expect((await listSuggestions(dbB, 8, {}, envB)).items).toEqual([]);
        expect((await getRulesState(dbB, 8, envB)).rules).toEqual([]);
        // A'nın onayı yalnız A'nın DB'sine yazar.
        await applySuggestions(dbA, 7, 'u1', { suggestionIds: [String(dbA.models.priceSuggestion.docs[0]._id)] }, envA);
        expect(dbB.models.variant.docs[0].prices.salePrice).toBe(95);
        expect(dbB.models.priceHistory.docs).toHaveLength(0);
    });
});

describe('kural CRUD', () => {
    it('sil: açık öneriler kapanır, denetim yazılır', async () => {
        db.models.variant.docs.push(variant());
        await enable(db, env);
        const r = await rule(db, env);
        await deleteRule(db, 7, 'u1', { id: r.id }, env);
        expect(db.models.priceRule.docs).toHaveLength(0);
        expect(db.models.priceSuggestion.docs.every((x) => x.status === 'expired')).toBe(true);
        expect(env.audits.map((a) => a.event)).toContain('pricing.rule.deleted');
    });
    it('denetim: kural oluşturma değerleri (fark/taban/tavan) kayda geçer (K18)', async () => {
        await rule(db, env);
        expect(env.audits.find((a) => a.event === 'pricing.rule.created')?.meta).toMatchObject({ mode: 'below', deltaAmount: 1, floorMarginPercent: 10, ceiling: 200, ruleVersion: 1 });
    });
});

describe('PRC-OPEN S6: toplu onay kota sayımı (ayar; varsayılan 1 eylem)', () => {
    it('varsayılan per_approval → toplu onay 1 eylem; per_item → öneri sayısı; diğer yetenekler 1', () => {
        const ids = ['a', 'b', 'c'];
        expect(actionQuotaCost('pricing.suggestions.apply', { suggestionIds: ids }, () => 'per_approval')).toBe(1);
        expect(actionQuotaCost('pricing.suggestions.apply', { suggestionIds: ids }, () => undefined)).toBe(1);
        expect(actionQuotaCost('pricing.suggestions.apply', { suggestionIds: ids }, () => 'per_item')).toBe(3);
        expect(actionQuotaCost('orders.approve', { orderIds: ids }, () => 'per_item')).toBe(1);
    });
});
