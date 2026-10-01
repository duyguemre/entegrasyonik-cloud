<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="loadedAt ?? undefined">
      <template #meta>
        <span>Sekme açıkken 30 saniyede bir kendiliğinden yenilenir.</span>
      </template>
      <template #actions>
        <EkRefreshButton :loading="list.refreshing.value || list.phase.value === 'loading'" @refresh="list.reload({ keep: true })" />
      </template>
    </BoPageHeader>

    <EkAlert
      v-if="hasShadow"
      tone="info"
      dense
      title="Gölge modda uyarılar var"
      text="Gölge moddaki kurallar kayıt tutar ama e-posta ya da müşteri bildirimi göndermez; eşikler doğrulanana kadar böyle çalışır."
    />

    <div class="bo-toolbar">
      <div class="bo-seg" role="radiogroup" aria-label="Uyarı durumu">
        <button v-for="o in STATUS_OPTS" :key="o.value" type="button" role="radio" class="bo-seg__opt" :aria-checked="status === o.value" :data-status="o.value" @click="status = o.value">{{ o.label }}</button>
      </div>
      <div class="bo-seg" role="radiogroup" aria-label="Önem">
        <button v-for="o in LEVEL_OPTS" :key="o.value" type="button" role="radio" class="bo-seg__opt" :aria-checked="level === o.value" @click="level = o.value">{{ o.label }}</button>
      </div>
      <v-select v-model="rule" :items="RULE_OPTS" label="Kural" density="compact" hide-details clearable class="bo-toolbar__field" />
    </div>

    <EkCard flush>
      <StateBlock
        :phase="list.phase.value"
        :error="list.error.value"
        :retrying="list.phase.value === 'loading'"
        :empty-title="status === 'firing' ? 'Etkin uyarı yok' : 'Uyarı yok'"
        :empty-message="status === 'firing' ? 'Tüm kurallar eşiklerin altında. Çözülen uyarılar 30 gün saklanır.' : 'Süzgece uyan uyarı bulunmuyor.'"
        :empty-variant="status === 'firing' && level === 'all' && !rule ? 'no-data' : 'no-results'"
        @retry="list.reload()"
      >
        <EkDataTable :items="rows" :columns="COLUMNS" row-key="id">
          <template #cell-rule="{ item }">
            <span class="bo-cell-stack">
              <span class="bo-al__rule"><code class="bo-code">{{ item.ruleId }}</code> {{ ruleInfo(item as AlertRow).label }}</span>
              <span class="bo-mono bo-muted">{{ item.scopeKey }}</span>
            </span>
          </template>
          <template #cell-state="{ item }">
            <span class="bo-al__chips">
              <EkStatusChip :tone="ALERT_LEVEL[(item as AlertRow).level].tone" :label="ALERT_LEVEL[(item as AlertRow).level].label" dot />
              <EkStatusChip v-if="item.status === 'resolved'" tone="success" label="Çözüldü" />
              <EkStatusChip v-if="item.shadow" tone="neutral" label="Gölge" icon="mdi-eye-off-outline" />
              <EkStatusChip v-if="isMuted(item as AlertRow)" tone="neutral" icon="mdi-bell-off-outline" :label="`Susturuldu · ${formatDateTime((item as AlertRow).mutedUntil!)}`" data-testid="muted-chip" />
            </span>
          </template>
          <template #cell-detail="{ item }">
            <span class="bo-al__detail">{{ detailText(item as AlertRow) }}</span>
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
              <EkButton v-if="isMuted(item as AlertRow)" size="sm" tone="ghost" icon="mdi-bell-ring-outline" data-testid="unmute" @click="openMute(item as AlertRow, 0)">Susturmayı kaldır</EkButton>
              <EkButton v-else size="sm" tone="secondary" icon="mdi-bell-off-outline" data-testid="mute" @click="openMute(item as AlertRow, 4)">Sustur</EkButton>
            </span>
          </template>
        </EkDataTable>
        <LoadMore :count="list.items.value.length" :has-more="list.hasMore.value" :loading="list.loadingMore.value" :error="list.moreError.value" @more="list.loadMore()" />
      </StateBlock>
    </EkCard>

    <section class="bo-panel bo-al__rules" aria-labelledby="bo-al-rules">
      <h2 id="bo-al-rules" class="bo-panel__title">Kurallar</h2>
      <dl class="bo-kv">
        <div v-for="(r, k) in ALERT_RULE" :key="k"><dt><code class="bo-code">{{ k }}</code> {{ r.label }}</dt><dd>{{ r.hint }}</dd></div>
      </dl>
      <p class="bo-muted bo-al__note">Susturma ve bakım modu bildirimi bastırır, kayıt sürer. Aynı uyarı için yeniden bildirim kritikte 4 saat, uyarıda 24 saat sonra gider.</p>
    </section>

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
import { useRouter } from 'vue-router'
import { EkAlert, EkButton, EkCard, EkDataTable, EkRefreshButton, EkRelativeTime, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { AlertLevel, AlertRow, AlertStatus } from '@bo/api/contract'
import { useCursorList } from '@bo/composables/useCursorList'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import LoadMore from '@bo/components/kit/LoadMore.vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import { ALERT_LEVEL, ALERT_RULE, CHANNEL } from '@bo/utils/labels'
import { formatDateTime } from '@bo/utils/format'
import { notifyAudited } from '@bo/utils/toast'
import '@bo/styles/kit.css'

const POLL_MS = 30_000
const STATUS_OPTS: Array<{ value: AlertStatus | 'all'; label: string }> = [
  { value: 'firing', label: 'Etkin' },
  { value: 'resolved', label: 'Çözüldü' },
  { value: 'all', label: 'Tümü' },
]
const LEVEL_OPTS: Array<{ value: AlertLevel | 'all'; label: string }> = [
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
const status = ref<AlertStatus | 'all'>('firing')
const level = ref<AlertLevel | 'all'>('all')
const rule = ref<string | null>(null)
const loadedAt = ref<number | null>(null)

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
const hasShadow = computed(() => list.items.value.some((a) => a.shadow && a.status === 'firing'))

const ruleInfo = (a: AlertRow) => ALERT_RULE[a.ruleId] ?? { label: 'Kural', hint: '' }
const isMuted = (a: AlertRow) => !!a.mutedUntil && Date.parse(a.mutedUntil) > Date.now()
const tidOf = (a: AlertRow) => (typeof a.detail.tid === 'number' && a.detail.tid > 0 ? a.detail.tid : null)
const integ = (v: unknown) => (typeof v === 'string' ? (CHANNEL[v] ?? v) : '—')
function detailText(a: AlertRow): string {
  const d = a.detail
  if (a.ruleId === 'R1') return `${integ(d.integ)}: ${d.errors}/${d.total} çağrı hatalı (%${Math.round(Number(d.rate) * 100)})`
  if (a.ruleId === 'R2' && 'authErrors' in d) return `${integ(d.integ)}: ${d.authErrors} kimlik hatası (15 dk)`
  if (a.ruleId === 'R2') return `${integ(d.integ)}: ${d.openCircuits} devre kesici açık · ${Math.round(Number(d.openForSec) / 60)} dk`
  if (a.ruleId === 'R4') return `${d.wait} bekleyen iş · en eski ${Math.round(Number(d.oldestWaitSec) / 60)} dk`
  if (a.ruleId === 'R7') return `Son saatte ${d.dead} kalıcı hatalı teslim`
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
  },
)

// ---------------------------------------------------------------- 30 sn yoklama (SSE yok; sekme gizliyken durur)
let poll: ReturnType<typeof setInterval> | undefined
function tick() {
  if (document.visibilityState === 'visible' && !mute.isOpen.value && list.phase.value !== 'loading') list.reload({ keep: true })
}
watch([status, level, rule], () => list.reload())
onMounted(() => {
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
.bo-al__detail {
  margin-right: var(--ek-space-2);
}
.bo-al__tid {
  font-size: var(--ek-type-caption-size);
}
.bo-al__rules {
  margin-top: var(--ek-space-2);
}
.bo-al__note {
  margin: var(--ek-space-3) 0 0;
  font-size: var(--ek-type-caption-size);
}
</style>
