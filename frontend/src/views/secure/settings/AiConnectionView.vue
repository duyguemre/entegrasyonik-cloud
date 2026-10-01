<!--
  frontend/src/views/secure/settings/AiConnectionView.vue

  MCP-6 S4 — "Yapay zekâ bağlantısı" tenant ayarı (MCP_UI_CONTRACT §6, ADR-0035 Karar 6). Rota `/settings/ai-connection`.
  Görür: `settings:read` (sahip/yönetici/operatör); değiştirir: YALNIZ sahip ve impersonation değil (`canEdit` backend'den —
  önyüz rol tahmini yapmaz). `EkSettingsTemplate`: kirli durumda yapışkan Vazgeç/Kaydet (`EkPageHeader`'ı şablon
  kendi içinde çizer — doğrudan kullanılmaz).

  Kurallar:
    - `off` dışı seçimde ve onay yoksa/eskiyse aktarım onay kutusu ZORUNLU; kayıt gövdesi `acceptTextVersion =
      currentText.textVersion` (mcpModel.settingsSaveBody).
    - `off`'a alırken bilgi notu (bağlantılar askıya alınır; kesmek için Bağlı uygulamalar → Tümünü kes).
    - `consentOutdated` → uyarı bandı.
    - `currentText.text` düz metin ({{ }}; v-html yok).
