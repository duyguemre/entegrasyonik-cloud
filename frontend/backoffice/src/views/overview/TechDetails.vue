<!--
  TechDetails — genel bakışın AYRINTI katmanı (BO_UI_PATTERNS §11.4): bağımlılıklar ve podlar, kuyruk sayaçları, veri alımı,
  son yönetim işlemleri. Yalnız "Teknik ayrıntılar" açıldığında çizilir ve o an okur (ilk ekranda yük yok). Kart içerikleri
  BO-ELEV genel bakışından taşındı; davranış aynı.
-->
<template>
  <div class="bo-td">
    <div class="bo-td__grid">
      <EkCard title="Bağımlılıklar ve podlar" subtitle="Hazırlık denetimi ve son 15 dk içinde iş yapan podlar" icon="mdi-server-network" icon-tone="info" :heading-level="3">
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
          <h4 class="bo-ov-sub">Podlar</h4>
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
      <EkCard title="Kuyruklar" subtitle="BullMQ kuyrukları · DLQ: elle inceleme bekleyen kalıcı hatalar" icon="mdi-tray-full" :heading-level="3">
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

      <EkCard title="Veri alımı" subtitle="Kanal başına yeni iş kabulü (intake) — süreç anlık görüntüsü" icon="mdi-valve" :heading-level="3">
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

    <EkCard title="Son yönetim işlemleri" subtitle="Yönetim yazmaları ve geçici erişimler · son 7 gün" icon="mdi-clipboard-text-clock-outline" :heading-level="3">
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
import { computed, onMounted, ref, watch } from 'vue'
import { EkCard, EkRelativeTime, EkStatusChip, type StatusTone } from '@entegrasyonik/ui/components'
import { formatNumber } from '@entegrasyonik/ui/format'
import BoPanelState, { type PanelState } from '@bo/components/shell/BoPanelState.vue'
import { api } from '@bo/api'
import type { AuditRecord, OverviewHealthResponse } from '@bo/api/contract'
import { CHANNEL, HEALTH, type HealthState } from '@bo/utils/labels'

const QUEUE_LABEL: Record<string, string> = { 'order-sync-queue': 'Sipariş eşitleme' }
const INTAKE: Record<string, { label: string; tone: StatusTone; hint: string }> = {
  open: { label: 'Açık', tone: 'success', hint: 'Yeni iş kabul ediliyor' },
  drain: { label: 'Boşaltılıyor', tone: 'warning', hint: 'Yeni iş alınmıyor, kuyruktakiler bitiriliyor' },
  closed: { label: 'Kapalı', tone: 'danger', hint: 'Yeni iş alınmıyor' },
  paused: { label: 'Duraklatıldı', tone: 'danger', hint: 'İşler bekletiliyor' },
}

const props = defineProps<{
  /** Sayfa yenilemesi sayacı — değişince yeniden okunur. */
  tick?: number
}>()

const loading = ref(false)
const health = ref<OverviewHealthResponse | null>(null)
const healthError = ref<unknown>(null)
const audit = ref<AuditRecord[] | null>(null)
const auditFailed = ref(false)

async function load() {
  if (loading.value) return
  loading.value = true
  const [h, a] = await Promise.allSettled([
    api.call('BackofficeOverviewService/getHealth', {}),
    api.call('BackofficeAuditService/search', { range: '7d', surface: 'backoffice', limit: 50 }),
  ])
  if (h.status === 'fulfilled') {
    health.value = h.value
    healthError.value = null
  } else if (!health.value) healthError.value = h.reason
  auditFailed.value = a.status === 'rejected'
  if (a.status === 'fulfilled') audit.value = a.value.items.filter((x) => /^(backoffice\.|impersonation\.)/.test(x.event) && x.event !== 'backoffice.reauth').slice(0, 6)
  loading.value = false
}

onMounted(load)
// Sayfa yenilemesiyle aynı tazelik: Yenile / 30 sn yoklaması `tick`'i artırır.
watch(
  () => props.tick,
  () => void load(),
)

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

const auditState = computed<PanelState>(() => (audit.value === null ? (auditFailed.value ? 'error' : 'loading') : audit.value.length ? 'ready' : 'empty'))
</script>

<style scoped>
.bo-td {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.bo-td__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-4);
  align-items: start;
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

@media (max-width: 767px) {

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

@media (max-width: 1099px) {
  .bo-td__grid {
    grid-template-columns: 1fr;
  }
}
</style>
