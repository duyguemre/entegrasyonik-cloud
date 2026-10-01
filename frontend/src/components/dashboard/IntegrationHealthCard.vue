<!--
  Entegrasyon sağlığı — `IntegrationService/getIntegrationHealth` (ADMIN kademesi, yalnız okuma;
  docs/API_TENANT_SURFACE.md §3). Üye kademesinde 403 döner → kart hiç gösterilmez (üst bileşen).
  `health` backend'de türetilir; burada yalnız etikete/tona çevrilir. `lastSuccessfulSyncAt`
  provisioning anında tohumlandığı için kimlik bilgisi girilmemiş kanalda GÖSTERİLMEZ (§3 uyarı a).
-->
<template>
  <EkCard
    title="Entegrasyon sağlığı"
    :subtitle="subtitle"
    icon="mdi-heart-pulse"
    :icon-tone="headerTone"
    :heading-level="3"
    :to-label="canOpen('marketplace') ? 'Pazaryeri entegrasyonlarını aç' : undefined"
    flush
    class="dash-health"
    @open="open('marketplace')"
  >
    <ul v-if="loading" class="dash-health__list" aria-hidden="true">
      <li v-for="n in 3" :key="n" class="dash-health__skeleton"><span></span><span></span></li>
    </ul>
    <div v-else-if="error" class="dash-health__pad">
      <EkErrorState size="inline" message="Entegrasyon sağlığı yüklenemedi — tekrar deneyin." @retry="emit('retry')" />
    </div>
    <DashboardEmpty
      v-else-if="rows.length === 0"
      icon="mdi-lan-disconnect"
      title="Bağlı entegrasyon yok"
      text="Pazaryeri, e-ticaret veya ERP hesabınızı bağladığınızda bağlantı durumu burada izlenir."
    />
    <ul v-else class="dash-health__list">
      <li v-for="row in rows" :key="row.integrationCode" class="dash-health__row" :data-health="row.integrationCode">
        <EkPlatformMark :name="row.title" :code="row.integrationCode" size="lg" :show-name="false" />
        <div class="dash-health__text">
          <p class="dash-health__name">
            {{ row.title }}
            <span class="dash-health__type">{{ typeLabel(row.type) }}</span>
          </p>
          <p class="dash-health__meta">{{ row.meta }}</p>
          <p v-if="row.errorLine" class="dash-health__error">{{ row.errorLine }}</p>
        </div>
        <EkStatusChip :tone="HEALTH[row.health].tone" :label="HEALTH[row.health].label" dot />
      </li>
    </ul>
  </EkCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkCard, EkStatusChip, EkErrorState, EkPlatformMark } from '@entegrasyonik/ui/components'
import type { EkTone } from '@entegrasyonik/ui/components'
import type { StatusTone } from '@/design/status-map'
import { formatNumber, formatRelative } from '@entegrasyonik/ui/format'
import { useIntegrationStore } from '@/stores/integrationStore'
import DashboardEmpty from './DashboardEmpty.vue'
import { useDashboardNavigation } from './useDashboardNavigation'
import type { IntegrationHealth, IntegrationHealthEntry, IntegrationHealthLevel } from './dashboardTypes'

const props = defineProps<{ data: IntegrationHealth | null; loading: boolean; error: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const { canOpen, open } = useDashboardNavigation()
const integrationStore: any = useIntegrationStore()

const HEALTH: Record<IntegrationHealthLevel, { tone: StatusTone; label: string }> = {
  healthy: { tone: 'success', label: 'Sağlıklı' },
  degraded: { tone: 'warning', label: 'Sorunlu' },
  down: { tone: 'danger', label: 'Erişilemiyor' },
  no_data: { tone: 'neutral', label: 'Veri yok' },
  not_configured: { tone: 'neutral', label: 'Ayarlanmadı' },
}

const ERROR_CODE: Record<string, string> = {
  AUTH: 'kimlik doğrulama hatası',
  RATE_LIMITED: 'istek sınırı aşıldı',
  UNAVAILABLE: 'servis erişilemedi',
  VALIDATION: 'doğrulama hatası',
  NOT_FOUND: 'kayıt bulunamadı',
  NOT_SUPPORTED: 'desteklenmeyen işlem',
  UNKNOWN_OUTCOME: 'sonucu belirsiz çağrı',
  INTERNAL: 'iç hata',
}

const typeLabel = (type: string) => ({ marketplace: 'Pazaryeri', ecommerce: 'E-ticaret', erp: 'ERP', shipment: 'Kargo' } as Record<string, string>)[type] ?? ''

const metaOf = (e: IntegrationHealthEntry) => {
  const parts: string[] = []
  if (e.credentialsConfigured === false) return 'Kimlik bilgileri girilmemiş'
  if (e.lastSuccessfulSyncAt) parts.push(`Eşitleme ${formatRelative(e.lastSuccessfulSyncAt)}`)
  if (e.last24h?.total > 0) parts.push(`${formatNumber(e.last24h.success)}/${formatNumber(e.last24h.total)} çağrı başarılı`)
  return parts.length ? parts.join(' · ') : 'Son 24 saatte çağrı yok'
}

const errorLineOf = (e: IntegrationHealthEntry) =>
  e.lastError && (e.health === 'degraded' || e.health === 'down')
    ? `Hata: ${ERROR_CODE[e.lastError.code] ?? 'bilinmeyen hata'} (${formatRelative(e.lastError.at)})`
    : ''


const SEVERITY: Record<IntegrationHealthLevel, number> = { down: 0, degraded: 1, healthy: 2, no_data: 3, not_configured: 4 }

const rows = computed(() =>
  [...(props.data?.integrations ?? [])]
    .filter((e) => e.enabled !== false)
    .sort((a, b) => SEVERITY[a.health] - SEVERITY[b.health])
    .map((e) => ({ ...e, title: integrationStore.getIntegrationTitle?.(e.integrationCode) || e.integrationCode, meta: metaOf(e), errorLine: errorLineOf(e) })),
)

const count = (level: IntegrationHealthLevel) => rows.value.filter((r) => r.health === level).length

const headerTone = computed<EkTone>(() => {
  if (count('down') > 0) return 'error'
  if (count('degraded') > 0) return 'warning'
  return 'success'
})

const subtitle = computed(() => {
  if (props.loading || props.error || !props.data) return 'Bağlantı durumu · son 24 saat'
  if (rows.value.length === 0) return 'Bağlı kanal yok'
  const issues = count('down') + count('degraded')
  return issues > 0
    ? `${issues} kanalda sorun var · ${count('healthy')} sağlıklı`
    : `${count('healthy')}/${rows.value.length} kanal sağlıklı · son 24 saat`
})
</script>

<style scoped>
.dash-health__pad {
  padding: var(--ek-space-5);
}

.dash-health__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dash-health__row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 64px;
  padding: var(--ek-space-3) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.dash-health__row:last-child {
  border-bottom: 0;
}

.dash-health__text {
  flex: 1;
  min-width: 0;
}

.dash-health__name {
  display: flex;
  align-items: baseline;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.dash-health__type {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.dash-health__meta {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.dash-health__error {
  margin: 0;
  color: var(--ek-color-warning-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.dash-health__skeleton {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 64px;
  padding: 0 var(--ek-space-5);
}

.dash-health__skeleton span:first-child {
  width: 32px;
  height: 32px;
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
}

.dash-health__skeleton span:last-child {
  flex: 1;
  height: 16px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}
</style>
