/**
 * Abonelikler, gelir metrikleri, müşteri yaşam döngüsü — B4a/b/c, B2 (docs/cloud-contracts/API_BACKOFFICE_BILLING_TENANTS.md). [BE HAZIR]
 * Kaynak: backend/src/api/services/backoffice-billing-service.ts + backoffice-tenant-service.ts; şema rpc-input/backoffice-billing.ts.
 * Tutarlar KURUŞ (`priceMinor`), para birimi ayrı. Kart verisi yalnız maskeli (cardLast4/cardBrand); sağlayıcı referansı dönmez.
 */

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled' | 'expired'

export interface SubscriptionRow {
  tid: number
  tenantName: string | null
  planCode: string
  planVersion: number
  status: SubscriptionStatus
  trialEndsAt: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  graceUntil: string | null
  billingExempt: boolean
  provider: string
  hasProviderRef: boolean
  cardLast4: string | null
  cardBrand: string | null
  createdAt: string
  updatedAt: string
}
export interface ListSubscriptionsRequest {
  status?: SubscriptionStatus
  planCode?: string
  cursor?: string
  limit?: number
}
export interface ListSubscriptionsResponse {
  items: SubscriptionRow[]
  nextCursor: string | null
}
export interface PlanSummary {
  code: string
  name: string
  priceMinor: number
  currency: string
  interval: 'month' | 'year'
  vatIncluded: boolean
  limits: Record<string, number>
  features: string[]
}
export interface BillingEventRow {
  id: string
  at: string
  /** 'system' = backoffice/iş kaynaklı. */
  provider: string
  type: string
  status: string
  failureReason: string | null
  /** Zaten redakte edilmiş küçük alt küme. */
  payload: Record<string, unknown> | null
}
export interface GetSubscriptionResponse {
  subscription: SubscriptionRow & { plan: PlanSummary | null }
  events: BillingEventRow[]
}

export interface ExtendTrialRequest {
  tid: number
  days: number
  reason: string
}
export interface ExtendTrialResponse {
  tid: number
  status: 'trialing'
  trialEndsAt: string
  previousTrialEndsAt: string | null
  extendedDays: number
  /** K40: bu abonelikte bugüne dek toplam uzatma (gün, bu işlem dahil); üst sınır TRIAL_EXTENSION_MAX_TOTAL_DAYS. */
  totalExtensionDays: number
  /** K40: kalan uzatma hakkı (gün). */
  remainingExtensionDays: number
  /** K40: denemesi bitip askıya alınmış kartsız abonelik bu uzatmayla yeniden `trialing` oldu. */
  reopened: boolean
}
/** K40 (ADR-0008): tek seferde ≤30 gün, bir abonelikte toplam ≤60 gün. Aşımda 409 TRIAL_EXTENSION_LIMIT + details.{remainingDays,usedDays,maxTotalDays}. */
export const TRIAL_EXTENSION_MAX_DAYS = 30
export const TRIAL_EXTENSION_MAX_TOTAL_DAYS = 60
export interface CancelSubscriptionRequest {
  tid: number
  atPeriodEnd: boolean
  reason: string
}
export interface CancelSubscriptionResponse {
  tid: number
  status: SubscriptionStatus
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
  /** K40: true = ödeme sağlayıcısında uygulandı (LIVE_READONLY'de 423); false = sağlayıcı kaydı yok, yerel ve doğrudan `canceled` (atPeriodEnd yok sayılır). */
  external: boolean
}
export interface ChangePlanRequest {
  tid: number
  planCode: string
  reason: string
}
export interface ChangePlanResponse {
  tid: number
  status: SubscriptionStatus
  planCode: string
  planVersion: number
}

export type RevenueRange = '7d' | '30d' | '90d'
export interface RevenueMetrics {
  range: RevenueRange
  from: string
  to: string
  mrr: {
    byCurrency: Record<string, number>
    byPlan: Array<{ planCode: string; subscriptions: number; monthlyMinor: number; currency: string; mrrMinor: number }>
    billedSubscriptions: number
    quoteBasedSubscriptions: number
    unpricedSubscriptions: number
  }
  statusDistribution: Record<SubscriptionStatus, number>
  exemptSubscriptions: number
  /** rate: payda 0 ise null → "—". */
  trialConversion: { cohort: number; converted: number; rate: number | null }
  churn: { count: number; mrrLostByCurrency: Record<string, number>; rate: number | null }
  paymentEvents: { succeeded: number; failed: number }
}

// ---------------------------------------------------------------- B2 yaşam döngüsü
export type TenantStatus = 'PROVISIONING' | 'PROVISIONING_FAILED' | 'ACTIVE' | 'DELETION_PENDING' | 'PURGING' | 'PURGE_FAILED' | 'PURGED'
export type ProvisioningStep = 'client' | 'order-limit' | 'central-user' | 'tenant-seed' | 'tenant-user' | 'subscription' | 'activate'
export interface TenantLifecycle {
  tid: number
  status: TenantStatus
  name: string | null
  lastSuccessfulOrderSync: string | null
  trial: { subscriptionStatus: SubscriptionStatus; planCode: string; trialEndsAt: string | null; daysLeft: number | null; billingExempt: boolean } | null
  deletion: {
    requestedAt: string | null
    requestedBy: string | null
    scheduledAt: string | null
    daysUntilPurge: number | null
    canCancel: boolean
    purgedAt: string | null
    purgeFailedStep: string | null
  } | null
  provisioning: {
    steps: Array<{ step: ProvisioningStep; state: 'done' | 'failed' | 'pending' }>
    startedAt: string | null
    failedAt: string | null
    failedStep: ProvisioningStep | null
  }
  /** En yeni 10 AuditLogs{tid}: yalnız olay adı/zaman/sonuç (meta ve aktör kimliği YOK). */
  recentEvents: Array<{ at: string; event: string; result: 'ok' | 'fail' | 'error'; actorType: string | null; surface: string | null; imp: boolean }>
}

declare module '../contract' {
  interface AdminRpc {
    'BackofficeBillingService/listSubscriptions': [ListSubscriptionsRequest, ListSubscriptionsResponse]
    'BackofficeBillingService/getSubscription': [{ tid: number }, GetSubscriptionResponse]
    'BackofficeBillingService/extendTrial': [ExtendTrialRequest, ExtendTrialResponse]
    'BackofficeBillingService/cancelSubscription': [CancelSubscriptionRequest, CancelSubscriptionResponse]
    'BackofficeBillingService/changePlan': [ChangePlanRequest, ChangePlanResponse]
    'BackofficeBillingService/getRevenueMetrics': [{ range?: RevenueRange }, RevenueMetrics]
    'BackofficeTenantService/getLifecycle': [{ tid: number }, TenantLifecycle]
    'BackofficeTenantService/cancelDeletion': [{ tid: number; reason: string }, { order: number; status: 'ACTIVE' }]
  }
}
