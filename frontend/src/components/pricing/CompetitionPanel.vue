<!--
  PRC-R1 — ürün düzenleme ekranı "Rekabet ve kâr" bölümü (Trendyol, SALT OKUMA; pazaryerine hiçbir yazma yok).
  Veri: PricingService/previewMargin (≤50 varyant) + listBuybox (tazeleme zamanı, ayar özeti, kanal destek tablosu) +
  getBuyboxHistory (30 gün). Dürüstlük: bilinmeyen değer "—" (0 değil); son güncelleme / bir sonraki tazeleme açık yazılır;
  bayat veri etiketlenir; maliyet yoksa kâr alanları "—" ve "maliyet girin" yönlendirmesi.
  Durumlar: yükleniyor (iskelet) · hata (yeniden dene) · yetki yok · boş (kayıtlı varyant yok) · özellik kapalı (bilgi).
-->
<template>
  <section class="cp" aria-labelledby="cp-title" data-testid="competition-panel">
    <header class="cp__head">
      <div class="cp__titles">
        <h2 id="cp-title" class="cp__title">{{ t('pricing.panel.title') }}</h2>
        <p class="cp__sub">{{ t('pricing.panel.subtitle') }}</p>
      </div>
      <EkButton v-if="state === 'ready'" size="sm" tone="ghost" icon="mdi-refresh" :aria-label="t('pricing.panel.reload')" @click="load">{{ t('pricing.panel.reload') }}</EkButton>
    </header>

    <EkSkeleton v-if="state === 'loading'" type="detail" />

    <EkErrorState v-else-if="state === 'error'" size="inline" :message="t('pricing.panel.error')" :retrying="false" @retry="load" />

    <EkEmptyState v-else-if="state === 'unauthorized'" variant="no-data" :title="t('pricing.panel.unauthorizedTitle')" :message="t('pricing.panel.unauthorized')" />

    <EkEmptyState v-else-if="state === 'empty'" variant="no-data" :title="t('pricing.panel.emptyTitle')" :message="t('pricing.panel.empty')" />

    <div v-else class="cp__body">
      <EkAlert v-if="!settings?.enabled" tone="info" dense :text="t('pricing.panel.disabled')" />

      <div v-if="options.length > 1" class="cp__select">
        <v-select v-model="selectedId" :items="options" item-title="title" item-value="value" density="compact" variant="outlined" hide-details
          :label="t('pricing.panel.variant')" />
        <p v-if="truncated" class="cp__muted">{{ t('pricing.panel.truncated', { count: PREVIEW_MAX }) }}</p>
      </div>

      <template v-if="view">
        <EkAlert v-if="view.belowFloor" tone="warning" live :title="t('pricing.panel.belowFloorTitle')"
          :text="t('pricing.panel.belowFloor', { floor: formatMoney(view.breakEven), price: formatMoney(view.buyboxPrice) })" />

        <EkAlert v-if="!view.rulesEligible && view.ineligibleReasons.length" tone="info" :title="t('pricing.panel.ineligibleTitle')">
          <span>{{ ineligibleText }}</span>
          <button v-if="view.costMissing" type="button" class="cp__link" data-testid="cost-link" @click="emit('focus-cost')">{{ t('pricing.panel.enterCost') }}</button>
        </EkAlert>

        <dl class="cp__grid">
          <div class="cp__cell">
            <dt>{{ t('pricing.field.status') }}</dt>
            <dd>
              <EkStatusChip :tone="statusTone" :icon="statusIcon" :label="t(`pricing.status.${view.status}`)" />
              <span v-if="view.order !== null" class="cp__muted ek-num">{{ t('pricing.field.order', { order: view.order }) }}</span>
              <span v-if="view.stale" class="cp__stale" data-testid="stale-label"><v-icon icon="mdi-clock-alert-outline" aria-hidden="true" />{{ t('pricing.panel.stale') }}</span>
            </dd>
          </div>
          <div class="cp__cell"><dt>{{ t('pricing.field.buyboxPrice') }}</dt><dd class="ek-num">{{ money(view.buyboxPrice) }}</dd></div>
          <div class="cp__cell"><dt>{{ t('pricing.field.ownPrice') }}</dt><dd class="ek-num">{{ money(view.ownPrice) }}</dd></div>
          <div class="cp__cell"><dt>{{ t('pricing.field.gap') }}</dt><dd class="ek-num">{{ gapText }}</dd></div>
          <div class="cp__cell"><dt>{{ t('pricing.field.profitNow') }}</dt><dd class="ek-num" :class="profitClass(view.profitNow)">{{ money(view.profitNow) }}</dd></div>
          <div class="cp__cell"><dt>{{ t('pricing.field.profitAtBuybox') }}</dt><dd class="ek-num" :class="profitClass(view.profitAtBuybox)">{{ money(view.profitAtBuybox) }}</dd></div>
          <div class="cp__cell"><dt>{{ t('pricing.field.breakEven') }}</dt><dd class="ek-num">{{ money(view.breakEven) }}</dd></div>
          <div class="cp__cell">
            <dt>{{ t('pricing.field.commission') }}</dt>
            <dd><span class="ek-num">{{ view.commissionRate === null ? '—' : formatPercent(view.commissionRate / 100) }}</span>
              <span class="cp__muted"> · {{ t(`pricing.commission.${view.commissionSource}`) }}</span></dd>
          </div>
        </dl>

        <p v-if="view.costMissing" class="cp__muted" data-testid="cost-hint">
          {{ t('pricing.panel.costHint') }}
        </p>
        <p v-else-if="view.missing.length" class="cp__muted" data-testid="missing-note">{{ t('pricing.panel.missing', { list: missingText }) }}</p>

        <ul class="cp__times" :aria-label="t('pricing.panel.freshness')">
          <li>
            <span class="cp__muted">{{ t('pricing.field.lastUpdate') }}</span>
            <span v-if="lastCheckedAt" class="ek-num">{{ formatDateTime(lastCheckedAt) }}</span>
            <span v-else>{{ t('pricing.refresh.never') }}</span>
          </li>
          <li>
            <span class="cp__muted">{{ t('pricing.field.nextRefresh') }}</span>
            <span data-testid="next-refresh">{{ refreshText }}</span>
          </li>
        </ul>

        <div class="cp__chart">
          <h3 class="cp__h3">{{ t('pricing.chart.title', { days: 30 }) }}</h3>
          <p v-if="!selectedBarcode" class="cp__muted">{{ t('pricing.chart.noBarcode') }}</p>
          <BuyboxSparkline v-else :points="history" :loading="historyState === 'loading'" :error="historyState === 'error'" :days="30" @retry="loadHistory" />
        </div>
      </template>

      <div v-if="channels.length" class="cp__channels">
        <h3 class="cp__h3">{{ t('pricing.channels.title') }}</h3>
        <ul class="cp__chanlist">
          <li v-for="c in channels" :key="c.code" :data-channel-level="c.level">
            <span>{{ c.displayName }}</span>
            <EkStatusChip :tone="c.level === 'not_supported' ? 'neutral' : 'info'" :label="t(`pricing.level.${c.level}`)" />
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EkAlert, EkButton, EkEmptyState, EkErrorState, EkSkeleton, EkStatusChip } from '@entegrasyonik/ui/components'
import { formatDateTime, formatMoney, formatPercent } from '@entegrasyonik/ui/format'
import { useChoicesStore } from '@/stores/choicesStore'
import BuyboxSparkline from './BuyboxSparkline.vue'
import {
  defaultVariantId, marginView, refreshInfo, usePricingApi,
  type BuyboxRow, type BuyboxSettings, type ChannelSupport, type HistoryPoint, type MarginItem,
} from '@/composables/usePricingApi'

