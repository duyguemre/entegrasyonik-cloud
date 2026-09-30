<!--
  Stok ve eşleşme uyarıları — `StockService/getStockOverview` (member, docs/API_TENANT_SURFACE.md §2.3).
  attention.oversold/unmapped = AÇIK sipariş kalemleri (satır + adet); variants.* = varyant özetleri;
  recentOrders = dikkat gerektiren kalemi olan en yeni siparişler. Siparişe tıklamak sipariş listesini
  sipariş numarasıyla arar (`globalSearch`). 403 → kart gizlenir (üst bileşen).
-->
<template>
  <EkCard
    title="Stok ve eşleşme uyarıları"
    :subtitle="subtitle"
    icon="mdi-alert-decagram-outline"
    :icon-tone="attentionLines > 0 ? 'error' : 'success'"
    :heading-level="2"
    :to-label="canOpen('orderList') ? 'Sipariş listesini aç' : undefined"
    class="dash-stock"
    @open="open('orderList')"
  >
    <div v-if="loading" class="dash-stock__skeleton" aria-hidden="true">
      <span></span><span></span><span class="dash-stock__skeleton-wide"></span>
    </div>
    <EkErrorState v-else-if="error" size="inline" message="Stok uyarıları yüklenemedi — tekrar deneyin." @retry="emit('retry')" />
    <template v-else-if="data">
      <div class="dash-stock__alerts">
        <div class="dash-stock__alert" :class="{ 'dash-stock__alert--error': oversold.lines > 0 }" data-stock="oversold">
          <p class="dash-stock__micro">Aşırı satış</p>
          <p class="dash-stock__value ek-num">{{ fmt(oversold.lines) }} <span>kalem</span></p>
          <p class="dash-stock__hint">{{ fmt(oversold.units) }} adet stokta karşılanamadı</p>
        </div>
        <div class="dash-stock__alert" :class="{ 'dash-stock__alert--warning': unmapped.lines > 0 }" data-stock="unmapped">
          <p class="dash-stock__micro">Eşleşmemiş kalem</p>
          <p class="dash-stock__value ek-num">{{ fmt(unmapped.lines) }} <span>kalem</span></p>
          <p class="dash-stock__hint">{{ fmt(unmapped.units) }} adet ürünle eşleşmedi</p>
        </div>
      </div>

      <dl class="dash-stock__facts">
        <div><dt>Kullanılabilir</dt><dd class="ek-num">{{ fmt(data.variants.availableUnits) }} adet</dd></div>
        <div><dt>Rezerve</dt><dd class="ek-num">{{ fmt(data.variants.reservedUnits) }} adet</dd></div>
        <div><dt>Stoğu aşan rezerv</dt><dd class="ek-num">{{ fmt(data.variants.overReserved) }} varyant</dd></div>
        <div><dt>Yayın bekleyen</dt><dd class="ek-num">{{ fmt(data.variants.publishPending) }} varyant</dd></div>
      </dl>

      <DashboardEmpty
        v-if="orders.length === 0"
        compact
        icon="mdi-check-circle-outline"
        tone="success"
        title="Dikkat gerektiren sipariş yok"
        text="Aşırı satış veya eşleşmemiş kalem içeren açık sipariş bulunmuyor."
      />
      <div v-else class="dash-stock__orders">
        <p class="dash-stock__micro">Dikkat gerektiren siparişler</p>
        <ul class="dash-stock__order-list">
          <li v-for="o in orders" :key="o.orderId">
            <component
              :is="linkable ? 'button' : 'div'"
              :type="linkable ? 'button' : undefined"
              class="dash-stock__order"
              :class="{ 'dash-stock__order--link': linkable }"
              @click="linkable && open('orderList', { globalSearch: o.orderNumber || o.externalOrderId })"
            >
              <EkPlatformMark v-if="o.integrationCode" :name="integrationTitle(o.integrationCode)" :code="o.integrationCode" :show-name="false" />
              <span class="dash-stock__order-text">
                <span class="dash-stock__order-no ek-num">{{ o.orderNumber || o.externalOrderId || '—' }}</span>
                <span class="dash-stock__order-item">{{ itemSummary(o) }}</span>
              </span>
              <EkStatusChip :tone="o.state === 'OVERSOLD' ? 'danger' : 'warning'" :label="o.state === 'OVERSOLD' ? 'Aşırı satış' : 'Eşleşmemiş'" />
            </component>
          </li>
        </ul>
      </div>
    </template>
  </EkCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkCard, EkStatusChip, EkErrorState, EkPlatformMark } from '@entegrasyonik/ui/components'
