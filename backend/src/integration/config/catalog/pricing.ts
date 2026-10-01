// PRC-CFG (K57-S5, ADR-0031): rekabet modülü (buybox görünürlüğü, PRC-R1) ayarları — `_platform` hedefi, yöneticiye özel
// (`exposure` YOK, public-config'e girmez). Plan başına varsayılan (starter/growth/enterprise) + kanal başına global çağrı bütçesi +
// bildirim gölge modu. Bildirim soğuması (24 sa) kodda sabittir (`BUYBOX_LOST_COOLDOWN_HOURS`): ADR-0031 anahtar eşiği nedeniyle ayar yapılmadı. Tenant istisnası bu katalogda DEĞİL: `Subscriptions.limitOverrides.competition` (abonelik başına,
// backoffice'ten; ADR-0008 `limitOverrides` deseni). Okuyucu: `operations/pricing/competitionSettings.ts` (`getPlatformSetting`).
// Başlangıç değerleri docs/research/COMPETITION_PRICING_2026-10.md S5/S7 önerisidir (ölçülmedi); hepsi yeniden başlatmasız ayardır.
import { z } from 'zod';
import type { SettingDef } from '../types';

/** Rekabet ayarı taşıyan plan kodları (`plans.seed.json` ile aynı). Katalogda olmayan plan kodu `starter` varsayılanını alır. */
export const COMPETITION_PLANS = ['starter', 'growth', 'enterprise'] as const;
export type CompetitionPlan = typeof COMPETITION_PLANS[number];

/** Tazeleme önceliği: `changed_first` = son gözlemde buybox'ı değişen → stoklu → en eski gözlem; `stocked_only` = yalnız stoklu SKU;
 *  `oldest_first` = yalnız en eski gözlem önce. */
export const COMPETITION_PRIORITIES = ['changed_first', 'stocked_only', 'oldest_first'] as const;
export type CompetitionPriority = typeof COMPETITION_PRIORITIES[number];

/** Bütçesi tanımlı kanallar (PRC-R1: yalnız Trendyol; K57-S1). */
export const COMPETITION_BUDGET_CHANNELS = ['trendyol'] as const;

const base = {
    scope: 'platform' as const, group: 'platform.pricing' as const, danger: 'safe' as const, applies: 'immediate' as const,
    overridable: true, consumers: ['config/platformSettings.ts'], since: '2026-10-01', advanced: false,
};
const int = (min: number, max: number) => ({ type: 'int' as const, schema: z.number().int().min(min).max(max), safeRange: { min, max } });

const PLAN_LABEL: Record<CompetitionPlan, { tr: string; en: string }> = {
    starter: { tr: 'Başlangıç', en: 'Starter' },
    growth: { tr: 'Büyüme', en: 'Growth' },
    enterprise: { tr: 'Kurumsal', en: 'Enterprise' },
};

/** Plan varsayılanları (S5: starter 100 SKU / günde 4 tazeleme; S7: aktif SKU 30 dk, tazelik eşiği 30 dk). */
export const COMPETITION_PLAN_DEFAULTS: Readonly<Record<CompetitionPlan, { skuCap: number; refreshMin: number; freshnessMin: number; priority: CompetitionPriority }>> = {
    starter: { skuCap: 100, refreshMin: 360, freshnessMin: 30, priority: 'changed_first' },
    growth: { skuCap: 1000, refreshMin: 30, freshnessMin: 30, priority: 'changed_first' },
    enterprise: { skuCap: 5000, refreshMin: 30, freshnessMin: 30, priority: 'changed_first' },
};

/** Ayar sınırları: tenant istisnası da AYNI sınırlarla doğrulanır (backoffice yazma servisi). */
export const COMPETITION_LIMITS = {
    skuCap: { min: 0, max: 50_000 },
    refreshMin: { min: 15, max: 1440 },
    freshnessMin: { min: 5, max: 1440 },
    budgetPerMin: { min: 1, max: 1000 },
} as const;

export const planKey = (plan: CompetitionPlan, field: 'skuCap' | 'refreshMin' | 'freshnessMin' | 'priority') => `pricing.buybox.plan.${plan}.${field}`;
/** "Buybox kaybedildi" bildirimi: aynı barkod için en fazla günde bir (ayar değil; ADR-0031 `_platform` anahtar eşiği). */
export const BUYBOX_LOST_COOLDOWN_HOURS = 24;

export const budgetKey = (channel: string) => `pricing.buybox.budget.${channel}.perMin`;