const PREVIEW_MAX = 50
const props = defineProps<{ productId: string; variants: any[] }>()
const emit = defineEmits<{ 'focus-cost': [] }>()
const { t } = useI18n()
const api = usePricingApi()
const choicesStore = useChoicesStore()

const state = ref<'loading' | 'ready' | 'error' | 'unauthorized' | 'empty'>('loading')
const items = ref<MarginItem[]>([])
const rows = ref<BuyboxRow[]>([])
const settings = ref<BuyboxSettings | null>(null)
const channels = ref<ChannelSupport[]>([])
const selectedId = ref<string | null>(null)
const history = ref<HistoryPoint[]>([])
const historyState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')

const saved = computed(() => (props.variants ?? []).filter((v: any) => v?._id))
const truncated = computed(() => saved.value.length > PREVIEW_MAX)

const variantLabel = (v: any) => {
  const opts = (v?.choices ?? []).map((c: any) => choicesStore.getDirectChoiceValueTitle(c.choiceValueId)).filter(Boolean).join(' / ')
  return [opts, v?.stockcode || v?.barcode].filter(Boolean).join(' · ') || t('pricing.panel.variantFallback')
}
const options = computed(() => items.value.filter((i) => i.found && i.variantId).map((i) => {
  const v = saved.value.find((x: any) => String(x._id) === i.variantId)
  return { title: variantLabel(v), value: i.variantId as string }
}))

const current = computed(() => items.value.find((i) => i.variantId === selectedId.value))
const view = computed(() => (current.value ? marginView(current.value) : null))
const currentRow = computed(() => rows.value.find((r) => r.variantId === selectedId.value))
const selectedBarcode = computed(() => current.value?.barcode ?? currentRow.value?.barcode ?? null)
const lastCheckedAt = computed(() => currentRow.value?.checkedAt ?? view.value?.observedAt ?? null)

const money = (n: number | null) => (n === null ? '—' : formatMoney(n))
const profitClass = (n: number | null) => (n === null ? 'is-unknown' : n < 0 ? 'is-loss' : '')
const statusTone = computed(() => (view.value?.status === 'winning' ? 'success' : view.value?.status === 'losing' ? 'warning' : 'neutral'))
const statusIcon = computed(() => (view.value?.status === 'winning' ? 'mdi-check-circle-outline' : view.value?.status === 'losing' ? 'mdi-alert-outline' : 'mdi-minus-circle-outline'))

