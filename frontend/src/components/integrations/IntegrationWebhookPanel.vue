<!--
  frontend/src/components/integrations/IntegrationWebhookPanel.vue

  C1.2 madde 5 — anlık sipariş bildirimi (webhook) adresi: durum + oluştur/yenile (admin).
  [eslesme-fiyat WP7b, F-11] Kanal `code` prop'u ile: trendyol | hepsiburada | ideasoft (`integrationWebhook.ts`). Metinler kanal adıyla
  parametrik; HB için "olay adını HB ekler", IS için "API secret gerekli" notu (`integrationWebhook.channelNote.*`).
  Sözleşme (SALT OKU): `IntegrationService/generateWebhookToken { integrationCode }` (admin; backend
  `api/services/integration-service.ts` `generateWebhookToken`) → `{ integrationCode, webhookToken }`. HER çağrı YENİ
  anahtar üretir, eskisini geçersiz kılar ve `webhookHealthy=false` yapar. Alıcı rota: `/hooks/trendyol/:hookToken`
  (backend `api/WebhookApiManager.ts`; `/api` bağlamının DIŞINDA, aynı Express sunucusu).
  Kurallar: anahtar YALNIZ yanıttan sonra bir kez gösterilir (kopyala), sayfada/depoda SAKLANMAZ, LOGLANMAZ;
  "Gizle" ya da bileşen kapanınca bellekten silinir. Tam adresin tabanı `config/env.ts` `apiBaseUrl` kökünden türetilir.
-->
<template>
  <EkCard
    :title="t('integrationWebhook.title')"
    :subtitle="tc('integrationWebhook.subtitle')"
    icon="mdi-webhook"
    icon-tone="info"
    :heading-level="2"
    class="ek-webhook"
  >
    <dl class="ek-webhook__facts">
      <div class="ek-webhook__fact">
        <dt>{{ t('integrationWebhook.channel') }}</dt>
        <dd><EkPlatformMark :name="channelName" :code="code" size="sm" /></dd>
      </div>
      <div class="ek-webhook__fact">
        <dt>{{ t('integrationWebhook.status') }}</dt>
        <dd><EkStatusChip :tone="statusTone" :label="statusLabel" dot /></dd>
      </div>
      <div class="ek-webhook__fact">
        <dt>{{ t('integrationWebhook.lastReceived') }}</dt>
        <dd class="ek-num">{{ lastReceivedText }}</dd>
      </div>
    </dl>

    <p v-if="channelNoteKey" class="ek-webhook__note">
      <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
      <span>{{ t(channelNoteKey) }}</span>
    </p>

    <div v-if="issued" class="ek-webhook__issued" role="status">
      <div class="ek-webhook__issued-head">
        <v-icon icon="mdi-check-circle-outline" size="18" aria-hidden="true" />
        <strong>{{ t('integrationWebhook.issuedTitle') }}</strong>
      </div>
      <p class="ek-webhook__issued-text">{{ tc('integrationWebhook.issuedHint') }}</p>
      <label :for="urlFieldId" class="ek-webhook__label">{{ t('integrationWebhook.urlLabel') }}</label>
      <div class="ek-webhook__url-row">
        <input
          :id="urlFieldId"
          ref="urlField"
          class="ek-webhook__url"
          type="text"
          readonly
          spellcheck="false"
          autocomplete="off"
          :value="issuedUrl"
          @focus="selectUrl"
        />
        <EkButton tone="primary" size="sm" icon="mdi-content-copy" @click="copyUrl">{{ t('integrationWebhook.copy') }}</EkButton>
        <EkButton tone="ghost" size="sm" icon="mdi-eye-off-outline" @click="hideIssued">{{ t('integrationWebhook.hide') }}</EkButton>
      </div>
      <p class="ek-webhook__issued-note">{{ t('integrationWebhook.issuedNote') }}</p>
    </div>
    <div class="ek-webhook__action-row">
      <p v-if="!issued" class="ek-webhook__note">
        <v-icon icon="mdi-shield-key-outline" size="16" aria-hidden="true" />
        <span>{{ t('integrationWebhook.onceNote') }}</span>
      </p>
      <EkButton tone="secondary" size="sm" :icon="hasWebhook ? 'mdi-key-change' : 'mdi-key-plus'" class="ek-webhook__action" @click="confirmOpen = true">
        {{ hasWebhook ? t('integrationWebhook.renew') : t('integrationWebhook.create') }}
      </EkButton>
    </div>

    <EkConfirmDialog
      v-model="confirmOpen"
      :title="hasWebhook ? t('integrationWebhook.confirmRenewTitle') : t('integrationWebhook.confirmCreateTitle')"
      :description="hasWebhook ? tc('integrationWebhook.confirmRenewText') : tc('integrationWebhook.confirmCreateText')"
      :confirm-label="hasWebhook ? t('integrationWebhook.renew') : t('integrationWebhook.create')"
      :danger="hasWebhook"
      :loading="busy"
      icon="mdi-webhook"
      @confirm="generate"
    />
  </EkCard>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { EkCard, EkButton, EkStatusChip, EkPlatformMark, EkConfirmDialog } from '@entegrasyonik/ui/components'
