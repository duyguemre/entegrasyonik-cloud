// K46 / CHAT-ENT-1 / ADR-0008: Otopilot plan yetkisi icin TEK kontrol noktasi (sohbet VE MCP ayni fonksiyonlari kullanir -- ADR-0035: kota ortaktir).
//  - `limited`: sohbetle sorgulama + rapor + onayli oneri; dusuk gunluk onayli-yazma-eylemi kotasi; otonom/zamanlanmis ajan YOK.
//  - `full`: yuksek kota + otonom/zamanlanmis ajanlar (kanca: `autonomousAllowed` bayragi; zamanlayici henuz yok).
// Yetki gercek abonelikten cozulur (`EntitlementService.getPlanInfo`: 60 sn onbellek, plan degisince `invalidate` ile aninda): plan kodu -> katman
// KATALOGU asagidadir (tek kaynak; seed/site degismez). Kota degerleri de bu katalogdadir. Yapay zeka maliyeti BYOK'tur; kota SUNUCU korumasi/plan farkidir.
// `ENTITLEMENT_GUARD_ENABLED` kapaliyken bugunku davranis korunur: herkes `full`.
import { config } from '@config';
import { AppError } from '@platform/core/errors';
import { logger } from '@platform/core/logger';
import { EntitlementService } from '@services/billing/EntitlementService';
import { dayKeyInZone } from '@utils/timeZone';
import { getPlatformSetting } from '@integration/config/platformSettings';
import { SUGGESTION_BULK_QUOTA_KEY } from '@integration/config/catalog/pricing';
import type { AgentKv } from './kv';

const log = logger.child({ module: 'agent.entitlement' });

export type AgentTier = 'limited' | 'full';

export interface AgentEntitlement {
    tier: AgentTier;
    /** Gunluk onayli yazma eylemi (PendingAction yurutme) ust siniri. */
    dailyActionQuota: number;
    /** Otonom/zamanlanmis ajan yetkisi (simdilik yalniz bayrak; zamanlayici baglanmadi). */
    autonomousAllowed: boolean;
}

/** Plan kodu -> katman KATALOGU (`plans.seed.json` kodlariyla ayni). Katalogda olmayan kod `limited`'dir (kisitlayici varsayilan). */
export const AGENT_TIER_BY_PLAN: Readonly<Record<string, AgentTier>> = { starter: 'limited', growth: 'full', enterprise: 'full' };
/** Faturalamadan muaf (legacy) tenant'lar: kisitlanmaz. */
const EXEMPT_TIER: AgentTier = 'full';

/** Gunluk kota degerleri: TEK kaynak (sohbet + MCP). */
export const DAILY_ACTION_QUOTA: Readonly<Record<AgentTier, number>> = { limited: 25, full: 500 };

export const entitlementFor = (tier: AgentTier): AgentEntitlement => ({ tier, dailyActionQuota: DAILY_ACTION_QUOTA[tier], autonomousAllowed: tier === 'full' });

/** TEK kontrol noktasi. Guard kapaliysa `full`; abonelik/plan okunamazsa kisitlayici `limited` (hata sizdirilmaz). */
export async function resolveAgentEntitlement(tid: number): Promise<AgentEntitlement> {
    if (!config.flags.entitlementGuardEnabled) return entitlementFor('full');
    try {
        const info = await EntitlementService.getPlanInfo(tid);
        if (info.billingExempt) return entitlementFor(EXEMPT_TIER);
        return entitlementFor((info.planCode && AGENT_TIER_BY_PLAN[info.planCode]) || 'limited');
    } catch (e) {
        log.warn({ err: e }, 'Ajan yetkisi cozulemedi; limited uygulanir');
        return entitlementFor('limited');
    }
}

export interface QuotaResult { allowed: boolean; used: number; limit: number }

/**
 * Bir onayli yazma eylemi icin gunluk sayaci artirir (Europe/Istanbul gunu; 48 sa TTL). `allowed=false` -> yurutme reddedilir.
 * SOHBET (`/agent/confirm`) ve MCP (`/mcp/approvals/:id`) AYNI sayaci (`agent:quota:{tid}:{gun}`) kullanir.
 */
export async function consumeActionQuota(kv: AgentKv, tid: number, ent: AgentEntitlement, now: Date = new Date(), cost = 1): Promise<QuotaResult> {
    const key = `agent:quota:${tid}:${dayKeyInZone(now)}`;
    const used = cost === 1 ? await kv.incr(key, 48 * 3600) : await kv.incrBy(key, Math.max(1, Math.trunc(cost)), 48 * 3600);
    return { allowed: used <= ent.dailyActionQuota, used, limit: ent.dailyActionQuota };
}

/**
 * Bir onayin kotadan kac eylem dusurdugu. Varsayilan 1. PRC-R2 / PRC-OPEN S6 (ACIK KARAR): `pricing.suggestions.apply` toplu onayi
 * `pricing.suggestions.bulkApplyQuota` ayarina gore 1 (`per_approval`, varsayilan) ya da oneri sayisi (`per_item`).
 */
export function actionQuotaCost(capId: string, input: unknown, read: (key: string) => unknown = readSetting): number {
    if (capId !== 'pricing.suggestions.apply') return 1;
    const n = Array.isArray((input as any)?.suggestionIds) ? (input as any).suggestionIds.length : 1;
    return read(SUGGESTION_BULK_QUOTA_KEY) === 'per_item' ? Math.max(1, n) : 1;
}
function readSetting(key: string): unknown {
    try { return getPlatformSetting(key); } catch { return undefined; }
}

/** Sayaci ARTIRMADAN kalan hakka bakar (MCP: yazma araci cagrisinda kota doluysa onay kaydi acmadan erken ve anlasilir hata). */
export async function peekActionQuota(kv: AgentKv, tid: number, ent: AgentEntitlement, now: Date = new Date()): Promise<QuotaResult> {
    const used = Number(await kv.get(`agent:quota:${tid}:${dayKeyInZone(now)}`)) || 0;
    return { allowed: used < ent.dailyActionQuota, used, limit: ent.dailyActionQuota };
}

/** Yukseltme baglantisi (abonelik ekrani); PUBLIC_APP_URL yoksa gorece yol. */
export function upgradeUrl(): string {
    const base = (config.mail.publicAppUrl ?? '').trim().replace(/\/+$/, '');
    return `${base}/subscription`;
}

/** Kota asimi hatasi: anlasilir ileti + `details.upgradeUrl` (yalniz `limited` katmaninda yukseltme ipucu anlamlidir). `ErrorEnvelope` `upgradeUrl`'i yanita tasir. */
export function quotaExceededError(ent: AgentEntitlement): AppError {
    const message = ent.tier === 'limited'
        ? `Günlük onaylı eylem kotanız (${ent.dailyActionQuota}) doldu. Yarın yeniden deneyin, işlemi ekrandan yapın ya da planınızı yükseltin.`
        : `Günlük onaylı eylem kotanız (${ent.dailyActionQuota}) doldu. Yarın yeniden deneyin ya da işlemi ekrandan yapın.`;
    return AppError.of('QUOTA_EXCEEDED', { message, details: { upgradeUrl: upgradeUrl(), tier: ent.tier, limit: ent.dailyActionQuota } });
}