const gapText = computed(() => {
  const v = view.value
  if (!v || v.gapAmount === null) return '—'
  const sign = v.gapAmount > 0 ? '+' : ''
  const pct = v.gapPercent === null ? '' : ` (${sign}${formatPercent(v.gapPercent / 100)})`
  return `${sign}${formatMoney(v.gapAmount)}${pct}`
})
const missingText = computed(() => (view.value?.missing ?? []).map((m) => t(`pricing.missing.${m}`)).join(', '))
const ineligibleText = computed(() => t('pricing.panel.ineligible', { reasons: (view.value?.ineligibleReasons ?? []).map((r) => t(`pricing.ineligible.${r}`)).join(', ') }))
const refreshText = computed(() => {
  const r = refreshInfo(currentRow.value, !!settings.value?.enabled)
  if (r.kind === 'off') return t('pricing.refresh.off')
  if (r.kind === 'pending') return t('pricing.refresh.pending')
  const when = formatDateTime(r.at)
  return r.kind === 'overdue' ? t('pricing.refresh.overdue', { when }) : when
})

async function load() {
  state.value = 'loading'
  const ids = saved.value.map((v: any) => String(v._id)).slice(0, PREVIEW_MAX)
  if (!props.productId || ids.length === 0) { state.value = 'empty'; return }
  const [margin, buybox] = await Promise.all([api.previewMargin(ids), api.listBuybox({ productIds: [props.productId], limit: 200 })])
  if (!margin.ok) { state.value = margin.reason === 'unauthorized' ? 'unauthorized' : 'error'; return }
  items.value = margin.data.items
  // listBuybox yalnız tazeleme zamanı/kanal tablosu içindir: başarısız olsa da kâr bölümü gösterilir (zamanlar "—" olur).
  rows.value = buybox.ok ? buybox.data.items : []
  settings.value = buybox.ok ? buybox.data.settings : null
  channels.value = buybox.ok ? buybox.data.channels : []
  selectedId.value = defaultVariantId(items.value)
  state.value = selectedId.value ? 'ready' : 'empty'
}

async function loadHistory() {
  history.value = []
  const bc = selectedBarcode.value
  if (!bc) { historyState.value = 'idle'; return }
  historyState.value = 'loading'
  const res = await api.buyboxHistory(bc, 30)
  if (selectedBarcode.value !== bc) return
  if (!res.ok) { historyState.value = 'error'; return }
  history.value = res.data.points
  historyState.value = 'ready'
}

watch(selectedId, () => { if (state.value === 'ready') loadHistory() })
watch(state, (s) => { if (s === 'ready') loadHistory() })
onMounted(load)
defineExpose({ load })
</script>

<style scoped>
.cp {
  display: flex; flex-direction: column; gap: var(--ek-space-4);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default); border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface); box-shadow: var(--ek-shadow-card);
}
.cp__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--ek-space-3); flex-wrap: wrap; }
.cp__title { margin: 0; color: var(--ek-color-content-strong); font-size: var(--ek-type-heading-size); line-height: var(--ek-type-heading-line); font-weight: var(--ek-type-heading-weight); }
.cp__sub, .cp__muted { margin: 0; color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); }
.cp__body { display: flex; flex-direction: column; gap: var(--ek-space-4); }
.cp__select { max-width: 420px; display: flex; flex-direction: column; gap: var(--ek-space-1); }
.cp__grid { margin: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--ek-space-3) var(--ek-space-4); }
.cp__cell { min-width: 0; display: flex; flex-direction: column; gap: var(--ek-space-1); }
.cp__cell dt { color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); }
.cp__cell dd { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--ek-space-1) var(--ek-space-2); color: var(--ek-color-content-strong); font-weight: 600; }
.cp__cell dd.is-loss { color: var(--ek-color-error-emphasis); }
.cp__cell dd.is-unknown { color: var(--ek-color-content-muted); font-weight: 400; }
.cp__stale { display: inline-flex; align-items: center; gap: var(--ek-space-1); color: var(--ek-color-warning-emphasis); font-size: var(--ek-type-caption-size); font-weight: 600; }
.cp__link { color: var(--ek-color-action); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; border-radius: var(--ek-radius-control); margin-left: var(--ek-space-2); }
.cp__link:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.cp__times { list-style: none; margin: 0; padding: var(--ek-space-3) 0 0; border-top: 1px solid var(--ek-color-border-default); display: flex; flex-wrap: wrap; gap: var(--ek-space-2) var(--ek-space-6); }
.cp__times li { display: flex; flex-direction: column; gap: 2px; }
.cp__h3 { margin: 0 0 var(--ek-space-2); color: var(--ek-color-content-strong); font-size: var(--ek-type-body-size); font-weight: 600; }
.cp__chanlist { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--ek-space-2) var(--ek-space-4); }
.cp__chanlist li { display: inline-flex; align-items: center; gap: var(--ek-space-2); }
@media (max-width: 1023px) { .cp__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 480px) { .cp { padding: var(--ek-space-3); } }
</style>
