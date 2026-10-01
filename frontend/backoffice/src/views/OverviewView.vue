<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="checkedAt">
      <template #meta>
        <span class="bo-inline-note"><v-icon icon="mdi-autorenew" aria-hidden="true" />Sekme açıkken 30 sn'de bir yenilenir</span>
      </template>
      <template #actions>
        <EkButton tone="secondary" icon="mdi-refresh" :loading="loading" @click="load">Yenile</EkButton>
      </template>
    </BoPageHeader>

    <!-- Genel durum şeridi: tek bakışta "her şey yolunda mı?" -->
    <!-- BO-ELEV: şerit bir hüküm verir; her madde bir sonraki adıma (ilgili ekran) bağlıdır. -->
    <div v-if="health" class="bo-ov-status" :class="`is-${overall.tone}`" role="status" data-testid="overall-status">
      <v-icon :icon="overall.icon" aria-hidden="true" />
      <div class="bo-ov-status__text">
        <strong>{{ overall.title }}</strong>
        <span v-if="overall.tone === 'success'">{{ overall.note }}</span>
      </div>
      <ul v-if="overall.items.length" class="bo-ov-status__items" aria-label="Dikkat isteyen konular">
        <li v-for="item in overall.items" :key="item.label">
          <RouterLink :to="item.to" class="bo-ov-status__item" :class="`is-${item.tone}`">
            <span class="bo-ov-status__dot" aria-hidden="true"></span>
            <span>{{ item.label }}</span>
            <span class="bo-ov-status__where">{{ item.where }}</span>
            <v-icon icon="mdi-arrow-right" aria-hidden="true" />
          </RouterLink>
        </li>
      </ul>
    </div>
    <BoPanelState v-else-if="healthError" state="error" :error="healthError" error-text="Sistem durumu okunamadı" :retrying="loading" @retry="load" />

    <section class="bo-ov-kpis" aria-label="Temel göstergeler">
      <HealthKpi
        label="Bağımlılıklar"
        :to="'/altyapi'"
        icon="mdi-connection"
        :state="kpi.dependencies.state"
        :value="kpi.dependencies.value"
        :detail="kpi.dependencies.detail"
        :degraded-reason="degradedReason('dependencies')"
        @retry="load"
      />
      <HealthKpi
        label="İstek hızı"
        :to="'/entegrasyonlar'"
        icon="mdi-speedometer"
        :state="kpi.rate.state"
        :value="kpi.rate.value"
        unit="/dk"
        :detail="kpi.rate.detail"
        :degraded-reason="degradedReason('red')"
        @retry="load"
      />
      <HealthKpi
        label="Hata oranı (5xx)"
        :to="{ path: '/loglar', query: { level: 'fatal,error' } }"
        icon="mdi-alert-octagon-outline"
        :state="kpi.errors.state"
        :value="kpi.errors.value"
        :detail="kpi.errors.detail"
        :chip-label="kpi.errors.chip"
        help="Sunucu hatası dönen isteklerin tüm isteklere oranı. %1 altı olağan."
        :degraded-reason="degradedReason('red')"
        @retry="load"
      />
      <HealthKpi
        label="Yanıt süresi (p95)"
        :to="'/entegrasyonlar'"
        icon="mdi-timer-outline"
        :state="kpi.latency.state"
        :value="kpi.latency.value"
        :unit="kpi.latency.unit"
        :detail="kpi.latency.detail"
        :chip-label="kpi.latency.chip"
        help="p95: isteklerin %95'i bu sürenin altında tamamlandı."
        :degraded-reason="degradedReason('red')"
        @retry="load"
      />
      <HealthKpi
        label="Kuyruk birikimi"
        :to="kpi.queues.to ?? '/motor'"
        icon="mdi-tray-full"
        :state="kpi.queues.state"
        :value="kpi.queues.value"
        :detail="kpi.queues.detail"
        :chip-label="kpi.queues.chip"
        :degraded-reason="degradedReason('queues')"
        @retry="load"
      />
      <HealthKpi
        label="Açık sorunlar"
        :to="'/loglar'"
        icon="mdi-alert-decagram-outline"
        :state="kpi.issues.state"
        :value="kpi.issues.value"
        :detail="kpi.issues.detail"
        :chip-label="kpi.issues.chip"
        :degraded-reason="degradedReason('issues')"
        @retry="load"
      />
    </section>

    <div class="bo-ov-row">
      <EkCard title="Dikkat isteyen sorunlar" subtitle="Açık ve incelenen gruplar · önce ciddiyet, sonra son görülme" icon="mdi-alert-decagram-outline" icon-tone="error" :heading-level="2">
        <BoPanelState v-if="issuesState !== 'ready'" :state="issuesState" :rows="5" empty-title="Açık sorun yok" empty-text="Son 24 saatte açık ya da incelenen hata grubu bulunmuyor." empty-icon="mdi-check-circle-outline" @retry="load" />
        <ul v-else class="bo-ov-issues">
          <li v-for="issue in openIssues.slice(0, 6)" :key="issue.fp">
            <RouterLink :to="{ path: '/loglar', query: { fp: issue.fp } }" class="bo-ov-issue">
              <EkStatusChip :tone="LEVEL[issue.level].tone" :label="LEVEL[issue.level].label" :icon="LEVEL[issue.level].icon" />
              <span class="bo-ov-issue__main">
                <span class="bo-ov-issue__title">{{ issue.title }}</span>
                <span class="bo-ov-issue__meta">
                  {{ CATEGORY[issue.category].label }}<template v-if="issue.integ"> · {{ CHANNEL[issue.integ] ?? issue.integ }}</template>
                  · <span class="ek-num">{{ formatNumber(issue.count) }}</span> olay
                  · <span class="ek-num">{{ issue.tenantCount }}</span> müşteri
                </span>
              </span>
              <span class="bo-ov-issue__time"><EkRelativeTime :value="issue.lastSeen" /></span>
            </RouterLink>
          </li>
        </ul>
        <RouterLink to="/loglar" class="bo-link-more">Tüm sorunlar <v-icon icon="mdi-arrow-right" aria-hidden="true" /></RouterLink>
      </EkCard>

      <EkCard title="Bağımlılıklar ve podlar" subtitle="Hazırlık denetimi ve son 15 dk içinde iş yapan podlar" icon="mdi-server-network" icon-tone="info" :heading-level="2">
        <BoPanelState v-if="!health" :state="healthError ? 'error' : 'loading'" :error="healthError" :rows="4" @retry="load" />
        <template v-else>
          <BoPanelState v-if="health.dependencies.status === 'degraded'" state="degraded" degraded-title="Bağımlılık durumu okunamadı" :degraded-reason="health.dependencies.error" @retry="load" />
          <ul v-else class="bo-ov-deps">
            <li v-for="d in deps" :key="d.label">
              <span class="bo-ov-deps__label">{{ d.label }}</span>
              <span class="bo-ov-deps__hint">{{ d.hint }}</span>
              <EkStatusChip :tone="HEALTH[d.state].tone" :label="d.stateLabel ?? HEALTH[d.state].label" dot />
            </li>
          </ul>
          <h3 class="bo-ov-sub">Podlar</h3>
          <BoPanelState v-if="health.pods.status === 'degraded'" state="degraded" degraded-title="Pod listesi okunamadı" :degraded-reason="health.pods.error" @retry="load" />
          <BoPanelState v-else-if="!health.pods.items.length" state="empty" empty-title="İş yapan pod yok" empty-text="Son 15 dakikada kira tutan ya da zamanlayıcı çalıştıran pod görülmedi." />
          <div v-else class="bo-table-wrap bo-table-wrap--flat" tabindex="0" role="region" aria-label="Podlar tablosu">
            <table class="bo-table" data-density="compact">
              <caption class="ek-sr-only">Podlar</caption>
              <thead>
                <tr><th scope="col">Pod</th><th scope="col" class="is-num">Kira</th><th scope="col" class="is-num">Çalışan iş</th><th scope="col" class="is-num">Görüldü</th></tr>
              </thead>
              <tbody>
                <tr v-for="p in health.pods.items" :key="p.pod">
                  <th scope="row" class="is-id">
                    <span class="bo-ov-pod"><span class="bo-ov-pod__dot" aria-hidden="true"></span>{{ p.pod }}</span>
                    <span v-if="p.self" class="bo-ov-pod__self">bu pod</span>
                  </th>
                  <td class="is-num ek-num">{{ p.activeLeases }}</td>
                  <td class="is-num ek-num">{{ p.runningJobs }}</td>
                  <td class="is-num is-muted"><EkRelativeTime :value="p.lastSeenAt" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </EkCard>
    </div>

    <div class="bo-ov-row bo-ov-row--even">
      <EkCard title="Kuyruklar" subtitle="BullMQ kuyrukları · DLQ: elle inceleme bekleyen kalıcı hatalar" icon="mdi-tray-full" :heading-level="2">
        <BoPanelState v-if="!health" :state="healthError ? 'error' : 'loading'" :error="healthError" skeleton="table" :rows="2" @retry="load" />
        <BoPanelState v-else-if="health.queues.status === 'degraded'" state="degraded" degraded-title="Kuyruk sayaçları okunamadı" :degraded-reason="health.queues.error" @retry="load" />
        <div v-else class="bo-table-wrap bo-table-wrap--flat" tabindex="0" role="region" aria-label="Kuyruk sayaçları tablosu">
          <table class="bo-table" data-density="compact">
            <caption class="ek-sr-only">Kuyruk sayaçları</caption>
            <thead>
              <tr>
                <th scope="col">Kuyruk</th><th scope="col" class="is-num">Bekleyen</th><th scope="col" class="is-num">İşleniyor</th>
                <th scope="col" class="is-num">Başarısız</th><th scope="col" class="is-num">DLQ</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="q in health.queues.items" :key="q.name">
                <th scope="row">
                  <span class="bo-ov-queue">{{ QUEUE_LABEL[q.name] ?? q.name }}</span>
                  <span class="bo-ov-queue__code is-id">{{ q.name }}</span>
                </th>
                <template v-if="q.available">
                  <td class="is-num ek-num">{{ formatNumber(q.backlog) }}</td>
                  <td class="is-num ek-num">{{ formatNumber(q.active) }}</td>
                  <td class="is-num ek-num" :class="{ 'bo-ov-bad': (q.failed ?? 0) > 0 }">{{ formatNumber(q.failed) }}</td>
                </template>
                <td v-else colspan="3" class="is-muted"><v-icon icon="mdi-lan-disconnect" size="14" aria-hidden="true" /> Redis hazır değil — sayaçlar okunamıyor</td>
                <td class="is-num ek-num" :class="{ 'bo-ov-bad': (q.dlqPending ?? 0) > 0 }">{{ formatNumber(q.dlqPending) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <RouterLink to="/motor" class="bo-link-more">Motor ve kuyruklar <v-icon icon="mdi-arrow-right" aria-hidden="true" /></RouterLink>
      </EkCard>

      <EkCard title="Veri alımı" subtitle="Kanal başına yeni iş kabulü (intake) — süreç anlık görüntüsü" icon="mdi-valve" :heading-level="2">
        <BoPanelState v-if="!health" :state="healthError ? 'error' : 'loading'" :error="healthError" :rows="2" @retry="load" />
        <BoPanelState v-else-if="health.intake.status === 'degraded'" state="degraded" degraded-title="Alım durumu okunamadı" :degraded-reason="health.intake.error" @retry="load" />
        <div v-else-if="health.intake.allOpen" class="bo-ov-intake-ok">
          <v-icon icon="mdi-check-circle" aria-hidden="true" />
          <span>Tüm kanallar yeni iş kabul ediyor.</span>
        </div>
        <ul v-else class="bo-ov-deps">
          <li v-for="r in health.intake.restricted" :key="r.target">
            <span class="bo-ov-deps__label">{{ intakeTarget(r.target) }}</span>
            <span class="bo-ov-deps__hint">{{ INTAKE[r.intake]?.hint ?? r.intake }}</span>
            <EkStatusChip :tone="INTAKE[r.intake]?.tone ?? 'neutral'" :label="INTAKE[r.intake]?.label ?? r.intake" dot />
          </li>
        </ul>
        <p class="bo-ov-foot">Kısıtlı olmayan kanallar normal çalışır. Değişiklik: Entegrasyonlar › dayanıklılık (gerekçe + kimlik doğrulama).</p>
      </EkCard>
    </div>

    <EkCard title="Son yönetim işlemleri" subtitle="Yönetim yazmaları ve geçici erişimler · son 7 gün" icon="mdi-clipboard-text-clock-outline" :heading-level="2">
      <BoPanelState v-if="auditState !== 'ready'" :state="auditState" skeleton="table" :rows="4" empty-title="Son 7 günde yönetim işlemi yok" @retry="load" />
      <ul v-else class="bo-ov-audit">
        <li v-for="a in audit" :key="a.id">
          <span class="bo-ov-audit__time"><EkRelativeTime :value="a.at" /></span>
          <span class="bo-ov-audit__main">
            <span class="bo-ov-audit__op">{{ a.meta?.op ?? a.event }}</span>
            <span v-if="a.meta?.reason" class="bo-ov-audit__reason">“{{ a.meta.reason }}”</span>
          </span>
          <code class="bo-ov-audit__event">{{ a.event }}</code>
          <RouterLink v-if="a.reqId" class="bo-ov-audit__open" :to="{ path: '/denetim', query: { reqId: a.reqId } }" :aria-label="`Denetim kaydını aç: ${a.meta?.op ?? a.event}`">
            <v-icon icon="mdi-arrow-top-right" aria-hidden="true" />
          </RouterLink>
        </li>
      </ul>
      <RouterLink to="/denetim" class="bo-link-more">Tüm denetim kayıtları <v-icon icon="mdi-arrow-right" aria-hidden="true" /></RouterLink>
    </EkCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { EkButton, EkCard, EkRelativeTime, EkStatusChip, type StatusTone } from '@entegrasyonik/ui/components'
import { formatNumber, formatPercent } from '@entegrasyonik/ui/format'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoPanelState, { type PanelState } from '@bo/components/shell/BoPanelState.vue'
import HealthKpi, { type KpiState } from '@bo/components/HealthKpi.vue'
import { api } from '@bo/api'
import type { AuditRecord, IssueGroup, OverviewHealthResponse, OverviewSectionKey } from '@bo/api/contract'
import { CATEGORY, CHANNEL, HEALTH, LEVEL, type HealthState } from '@bo/utils/labels'

const QUEUE_LABEL: Record<string, string> = { 'order-sync-queue': 'Sipariş eşitleme' }
const INTAKE: Record<string, { label: string; tone: StatusTone; hint: string }> = {
  open: { label: 'Açık', tone: 'success', hint: 'Yeni iş kabul ediliyor' },
  drain: { label: 'Boşaltılıyor', tone: 'warning', hint: 'Yeni iş alınmıyor, kuyruktakiler bitiriliyor' },
  closed: { label: 'Kapalı', tone: 'danger', hint: 'Yeni iş alınmıyor' },
  paused: { label: 'Duraklatıldı', tone: 'danger', hint: 'İşler bekletiliyor' },
}
const REFRESH_MS = 30_000

const loading = ref(false)
const checkedAt = ref<number>()
const health = ref<OverviewHealthResponse | null>(null)
const healthError = ref<unknown>(null)
const issues = ref<IssueGroup[] | null>(null)
const issuesFailed = ref(false)
const audit = ref<AuditRecord[] | null>(null)
const auditFailed = ref(false)

async function load() {
  if (loading.value) return
  loading.value = true
  const [h, i, a] = await Promise.allSettled([
    api.call('BackofficeOverviewService/getHealth'),
    api.call('LogCenterService/getIssueGroups', { range: '24h', sort: 'lastSeen' }),
    api.call('BackofficeAuditService/search', { range: '7d', surface: 'backoffice', limit: 50 }),
  ])
  // Yenileme başarısızsa son iyi görüntü korunur; ilk yüklemede hata durumu gösterilir.
  if (h.status === 'fulfilled') {
    health.value = h.value
    healthError.value = null
  } else if (!health.value) healthError.value = h.reason
  issuesFailed.value = i.status === 'rejected'
  if (i.status === 'fulfilled') issues.value = i.value.items
  auditFailed.value = a.status === 'rejected'
  if (a.status === 'fulfilled') audit.value = a.value.items.filter((x) => /^(backoffice\.|impersonation\.)/.test(x.event) && x.event !== 'backoffice.reauth').slice(0, 6)
  checkedAt.value = Date.now()
  loading.value = false
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void load()
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void load()
  }, REFRESH_MS)
})
onBeforeUnmount(() => clearInterval(timer))

