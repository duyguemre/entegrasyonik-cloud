<!--
  Stok sağlığı — C1.1 / F-01 (ADR-0004 rezervasyon motorunun kullanıcıya görünen yüzü).

  Veri: YALNIZCA `StockService/getStockOverview` (member, docs/API_TENANT_SURFACE.md §2.3) — tek istek.
    KPI satırı            → attention.oversold / attention.unmapped / variants.availableUnits+reservedUnits / variants.publishPending
    Dikkat gerektiren     → recentOrders[].items[] (kalem başına satır; sipariş no → sipariş listesi, allocationStates filtresiyle)
    Varyant stok dengesi  → variants.*
    Stok mutabakatı       → reconciliation (tracked=false iken zaman UYDURULMAZ; dürüst "kaydedilmiyor" notu)
  Durumlar ayrı: yükleniyor (iskelet) · hata (ham hata yok, Tekrar dene) · yetki yok (403) · boş (sakin metin).
  Yenileme hata verirse son başarılı veri, zamanıyla birlikte ekranda kalır.
-->
<template>
  <div class="stockHealthView">
    <div class="sh-scroll">
      <div class="sh-page">
        <EkPageHeader
          :section="$t('stockHealth.section')"
          :title="$t('stockHealth.title')"
          :description="headerDescription"
          :secondary-actions="state === 'forbidden' ? [] : [{ label: $t('stockHealth.refresh'), icon: 'mdi-refresh', onClick: load }]"
        />

        <EkEmptyState
          v-if="state === 'forbidden'"
          variant="error"
          class="sh-panel"
          :title="$t('stockHealth.forbidden.title')"
          :message="$t('stockHealth.forbidden.message')"
        />

        <EkErrorState
          v-else-if="state === 'error' && !data"
          class="sh-panel"
          :message="$t('stockHealth.loadError')"
          @retry="load"
        />

        <template v-else>
          <div v-if="state === 'error' && data" class="sh-stale" role="status">
            <v-icon icon="mdi-cloud-alert-outline" size="18" aria-hidden="true" />
            <span>{{ $t('stockHealth.staleNotice', { time: formatDateTime(data.generatedAt) }) }}</span>
            <EkButton tone="ghost" size="sm" icon="mdi-refresh" @click="load">{{ $t('stockHealth.retry') }}</EkButton>
          </div>

          <section class="sh-kpis" :aria-label="$t('stockHealth.kpiLabel')">
            <EkMetricCard
              v-for="kpi in kpis"
              :key="kpi.key"
              :data-kpi="kpi.key"
              :label="kpi.label"
              :value="kpi.value"
              :description="kpi.description"
              :icon="kpi.icon"
              :tone="kpi.tone"
              :loading="!data"
            />
          </section>

          <div class="sh-grid">
            <EkCard
              class="sh-attention"
              :title="$t('stockHealth.attention.title')"
              :subtitle="attentionSubtitle"
              icon="mdi-alert-decagram-outline"
              :icon-tone="attentionRows.length > 0 ? 'error' : 'success'"
              :heading-level="2"
              flush
            >
              <template v-if="canOpenOrders && attentionRows.length > 0" #actions>
                <EkButton size="sm" icon="mdi-filter-variant" @click="openOrders(ATTENTION_STATES)">
                  {{ $t('stockHealth.attention.openAll') }}
                </EkButton>
              </template>

              <div v-if="!data" class="sh-skeleton" aria-hidden="true">
                <span v-for="n in 4" :key="n"></span>
              </div>

              <div v-else-if="attentionRows.length === 0" class="sh-calm">
                <EkIconTile icon="mdi-check-circle-outline" tone="success" size="md" />
                <div>
                  <p class="sh-calm__title">{{ $t('stockHealth.attention.emptyTitle') }}</p>
                  <p class="sh-calm__text">{{ $t('stockHealth.attention.emptyText') }}</p>
                </div>
              </div>

              <ul v-else-if="isMobile" class="sh-cards" :aria-label="$t('stockHealth.attention.title')">
                <li v-for="row in attentionRows" :key="row.key" class="sh-cards__item">
                  <div class="sh-cards__top">
                    <component
                      :is="canOpenOrders ? 'button' : 'span'"
                      :type="canOpenOrders ? 'button' : undefined"
                      class="sh-order ek-num"
                      :class="{ 'sh-order--link': canOpenOrders }"
                      :aria-label="canOpenOrders ? $t('stockHealth.attention.openOrder', { order: orderLabel(row) }) : undefined"
                      @click="canOpenOrders && openOrders([row.allocationState], row.orderNumber || row.externalOrderId)"
                    >{{ orderLabel(row) }}</component>
                    <EkStatusChip :tone="stateEntry(row.allocationState).tone" :label="$t(stateEntry(row.allocationState).labelKey)" />
                  </div>
                  <p class="sh-product">{{ row.productName || '—' }}</p>
                  <p class="sh-meta-line">
                    <EkChannelDot :code="row.integrationCode" />
                    <span class="ek-num">{{ $t('stockHealth.attention.qty', { n: formatNumber(row.quantity) }) }}</span>
                    <span class="ek-num">{{ formatDate(row.orderDate) }}</span>
                  </p>
                  <p v-if="row.oversoldEscalatedAt" class="sh-escalated">
                    <v-icon icon="mdi-account-alert-outline" size="14" aria-hidden="true" />
                    {{ $t('stockHealth.attention.escalated', { time: formatDateTime(row.oversoldEscalatedAt) }) }}
                  </p>
                </li>
              </ul>

              <EkDataGrid
                v-else
                class="sh-table"
                :columns="columns"
                :rows="attentionRows"
                row-key="key"
                label-key="orderNumber"
                :label="$t('stockHealth.attention.title')"
              >
                <template #cell-order="{ row }">
                  <span class="sh-order-cell">
                    <component
                      :is="canOpenOrders ? 'button' : 'span'"
                      :type="canOpenOrders ? 'button' : undefined"
                      class="sh-order ek-num"
                      :class="{ 'sh-order--link': canOpenOrders }"
                      :aria-label="canOpenOrders ? $t('stockHealth.attention.openOrder', { order: orderLabel(row) }) : undefined"
                      @click="canOpenOrders && openOrders([row.allocationState], row.orderNumber || row.externalOrderId)"
                    >{{ orderLabel(row) }}</component>
                    <span class="sh-sub ek-num">{{ formatDateTime(row.orderDate) }}</span>
                  </span>
                </template>
                <template #cell-channel="{ row }">
                  <EkChannelDot :code="row.integrationCode" />
                </template>
                <template #cell-product="{ row }">
                  <span class="sh-product-cell">
                    <span class="sh-product">{{ row.productName || '—' }}</span>
                    <span class="sh-sub">{{ identifiers(row) }}</span>
                  </span>
                </template>
                <template #cell-quantity="{ row }">
                  <span class="ek-num">{{ formatNumber(row.quantity) }}</span>
                </template>
                <template #cell-state="{ row }">
                  <span class="sh-state-cell">
                    <EkStatusChip :tone="stateEntry(row.allocationState).tone" :label="$t(stateEntry(row.allocationState).labelKey)" />
                    <span v-if="row.oversoldEscalatedAt" class="sh-escalated">
                      <v-icon icon="mdi-account-alert-outline" size="14" aria-hidden="true" />
                      {{ $t('stockHealth.attention.escalated', { time: formatDateTime(row.oversoldEscalatedAt) }) }}
                    </span>
                  </span>
                </template>
              </EkDataGrid>

              <template v-if="data && recentLimitReached" #footer>
                <p class="sh-footnote">{{ $t('stockHealth.attention.limitNote', { n: STOCK_OVERVIEW_LIMIT }) }}</p>
              </template>
            </EkCard>

            <div class="sh-side">
              <EkCard
                :title="$t('stockHealth.balance.title')"
                :subtitle="$t('stockHealth.balance.subtitle')"
                icon="mdi-scale-balance"
                :heading-level="2"
              >
                <div v-if="!data" class="sh-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>
                <template v-else>
                  <div class="sh-balance">
                    <p class="sh-balance__headline">
                      <span class="sh-balance__value ek-num">{{ formatNumber(data.variants.availableUnits) }}</span>
                      <span class="sh-balance__unit">{{ $t('stockHealth.balance.availableOf', { total: formatNumber(data.variants.totalStock) }) }}</span>
                    </p>
                    <div
                      v-if="balance.availableRatio !== null"
                      class="sh-bar"
                      role="img"
                      :aria-label="$t('stockHealth.balance.barLabel', { available: formatNumber(data.variants.availableUnits), reserved: formatNumber(data.variants.reservedUnits) })"
                    >
                      <span class="sh-bar__available"></span>
                      <span class="sh-bar__reserved"></span>
                    </div>
                    <ul class="sh-legend">
                      <li><span class="sh-legend__swatch sh-legend__swatch--available" aria-hidden="true"></span>{{ $t('stockHealth.balance.available') }} <strong class="ek-num">{{ formatNumber(data.variants.availableUnits) }}</strong></li>
                      <li><span class="sh-legend__swatch sh-legend__swatch--reserved" aria-hidden="true"></span>{{ $t('stockHealth.balance.reserved') }} <strong class="ek-num">{{ formatNumber(data.variants.reservedUnits) }}</strong></li>
                    </ul>
                  </div>

                  <dl class="sh-facts">
                    <div>
                      <dt>{{ $t('stockHealth.balance.total') }}</dt>
                      <dd class="ek-num">{{ formatNumber(data.variants.total) }}</dd>
                    </div>
                    <div>
                      <dt>{{ $t('stockHealth.balance.withReservations') }}</dt>
                      <dd class="ek-num">{{ formatNumber(data.variants.withReservations) }}</dd>
                    </div>
                    <div>
                      <dt>{{ $t('stockHealth.balance.overReserved') }}</dt>
                      <dd class="sh-facts__flag">
                        <span class="ek-num">{{ formatNumber(data.variants.overReserved) }}</span>
                        <EkStatusChip v-if="(data.variants.overReserved ?? 0) > 0" tone="danger" :label="$t('stockHealth.balance.check')" />
                      </dd>
                    </div>
                    <div>
                      <dt>{{ $t('stockHealth.balance.publishPending') }}</dt>
                      <dd class="ek-num">{{ formatNumber(data.variants.publishPending) }}</dd>
                    </div>
                  </dl>
                </template>
              </EkCard>

              <EkCard
                :title="$t('stockHealth.reconciliation.title')"
                icon="mdi-sync"
                icon-tone="neutral"
                :heading-level="2"
              >
                <div v-if="!data" class="sh-skeleton" aria-hidden="true"><span></span><span></span></div>
                <div v-else class="sh-recon" data-recon>
                  <template v-if="!data.reconciliation.tracked">
                    <EkStatusChip tone="neutral" :label="$t('stockHealth.reconciliation.untrackedChip')" />
                    <p class="sh-recon__title">{{ $t('stockHealth.reconciliation.untrackedTitle') }}</p>
                    <p class="sh-recon__text">{{ $t('stockHealth.reconciliation.untrackedText') }}</p>
                  </template>
                  <template v-else-if="data.reconciliation.lastRunAt">
                    <p class="sh-recon__title">{{ $t('stockHealth.reconciliation.lastRun') }}</p>
                    <p class="sh-recon__value ek-num">{{ formatDateTime(data.reconciliation.lastRunAt) }}</p>
                  </template>
                  <p v-else class="sh-recon__text">{{ $t('stockHealth.reconciliation.neverRun') }}</p>
                </div>
              </EkCard>

              <EkCard
                :title="$t('stockHealth.legend.title')"
                icon="mdi-information-outline"
                icon-tone="info"
                :heading-level="2"
              >
                <dl class="sh-states">
                  <div v-for="s in ALLOCATION_STATES" :key="s">
                    <dt><EkStatusChip :tone="stateEntry(s).tone" :label="$t(stateEntry(s).labelKey)" /></dt>
                    <dd>{{ $t(`stockHealth.legend.${s}`) }}</dd>
                  </div>
                </dl>
              </EkCard>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import EkPageHeader from '@/components/ds/EkPageHeader.vue'
