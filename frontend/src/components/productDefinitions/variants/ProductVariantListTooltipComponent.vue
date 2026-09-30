<!--
  frontend/src/components/productDefinitions/variants/ProductVariantListTooltipComponent.vue

  Varyantın TEK kanaldaki durum kartı (ürün listesi varyant alanında kanal çipine tıklayınca açılır). A11 — DS-v2 dili:
    kanal başlığı (kanal rengi nokta + ad, isteğe bağlı) → satış durumu (ton kapsülü + metin + son güncelleme) →
    kanal verisi (fiyat/stok, tabular) → iletiler (neden) → süreç adımları (tarihli dikey çizgi).
  Veri yalnız `platforms.<kod>` (upload adımları, prices, stock). Metinler karakterizasyon testleriyle korunur.
-->
<template>
  <v-card class="premium-status-container pvt" :class="channelCode ? channelClass(channelCode) : undefined">
    <div v-if="channelName" class="pvt-channel">
      <span class="pvt-channel__dot" aria-hidden="true"></span>
      <span class="pvt-channel__name">{{ channelName }}</span>
    </div>

    <div class="header-section pvt-head" :class="[`is-${saleTone}`, { 'is-on-sale': isActuallyOnSale }]">
      <span class="pvt-head__icon" aria-hidden="true"><v-icon :icon="getSaleStatusIcon" /></span>
      <span class="pvt-head__text">
        <span class="pvt-micro">Satış Durumu</span>
        <span class="status-main-text pvt-head__status">{{ getSaleStatusText }}</span>
      </span>
      <span class="date-tag pvt-head__date ek-num">{{ formatDate(lastUpdatedAt) }}</span>
    </div>

    <dl v-if="data?.prices || data?.stock !== undefined" class="platform-data-grid pvt-data">
      <div v-if="data?.prices?.salePrice" class="data-box">
        <dt class="pvt-micro">Satış Fiyatı</dt>
        <dd class="ek-num">{{ formatCurrency(data.prices.salePrice) }}</dd>
      </div>
      <div v-if="data?.prices?.marketPrice" class="data-box">
        <dt class="pvt-micro">Piyasa Fiyatı</dt>
        <dd class="ek-num">{{ formatCurrency(data.prices.marketPrice) }}</dd>
      </div>
      <div v-if="data?.stock !== undefined" class="data-box">
        <dt class="pvt-micro">Pazaryeri Stoğu</dt>
        <dd class="ek-num" :class="{ 'is-out': data.stock <= 0 }">{{ data.stock }} Adet</dd>
      </div>
    </dl>

    <ul v-if="data?.upload?.statusMessages?.length" class="alert-box pvt-alerts">
      <li v-for="(msg, index) in data.upload.statusMessages" :key="index" class="alert-item">
        <v-icon icon="mdi-alert-circle-outline" aria-hidden="true" />{{ msg }}
      </li>
    </ul>

    <ol v-if="filteredIntegrationSteps.length" class="timeline-body pvt-steps">
      <li v-for="item in filteredIntegrationSteps" :key="item.id" class="timeline-item pvt-step" :class="[getStepStatusClass(data?.upload?.[item.id]?.status), `is-${stepTone(data?.upload?.[item.id]?.status)}`]">
        <span class="pvt-step__marker" aria-hidden="true">
          <v-icon :icon="getStatusMeta(data?.upload?.[item.id]?.status)?.icon || 'mdi-circle-small'" />
        </span>
        <span class="pvt-step__body">
          <span class="pvt-step__row">
            <span class="step-title">{{ item.label }}</span>
            <span class="step-date ek-num">{{ formatDate(data?.upload?.[item.id]?.updatedAt) }}</span>
          </span>
          <span class="status-label">{{ getStatusMeta(data?.upload?.[item.id]?.status)?.message || 'İşlem yok' }}</span>
          <span v-if="data?.upload?.[item.id]?.messages?.length" class="log-section">
            <span v-for="(msg, idx) in data.upload[item.id].messages" :key="idx" class="log-row">{{ msg }}</span>
          </span>
        </span>
      </li>
    </ol>
    <p v-else class="pvt-empty">Bu kanalda henüz işlem yok.</p>
  </v-card>
