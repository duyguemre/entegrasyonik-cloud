<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="loadedAt ?? undefined" :stale="stale" :auto-refresh="30" refreshable :refreshing="list.refreshing.value || list.phase.value === 'loading' || firingSrc.refreshing.value" @refresh="refresh">
      <template #actions>
        <CopyViewLink />
      </template>
    </BoPageHeader>

    <PageVerdict :verdict="verdict" />

    <EkAlert
      v-if="hasShadow"
      tone="info"
      dense
      title="Gölge modda uyarılar var"
      text="Gölge moddaki kurallar kayıt tutar ama e-posta ya da müşteri bildirimi göndermez; eşikler doğrulanana kadar böyle çalışır."
    />

    <PushCard />

    <BoSection id="bo-al-list" title="Uyarılar" description="Kurallara göre üretilen etkin ve çözülmüş uyarılar." icon="mdi-bell-alert-outline" :count="list.items.value.length">
      <BoFilterBar label="Uyarı süzgeçleri" :active="activeFilters" @clear="clearFilters">
        <BoSegmented v-model="status" label="Uyarı durumu" :options="STATUS_OPTS" />
        <BoSegmented v-model="level" label="Önem" :options="LEVEL_OPTS" />
        <v-select v-model="rule" :items="RULE_OPTS" label="Kural" density="compact" hide-details clearable class="bo-toolbar__field" />
      </BoFilterBar>
      <BoDataTable
        :items="rows"
        :columns="COLUMNS"
        row-key="id"
        label="Uyarılar"
        :phase="list.phase.value"
        :error="list.error.value"
        :empty-title="status === 'firing' ? 'Etkin uyarı yok' : 'Uyarı yok'"
        :empty-message="status === 'firing' ? 'Tüm kurallar eşiklerin altında. Çözülen uyarılar 30 gün saklanır.' : 'Süzgece uyan uyarı bulunmuyor.'"
        @retry="list.reload()"
      >
        <template #cell-rule="{ item }">
          <span class="bo-cell-stack">
            <span class="bo-al__rule"><code class="bo-code">{{ item.ruleId }}</code> {{ ruleInfo(item as AlertRow).label }}</span>
            <span class="bo-mono bo-muted">{{ item.scopeKey }}</span>
          </span>
        </template>
        <template #cell-state="{ item }">
          <span class="bo-cell-stack">
            <span class="bo-al__chips">
              <EkStatusChip :tone="ALERT_LEVEL[(item as AlertRow).level].tone" :label="ALERT_LEVEL[(item as AlertRow).level].label" dot />
              <EkStatusChip v-if="item.status === 'resolved'" tone="success" label="Çözüldü" />
            </span>
            <!-- NT-08: gölge/susturma rozet değil, ikinci satır metin (satır 2 satırı geçmez). -->
            <span v-if="item.shadow || isMuted(item as AlertRow)" class="bo-muted bo-al__sub">
              <span v-if="item.shadow" data-testid="shadow-note">Gölge</span>
              <span v-if="item.shadow && isMuted(item as AlertRow)" aria-hidden="true"> · </span>
              <span v-if="isMuted(item as AlertRow)" data-testid="muted-chip">Susturuldu · {{ muteUntilText((item as AlertRow).mutedUntil!) }}</span>
            </span>
          </span>
        </template>
        <template #cell-detail="{ item }">
          <span class="bo-al__detail ek-num">{{ detailText(item as AlertRow) }}</span>
          <RouterLink v-if="tidOf(item as AlertRow)" :to="`/musteriler/${tidOf(item as AlertRow)}`" class="ek-num bo-al__tid">#{{ tidOf(item as AlertRow) }}</RouterLink>
        </template>
        <template #cell-time="{ item }">
          <span class="bo-cell-stack bo-al__time">
            <span v-if="item.status === 'resolved' && item.resolvedAt">Çözüldü <EkRelativeTime :value="(item as AlertRow).resolvedAt!" /></span>
            <span v-else>Başladı <EkRelativeTime :value="(item as AlertRow).firstFiredAt" /></span>
            <span>son görülme <EkRelativeTime :value="(item as AlertRow).lastSeenAt" /></span>
          </span>
        </template>
        <template #cell-actions="{ item }">
          <span v-if="item.status === 'firing'" class="bo-row-actions">
            <EkButton v-if="isMuted(item as AlertRow)" size="sm" tone="ghost" icon="mdi-bell-ring-outline" :aria-label="`Susturmayı kaldır: ${rowName(item as AlertRow)}`" data-testid="unmute" @click="openMute(item as AlertRow, 0)">Susturmayı kaldır</EkButton>
            <EkButton v-else size="sm" tone="secondary" icon="mdi-bell-off-outline" :aria-label="`Sustur: ${rowName(item as AlertRow)}`" data-testid="mute" @click="openMute(item as AlertRow, 4)">Sustur</EkButton>
          </span>
        </template>
        <template v-if="list.phase.value === 'ready'" #footer>
          <BoPagination :count="list.items.value.length" :has-more="list.hasMore.value" :loading="list.loadingMore.value" :error="list.moreError.value" @more="list.loadMore()" />
        </template>
      </BoDataTable>
    </BoSection>

    <BoSection id="bo-al-rules" title="Kurallar" description="Susturma ve bakım modu bildirimi bastırır, kayıt sürer. Aynı uyarı için yeniden bildirim kritikte 4 saat, uyarıda 24 saat sonra gider." icon="mdi-format-list-checks">
      <dl class="bo-kv">
        <div v-for="(r, k) in ALERT_RULE" :key="k"><dt><code class="bo-code">{{ k }}</code> {{ r.label }}</dt><dd>{{ r.hint }}</dd></div>
      </dl>
    </BoSection>

    <GuardedDialog
      :action="mute"
      :title="hours === 0 ? 'Susturma kaldırılsın mı?' : 'Uyarı susturulsun mu?'"
      :reversible="true"
      :reversible-note="hours === 0 ? 'Yeniden susturabilirsiniz.' : 'Süre dolmadan susturmayı kaldırabilirsiniz.'"
      :description="mute.context.value ? `${mute.context.value.ruleId} · ${mute.context.value.scopeKey}` : ''"
      :scope="mute.context.value?.scopeKey"
      icon="mdi-bell-off-outline"
      :items="muteItems"
      :confirm-label="hours === 0 ? 'Susturmayı kaldır' : 'Gerekçeyle sustur'"
      :confirm-icon="hours === 0 ? 'mdi-bell-ring-outline' : 'mdi-bell-off-outline'"
    >
      <v-select v-if="hours !== 0" v-model="hours" :items="HOURS" label="Süre" density="compact" hide-details data-testid="mute-hours" />
    </GuardedDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkAlert, EkButton, EkRelativeTime, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { AlertLevel, AlertRow, AlertStatus } from '@bo/api/contract'
