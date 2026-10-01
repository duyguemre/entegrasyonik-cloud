import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ApplicationError } from '@platform/core/security/Security'
import { config } from '@config'
import { RedisService } from '@services/redis/RedisService'
import ClientDB from '../../database/client/ClientDB'
import { nodeCache, getCacheMetrics } from '@utils/decorator/cache'
import { buildCacheDump, familyOfKey } from '../cacheDump'
import { getPodIdentity } from '../../utils/podIdentity'
import { getRedisStatus } from '../../operations/backoffice/redisStatus'
import { getMongoStatus, getMongoCollections, resolveTargetDbName } from '../../operations/backoffice/mongoStatus'
import { buildSlowQueries, type SlowQueryRange } from '../../operations/backoffice/slowQueries'
import { toInfraError } from './backoffice-infra-support'

/**
 * B8a-d + B9 (BACKOFFICE_PLAN §2.6/§2.7) -- `/admin-api` altyapı gözlemi. Yalnız platformAdmin. Okumalar tenant verisi/ham anahtar/belge içeriği DÖNMEZ;
 * Mongo yalnız izinli 7 DB bağlamında (`listDatabases` yok). `flushCacheFamily` step-up + gerekçe ister (`admin/stepUp.ts REAUTH_RPCS`), RunOperation
 * `backoffice.write` yazar. Sözleşme: docs/API_BACKOFFICE_INTEGRATIONS_INFRA.md.
 */
export default class BackofficeInfraService extends BaseApi implements IService {
    async get(): Promise<any> { /* IService gereksinimi */ }

    private conn(): any {
        const c = (this.applicationDB as any).getRootDatabase?.()?.getConnection?.()
        if (!c) throw new ApplicationError('Mongo bağlantısı hazır değil.', 503, 'INFRA_UNAVAILABLE')
        return c
    }

    async getRedisStatus(): Promise<any> {
        if (!RedisService.isReady()) throw new ApplicationError('Redis şu an hazır değil.', 503, 'INFRA_UNAVAILABLE')
        try { return await getRedisStatus(RedisService.getInstance() as any) } catch (e) { throw toInfraError(e) }
    }

    async getMongoStatus(): Promise<any> {
        try {
            return await getMongoStatus({
                conn: this.conn(), appDbName: config.db.name, appPoolSize: config.db.poolSize ?? 0, openTenantHandles: ClientDB.size,
                clientModel: (this.applicationDB as any).getClientModel(),
            })
        } catch (e) { throw toInfraError(e) }
    }

    async getMongoCollections(): Promise<any> {
        const r = this.request || {}
        try {
            const dbname = await resolveTargetDbName(r.db, { appDbName: config.db.name, clientModel: (this.applicationDB as any).getClientModel() })
            if (!dbname) throw new ApplicationError('Veritabanı bulunamadı.', 404, 'NOT_FOUND') // izinsiz/çözülemeyen ayrıştırılmaz
            return { db: r.db === 'app' ? 'app' : `tenant #${r.db}`, ...(await getMongoCollections(this.conn(), dbname, { cursor: r.cursor, limit: r.limit ?? 50 })) }
        } catch (e) { throw toInfraError(e) }
    }

    async getSlowQueries(): Promise<any> {
        try { return await buildSlowQueries({ applicationDB: this.applicationDB as any, range: this.request?.range as SlowQueryRange }) } catch (e) { throw toInfraError(e) }
    }

    /** Bellek cache'i POD-YERELDİR: yanıt, isteği karşılayan podu gösterir (`scope:'pod'`). */
    async getCacheMetrics(): Promise<any> {
        const m = getCacheMetrics()
        return { scope: 'pod', pod: getPodIdentity(), ...buildCacheDump(), inflight: m.inflight, totals: m.totals }
    }

    async flushCacheFamily(): Promise<any> {
        const family = String(this.request?.family ?? '')
        const keys = nodeCache.keys().filter((k) => familyOfKey(k) === family)
        const known = keys.length > 0 || buildCacheDump().breakdown.some((f) => f.name === family)
        if (!known) throw new ApplicationError('Cache ailesi bulunamadı.', 404, 'NOT_FOUND')
        nodeCache.del(keys)
        return { family, removed: keys.length, scope: 'pod', pod: getPodIdentity() }
    }
}