function degradedReason(key: OverviewSectionKey) {
  const s = health.value?.[key]
  return s && s.status === 'degraded' ? s.error : undefined
}

type Kpi = { state: KpiState; value?: string; unit?: string; detail?: string; chip?: string; to?: RouteLocationRaw }
const LOADING: Kpi = { state: 'loading' }

const kpi = computed(() => {
  const h = health.value
  if (!h) {
    const s: Kpi = healthError.value ? { state: 'unknown', value: '—', detail: 'Okunamadı' } : LOADING
    return { dependencies: s, rate: s, errors: s, latency: s, queues: s, issues: s }
  }
  const deg: Kpi = { state: 'section-degraded' }

  const d = h.dependencies
  const dependencies: Kpi =
    d.status === 'degraded'
      ? deg
      : {
          state: d.mongo === 'fail' || d.redis === 'fail' ? 'fail' : d.ready ? 'ok' : 'degraded',
          value: d.ready ? 'Hazır' : 'Hazır değil',
          detail: `MongoDB ${d.mongo === 'ok' ? 'bağlı' : 'bağlantı yok'} · Redis ${d.redis === 'ok' ? 'bağlı' : d.redis === 'n/a' ? 'denetlenmiyor' : 'bağlantı yok'}`,
        }

  const r = h.red
  let rate: Kpi = deg
  let errors: Kpi = deg
  let latency: Kpi = deg
  if (r.status === 'ok') {
    rate = { state: 'ok', value: formatNumber(Math.round(r.requestsPerMinute)), detail: `Son ${r.windowMinutes} dk · ${formatNumber(r.requests)} istek` }
    const er = r.errorRate
    errors = {
      state: er === null ? 'unknown' : er < 0.01 ? 'ok' : er < 0.05 ? 'degraded' : 'fail',
      value: er === null ? '—' : formatPercent(er),
      detail: `${formatNumber(r.errors5xx)} hata · ${formatNumber(r.byStatusClass['4xx'] ?? 0)} istemci hatası (4xx)`,
      chip: er === null ? undefined : er < 0.01 ? 'Olağan' : er < 0.05 ? 'Eşik üstü' : 'Kritik',
    }
    const p95 = r.durationP95Ms
    latency = r.durationP95Overflow
      ? { state: 'fail', value: '> 60', unit: 'sn', detail: 'Histogram üst sınırı aşıldı' }
      : {
          state: p95 === null ? 'unknown' : p95 < 1000 ? 'ok' : p95 < 3000 ? 'degraded' : 'fail',
          value: p95 === null ? '—' : formatNumber(p95),
          unit: p95 === null ? undefined : 'ms',
          detail: r.durationAvgMs === null ? 'Henüz ölçüm yok' : `Ortalama ${formatNumber(r.durationAvgMs)} ms`,
          chip: p95 === null ? undefined : p95 < 1000 ? 'Olağan' : p95 < 3000 ? 'Yavaş' : 'Kritik',
        }
  }

  const q = h.queues
  let queues: Kpi = deg
  if (q.status === 'ok') {
    const down = q.items.filter((x) => !x.available)
    const backlog = q.items.reduce((n, x) => n + (x.backlog ?? 0), 0)
    const failed = q.items.reduce((n, x) => n + (x.failed ?? 0), 0)
    const dlq = q.items.reduce((n, x) => n + (x.dlqPending ?? 0), 0)
    queues = down.length
      ? { state: 'fail', value: '—', detail: 'Redis hazır değil — sayaçlar okunamıyor', chip: 'Erişilemiyor' }
      : {
          // DLQ = elle müdahale bekleyen iş; sıfır değilse "sağlıklı" denmez (BO-ELEV IA-2).
          state: backlog > 100 || dlq > 0 ? 'degraded' : 'ok',
          value: formatNumber(backlog),
          detail: `${formatNumber(failed)} başarısız · ${formatNumber(dlq)} DLQ bekliyor`,
          chip: backlog > 100 ? 'Eşik üstü' : dlq > 0 ? 'İnceleme bekliyor' : undefined,
          to: dlq > 0 ? { path: '/motor', query: { sekme: 'basarisiz', kaynak: 'dlq' } } : undefined,
        }
  }

  const i = h.issues
  const issuesKpi: Kpi =
    i.status === 'degraded'
      ? deg
      : {
          state: i.newLast24h > 0 ? 'degraded' : 'ok',
          value: formatNumber(i.open),
          detail: i.newLast24h ? `${i.newLast24h} yeni sorun (son 24 sa)` : 'Son 24 saatte yeni sorun yok',
          chip: i.newLast24h ? 'Yeni sorun' : 'Yeni yok',
        }

  return { dependencies, rate, errors, latency, queues, issues: issuesKpi }
})

