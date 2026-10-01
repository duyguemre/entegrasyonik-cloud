/** Sahte BackofficeBillingService (B4a/b/c) + BackofficeTenantService yaşam döngüsü (B2). Tutarlar kuruş; kart yalnız maskeli. */
import { TRIAL_EXTENSION_MAX_DAYS, TRIAL_EXTENSION_MAX_TOTAL_DAYS } from '../../contracts/billing'
import type { BillingEventRow, PlanSummary, SubscriptionRow, SubscriptionStatus, TenantLifecycle, TenantStatus } from '../../contract'
import { MockHttpError } from '../errors'
import { DAY, HOUR, MIN, UNHANDLED, conflict, hex24, iso, liveReadonly, notFound, page, strict, tenantName, validation, type MockCtx, type MockDomain } from './context'

/** backend/src/database/application/seed/plans.seed.json ile aynı kodlar/fiyatlar (liste fiyatı). */
export const MOCK_PLANS: PlanSummary[] = [
  { code: 'starter', name: 'Başlangıç', priceMinor: 249_000, currency: 'TRY', interval: 'month', vatIncluded: false, limits: { channels: 2, skus: 5000, users: 3, mcpCallsPerDay: 500 }, features: [] },
  { code: 'growth', name: 'Büyüme', priceMinor: 599_000, currency: 'TRY', interval: 'month', vatIncluded: false, limits: { channels: 5, skus: 25_000, users: 10, mcpCallsPerDay: 2000 }, features: ['erp', 'einvoice', 'shipping'] },
  { code: 'enterprise', name: 'Kurumsal', priceMinor: 0, currency: 'TRY', interval: 'month', vatIncluded: false, limits: { channels: 20, skus: 250_000, users: 50, mcpCallsPerDay: 20_000 }, features: ['erp', 'einvoice', 'shipping'] },
]

/** 12 örnek tenant (101..112) — sıra data.ts buildClients ile aynı. */
const SEEDS: Array<{ status: SubscriptionStatus; plan: string; exempt?: boolean; card?: boolean; atEnd?: boolean; tenant: TenantStatus; failedStep?: string }> = [
  { status: 'active', plan: 'growth', card: true, tenant: 'ACTIVE' },
  { status: 'active', plan: 'enterprise', card: true, tenant: 'ACTIVE' },
  { status: 'trialing', plan: 'starter', tenant: 'ACTIVE' },
  { status: 'active', plan: 'growth', exempt: true, tenant: 'ACTIVE' },
  { status: 'past_due', plan: 'starter', card: true, tenant: 'ACTIVE' },
  { status: 'active', plan: 'growth', card: true, atEnd: true, tenant: 'ACTIVE' },
  { status: 'active', plan: 'growth', card: true, tenant: 'ACTIVE' },
  { status: 'trialing', plan: 'starter', tenant: 'PROVISIONING_FAILED', failedStep: 'tenant-user' },
  { status: 'suspended', plan: 'starter', tenant: 'ACTIVE' },
  { status: 'active', plan: 'starter', card: true, tenant: 'ACTIVE' },
  { status: 'canceled', plan: 'starter', card: true, tenant: 'DELETION_PENDING' },
  { status: 'active', plan: 'growth', card: true, tenant: 'ACTIVE' },
]
const STEPS = ['client', 'order-limit', 'central-user', 'tenant-seed', 'tenant-user', 'subscription', 'activate'] as const
const BRANDS = ['visa', 'mastercard', 'troy']