import EkMetricCard from '@/components/ds/EkMetricCard.vue'
import EkCard from '@/components/ds/EkCard.vue'
import EkDataGrid, { type EkGridColumn } from '@/components/ds/EkDataGrid.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkChannelDot from '@/components/ds/EkChannelDot.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkIconTile, { type EkTone } from '@/components/ds/EkIconTile.vue'
import EkErrorState from '@/components/ds/EkErrorState.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import { useMenuStore } from '@/stores/site/menu'
import { useShellBreakpoints } from '@/composables/useShellBreakpoints'
import { formatDate, formatDateTime, formatNumber } from '@/composables/format'
import { apiStatus, isApiError } from '@/composables/apiErrors'
import { ALLOCATION_STATE_TONE, type StatusMapEntry } from '@/design/status-map'
import {
  ALLOCATION_STATES,
  ATTENTION_STATES,
  STOCK_OVERVIEW_LIMIT,
  flattenAttentionRows,
  isStockOverview,
  numOrNull,
  orderListParams,
  stockBalance,
  useStockHealthApi,
  type AllocationState,
  type AttentionRow,
  type StockOverview,
} from '@/composables/useStockHealthApi'

defineProps<{ parameters?: any }>()
const emits = defineEmits(['clear'])

const { t } = useI18n()
const api = useStockHealthApi()
const menuStore = useMenuStore()
const eventBus = inject<any>('eventBus')
const { isMobile } = useShellBreakpoints()

