<!--
  Katalog ve kanal aktarımı — `ProductService/getProductStatistics` (member):
    totalProducts, variantPlatformTransferStatistics.{totalVariants,totalStock,counts[kanal]}
  counts[kanal] = varyant aktarım durumu sayıları (PENDING/WAITING/SENT/FAILED/COMPLETED) + ONSALECOUNT.
  Sayıya tıklamak ürün listesini o kanal + durum filtresiyle açar (`transferStatuses`).
-->
<template>
  <EkCard
    title="Katalog ve kanal aktarımı"
    subtitle="Varyantların pazaryeri/kanal aktarım durumu"
    icon="mdi-tag-multiple-outline"
    icon-tone="brand"
    :heading-level="3"
    :to-label="linkable ? 'Ürün listesini aç' : undefined"
    class="dash-catalog"
    @open="open('productList')"
  >
    <div v-if="loading" class="dash-catalog__skeleton" aria-hidden="true"><span></span><span></span><span></span></div>
    <EkErrorState v-else-if="error" size="inline" message="Katalog özeti yüklenemedi — tekrar deneyin." @retry="emit('retry')" />
    <template v-else-if="data">
      <dl class="dash-catalog__facts">
        <div v-for="f in facts" :key="f.label" :class="`is-${f.tone}`">
          <dt><EkIconTile :icon="f.icon" :tone="f.tone" size="sm" />{{ f.label }}</dt>
          <dd class="ek-num">{{ fmt(f.value) }}</dd>
        </div>
      </dl>

      <DashboardEmpty
        v-if="channels.length === 0"
        compact
        icon="mdi-swap-horizontal"
        :title="(data.totalProducts ?? 0) > 0 ? 'Henüz kanala aktarım yok' : 'Katalog boş'"
        :text="(data.totalProducts ?? 0) > 0 ? 'Ürünleri bir pazaryerine aktardığınızda kanal bazlı durum burada görünür.' : 'İlk ürününüzü tanımladığınızda katalog özeti burada görünür.'"
      />
      <div v-else class="dash-catalog__table-wrap">
        <table class="dash-catalog__table">
          <caption class="ek-sr-only">Kanal bazında varyant aktarım durumu</caption>
          <thead>
            <tr>
              <th scope="col">Kanal</th>
              <th v-for="c in COLUMNS" :key="c.key" scope="col" class="dash-catalog__num" :class="`dash-catalog__col--${c.key}`">
                <span class="dash-catalog__dot" :class="`dash-catalog__dot--${c.key}`" aria-hidden="true"></span>{{ c.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ch in channels" :key="ch.code" :data-channel="ch.code">
              <th scope="row">
                <EkPlatformMark :name="ch.title" :code="ch.code" />
                <!-- Kanalın kendi marka renginde ince çizgi (yalnız görsel; `.ek-ch-<kod>` → `--ek-ch-brand`). -->
                <span class="dash-catalog__bar" :class="channelClass(ch.code)" aria-hidden="true"></span>
              </th>
              <td v-for="c in COLUMNS" :key="c.key" class="dash-catalog__num" :class="`dash-catalog__col--${c.key}`">
                <button
                  v-if="linkable && c.statuses && ch[c.key] > 0"
                  type="button"
                  class="dash-catalog__cell dash-catalog__cell-link ek-num"
                  :class="`dash-catalog__cell--${c.key}`"
                  :aria-label="`${ch.title} — ${c.label}: ${fmt(ch[c.key])} varyant, ürün listesinde göster`"
                  @click="openTransfer(ch.code, c.statuses)"
                >{{ fmt(ch[c.key]) }}</button>
                <span v-else class="dash-catalog__cell ek-num" :class="[`dash-catalog__cell--${c.key}`, { 'dash-catalog__zero': ch[c.key] === 0 }]">{{ fmt(ch[c.key]) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <template v-if="canOpen('productDefinition')" #footer>
      <EkButton icon="mdi-plus" size="sm" @click="open('productDefinition')">Yeni ürün tanımla</EkButton>
    </template>
  </EkCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkCard, EkButton, EkErrorState, EkIconTile, EkPlatformMark, type EkTone } from '@entegrasyonik/ui/components'
import { channelClass } from '@entegrasyonik/ui/tokens'
import { formatNumber } from '@entegrasyonik/ui/format'
import { useIntegrationStore } from '@/stores/integrationStore'
import DashboardEmpty from './DashboardEmpty.vue'
import { useDashboardNavigation } from './useDashboardNavigation'

export interface ProductStatistics {
  totalProducts?: number
  variantPlatformTransferStatistics?: {
    totalVariants?: number
    totalStock?: number
    counts?: Record<string, Record<string, number>>
  }
}

type ColumnKey = 'onSale' | 'completed' | 'pending' | 'failed'

const props = defineProps<{ data: ProductStatistics | null; loading: boolean; error: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const { canOpen, open } = useDashboardNavigation()
const integrationStore: any = useIntegrationStore()
const linkable = computed(() => canOpen('productList'))
const fmt = (v: number | undefined) => formatNumber(v ?? 0)

const COLUMNS: Array<{ key: ColumnKey; label: string; statuses?: string[] }> = [
  { key: 'onSale', label: 'Satışta' },
  { key: 'completed', label: 'Aktarıldı', statuses: ['COMPLETED'] },
  { key: 'pending', label: 'Bekleyen', statuses: ['PENDING', 'WAITING'] },
  { key: 'failed', label: 'Hatalı', statuses: ['FAILED'] },
]

const stats = computed(() => props.data?.variantPlatformTransferStatistics)

/** Katalog özeti: hücre başına düz tonlu ikon + aynı tonda rakam (stok kartındaki şeritle aynı dil). */
const facts = computed<Array<{ label: string; value: number | undefined; icon: string; tone: EkTone }>>(() => [
  { label: 'Ürün', value: props.data?.totalProducts, icon: 'mdi-package-variant-closed', tone: 'action' },
  { label: 'Varyant', value: stats.value?.totalVariants, icon: 'mdi-shape-outline', tone: 'info' },
  { label: 'Toplam stok', value: stats.value?.totalStock, icon: 'mdi-warehouse', tone: 'success' },
])

const channels = computed(() =>
  Object.entries(stats.value?.counts ?? {})
    .filter(([code]) => typeof code === 'string' && code.length > 0)
    .map(([code, c]) => ({
      code,
      title: integrationStore.getIntegrationTitle?.(code) || code,
      onSale: c?.ONSALECOUNT ?? 0,
      completed: c?.COMPLETED ?? 0,
      pending: (c?.PENDING ?? 0) + (c?.WAITING ?? 0) + (c?.SENT ?? 0),
      failed: c?.FAILED ?? 0,
    })),
)

// Ürün listesi `transferStatuses` filtresi (mevcut sözleşme; eski dashboard paneliyle aynı).
const openTransfer = (integrationCode: string, statuses: string[]) =>
  open('productList', { transferStatuses: statuses.map((status) => ({ status, integrationCode })) })
</script>

<style scoped>
.dash-catalog {
  container-type: inline-size;
}

.dash-catalog :deep(.ek-card__body) {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

/* Katalog özeti: tek ince şerit, üç hücre; ikon ve rakam hücrenin tonunda. */
.dash-catalog__facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-border-subtle);
}

.dash-catalog__facts > div {
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-surface);
}

.dash-catalog__facts dt {
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

.dash-catalog__facts dd {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-metric-size);
  line-height: 1.2;
  font-weight: var(--ek-type-metric-weight);
  letter-spacing: -0.02em;
}

.dash-catalog__facts .is-action dd { color: var(--ek-color-action-emphasis); }
.dash-catalog__facts .is-info dd { color: var(--ek-color-info-emphasis); }
.dash-catalog__facts .is-success dd { color: var(--ek-color-success-emphasis); }

.dash-catalog__table-wrap {
  overflow-x: auto;
}

.dash-catalog__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ek-type-table-size);
  line-height: var(--ek-type-table-line);
}