function planSettings(plan: CompetitionPlan): SettingDef<any>[] {
    const d = COMPETITION_PLAN_DEFAULTS[plan];
    const L = PLAN_LABEL[plan];
    return [
        { ...base, key: planKey(plan, 'skuCap'), ...int(COMPETITION_LIMITS.skuCap.min, COMPETITION_LIMITS.skuCap.max), default: d.skuCap, unit: 'count',
            label: { tr: `${L.tr}: izlenen SKU tavanı`, en: `${L.en}: tracked SKU cap` },
            help: { tr: 'Bu plandaki bir tenant için buybox\'ı izlenen en fazla barkod sayısı. 0 = izleme kapalı.', en: 'Maximum barcodes whose buybox is tracked for a tenant on this plan. 0 = tracking off.' } },
        { ...base, key: planKey(plan, 'refreshMin'), ...int(COMPETITION_LIMITS.refreshMin.min, COMPETITION_LIMITS.refreshMin.max), default: d.refreshMin, unit: 'min',
            label: { tr: `${L.tr}: tazeleme aralığı`, en: `${L.en}: refresh interval` },
            help: { tr: 'Bir barkodun buybox bilgisi en erken bu kadar dakikada bir yeniden okunur (360 dk = günde 4). Bütçe doluysa okuma ertelenir.', en: 'A barcode is re-read at most this often (360 min = 4 times a day). Deferred when the call budget is exhausted.' } },
        { ...base, key: planKey(plan, 'freshnessMin'), ...int(COMPETITION_LIMITS.freshnessMin.min, COMPETITION_LIMITS.freshnessMin.max), default: d.freshnessMin, unit: 'min',
            label: { tr: `${L.tr}: veri tazelik eşiği`, en: `${L.en}: data freshness threshold` },
            help: { tr: 'Bu süreden eski gözlem ekranda "eski veri" etiketi alır; bildirim ve öneri üretmez.', en: 'Observations older than this are labelled "stale" and do not produce notifications or suggestions.' } },
        { ...base, key: planKey(plan, 'priority'), type: 'enum', schema: z.enum(COMPETITION_PRIORITIES), default: d.priority,
            label: { tr: `${L.tr}: öncelik politikası`, en: `${L.en}: priority policy` },
            help: { tr: 'changed_first: buybox\'ı yeni değişen, sonra stoklu, sonra en eski gözlem. stocked_only: yalnız stoklu SKU. oldest_first: en eski gözlem önce.', en: 'changed_first: recently changed buybox, then in stock, then oldest. stocked_only: in-stock SKUs only. oldest_first: oldest observation first.' } },
    ];
}

export const PRICING_SETTINGS: SettingDef<any>[] = [
    ...COMPETITION_PLANS.flatMap(planSettings),
    { ...base, key: budgetKey('trendyol'), ...int(COMPETITION_LIMITS.budgetPerMin.min, COMPETITION_LIMITS.budgetPerMin.max), default: 60, unit: 'perMin', danger: 'caution',
        label: { tr: 'Trendyol buybox çağrı bütçesi (dakika)', en: 'Trendyol buybox call budget (per minute)' },
        help: { tr: 'Tüm tenant\'lar için dakikada en fazla buybox isteği (istek başına ≤10 barkod). Trendyol sınırı ~1000/dk ve satıcı hesabındaki diğer çağrılarla paylaşılır; güvenli düşük başlangıç 60. Bütçe dolunca tazeleme ertelenir, tenant\'lar arasında sırayla paylaştırılır.', en: 'Maximum buybox requests per minute across all tenants (≤10 barcodes each). Trendyol\'s ~1000/min limit is shared with other calls; safe low start is 60. When exhausted, refreshes are deferred and shared round-robin across tenants.' },
        impact: { tr: 'Yüksek değer pazaryeri kotasını tüketip sipariş/stok çağrılarını yavaşlatabilir.', en: 'A high value can consume the marketplace quota and slow order/stock calls.' } },
    { ...base, key: 'pricing.buybox.notify.shadow', type: 'bool', schema: z.boolean(), default: true,
        label: { tr: '"Buybox kaybedildi" bildirimi gölge modda', en: '"Buybox lost" notification in shadow mode' },
        help: { tr: 'Açıkken olay yalnız deftere yazılır (kullanıcıya gitmez). Gerçek veriyle doğrulama bitince kapatın.', en: 'When on, the event is only written to the ledger (not delivered). Turn off after validation with real data.' } },
];