import { useCursorList } from '@bo/composables/useCursorList'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import CopyViewLink from '@bo/components/CopyViewLink.vue'
import { useVerdictSources } from '@bo/composables/useVerdictSources'
import { alertsVerdict, muteUntilText } from './notificationsVerdict'
import PushCard from '@bo/pwa/PushCard.vue'
import BoPagination from '@bo/components/r2/BoPagination.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoFilterBar from '@bo/components/r2/BoFilterBar.vue'
import BoSegmented, { type BoSegmentOption } from '@bo/components/r2/BoSegmented.vue'
import BoDataTable from '@bo/components/r2/BoDataTable.vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import { ALERT_LEVEL, ALERT_RULE, CHANNEL } from '@bo/utils/labels'
import { formatDateTime } from '@bo/utils/format'
import { formatCount } from '@bo/utils/units'
import { notifyAudited } from '@bo/utils/toast'
import '@bo/styles/kit.css'

const POLL_MS = 30_000
const STATUS_OPTS: Array<BoSegmentOption<AlertStatus | 'all'>> = [
  { value: 'firing', label: 'Etkin' },
  { value: 'resolved', label: 'Çözüldü' },
  { value: 'all', label: 'Tümü' },
]
const LEVEL_OPTS: Array<BoSegmentOption<AlertLevel | 'all'>> = [
  { value: 'all', label: 'Tüm önemler' },
  { value: 'critical', label: 'Kritik' },
  { value: 'warning', label: 'Uyarı' },
]
const RULE_OPTS = Object.entries(ALERT_RULE).map(([k, r]) => ({ title: `${k} · ${r.label}`, value: k }))
const HOURS = [
  { title: '1 saat', value: 1 },
  { title: '4 saat', value: 4 },
  { title: '24 saat', value: 24 },
  { title: '3 gün', value: 72 },
  { title: '7 gün', value: 168 },
  { title: '14 gün (en çok)', value: 336 },
]
const COLUMNS: EkTableColumn[] = [
  { key: 'rule', label: 'Kural ve kapsam' },
  { key: 'state', label: 'Durum' },
  { key: 'detail', label: 'Ayrıntı' },
  { key: 'time', label: 'Zaman' },
  { key: 'actions', label: '', type: 'actions' },
]