const state = ref<'loading' | 'ready' | 'error' | 'forbidden'>('loading')
const data = ref<StockOverview | null>(null)

async function load() {
  state.value = 'loading'
  const res = await api.getStockOverview(STOCK_OVERVIEW_LIMIT)
  if (isApiError(res)) {
    state.value = apiStatus(res) === 403 ? 'forbidden' : 'error'
    return
  }
  if (!isStockOverview(res)) {
    state.value = 'error'
    return
  }
  data.value = res
  state.value = 'ready'
}

const headerDescription = computed(() => {
  const base = t('stockHealth.description')
  if (!data.value) return base
  return `${base} · ${t('stockHealth.updatedAt', { time: formatDateTime(data.value.generatedAt) })}`
})

const stateEntry = (s: AllocationState): StatusMapEntry => ALLOCATION_STATE_TONE[s]

interface Kpi { key: string; label: string; value: string; description: string; icon: string; tone: EkTone }

const kpis = computed<Kpi[]>(() => {
  const d = data.value
  const oversold = numOrNull(d?.attention.oversold.lines)
  const unmapped = numOrNull(d?.attention.unmapped.lines)
  const pending = numOrNull(d?.variants.publishPending)
  return [
    {
      key: 'oversold',
      label: t('stockHealth.kpi.oversold'),
      value: t('stockHealth.unit.lines', { n: formatNumber(oversold) }),
      description: oversold === 0
        ? t('stockHealth.kpi.oversoldNone')
        : t('stockHealth.kpi.oversoldUnits', { n: formatNumber(d?.attention.oversold.units) }),
      icon: 'mdi-alert-octagon-outline',
      tone: oversold ? 'error' : 'success',
    },
    {
      key: 'unmapped',
      label: t('stockHealth.kpi.unmapped'),
      value: t('stockHealth.unit.lines', { n: formatNumber(unmapped) }),
      description: unmapped === 0
        ? t('stockHealth.kpi.unmappedNone')
        : t('stockHealth.kpi.unmappedUnits', { n: formatNumber(d?.attention.unmapped.units) }),
      icon: 'mdi-link-variant-off',
      tone: unmapped ? 'warning' : 'success',
    },
    {
      key: 'available',
      label: t('stockHealth.kpi.available'),
      value: t('stockHealth.unit.units', { n: formatNumber(d?.variants.availableUnits) }),
      description: t('stockHealth.kpi.availableDesc', { reserved: formatNumber(d?.variants.reservedUnits), total: formatNumber(d?.variants.totalStock) }),
      icon: 'mdi-package-variant-closed',
      tone: 'action',
    },
    {
      key: 'publishPending',
      label: t('stockHealth.kpi.publishPending'),
      value: t('stockHealth.unit.variants', { n: formatNumber(pending) }),
      description: pending === 0 ? t('stockHealth.kpi.publishPendingNone') : t('stockHealth.kpi.publishPendingDesc'),
      icon: 'mdi-upload-outline',
      tone: 'info',
    },
  ]
})

