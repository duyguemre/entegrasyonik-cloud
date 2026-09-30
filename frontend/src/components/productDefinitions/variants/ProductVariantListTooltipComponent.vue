<template>
  <v-card class="premium-status-container" rounded="lg">

    <div class="header-section" :class="{ 'is-on-sale': isActuallyOnSale }">
      <div class="d-flex justify-space-between align-start">
        <div class="d-flex align-center">
          <div class="status-icon-bg">
            <v-icon :color="getSaleStatusColor" size="22">
              {{ getSaleStatusIcon }}
            </v-icon>
          </div>
          <div class="ml-3">
            <div class="text-overline lh-1 mb-1">Satış Durumu</div>
            <div class="status-main-text" :style="{ color: getSaleStatusColor }">
              {{ getSaleStatusText }}
            </div>
          </div>
        </div>
        <div class="date-tag">
          {{ formatDate(data?.upload?.updatedAt) }}
        </div>
      </div>

      <!-- PAZARYERİ VERİLERİ (Fiyat/Stok) -->
      <div v-if="data?.prices || data?.stock !== undefined" class="platform-data-grid mt-4">
        <div v-if="data?.prices?.salePrice" class="data-box">
          <div class="label">Satış Fiyatı</div>
          <div class="value">{{ formatCurrency(data.prices.salePrice) }}</div>
        </div>
        <div v-if="data?.prices?.marketPrice" class="data-box">
          <div class="label">Piyasa Fiyatı</div>
          <div class="value">{{ formatCurrency(data.prices.marketPrice) }}</div>
        </div>
        <div v-if="data?.stock !== undefined" class="data-box">
          <div class="label">Pazaryeri Stoğu</div>
          <div class="value" :class="{ 'text-error': data.stock <= 0 }">{{ data.stock }} Adet</div>
        </div>
      </div>

      <div v-if="data?.upload?.statusMessages?.length" class="alert-box mt-3">
        <div v-for="(msg, index) in data.upload.statusMessages" :key="index" class="alert-item">
          <v-icon size="14" color="warning" class="mr-2" aria-hidden="true">mdi-alert-circle-outline</v-icon>
          {{ msg }}
        </div>
      </div>
    </div>

    <div class="timeline-body">
      <template v-for="(item, key, index) in filteredIntegrationSteps" :key="key">
        <div class="timeline-item" :class="getStepStatusClass(data?.upload?.[item.id]?.status)">

          <div class="indicator-wrapper">
            <div class="status-circle" :style="{ backgroundColor: getIntegrationColor(data?.upload?.[item.id]?.status) }">
              <v-icon size="14" color="content-inverse">
                {{ getStatusMeta(data?.upload?.[item.id]?.status)?.icon || 'mdi-circle' }}
              </v-icon>
            </div>
            <div v-if="index !== filteredIntegrationSteps.length - 1" class="connector-line"></div>
          </div>

          <div class="content-wrapper">
            <div class="d-flex justify-space-between mb-1">
              <span class="step-title">{{ item.label }}</span>
              <span class="step-date">{{ formatDate(data?.upload?.[item.id]?.updatedAt) }}</span>
            </div>

            <div class="info-bubble">
              <div class="status-label" :style="{ color: getIntegrationColor(data?.upload?.[item.id]?.status) }">
                {{ getStatusMeta(data?.upload?.[item.id]?.status)?.message || 'İŞLEM YOK' }}
              </div>

              <div v-if="data?.upload?.[item.id]?.messages?.length" class="log-section">
                <div v-for="(msg, idx) in data.upload[item.id].messages" :key="idx" class="log-row">
                  {{ msg }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { formatDateTime, formatMoney } from '@/composables/format'
import { computed } from 'vue';
import { useStaticsStore } from '@/stores/staticsStore';
import { PLATFORM_PROCESS, PLATFORM_PROCESS_LABELS, PLATFORM_PROCESS_COLORS } from '@/types/PlatformProcess';
enum PRODUCT_INTEGRATION_STATUS {
  PENDING = 'PENDING',
  SENT = 'SENT',
  WAITING = 'WAITING',
  FAILED = 'FAILED',
  COMPLETED = 'COMPLETED',
}

const staticsStore: any = useStaticsStore();
const props = defineProps<{ data: any }>();

const isActuallyOnSale = computed(() => {
  // 1. Öncelik: Platformdan gelen özel 'onSale' bilgisi
  if (props.data?.upload?.onSale === true) return true;
  if (props.data?.upload?.onSale === false) return false;

  // 2. Öncelik: Eğer ürün başarıyla transfer edilmişse varsayılan olarak 'Açık' kabul et
  if (props.data?.upload?.TRANSFER?.status === 'COMPLETED') return true;

  return false;
});

const getSaleStatusText = computed(() => {
  if (isActuallyOnSale.value) return 'Pazaryerinde Yayında';
  
  const transferStatus = props.data?.upload?.TRANSFER?.status;
  if (transferStatus === 'WAITING' || transferStatus === 'SENT') return 'Onay Sürecinde';
  if (transferStatus === 'FAILED') return 'Gönderim Başarısız';
  
  return 'Satışa Kapalı';
});

const getSaleStatusColor = computed(() => {
  if (isActuallyOnSale.value) return 'var(--ek-color-success)';
  const transferStatus = props.data?.upload?.TRANSFER?.status;
  if (transferStatus === 'WAITING' || transferStatus === 'SENT') return 'var(--ek-color-warning)';
  return 'var(--ek-color-error)';
});

const getSaleStatusIcon = computed(() => {
  if (isActuallyOnSale.value) return 'mdi-store-check';
  const transferStatus = props.data?.upload?.TRANSFER?.status;
  if (transferStatus === 'WAITING' || transferStatus === 'SENT') return 'mdi-store-clock';
  return 'mdi-store-remove';
});

const filteredIntegrationSteps = computed(() => {
  return Object.values(PLATFORM_PROCESS)
    .filter(mode => props.data?.upload?.[mode]) // Sadece veri olan adımları göster
    .map(mode => ({
      id: mode,
      label: PLATFORM_PROCESS_LABELS[mode],
      color: PLATFORM_PROCESS_COLORS[mode]
    }));
});

const getIntegrationColor = (status: PRODUCT_INTEGRATION_STATUS) => {
  switch (status) {
    // ADR-0015 Karar 3.3 durum tonları (AA token'ları): info / primary / warning / error / success / neutral.
    case PRODUCT_INTEGRATION_STATUS.PENDING: return 'var(--ek-color-info)';
    case PRODUCT_INTEGRATION_STATUS.SENT: return 'var(--ek-color-primary)';
    case PRODUCT_INTEGRATION_STATUS.WAITING: return 'var(--ek-color-warning)';
    case PRODUCT_INTEGRATION_STATUS.FAILED: return 'var(--ek-color-error)';
    case PRODUCT_INTEGRATION_STATUS.COMPLETED: return 'var(--ek-color-success)';
    default: return 'var(--ek-color-content-muted)';
  }
};

const getStepStatusClass = (status: any) => {
  if (!status) return 'is-pending';
  return `status-${status.toLowerCase()}`;
}

const getStatusMeta = (status: any) => {
  if (!status) return { message: "", icon: 'mdi-clock-outline' };
  return staticsStore.STATUS_META?.[status as keyof typeof staticsStore.STATUS_META];
};

const formatDate = (date: any) => {
  if (!date) return 'İşlem Yok';
  return formatDateTime(date);
};

const formatCurrency = (number: number) => {
  if (!number) return '0,00 TL';
  return formatMoney(Number(number));
};
</script>

<style scoped>
/* Konteynır: Menü içine otursun diye dış padding/margin optimize edildi */
.premium-status-container {
  padding: var(--ek-space-4);
  background-color: var(--ek-color-surface);
  min-width: 340px;
  max-width: 400px;
}

/* Header Section: Arka plandan ayrışan temiz bir başlık.
   Not: durum sınıfı `is-on-sale` — `on-sale` adı ProductListView'ın GLOBAL `.on-sale`
   (opacity .6) kuralıyla çakışıp başlığı soluklaştırıyordu (ADR-0015 B5-2 bulgusu). */
.header-section {
  background: var(--ek-color-surface-muted);
  border-radius: var(--ek-radius-lg);
  padding: var(--ek-space-3);
  margin-bottom: var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
}

.header-section.is-on-sale {
  background: var(--ek-color-success-subtle);
  border-color: var(--ek-color-success-subtle);
}

.status-icon-bg {
  background: var(--ek-color-surface);
  padding: 6px;
  border-radius: var(--ek-radius-lg);
  display: flex;
  box-shadow: var(--ek-shadow-sm);
}

.status-main-text {
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-bold);
  letter-spacing: -0.3px;
}