const router = useRouter()
const route = useRoute()
// NT-03: süzgeçler URL'de (?durum=, ?onem=, ?kural=); varsayılan "Etkin" yazılmaz.
// Genel bakış (getAttention) sözleşme adlarıyla da gelir: `status` → durum, `ruleId` → kural (BO_UI_PATTERNS §11.6).
const ALIAS: Record<string, string> = { durum: 'status', kural: 'ruleId' }
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const qs = (k: string) => str(route.query[k]) || (ALIAS[k] ? str(route.query[ALIAS[k]]) : '')
const status = ref<AlertStatus | 'all'>(['firing', 'resolved', 'all'].includes(qs('durum')) ? (qs('durum') as AlertStatus | 'all') : 'firing')
const level = ref<AlertLevel | 'all'>(['critical', 'warning'].includes(qs('onem')) ? (qs('onem') as AlertLevel) : 'all')
const rule = ref<string | null>(qs('kural') in ALERT_RULE ? qs('kural') : null)
const loadedAt = ref<number | null>(null)

// Hüküm: süzgeçten bağımsız etkin uyarılar (liste süzgeçliyse hüküm yanlış olmasın).
const firingSrc = useVerdictSources({ firing: () => api.call('BackofficeNotificationService/listAlerts', { status: 'firing', limit: 100 }) })
const stale = computed(() => firingSrc.stale.value)
const verdict = computed(() =>
  firingSrc.settled.value
    ? alertsVerdict({
        firing: firingSrc.sources.firing.data.value?.items ?? null,
        failed: firingSrc.failed('firing'),
        stale: firingSrc.stale.value,
        now: Date.now(),
        retry: () => void firingSrc.load(),
        mute: (a) => openMute(a, 4),
      })
    : null,
)
function refresh() {
  void firingSrc.load()
  list.reload({ keep: true })
}

const list = useCursorList<AlertRow>(async (cursor) => {
  const res = await api.call('BackofficeNotificationService/listAlerts', {
    ...(status.value !== 'all' ? { status: status.value } : {}),
    ...(level.value !== 'all' ? { level: level.value } : {}),
    ...(rule.value ? { ruleId: rule.value } : {}),
    cursor,
    limit: 50,
  })
  loadedAt.value = Date.now()
  return res
})
const rows = computed(() => list.items.value as unknown as Array<Record<string, unknown>>)
const activeFilters = computed(() => (status.value !== 'firing' ? 1 : 0) + (level.value !== 'all' ? 1 : 0) + (rule.value ? 1 : 0))
function clearFilters() {
  status.value = 'firing'
  level.value = 'all'
  rule.value = null
}
const hasShadow = computed(() => list.items.value.some((a) => a.shadow && a.status === 'firing'))

const ruleInfo = (a: AlertRow) => ALERT_RULE[a.ruleId] ?? { label: 'Kural', hint: '' }
/** Satır düğmesinin benzersiz adı (görünen fiil başta + kural + kapsam): "Sustur: Entegrasyon hata oranı · R1:trendyol". */
const rowName = (a: AlertRow) => `${ruleInfo(a).label} · ${a.scopeKey}`
const isMuted = (a: AlertRow) => !!a.mutedUntil && Date.parse(a.mutedUntil) > Date.now()
const tidOf = (a: AlertRow) => (typeof a.detail.tid === 'number' && a.detail.tid > 0 ? a.detail.tid : null)
const integ = (v: unknown) => (typeof v === 'string' ? (CHANNEL[v] ?? v) : '—')
function detailText(a: AlertRow): string {
  const d = a.detail
  // Sayılar binlik ayırıcıyla (formatCount); hücre `ek-num` (eşit genişlikli rakam).
  const n = (v: unknown) => formatCount(Number(v))
  if (a.ruleId === 'R1') return `${integ(d.integ)}: ${n(d.errors)}/${n(d.total)} çağrı hatalı (%${Math.round(Number(d.rate) * 100)})`
  if (a.ruleId === 'R2' && 'authErrors' in d) return `${integ(d.integ)}: ${n(d.authErrors)} kimlik hatası (15 dk)`
  if (a.ruleId === 'R2') return `${integ(d.integ)}: ${n(d.openCircuits)} devre kesici açık · ${n(Math.round(Number(d.openForSec) / 60))} dk`
  if (a.ruleId === 'R4') return `${n(d.wait)} bekleyen iş · en eski ${n(Math.round(Number(d.oldestWaitSec) / 60))} dk`
  if (a.ruleId === 'R7') return `Son saatte ${n(d.dead)} kalıcı hatalı teslim`
  return Object.entries(d)
    .map(([k, v]) => `${k}=${v}`)
    .join(' · ')
}

