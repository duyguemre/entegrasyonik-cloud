import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ApplicationError } from '@platform/core/security/Security'

const QUERY_MAX_TIME_MS = 5000

/**
 * ADR-0026 WP-LOG L2 -- hata grubu (ErrorEvents) durum yönetimi. Yazma: step-up GEREKMEZ; `backoffice.write` audit'ini RunOperation yazar.
 * Durumlar ErrorEvents şemasındaki enum ile aynıdır (open | acknowledged | resolved | muted). Gövde şeması `rpc-input/backoffice.ts`.
 */
export default class BackofficeErrorService extends BaseApi implements IService {
    async get(): Promise<any> { /* IService gereksinimi */ }

    async setStatus(): Promise<any> {
        const { fingerprint, status } = this.request || {}
        const model = this.applicationDB.getErrorEventModel()
        const res: any = await model.updateOne({ fp: fingerprint }, { $set: { status } }).maxTimeMS(QUERY_MAX_TIME_MS)
        if (!res || (res.matchedCount ?? res.n ?? 0) === 0) throw new ApplicationError('Hata grubu bulunamadı.', 404)
        return { fingerprint, status }
    }
}
