<!--
  frontend/src/views/secure/integrations/IntegrationHealthView.vue

  ADR-0015 B4-P1c — N7 "Entegrasyon sağlığı" (tenant, YALNIZCA OKUMA; DS-v2).
  Sözleşme: `docs/API_TENANT_SURFACE.md` §3 — `IntegrationService/getIntegrationHealth` (admin, owner dahil).
  Düzen: başlık → durum şeridi (generatedAt + Yenile) → özet KPI satırı (`EkMetricCard`) → entegrasyon başına kart
  (`IntegrationHealthCard`, sorunlu olan önce) → kaynak notu (§3 uyarı c: aktif "bağlantıyı test et" YOK)
  → C1.2 / WP7b: webhook adresi kanal başına (trendyol, hepsiburada, ideasoft; durum + oluştur/yenile, `IntegrationWebhookPanel`; yalnız kanal kuruluysa).
  Kartın yuvarlak oku ilgili mevcut ayar sekmesini açar (türüne göre; menüde yoksa ok gösterilmez).
  403 → yetki durumu (EkEmptyState), diğer hatalar → EkErrorState (yeniden dene). Uydurma veri YOK.
-->
<template>
  <div class="integrationHealthView ek-health-view">
    <EkPageHeader
      :section="t('integrationHealth.section')"
      :title="t('integrationHealth.title')"
      :description="t('integrationHealth.description')"
      :refreshable="state !== 'forbidden'"
      :refreshing="state === 'loading' || refreshing"
      :refresh-label="t('integrationHealth.refresh')"
      :last-updated="data?.generatedAt"
      @refresh="load(true)"
    />

    <div v-if="state !== 'forbidden'" class="ek-health-view__strip">
      <p class="ek-health-view__stamp" aria-live="polite">
        <v-icon icon="mdi-clock-outline" size="16" aria-hidden="true" />
        <template v-if="data">
          <span>{{ t('integrationHealth.generatedAt', { time: formatDateTime(data.generatedAt) }) }}</span>
          <span class="ek-health-view__sep" aria-hidden="true">·</span>
          <span>{{ t('integrationHealth.window', { hours: data.windowHours }) }}</span>
        </template>
        <span v-else-if="state === 'loading'">{{ t('integrationHealth.loading') }}</span>
        <span v-else>{{ t('integrationHealth.notLoaded') }}</span>
      </p>
    </div>

    <EkEmptyState
      v-if="state === 'forbidden'"
      class="ek-health-view__state"
      variant="error"
      :title="t('integrationHealth.forbidden.title')"
      :message="t('integrationHealth.forbidden.message')"
    />
    <EkErrorState v-else-if="state === 'error'" class="ek-health-view__state" :message="t('integrationHealth.loadError')" @retry="load()" />

    <template v-else>
      <section class="ek-health-view__kpis" :aria-label="t('integrationHealth.kpi.aria')">
        <EkMetricCard
          :label="t('integrationHealth.kpi.healthy')"
          :value="summary ? `${formatNumber(summary.healthy)} / ${formatNumber(summary.total)}` : '—'"
          :description="t('integrationHealth.kpi.healthyHint')"
          icon="mdi-check-circle-outline"
          tone="success"
          :loading="state === 'loading'"
        />
        <EkMetricCard
          :label="t('integrationHealth.kpi.attention')"
          :value="summary ? formatNumber(summary.attention) : '—'"
          :description="t('integrationHealth.kpi.attentionHint')"
          icon="mdi-alert-outline"
          tone="warning"
          :loading="state === 'loading'"
        />
        <EkMetricCard
          :label="t('integrationHealth.kpi.down')"
          :value="summary ? formatNumber(summary.down) : '—'"
          :description="t('integrationHealth.kpi.downHint')"
          icon="mdi-lan-disconnect"
          tone="error"
          :loading="state === 'loading'"
        />
        <EkMetricCard
          :label="t('integrationHealth.kpi.calls', { hours: data?.windowHours ?? 24 })"
          :value="summary ? formatNumber(summary.calls) : '—'"
          :description="callsDescription"
          icon="mdi-swap-horizontal"
          tone="action"
          :loading="state === 'loading'"
        />
      </section>

      <div v-if="state === 'loading'" class="ek-health-view__grid" aria-hidden="true">
        <div v-for="n in 3" :key="n" class="ek-health-view__ghost">
          <span class="ek-health-view__bone ek-health-view__bone--head"></span>
          <span class="ek-health-view__bone"></span>
          <span class="ek-health-view__bone ek-health-view__bone--short"></span>
          <span class="ek-health-view__bone ek-health-view__bone--bar"></span>
        </div>
      </div>

      <EkEmptyState
        v-else-if="!items.length"
        class="ek-health-view__state"
        variant="not-connected"
        :title="t('integrationHealth.empty.title')"
        :message="t('integrationHealth.empty.message')"
        :show-action="!!marketplaceLink"
        :action-text="t('integrationHealth.empty.action')"
        action-icon="mdi-storefront-outline"
        @action="openLink(marketplaceLink)"
      />

      <section v-else class="ek-health-view__list" :aria-label="t('integrationHealth.listAria')">
        <h2 class="ek-health-view__list-title">
          {{ t('integrationHealth.listTitle') }}
          <span class="ek-health-view__list-count ek-num">{{ formatNumber(items.length) }}</span>
        </h2>
        <div class="ek-health-view__grid">
          <IntegrationHealthCard
            v-for="item in items"
            :key="item.integrationCode"
            :item="item"
            :window-hours="data?.windowHours ?? 24"
            :now="now"
            :can-open-settings="!!settingsLink(item)"
            @open-settings="openSettings"
          />
        </div>
        <p class="ek-health-view__note">
          <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
          <span>{{ t('integrationHealth.sourceNote') }}</span>
        </p>
      </section>

      <!-- C1.2 madde 5 / WP7b F-11 — webhook adresi: alıcısı olan her kurulu kanal için bir panel (trendyol, hepsiburada, ideasoft). -->
      <IntegrationWebhookPanel
        v-for="item in webhookItems"
        :key="item.integrationCode"
        :code="item.integrationCode"
        :webhook="item.webhook"
        :now="now"
        @renewed="load(true)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { provideRefreshState } from '@entegrasyonik/ui/components/refreshState'
