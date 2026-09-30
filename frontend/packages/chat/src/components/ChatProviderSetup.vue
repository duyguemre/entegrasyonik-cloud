<!--
  BYOK kurulumu (K37/K38; CHAT_UI_CONTRACT.md §3.3–3.4). Panelde (`variant="panel"`) ve Ayarlar → Otopilot ekranında
  (`variant="settings"`) AYNI bileşen. Normal bir ayar formudur — sohbet parçası DEĞİLDİR; anahtar sohbet/LLM kanalından
  hiç geçmez.
  Anahtar güvenliği: değer yalnız bu bileşenin yerel ref'inde ve `type=password` alanında durur; kayıt/test sonrası ve
  bileşen kapanırken silinir; localStorage/Pinia/controller'a YAZILMAZ; kayıtlıysa yalnız "Kayıtlı anahtar ••••".
  Onay: aktarım bilgilendirmesini HERKES görür; onay kutusu/"Onaylıyorum" YALNIZ sahipte (`canConsent`); admin için not.
-->
<template>
  <div class="ek-chat-setup" :class="`is-${variant}`">
    <EkSkeleton v-if="loading" type="form" :rows="4" />

    <div v-else-if="loadError" class="ek-chat-state" role="alert">
      <EkIconTile icon="mdi-cloud-off-outline" tone="neutral" />
      <p class="ek-chat-state__body">{{ t('setup.loadFailed') }}</p>
      <EkButton size="sm" tone="secondary" icon="mdi-refresh" @click="load">{{ t('panel.retryLoad') }}</EkButton>
    </div>

    <template v-else-if="status">
      <!-- C: anahtar yok + yetki yok -->
      <div v-if="!status.configured && !status.canConfigure" class="ek-chat-state" data-view="no-permission">
        <EkIconTile icon="mdi-account-key-outline" tone="neutral" />
        <p class="ek-chat-state__title">{{ t('setup.noPermission.title') }}</p>
        <p class="ek-chat-state__body">{{ t('setup.noPermission.body') }}</p>
      </div>

      <!-- D/E: anahtar var, sahip onayı bekleniyor (panel görünümü; ayarlar ekranında form içinde) -->
      <div v-else-if="showConsentOnly" class="ek-chat-setup__consent-only" :data-view="status.canConsent ? 'consent-owner' : 'consent-admin'">
        <div class="ek-chat-state is-left">
          <EkIconTile :icon="status.canConsent ? 'mdi-file-sign' : 'mdi-account-clock-outline'" :tone="status.canConsent ? 'action' : 'neutral'" />
          <p class="ek-chat-state__title">{{ status.canConsent ? t('setup.consentPendingOwner.title') : t('setup.consentPendingAdmin.title') }}</p>
          <p class="ek-chat-state__body">{{ status.canConsent ? t('setup.consentPendingOwner.body') : t('setup.consentPendingAdmin.body') }}</p>
        </div>
        <ConsentText :status="status" :t="t" />
        <div v-if="status.canConsent" class="ek-chat-setup__actions">
          <EkButton tone="primary" icon="mdi-check" :loading="consenting" @click="accept">{{ t('setup.consentAccept') }}</EkButton>
        </div>
        <EkAlert v-if="actionError" tone="error" :text="actionError" dense live />
      </div>

      <!-- F: form -->
      <form v-else class="ek-chat-setup__form" novalidate autocomplete="off" data-view="form" @submit.prevent="save">
        <header v-if="variant === 'panel'" class="ek-chat-setup__intro">
          <p class="ek-chat-setup__title">{{ t('setup.title') }}</p>
          <p class="ek-chat-setup__text">{{ t('setup.intro') }}</p>
        </header>
        <p v-else class="ek-chat-setup__text">{{ t('setup.intro') }}</p>

        <dl v-if="variant === 'settings'" class="ek-chat-setup__summary">
          <div>
            <dt>{{ t('setup.status') }}</dt>
            <dd><EkStatusChip :tone="summaryTone" :label="summaryLabel" /></dd>
          </div>
          <div v-if="status.lastTest">
            <dt>{{ t('setup.lastTest') }}</dt>
            <dd>{{ formatDateTime(status.lastTest.at) }} · {{ status.lastTest.ok ? t('setup.lastTestOk') : t('setup.lastTestFail') }}</dd>
          </div>
        </dl>

        <fieldset class="ek-chat-setup__fields" :disabled="!status.canConfigure || busy">
          <v-select
            v-model="provider"
            :items="providerItems"
            item-title="title"
            item-value="value"
            :label="t('setup.provider')"
            density="compact"
            hide-details="auto"
          />
          <v-select
            v-model="model"
            :items="modelItems"
            item-title="title"
            item-value="value"
            :label="t('setup.model')"
            density="compact"
            hide-details="auto"
          />

          <div v-if="status.configured && !editingKey" class="ek-chat-setup__saved-key">
            <v-icon icon="mdi-key-outline" size="small" aria-hidden="true" />
            <span>{{ t('setup.apiKeySaved') }}</span>
            <EkButton size="sm" tone="ghost" @click="startEditKey">{{ t('setup.apiKeyChange') }}</EkButton>
          </div>
          <div v-else class="ek-chat-setup__key">
            <v-text-field
              ref="keyFieldRef"
              v-model="apiKey"
              type="password"
              name="ek-chat-provider-key"
              :label="t('setup.apiKey')"
              autocomplete="off"
              spellcheck="false"
              autocapitalize="off"
              density="compact"
              :hint="t('setup.apiKeyHint')"
              persistent-hint
              :error-messages="keyError ? [keyError] : []"
              data-testid="ek-chat-api-key"
            />
            <EkButton v-if="status.configured" size="sm" tone="ghost" @click="cancelEditKey">{{ t('setup.apiKeyKeep') }}</EkButton>
          </div>
          <a v-if="currentProvider" class="ek-chat-link ek-chat-setup__help" :href="currentProvider.keyHelpUrl" target="_blank" rel="noopener noreferrer">
            {{ t('setup.keyHelp', { provider: currentProvider.label }) }}
            <v-icon icon="mdi-open-in-new" size="x-small" aria-hidden="true" />
            <span class="ek-chat-sr-only">{{ t('setup.newTab') }}</span>
          </a>
        </fieldset>

        <section class="ek-chat-setup__consent" :aria-labelledby="consentTitleId">
          <ConsentText :status="status" :t="t" :title-id="consentTitleId" />
          <v-checkbox
            v-if="status.canConsent && status.consentRequired"
            v-model="consentChecked"
            :label="t('setup.consentCheckbox')"
            density="compact"
            hide-details
            :disabled="busy"
          />
          <p v-else-if="status.consent && !status.consentRequired" class="ek-chat-setup__note">
            <v-icon icon="mdi-check-decagram-outline" size="x-small" aria-hidden="true" />
            {{ t('setup.consentGiven', { date: formatDate(status.consent.at) }) }}
            <EkButton v-if="variant === 'settings' && status.canConsent" size="sm" tone="ghost" @click="confirmRevoke = true">{{ t('setup.consentRevoke') }}</EkButton>
          </p>
          <p v-else-if="!status.canConsent" class="ek-chat-setup__note">
            <v-icon icon="mdi-information-outline" size="x-small" aria-hidden="true" />
            {{ t('setup.consentAdminNote') }}
          </p>
        </section>

        <EkAlert v-if="testResult" :tone="testResult.ok ? 'success' : 'error'" :text="testMessage" dense live data-testid="ek-chat-test-result" />
        <EkAlert v-if="actionError" tone="error" :text="actionError" dense live data-testid="ek-chat-setup-error" />
        <EkAlert v-if="savedNote" tone="success" :text="savedNote" dense live />

        <footer v-if="status.canConfigure" class="ek-chat-setup__actions">
          <EkButton type="button" tone="secondary" icon="mdi-connection" :loading="testing" :disabled="busy && !testing" @click="test">{{ t('setup.test') }}</EkButton>
          <EkButton type="submit" tone="primary" icon="mdi-content-save-outline" :loading="saving" :disabled="busy && !saving">{{ t('setup.save') }}</EkButton>
          <EkButton v-if="variant === 'panel' && usable" type="button" tone="ghost" trailing-icon="mdi-arrow-right" @click="emit('ready')">{{ t('setup.backToChat') }}</EkButton>
          <EkButton v-if="variant === 'settings' && status.configured" class="ek-chat-setup__remove" type="button" tone="ghost" icon="mdi-key-remove" @click="confirmRemove = true">{{ t('setup.remove') }}</EkButton>
        </footer>

        <section v-if="variant === 'settings' && status.usage" class="ek-chat-setup__usage" :aria-labelledby="usageTitleId">
          <p :id="usageTitleId" class="ek-chat-setup__subtitle">{{ t('setup.usage') }}</p>
          <dl>
            <div>
              <dt>{{ t('setup.usageToday') }}</dt>
              <dd>{{ t('setup.usageRequests', { count: formatNumber(status.usage.today.requests) }) }}</dd>
              <dd class="is-muted">{{ t('setup.usageTokens', { input: formatNumber(status.usage.today.inputTokens), output: formatNumber(status.usage.today.outputTokens) }) }}</dd>
            </div>
            <div>
              <dt>{{ t('setup.usageMonth') }}</dt>
              <dd>{{ t('setup.usageRequests', { count: formatNumber(status.usage.month.requests) }) }}</dd>
              <dd class="is-muted">{{ t('setup.usageTokens', { input: formatNumber(status.usage.month.inputTokens), output: formatNumber(status.usage.month.outputTokens) }) }}</dd>
            </div>
          </dl>
          <p class="ek-chat-setup__note">{{ t('setup.usageNote') }}</p>
        </section>
      </form>

      <p class="ek-chat-setup__privacy">
        <v-icon icon="mdi-shield-lock-outline" size="x-small" aria-hidden="true" />
        {{ t('setup.privacy') }}
      </p>
    </template>

    <EkConfirmDialog
      v-model="confirmRemove"
      :title="t('setup.removeTitle')"
      :description="t('setup.removeBody')"
      :confirm-label="t('setup.removeConfirm')"
      :cancel-label="t('setup.cancel')"
      danger
      :loading="removing"
      @confirm="remove"
    />
    <EkConfirmDialog
      v-model="confirmRevoke"
      :title="t('setup.consentRevokeTitle')"
      :description="t('setup.consentRevokeBody')"
      :confirm-label="t('setup.consentRevoke')"
      :cancel-label="t('setup.cancel')"
      danger
      :loading="consenting"
      @confirm="revoke"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, inject, nextTick, onBeforeUnmount, onMounted, ref, useId, watch, type PropType } from 'vue'