import useRestApi from '@/composables/restapi'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { formatRelative } from '@entegrasyonik/ui/format'
import { apiErrorStatus } from '@/composables/useIntegrationHealthApi'
import { webhookUrl, WEBHOOK_CHANNEL_NAMES, type WebhookChannel } from './integrationWebhook'
import type { StatusTone } from '@/design/status-map'

const props = withDefaults(defineProps<{
  /** Kanal kodu (alıcısı olan: trendyol | hepsiburada | ideasoft). */
  code?: WebhookChannel
  /** Sağlık yanıtındaki `webhook` alanı (`null` → adres hiç kurulmadı ya da bilinmiyor). */
  webhook: { healthy: boolean | null; lastReceivedAt: string | null } | null
  now?: Date
}>(), { code: 'trendyol' })

const channelName = computed(() => WEBHOOK_CHANNEL_NAMES[props.code] ?? props.code)
/** Kanal notu: HB olay adını URL sonuna kendisi ekler; IS imza için API secret ister; TY için not yok. */
const channelNoteKey = computed(() => (props.code === 'trendyol' ? '' : `integrationWebhook.channelNote.${props.code}`))
const tc = (key: string) => t(key, { channel: channelName.value })

const emit = defineEmits<{ renewed: [] }>()

const { t } = useI18n()
const restApi = useRestApi()
const { showToast } = useToast()
const urlFieldId = `ek-webhook-url-${useId()}`

const confirmOpen = ref(false)
const busy = ref(false)
/** Yalnız bellekte; "Gizle" / bileşen kapanışı ile silinir. */
const issuedUrl = ref('')
const issued = computed(() => issuedUrl.value !== '')
const urlField = ref<HTMLInputElement | null>(null)

const hasWebhook = computed(() => !!props.webhook)

const statusTone = computed<StatusTone>(() => {
  const w = props.webhook
  if (!w) return 'neutral'
  if (w.healthy === true) return 'success'
  if (w.healthy === false) return w.lastReceivedAt ? 'warning' : 'neutral'
  return 'neutral'
})

const statusLabel = computed(() => {
  const w = props.webhook
  if (!w) return t('integrationWebhook.state.none')
  if (w.healthy === true) return t('integrationWebhook.state.healthy')
  if (w.healthy === false) return w.lastReceivedAt ? t('integrationWebhook.state.unhealthy') : t('integrationWebhook.state.waiting')
  return t('integrationWebhook.state.unknown')
})

const lastReceivedText = computed(() => {
  const at = props.webhook?.lastReceivedAt
  return at ? formatRelative(at, props.now ?? new Date()) : '—'
})

async function generate() {
  busy.value = true
  const res: any = await restApi.post('IntegrationService/generateWebhookToken', { integrationCode: props.code })
  busy.value = false
  confirmOpen.value = false
  const status = apiErrorStatus(res)
  if (status !== undefined || typeof res?.webhookToken !== 'string' || !res.webhookToken) {
    showToast({ tone: 'error', message: status === 403 ? t('integrationWebhook.forbidden') : tc('integrationWebhook.error') })
    return
  }
  issuedUrl.value = webhookUrl(props.code, res.webhookToken)
  showToast({ tone: 'success', message: tc('integrationWebhook.issuedToast') })
  emit('renewed')
  await nextTick()
  urlField.value?.focus()
}

function selectUrl() {
  urlField.value?.select()
}

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(issuedUrl.value)
    showToast({ tone: 'success', message: t('integrationWebhook.copied') })
  } catch {
    selectUrl()
    showToast({ tone: 'warning', message: t('integrationWebhook.copyFailed') })
  }
}

function hideIssued() {
  issuedUrl.value = ''
}

onBeforeUnmount(hideIssued)
</script>

<style scoped>
.ek-webhook__facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ek-space-4);
  margin: 0;
}

.ek-webhook__fact {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.ek-webhook__fact dt,
.ek-webhook__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  line-height: var(--ek-type-micro-line);
  text-transform: uppercase;
}

.ek-webhook__fact dd {
  display: flex;
  align-items: center;
  min-height: 24px;
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ek-webhook__action-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-3);
  margin-top: var(--ek-space-4);
  padding-top: var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-webhook__action {
  margin-left: auto;
}

.ek-webhook__note,
.ek-webhook__issued-note {
  display: flex;
  flex: 1;
  align-items: flex-start;
  gap: var(--ek-space-2);
  min-width: 240px;
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-webhook__issued {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin-top: var(--ek-space-4);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-success-border);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-success-subtle);
}

.ek-webhook__issued-head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-success-emphasis);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
}

.ek-webhook__issued-text {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ek-webhook__label {
  margin-top: var(--ek-space-2);
}

.ek-webhook__url-row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-webhook__url {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-input);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--ek-type-caption-size);
}

.ek-webhook__url:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 1px;
}


@media (max-width: 599px) {
  .ek-webhook__facts {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .ek-webhook__url-row {
    flex-wrap: wrap;
  }

  .ek-webhook__url {
    flex-basis: 100%;
  }

  .ek-webhook__note {
    min-width: 0;
    flex-basis: 100%;
  }

  .ek-webhook__action {
    margin-left: 0;
  }
}
</style>
