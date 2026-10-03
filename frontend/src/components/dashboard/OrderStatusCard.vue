<!--
  Sipariş durum dağılımı — `getOrderDashboardInsights.statusDistribution` (tüm zamanlar, iç durum).
  FE-LOCAL-1025: halka grafik yerine toplam + tek yatay dağılım çubuğu + durum listesi (daha sakin, dar sütunda
  okunaklı; ayrı grafik motoru gerekmez). Ton `status-map.ts` `ORDER_STATUS_TONE`'dan (ekran renk seçmez).
  Satıra tıklamak sipariş listesini o durum filtresiyle açar (`internalStatuses`). Sıfır olan durumlar listede
  sakin tonda kalır (bilgi kaybolmaz, göz yormaz).
-->
<template>
  <EkCard
    title="Sipariş durumları"
    subtitle="Tüm siparişlerin iç durum dağılımı"
    icon="mdi-chart-donut"
    icon-tone="info"
    :heading-level="3"
    :to-label="linkable ? 'Sipariş listesini aç' : undefined"
    class="dash-status"
    @open="open('orderList')"
  >
    <div v-if="loading" class="dash-status__layout" aria-hidden="true">
      <span class="dash-status__skeleton dash-status__skeleton--total"></span>
      <span class="dash-status__skeleton dash-status__skeleton--bar"></span>
      <div class="dash-status__rows-skeleton"><span v-for="n in 5" :key="n" class="dash-status__skeleton"></span></div>
    </div>
    <EkErrorState v-else-if="error" size="inline" message="Sipariş durumları yüklenemedi — tekrar deneyin." @retry="emit('retry')" />
    <DashboardEmpty
      v-else-if="total === 0"
      icon="mdi-cart-outline"
      title="Henüz sipariş yok"
      text="İlk sipariş geldiğinde durum dağılımı burada görünür."
    />
    <div v-else class="dash-status__layout">
      <p class="dash-status__summary">
        <span class="dash-status__total ek-num">{{ fmt(total) }}</span>
        <span class="dash-status__total-label">sipariş</span>
      </p>
      <!-- Dağılım çubuğu: yalnız görsel; sayılar ve yüzdeler aşağıdaki listede. -->
      <div class="dash-status__bar" aria-hidden="true">
        <span
          v-for="row in rows.filter((r) => r.count > 0)"
          :key="row.status"
          class="dash-status__seg"
          :class="`dash-status__swatch--${row.swatch}`"
          :style="{ flexGrow: row.count }"
          :title="`${row.label}: ${fmt(row.count)} (${pct(row.count)})`"
        ></span>
      </div>
      <ul class="dash-status__list" aria-label="Duruma göre sipariş sayıları">
        <li v-for="row in rows" :key="row.status">
          <component
            :is="linkable ? 'button' : 'div'"
            :type="linkable ? 'button' : undefined"
            class="dash-status__row"
            :class="{ 'dash-status__row--link': linkable, 'is-zero': row.count === 0 }"
            :aria-label="linkable ? `${row.label}: ${fmt(row.count)} sipariş — listede göster` : undefined"
            @click="linkable && open('orderList', { internalStatuses: [row.status] })"
          >
            <span class="dash-status__swatch" :class="`dash-status__swatch--${row.swatch}`" aria-hidden="true"></span>
            <span class="dash-status__label">{{ row.label }}</span>
            <span class="dash-status__count ek-num">{{ fmt(row.count) }}</span>
            <span class="dash-status__pct ek-num">{{ pct(row.count) }}</span>
          </component>
        </li>
      </ul>
    </div>
  </EkCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EkCard, EkErrorState } from '@entegrasyonik/ui/components'
import DashboardEmpty from './DashboardEmpty.vue'
import { formatNumber, formatPercent } from '@entegrasyonik/ui/format'
import { ORDER_STATUS_TONE, type StatusTone } from '@/design/status-map'
import { OrderInternalStatusEnum } from '@/types/OrderTypes'
import { useDashboardNavigation } from './useDashboardNavigation'
import type { OrderInsights } from './dashboardTypes'

