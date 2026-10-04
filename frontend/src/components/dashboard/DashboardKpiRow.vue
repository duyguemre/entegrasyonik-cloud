<!--
  Dashboard KPI şeridi — `OrderService/getOrderDashboardInsights` (member).
  FE-LOCAL-1025: dört ayrı kart yerine TEK şerit; hücreler ince çizgiyle ayrılır (ikon kapsülü yok — "Bugün sırada"
  kutusuyla aynı dil). Hiyerarşi her hücrede aynı: mikro etiket → değer (+ değişim) → açıklama.
  Her değer backend yanıtından gelir; türetilenler yalnız TOPLAMLARDIR:
    · son 7 gün  = `last7Days[].count/revenue` toplamı
    · açık sipariş = `statusDistribution` içinde henüz sonuçlanmamış durumların toplamı (kanal/satıcı onayı bekleyen,
      onaylı, kargoda). Eski dördüncü hücre "Kargo bekleyen" aynı sayıyı "Bugün sırada" kutusunda iki kez daha
      gösteriyordu; yerine sayfada başka yerde olmayan bu özet geldi.
  Değişim (%) yalnızca dünün değeri > 0 iken gösterilir: backend dün 0 iken bugün > 0 için sabit %100 döndürür —
  bu gerçek bir kıyas değildir.
-->
<template>
  <div class="dash-kpis" :aria-busy="loading || undefined">
    <article v-for="k in kpis" :key="k.key" class="dash-kpi" :data-kpi="k.key">
      <p class="dash-kpi__label"><EkIconTile :icon="k.icon" :tone="k.tone" size="sm" />{{ k.label }}</p>
      <template v-if="loading">
        <span class="dash-kpi__skeleton dash-kpi__skeleton--value" aria-hidden="true"></span>
        <span class="dash-kpi__skeleton dash-kpi__skeleton--text" aria-hidden="true"></span>
        <span class="ek-sr-only">Yükleniyor</span>
      </template>
      <template v-else>
        <p class="dash-kpi__value-row">
          <span class="dash-kpi__value ek-num">{{ k.value }}</span>
          <span v-if="k.trend" class="dash-kpi__trend" :class="`is-${k.trend.direction}`">
            <v-icon :icon="k.trend.direction === 'up' ? 'mdi-arrow-up' : 'mdi-arrow-down'" aria-hidden="true" />{{ k.trend.text }}
          </span>
        </p>
        <p class="dash-kpi__desc">{{ k.description }}</p>
      </template>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkIconTile, type EkTone } from '@entegrasyonik/ui/components'
import { formatMoney, formatNumber } from '@entegrasyonik/ui/format'
import type { OrderInsights } from './dashboardTypes'

const props = defineProps<{ data: OrderInsights | null; loading: boolean }>()

const fmt = (v: number | undefined) => formatNumber(v ?? 0)
const money = (v: number | undefined) => formatMoney(v ?? 0)

// `last7Days` bugün dahil 7 gün, sıralı; sondan ikinci eleman dündür.
const yesterday = computed(() => {
  const days = props.data?.last7Days ?? []
  return days.length >= 2 ? days[days.length - 2] : null
})

const week = computed(() =>
  (props.data?.last7Days ?? []).reduce(
    (acc, d) => ({ count: acc.count + (d.count ?? 0), revenue: acc.revenue + (d.revenue ?? 0) }),
    { count: 0, revenue: 0 },
  ),
)

/** Henüz sonuçlanmamış siparişler (teslim / iptal / iade dışındakiler). */
const OPEN_STATUSES = ['UNAPPROVED', 'PRE_APPROVAL', 'AWAITING_APPROVAL', 'APPROVED', 'SHIPPED']
const openOrders = computed(() => OPEN_STATUSES.reduce((a, s) => a + (props.data?.statusDistribution?.[s] ?? 0), 0))

type Trend = { direction: 'up' | 'down'; text: string }
const trendOf = (change: number | undefined, base: number | undefined): Trend | undefined => {
  if (!base || change === undefined || change === 0) return undefined
  return { direction: change < 0 ? 'down' : 'up', text: `%${Math.abs(change)}` }
}

const kpis = computed<Array<{ key: string; label: string; icon: string; tone: EkTone; value: string; trend?: Trend; description: string }>>(() => [
  {
    key: 'today-count',
    label: 'Bugünkü sipariş',
    icon: 'mdi-cart-outline',
    tone: 'action',
    value: fmt(props.data?.today.count),
    trend: trendOf(props.data?.trend.countChange, yesterday.value?.count),
    description: yesterday.value ? `Dün (tüm gün): ${fmt(yesterday.value.count)} sipariş` : 'Bugün alınan siparişler',
  },
  {
    key: 'today-revenue',
    label: 'Bugünkü ciro',
    icon: 'mdi-cash-multiple',
    tone: 'success',
    value: money(props.data?.today.revenue),
    trend: trendOf(props.data?.trend.revenueChange, yesterday.value?.revenue),
    description: yesterday.value ? `Dün (tüm gün): ${money(yesterday.value.revenue)}` : 'Bugünkü siparişlerin toplamı',
  },
  {
    key: 'week-count',
    label: 'Son 7 gün',
    icon: 'mdi-calendar-week-outline',
    tone: 'info',
    value: fmt(week.value.count),
    description: `sipariş · ${money(week.value.revenue)} ciro`,
  },
  {
    key: 'open-orders',
    label: 'Açık sipariş',
    icon: 'mdi-package-variant',
    tone: 'warning',
    value: fmt(openOrders.value),
    description: 'Onay bekleyen, onaylı ve kargodaki',
  },
])
</script>

<style scoped>
/* Tek şerit: hücre aralığı 1px, zemin rengi çizgi olur (2×2'ye kırılınca da çizgiler doğru kalır). */
.dash-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-border-subtle);
  box-shadow: var(--ek-shadow-card);
}

.dash-kpi {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
  padding: var(--ek-space-5) var(--ek-space-6);
  background: var(--ek-color-surface);
}

.dash-kpi__label {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.dash-kpi__value-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--ek-space-3);
  margin: 0;
}

.dash-kpi__value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-display-size);
  line-height: 1.15;
  font-weight: var(--ek-type-metric-weight);
  letter-spacing: -0.025em;
  white-space: nowrap;
}

/* Değişim: yalnız metin rengi (zemin yok); yön okla, değer yüzdeyle. */
.dash-kpi__trend {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: var(--ek-font-weight-semibold);
}

.dash-kpi__trend .v-icon {
  font-size: var(--ek-icon-xs);
}

.dash-kpi__trend.is-up { color: var(--ek-color-success-emphasis); }
.dash-kpi__trend.is-down { color: var(--ek-color-error-emphasis); }

.dash-kpi__desc {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.dash-kpi__skeleton {
  display: block;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}

.dash-kpi__skeleton--value { width: 96px; height: 36px; }
.dash-kpi__skeleton--text { width: 140px; max-width: 100%; height: 14px; margin-top: var(--ek-space-1); }

@media (max-width: 1199px) {
  .dash-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* FE-R4-INT (ek): iş alanı dar (Otopilot paneli açık) → 2 sütun; 950 px ≈ 1199 görünüm − 248 menü. */
@container ek-dash (max-width: 950px) {
  .dash-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 599px) {
  .dash-kpi {
    padding: var(--ek-space-4);
  }

  .dash-kpi__value {
    font-size: var(--ek-type-metric-size);
  }
}
</style>