-->
<template>
  <div class="aiConnectionView">
    <EkSettingsTemplate
      :section="$t('mcp.settings.section')"
      :title="$t('mcp.settings.title')"
      :description="$t('mcp.settings.description')"
      :dirty="dirty"
      :saving="saving"
      :unsaved-hint="$t('mcp.settings.unsaved')"
      @save="save"
      @discard="discard"
    >
      <EkSkeleton v-if="state === 'loading'" type="form" />
      <EkProblemState
        v-else-if="state === 'disabled'"
        :title="$t('mcp.settings.disabledTitle')"
        :cause="$t('mcp.settings.disabledText')"
        data-testid="mcp-disabled"
      />
      <EkProblemState
        v-else-if="state === 'error'"
        :title="$t('mcp.settings.loadErrorTitle')"
        :cause="loadErrorKey ? $t(loadErrorKey) : $t('mcp.settings.loadErrorCause')"
        :action="$t('mcp.settings.loadErrorAction')"
        :details="loadRequestId ? [{ label: 'requestId', value: loadRequestId }] : undefined"
        @retry="load"
      />
      <template v-else-if="settings">
        <EkAlert v-if="settings.consentOutdated" tone="warning" :text="$t('mcp.settings.outdated')" data-testid="mcp-settings-outdated" />
        <EkAlert v-if="saveErrorKey" tone="error" dense live data-testid="mcp-settings-error">
          <span>{{ $t('mcp.settings.saveError') }} {{ $t(saveErrorKey) }}</span>
          <span v-if="saveRequestId" class="ek-ai-support">{{ $t('mcp.common.supportCode', { code: saveRequestId }) }}</span>
        </EkAlert>

        <!-- Durum -->
        <EkSettingsSection :title="$t('mcp.settings.statusTitle')" :description="$t('mcp.settings.statusDescription')">
          <div class="ek-ai-status" data-testid="mcp-settings-status">
            <dl class="ek-ai-facts">
              <div class="ek-ai-fact">
                <dt>{{ $t('mcp.settings.accessNow') }}</dt>
                <dd><EkStatusChip :tone="accessTone(settings.access)" :label="$t(accessLabelKey(settings.access))" /></dd>
              </div>
              <div class="ek-ai-fact">
                <dt>{{ $t('mcp.settings.activeConnections') }}</dt>
                <dd class="ek-num">{{ formatNumber(settings.activeConnections) }}</dd>
              </div>
            </dl>
            <McpCopyField :value="settings.serverUrl" :label="$t('mcp.connections.serverUrl')" />
            <p v-if="settings.consent" class="ek-ai-muted">
              {{ $t('mcp.settings.consentBy', { date: formatDate(settings.consent.at), email: settings.consent.byEmail, version: settings.consent.textVersion }) }}
            </p>
            <router-link v-slot="{ navigate }" to="/account/connected-apps" custom>
              <EkButton class="ek-ai-link" tone="ghost" size="sm" trailing-icon="mdi-arrow-right" @click="navigate">{{ $t('mcp.settings.manageConnections') }}</EkButton>
            </router-link>
          </div>
        </EkSettingsSection>

        <!-- Erişim düzeyi -->
        <EkSettingsSection :title="$t('mcp.settings.accessTitle')" :description="$t('mcp.settings.accessDescription')">
          <EkAlert v-if="!settings.canEdit" tone="info" dense :text="$t('mcp.settings.readonly')" data-testid="mcp-settings-readonly" />
          <fieldset class="ek-ai-options" :disabled="!settings.canEdit || saving" data-testid="mcp-settings-access">
            <legend class="ek-sr-only">{{ $t('mcp.settings.accessLegend') }}</legend>
            <label v-for="opt in MCP_ACCESS_OPTIONS" :key="opt" class="ek-ai-option" :class="{ 'is-selected': access === opt, 'is-readonly': !settings.canEdit }" :data-access="opt">
              <input v-model="access" type="radio" name="ek-ai-access" :value="opt" :aria-describedby="`${hintId}-${opt}`" />
              <span class="ek-ai-option__text">
                <span class="ek-ai-option__name">{{ $t(accessLabelKey(opt)) }}</span>
                <span :id="`${hintId}-${opt}`" class="ek-ai-option__hint">{{ $t(optionHintKey(opt)) }}</span>
              </span>
            </label>
          </fieldset>
          <EkAlert v-if="settings.canEdit && access === 'off' && settings.access !== 'off'" tone="info" dense :text="$t('mcp.settings.offNote')" data-testid="mcp-settings-off-note" />
        </EkSettingsSection>

        <!-- Bilgilendirme + onay -->
        <EkSettingsSection :title="$t('mcp.settings.noticeTitle')" :description="$t('mcp.settings.noticeDescription')">
          <section class="ek-ai-notice" :aria-labelledby="noticeTitleId">
            <p :id="noticeTitleId" class="ek-ai-notice__version">{{ $t('mcp.settings.noticeVersion', { version: settings.currentText.textVersion }) }}</p>
            <p class="ek-ai-notice__text" data-testid="mcp-settings-notice">{{ settings.currentText.text }}</p>
          </section>
          <label v-if="settings.canEdit && needsConsent" class="ek-ai-accept" data-testid="mcp-settings-accept">
            <input v-model="accepted" type="checkbox" :disabled="saving" :aria-describedby="!accepted ? acceptHintId : undefined" />
            <span>{{ $t('mcp.settings.accept') }}</span>
          </label>
          <p v-if="settings.canEdit && needsConsent && !accepted && dirty" :id="acceptHintId" class="ek-ai-accept__hint">{{ $t('mcp.settings.acceptRequired') }}</p>
        </EkSettingsSection>
      </template>
    </EkSettingsTemplate>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EkAlert, EkButton, EkProblemState, EkSkeleton, EkStatusChip } from '@entegrasyonik/ui/components'
import { formatDate, formatNumber } from '@entegrasyonik/ui/format'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import EkSettingsTemplate from '@/components/page/templates/EkSettingsTemplate.vue'
import EkSettingsSection from '@/components/page/templates/EkSettingsSection.vue'
import McpCopyField from '@/components/mcp/McpCopyField.vue'
import { useMcpApi } from '@/composables/useMcpApi'
import {
  MCP_ACCESS_OPTIONS,
  accessLabelKey,
  accessTone,
  consentRequired,
  mcpErrorKey,
  settingsSaveBody,
} from '@/components/mcp/mcpModel'
import type { McpAccess, McpSettings } from '@/types/McpTypes'

const { t } = useI18n()
const api = useMcpApi()
const { showToast } = useToast()
const uid = useId()
const hintId = `ek-ai-hint-${uid}`
const noticeTitleId = `ek-ai-notice-${uid}`
const acceptHintId = `ek-ai-accept-${uid}`

const state = ref<'loading' | 'ready' | 'error' | 'disabled'>('loading')
const settings = ref<McpSettings | null>(null)
const access = ref<McpAccess>('off')
const accepted = ref(false)
const saving = ref(false)
const saveErrorKey = ref('')
const saveRequestId = ref('')
const loadErrorKey = ref('')
const loadRequestId = ref('')

