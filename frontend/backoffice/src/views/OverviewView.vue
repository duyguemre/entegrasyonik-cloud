<template>
  <div class="bo-page">
    <div class="bo-page__head">
      <div>
        <h1 class="bo-page__title">Genel bakış</h1>
        <p class="bo-page__lede">
          Sistem durumu ve dikkat isteyen işler.
          <span v-if="checkedAt" class="bo-muted">Son kontrol {{ formatClock(checkedAt) }}.</span>
        </p>
      </div>
      <div class="bo-page__actions">
        <EkButton tone="secondary" icon="mdi-refresh" :loading="loading" @click="load">Yenile</EkButton>
      </div>
    </div>

    <EkAlert v-if="degradedCount" tone="warning" live :title="`${degradedCount} bağımlılık sorunlu`" text="Etkilenen bileşen kırmızı çerçeveyle işaretli. Ayrıntı için Log kontrol merkezinde 'Platform' kategorisine bakın." />

    <section class="bo-grid bo-overview__tiles" aria-label="Sistem durumu">
      <StatusTile label="API" icon="mdi-api" :state="apiState" :value="apiState === 'ok' ? 'Yanıt veriyor' : '—'" :detail="apiDetail" source="GET /health" />
      <StatusTile label="MongoDB" icon="mdi-database-outline" :state="mongoState" :value="mongoState === 'ok' ? 'Bağlı' : mongoState === 'fail' ? 'Bağlantı yok' : '—'" detail="Uygulama veritabanı ping ≤ 1 sn" source="GET /ready · mongo" />
      <StatusTile label="Redis" icon="mdi-memory" :state="redisState" :value="redisValue" :detail="redisDetail" source="GET /ready · redis" />
      <StatusTile label="Kuyruklar" icon="mdi-tray-full" :state="queueState" :value="queueValue" :detail="queueDetail" source="AdminService/getSystemHealth" />
    </section>

    <div class="bo-grid bo-overview__row">
      <EkCard title="Açık sorunlar" subtitle="Son 24 saat · parmak izine göre gruplu" icon="mdi-alert-decagram-outline" icon-tone="error">
        <template v-if="issues">
          <div class="bo-overview__kpis">
            <div><strong class="ek-num">{{ openIssues.length }}</strong><span>açık grup</span></div>
            <div><strong class="ek-num">{{ newIssues }}</strong><span>yeni (24 sa)</span></div>
            <div><strong class="ek-num">{{ affectedTenants }}</strong><span>müşteri · en geniş sorun</span></div>
          </div>
          <ul class="bo-overview__issues">
            <li v-for="issue in openIssues.slice(0, 5)" :key="issue.fp">
              <RouterLink :to="{ path: '/loglar', query: { fp: issue.fp } }" class="bo-overview__issue">
                <EkStatusChip :tone="LEVEL[issue.level].tone" :label="LEVEL[issue.level].label" :icon="LEVEL[issue.level].icon" />
                <span class="bo-overview__issue-title">{{ issue.title }}</span>
                <span class="bo-overview__issue-meta ek-num">{{ issue.count }} · {{ formatRelative(issue.lastSeen) }}</span>
              </RouterLink>
            </li>
          </ul>
          <RouterLink to="/loglar" class="bo-overview__more">Log kontrol merkezine git <v-icon icon="mdi-arrow-right" aria-hidden="true" /></RouterLink>
        </template>
        <EkSkeleton v-else type="detail" :rows="4" />
      </EkCard>

      <EkCard title="Altyapı" subtitle="Kuyruk birikimi ve çalışan podlar" icon="mdi-server-network" icon-tone="info">
        <template v-if="system">
          <table class="bo-overview__queues">
            <caption class="ek-sr-only">Kuyruk sayımları</caption>
            <thead><tr><th scope="col">Kuyruk</th><th scope="col">Bekleyen</th><th scope="col">İşlenen</th></tr></thead>
            <tbody>
              <tr v-for="(q, key) in system.infrastructure.queues" :key="key">
                <th scope="row">{{ QUEUE_LABEL[key] }}</th>
                <td class="ek-num">{{ q.wait }}</td>
                <td class="ek-num">{{ q.active }}</td>
              </tr>
            </tbody>
          </table>
          <p class="bo-overview__pods-label">Aktif podlar ({{ system.infrastructure.activePods.length }})</p>
          <ul class="bo-overview__pods">
            <li v-for="pod in system.infrastructure.activePods" :key="pod"><span class="bo-overview__pod-dot" aria-hidden="true"></span><code>{{ pod }}</code></li>
          </ul>
        </template>
        <EkSkeleton v-else type="detail" :rows="4" />
      </EkCard>
    </div>

    <EkCard title="Son yönetim işlemleri" subtitle="backoffice.* ve impersonation olayları" icon="mdi-clipboard-text-clock-outline">
      <ul v-if="audit" class="bo-overview__audit">
        <li v-for="a in audit" :key="a.id">
          <span class="bo-overview__audit-time ek-num">{{ formatRelative(a.at) }}</span>
          <code class="bo-overview__audit-event">{{ a.event }}</code>
          <span class="bo-overview__audit-op">{{ a.meta?.op }}</span>
          <span v-if="a.meta?.reason" class="bo-overview__audit-reason">“{{ a.meta.reason }}”</span>
        </li>
      </ul>
      <EkSkeleton v-else type="table" :rows="4" />
      <RouterLink to="/denetim" class="bo-overview__more">Tüm denetim kayıtları <v-icon icon="mdi-arrow-right" aria-hidden="true" /></RouterLink>
    </EkCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { EkAlert, EkButton, EkCard, EkSkeleton, EkStatusChip } from '@entegrasyonik/ui/components'