</template>

<script setup lang="ts">
import { formatDateTime, formatMoney } from '@/composables/format'
import { computed } from 'vue'
import { useStaticsStore } from '@/stores/staticsStore'
import { PLATFORM_PROCESS, PLATFORM_PROCESS_LABELS } from '@/types/PlatformProcess'
import { channelClass } from '@/design/channels'

const staticsStore: any = useStaticsStore()
const props = defineProps<{ data: any; channelCode?: string; channelName?: string }>()

const transferStatus = computed(() => props.data?.upload?.TRANSFER?.status)

const isActuallyOnSale = computed(() => {
  // 1. Öncelik: platformdan gelen `onSale`; 2. aktarım tamamsa varsayılan açık.
  if (props.data?.upload?.onSale === true) return true
  if (props.data?.upload?.onSale === false) return false
  return transferStatus.value === 'COMPLETED'
})

const saleTone = computed(() => {
  if (isActuallyOnSale.value) return 'success'
  if (transferStatus.value === 'WAITING' || transferStatus.value === 'SENT') return 'warning'
  if (transferStatus.value === 'FAILED') return 'danger'
  return 'neutral'
})

const getSaleStatusText = computed(() => {
  if (isActuallyOnSale.value) return 'Pazaryerinde Yayında'
  if (transferStatus.value === 'WAITING' || transferStatus.value === 'SENT') return 'Onay Sürecinde'
  if (transferStatus.value === 'FAILED') return 'Gönderim Başarısız'
  return 'Satışa Kapalı'
})

const getSaleStatusIcon = computed(() => {
  if (isActuallyOnSale.value) return 'mdi-store-check-outline'
  if (transferStatus.value === 'WAITING' || transferStatus.value === 'SENT') return 'mdi-store-clock-outline'
  return 'mdi-store-remove-outline'
})

const filteredIntegrationSteps = computed(() =>
  Object.values(PLATFORM_PROCESS)
    .filter((mode) => props.data?.upload?.[mode]) // yalnız verisi olan adımlar
    .map((mode) => ({ id: mode, label: PLATFORM_PROCESS_LABELS[mode] })),
)

/** Son güncelleme: kanal kaydının tarihi, yoksa en yeni süreç adımının tarihi. */
const lastUpdatedAt = computed(() => {
  if (props.data?.upload?.updatedAt) return props.data.upload.updatedAt
  const dates = Object.values(PLATFORM_PROCESS).map((m) => props.data?.upload?.[m]?.updatedAt).filter(Boolean)
  return dates.sort().at(-1)
})

const stepTone = (status: any) => {
  switch (status) {
    case 'COMPLETED': return 'success'
    case 'FAILED': return 'danger'
    case 'WAITING': case 'SENT': return 'warning'
    case 'PENDING': return 'info'
    default: return 'neutral'
  }
}

const getStepStatusClass = (status: any) => (status ? `status-${String(status).toLowerCase()}` : 'is-pending')

const getStatusMeta = (status: any) => {
  if (!status) return { message: '', icon: 'mdi-clock-outline' }
  return staticsStore.STATUS_META?.[status as keyof typeof staticsStore.STATUS_META]
}

const formatDate = (date: any) => (date ? formatDateTime(date) : 'İşlem Yok')
const formatCurrency = (n: number) => (n ? formatMoney(Number(n)) : formatMoney(0))
</script>

<style scoped>
.pvt {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  width: 360px;
  max-width: calc(100vw - 32px);
  padding: var(--ek-space-4);
  border-radius: var(--ek-radius-popover) !important; /* v-card varsayılan yarıçapı */
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pvt-micro {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.pvt-channel {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-ch-text);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}

.pvt-channel__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-ch-solid);
}