const SECTION_LABEL: Record<OverviewSectionKey, string> = {
  dependencies: 'Bağımlılıklar',
  pods: 'Podlar',
  red: 'İstek sağlığı',
  queues: 'Kuyruklar',
  intake: 'Veri alımı',
  issues: 'Sorun sayıları',
}

type StatusItem = { label: string; where: string; to: RouteLocationRaw; tone: 'error' | 'warning' }
const SECTION_TARGET: Record<OverviewSectionKey, { where: string; to: RouteLocationRaw }> = {
  dependencies: { where: 'Altyapı', to: '/altyapi' },
  pods: { where: 'Altyapı', to: '/altyapi' },
  red: { where: 'Entegrasyonlar', to: '/entegrasyonlar' },
  queues: { where: 'Motor', to: '/motor' },
  intake: { where: 'Dayanıklılık', to: { path: '/entegrasyonlar', query: { sekme: 'dayaniklilik' } } },
  issues: { where: 'Loglar', to: '/loglar' },
}

/** Genel durum: hüküm + bağlantılı maddeler (önce kırmızı, sonra sarı). */
const overall = computed(() => {
  const h = health.value!
  const k = kpi.value
  const items: StatusItem[] = []
  if (h.dependencies.status === 'ok') {
    if (h.dependencies.mongo === 'fail') items.push({ label: 'MongoDB erişilemiyor', where: 'Altyapı', to: { path: '/altyapi', query: { sekme: 'mongodb' } }, tone: 'error' })
    if (h.dependencies.redis === 'fail') items.push({ label: 'Redis erişilemiyor — sipariş kuyruğu durdu', where: 'Altyapı', to: '/altyapi', tone: 'error' })
  }
  for (const s of h.degradedSections) items.push({ label: `${SECTION_LABEL[s]} okunamadı`, ...SECTION_TARGET[s], tone: 'warning' })
  if (k.errors.state === 'degraded' || k.errors.state === 'fail')
    items.push({ label: `Hata oranı ${k.errors.value}`, where: 'Loglar', to: { path: '/loglar', query: { level: 'fatal,error' } }, tone: k.errors.state === 'fail' ? 'error' : 'warning' })
  if (k.latency.state === 'degraded' || k.latency.state === 'fail')
    items.push({ label: `Yanıt süresi p95 ${k.latency.value} ${k.latency.unit ?? ''}`.trim(), where: 'Entegrasyonlar', to: '/entegrasyonlar', tone: k.latency.state === 'fail' ? 'error' : 'warning' })
  if (h.queues.status === 'ok') {
    const dlq = h.queues.items.reduce((n, x) => n + (x.dlqPending ?? 0), 0)
    if (dlq > 0) items.push({ label: `${formatNumber(dlq)} iş elle inceleme bekliyor (DLQ)`, where: 'Motor', to: { path: '/motor', query: { sekme: 'basarisiz', kaynak: 'dlq' } }, tone: 'warning' })
  }
  if (h.issues.status === 'ok' && h.issues.newLast24h > 0)
    items.push({ label: `${formatNumber(h.issues.newLast24h)} yeni sorun (24 sa)`, where: 'Loglar', to: '/loglar', tone: 'warning' })
  items.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'error' ? -1 : 1))

  if (!items.length && h.status !== 'degraded')
    return { tone: 'success', icon: 'mdi-check-circle', title: 'Tüm sistemler çalışıyor', note: 'Bağımlılıklar hazır; hata oranı, yanıt süresi ve kuyruklar olağan.', items }
  const critical = items.some((i) => i.tone === 'error')
  const title =
    h.dependencies.status === 'ok' && !h.dependencies.ready
      ? 'Kısmi bozulma'
      : items.length === 1
        ? '1 konu dikkat istiyor'
        : `${items.length} konu dikkat istiyor`
  return { tone: critical ? 'error' : 'warning', icon: critical ? 'mdi-alert-octagon' : 'mdi-alert', title, note: '', items }
})