import { computed, inject, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import EkPageHeader from '@/components/page/EkPageHeader.vue'
import { EkButton, EkMetricCard, EkEmptyState, EkErrorState } from '@entegrasyonik/ui/components'
import IntegrationHealthCard from '@/components/integrationHealth/IntegrationHealthCard.vue'
import IntegrationWebhookPanel from '@/components/integrations/IntegrationWebhookPanel.vue'
import { isWebhookChannel, type WebhookChannel } from '@/components/integrations/integrationWebhook'
import { useMenuStore } from '@/stores/site/menu'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { formatDateTime, formatNumber, formatPercent } from '@entegrasyonik/ui/format'
import {
  SETTINGS_SCREEN_BY_TYPE, sortByUrgency, summarizeHealth, useIntegrationHealthApi,
  type IntegrationHealthItem, type IntegrationHealthResponse,
} from '@/composables/useIntegrationHealthApi'

const { t } = useI18n()
const api = useIntegrationHealthApi()
const menuStore: any = useMenuStore()
const eventBus: any = inject('eventBus', null)
const { showToast } = useToast()

const state = ref<'loading' | 'ready' | 'error' | 'forbidden'>('loading')
// A8: yenile düğmesi son yükleme hatasını gösterir (kırmızı nokta + ipucu).
const refreshFailed = ref(false)
provideRefreshState(() => ({ error: state.value === 'error' || refreshFailed.value }))
const refreshing = ref(false)
const data = ref<IntegrationHealthResponse | null>(null)
const now = ref(new Date())

const items = computed(() => sortByUrgency(data.value?.integrations ?? []))
const summary = computed(() => (data.value ? summarizeHealth(data.value.integrations) : null))
const webhookItems = computed(() => items.value.filter((it): it is IntegrationHealthItem & { integrationCode: WebhookChannel } => isWebhookChannel(it.integrationCode)))
const callsDescription = computed(() => {
  const s = summary.value
  if (!s) return ''
  if (!s.calls) return t('integrationHealth.kpi.callsNone')
  return t('integrationHealth.kpi.callsHint', { errors: formatNumber(s.errors), rate: formatPercent((s.calls - s.errors) / s.calls) })
})

/** `refresh=true`: mevcut veri ekranda kalır (düzen sıçramaz), yalnız düğme yükleniyor olur. */
async function load(refresh = false) {
  if (refresh && data.value) refreshing.value = true
  else state.value = 'loading'
  const res = await api.getIntegrationHealth()
  refreshing.value = false
  refreshFailed.value = !res.ok && res.status !== 403
  if (res.ok) {
    data.value = res.data
    now.value = new Date(res.data.generatedAt || Date.now())
    if (Number.isNaN(now.value.getTime())) now.value = new Date()
    state.value = 'ready'
    return
  }
  if (res.status === 403) {
    data.value = null
    state.value = 'forbidden'
  } else if (refresh && data.value) {
    // Yenileme başarısız: son iyi görüntü kalır, kullanıcı bilgilendirilir.
    showToast({ tone: 'error', message: t('integrationHealth.refreshError') })
  } else {
    state.value = 'error'
  }
}

function linkForCode(code: string | undefined): any {
  if (!code) return undefined
  return menuStore.getMenuLinkWithCode?.(code)
}

function settingsLink(item: IntegrationHealthItem): any {
  return linkForCode(SETTINGS_SCREEN_BY_TYPE[item.type ?? ''])
}

const marketplaceLink = computed(() => linkForCode(SETTINGS_SCREEN_BY_TYPE.marketplace))

function openLink(link: any) {
  if (link && eventBus) eventBus.emit('openTab', link)
}

function openSettings(item: IntegrationHealthItem) {
  openLink(settingsLink(item))
}

onMounted(() => load())
</script>

<style scoped>
.ek-health-view {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  padding: var(--ek-space-6);
}

.ek-health-view__strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--ek-space-3);
  margin-top: calc(-1 * var(--ek-space-2));
  padding: var(--ek-space-2) var(--ek-space-2) var(--ek-space-2) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-muted);
}