import StatusTile, { type TileState } from '@bo/components/StatusTile.vue'
import { api } from '@bo/api'
import type { AuditRecord, HealthResponse, IssueGroup, ReadyResponse, SystemHealthResponse } from '@bo/api/contract'
import type { ProbeResult } from '@bo/api/client'
import { LEVEL } from '@bo/utils/labels'
import { formatClock, formatRelative } from '@bo/utils/format'

const QUEUE_LABEL: Record<string, string> = { orderSync: 'Sipariş eşitleme (BullMQ)', export: 'Dışa aktarım', import: 'İçe aktarım' }

const loading = ref(false)
const checkedAt = ref<number>()
const health = ref<ProbeResult<HealthResponse>>()
const ready = ref<ProbeResult<ReadyResponse>>()
const system = ref<SystemHealthResponse | null>(null)
const systemFailed = ref(false)
const issues = ref<IssueGroup[] | null>(null)
const audit = ref<AuditRecord[] | null>(null)

async function load() {
  loading.value = true
  const [h, r, s, i, a] = await Promise.allSettled([
    api.probe<HealthResponse>('/health'),
    api.probe<ReadyResponse>('/ready'),
    api.call('AdminService/getSystemHealth', { timeFrame: 'DAY' }),
    api.call('LogCenterService/getIssueGroups', { range: '24h', sort: 'lastSeen' }),
    api.call('BackofficeAuditService/search', { range: '7d', surface: 'backoffice', limit: 50 }),
  ])
  health.value = h.status === 'fulfilled' ? h.value : undefined
  ready.value = r.status === 'fulfilled' ? r.value : undefined
  system.value = s.status === 'fulfilled' ? s.value : null
  systemFailed.value = s.status === 'rejected'
  issues.value = i.status === 'fulfilled' ? i.value.items : []
  audit.value = a.status === 'fulfilled' ? a.value.items.filter((x) => /^(backoffice\.|impersonation\.)/.test(x.event)).slice(0, 6) : []
  checkedAt.value = Date.now()
  loading.value = false
}
onMounted(load)

const readyBody = computed(() => (ready.value?.ok ? ready.value.data : undefined))
const apiState = computed<TileState>(() => (!health.value ? 'loading' : health.value.ok ? 'ok' : 'fail'))
const apiDetail = computed(() => (health.value && !health.value.ok ? health.value.error.message : 'Canlılık denetimi (bağımlılıklardan bağımsız)'))
const mongoState = computed<TileState>(() => (!ready.value ? 'loading' : !readyBody.value ? 'unknown' : readyBody.value.mongo === 'ok' ? 'ok' : 'fail'))
const redisState = computed<TileState>(() => {
  if (!ready.value) return 'loading'
  const r = readyBody.value?.redis
  return r === 'ok' ? 'ok' : r === 'fail' ? 'fail' : 'unknown'
})
const redisValue = computed(() => {
  const info = system.value?.infrastructure.redis
  if (redisState.value !== 'ok' || !info) return redisState.value === 'fail' ? 'Bağlantı yok' : '—'
  return `${info.usedMemory} bellek`
})
const redisDetail = computed(() => {
  if (readyBody.value?.redis === 'n/a') return 'Web rolünde Redis denetlenmez'
  const info = system.value?.infrastructure.redis
  return info && redisState.value === 'ok' ? `Sürüm ${info.version} · ${info.connectedClients} istemci · ${Math.round(Number(info.uptime) / 86400)} gün açık` : 'Sipariş kuyruğu ve kilitler Redis gerektirir'
})
const queueTotals = computed(() => {
  const q = system.value?.infrastructure.queues
  if (!q) return null
  return Object.values(q).reduce((acc, v) => ({ wait: acc.wait + v.wait, active: acc.active + v.active }), { wait: 0, active: 0 })
})
const queueState = computed<TileState>(() => (systemFailed.value ? 'unknown' : !queueTotals.value ? 'loading' : queueTotals.value.wait > 100 ? 'degraded' : 'ok'))
const queueValue = computed(() => (queueTotals.value ? `${queueTotals.value.wait} bekleyen` : '—'))
const queueDetail = computed(() => (queueTotals.value ? `${queueTotals.value.active} iş işleniyor · eşik 100 bekleyen` : systemFailed.value ? 'Sistem sağlığı okunamadı' : ''))
const degradedCount = computed(() => [apiState.value, mongoState.value, redisState.value, queueState.value].filter((s) => s === 'fail' || s === 'degraded').length)