.dash-catalog__table thead th {
  padding: var(--ek-space-2) var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-default);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-align: left;
  text-transform: uppercase;
}

.dash-catalog__table tbody th,
.dash-catalog__table tbody td {
  padding: var(--ek-space-2) var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  color: var(--ek-color-content-default);
  font-weight: var(--ek-font-weight-regular);
  text-align: left;
}

.dash-catalog__table tbody tr:last-child th,
.dash-catalog__table tbody tr:last-child td {
  border-bottom: 0;
}

.dash-catalog__table .dash-catalog__num {
  text-align: right;
}

/* Sütun başlığındaki nokta = sütunun tonu (aktarıldı yeşil, bekleyen turuncu, hatalı kırmızı). */
.dash-catalog__dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: var(--ek-radius-full);
  vertical-align: 1px;
}

.dash-catalog__dot--onSale { background: var(--ek-color-content-subtle); }
.dash-catalog__dot--completed { background: var(--ek-color-success); }
.dash-catalog__dot--pending { background: var(--ek-color-warning); }
.dash-catalog__dot--failed { background: var(--ek-color-error); }

.dash-catalog__table tbody th {
  min-width: 132px;
}

/* Kanal çizgisi: 2px, kanalın marka renginde (tanımsız kanalda nötr). */
.dash-catalog__bar {
  display: block;
  width: 72px;
  max-width: 100%;
  height: 2px;
  margin-top: 6px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-ch-brand, var(--ek-color-border-strong));
}

/* Sayı hücresi: sütunun tonunda düz hap (sıfırsa sakin metin). Tıklanabilir olan üzerine gelince koyulaşır. */
.dash-catalog__cell {
  display: inline-block;
  min-width: 36px;
  padding: 2px var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-chip);
  background: transparent;
  color: var(--ek-color-content-strong);
  font: inherit;
  font-weight: var(--ek-font-weight-semibold);
  text-align: center;
}

.dash-catalog__cell--completed { background: var(--ek-color-success-subtle); color: var(--ek-color-success-emphasis); }
.dash-catalog__cell--pending { background: var(--ek-color-warning-subtle); color: var(--ek-color-warning-emphasis); }
.dash-catalog__cell--failed { background: var(--ek-color-error-subtle); color: var(--ek-color-error-emphasis); }

.dash-catalog__cell.dash-catalog__zero {
  background: transparent;
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-regular);
}

.dash-catalog__cell-link {
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.dash-catalog__cell-link:hover {
  box-shadow: inset 0 0 0 1px currentColor;
}

.dash-catalog__cell-link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.dash-catalog__skeleton {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ek-space-3);
}

.dash-catalog__skeleton span {
  height: 72px;
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
}

/* Dar kartta "Aktarıldı" sütunu gizlenir (Satışta/Bekleyen/Hatalı iş için yeterli; tablo yatay kaymaz). */
@container (max-width: 480px) {
  .dash-catalog__col--completed {
    display: none;
  }

  .dash-catalog__table thead th,
  .dash-catalog__table tbody th,
  .dash-catalog__table tbody td {
    padding-right: var(--ek-space-1);
    padding-left: var(--ek-space-1);
  }

  .dash-catalog__facts > div {
    padding: var(--ek-space-3);
  }

  .dash-catalog__facts dd {
    font-size: var(--ek-type-title-size);
  }

  .dash-catalog__table tbody th {
    min-width: 0;
  }
}
</style>