const needsConsent = computed(() => (settings.value ? consentRequired(settings.value, access.value) : false))
const dirty = computed(() => !!settings.value && settings.value.canEdit && access.value !== settings.value.access)
const saveBody = computed(() => (settings.value ? settingsSaveBody(settings.value, access.value, accepted.value) : null))

function optionHintKey(opt: McpAccess): string {
  return opt === 'off' ? 'mcp.settings.optionOffHint' : opt === 'read' ? 'mcp.settings.optionReadHint' : 'mcp.settings.optionReadwriteHint'
}

// Seçim değişince onay kutusu sıfırlanmaz ama yeniden kapatılıp açılırsa kullanıcı yeniden onaylar.
watch(access, (next) => {
  if (next === 'off') accepted.value = false
  saveErrorKey.value = ''
})

function applySettings(s: McpSettings) {
  settings.value = s
  access.value = s.access
  accepted.value = false
}

async function load() {
  state.value = 'loading'
  loadErrorKey.value = ''
  loadRequestId.value = ''
  const res = await api.getSettings()
  if (res.ok && res.data) {
    applySettings(res.data)
    state.value = 'ready'
  } else {
    if (!res.ok) {
      loadRequestId.value = res.failure.requestId ?? ''
      if (res.failure.code) loadErrorKey.value = mcpErrorKey(res.failure.code)
      else if (res.failure.status === 403) loadErrorKey.value = 'mcp.errors.FORBIDDEN'
    }
    // MCP_ENABLED=false: yüzey kapalı -> 404 (ADR-0035). Hata değil, 'kapalı' durumu.
    state.value = !res.ok && res.failure.status === 404 ? 'disabled' : 'error'
  }
}

function discard() {
  if (settings.value) applySettings(settings.value)
  saveErrorKey.value = ''
}

async function save() {
  if (!settings.value || saving.value) return
  saveErrorKey.value = ''
  saveRequestId.value = ''
  const body = saveBody.value
  if (!body) {
    saveErrorKey.value = 'mcp.settings.acceptRequired'
    return
  }
  saving.value = true
  const res = await api.saveSettings(body)
  saving.value = false
  if (res.ok && res.data) {
    applySettings(res.data)
    showToast({ tone: 'success', message: t('mcp.settings.saved') })
    return
  }
  if (!res.ok) {
    saveErrorKey.value = mcpErrorKey(res.failure.code ?? (res.failure.status === 403 ? 'FORBIDDEN' : undefined))
    saveRequestId.value = res.failure.requestId ?? ''
  }
}

onMounted(load)
</script>

<style scoped>
.ek-ai-status {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}
.ek-ai-facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-6);
  margin: 0;
}
.ek-ai-fact {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
}
.ek-ai-fact dt {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}
.ek-ai-fact dd {
  margin: 0;
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}
.ek-ai-muted {
  margin: 0;
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
  overflow-wrap: anywhere;
}
.ek-ai-link {
  align-self: flex-start;
}
.ek-ai-options {
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 0;
}
.ek-ai-option {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}
.ek-ai-option.is-selected {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}
.ek-ai-option.is-readonly {
  cursor: default;
}
.ek-ai-option input,
.ek-ai-accept input {
  flex: none;
  width: 18px;
  height: 18px;
  margin: 1px 0 0;
  accent-color: var(--ek-color-action);
}
.ek-ai-option input:focus-visible,
.ek-ai-accept input:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}
.ek-ai-option__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ek-ai-option__name {
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
}
.ek-ai-option__hint {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}
.ek-ai-notice {
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
}
.ek-ai-notice__version {
  margin: 0 0 var(--ek-space-2);
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-muted);
}
.ek-ai-notice__text {
  margin: 0;
  font-size: var(--ek-font-size-sm);
  line-height: var(--ek-line-height-normal);
  color: var(--ek-color-content-default);
  white-space: pre-line;
}
.ek-ai-accept {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-default);
  cursor: pointer;
}
.ek-ai-accept__hint {
  margin: 0;
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-warning-emphasis);
}
.ek-ai-support {
  display: block;
  font-size: var(--ek-font-size-xs);
  font-family: var(--ek-font-mono);
  color: var(--ek-color-content-muted);
}
</style>
