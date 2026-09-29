<template>
  <v-card class="premium-status-container" rounded="lg">

    <div class="header-section" :class="{ 'on-sale': isActuallyOnSale }">
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
          <v-icon size="14" color="amber-darken-3" class="mr-2">mdi-alert-circle-outline</v-icon>
          {{ msg }}
        </div>
      </div>
    </div>

    <div class="timeline-body">
      <template v-for="(item, key, index) in filteredIntegrationSteps" :key="key">
        <div class="timeline-item" :class="getStepStatusClass(data?.upload?.[item.id]?.status)">

          <div class="indicator-wrapper">
            <div class="status-circle" :style="{ backgroundColor: getIntegrationColor(data?.upload?.[item.id]?.status) }">
              <v-icon size="14" color="white">
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
  if (isActuallyOnSale.value) return '#10b981';
  const transferStatus = props.data?.upload?.TRANSFER?.status;
  if (transferStatus === 'WAITING' || transferStatus === 'SENT') return '#f59e0b';
  return '#ef4444';
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
    case PRODUCT_INTEGRATION_STATUS.PENDING: return '#3b82f6';
    case PRODUCT_INTEGRATION_STATUS.SENT: return '#6366f1';
    case PRODUCT_INTEGRATION_STATUS.WAITING: return '#f59e0b';
    case PRODUCT_INTEGRATION_STATUS.FAILED: return '#ef4444';
    case PRODUCT_INTEGRATION_STATUS.COMPLETED: return '#10b981';
    default: return '#94a3b8';
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
  const d = new Date(date);
  return d.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const formatCurrency = (number: number) => {
  if (!number) return '0,00 TL';
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(number));
};
</script>

<style scoped>
/* Konteynır: Menü içine otursun diye dış padding/margin optimize edildi */
.premium-status-container {
  padding: 16px;
  background-color: #ffffff;
  min-width: 340px;
  max-width: 400px;
}

/* Header Section: Arka plandan ayrışan temiz bir başlık */
.header-section {
  background: #f8fafc;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 20px;
  border: 1px solid #f1f5f9;
}

.header-section.on-sale {
  background: #f0fdf4;
  border-color: #dcfce7;
}

.status-icon-bg {
  background: white;
  padding: 6px;
  border-radius: 8px;
  display: flex;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.03);
}

.status-main-text {
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: -0.3px;
}

.date-tag {
  font-size: 0.65rem;
  color: #94a3b8;
  font-weight: 700;
  background: #ffffff;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #f1f5f9;
}

.alert-box {
  border-top: 1px dashed #e2e8f0;
  padding-top: 8px;
}

/* PAZARYERİ VERİLERİ GRID */
.platform-data-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  background: white;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #f1f5f9;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.02);
}

.data-box {
  display: flex;
  flex-direction: column;
}

.data-box .label {
  font-size: 0.6rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.data-box .value {
  font-size: 0.8rem;
  font-weight: 800;
  color: #1e293b;
}

.text-error {
  color: #ef4444 !important;
}

/* Timeline Akışı */
.timeline-body {
  padding-left: 4px;
}

.timeline-item {
  display: flex;
  gap: 16px;
}

.indicator-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.status-circle {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.connector-line {
  width: 2px;
  flex-grow: 1;
  background: #f1f5f9;
  margin: 2px 0;
}

.timeline-item.status-completed .connector-line {
  background: #10b98133;
  /* Hafif yeşil çizgi */
}

.content-wrapper {
  flex-grow: 1;
  padding-bottom: 18px;
}

.step-title {
  font-weight: 700;
  font-size: 0.85rem;
  color: #334155;
}

.step-date {
  font-size: 0.65rem;
  color: #cbd5e1;
  font-weight: 600;
}

.info-bubble {
  background: #ffffff;
  border: 1px solid #f1f5f9;
  border-radius: 8px;
  padding: 8px 12px;
  transition: all 0.2s ease;
}

.timeline-item:hover .info-bubble {
  border-color: #e2e8f0;
  background: #fcfcfd;
}

.status-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.log-section {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #f8fafc;
}

.log-row {
  font-size: 0.7rem;
  color: #64748b;
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
  border-radius: 50%;
  background: #e2e8f0;
}

.text-overline {
  font-size: 0.6rem !important;
  color: #94a3b8;
  font-weight: 800;
}

.lh-1 {
  line-height: 1;
}
</style>