<!--
  frontend/src/components/integrations/IntegrationSyncBar.vue

  [eslesme-fiyat WP7b, F-10, PLAN §3.5] Seçili kanal için "Son senkron: 4 dk önce · Şimdi senkronize et".
  - Son senkron zamanı `IntegrationService/getIntegrationHealth` → `sync.<tür>.lastSuccessAt` (yalnız admin; 403'te satır
    "—" kalır, düğme yine çalışır — `syncNow` üye yetkisiyle açıktır).
  - Tür seçimi: Siparişler (varsayılan) · İadeler · Mesajlar · Finans. Tür başına 5 dk soğuma sunucuda; başarılı istekten
    sonra düğme o tür için 5 dk pasif olur (sayfa yenilenirse sunucu 429 ile yine korur).
  - Art arda kimlik hatası (`needsAttention`) varsa uyarı satırı; düğme pasif (sunucu da 502 AUTH döner).
  Ekran renk SEÇMEZ; durum metinle anlatılır (renk tek başına anlam taşımaz).
-->
<template>
  <section class="ek-sync" :aria-labelledby="titleId">
    <div class="ek-sync__row">
      <v-icon class="ek-sync__icon" icon="mdi-sync" size="16" aria-hidden="true" />
      <span :id="titleId" class="ek-sync__title">{{ t('integrationSync.lastSync') }}</span>
      <span class="ek-sync__value ek-num" :title="lastSuccessTitle">{{ lastSuccessText }}</span>
      <span v-if="lastErrorCode" class="ek-sync__error" role="status">
        <v-icon icon="mdi-alert-outline" size="14" aria-hidden="true" />
        {{ t('integrationSync.lastError', { code: lastErrorCode }) }}
      </span>
      <span class="ek-sync__spacer" />
      <EkSelect v-model="kind" class="ek-sync__kind" :items="kindItems" :aria-label="t('integrationSync.kindLabel')" />
      <EkButton tone="secondary" size="sm" icon="mdi-sync" :loading="busy" :disabled="!canSync" @click="run">
        {{ t('integrationSync.syncNow') }}
      </EkButton>
    </div>
    <p v-if="needsAttention" class="ek-sync__attention" role="alert">
      <v-icon icon="mdi-key-alert-outline" size="16" aria-hidden="true" />
      {{ t('integrationSync.needsAttention') }}
    </p>
    <p v-else-if="cooldownUntil[kind]" class="ek-sync__hint" role="status">
      {{ t('integrationSync.queued', { kind: t('integrationSync.kind.' + kind) }) }}
    </p>
  </section>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EkButton, EkSelect } from '@entegrasyonik/ui/components'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { formatDateTime, formatRelative } from '@entegrasyonik/ui/format'
import { useIntegrationHealthApi, type IntegrationHealthItem } from '@/composables/useIntegrationHealthApi'
import { SYNC_NOW_COOLDOWN_MS, SYNC_NOW_KINDS, syncNowErrorKey, useSyncNowApi, type SyncNowKind } from '@/composables/useSyncNowApi'

const props = defineProps<{ code: string }>()

const { t } = useI18n()
const { showToast } = useToast()
const { getIntegrationHealth } = useIntegrationHealthApi()
const { syncNow } = useSyncNowApi()
const titleId = `ek-sync-${useId()}`

const kind = ref<SyncNowKind>('orders')
const busy = ref(false)
const item = ref<IntegrationHealthItem | null>(null)
const now = ref(new Date())
const cooldownUntil = ref<Partial<Record<SyncNowKind, number>>>({})
const timer = setInterval(() => {
  now.value = new Date()
  const n = now.value.getTime()
  for (const k of SYNC_NOW_KINDS) if ((cooldownUntil.value[k] ?? 0) <= n) delete cooldownUntil.value[k]
}, 15000)
onBeforeUnmount(() => clearInterval(timer))

async function loadHealth() {
  const res = await getIntegrationHealth()
  item.value = res.ok ? (res.data.integrations.find((i) => i.integrationCode === props.code) ?? null) : null
}
watch(() => props.code, () => { item.value = null; if (props.code) void loadHealth() }, { immediate: true })

const kindItems = computed(() => SYNC_NOW_KINDS.map((k) => ({ title: t('integrationSync.kind.' + k), value: k })))
const kindState = computed(() => item.value?.sync?.[kind.value] ?? null)
const lastSuccessAt = computed(() => kindState.value?.lastSuccessAt ?? (kind.value === 'orders' ? item.value?.lastSuccessfulSyncAt ?? null : null))
const lastSuccessText = computed(() => (lastSuccessAt.value ? formatRelative(lastSuccessAt.value, now.value) : '—'))
const lastSuccessTitle = computed(() => (lastSuccessAt.value ? formatDateTime(lastSuccessAt.value) : ''))
const lastErrorCode = computed(() => {
  const e = kindState.value?.lastError
  if (!e) return null
  const ok = kindState.value?.lastSuccessAt ? new Date(kindState.value.lastSuccessAt).getTime() : 0
  return new Date(e.at).getTime() > ok ? e.code : null
})
const needsAttention = computed(() => !!item.value?.needsAttention)
const canSync = computed(() => !!props.code && !busy.value && !needsAttention.value && !cooldownUntil.value[kind.value])

async function run() {
  if (!canSync.value) return
  busy.value = true
  const k = kind.value
  const res = await syncNow(props.code, k)
  busy.value = false
  if (res.ok) {
    cooldownUntil.value[k] = Date.now() + SYNC_NOW_COOLDOWN_MS
    showToast({ tone: 'success', message: t('integrationSync.queuedToast', { kind: t('integrationSync.kind.' + k) }) })
    return
  }
  if (res.code === 'RATE_LIMITED') cooldownUntil.value[k] = Date.now() + SYNC_NOW_COOLDOWN_MS
  showToast({ tone: res.code === 'RATE_LIMITED' ? 'warning' : 'error', message: t(syncNowErrorKey(res.code, res.status)) })
}
</script>

<style scoped>
.ek-sync {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
}

.ek-sync__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
}

.ek-sync__icon,
.ek-sync__title,
.ek-sync__hint {
  color: var(--ek-color-content-muted);
}

.ek-sync__title {
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-sync__value {
  font-weight: 600;
}

.ek-sync__error,
.ek-sync__attention {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-warning-emphasis);
}

.ek-sync__spacer {
  flex: 1 1 auto;
}

.ek-sync__kind {
  min-width: 10rem;
}

.ek-sync__attention,
.ek-sync__hint {
  margin: 0;
}
</style>
