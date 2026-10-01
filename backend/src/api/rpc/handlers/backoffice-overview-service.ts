import { IService } from '@interfaces/index'
import os from 'os'
import { BaseApi } from '../BaseApi'
import { RedisService } from '@services/redis/RedisService'
import { checkReadiness, type AppRole } from '@health/HealthCheck'
import { listNonOpenIntakeTargets } from '@integration/config/platformOverrideStore'
import { OverviewOps } from '../../admin/overviewOps'
import { productionQueueProvider } from './backoffice-engine-service'
import { AttentionOps } from '../../admin/attentionOps'
import { PulseOps } from '../../admin/pulseOps'
import { productionAttentionSources } from './backoffice-attention-support'
import { computeRevenueMetrics } from '../../../operations/backoffice/revenueMetrics'

/**
 * B1 (BACKOFFICE_PLAN §3) -- `/admin-api` Genel bakış / sağlık panosu: bağımlılıklar (HealthCheck), podlar, RED (son 1 sa), kuyruk birikimi, intake, açık sorunlar.
 * Yalnız okuma; her bölüm 2 sn zaman aşımıyla, başarısız bölüm `degraded`. Sözleşme: docs/API_BACKOFFICE_OVERVIEW_ENGINE.md.
 */
/** Süreç rolü (APP_ROLE; geçersiz/boş -> all). bootstrap/roles.ts ile AYNI çözüm, ama bootstrap'a bağımlılık (dependency-cruiser) yaratmamak için yerelde. */
const currentRole = (): AppRole => { const r = (process.env.APP_ROLE || '').trim().toLowerCase(); return r === 'web' || r === 'worker' ? r : 'all' }

export default class BackofficeOverviewService extends BaseApi implements IService {
    async get(): Promise<any> { /* IService gereksinimi */ }

    async getHealth(): Promise<any> {
        const role = currentRole()
        return new OverviewOps({
            applicationDB: this.applicationDB as any,
            readiness: () => checkReadiness(role, () => RedisService.getInstance()),
            role,
            queues: productionQueueProvider,
            intake: () => listNonOpenIntakeTargets(),
            podName: process.env.POD_NAME || os.hostname(),
        }).getHealth()
    }

    /** K51 (BO1): "dikkat gerektirenler" (sistem + müşteriler). Salt okuma, denetimsiz (agregat, PII yok). Sözleşme: docs/API_BACKOFFICE_ATTENTION.md. */
    async getAttention(): Promise<any> {
        return new AttentionOps({ sources: productionAttentionSources(this.applicationDB) }).getAttention(this.request?.limit)
    }

    /** K51 (BO1): büyük resim kullanım özeti; olmayan veri `computable:false` ('hesaplanamadı'). */
    async getPulse(): Promise<any> {
        const db = this.applicationDB
        return new PulseOps({
            clientModel: db.getClientModel(), metricRollupModel: db.getMetricRollupModel(), callMetricModel: db.getIntegrationCallMetricModel(),
            revenue: () => computeRevenueMetrics({ subscriptionModel: db.getSubscriptionModel(), planModel: db.getPlanModel(), billingEventModel: db.getBillingEventModel() }, '30d'),
        }).getPulse()
    }
}