/* Satış durumu bandı: ton subtle zemin + ton kenarlık; metin emphasis (AA). */
.pvt-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-muted);
}

.pvt-head__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
}

.pvt-head__icon .v-icon { font-size: var(--ek-icon-md); }

.pvt-head__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pvt-head__status {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-semibold);
}

.pvt-head__date {
  align-self: start;
  color: var(--ek-color-content-muted);
}

.pvt-head.is-success { border-color: var(--ek-color-success-border); background: var(--ek-color-success-subtle); }
.pvt-head.is-success .pvt-head__icon { color: var(--ek-color-success); }
.pvt-head.is-success .pvt-head__status { color: var(--ek-color-success-emphasis); }
.pvt-head.is-warning { border-color: var(--ek-color-warning-border); background: var(--ek-color-warning-subtle); }
.pvt-head.is-warning .pvt-head__icon { color: var(--ek-color-warning); }
.pvt-head.is-warning .pvt-head__status { color: var(--ek-color-warning-emphasis); }
.pvt-head.is-danger { border-color: var(--ek-color-error-border); background: var(--ek-color-error-subtle); }
.pvt-head.is-danger .pvt-head__icon { color: var(--ek-color-error); }
.pvt-head.is-danger .pvt-head__status { color: var(--ek-color-error-emphasis); }

.pvt-data {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: var(--ek-space-3);
  margin: 0;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
}

.pvt-data dd {
  margin: 2px 0 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}

.pvt-data dd.is-out { color: var(--ek-color-error-emphasis); }

.pvt-alerts {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  margin: 0;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-warning-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
  list-style: none;
}

.alert-item {
  display: flex;
  gap: var(--ek-space-2);
}

.alert-item .v-icon { flex: none; margin-top: 1px; font-size: var(--ek-icon-xs); }

/* Süreç adımları: tarihli dikey çizgi. */
.pvt-steps {
  margin: 0;
  padding: 0;
  list-style: none;
}

.pvt-step {
  position: relative;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: var(--ek-space-3);
  padding-bottom: var(--ek-space-3);
}

.pvt-step:last-child { padding-bottom: 0; }

.pvt-step:not(:last-child)::before {
  content: '';
  position: absolute;
  top: 26px;
  bottom: 2px;
  left: 11px;
  width: 2px;
  border-radius: 1px;
  background: var(--ek-color-border-default);
}

.pvt-step__marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
}

.pvt-step__marker .v-icon { font-size: var(--ek-icon-xs); }

.pvt-step.is-success .pvt-step__marker { border-color: var(--ek-color-success-border); background: var(--ek-color-success-subtle); color: var(--ek-color-success); }
.pvt-step.is-danger .pvt-step__marker { border-color: var(--ek-color-error-border); background: var(--ek-color-error-subtle); color: var(--ek-color-error); }
.pvt-step.is-warning .pvt-step__marker { border-color: var(--ek-color-warning-border); background: var(--ek-color-warning-subtle); color: var(--ek-color-warning); }
.pvt-step.is-info .pvt-step__marker { border-color: var(--ek-color-info-border); background: var(--ek-color-info-subtle); color: var(--ek-color-info); }

.pvt-step__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding-top: 3px;
}

.pvt-step__row {
  display: flex;
  justify-content: space-between;
  gap: var(--ek-space-2);
}

.step-title {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.step-date { color: var(--ek-color-content-muted); white-space: nowrap; }

.status-label {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-medium);
}

.pvt-step.is-success .status-label { color: var(--ek-color-success-emphasis); }
.pvt-step.is-danger .status-label { color: var(--ek-color-error-emphasis); }
.pvt-step.is-warning .status-label { color: var(--ek-color-warning-emphasis); }
.pvt-step.is-info .status-label { color: var(--ek-color-info-emphasis); }

.log-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: var(--ek-space-1);
  padding: var(--ek-space-2);
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}

.log-row { color: var(--ek-color-content-default); }

.pvt-empty {
  margin: 0;
  color: var(--ek-color-content-muted);
}
</style>