const attentionRows = computed<AttentionRow[]>(() => flattenAttentionRows(data.value?.recentOrders))
const recentLimitReached = computed(() => (data.value?.recentOrders.length ?? 0) >= STOCK_OVERVIEW_LIMIT)
const attentionSubtitle = computed(() => {
  if (!data.value) return t('stockHealth.attention.subtitle')
  const orders = data.value.recentOrders.length
  return orders > 0 ? t('stockHealth.attention.subtitleCount', { orders, lines: attentionRows.value.length }) : t('stockHealth.attention.subtitle')
})
const balance = computed(() => stockBalance(data.value?.variants))
// Çubuk oranları CSS `v-bind` ile (satır içi stil yok — stil mandalı).
const availableGrow = computed(() => String(balance.value.availableRatio ?? 0))
const reservedGrow = computed(() => String(balance.value.reservedRatio ?? 0))

const columns = computed<EkGridColumn[]>(() => [
  { key: 'order', label: t('stockHealth.col.order') },
  { key: 'channel', label: t('stockHealth.col.channel') },
  { key: 'product', label: t('stockHealth.col.product'), wrap: true },
  { key: 'quantity', label: t('stockHealth.col.quantity'), type: 'num' },
  { key: 'state', label: t('stockHealth.col.state') },
])