const deps = computed<Array<{ label: string; hint: string; state: HealthState; stateLabel?: string }>>(() => {
  const d = health.value?.dependencies
  if (!d || d.status !== 'ok') return []
  return [
    { label: 'MongoDB', hint: 'Uygulama veritabanı', state: d.mongo === 'ok' ? 'ok' : 'fail' },
    { label: 'Redis', hint: 'Sipariş kuyruğu ve kilitler', state: d.redis === 'ok' ? 'ok' : d.redis === 'n/a' ? 'unknown' : 'fail', stateLabel: d.redis === 'n/a' ? 'Web rolünde yok' : undefined },
    { label: 'Hazırlık (/ready)', hint: `Süreç rolü: ${d.role === 'all' ? 'web + işçi' : d.role === 'web' ? 'web' : 'işçi'}`, state: d.ready ? 'ok' : 'degraded', stateLabel: d.ready ? 'Hazır' : 'Hazır değil' },
  ]
})

function intakeTarget(target: string) {
  const [kind, code] = target.split(':')
  return kind === 'platform' ? (CHANNEL[code] ?? code) : target
}

const SEVERITY = { fatal: 0, error: 1, warn: 2, info: 3 } as const
const openIssues = computed(() =>
  (issues.value ?? [])
    .filter((i) => i.status === 'open' || i.status === 'acknowledged')
    .sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level] || Date.parse(b.lastSeen) - Date.parse(a.lastSeen)),
)
const issuesState = computed<PanelState>(() => (issues.value === null ? (issuesFailed.value ? 'error' : 'loading') : openIssues.value.length ? 'ready' : 'empty'))
const auditState = computed<PanelState>(() => (audit.value === null ? (auditFailed.value ? 'error' : 'loading') : audit.value.length ? 'ready' : 'empty'))
</script>