const SEVERITY = { fatal: 0, error: 1, warn: 2, info: 3 } as const
// Önce ciddiyet, sonra son görülme: panoda ilk satır her zaman en ağır sorun.
const openIssues = computed(() =>
  (issues.value ?? [])
    .filter((i) => i.status === 'open' || i.status === 'acknowledged')
    .sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level] || Date.parse(b.lastSeen) - Date.parse(a.lastSeen)),
)
const newIssues = computed(() => openIssues.value.filter((i) => i.isNew).length)
const affectedTenants = computed(() => Math.max(0, ...openIssues.value.map((i) => i.tenantCount)))
</script>

<style scoped>
.bo-overview__tiles {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.bo-overview__row {
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  align-items: start;
}

.bo-overview__kpis {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ek-space-3);
  margin-bottom: var(--ek-space-4);
}

.bo-overview__kpis div {
  display: flex;
  flex-direction: column;
  padding: var(--ek-space-3);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface-muted);
}

.bo-overview__kpis strong {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-metric-size);
  line-height: 1.1;
  font-weight: var(--ek-type-metric-weight);
}

.bo-overview__kpis span {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-overview__issues,
.bo-overview__pods,
.bo-overview__audit {
  margin: 0;
  padding: 0;
  list-style: none;
}

.bo-overview__issue {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-2) var(--ek-space-2);
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-content-default);
  text-decoration: none;
}

.bo-overview__issue:hover,
.bo-overview__issue:focus-visible {
  background: var(--ek-color-surface-muted);
  outline: none;
}

.bo-overview__issue:focus-visible {
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.bo-overview__issue-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ek-type-body-size);
}

.bo-overview__issue-meta {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  white-space: nowrap;
}

.bo-overview__more {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin-top: var(--ek-space-3);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
  text-decoration: none;
}

.bo-overview__more:hover {
  text-decoration: underline;
}

.bo-overview__queues {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ek-type-body-size);
}

.bo-overview__queues th,
.bo-overview__queues td {
  padding: var(--ek-space-2) 0;
  border-bottom: 1px solid var(--ek-color-border-subtle);
  text-align: right;
}

.bo-overview__queues th[scope='row'],
.bo-overview__queues thead th:first-child {
  text-align: left;
  font-weight: var(--ek-font-weight-regular);
}

.bo-overview__queues thead th {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
}

.bo-overview__pods-label {
  margin: var(--ek-space-4) 0 var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
}

.bo-overview__pods {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.bo-overview__pods li {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-1) var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  font-size: var(--ek-type-caption-size);
}

.bo-overview__pod-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-success);
}

.bo-overview__audit li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ek-space-1) var(--ek-space-3);
  padding: var(--ek-space-2) 0;
  border-bottom: 1px solid var(--ek-color-border-subtle);
  font-size: var(--ek-type-body-size);
}

.bo-overview__audit-time {
  min-width: 88px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-overview__audit-event {
  color: var(--ek-color-content-strong);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-label-size);
}

.bo-overview__audit-op {
  color: var(--ek-color-content-default);
}

.bo-overview__audit-reason {
  color: var(--ek-color-content-muted);
  font-style: italic;
}

@media (max-width: 1279px) {
  .bo-overview__tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .bo-overview__row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 599px) {
  .bo-overview__tiles {
    grid-template-columns: 1fr;
  }

  .bo-overview__issue {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .bo-overview__issue-title {
    white-space: normal;
  }

  .bo-overview__issue-meta {
    grid-column: 2;
  }

  .bo-overview__kpis {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