function orderLabel(row: Pick<AttentionRow, 'orderNumber' | 'externalOrderId'> | Record<string, any>): string {
  return row.orderNumber || row.externalOrderId || '—'
}

function identifiers(row: Pick<AttentionRow, 'sku' | 'barcode'> | Record<string, any>): string {
  const parts = [row.sku && `${t('stockHealth.col.sku')} ${row.sku}`, row.barcode && `${t('stockHealth.col.barcode')} ${row.barcode}`].filter(Boolean)
  return parts.length ? parts.join(' · ') : t('stockHealth.col.noIdentifier')
}

// Sipariş listesi yalnızca kullanıcının menüsünde varsa açılır (yetki kaynağı MenuService'tir).
const canOpenOrders = computed(() => !!menuStore.getMenuLinkWithCode('OrderListView'))

function openOrders(states: readonly AllocationState[], orderNumber?: string | null) {
  const link = menuStore.getMenuLinkWithCode('OrderListView')
  if (!link) return
  link.parameters = orderListParams(states, orderNumber)
  eventBus?.emit('openTab', link)
}

const initialize = async () => {
  await load()
  emits('clear')
}

const activate = async () => {
  // Sekmeye geri dönüldüğünde veri 1 dakikadan eskiyse sessizce tazele (nabız/animasyon yok).
  const at = data.value ? Date.parse(data.value.generatedAt) : 0
  if (state.value !== 'loading' && (!at || Date.now() - at > 60_000)) await load()
}

defineExpose({ initialize, activate, destroy: () => {} })
</script>

<style scoped>
.stockHealthView {
  height: 100%;
}

.sh-scroll {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  background: var(--ek-color-app-bg);
}

