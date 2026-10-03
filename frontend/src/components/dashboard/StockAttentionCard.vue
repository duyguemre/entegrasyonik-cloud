<!--
  Stok ve eşleşme uyarıları — `StockService/getStockOverview` (member, docs/API_TENANT_SURFACE.md §2.3).
  attention.oversold/unmapped = AÇIK sipariş kalemleri (satır + adet); variants.* = varyant özetleri;
  recentOrders = dikkat gerektiren kalemi olan en yeni siparişler. 403 → kart gizlenir (üst bileşen).

  FE-LOCAL-1028 (kullanılabilirlik + görsel düzey):
    1) İki UYARI KUTUSU — sorun varsa düz tonlu (kırmızı / turuncu), ikonlu, büyük rakamlı ve TIKLANABİLİR:
       "Çöz" ile Stok sağlığı ekranını açar (menüde varsa). Sorun yoksa sakin kutu + yeşil onay.
    2) STOK ÖZETİ — tek ince şerit, dört hücre (kullanılabilir / rezerve / stoğu aşan rezerv / yayın bekleyen);
       stoğu aşan rezerv varsa rakam uyarı tonunda.
    3) DİKKAT GEREKTİREN SİPARİŞLER — kanal işareti + sipariş no + kalem özeti + durum çipi + ok; satıra tıklamak
       sipariş listesini o sipariş numarasıyla arar (`globalSearch`).
  e2e çapaları KORUNUR: `[data-stock="oversold|unmapped"]` ("2 kalem", "5 adet …").
-->
<template>
  <EkCard
    title="Stok ve eşleşme uyarıları"
    :subtitle="subtitle"
    icon="mdi-alert-decagram-outline"
    :icon-tone="attentionLines > 0 ? 'error' : 'success'"
    :heading-level="3"
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
        <component
          :is="a.link ? 'button' : 'div'"
          v-for="a in alerts"
          :key="a.key"
          :type="a.link ? 'button' : undefined"
          class="dash-stock__alert"
          :class="[`is-${a.state}`, { 'dash-stock__alert--link': a.link }]"
          :data-stock="a.key"
          :aria-label="a.link ? `${a.label}: ${fmt(a.lines)} kalem — stok sağlığında çöz` : undefined"
          @click="a.link && open('StockHealthView')"
        >
          <span class="dash-stock__alert-head">
            <EkIconTile :icon="a.lines > 0 ? a.icon : 'mdi-check'" :tone="a.lines > 0 ? a.tone : 'success'" size="sm" />
            <span class="dash-stock__micro">{{ a.label }}</span>
            <span v-if="a.link" class="dash-stock__alert-go" aria-hidden="true">Çöz<v-icon icon="mdi-arrow-right" /></span>
          </span>
          <span class="dash-stock__value ek-num">{{ fmt(a.lines) }} <span>kalem</span></span>
          <span class="dash-stock__hint">{{ a.lines > 0 ? `${fmt(a.units)} adet ${a.unitText}` : a.clearText }}</span>
        </component>
      </div>

      <dl class="dash-stock__facts">
        <div v-for="f in facts" :key="f.label" :class="`is-${f.tone}`">
          <dt><EkIconTile :icon="f.icon" :tone="f.tone" size="sm" />{{ f.label }}</dt>
          <dd><span class="ek-num">{{ fmt(f.value) }}</span> {{ f.unit }}</dd>
        </div>
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
        <p class="dash-stock__micro dash-stock__orders-title">
          Dikkat gerektiren siparişler<span class="dash-stock__count ek-num">{{ orders.length }}</span>
        </p>
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
              <v-icon v-if="linkable" icon="mdi-chevron-right" class="dash-stock__order-chevron" aria-hidden="true" />
            </component>
          </li>
        </ul>
      </div>
    </template>
  </EkCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkCard, EkIconTile, EkStatusChip, EkErrorState, EkPlatformMark, type EkTone } from '@entegrasyonik/ui/components'
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

/** Uyarı kutuları: sorun varsa (lines > 0) tonlu ve — Stok sağlığı ekranı menüdeyse — tıklanabilir. */
const alerts = computed(() => {
  const healthOpen = canOpen('StockHealthView')
  const build = (key: string, label: string, v: { lines: number; units: number }, tone: EkTone, icon: string, unitText: string, clearText: string) => ({
    key, label, lines: v.lines, units: v.units, tone, icon, unitText, clearText,
    state: v.lines > 0 ? (tone === 'error' ? 'error' : 'warning') : 'clear',
    link: healthOpen && v.lines > 0,
  })
  return [
    build('oversold', 'Aşırı satış', oversold.value, 'error', 'mdi-alert-octagon-outline', 'stokta karşılanamadı', 'Açık aşırı satış yok'),
    build('unmapped', 'Eşleşmemiş kalem', unmapped.value, 'warning', 'mdi-link-variant-off', 'ürünle eşleşmedi', 'Tüm kalemler eşleşti'),
  ]
})

/** Stok özeti: her hücre anlamının tonunda (kullanılabilir yeşil, rezerve mavi, aşan rezerv varsa turuncu, yayın bekleyen eylem mavisi);
 *  sıfır olan uyarı hücreleri nötr kalır. */
