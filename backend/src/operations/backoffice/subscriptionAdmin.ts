// Backoffice B4b (plan §2.3): abonelik yönetim işlemleri. SAF: modeller/sağlayıcı/saat enjekte edilir (DB/ağ yok -> birim test).
// ADR-0008: durum geçişlerini sağlayıcı (PaymentProvider) yürütür; buradan Subscriptions'a yalnızca sağlayıcının KANONİK yanıtı yazılır
// (webhook ile aynı alan kümesi). Kartsız deneme uzatma sağlayıcıdan bağımsızdır (sağlayıcıda kayıt yoktur) -> iyimser kilitli tek yazım.
import { ApplicationError } from '@platform/core/errors';
import { logger } from '@platform/core/logger';
import type { PaymentProvider, NormalizedSubscription } from '@services/billing/PaymentProvider';
import { PaymentProviderError } from '@services/billing/PaymentProvider';

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_TRIAL_EXTENSION_DAYS = 30;
/** Sağlayıcıya yazılabilir (aktif) abonelik durumları; `canceled`/`expired` terminaldir. */
const CHANGEABLE: ReadonlyArray<string> = ['trialing', 'active', 'past_due'];
const CANCELABLE: ReadonlyArray<string> = ['trialing', 'active', 'past_due', 'suspended'];

export interface SubscriptionAdminDeps {
    subscriptionModel: any;
    planModel: any;
    billingEventModel: any;
    provider: () => PaymentProvider;
    invalidateEntitlement: (clientId: number) => void;
    now?: () => Date;
}
export interface AdminActorCtx { sub?: string; reason: string; reqId?: string }

const conflict = (m: string, code: string): never => { throw new ApplicationError(m, 409, code); };

async function loadSub(d: SubscriptionAdminDeps, tid: number): Promise<any> {
    const sub: any = await d.subscriptionModel.findOne({ clientId: tid }).lean();
    if (!sub) throw new ApplicationError('Abonelik bulunamadı.', 404, 'SUBSCRIPTION_NOT_FOUND');
    return sub;
}

function requireProviderSub(d: SubscriptionAdminDeps, sub: any): PaymentProvider {
    if (sub.billingExempt === true) conflict('Muaf (legacy) abonelik sağlayıcı üzerinden yönetilmez.', 'SUBSCRIPTION_EXEMPT');
    if (!sub.providerSubscriptionRef) conflict('Bu abonelikte sağlayıcı kaydı yok (kartsız deneme); sağlayıcı işlemi uygulanamaz.', 'NO_PROVIDER_SUBSCRIPTION');
    const p = d.provider();
    if (p.name !== sub.provider) conflict('Abonelik başka bir sağlayıcıya ait; yapılandırılmış sağlayıcıyla yönetilemez.', 'PROVIDER_MISMATCH');
    return p;
}

async function callProvider<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); } catch (e: any) {
        if (e instanceof PaymentProviderError) {
            if (e.code === 'not_found') throw new ApplicationError('Sağlayıcıda abonelik kaydı bulunamadı.', 409, 'PROVIDER_SUBSCRIPTION_MISSING');
            throw new ApplicationError('Sağlayıcı işlemi başarısız.', 502, 'PROVIDER_ERROR');
        }
        throw e;
    }
}

function canonicalSet(c: NormalizedSubscription): Record<string, any> {
    const set: Record<string, any> = { status: c.status, cancelAtPeriodEnd: !!c.cancelAtPeriodEnd };
    if (c.currentPeriodStart) set.currentPeriodStart = c.currentPeriodStart;
    if (c.currentPeriodEnd) set.currentPeriodEnd = c.currentPeriodEnd;
    if (c.providerCustomerRef) set.providerCustomerRef = c.providerCustomerRef;
    if (c.cardLast4) set.cardLast4 = c.cardLast4;
    if (c.cardBrand) set.cardBrand = c.cardBrand;
    return set;
}

async function writeEvent(d: SubscriptionAdminDeps, now: Date, clientId: number, type: string, key: string, payload: Record<string, any>, ctx: AdminActorCtx): Promise<void> {
    try {
        await d.billingEventModel.create({
            provider: 'system', providerEventId: key, type, clientId, receivedAt: now, processedAt: now, status: 'processed',
            payloadRedacted: { ...payload, actor: ctx.sub ?? null, reason: ctx.reason.slice(0, 500) },
        });
    } catch (e: any) {
        // Yarış/yinelenen anahtar ya da yazım hatası: geçiş zaten uygulandı; denetim `backoffice.write` (RunOperation) ayrıca yazar.
        logger.warn('[subscriptionAdmin] BillingEvent yazılamadı: ' + (e?.message ?? 'unknown'));
    }
}

const nowOf = (d: SubscriptionAdminDeps): Date => (d.now ?? (() => new Date()))();
const matched = (res: any): boolean => !!res && (res.matchedCount ?? res.n ?? 0) > 0;