<style scoped>
.bo-ov-status {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-success-border);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
}

.bo-ov-status.is-warning {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.bo-ov-status.is-error {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

.bo-ov-status:has(.bo-ov-status__items) {
  flex-wrap: wrap;
}

/* Maddeler: sakin satır içi bağlantılar (yüzey üstünde), her biri hedef ekranın adını taşır. */
.bo-ov-status__items {
  display: flex;
  flex-basis: 100%;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0 0 0 calc(var(--ek-icon-lg) + var(--ek-space-3));
  list-style: none;
}

.bo-ov-status__item {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 32px;
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
  text-decoration: none;
  transition: var(--ek-transition-colors);
}

.bo-ov-status__item:hover {
  border-color: var(--ek-color-border-strong);
}

.bo-ov-status__item:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-ov-status__dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-warning);
}

.bo-ov-status__item.is-error .bo-ov-status__dot {
  background: var(--ek-color-error);
}

.bo-ov-status__where {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-regular);
}

.bo-ov-status__item .v-icon {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}

.bo-ov-status > .v-icon {
  font-size: var(--ek-icon-lg);
}

.bo-ov-status__text {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ek-space-1) var(--ek-space-3);
  min-width: 0;
  font-size: var(--ek-type-body-size);
}

.bo-ov-status__text strong {
  font-weight: var(--ek-font-weight-semibold);
}

