import { IService } from '@interfaces/index'
import { BaseApi } from '../../BaseApi'
import { config } from '@config'
import { AdminUserManager, type AdminActor } from '../../admin/adminUserManager'
import { createMongoAdminMfaStore } from '../../admin/adminMfaStore'
import { defaultMailSender } from '../../../operations/account/AccountLifecycleService'

/** Backoffice SPA taban adresi = `ADMIN_CORS_ORIGINS` ilk girdisi (https, ya da yalnız localhost/127.0.0.1 için http). Yoksa null (davet 503 ADMIN_INVITE_UNAVAILABLE). */
export function resolveBackofficeBaseUrl(origins: ReadonlyArray<string> = config.admin.corsOrigins): string | null {
    const raw = origins[0]
    if (!raw) return null
    try {
        const u = new URL(raw)
        const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
        if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local))) return null
        return u.origin
    } catch { return null }
}

/**
 * B12 (ADR-0026, plan §2.8) -- `/admin-api` platform yöneticisi yönetimi. Yalnız platformAdmin; invite/disable/enable/resetMfa step-up + gerekçe ister
 * (`admin/stepUp.ts REAUTH_RPCS`) ve RunOperation `backoffice.write` yazar; hedefi içeren ek olaylar (`backoffice.admin.*`) burada yazılır.
 * Kurallar/sözleşme: `admin/adminUserManager.ts`, docs/API_BACKOFFICE_ADMINS.md.
 */
export default class BackofficeAdminUserService extends BaseApi implements IService {
    async get(): Promise<any> { /* IService gereksinimi */ }

    private manager(): AdminUserManager {
        return new AdminUserManager({
            applicationDB: this.applicationDB as any,
            mfaStore: createMongoAdminMfaStore(async () => this.applicationDB.getAdminMfaModel()),
            mailSender: defaultMailSender,
            backofficeBaseUrl: () => resolveBackofficeBaseUrl(),
        })
    }

    private actor(): AdminActor { return { sub: this.request?.principal?.sub, ip: this.request?.requestMeta?.ip } }
    private reason(): string | undefined { return typeof this.request?.reason === 'string' ? this.request.reason.trim().slice(0, 500) : undefined }

    async list(): Promise<any> { return this.manager().list() }
    async invite(): Promise<any> { return this.manager().invite(this.actor(), { email: this.request?.email, reason: this.reason() }) }
    async disable(): Promise<any> { return this.manager().disable(this.actor(), { sub: this.request?.sub, reason: this.reason() }) }
    async enable(): Promise<any> { return this.manager().enable(this.actor(), { sub: this.request?.sub, reason: this.reason() }) }
    async resetMfa(): Promise<any> { return this.manager().resetMfa(this.actor(), { sub: this.request?.sub, reason: this.reason() }) }
}
