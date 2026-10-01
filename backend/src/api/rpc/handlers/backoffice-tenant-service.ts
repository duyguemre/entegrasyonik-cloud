import { IService } from '@interfaces/index'
import { BaseApi } from '../../BaseApi'
import { ApplicationError } from '@platform/core/security/Security'
import { createTenantLifecycleService } from '../../tenantLifecycleFactory'
import { getTenantLifecycle } from '../../../operations/backoffice/tenantLifecycle'
import { listTenants, getHealthSummary, type TenantOpsDeps } from '../../../operations/backoffice/tenantOps'
import { productionFailedBullJobs } from './backoffice-attention-support'
import { auditSensitiveRead } from './backoffice-support'

/**
 * B2 (plan §2.2) -- müşteri (tenant) yaşam döngüsü paneli. Yalnız platformAdmin (`/admin-api`). `getLifecycle` salt okunur ve `backoffice.sensitive_read`
 * olarak RunOperation'da denetlenir (`SENSITIVE_READ_RPCS`); `cancelDeletion` mevcut `TenantLifecycleService.cancelDeletion`'ı (ADR-0003 F.20) backoffice
 * yüzeyine bağlar: step-up + gerekçe (`REAUTH_RPCS`) + `backoffice.write` audit. Impersonation (B3) bu serviste değil, AdminApiManager'da.
 */
export default class BackofficeTenantService extends BaseApi implements IService {
    async get(): Promise<any> { /* IService gereksinimi */ }

    async getLifecycle(): Promise<any> {
        return getTenantLifecycle({
            clientModel: this.applicationDB.getClientModel(), subscriptionModel: this.applicationDB.getSubscriptionModel(), auditModel: this.applicationDB.getAuditLogModel(),
        }, this.request?.tid)
    }

    private opsDeps(): TenantOpsDeps {
        const db = this.applicationDB
        return {
            clientModel: db.getClientModel(), subscriptionModel: db.getSubscriptionModel(), errorEventModel: db.getErrorEventModel(), dlqModel: db.getDeadLetterQueueModel(),
            callMetricModel: db.getIntegrationCallMetricModel(), alertModel: db.getAlertModel(), failedBullJobs: productionFailedBullJobs,
        }
    }

    /** BE-01 (K51): müşteri listesi + operasyon özeti. Tenant adı = PII sayılabilir -> çağrı başına tek `backoffice.sensitive_read` (yalnız süzgeç özeti). */
    async listTenants(): Promise<any> {
        const r = this.request || {}
        const out = await listTenants(this.opsDeps(), r)
        auditSensitiveRead(this.request, 'BackofficeTenantService', 'listTenants', { hasIssues: r.hasIssues, subscriptionStatus: r.subscriptionStatus, status: r.status, q: r.q ? '[q]' : undefined, sortBy: r.sortBy }, out.items.length)
        return out
    }

    /** BE-02 (K51): "Şu an" kartı; yalnız sayaç/kod (hassas okuma değil, denetimsiz). */
    async getHealthSummary(): Promise<any> { return getHealthSummary(this.opsDeps(), this.request?.tid) }

    async cancelDeletion(): Promise<any> {
        const tid = this.request?.tid
        if (!Number.isInteger(tid) || tid <= 0) throw new ApplicationError('tid: pozitif tam sayı olmalı', 400, 'VALIDATION')
        return createTenantLifecycleService(this.applicationDB).cancelDeletion(tid, { actorSub: this.request?.principal?.sub })
    }
}
