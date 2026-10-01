import { IService } from '@interfaces/index'
import { Queue } from 'bullmq'
import { BaseApi } from '../BaseApi'
import { RedisService } from '@services/redis/RedisService'
import { EngineOps, type BullQueueLike, type EngineActor, type EngineQueueName, type QueueProvider } from '../../admin/engineOps'

const queueCache = new Map<string, BullQueueLike>()

/** Üretim kuyruk sağlayıcısı: Redis hazır değilse null (uçlar 503 QUEUE_UNAVAILABLE / `available:false`). Örnek önbelleğe alınır (tek bağlantı/kuyruk). */
export const productionQueueProvider: QueueProvider = (name) => {
    if (!RedisService.isReady()) return null
    let q = queueCache.get(name)
    if (!q) { q = new Queue(name, { connection: RedisService.getConnectionConfig() }) as unknown as BullQueueLike; queueCache.set(name, q) }
    return q
}

/**
 * B7a-d (BACKOFFICE_PLAN §2.5) -- `/admin-api` Motor ve kuyruklar. Yalnız platformAdmin. retry/discard/release step-up + gerekçe ister
 * (`admin/stepUp.ts REAUTH_RPCS`); RunOperation `backoffice.write` yazar, hedefli ek olaylar (`backoffice.engine.*`) `EngineOps` içinde yazılır.
 * Sözleşme: docs/API_BACKOFFICE_OVERVIEW_ENGINE.md. Bugünkü `AdminService/getSystemHealth` ham llen/zcard okuması DEĞİŞMEDİ.
 */
export default class BackofficeEngineService extends BaseApi implements IService {
    async get(): Promise<any> { /* IService gereksinimi */ }

    private ops(): EngineOps { return new EngineOps({ applicationDB: this.applicationDB as any, queues: productionQueueProvider }) }
    private actor(): EngineActor { return { sub: this.request?.principal?.sub, ip: this.request?.requestMeta?.ip } }
    private reason(): string { return String(this.request?.reason ?? '').trim().slice(0, 500) }

    async getQueues(): Promise<any> { return this.ops().getQueues() }
    async listFailedJobs(): Promise<any> { const r = this.request || {}; return this.ops().listFailedJobs({ queue: r.queue as EngineQueueName, source: r.source, cursor: r.cursor, limit: r.limit, tid: r.tid, integrationCode: r.integrationCode, errorCode: r.errorCode }) }
    async retryJob(): Promise<any> { const r = this.request || {}; return this.ops().retryJob(this.actor(), { queue: r.queue, jobId: r.jobId, reason: this.reason() }) }
    async retryJobs(): Promise<any> { const r = this.request || {}; return this.ops().retryJobs(this.actor(), { queue: r.queue, jobIds: r.jobIds, reason: this.reason() }) }
    async discardJob(): Promise<any> { const r = this.request || {}; return this.ops().discardJob(this.actor(), { queue: r.queue, jobId: r.jobId, reason: this.reason() }) }
    async getStateMachineJobs(): Promise<any> { return this.ops().getStateMachineJobs() }
    async releaseStuckLease(): Promise<any> { const r = this.request || {}; return this.ops().releaseStuckLease(this.actor(), { kind: r.kind, id: r.id, reason: this.reason() }) }
    async listJobRuns(): Promise<any> { const r = this.request || {}; return this.ops().listJobRuns({ job: r.job, status: r.status, cursor: r.cursor, limit: r.limit }) }
}
