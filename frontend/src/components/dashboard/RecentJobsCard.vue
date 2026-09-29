<!--
  Son işlemler — `IntegrationService/getExportJobs` (member; `createdAt` azalan, arşivlenmişler hariç).
  Kanallara giden son ürün/fiyat/stok aktarım işleri; durum etiketi/tonu işlem günlüğü ekranıyla aynı.
-->
<template>
  <EkCard
    title="Son işlemler"
    :subtitle="subtitle"
    icon="mdi-history"
    icon-tone="info"
    :heading-level="2"
    :to-label="canOpen('logList') ? 'İşlem günlüğünü aç' : undefined"
    flush
    class="dash-jobs"
    @open="open('logList')"
  >
    <ul v-if="loading" class="dash-jobs__list" aria-hidden="true">
      <li v-for="n in 4" :key="n" class="dash-jobs__skeleton"><span></span><span></span></li>
    </ul>
    <div v-else-if="error" class="dash-jobs__pad">
      <EkErrorState size="inline" message="Son işlemler yüklenemedi — tekrar deneyin." @retry="emit('retry')" />
    </div>
    <DashboardEmpty
      v-else-if="jobs.length === 0"
      icon="mdi-history"
      title="Henüz aktarım işlemi yok"
      text="Ürün, fiyat veya stok bir kanala gönderildiğinde işlemler burada listelenir."
    />
    <ul v-else class="dash-jobs__list">
      <li v-for="job in jobs" :key="job._id" class="dash-jobs__row">
        <EkPlatformMark v-if="job.integrationCode" :name="integrationTitle(job.integrationCode)" :code="job.integrationCode" :show-name="false" />
        <div class="dash-jobs__text">
          <p class="dash-jobs__title">{{ job.title || job.barcode || 'Aktarım işi' }}</p>
          <p class="dash-jobs__meta">
            {{ job.integrationCode ? integrationTitle(job.integrationCode) : '' }}<template v-if="job.createdAt"> · {{ formatRelative(job.createdAt) }}</template>
          </p>
        </div>
        <EkStatusChip :tone="statusTone(job.status)" :label="statusLabel(job.status)" />
      </li>
    </ul>
  </EkCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkCard from '@/components/ds/EkCard.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkErrorState from '@/components/ds/EkErrorState.vue'
import EkPlatformMark from '@/components/ds/EkPlatformMark.vue'
import type { StatusTone } from '@/design/status-map'
import { formatNumber, formatRelative } from '@/composables/format'
import { useIntegrationStore } from '@/stores/integrationStore'
import DashboardEmpty from './DashboardEmpty.vue'
import { useDashboardNavigation } from './useDashboardNavigation'
import type { ExportJobPage } from './dashboardTypes'

const props = defineProps<{ data: ExportJobPage | null; loading: boolean; error: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const { canOpen, open } = useDashboardNavigation()
const integrationStore: any = useIntegrationStore()

// İşlem günlüğü ekranındaki (ExportLogList) etiket/ton eşlemesiyle aynı.
const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  QUEUED: { label: 'Kuyrukta', tone: 'neutral' },
  PREPARING: { label: 'Hazırlanıyor', tone: 'neutral' },
  PENDING: { label: 'Gönderiliyor', tone: 'info' },
  SENT: { label: 'Sorgulanıyor', tone: 'info' },
  WAITING: { label: 'Onay bekleniyor', tone: 'warning' },
  COMPLETED: { label: 'Tamamlandı', tone: 'success' },
  FAILED: { label: 'Hata oluştu', tone: 'danger' },
  CANCELLED: { label: 'İptal edildi', tone: 'neutral' },
}
const statusTone = (s?: string) => STATUS[s?.toUpperCase() ?? '']?.tone ?? 'neutral'
const statusLabel = (s?: string) => STATUS[s?.toUpperCase() ?? '']?.label ?? (s || 'Bilinmiyor')

const integrationTitle = (code: string) => integrationStore.getIntegrationTitle?.(code) || code
const jobs = computed(() => (props.data?.data ?? []).slice(0, 5))

const subtitle = computed(() => {
  const total = props.data?.pagination?.totalNumberOfRecords
  if (props.loading || props.error || !props.data || !total) return 'Kanallara son aktarımlar'
  return `Son ${jobs.value.length} / toplam ${formatNumber(total)} aktarım`
})
</script>

<style scoped>
.dash-jobs__pad {
  padding: var(--ek-space-5);
}

.dash-jobs__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dash-jobs__row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 56px;
  padding: var(--ek-space-2) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.dash-jobs__row:last-child {
  border-bottom: 0;
}

.dash-jobs__text {
  flex: 1;
  min-width: 0;
}

.dash-jobs__title {
  margin: 0;
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dash-jobs__meta {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.dash-jobs__skeleton {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 56px;
  padding: 0 var(--ek-space-5);
}

.dash-jobs__skeleton span:first-child {
  width: 24px;
  height: 24px;
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
}

.dash-jobs__skeleton span:last-child {
  flex: 1;
  height: 16px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}
</style>