// ---------------------------------------------------------------- susturma (step-up + gerekçe)
const hours = ref(4)
const muteItems = computed(() =>
  hours.value === 0
    ? ['Uyarı yeniden bildirim üretebilir (bekleme süresi kurallarına göre).', 'Gerekçe denetim kaydına yazılır.']
    : ['Seçilen süre boyunca bu uyarı için e-posta ve müşteri bildirimi gitmez; kayıt ve panel görünümü sürer.', 'Uyarı çözülürse susturma anlamını yitirir. Gerekçe denetim kaydına yazılır.'],
)
function openMute(a: AlertRow, h: number) {
  hours.value = h
  mute.open(a)
}
const mute = useGuardedAction(
  (a: AlertRow, reason) => api.call('BackofficeNotificationService/muteAlert', { ruleId: a.ruleId, scopeKey: a.scopeKey, hours: hours.value, reason }),
  (r) => {
    notifyAudited(r.mutedUntil ? `Uyarı ${formatDateTime(r.mutedUntil)} tarihine kadar susturuldu.` : 'Susturma kaldırıldı.', () => router.push({ path: '/denetim', query: { event: 'backoffice.write' } }))
    list.reload({ keep: true })
    void firingSrc.load()
  },
)

// ---------------------------------------------------------------- 30 sn yoklama (SSE yok; sekme gizliyken durur)
let poll: ReturnType<typeof setInterval> | undefined
function tick() {
  if (document.visibilityState === 'visible' && !mute.isOpen.value && list.phase.value !== 'loading') {
    list.reload({ keep: true })
    void firingSrc.load()
  }
}
// Hüküm bağlantıları aynı sayfada yalnız sorgu değiştirir: sorgu → süzgeç (tarayıcı geri/ileri dahil).
watch(
  () => [qs('durum'), qs('onem'), qs('kural')],
  ([d, o, k]) => {
    const ns = ['firing', 'resolved', 'all'].includes(d) ? (d as AlertStatus | 'all') : 'firing'
    const nl = ['critical', 'warning'].includes(o) ? (o as AlertLevel) : 'all'
    const nr = k in ALERT_RULE ? k : null
    if (ns !== status.value) status.value = ns
    if (nl !== level.value) level.value = nl
    if (nr !== rule.value) rule.value = nr
  },
)
watch([status, level, rule], () => {
  router.replace({
    query: {
      ...(status.value !== 'firing' ? { durum: status.value } : {}),
      ...(level.value !== 'all' ? { onem: level.value } : {}),
      ...(rule.value ? { kural: rule.value } : {}),
    },
  })
  list.reload()
})
onMounted(() => {
  void firingSrc.load()
  list.reload()
  poll = setInterval(tick, POLL_MS)
})
onBeforeUnmount(() => clearInterval(poll))
</script>

<style scoped>
.bo-al__rule {
  font-weight: var(--ek-font-weight-medium);
}
/* Zaman sütunu kırılmaz (BO-ELEV TB-4): kısa göreli zaman + tek satır. */
.bo-al__time > span {
  white-space: nowrap;
}
.bo-al__chips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}
.bo-al__sub {
  white-space: nowrap;
  font-size: var(--ek-type-caption-size);
}
.bo-al__detail {
  margin-right: var(--ek-space-2);
}
.bo-al__tid {
  font-size: var(--ek-type-caption-size);
}
</style>