.ek-health-view__stamp {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-health-view__sep {
  color: var(--ek-color-content-subtle);
}

.ek-health-view__kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ek-space-4);
}

.ek-health-view__list {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.ek-health-view__list-title {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  font-weight: var(--ek-type-heading-weight);
  line-height: var(--ek-type-heading-line);
}

.ek-health-view__list-count {
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-neutral-subtle);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  line-height: 20px;
}

.ek-health-view__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr));
  gap: var(--ek-space-4);
  align-items: stretch;
}

.ek-health-view__note {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-health-view__ghost {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  min-height: 240px;
  padding: var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.ek-health-view__bone {
  display: block;
  width: 80%;
  height: 12px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}

.ek-health-view__bone--head { width: 45%; height: 20px; }
.ek-health-view__bone--short { width: 55%; }
.ek-health-view__bone--bar { width: 100%; height: 8px; margin-top: auto; }

@media (max-width: 1279px) {
  .ek-health-view__kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .ek-health-view {
    gap: var(--ek-space-4);
    padding: var(--ek-space-4);
  }

  .ek-health-view__kpis {
    gap: var(--ek-space-3);
  }
}

@media (max-width: 479px) {
  /* Mobilde KPI'lar 2×2 kompakt: ikon kapsülü ve açıklama gizlenir, değer + etiket kalır (ilk ekranı kaplamasın). */
  .ek-health-view__kpis :deep(.ek-icon-tile),
  .ek-health-view__kpis :deep(.ek-metric__desc) {
    display: none;
  }

  .ek-health-view__kpis :deep(.ek-metric) {
    padding: var(--ek-space-4);
  }

  .ek-health-view__strip {
    flex-wrap: nowrap;
    padding-left: var(--ek-space-3);
  }

  .ek-health-view__stamp {
    flex: 1;
    min-width: 0;
  }

  .ek-health-view__sep {
    display: none;
  }

  .ek-health-view__stamp > span {
    flex-basis: 100%;
  }

  .ek-health-view__stamp > .v-icon {
    display: none;
  }
}
</style>