export function createBillingMock(t0: number): MockDomain {
  const monthStart = new Date(t0)
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const nextMonth = new Date(monthStart)
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)

  const subs: SubscriptionRow[] = SEEDS.map((s, i) => {
    const tid = 101 + i
    const created = t0 - (30 + i * 23) * DAY
    return {
      tid,
      tenantName: null,
      planCode: s.plan,
      planVersion: 1,
      status: s.status,
      trialEndsAt: s.status === 'trialing' ? iso(t0 + (3 + i) * DAY) : s.status === 'suspended' ? iso(t0 - 6 * DAY) : null,
      currentPeriodStart: s.card ? iso(monthStart.getTime()) : null,
      currentPeriodEnd: s.card ? iso(nextMonth.getTime()) : null,
      cancelAtPeriodEnd: !!s.atEnd,
      graceUntil: s.status === 'past_due' ? iso(t0 + 4 * DAY) : null,
      billingExempt: !!s.exempt,
      provider: 'mock',
      hasProviderRef: !!s.card,
      cardLast4: s.card ? String(4242 + i * 111).slice(-4) : null,
      cardBrand: s.card ? BRANDS[i % BRANDS.length] : null,
      createdAt: iso(created),
      updatedAt: iso(s.status === 'canceled' ? t0 - 9 * DAY : t0 - (i + 1) * DAY),
    }
  })
  // En yeni önce (`_id` azalan ≈ createdAt azalan).
  subs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))

  const events = new Map<number, BillingEventRow[]>()
  for (const s of subs) {
    const list: BillingEventRow[] = []
    const push = (msAgo: number, provider: string, type: string, status: string, payload: Record<string, unknown> | null, failureReason: string | null = null) =>
      list.push({ id: hex24(s.tid * 100 + list.length), at: iso(t0 - msAgo), provider, type, status, failureReason, payload })
    if (s.hasProviderRef) {
      push(2 * DAY + s.tid * MIN, 'mock', 'payment.succeeded', 'processed', { planCode: s.planCode, period: 'month' })
      push(32 * DAY + s.tid * MIN, 'mock', 'payment.succeeded', 'processed', { planCode: s.planCode, period: 'month' })
    }
    if (s.status === 'past_due') push(20 * HOUR, 'mock', 'payment.failed', 'processed', { attempt: 2 }, 'card_declined')
    if (s.status === 'suspended') push(6 * DAY, 'system', 'subscription.trial_expired', 'processed', { actor: null })
    if (s.status === 'canceled') push(9 * DAY, 'system', 'subscription.admin_canceled', 'processed', { atPeriodEnd: false, actor: hex24(5001), reason: 'Müşteri talebi (destek kaydı #örnek)' })
    push(Date.parse(iso(t0)) - Date.parse(s.createdAt), 'system', 'subscription.created', 'processed', { planCode: s.planCode })
    list.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    events.set(s.tid, list)
  }

  // K40: bir abonelikte toplam deneme uzatması (Subscriptions.trialExtensionDays). 103 (süren deneme) 45 gün kullanmış → kalan 15 (sınır senaryosu).
  const extensionUsed = new Map<number, number>([[103, 45]])
  for (const [tid, used] of extensionUsed) {
    events.get(tid)?.unshift({ id: hex24(tid * 100 + 90), at: iso(t0 - 2 * DAY), provider: 'system', type: 'subscription.trial_extended', status: 'processed', failureReason: null, payload: { days: 15, totalExtensionDays: used, reopened: false, actor: hex24(5001), reason: 'Entegrasyon kurulumu için ek süre (örnek)' } })
  }

  const deletion = new Map<number, { requestedAt: number; scheduledAt: number }>([[111, { requestedAt: t0 - 9 * DAY, scheduledAt: t0 + 5 * DAY }]])
  const tenantStatus = new Map<number, TenantStatus>(SEEDS.map((s, i) => [101 + i, s.tenant]))

  function withName(s: SubscriptionRow, ctx: MockCtx): SubscriptionRow {
    return { ...s, tenantName: tenantName(ctx, s.tid) }
  }
  function sub(tid: unknown) {
    const n = Number(tid)
    if (!Number.isInteger(n) || n < 1) throw validation('tid', 'pozitif tam sayı')
    const s = subs.find((x) => x.tid === n)
    if (!s) throw notFound('Abonelik bulunamadı.', 'SUBSCRIPTION_NOT_FOUND')
    return s
  }
  function systemEvent(s: SubscriptionRow, type: string, payload: Record<string, unknown>, ctx: MockCtx, reason: string) {
    events.get(s.tid)!.unshift({ id: hex24(ctx.now % 1e9), at: iso(ctx.now), provider: 'system', type, status: 'processed', failureReason: null, payload: { ...payload, actor: hex24(5001), reason } })
    s.updatedAt = iso(ctx.now)
  }

  function revenue(range: string, ctx: MockCtx) {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
    const from = ctx.now - days * DAY
    const priced = subs.filter((s) => !s.billingExempt)
    const paying = priced.filter((s) => s.status === 'active' || s.status === 'past_due')
    const byPlan = MOCK_PLANS.filter((p) => p.priceMinor > 0)
      .map((p) => {
        const n = paying.filter((s) => s.planCode === p.code).length
        const monthly = p.interval === 'year' ? Math.round(p.priceMinor / 12) : p.priceMinor
        return { planCode: p.code, subscriptions: n, monthlyMinor: monthly, currency: p.currency, mrrMinor: n * monthly }
      })
      .filter((x) => x.subscriptions > 0)
    const quote = paying.filter((s) => MOCK_PLANS.find((p) => p.code === s.planCode)?.priceMinor === 0).length
    const dist = { trialing: 0, active: 0, past_due: 0, suspended: 0, canceled: 0, expired: 0 } as Record<SubscriptionStatus, number>
    for (const s of priced) dist[s.status]++
    const cohort = priced.filter((s) => Date.parse(s.createdAt) >= from)
    const converted = cohort.filter((s) => s.hasProviderRef && ['active', 'past_due', 'canceled'].includes(s.status)).length
    const lost = priced.filter((s) => (s.status === 'canceled' || s.status === 'expired') && Date.parse(s.updatedAt) >= from)
    const lostMrr = lost.reduce((sum, s) => sum + (MOCK_PLANS.find((p) => p.code === s.planCode)?.priceMinor ?? 0), 0)
    const payEvents = [...events.values()].flat().filter((e) => Date.parse(e.at) >= from)
    return {
      range, from: iso(from), to: iso(ctx.now),
      mrr: {
        byCurrency: byPlan.length ? { TRY: byPlan.reduce((sum, p) => sum + p.mrrMinor, 0) } : {},
        byPlan,
        billedSubscriptions: paying.length - quote,
        quoteBasedSubscriptions: quote,
        unpricedSubscriptions: 0,
      },
      statusDistribution: dist,
      exemptSubscriptions: subs.length - priced.length,
      trialConversion: { cohort: cohort.length, converted, rate: cohort.length ? converted / cohort.length : null },
      churn: { count: lost.length, mrrLostByCurrency: lost.length ? { TRY: lostMrr } : {}, rate: paying.length + lost.length ? lost.length / (paying.length + lost.length) : null },
      paymentEvents: { succeeded: payEvents.filter((e) => e.type === 'payment.succeeded').length, failed: payEvents.filter((e) => e.type === 'payment.failed').length },
    }
  }

  function lifecycle(tid: number, ctx: MockCtx): TenantLifecycle {
    const client = ctx.clients.find((c) => c.clientId === tid)
    if (!client) throw notFound()
    const status = tenantStatus.get(tid) ?? 'ACTIVE'
    const seed = SEEDS[tid - 101]
    const s = subs.find((x) => x.tid === tid)
    const d = deletion.get(tid)
    const failedIdx = seed?.failedStep ? STEPS.indexOf(seed.failedStep as (typeof STEPS)[number]) : -1
    const steps = STEPS.map((step, i) => ({
      step,
      state: (status === 'PROVISIONING' ? 'pending' : failedIdx < 0 ? 'done' : i < failedIdx ? 'done' : i === failedIdx ? 'failed' : 'pending') as 'done' | 'failed' | 'pending',
    }))
    const ev = (minutesAgo: number, event: string, result: 'ok' | 'fail' | 'error', actorType: string, surface: string, imp = false) => ({ at: iso(ctx.t0 - minutesAgo * MIN), event, result, actorType, surface, imp })
    const recent = [
      ...(d && status === 'DELETION_PENDING' ? [ev(9 * 24 * 60, 'tenant.deletion.requested', 'ok', 'user', 'app')] : []),
      ev(75 + tid, 'app.write', 'ok', 'user', 'app'),
      // K41 örneği: 101'de 12 dk önce açılmış, süren bir destek oturumu (30 dk → ~18 dk kaldı).
      ...(tid === 101 ? [ev(12, 'impersonation.redeem', 'ok', 'impersonator', 'app', true), ev(9, 'impersonation.request', 'ok', 'impersonator', 'app', true)] : []),
      ev(140 + tid, 'impersonation.redeem', 'ok', 'impersonator', 'app', true),
      ev(141 + tid, 'impersonation.request', 'ok', 'impersonator', 'app', true),
      ev(600 + tid * 3, 'login', 'ok', 'user', 'app'),
      ev(1500 + tid, 'app.write', tid % 4 ? 'ok' : 'error', 'user', 'app'),
    ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 10)
    return {
      tid,
      status,
      name: client.title,
      lastSuccessfulOrderSync: client.lastSuccessfulOrderSync ?? null,
      trial: s ? {
        subscriptionStatus: s.status,
        planCode: s.planCode,
        trialEndsAt: s.trialEndsAt,
        daysLeft: s.status === 'trialing' && s.trialEndsAt ? Math.max(0, Math.ceil((Date.parse(s.trialEndsAt) - ctx.now) / DAY)) : null,
        billingExempt: s.billingExempt,
      } : null,
      deletion: d ? {
        requestedAt: iso(d.requestedAt),
        requestedBy: hex24(4242),
        scheduledAt: iso(d.scheduledAt),
        daysUntilPurge: status === 'DELETION_PENDING' ? Math.max(0, Math.ceil((d.scheduledAt - ctx.now) / DAY)) : null,
        canCancel: status === 'DELETION_PENDING',
        purgedAt: null,
        purgeFailedStep: null,
      } : null,
      provisioning: {
        steps,
        startedAt: failedIdx >= 0 ? client.createdAt : null,
        failedAt: failedIdx >= 0 ? iso(Date.parse(client.createdAt) + 40_000) : null,
        failedStep: failedIdx >= 0 ? STEPS[failedIdx] : null,
      },
      recentEvents: recent,
    }
  }

  return {
    handle(op, body, ctx) {
      switch (op) {
        case 'BackofficeBillingService/listSubscriptions': {
          strict(body, ['status', 'planCode', 'cursor', 'limit'])
          if (body.status !== undefined && !['trialing', 'active', 'past_due', 'suspended', 'canceled', 'expired'].includes(String(body.status))) throw validation('status', 'bilinmeyen durum')
          const list = subs.filter((s) => (!body.status || s.status === body.status) && (!body.planCode || s.planCode === body.planCode))
          const res = page(list, body)
          return { items: res.items.map((s) => withName(s, ctx)), nextCursor: res.nextCursor }
        }
        case 'BackofficeBillingService/getSubscription': {
          strict(body, ['tid'])
          const s = sub(body.tid)
          return { subscription: { ...withName(s, ctx), plan: MOCK_PLANS.find((p) => p.code === s.planCode) ?? null }, events: events.get(s.tid)!.slice(0, 50) }
        }
        case 'BackofficeBillingService/extendTrial': {
          strict(body, ['tid', 'days', 'reason'])
          const days = Number(body.days)
          if (!Number.isInteger(days) || days < 1 || days > TRIAL_EXTENSION_MAX_DAYS) throw validation('days', `1..${TRIAL_EXTENSION_MAX_DAYS}`)
          const s = sub(body.tid)
          if (s.billingExempt) throw conflict('SUBSCRIPTION_EXEMPT', 'Muaf (legacy) abonelikte deneme uzatılamaz.')
          // K40: denemesi bitip askıya alınmış kartsız abonelik uzatmayla yeniden `trialing` olur.
          const reopen = s.status === 'suspended' && !s.hasProviderRef && !!s.trialEndsAt
          if ((s.status !== 'trialing' && !reopen) || !s.trialEndsAt) throw conflict('TRIAL_NOT_ACTIVE', 'Yalnızca süren (trialing) ya da denemesi bitip askıya alınmış (kartsız) abonelik uzatılabilir.')
          const used = extensionUsed.get(s.tid) ?? 0
          const remaining = Math.max(0, TRIAL_EXTENSION_MAX_TOTAL_DAYS - used)
          if (days > remaining) {
            throw new MockHttpError(409, 'TRIAL_EXTENSION_LIMIT', `Toplam deneme uzatma sınırı ${TRIAL_EXTENSION_MAX_TOTAL_DAYS} gün; kalan ${remaining} gün.`, undefined, {
              remainingDays: remaining,
              usedDays: used,
              maxTotalDays: TRIAL_EXTENSION_MAX_TOTAL_DAYS,
            })
          }
          const prev = s.trialEndsAt
          s.trialEndsAt = iso(Math.max(Date.parse(prev), ctx.now) + days * DAY)
          s.status = 'trialing'
          extensionUsed.set(s.tid, used + days)
          systemEvent(s, 'subscription.trial_extended', { days, reopened: reopen, totalExtensionDays: used + days }, ctx, String(body.reason))
          return {
            tid: s.tid, status: 'trialing', trialEndsAt: s.trialEndsAt, previousTrialEndsAt: prev, extendedDays: days,
            totalExtensionDays: used + days, remainingExtensionDays: remaining - days, reopened: reopen,
          }
        }
        case 'BackofficeBillingService/cancelSubscription': {
          strict(body, ['tid', 'atPeriodEnd', 'reason'])
          if (typeof body.atPeriodEnd !== 'boolean') throw validation('atPeriodEnd', 'boolean')
          const s = sub(body.tid)
          if (s.status === 'canceled' || s.status === 'expired') throw conflict('SUBSCRIPTION_NOT_CANCELABLE', `Abonelik '${s.status}' durumunda; iptal edilemez.`)
          // K40: sağlayıcı kaydı olmayan (kartsız deneme/askı) abonelik → sağlayıcı çağrılmadan YEREL ve doğrudan iptal; LIVE_READONLY etkilemez.
          if (!s.billingExempt && !s.hasProviderRef) {
            s.status = 'canceled'
            s.cancelAtPeriodEnd = false
            systemEvent(s, 'subscription.admin_canceled', { atPeriodEnd: false, local: true }, ctx, String(body.reason))
            return { tid: s.tid, status: s.status, cancelAtPeriodEnd: false, currentPeriodEnd: s.currentPeriodEnd, external: false }
          }
          if (ctx.liveReadonly) throw liveReadonly()
          if (!s.hasProviderRef) throw conflict('NO_PROVIDER_SUBSCRIPTION', 'Abonelikte sağlayıcı kaydı yok.')
          if (body.atPeriodEnd) s.cancelAtPeriodEnd = true
          else s.status = 'canceled'
          systemEvent(s, 'subscription.admin_canceled', { atPeriodEnd: body.atPeriodEnd }, ctx, String(body.reason))
          return { tid: s.tid, status: s.status, cancelAtPeriodEnd: s.cancelAtPeriodEnd, currentPeriodEnd: s.currentPeriodEnd, external: true }
        }
        case 'BackofficeBillingService/changePlan': {
          strict(body, ['tid', 'planCode', 'reason'])
          if (typeof body.planCode !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(body.planCode)) throw validation('planCode', 'geçersiz plan kodu')
          if (ctx.liveReadonly) throw liveReadonly()
          const s = sub(body.tid)
          const plan = MOCK_PLANS.find((p) => p.code === body.planCode)
          if (!plan) throw notFound('Plan bulunamadı.', 'PLAN_NOT_FOUND')
          if (plan.priceMinor <= 0) throw conflict('PLAN_REQUIRES_QUOTE', 'Bu plan özel teklif gerektirir.')
          if (plan.code === s.planCode) throw conflict('SAME_PLAN', 'Abonelik zaten bu planda.')
          if (!['trialing', 'active', 'past_due'].includes(s.status)) throw conflict('SUBSCRIPTION_NOT_CHANGEABLE', 'Abonelik bu durumda plan değiştiremez.')
          if (!s.hasProviderRef) throw conflict('NO_PROVIDER_SUBSCRIPTION', 'Abonelikte sağlayıcı kaydı yok.')
          const from = s.planCode
          s.planCode = plan.code
          systemEvent(s, 'subscription.admin_plan_changed', { fromPlan: from, toPlan: plan.code }, ctx, String(body.reason))
          return { tid: s.tid, status: s.status, planCode: s.planCode, planVersion: 1 }
        }
        case 'BackofficeBillingService/getRevenueMetrics': {
          strict(body, ['range'])
          const range = (body.range as string) ?? '30d'
          if (!['7d', '30d', '90d'].includes(range)) throw validation('range', '7d|30d|90d')
          return revenue(range, ctx)
        }
        case 'BackofficeTenantService/getLifecycle': {
          strict(body, ['tid'])
          return lifecycle(Number(body.tid), ctx)
        }
        case 'BackofficeTenantService/cancelDeletion': {
          strict(body, ['tid', 'reason'])
          const tid = Number(body.tid)
          if (!ctx.clients.some((c) => c.clientId === tid)) throw notFound()
          if (tenantStatus.get(tid) !== 'DELETION_PENDING') throw conflict('CONFLICT', 'Bu mağaza için bekleyen bir silme talebi yok.')
          tenantStatus.set(tid, 'ACTIVE')
          deletion.delete(tid)
          return { order: tid, status: 'ACTIVE' }
        }
      }
      return UNHANDLED
    },
  }
}

/** startImpersonation yalnız ACTIVE tenant (sunucu kuralı). */
export function assertImpersonatable(domain: MockDomain, tid: number, ctx: MockCtx) {
  const life = domain.handle('BackofficeTenantService/getLifecycle', { tid }, ctx) as TenantLifecycle
  if (life.status !== 'ACTIVE') throw new MockHttpError(400, 'VALIDATION', 'Destek oturumu yalnız aktif mağazada açılabilir.', [{ path: 'tid', message: `durum: ${life.status}` }])
}