import { formatNumber } from '@entegrasyonik/ui/format'
import { useIntegrationStore } from '@/stores/integrationStore'
import DashboardEmpty from './DashboardEmpty.vue'
import { useDashboardNavigation } from './useDashboardNavigation'
import type { StockOverview } from './dashboardTypes'

const props = defineProps<{ data: StockOverview | null; loading: boolean; error: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const { canOpen, open } = useDashboardNavigation()
const integrationStore: any = useIntegrationStore()
const linkable = computed(() => canOpen('orderList'))
const fmt = (v: number) => formatNumber(v ?? 0)

const oversold = computed(() => props.data?.attention.oversold ?? { lines: 0, units: 0 })
const unmapped = computed(() => props.data?.attention.unmapped ?? { lines: 0, units: 0 })
const attentionLines = computed(() => oversold.value.lines + unmapped.value.lines)

const subtitle = computed(() => {
  if (props.loading || props.error || !props.data) return 'Açık siparişlerde stok karşılama durumu'
  return attentionLines.value === 0 ? 'Açık siparişlerde sorun yok' : `${fmt(attentionLines.value)} kalem müdahale bekliyor`
})

const integrationTitle = (code: string) => integrationStore.getIntegrationTitle?.(code) || code

const orders = computed(() =>
  (props.data?.recentOrders ?? []).slice(0, 4).map((o) => {
    const flagged = o.items.filter((i) => i.allocationState === 'OVERSOLD' || i.allocationState === 'UNMAPPED')
    return { ...o, flagged, state: flagged.some((i) => i.allocationState === 'OVERSOLD') ? 'OVERSOLD' : 'UNMAPPED' }
  }),
)

const itemSummary = (o: { flagged: StockOverview['recentOrders'][number]['items'] }) => {
  const first = o.flagged[0]
  if (!first) return ''
  const name = first.productName || first.sku || 'Ürün'
  const more = o.flagged.length > 1 ? ` · +${o.flagged.length - 1} kalem` : ''
  return `${name} · ${fmt(first.quantity)} adet${more}`
}
</script>

<style scoped>
.dash-stock {
  container-type: inline-size;
}

.dash-stock :deep(.ek-card__body) {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.dash-stock__alerts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-3);
}

.dash-stock__alert {
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
}

.dash-stock__alert--error {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
}

.dash-stock__alert--warning {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
}

.dash-stock__micro {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.dash-stock__alert--error .dash-stock__micro,
.dash-stock__alert--error .dash-stock__hint {
  color: var(--ek-color-error-emphasis);
}

.dash-stock__alert--warning .dash-stock__micro,
.dash-stock__alert--warning .dash-stock__hint {
  color: var(--ek-color-warning-emphasis);
}

.dash-stock__value {
  margin: var(--ek-space-1) 0 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-font-weight-bold);
}

.dash-stock__value span {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
}

.dash-stock__hint {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.dash-stock__facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ek-space-3);
  margin: 0;
  padding: var(--ek-space-3) 0;
  border-top: 1px solid var(--ek-color-border-subtle);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.dash-stock__facts dt {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.dash-stock__facts dd {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.dash-stock__orders {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.dash-stock__order-list {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.dash-stock__order {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font: inherit;
  text-align: left;
}

.dash-stock__order--link {
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.dash-stock__order--link:hover {
  border-color: var(--ek-color-border-strong);
  background: var(--ek-color-surface-muted);
}

.dash-stock__order--link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.dash-stock__order-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.dash-stock__order-no {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
}

.dash-stock__order-item {
  overflow: hidden;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dash-stock__skeleton {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-3);
}

.dash-stock__skeleton span {
  height: 88px;
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
}

.dash-stock__skeleton .dash-stock__skeleton-wide {
  grid-column: 1 / -1;
  height: 120px;
}

@container (max-width: 480px) {
  .dash-stock__alerts {
    grid-template-columns: minmax(0, 1fr);
  }

  .dash-stock__facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