import { EkAlert, EkButton, EkConfirmDialog, EkIconTile, EkSkeleton, EkStatusChip } from '@entegrasyonik/ui/components'
import { formatDate, formatDateTime, formatNumber } from '@entegrasyonik/ui/format'
import { createTranslator, type Translate } from '../i18n'
import { useChatHost } from '../host'
import { PROVIDER_ERROR_CODES, providerErrorMessage } from './providerErrors'
import type { LlmProviderId, ProviderStatus, ProviderTestResult } from '../protocol/v1'
import { CHAT_CONTROLLER_KEY } from '../state/useChat'
import { ChatTransportError, type ChatSetupApi } from '../transport/types'

const props = withDefaults(defineProps<{ api: ChatSetupApi; variant?: 'panel' | 'settings'; translate?: Translate }>(), { variant: 'panel' })
const emit = defineEmits<{ ready: []; changed: [status: ProviderStatus] }>()

const host = useChatHost()
const controller = inject(CHAT_CONTROLLER_KEY, null)
const t: Translate = props.translate ?? controller?.t ?? createTranslator(() => host.locale(), host.t?.bind(host))

/** Aktarım bilgilendirmesi (düz metin; herkes görür). */
const ConsentText = defineComponent({
  props: { status: { type: Object as PropType<ProviderStatus>, required: true }, t: { type: Function as PropType<Translate>, required: true }, titleId: String },
  setup(p) {
    return () =>
      h('div', { class: 'ek-chat-consent' }, [
        h('p', { class: 'ek-chat-consent__title', id: p.titleId }, p.t('setup.consentTitle')),
        h('p', { class: 'ek-chat-consent__body', tabindex: 0 }, p.status.consentText.body),
        h('p', { class: 'ek-chat-consent__version' }, p.t('setup.consentVersion', { version: p.status.consentText.version })),
      ])
  },
})

