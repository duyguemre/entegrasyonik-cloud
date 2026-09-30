import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ApplicationError } from '../Security'
import { RedisService } from '@services/redis/RedisService'
import { buildApiHealth, type ApiHealthRange } from '../../operations/backoffice/apiHealth'
import { readResilienceState } from '../../operations/backoffice/resilienceState'
import { toInfraError } from './backoffice-infra-support'

/**
 * B5/B6 (BACKOFFICE_PLAN §2.4) -- `/admin-api` entegrasyon sağlığı. Yalnız platformAdmin, salt okuma; tenant kimliği/yük dönmez.
 * Sözleşme: docs/API_BACKOFFICE_INTEGRATIONS_INFRA.md.
 */
export default class BackofficeIntegrationService extends BaseApi implements IService {
    async get(): Promise<any> { /* IService gereksinimi */ }

    async getApiHealth(): Promise<any> {
        const r = this.request || {}
        try { return await buildApiHealth({ applicationDB: this.applicationDB as any, range: r.range as ApiHealthRange, integrationCode: r.integrationCode }) }
        catch (e) { throw toInfraError(e) }
    }

    async getResilienceState(): Promise<any> {
        if (!RedisService.isReady()) throw new ApplicationError('Redis şu an hazır değil.', 503, 'INFRA_UNAVAILABLE')
        try { return await readResilienceState(RedisService.getInstance() as any) }
        catch (e) { throw toInfraError(e) }
    }
}