.bo-ov-status__text span {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}


.bo-ov-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ek-space-4);
}

.bo-ov-row {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: var(--ek-space-4);
  align-items: start;
}

.bo-ov-row--even {
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
}

.bo-ov-issues,
.bo-ov-deps,
.bo-ov-audit {
  margin: 0;
  padding: 0;
  list-style: none;
}

.bo-ov-issue {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-2);
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-content-default);
  text-decoration: none;
  transition: var(--ek-transition-colors);
}

.bo-ov-issues li + li {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.bo-ov-issue:hover,
.bo-ov-issue:focus-visible {
  background: var(--ek-color-surface-muted);
  outline: none;
}

.bo-ov-issue:focus-visible {
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.bo-ov-issue__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.bo-ov-issue__title {
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bo-ov-issue__meta,
.bo-ov-issue__time {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-ov-issue__time {
  white-space: nowrap;
}

.bo-link-more {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin-top: var(--ek-space-3);
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
  text-decoration: none;
}

.bo-link-more .v-icon {
  font-size: var(--ek-icon-sm);
  transition: transform var(--ek-duration-fast) var(--ek-easing-standard);
}

.bo-link-more:hover .v-icon {
  transform: translateX(2px);
}

.bo-link-more:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-ov-deps li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: 'label chip' 'hint chip';
  align-items: center;
  column-gap: var(--ek-space-3);
  padding: var(--ek-space-2) 0;
}

.bo-ov-deps li + li {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.bo-ov-deps__label {
  grid-area: label;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-medium);
}

.bo-ov-deps__hint {
  grid-area: hint;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-ov-deps .ek-status-chip {
  grid-area: chip;
}

.bo-ov-sub {
  margin: var(--ek-space-4) 0 var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-table-wrap--flat {
  border-radius: var(--ek-radius-lg);
  box-shadow: none;
}

.bo-table-wrap--flat .bo-table thead th,
.bo-table-wrap--flat .bo-table tbody td,
.bo-table-wrap--flat .bo-table tbody th {
  padding-inline: var(--ek-space-3);
}

.bo-ov-pod {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.bo-ov-pod__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-success);
}

.bo-ov-pod__self {
  margin-left: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-family: var(--ek-font-sans);
  font-size: var(--ek-type-caption-size);
}

.bo-ov-queue {
  display: block;
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
}

.bo-ov-queue__code {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-ov-bad {
  color: var(--ek-color-error-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-ov-intake-ok {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-success-emphasis);
  font-size: var(--ek-type-body-size);
}

.bo-ov-foot {
  margin: var(--ek-space-3) 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-ov-audit li {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr) auto 28px;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 44px;
  padding: var(--ek-space-1) 0;
  border-bottom: 1px solid var(--ek-color-border-subtle);
  font-size: var(--ek-type-body-size);
}

.bo-ov-audit__time {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-ov-audit__main {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--ek-space-3);
  min-width: 0;
}

.bo-ov-audit__op {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
}

.bo-ov-audit__reason {
  overflow: hidden;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bo-ov-audit__event {
  padding: 2px var(--ek-space-2);
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-default);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-caption-size);
}

.bo-ov-audit__open {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-content-muted);
}

.bo-ov-audit__open:hover {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.bo-ov-audit__open:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

@media (min-width: 1680px) {
  .bo-ov-kpis {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

@media (max-width: 1099px) {
  .bo-ov-row,
  .bo-ov-row--even {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767px) {
  .bo-ov-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ek-space-3);
  }

  .bo-ov-status {
    align-items: flex-start;
  }


  .bo-ov-issue {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .bo-ov-issue > .ek-status-chip {
    grid-column: 1 / -1;
    justify-self: start;
  }

  .bo-ov-issue__title {
    white-space: normal;
  }

  .bo-ov-audit li {
    grid-template-columns: minmax(0, 1fr) 28px;
    grid-template-areas: 'time open' 'main open' 'event open';
    gap: var(--ek-space-1) var(--ek-space-3);
    padding: var(--ek-space-2) 0;
  }

  .bo-ov-audit__time {
    grid-area: time;
  }

  .bo-ov-audit__main {
    grid-area: main;
  }

  .bo-ov-audit__event {
    grid-area: event;
    justify-self: start;
  }

  .bo-ov-audit__open {
    grid-area: open;
  }

  .bo-ov-audit__reason {
    white-space: normal;
  }
}

@media (max-width: 600px) {
  .bo-ov-status__items {
    padding-left: 0;
  }
}
</style>