const uid = useId()
const consentTitleId = `ek-chat-consent-${uid}`
const usageTitleId = `ek-chat-usage-${uid}`

const loading = ref(true)
const loadError = ref(false)
const status = ref<ProviderStatus | null>(null)
const provider = ref<LlmProviderId | null>(null)
const model = ref<string | null>(null)
/** API anahtarı — YALNIZ burada, yalnız form açıkken. */
const apiKey = ref('')
const editingKey = ref(false)
const keyError = ref('')
const consentChecked = ref(false)
const testing = ref(false)
const saving = ref(false)
const removing = ref(false)
const consenting = ref(false)
const testResult = ref<ProviderTestResult | null>(null)
const actionError = ref('')
const savedNote = ref('')
const confirmRemove = ref(false)
const confirmRevoke = ref(false)
const keyFieldRef = ref<{ focus?: () => void } | null>(null)

const busy = computed(() => testing.value || saving.value || removing.value || consenting.value)
const usable = computed(() => !!status.value && status.value.configured && !status.value.consentRequired)
const showConsentOnly = computed(() => {
  const s = status.value
  if (!s || !s.configured || !s.consentRequired) return false
  // Panelde sahip/admin için sade onay görünümü; ayarlar ekranında yöneticisi form içinde görür.
  return props.variant === 'panel' || !s.canConfigure
})

