import { config } from '@config'
import { IService } from '@interfaces/index'
import { Types } from 'mongoose'
import { BaseApi } from '../BaseApi'
import { ApplicationError } from '@platform/core/security/Security'
import { getRequestId } from '@platform/core/context'
import { getPaymentProvider } from '@services/billing/PaymentProviderFactory'
import { EntitlementService } from '@services/billing/EntitlementService'
import { auditSensitiveRead } from './backoffice-support'
import { extendTrial, cancelSubscription, changePlan, type SubscriptionAdminDeps } from '../../../operations/backoffice/subscriptionAdmin'
import { computeRevenueMetrics } from '../../../operations/backoffice/revenueMetrics'
import { getCompetitionSettings, getTenantCompetition, setCompetitionOverride, type CompetitionAdminDeps } from '../../../operations/backoffice/competitionAdmin'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const EVENTS_LIMIT = 50
const QUERY_MAX_TIME_MS = 5000
const bad = (m: string): never => { throw new ApplicationError(m, 400, 'VALIDATION') }

function decodeCursor(c: string): Types.ObjectId {
    const id = Buffer.from(c, 'base64url').toString('utf8')
    if (!/^[a-f0-9]{24}$/.test(id)) return bad('cursor: imleç geçersiz')
    return new Types.ObjectId(id)
}
const encodeCursor = (id: unknown): string => Buffer.from(String(id), 'utf8').toString('base64url')

/** Abonelik satırı: sağlayıcı referansları/kart verisi dışarı çıkmaz (yalnız maskeli son4/marka + `hasProviderRef`). */
function toRow(s: any, tenantName: string | null, plan?: any): Record<string, any> {
    return {
        tid: s.clientId, tenantName, planCode: s.planCode, planVersion: s.planVersion, status: s.status, trialEndsAt: s.trialEndsAt ?? null,
        currentPeriodStart: s.currentPeriodStart ?? null, currentPeriodEnd: s.currentPeriodEnd ?? null, cancelAtPeriodEnd: s.cancelAtPeriodEnd === true,
        graceUntil: s.graceUntil ?? null, billingExempt: s.billingExempt === true, provider: s.provider, hasProviderRef: !!s.providerSubscriptionRef,
        cardLast4: s.cardLast4 ?? null, cardBrand: s.cardBrand ?? null, createdAt: s.createdAt ?? null, updatedAt: s.updatedAt ?? null,
        ...(plan !== undefined ? { plan } : {}),
    }
}

/**
 * B4 (plan §2.3, ADR-0008) -- platform geneli abonelik listesi/detayı, deneme uzatma, iptal, plan değiştirme, gelir metrikleri. Yalnız platformAdmin (`/admin-api`).
 * Yazmalar (extendTrial/cancelSubscription/changePlan) step-up + gerekçe ister (`admin/stepUp.ts REAUTH_RPCS`); iş mantığı `operations/backoffice/*` (saf, test edilebilir).
 * Sözleşme: docs/API_BACKOFFICE_BILLING_TENANTS.md.
 */
export default class BackofficeBillingService extends BaseApi implements IService {
    async get(): Promise<any> { /* IService gereksinimi */ }

    private reason(): string {
        const r = this.request?.reason
        return typeof r === 'string' ? r.trim().slice(0, 500) : ''
    }
    private adminDeps(): SubscriptionAdminDeps {
        return {
            subscriptionModel: this.applicationDB.getSubscriptionModel(), planModel: this.applicationDB.getPlanModel(), billingEventModel: this.applicationDB.getBillingEventModel(),
            provider: () => getPaymentProvider(), invalidateEntitlement: (id: number) => EntitlementService.invalidate(id),
            liveReadonly: () => config.liveReadonly.enabled,
        }
    }
    private actorCtx() { return { sub: this.request?.principal?.sub as string | undefined, reason: this.reason(), reqId: getRequestId() } }

