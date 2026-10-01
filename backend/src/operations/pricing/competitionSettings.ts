// PRC-CFG (K57-S5): rekabet modülü ayarlarının TEK çözümleme noktası. Plan varsayılanı `_platform` kataloğundan
// (`integration/config/catalog/pricing.ts`, 15 sn yayılım, yeniden başlatma yok) + tenant istisnası (`Subscriptions.limitOverrides.competition`).
// Saf çözümleyici (`resolveCompetitionSettings`) test edilir; yükleyiciler yalnız okuma yapar.
import { z } from 'zod';
import { getPlatformSetting } from '@integration/config/platformSettings';
import {
    budgetKey, BUYBOX_LOST_COOLDOWN_HOURS, COMPETITION_LIMITS, COMPETITION_PLANS, COMPETITION_PLAN_DEFAULTS, COMPETITION_PRIORITIES, planKey,
    type CompetitionPlan, type CompetitionPriority,
} from '@integration/config/catalog/pricing';

export type SettingReader = (key: string) => unknown;
const defaultReader: SettingReader = (key) => getPlatformSetting(key);

export interface CompetitionOverride { skuCap?: number; refreshMin?: number; freshnessMin?: number; priority?: CompetitionPriority }
type Field = keyof CompetitionOverride;
const FIELDS: readonly Field[] = ['skuCap', 'refreshMin', 'freshnessMin', 'priority'];

export interface EffectiveCompetitionSettings {
    /** Ayarın çözüldüğü plan (katalogda olmayan kod -> `starter`; faturalamadan muaf -> `growth`). */
    plan: CompetitionPlan;
    planCode: string | null;
    skuCap: number;
    refreshMin: number;
    freshnessMin: number;
    priority: CompetitionPriority;
    /** Alan başına kaynak: `plan` (katalog/yayın) ya da `tenant` (abonelik istisnası). */
    sources: Record<Field, 'plan' | 'tenant'>;
}

/** Tenant istisnası gövde şeması (backoffice yazma + okuma savunması AYNI sınırlar). Boş nesne = istisna yok. */
export const competitionOverrideSchema = z.object({
    skuCap: z.number().int().min(COMPETITION_LIMITS.skuCap.min).max(COMPETITION_LIMITS.skuCap.max).optional(),
    refreshMin: z.number().int().min(COMPETITION_LIMITS.refreshMin.min).max(COMPETITION_LIMITS.refreshMin.max).optional(),
    freshnessMin: z.number().int().min(COMPETITION_LIMITS.freshnessMin.min).max(COMPETITION_LIMITS.freshnessMin.max).optional(),
    priority: z.enum(COMPETITION_PRIORITIES).optional(),
}).strict();

/** Faturalamadan muaf (legacy) tenant'lar Büyüme varsayılanını alır (Otopilot `EXEMPT_TIER` ile aynı yaklaşım: kısıtlanmaz ama sınırsız değil). */
export function competitionPlanFor(planCode: string | null | undefined, billingExempt = false): CompetitionPlan {
    if (planCode && (COMPETITION_PLANS as readonly string[]).includes(planCode)) return planCode as CompetitionPlan;
    return billingExempt ? 'growth' : 'starter';
}

/** Bir planın yayınlanmış (yoksa katalog) varsayılanları. */
export function readPlanDefaults(plan: CompetitionPlan, read: SettingReader = defaultReader): Omit<EffectiveCompetitionSettings, 'plan' | 'planCode' | 'sources'> {
    const d = COMPETITION_PLAN_DEFAULTS[plan];
    const int = (k: string, fb: number) => { const v = read(k); return typeof v === 'number' && Number.isInteger(v) ? v : fb; };
    const pr = read(planKey(plan, 'priority'));
    return {
        skuCap: int(planKey(plan, 'skuCap'), d.skuCap),
        refreshMin: int(planKey(plan, 'refreshMin'), d.refreshMin),
        freshnessMin: int(planKey(plan, 'freshnessMin'), d.freshnessMin),
        priority: (COMPETITION_PRIORITIES as readonly string[]).includes(pr as string) ? pr as CompetitionPriority : d.priority,
    };
}

/** Saf: plan varsayılanı + (geçerliyse) tenant istisnası. Geçersiz istisna alanı yok sayılır (savunma; yazma yolu zaten doğrular). */
export function resolveCompetitionSettings(
    input: { planCode?: string | null; billingExempt?: boolean; override?: unknown },
    read: SettingReader = defaultReader,
): EffectiveCompetitionSettings {
    const plan = competitionPlanFor(input.planCode, input.billingExempt);
    const base = readPlanDefaults(plan, read);
    const out: EffectiveCompetitionSettings = {
        plan, planCode: input.planCode ?? null, ...base,
        sources: { skuCap: 'plan', refreshMin: 'plan', freshnessMin: 'plan', priority: 'plan' },
    };
    const raw = (input.override && typeof input.override === 'object') ? input.override as Record<string, unknown> : {};
    for (const f of FIELDS) {
        if (raw[f] === undefined || raw[f] === null) continue;
        const one = competitionOverrideSchema.pick({ [f]: true } as any).safeParse({ [f]: raw[f] });
        if (!one.success) continue;
        (out as any)[f] = (one.data as any)[f];
        out.sources[f] = 'tenant';
    }
    return out;
}

/** Kanal başına global çağrı bütçesi (dakikada istek). Katalogda tanımsız kanal -> 0 (çağrı yapılmaz). */
export function channelBudgetPerMin(channel: string, read: SettingReader = defaultReader): number {
    try {
        const v = read(budgetKey(channel));
        return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0;
    } catch {
        return 0;
    }
}

export function notifyShadow(read: SettingReader = defaultReader): boolean {
    return read('pricing.buybox.notify.shadow') !== false;
}

export function notifyCooldownMs(): number {
    return BUYBOX_LOST_COOLDOWN_HOURS * 3600_000;
}

/** Abonelik satırı (ApplicationDB.Subscriptions, yalın) -> etkin ayar. */
export interface SubscriptionCompetitionRow { clientId: number; planCode?: string | null; billingExempt?: boolean; limitOverrides?: { competition?: unknown } | null }

export function settingsFromSubscription(row: SubscriptionCompetitionRow | null | undefined, read: SettingReader = defaultReader): EffectiveCompetitionSettings {
    return resolveCompetitionSettings({ planCode: row?.planCode ?? null, billingExempt: !!row?.billingExempt, override: row?.limitOverrides?.competition }, read);
}

export const SUBSCRIPTION_COMPETITION_PROJECTION = { clientId: 1, planCode: 1, billingExempt: 1, 'limitOverrides.competition': 1 } as const;

/** Tek tenant için etkin ayar (istek başına 1 okuma; önbellek yok — backoffice değişikliği bir sonraki istekte etkili). */
export async function loadCompetitionSettings(applicationDB: any, tid: number, read: SettingReader = defaultReader): Promise<EffectiveCompetitionSettings> {
    const row = await applicationDB.getSubscriptionModel().findOne({ clientId: tid }, SUBSCRIPTION_COMPETITION_PROJECTION).lean();
    return settingsFromSubscription(row as any, read);
}