const providerItems = computed(() => (status.value?.catalog ?? []).map((p) => ({ value: p.id, title: p.label })))
const currentProvider = computed(() => status.value?.catalog.find((p) => p.id === provider.value) ?? null)
const modelItems = computed(() =>
  (currentProvider.value?.models ?? []).map((m) => ({ value: m.id, title: m.recommended ? `${m.label} (${t('setup.recommended')})` : m.label })),
)
const summaryTone = computed(() => (usable.value ? 'success' : status.value?.configured ? 'warning' : 'neutral'))
const summaryLabel = computed(() => (usable.value ? t('setup.statusActive') : status.value?.configured ? t('setup.statusConsentPending') : t('setup.statusNotConfigured')))
const testMessage = computed(() => {
  const r = testResult.value
  if (!r) return ''
  if (r.ok) return t('setup.testOk')
  return providerErrorMessage(t, r.code, r.retryAfterSec) ?? r.message
})

function recommendedModel(id: LlmProviderId | null): string | null {
  const entry = status.value?.catalog.find((p) => p.id === id)
  return entry?.models.find((m) => m.recommended)?.id ?? entry?.models[0]?.id ?? null
}

function applyStatus(next: ProviderStatus) {
  status.value = next
  provider.value = next.provider ?? next.catalog[0]?.id ?? null
  model.value = next.model ?? recommendedModel(provider.value)
  editingKey.value = !next.configured
  consentChecked.value = false
  emit('changed', next)
}

watch(provider, (next, prev) => {
  if (prev !== null && next !== prev) model.value = recommendedModel(next)
})

function clearKey() {
  apiKey.value = ''
  keyError.value = ''
}

function errorText(error: unknown): string {
  if (error instanceof ChatTransportError) {
    if ((PROVIDER_ERROR_CODES as readonly string[]).includes(error.code)) return providerErrorMessage(t, error.code as never, error.retryAfterSec) ?? error.message
    return error.message
  }
  return t('turnError.INTERNAL')
}

async function load() {
  loading.value = true
  loadError.value = false
  try {
    applyStatus(await props.api.status())
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function resetMessages() {
  testResult.value = null
  actionError.value = ''
  savedNote.value = ''
}

async function test() {
  if (!status.value || !provider.value || !model.value) return
  resetMessages()
  const key = editingKey.value ? apiKey.value.trim() : ''
  if (!key && !status.value.configured) {
    keyError.value = t('setup.keyRequired')
    return
  }
  keyError.value = ''
  testing.value = true
  try {
    testResult.value = await props.api.test({ v: 1, provider: provider.value, model: model.value, ...(key ? { apiKey: key } : {}) })
  } catch (error) {
    actionError.value = errorText(error)
  } finally {
    testing.value = false
  }
}

async function save() {
  if (!status.value || !provider.value || !model.value) return
  resetMessages()
  const key = editingKey.value ? apiKey.value.trim() : ''
  if (!key && !status.value.configured) {
    keyError.value = t('setup.keyRequired')
    await nextTick()
    keyFieldRef.value?.focus?.()
    return
  }
  keyError.value = ''
  saving.value = true
  const withConsent = status.value.canConsent && status.value.consentRequired && consentChecked.value
  try {
    const next = await props.api.save({
      v: 1,
      provider: provider.value,
      model: model.value,
      ...(key ? { apiKey: key } : {}),
      ...(withConsent ? { consent: { textVersion: status.value.consentText.version, accepted: true as const } } : {}),
    })
    clearKey()
    applyStatus(next)
    savedNote.value = t('setup.saved')
    if (usable.value) emit('ready')
  } catch (error) {
    actionError.value = errorText(error)
  } finally {
    saving.value = false
  }
}

async function consent(decision: 'accept' | 'revoke') {
  if (!status.value) return
  resetMessages()
  consenting.value = true
  try {
    const next = await props.api.consent({ v: 1, textVersion: status.value.consentText.version, decision })
    applyStatus(next)
    confirmRevoke.value = false
    if (decision === 'accept' && usable.value) emit('ready')
  } catch (error) {
    actionError.value = errorText(error)
  } finally {
    consenting.value = false
  }
}
const accept = () => consent('accept')
const revoke = () => consent('revoke')

async function remove() {
  resetMessages()
  removing.value = true
  try {
    const next = await props.api.remove()
    clearKey()
    applyStatus(next)
    confirmRemove.value = false
    savedNote.value = t('setup.removed')
  } catch (error) {
    actionError.value = errorText(error)
  } finally {
    removing.value = false
  }
}

function startEditKey() {
  editingKey.value = true
  nextTick(() => keyFieldRef.value?.focus?.())
}

function cancelEditKey() {
  clearKey()
  editingKey.value = false
}

onMounted(load)
onBeforeUnmount(clearKey)

defineExpose({ reload: load })
</script>