.date-tag {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-bold);
  background: var(--ek-color-surface);
  padding: 2px 6px;
  border-radius: var(--ek-radius-sm);
  border: 1px solid var(--ek-color-border-default);
}

.alert-box {
  border-top: 1px dashed var(--ek-color-border-default);
  padding-top: var(--ek-space-2);
}

/* PAZARYERİ VERİLERİ GRID */
.platform-data-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--ek-space-2);
  background: var(--ek-color-surface);
  padding: 10px;
  border-radius: var(--ek-radius-lg);
  border: 1px solid var(--ek-color-border-default);
}

.data-box {
  display: flex;
  flex-direction: column;
}

.data-box .label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-bold);
  color: var(--ek-color-content-muted);
  text-transform: uppercase;
  margin-bottom: 2px;
}

.data-box .value {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-bold);
  color: var(--ek-color-content-strong);
}

.text-error {
  color: var(--ek-color-error) !important;
}

/* Timeline Akışı */
.timeline-body {
  padding-left: var(--ek-space-1);
}

.timeline-item {
  display: flex;
  gap: var(--ek-space-4);
}

.indicator-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.status-circle {
  width: 26px;
  height: 26px;
  border-radius: var(--ek-radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  box-shadow: var(--ek-shadow-sm);
}

.connector-line {
  width: 2px;
  flex-grow: 1;
  background: var(--ek-color-border-default);
  margin: 2px 0;
}

.timeline-item.status-completed .connector-line {
  /* Hafif yeşil çizgi */
  background: var(--ek-color-success-subtle);
}

.content-wrapper {
  flex-grow: 1;
  padding-bottom: 18px;
}

.step-title {
  font-weight: var(--ek-font-weight-bold);
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
}

.step-date {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-semibold);
}

.info-bubble {
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  padding: var(--ek-space-2) var(--ek-space-3);
  transition: border-color var(--ek-duration-base) var(--ek-easing-standard),
    background-color var(--ek-duration-base) var(--ek-easing-standard);
}

.timeline-item:hover .info-bubble {
  border-color: var(--ek-color-border-strong);
  background: var(--ek-color-surface-muted);
}

.status-label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.log-section {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--ek-color-border-default);
}

.log-row {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
  line-height: 1.5;
  position: relative;
  padding-left: 10px;
}

.log-row::before {
  content: "";
  position: absolute;
  left: 0;
  top: 7px;
  width: 4px;
  height: 4px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-border-strong);
}

.text-overline {
  font-size: var(--ek-font-size-xs) !important;
  color: var(--ek-color-content-default);
  font-weight: var(--ek-font-weight-bold);
}

.lh-1 {
  line-height: 1;
}
</style>
