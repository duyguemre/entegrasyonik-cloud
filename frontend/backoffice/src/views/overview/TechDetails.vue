<!--
  TechDetails — genel bakışın AYRINTI katmanı (BO_UI_PATTERNS §11.4): bağımlılıklar ve podlar, kuyruk sayaçları, veri alımı,
  son yönetim işlemleri. Yalnız "Teknik ayrıntılar" açıldığında çizilir ve o an okur (ilk ekranda yük yok). Kart içerikleri
  BO-ELEV genel bakışından taşındı; davranış aynı.
-->
<template>
  <div class="bo-td">
    <!-- BO2-P2: üç sakin özet aynı satırda, eş yükseklik ve kenarlardan hizalı (BoTileGrid) -->
    <BoTileGrid :cols="3" data-testid="tech-row-1">
      <BoSection title="Bağımlılıklar" description="Hazırlık denetimi (/ready)" icon="mdi-server-network" :heading-level="3">
        <BoPanelState v-if="!health" :state="healthError ? 'error' : 'loading'" :error="healthError" :rows="3" @retry="load" />
        <BoPanelState v-else-if="health.dependencies.status === 'degraded'" state="degraded" degraded-title="Bağımlılık durumu okunamadı" :degraded-reason="health.dependencies.error" @retry="load" />
        <ul v-else class="bo-ov-deps">
          <li v-for="d in deps" :key="d.label">
            <span class="bo-ov-deps__label">{{ d.label }}</span>
            <span class="bo-ov-deps__hint">{{ d.hint }}</span>
            <EkStatusChip :tone="HEALTH[d.state].tone" :label="d.stateLabel ?? HEALTH[d.state].label" dot />
          </li>
        </ul>
      </BoSection>

      <BoSection title="Kuyruklar" description="BullMQ · DLQ: elle inceleme bekleyen kalıcı hatalar" icon="mdi-tray-full" :heading-level="3">
        <BoPanelState v-if="!health" :state="healthError ? 'error' : 'loading'" :error="healthError" skeleton="table" :rows="2" @retry="load" />
        <BoPanelState v-else-if="health.queues.status === 'degraded'" state="degraded" degraded-title="Kuyruk sayaçları okunamadı" :degraded-reason="health.queues.error" @retry="load" />
        <!-- Üçte bir genişlikte tablo yatay kayardı (BO2-71): kuyruk başına dört sayı kutusu. -->
        <ul v-else class="bo-ov-queues" aria-label="Kuyruk sayaçları">
          <li v-for="q in health.queues.items" :key="q.name">
            <p class="bo-ov-queue"><span>{{ QUEUE_LABEL[q.name] ?? q.name }}</span><span class="bo-ov-queue__code bo-id">{{ q.name }}</span></p>
            <p v-if="!q.available" class="bo-ov-queue__na"><v-icon icon="mdi-lan-disconnect" aria-hidden="true" /> Redis hazır değil — sayaçlar okunamıyor</p>
            <dl class="bo-ov-qstats">
              <template v-if="q.available">
                <div><dt>Bekleyen</dt><dd class="ek-num">{{ formatNumber(q.backlog) }}</dd></div>
                <div><dt>İşleniyor</dt><dd class="ek-num">{{ formatNumber(q.active) }}</dd></div>
                <div :class="{ 'bo-ov-bad': (q.failed ?? 0) > 0 }"><dt>Başarısız</dt><dd class="ek-num">{{ formatNumber(q.failed) }}</dd></div>
              </template>
              <div :class="{ 'bo-ov-bad': (q.dlqPending ?? 0) > 0 }"><dt>DLQ</dt><dd class="ek-num">{{ formatNumber(q.dlqPending) }}</dd></div>
            </dl>
          </li>
        </ul>
        <template #footer><RouterLink to="/motor" class="bo-link-more">Motor ve kuyruklar <v-icon icon="mdi-arrow-right" aria-hidden="true" /></RouterLink></template>
      </BoSection>

      <BoSection title="Veri alımı" description="Kanal başına yeni iş kabulü (intake)" icon="mdi-valve" :heading-level="3">
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
        <template #footer><p class="bo-ov-foot">Kısıtlı olmayan kanallar normal çalışır. Değişiklik: Entegrasyonlar › dayanıklılık (gerekçe + kimlik doğrulama).</p></template>
      </BoSection>
    </BoTileGrid>

    <!-- Ayrıntı listeleri: iki geniş kutu, eş yükseklik -->
    <BoTileGrid :cols="2" data-testid="tech-row-2">
      <BoSection title="Podlar" description="Son 15 dk içinde kira tutan ya da iş çalıştıran süreçler" icon="mdi-server" :heading-level="3">
        <BoPanelState v-if="!health" :state="healthError ? 'error' : 'loading'" :error="healthError" skeleton="table" :rows="3" @retry="load" />
        <BoPanelState v-else-if="health.pods.status === 'degraded'" state="degraded" degraded-title="Pod listesi okunamadı" :degraded-reason="health.pods.error" @retry="load" />
        <BoPanelState v-else-if="!health.pods.items.length" state="empty" empty-title="İş yapan pod yok" empty-text="Son 15 dakikada kira tutan ya da zamanlayıcı çalıştıran pod görülmedi." />
        <BoTableFrame v-else label="Podlar" flat>
          <template #head>
            <tr><th scope="col">Pod</th><th scope="col" class="is-num">Kira</th><th scope="col" class="is-num">Çalışan iş</th><th scope="col" class="is-num">Görüldü</th></tr>
          </template>
          <tr v-for="p in health.pods.items" :key="p.pod">
            <th scope="row" class="is-id">
              <span class="bo-ov-pod"><span class="bo-ov-pod__dot" aria-hidden="true"></span>{{ p.pod }}</span>
              <span v-if="p.self" class="bo-ov-pod__self">bu pod</span>
            </th>
            <td class="is-num ek-num">{{ p.activeLeases }}</td>
            <td class="is-num ek-num">{{ p.runningJobs }}</td>
            <td class="is-num is-muted"><EkRelativeTime :value="p.lastSeenAt" /></td>
          </tr>
        </BoTableFrame>
      </BoSection>

      <BoSection title="Son yönetim işlemleri" description="Yönetim yazmaları ve geçici erişimler · son 7 gün" icon="mdi-clipboard-text-clock-outline" :heading-level="3">
        <BoPanelState v-if="auditState !== 'ready'" :state="auditState" skeleton="table" :rows="4" empty-title="Son 7 günde yönetim işlemi yok" @retry="load" />
        <ul v-else class="bo-ov-audit">
          <li v-for="a in audit" :key="a.id">
            <span class="bo-ov-audit__time"><EkRelativeTime :value="a.at" /></span>
            <span class="bo-ov-audit__main">
              <span class="bo-ov-audit__op">{{ a.meta?.op ?? a.event }}</span>
              <span v-if="a.meta?.reason" class="bo-ov-audit__reason" :title="String(a.meta.reason)">“{{ a.meta.reason }}”</span>
            </span>
            <RouterLink v-if="a.reqId" class="bo-ov-audit__open" :to="{ path: '/denetim', query: { reqId: a.reqId } }" :aria-label="`Denetim kaydını aç: ${a.meta?.op ?? a.event}`" :title="a.event">
              <v-icon icon="mdi-arrow-top-right" aria-hidden="true" />
            </RouterLink>
          </li>
        </ul>
        <template #footer><RouterLink to="/denetim" class="bo-link-more">Tüm denetim kayıtları <v-icon icon="mdi-arrow-right" aria-hidden="true" /></RouterLink></template>
      </BoSection>
    </BoTileGrid>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { EkRelativeTime, EkStatusChip, type StatusTone } from '@entegrasyonik/ui/components'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
