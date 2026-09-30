import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ApplicationError } from '../Security'
import { createTenantLifecycleService } from '../tenantLifecycleFactory'
import { getTenantLifecycle } from '../../operations/backoffice/tenantLifecycle'

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

    async cancelDeletion(): Promise<any> {
        const tid = this.request?.tid
        if (!Number.isInteger(tid) || tid <= 0) throw new ApplicationError('tid: pozitif tam sayı olmalı', 400, 'VALIDATION')
        return createTenantLifecycleService(this.applicationDB).cancelDeletion(tid, { actorSub: this.request?.principal?.sub })
    }
}