    async listSubscriptions(): Promise<any> {
        const r = this.request || {}
        const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isInteger(r.limit) ? r.limit : DEFAULT_LIMIT))
        const match: Record<string, any> = {}
        if (r.status !== undefined) match.status = r.status
        if (r.planCode !== undefined) match.planCode = r.planCode
        const query = r.cursor !== undefined ? { $and: [match, { _id: { $lt: decodeCursor(r.cursor) } }] } : match
        const rows: any[] = await this.applicationDB.getSubscriptionModel().find(query).sort({ _id: -1 }).limit(limit + 1).maxTimeMS(QUERY_MAX_TIME_MS).lean()
        const hasMore = rows.length > limit
        const page = hasMore ? rows.slice(0, limit) : rows
        const ids = page.map(s => s.clientId)
        const clients: any[] = ids.length ? await this.applicationDB.getClientModel().find({ clientId: { $in: ids } }, 'clientId title').maxTimeMS(QUERY_MAX_TIME_MS).lean() : []
        const names = new Map(clients.map(c => [c.clientId, c.title ?? null]))
        auditSensitiveRead(this.request, 'BackofficeBillingService', 'listSubscriptions', { status: r.status, planCode: r.planCode }, page.length)
        const last = page[page.length - 1]
        return { items: page.map(s => toRow(s, names.get(s.clientId) ?? null)), nextCursor: hasMore && last ? encodeCursor(last._id) : null }
    }

    async getSubscription(): Promise<any> {
        const tid = this.request?.tid
        const sub: any = await this.applicationDB.getSubscriptionModel().findOne({ clientId: tid }).maxTimeMS(QUERY_MAX_TIME_MS).lean()
        if (!sub) throw new ApplicationError('Abonelik bulunamadı.', 404, 'SUBSCRIPTION_NOT_FOUND')
        const [client, plan, events]: [any, any, any[]] = await Promise.all([
            this.applicationDB.getClientModel().findOne({ clientId: tid }, 'clientId title').maxTimeMS(QUERY_MAX_TIME_MS).lean(),
            this.applicationDB.getPlanModel().findOne({ code: sub.planCode }).maxTimeMS(QUERY_MAX_TIME_MS).lean(),
            this.applicationDB.getBillingEventModel().find({ clientId: tid }).sort({ receivedAt: -1 }).limit(EVENTS_LIMIT).maxTimeMS(QUERY_MAX_TIME_MS).lean(),
        ])
        auditSensitiveRead(this.request, 'BackofficeBillingService', 'getSubscription', { tid }, 1)
        return {
            subscription: toRow(sub, client?.title ?? null, plan ? { code: plan.code, name: plan.name, priceMinor: plan.priceMinor, currency: plan.currency, interval: plan.interval, vatIncluded: plan.vatIncluded, limits: plan.limits, features: plan.features } : null),
            events: events.map(e => ({ id: String(e._id), at: e.receivedAt, provider: e.provider, type: e.type, status: e.status, failureReason: e.failureReason ?? null, payload: e.payloadRedacted ?? null })),
        }
    }

    async extendTrial(): Promise<any> { return extendTrial(this.adminDeps(), { tid: this.request?.tid, days: this.request?.days }, this.actorCtx()) }
    async cancelSubscription(): Promise<any> { return cancelSubscription(this.adminDeps(), { tid: this.request?.tid, atPeriodEnd: this.request?.atPeriodEnd === true }, this.actorCtx()) }
    async changePlan(): Promise<any> { return changePlan(this.adminDeps(), { tid: this.request?.tid, planCode: this.request?.planCode }, this.actorCtx()) }

    // PRC-CFG (K57-S5): rekabet modülü ayarları. Plan varsayılanı/bütçe `IntegrationConfigService` (`_platform`) ile; burada okuma + tenant istisnası.
    private competitionDeps(): CompetitionAdminDeps {
        return { subscriptionModel: this.applicationDB.getSubscriptionModel(), clientModel: this.applicationDB.getClientModel(), billingEventModel: this.applicationDB.getBillingEventModel() }
    }
    async getCompetitionSettings(): Promise<any> { return getCompetitionSettings(this.competitionDeps()) }
    async getTenantCompetition(): Promise<any> { return getTenantCompetition(this.competitionDeps(), { tid: this.request?.tid }) }
    async setCompetitionOverride(): Promise<any> {
        return setCompetitionOverride(this.competitionDeps(), { tid: this.request?.tid, override: this.request?.override, note: this.request?.note }, this.actorCtx())
    }

    async getRevenueMetrics(): Promise<any> {
        return computeRevenueMetrics({
            subscriptionModel: this.applicationDB.getSubscriptionModel(), planModel: this.applicationDB.getPlanModel(), billingEventModel: this.applicationDB.getBillingEventModel(),
        }, this.request?.range ?? '30d')
    }
}
