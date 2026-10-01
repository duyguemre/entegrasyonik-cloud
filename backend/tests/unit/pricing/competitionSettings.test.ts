/**
 * PRC-CFG — plan varsayılanı (`_platform` kataloğu, yayınlanmış değer) + tenant istisnası çözümü; kanal bütçesi; katalog tutarlılığı.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import {
    channelBudgetPerMin, competitionPlanFor, notifyCooldownMs, notifyShadow, resolveCompetitionSettings, competitionOverrideSchema,
} from '@operations/pricing/competitionSettings';
import { COMPETITION_PLAN_DEFAULTS, PRICING_SETTINGS, planKey, budgetKey } from '@integration/config/catalog/pricing';
import { getSettingDef, listSettings } from '@integration/config/catalog';
import { getPlatformSetting } from '@integration/config/platformSettings';
import { resetPlatformOverrideStoreForTests, setTargetOverride } from '@integration/config/platformOverrideStore';
import { PLATFORM_TARGET } from '@integration/config/targets';

const reader = (vals: Record<string, unknown>) => (k: string) => (k in vals ? vals[k] : getSettingDef(k)?.default);

afterEach(() => resetPlatformOverrideStoreForTests());

describe('katalog (ADR-0031 _platform)', () => {
    it('anahtarlar platform kapsamlı, yöneticiye özel (public-config\'e girmez), varsayılanlar şemadan geçer', () => {
        for (const d of PRICING_SETTINGS) {
            expect(d.scope).toBe('platform');
            expect(d.group).toBe('platform.pricing');
            expect(d.exposure).toBeUndefined();
            expect(d.schema.safeParse(d.default).success).toBe(true);
            expect(getSettingDef(d.key)).toBe(d);
        }
        expect(listSettings().filter((s) => s.key === 'features.competition')).toHaveLength(1);
        expect(getSettingDef('features.competition')!.default).toBe(false);
    });
    it('araştırma S5/S7 başlangıç değerleri: starter 100 SKU / 360 dk (günde 4), aktif SKU 30 dk, eşik 30 dk; bütçe güvenli düşük (60/dk)', () => {
        expect(COMPETITION_PLAN_DEFAULTS.starter).toMatchObject({ skuCap: 100, refreshMin: 360, freshnessMin: 30 });
        expect(COMPETITION_PLAN_DEFAULTS.growth.refreshMin).toBe(30);
        expect(getSettingDef(budgetKey('trendyol'))!.default).toBe(60);
    });
});

describe('resolveCompetitionSettings', () => {
    it('katalogda olmayan plan -> starter; muaf (legacy) -> growth', () => {
        expect(competitionPlanFor('legacy')).toBe('starter');
        expect(competitionPlanFor(undefined, true)).toBe('growth');
        expect(competitionPlanFor('enterprise', true)).toBe('enterprise');
    });
    it('istisna yokken plan değerleri, kaynak "plan"', () => {
        const s = resolveCompetitionSettings({ planCode: 'starter' }, reader({}));
        expect(s).toMatchObject({ plan: 'starter', skuCap: 100, refreshMin: 360, freshnessMin: 30, priority: 'changed_first' });
        expect(Object.values(s.sources).every((x) => x === 'plan')).toBe(true);
    });
    it('yayınlanmış plan değeri katalog varsayılanını geçer (yeniden başlatmasız)', () => {
        setTargetOverride(PLATFORM_TARGET, 2, { [planKey('starter', 'skuCap')]: 250 });
        expect(getPlatformSetting(planKey('starter', 'skuCap'))).toBe(250);
        expect(resolveCompetitionSettings({ planCode: 'starter' }).skuCap).toBe(250);
    });
    it('tenant istisnası alan bazında üstün; geçersiz alan yok sayılır', () => {
        const s = resolveCompetitionSettings({ planCode: 'starter', override: { skuCap: 500, refreshMin: 5, priority: 'stocked_only', junk: 1 } }, reader({}));
        expect(s.skuCap).toBe(500);
        expect(s.sources.skuCap).toBe('tenant');
        expect(s.refreshMin).toBe(360); // 5 < 15 alt sınır -> yok sayıldı
        expect(s.sources.refreshMin).toBe('plan');
        expect(s.priority).toBe('stocked_only');
    });
    it('istisna şeması katıdır (bilinmeyen alan reddedilir)', () => {
        expect(competitionOverrideSchema.safeParse({ skuCap: 10, x: 1 }).success).toBe(false);
        expect(competitionOverrideSchema.safeParse({ freshnessMin: 4 }).success).toBe(false);
        expect(competitionOverrideSchema.safeParse({}).success).toBe(true);
    });
});

describe('bütçe ve bildirim ayarları', () => {
    it('kanal bütçesi: tanımlı kanal değer, tanımsız kanal 0 (çağrı yapılmaz)', () => {
        expect(channelBudgetPerMin('trendyol', reader({}))).toBe(60);
        expect(channelBudgetPerMin('trendyol', reader({ [budgetKey('trendyol')]: 300 }))).toBe(300);
        expect(channelBudgetPerMin('hepsiburada')).toBe(0);
    });
    it('gölge mod varsayılan açık; soğuma 24 sa (kodda sabit)', () => {
        expect(notifyShadow(reader({}))).toBe(true);
        expect(notifyShadow(reader({ 'pricing.buybox.notify.shadow': false }))).toBe(false);
        expect(notifyCooldownMs()).toBe(24 * 3600_000);
    });
});