const facts = computed<Array<{ label: string; value: number; unit: string; icon: string; tone: EkTone }>>(() => {
  const v = props.data?.variants
  const over = v?.overReserved ?? 0
  const pending = v?.publishPending ?? 0
  return [
    { label: 'Kullanılabilir', value: v?.availableUnits ?? 0, unit: 'adet', icon: 'mdi-package-variant-closed-check', tone: 'success' },
    { label: 'Rezerve', value: v?.reservedUnits ?? 0, unit: 'adet', icon: 'mdi-lock-clock', tone: 'info' },
    { label: 'Stoğu aşan rezerv', value: over, unit: 'varyant', icon: 'mdi-alert-outline', tone: over > 0 ? 'warning' : 'neutral' },
    { label: 'Yayın bekleyen', value: pending, unit: 'varyant', icon: 'mdi-upload-outline', tone: pending > 0 ? 'action' : 'neutral' },
  ]
})

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
  gap: var(--ek-space-5);
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

/* ---- 1) Uyarı kutuları: düz ton (degrade yok); sorun varsa zemin `-subtle`, çerçeve `-border`, rakam `-emphasis`. ---- */
.dash-stock__alerts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-4);
}

.dash-stock__alert {
  --ds-tone: var(--ek-color-content-strong);
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
  padding: var(--ek-space-4) var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font: inherit;
  text-align: left;
}

.dash-stock__alert.is-error {
  --ds-tone: var(--ek-color-error-emphasis);
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
}

.dash-stock__alert.is-warning {
  --ds-tone: var(--ek-color-warning-emphasis);
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
}

.dash-stock__alert--link {
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.dash-stock__alert--link:hover {
  border-color: var(--ds-tone);
}

.dash-stock__alert--link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.dash-stock__alert-head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin-bottom: var(--ek-space-2);
}

.dash-stock__alert.is-error .dash-stock__micro,
.dash-stock__alert.is-warning .dash-stock__micro {
  color: var(--ds-tone);
}

/* "Çöz →": kutunun tonunda küçük yönlendirme; üzerine gelince ok ilerler. */
.dash-stock__alert-go {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  color: var(--ds-tone);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.dash-stock__alert-go .v-icon {
  font-size: var(--ek-icon-sm);
  transition: transform var(--ek-motion-feedback);
}

.dash-stock__alert--link:hover .dash-stock__alert-go .v-icon,
.dash-stock__alert--link:focus-visible .dash-stock__alert-go .v-icon {
  transform: translateX(3px);
}

.dash-stock__value {
  color: var(--ds-tone);
  font-size: var(--ek-type-display-size);
  line-height: 1.15;
  font-weight: var(--ek-type-metric-weight);
  letter-spacing: -0.025em;
}

.dash-stock__value span {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-regular);
  letter-spacing: 0;
}

.dash-stock__alert.is-clear .dash-stock__value {
  color: var(--ek-color-content-muted);
}

.dash-stock__hint {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

/* ---- 2) Stok özeti: tek ince şerit, dört hücre ---- */
.dash-stock__facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-border-subtle);
}

.dash-stock__facts > div {
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-surface);
}

.dash-stock__facts dt {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin-bottom: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.dash-stock__facts dd {
  margin: 2px 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-subheading-line);
}

.dash-stock__facts dd .ek-num {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  font-weight: var(--ek-font-weight-semibold);
}

.dash-stock__facts .is-success dd .ek-num { color: var(--ek-color-success-emphasis); }
.dash-stock__facts .is-info dd .ek-num { color: var(--ek-color-info-emphasis); }
.dash-stock__facts .is-warning dd .ek-num { color: var(--ek-color-warning-emphasis); }
.dash-stock__facts .is-action dd .ek-num { color: var(--ek-color-action-emphasis); }

/* ---- 3) Dikkat gerektiren siparişler: kutusuz satırlar, arada ince çizgi ---- */
.dash-stock__orders {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
}

.dash-stock__orders-title {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.dash-stock__count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-default);
  text-align: center;
  letter-spacing: 0;
}

.dash-stock__order-list {
  display: flex;
  flex-direction: column;
  margin: 0 calc(-1 * var(--ek-space-2));
  padding: 0;
  list-style: none;
}

.dash-stock__order-list li + li {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.dash-stock__order {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: 52px;
  padding: var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-tile);
  background: transparent;
  color: var(--ek-color-content-default);
  font: inherit;
  text-align: left;
}

.dash-stock__order--link {
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.dash-stock__order--link:hover {
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

.dash-stock__order-chevron {
  flex: none;
  color: var(--ek-color-content-subtle);
  font-size: var(--ek-icon-md);
  transition: color var(--ek-motion-feedback), transform var(--ek-motion-feedback);
}

.dash-stock__order--link:hover .dash-stock__order-chevron,
.dash-stock__order--link:focus-visible .dash-stock__order-chevron {
  color: var(--ek-color-action);
  transform: translateX(2px);
}

.dash-stock__skeleton {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-4);
}

.dash-stock__skeleton span {
  height: 116px;
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-sunken);
}

.dash-stock__skeleton .dash-stock__skeleton-wide {
  grid-column: 1 / -1;
  height: 120px;
}

@container (max-width: 480px) {
  .dash-stock__alerts {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-3);
  }

  .dash-stock__facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* FE-LOCAL-1052 (kullanıcı kararı): tonlu uyarı kutusunda ikon kapsülü BEYAZ zeminde durur ("sıradaki iş" paneliyle aynı). */
.dash-stock__alert.is-error :deep(.ek-icon-tile),
.dash-stock__alert.is-warning :deep(.ek-icon-tile) {
  background: var(--ek-color-surface);
}
</style>