export async function extendTrial(d: SubscriptionAdminDeps, input: { tid: number; days: number }, ctx: AdminActorCtx): Promise<any> {
    const days = input.days;
    if (!Number.isInteger(days) || days < 1 || days > MAX_TRIAL_EXTENSION_DAYS) throw new ApplicationError(`days: 1-${MAX_TRIAL_EXTENSION_DAYS} arası tam sayı olmalı`, 400, 'VALIDATION');
    const now = nowOf(d);
    const sub = await loadSub(d, input.tid);
    if (sub.billingExempt === true) conflict('Muaf (legacy) abonelikte deneme uzatılamaz.', 'SUBSCRIPTION_EXEMPT');
    if (sub.status !== 'trialing' || !sub.trialEndsAt) conflict('Yalnızca süren (trialing) deneme uzatılabilir.', 'TRIAL_NOT_ACTIVE');
    const prev = new Date(sub.trialEndsAt);
    const base = prev.getTime() > now.getTime() ? prev : now;
    const next = new Date(base.getTime() + days * DAY_MS);
    // İyimser kilit: aynı `trialEndsAt` + hâlâ trialing (TrialExpiryJob ya da başka admin araya girdiyse eşleşmez).
    const res: any = await d.subscriptionModel.updateOne(
        { clientId: input.tid, status: 'trialing', billingExempt: { $ne: true }, trialEndsAt: sub.trialEndsAt },
        { $set: { trialEndsAt: next, currentPeriodEnd: next } },
    );
    if (!matched(res)) conflict('Abonelik eş zamanlı değişti; yeniden deneyin.', 'SUBSCRIPTION_CHANGED');
    d.invalidateEntitlement(input.tid);
    await writeEvent(d, now, input.tid, 'subscription.trial_extended', `trial-extended:${input.tid}:${next.getTime()}`, { from: prev.toISOString(), to: next.toISOString(), days }, ctx);
    return { tid: input.tid, status: 'trialing', trialEndsAt: next, previousTrialEndsAt: prev, extendedDays: days };
}

export async function cancelSubscription(d: SubscriptionAdminDeps, input: { tid: number; atPeriodEnd: boolean }, ctx: AdminActorCtx): Promise<any> {
    const now = nowOf(d);
    const sub = await loadSub(d, input.tid);
    if (!CANCELABLE.includes(sub.status)) conflict(`Abonelik '${sub.status}' durumunda; iptal edilemez.`, 'SUBSCRIPTION_NOT_CANCELABLE');
    const provider = requireProviderSub(d, sub);
    const canonical = await callProvider(() => provider.cancel(sub.providerSubscriptionRef, input.atPeriodEnd));
    const res: any = await d.subscriptionModel.updateOne({ clientId: input.tid, status: sub.status, providerSubscriptionRef: sub.providerSubscriptionRef }, { $set: canonicalSet(canonical) });
    if (!matched(res)) conflict('Abonelik eş zamanlı değişti; durumu yenileyip kontrol edin.', 'SUBSCRIPTION_CHANGED');
    d.invalidateEntitlement(input.tid);
    await writeEvent(d, now, input.tid, 'subscription.admin_canceled', `admin-cancel:${input.tid}:${ctx.reqId ?? now.getTime()}`, { from: sub.status, to: canonical.status, atPeriodEnd: input.atPeriodEnd }, ctx);
    return { tid: input.tid, status: canonical.status, cancelAtPeriodEnd: !!canonical.cancelAtPeriodEnd, currentPeriodEnd: canonical.currentPeriodEnd ?? null };
}

export async function changePlan(d: SubscriptionAdminDeps, input: { tid: number; planCode: string }, ctx: AdminActorCtx): Promise<any> {
    const now = nowOf(d);
    const sub = await loadSub(d, input.tid);
    if (!CHANGEABLE.includes(sub.status)) conflict(`Abonelik '${sub.status}' durumunda; plan değiştirilemez.`, 'SUBSCRIPTION_NOT_CHANGEABLE');
    if (sub.planCode === input.planCode) conflict('Abonelik zaten bu planda.', 'SAME_PLAN');
    const plan: any = await d.planModel.findOne({ code: input.planCode, active: true }).lean();
    if (!plan) throw new ApplicationError('Plan bulunamadı ya da satışa kapalı.', 404, 'PLAN_NOT_FOUND');
    if (!(typeof plan.priceMinor === 'number' && plan.priceMinor > 0)) conflict('Bu plan özel teklif gerektirir; sağlayıcı üzerinden değiştirilemez.', 'PLAN_REQUIRES_QUOTE');
    const provider = requireProviderSub(d, sub);
    const canonical = await callProvider(() => provider.changePlan(sub.providerSubscriptionRef, input.planCode));
    const set = { ...canonicalSet(canonical), planCode: canonical.planCode, planVersion: plan.version };
    const res: any = await d.subscriptionModel.updateOne({ clientId: input.tid, status: sub.status, providerSubscriptionRef: sub.providerSubscriptionRef }, { $set: set });
    if (!matched(res)) conflict('Abonelik eş zamanlı değişti; durumu yenileyip kontrol edin.', 'SUBSCRIPTION_CHANGED');
    d.invalidateEntitlement(input.tid);
    await writeEvent(d, now, input.tid, 'subscription.admin_plan_changed', `admin-plan:${input.tid}:${ctx.reqId ?? now.getTime()}`, { fromPlan: sub.planCode, toPlan: canonical.planCode }, ctx);
    return { tid: input.tid, status: canonical.status, planCode: canonical.planCode, planVersion: plan.version };
}