import BoTableFrame from '@bo/components/r2/BoTableFrame.vue'
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

.bo-link-more {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
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

.bo-ov-queue > span:first-child {
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
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-ov-audit {
  margin: 0;
  padding: 0;
  list-style: none;
}

.bo-ov-audit li {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) 28px;
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
    grid-template-areas: 'time open' 'main open';
    gap: var(--ek-space-1) var(--ek-space-3);
    padding: var(--ek-space-2) 0;
  }

  .bo-ov-audit__time {
    grid-area: time;
  }

  .bo-ov-audit__main {
    grid-area: main;
  }

  .bo-ov-audit__open {
    grid-area: open;
  }

  .bo-ov-audit__reason {
    white-space: normal;
  }
}

.bo-ov-queues {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.bo-ov-queue {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--ek-space-2);
  margin: 0 0 var(--ek-space-2);
}

.bo-ov-queue__na {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin: 0 0 var(--ek-space-2);
  color: var(--ek-color-warning-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bo-ov-qstats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-2);
  margin: 0;
}

.bo-ov-qstats > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-muted);
}

.bo-ov-qstats dt {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-ov-qstats dd {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.bo-ov-qstats .bo-ov-bad dd {
  color: var(--ek-color-error-emphasis);
}

/* ================= BO-LOCAL-01 — teknik ayrıntılar: uygulamanın tasarım diliyle =================
   Kuyruk sayaçları tek şeritte, hücreler ince çizgiyle ayrılır (ayrı kutucuklar değil); tablo kutu köşeli; denetim
   satırındaki "aç" düğmesi çerçeveli ikon kutusu; "tümü" bağlantısının oku token hızıyla kayar. */
.bo-table-wrap--flat {
  border-radius: var(--ek-radius-tile);
}

.bo-ov-qstats {
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-border-subtle);
}

.bo-ov-qstats > div {
  border: 0;
  border-radius: 0;
  background: var(--ek-color-surface);
}

.bo-ov-audit li:last-child {
  border-bottom: 0;
}

.bo-ov-audit__open {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
  transition: var(--ek-transition-colors);
}

.bo-ov-audit__open:hover {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.bo-link-more .v-icon {
  transition: transform var(--ek-motion-feedback);
}

.bo-ov-intake-ok {
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-success-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-success-subtle);
}
</style>