.sh-page {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  max-width: 1600px;
  margin: 0 auto;
  padding: var(--ek-space-6);
}

.sh-panel {
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
}

.sh-stale {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-warning-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
}

.sh-stale > span {
  flex: 1;
  min-width: 0;
}

.sh-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ek-space-4);
}

.sh-grid {
  display: grid;
  grid-template-columns: minmax(0, 8fr) minmax(0, 4fr);
  align-items: start;
  gap: var(--ek-space-5);
}

.sh-side {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  min-width: 0;
}

/* Tablo kart içinde doğal yükseklikte; kaydırma sayfa düzeyinde (en fazla 50 kalem). */
.sh-table {
  height: auto;
}

.sh-order-cell,
.sh-product-cell,
.sh-state-cell {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}

.sh-order {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ek-color-content-strong);
  font: inherit;
  font-weight: var(--ek-font-weight-semibold);
  text-align: left;
}

.sh-order--link {
  color: var(--ek-color-action);
  cursor: pointer;
  border-radius: var(--ek-radius-sm);
  transition: var(--ek-transition-colors);
}

.sh-order--link:hover {
  color: var(--ek-color-action-hover);
  text-decoration: underline;
}

.sh-order--link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.sh-product {
  margin: 0;
  color: var(--ek-color-content-default);
}

.sh-sub {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.sh-escalated {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.sh-calm {
  display: flex;
  align-items: center;
  gap: var(--ek-space-4);
  padding: var(--ek-space-6) var(--ek-space-5);
}

.sh-calm__title,
.sh-recon__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.sh-calm__text,
.sh-recon__text,
.sh-footnote {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.sh-cards {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.sh-cards__item {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  padding: var(--ek-space-3) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.sh-cards__item:first-child {
  border-top: 0;
}

.sh-cards__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2);
}

.sh-meta-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1) var(--ek-space-3);
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.sh-balance {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.sh-balance__headline {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin: 0;
}

.sh-balance__value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-metric-size);
  line-height: var(--ek-type-metric-line);
  font-weight: var(--ek-type-metric-weight);
}

.sh-balance__unit {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
}

.sh-bar {
  display: flex;
  gap: 2px;
  height: 10px;
  overflow: hidden;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-sunken);
}

.sh-bar__available,
.sh-bar__reserved {
  flex-basis: 0;
  min-width: 0;
}

.sh-bar__available {
  flex-grow: v-bind(availableGrow);
}

.sh-bar__reserved {
  flex-grow: v-bind(reservedGrow);
}

.sh-bar__available,
.sh-legend__swatch--available {
  background: var(--ek-color-success);
}

.sh-bar__reserved,
.sh-legend__swatch--reserved {
  background: var(--ek-color-info);
}

.sh-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1) var(--ek-space-4);
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.sh-legend li {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.sh-legend strong {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.sh-legend__swatch {
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-full);
}

.sh-facts {
  display: flex;
  flex-direction: column;
  margin: var(--ek-space-4) 0 0;
  border-top: 1px solid var(--ek-color-border-subtle);
}

.sh-facts > div,
.sh-states > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  padding: var(--ek-space-2) 0;
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.sh-facts > div:last-child,
.sh-states > div:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.sh-facts dt {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
}

.sh-facts dd {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.sh-facts__flag {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.sh-recon {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ek-space-2);
}

.sh-recon__value {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.sh-states > div {
  align-items: flex-start;
  justify-content: flex-start;
}

.sh-states dt {
  flex: none;
  width: 104px;
}

.sh-states dd {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.sh-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-5);
}

.sh-skeleton span {
  display: block;
  height: 14px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}

.sh-skeleton span:nth-child(2n) {
  width: 72%;
}

@media (max-width: 1099px) {
  .sh-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sh-grid {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
}

@media (max-width: 599px) {
  .sh-page {
    gap: var(--ek-space-4);
    padding: var(--ek-space-4);
  }

  .sh-kpis {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-3);
  }
}
</style>