const props = defineProps<{ data: OrderInsights | null; loading: boolean; error: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
const { canOpen, open } = useDashboardNavigation()
const linkable = computed(() => canOpen('orderList'))

const ORDER: OrderInternalStatusEnum[] = [
  OrderInternalStatusEnum.UNAPPROVED,
  OrderInternalStatusEnum.AWAITING_APPROVAL,
  OrderInternalStatusEnum.APPROVED,
  OrderInternalStatusEnum.SHIPPED,
  OrderInternalStatusEnum.DELIVERED,
  OrderInternalStatusEnum.CANCELLED,
  OrderInternalStatusEnum.RETURNED,
]

// Aynı tondaki ikinci durum, tonun koyu (`-emphasis`) adımıyla ayrışır; anlamı yine etiket taşır.
type Swatch = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'warning-2' | 'info-2' | 'danger-2'

const fmt = (v: number) => formatNumber(v ?? 0)
const total = computed(() => ORDER.reduce((a, s) => a + (props.data?.statusDistribution?.[s] ?? 0), 0))
const pct = (v: number) => (total.value ? formatPercent(v / total.value) : '')

const rows = computed(() => {
  const seen = new Set<StatusTone>()
  return ORDER.map((status) => {
    const tone = ORDER_STATUS_TONE[status].tone
    const swatch = (seen.has(tone) ? `${tone}-2` : tone) as Swatch
    seen.add(tone)
    return { status, label: t(ORDER_STATUS_TONE[status].labelKey), count: props.data?.statusDistribution?.[status] ?? 0, swatch }
  })
})
</script>

<style scoped>
.dash-status__layout {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.dash-status__summary {
  display: flex;
  align-items: baseline;
  gap: var(--ek-space-2);
  margin: 0;
}

.dash-status__total {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-display-size);
  line-height: 1.15;
  font-weight: var(--ek-type-metric-weight);
  letter-spacing: -0.025em;
}

.dash-status__total-label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

/* Dağılım çubuğu: parçalar sayıyla orantılı; aralarında ince boşluk (yüzey rengi). */
.dash-status__bar {
  display: flex;
  gap: 2px;
  height: 10px;
  overflow: hidden;
  border-radius: var(--ek-radius-full);
}

.dash-status__seg {
  flex-basis: 0;
  min-width: 4px;
  background: var(--ek-color-neutral);
}

.dash-status__list {
  display: flex;
  flex-direction: column;
  margin: 0 calc(-1 * var(--ek-space-2));
  padding: 0;
  list-style: none;
}

.dash-status__row {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto 48px;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: 34px;
  padding: 0 var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-content-default);
  font: inherit;
  font-size: var(--ek-type-table-size);
  line-height: var(--ek-type-table-line);
  text-align: left;
}

.dash-status__row--link {
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.dash-status__row--link:hover {
  background: var(--ek-color-surface-muted);
}

.dash-status__row--link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.dash-status__swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: var(--ek-color-neutral);
}

.dash-status__swatch--success { background: var(--ek-color-success); }
.dash-status__swatch--warning { background: var(--ek-color-warning); }
.dash-status__swatch--warning-2 { background: var(--ek-color-warning-emphasis); }
.dash-status__swatch--info { background: var(--ek-color-info); }
.dash-status__swatch--info-2 { background: var(--ek-color-info-emphasis); }
.dash-status__swatch--danger { background: var(--ek-color-error); }
.dash-status__swatch--danger-2 { background: var(--ek-color-error-emphasis); }

.dash-status__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dash-status__count {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.dash-status__pct {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  text-align: right;
}

/* Sıfır olan durum: sayı vurgusuz (etiket okunur kalır). */
.dash-status__row.is-zero .dash-status__count {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-regular);
}

.dash-status__skeleton {
  display: block;
  height: 16px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}

.dash-status__skeleton--total { width: 96px; height: 36px; }
.dash-status__skeleton--bar { height: 10px; border-radius: var(--ek-radius-full); }

.dash-status__rows-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

/* MOB-00: dokunmatikte satır/bağlantı hedefi en az 44 px (--ek-control-h-touch). */
@media (pointer: coarse) {
  .dash-status__row {
    min-height: var(--ek-control-h-touch);
  }
}
</style>
