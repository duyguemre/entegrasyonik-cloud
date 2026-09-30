<!--
  frontend/src/views/secure/integrations/StockPolicyView.vue

  ADR-0015 B4-P0 — N5 "Stok politikası" (zero-oversell'in kullanıcı tarafı, ADR-0004 Karar 1/5/7).
  `EkSettingsTemplate` (Karar 3.9.2 / 6.1): yapışkan "Vazgeç · Kaydet" çubuğu yalnızca değişiklik varken.
  Not (Karar 6.4 desen mandalı): `EkPageHeader` bu dosyada DOĞRUDAN kullanılmaz — `EkSettingsTemplate`
  onu İÇİNDE render eder (EngineSettingsView ile aynı emsal).

  Sözleşme: `docs/API_TENANT_SURFACE.md` §1 (admin, owner dahil). Backend karşılığı (salt-okunur, grep):
  `backend/src/api/services/integration-service.ts:177` getStockPolicy, `:206` saveTenantStockPolicy,
  `:235` saveChannelStockPolicy (yalnızca DEĞİŞEN alanlar gönderilir; `null` = varsayılana dön).
  Genel `saveClientMarketplaceSettings` ucu `stockPolicy`'yi artık EZMEZ (§1 "Önemli düzeltme") — bu ekran
  o uca HİÇ yazmaz. `autoRestock` gibi tüketicisi olmayan ayarlar backend'de KASITLI reddedilir → gösterilmez.
-->
<template>
  <div class="stockPolicyView">
    <EkSettingsTemplate
      section="Katalog"
      :title="$t('stockPolicy.title')"
      :description="$t('stockPolicy.description')"
      :dirty="isDirty"
      :saving="saving"
      :unsaved-hint="unsavedHint"
      @save="save"
      @discard="discard"
    >
      <EkSkeleton v-if="state === 'loading'" type="form" />
      <EkEmptyState
        v-else-if="state === 'forbidden'"
        variant="error"
        :title="$t('stockPolicy.forbidden.title')"
        :message="$t('stockPolicy.forbidden.message')"
      />
      <EkErrorState v-else-if="state === 'error'" :message="$t('stockPolicy.loadError')" @retry="load" />
      <EkEmptyState
        v-else-if="!policy || policy.channels.length === 0"
        variant="not-connected"
        :title="$t('stockPolicy.empty.title')"
        :message="$t('stockPolicy.empty.message')"
        :show-action="!!marketplaceLink"
        :action-text="$t('stockPolicy.empty.action')"
        action-icon="mdi-storefront-outline"
        @action="openMarketplace"
      />
      <template v-else>
        <EkSettingsSection :title="$t('stockPolicy.primary.title')" :description="$t('stockPolicy.primary.description')">
          <template #title-extra><EkHelpHint hint="stock.channelPolicy" /></template>
          <v-select
            v-model="primaryDraft"
            class="stockPolicyView__primary"
            :items="primaryItems"
            item-title="title"
            item-value="value"
            :label="$t('stockPolicy.primary.label')"
            :hint="primaryHint"
            persistent-hint
          />
          <p v-if="!policy.primaryChannelIsConnected" class="stockPolicyView__notice stockPolicyView__notice--warning" role="alert">
            <v-icon size="18" aria-hidden="true">mdi-alert-outline</v-icon>
            <span>{{ $t('stockPolicy.primary.stale', { channel: channelName(policy.primaryChannel ?? '') }) }}</span>
          </p>
        </EkSettingsSection>

        <EkSettingsSection :title="$t('stockPolicy.channels.title')" :description="$t('stockPolicy.channels.description')">
          <template #title-extra><EkHelpHint hint="stock.safetyStock" /></template>
          <article
            v-for="channel in policy.channels"
            :key="channel.integrationCode"
            class="stockPolicyView__channel"
            :aria-labelledby="`stock-policy-${channel.integrationCode}`"
          >
            <header class="stockPolicyView__channel-head">
              <h3 :id="`stock-policy-${channel.integrationCode}`" class="stockPolicyView__channel-title">
                <!-- Monogram harfi başlığın erişilebilir adına karışmasın ("T Trendyol" değil "Trendyol"). -->
                <span aria-hidden="true"><EkPlatformMark :name="channelName(channel.integrationCode)" :code="channel.integrationCode" :show-name="false" /></span>
                <span>{{ channelName(channel.integrationCode) }}</span>
              </h3>
              <div class="stockPolicyView__chips">
                <EkStatusChip v-if="isPrimaryDraft(channel.integrationCode)" tone="info" :label="$t('stockPolicy.channels.primaryChip')" />
                <EkStatusChip v-if="!channel.enabled" tone="neutral" :label="$t('stockPolicy.channels.disabledChip')" />
              </div>
            </header>

            <div class="stockPolicyView__grid">
              <v-text-field
                v-model="drafts[channel.integrationCode].bufferUnits"
                :label="$t('stockPolicy.fields.bufferUnits')"
                inputmode="numeric"
                :placeholder="$t('stockPolicy.fields.defaultPlaceholder', { value: bufferUnitsDefault(channel.integrationCode) })"
                persistent-placeholder
                :hint="isPrimaryDraft(channel.integrationCode) ? $t('stockPolicy.fields.bufferUnitsPrimaryHint') : $t('stockPolicy.fields.bufferUnitsHint')"
                persistent-hint
                :error-messages="fieldError(channel.integrationCode, 'bufferUnits')"
              />
              <v-text-field
                v-model="drafts[channel.integrationCode].bufferPercent"
                :label="$t('stockPolicy.fields.bufferPercent')"
                inputmode="decimal"
                prefix="%"
                :placeholder="$t('stockPolicy.fields.defaultPlaceholder', { value: policy.defaults.bufferPercent })"
                persistent-placeholder
                :hint="$t('stockPolicy.fields.bufferPercentHint')"
                persistent-hint
                :error-messages="fieldError(channel.integrationCode, 'bufferPercent')"
              />
              <v-text-field
                v-model="drafts[channel.integrationCode].graceMinutes"
                :label="$t('stockPolicy.fields.graceMinutes')"
                inputmode="numeric"
                :suffix="$t('stockPolicy.fields.minutes')"
                :placeholder="$t('stockPolicy.fields.defaultPlaceholder', { value: policy.defaults.graceMinutes })"
                persistent-placeholder
                :hint="$t('stockPolicy.fields.graceMinutesHint')"
                persistent-hint
                :error-messages="fieldError(channel.integrationCode, 'graceMinutes')"
              />
              <v-select
                v-if="channel.autoCancelSupported"
                v-model="drafts[channel.integrationCode].autoCancelOversold"
                :items="autoCancelItems"
                item-title="title"
                item-value="value"
                :label="$t('stockPolicy.fields.autoCancel')"
                :hint="$t('stockPolicy.fields.autoCancelHint')"
                persistent-hint
              />
              <!-- İptal yeteneği gerçek/testli olmayan kanalda ayar ETKİSİZDİR (§1.3) → seçici yerine salt-okunur bilgi. -->
              <div v-else class="stockPolicyView__readonly">
                <p class="stockPolicyView__readonly-label">{{ $t('stockPolicy.fields.autoCancel') }}</p>
                <p class="stockPolicyView__readonly-value">{{ $t('stockPolicy.fields.unsupported') }}</p>
                <p class="stockPolicyView__readonly-hint">{{ $t('stockPolicy.fields.autoCancelUnsupported') }}</p>
              </div>
            </div>

            <p class="stockPolicyView__preview">
              <v-icon size="16" aria-hidden="true">mdi-calculator-variant-outline</v-icon>
              <span>{{ previewText(channel.integrationCode) }}</span>
            </p>
          </article>
        </EkSettingsSection>

        <p v-if="saveError" class="stockPolicyView__notice stockPolicyView__notice--error" role="alert">
          <v-icon size="18" aria-hidden="true">mdi-alert-circle-outline</v-icon>
          <span>{{ saveError }}</span>
        </p>
      </template>
    </EkSettingsTemplate>
  </div>
</template>

<script setup lang="ts">
import EkHelpHint from '@/components/ds/EkHelpHint.vue'
import { computed, inject, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import EkSettingsTemplate from '@/components/ds/templates/EkSettingsTemplate.vue'
import EkSettingsSection from '@/components/ds/templates/EkSettingsSection.vue'
import EkSkeleton from '@/components/ds/EkSkeleton.vue'
import EkErrorState from '@/components/ds/EkErrorState.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkPlatformMark from '@/components/ds/EkPlatformMark.vue'
import { useToast } from '@/composables/useToast'
import { useMenuStore } from '@/stores/site/menu'
import { formatNumber } from '@/composables/format'
import { apiMessage, apiStatus, isApiError } from '@/composables/apiErrors'
import {
  buildChannelPatch, computePublishQuantity, effectiveNumbers, isStockPolicyResponse, toDraft, useStockPolicyApi, validateDraft,
  type ChannelDraft, type ChannelPatch, type StockPolicyResponse,
} from '@/composables/useStockPolicyApi'

const api = useStockPolicyApi()
const { showToast } = useToast()
const { t } = useI18n()
const menuStore: any = useMenuStore()
const eventBus: any = inject('eventBus', null)

/** Önizleme örneği: "20 adet satılabilir stok" — formülü somutlaştırmak için sabit, sözleşmeden bağımsız bir sayı. */
const PREVIEW_AVAILABLE = 20
const CHANNEL_NAMES: Record<string, string> = { trendyol: 'Trendyol', hepsiburada: 'Hepsiburada', n11: 'N11', pazarama: 'Pazarama' }
function channelName(code: string): string {
  return CHANNEL_NAMES[code] ?? (code ? code.charAt(0).toUpperCase() + code.slice(1) : '—')
}

// ---- Yükleme ----
const state = ref<'loading' | 'ready' | 'error' | 'forbidden'>('loading')
const policy = ref<StockPolicyResponse | null>(null)
const drafts = ref<Record<string, ChannelDraft>>({})
const primaryDraft = ref<string | null>(null)

function resetDrafts() {
  if (!policy.value) return
  drafts.value = Object.fromEntries(policy.value.channels.map((c) => [c.integrationCode, toDraft(c.stockPolicy)]))
  primaryDraft.value = policy.value.primaryChannel
}

async function load() {
  state.value = 'loading'
  const res: any = await api.getStockPolicy()
  if (isStockPolicyResponse(res) && !isApiError(res)) {
    policy.value = res
    resetDrafts()
    state.value = 'ready'
  } else {
    state.value = apiStatus(res) === 403 ? 'forbidden' : 'error'
  }
}

onMounted(load)

// ---- Birincil kanal ----
const primaryItems = computed(() => {
  const p = policy.value
  if (!p) return []
  const firstByOrder = p.channels[0]?.integrationCode
  const items: { title: string; value: string | null }[] = [
    { title: t('stockPolicy.primary.auto', { channel: firstByOrder ? channelName(firstByOrder) : '—' }), value: null },
    ...p.channels.map((c) => ({ title: channelName(c.integrationCode), value: c.integrationCode })),
  ]
  if (p.primaryChannel && !p.channels.some((c) => c.integrationCode === p.primaryChannel)) {
    items.push({ title: t('stockPolicy.primary.disconnectedItem', { channel: channelName(p.primaryChannel) }), value: p.primaryChannel })
  }
  return items
})

/** Taslaktaki birincil kanal (null → otomatik kural: en küçük `order`'lı pazaryeri — backend ile aynı). */
const effectivePrimaryDraft = computed(() => primaryDraft.value ?? policy.value?.channels[0]?.integrationCode ?? null)
function isPrimaryDraft(code: string): boolean {
  return effectivePrimaryDraft.value === code
}
const primaryHint = computed(() => {
  const effective = effectivePrimaryDraft.value
  return effective ? t('stockPolicy.primary.effective', { channel: channelName(effective) }) : ''
})

// ---- Kanal alanları / doğrulama / önizleme ----
const autoCancelItems = computed(() => [
  { title: t('stockPolicy.fields.autoCancelDefault', { value: policy.value?.defaults.autoCancelOversold ? t('stockPolicy.fields.on') : t('stockPolicy.fields.off') }), value: null },
  { title: t('stockPolicy.fields.on'), value: true },
  { title: t('stockPolicy.fields.off'), value: false },
])

function bufferUnitsDefault(code: string): number {
  return isPrimaryDraft(code) ? 0 : (policy.value?.defaults.bufferUnits ?? 1)
}

const errorsByChannel = computed(() => {
  const p = policy.value
  if (!p) return {}
  return Object.fromEntries(Object.entries(drafts.value).map(([code, d]) => [code, validateDraft(d, p.limits)]))
})
const errorCount = computed(() => Object.values(errorsByChannel.value).reduce((n, e: any) => n + Object.keys(e).length, 0))

function fieldError(code: string, field: 'bufferUnits' | 'bufferPercent' | 'graceMinutes'): string {
  const key = (errorsByChannel.value as any)[code]?.[field]
  if (!key) return ''
  const limits = policy.value!.limits
  const max = field === 'bufferUnits' ? limits.bufferUnitsMax : field === 'bufferPercent' ? limits.bufferPercentMax : limits.graceMinutesMax
  return t(key, { max: formatNumber(max) })
}

function previewText(code: string): string {
  const p = policy.value
  const d = drafts.value[code]
  if (!p || !d) return ''
  const eff = effectiveNumbers(d, p.defaults)
  const qty = computePublishQuantity(PREVIEW_AVAILABLE, { isPrimary: isPrimaryDraft(code), bufferUnits: eff.bufferUnits, bufferPercent: eff.bufferPercent })
  return t('stockPolicy.channels.preview', { available: formatNumber(PREVIEW_AVAILABLE), published: formatNumber(qty) })
}

// ---- Değişiklik / kaydet ----
const patches = computed<Record<string, ChannelPatch>>(() => {
  const p = policy.value
  if (!p) return {}
  const out: Record<string, ChannelPatch> = {}
  for (const c of p.channels) {
    const d = drafts.value[c.integrationCode]
    if (!d) continue
    const patch = buildChannelPatch(c.stockPolicy, d)
    if (Object.keys(patch).length > 0) out[c.integrationCode] = patch
  }
  return out
})
const primaryChanged = computed(() => !!policy.value && primaryDraft.value !== policy.value.primaryChannel)
const changeCount = computed(() => Object.keys(patches.value).length + (primaryChanged.value ? 1 : 0))
const isDirty = computed(() => changeCount.value > 0)
const unsavedHint = computed(() =>
  errorCount.value > 0 ? t('stockPolicy.save.fixErrors', { count: errorCount.value }) : t('stockPolicy.save.unsaved', { count: changeCount.value }),
)

const saving = ref(false)
const saveError = ref('')

async function save() {
  saveError.value = ''
  if (errorCount.value > 0) {
    saveError.value = t('stockPolicy.save.fixErrors', { count: errorCount.value })
    return
  }
  saving.value = true
  const genericError = t('stockPolicy.save.error')
  try {
    if (primaryChanged.value) {
      const res: any = await api.saveTenantStockPolicy(primaryDraft.value)
      if (isApiError(res)) { saveError.value = apiMessage(res, genericError); return }
    }
    for (const [code, patch] of Object.entries(patches.value)) {
      const res: any = await api.saveChannelStockPolicy(code, patch)
      if (isApiError(res)) { saveError.value = `${channelName(code)}: ${apiMessage(res, genericError)}`; return }
    }
    showToast({ tone: 'success', message: t('stockPolicy.save.success') })
    await load()
  } finally {
    saving.value = false
  }
}

function discard() {
  saveError.value = ''
  resetDrafts()
}

// ---- Boş durum eylemi: pazaryeri entegrasyonları ekranı (menüde varsa) ----
const marketplaceLink = computed(() => menuStore.getMenuLinkWithCode?.('MarketplaceView'))
function openMarketplace() {
  const link = marketplaceLink.value
  if (link && eventBus) eventBus.emit('openTab', link)
}

defineExpose({
  initialize: () => {},
  activate: () => {},
})
</script>

<style scoped>
.stockPolicyView {
  padding: var(--ek-space-6);
}

/* ADR-0015 Karar 6.2 — sayfa iç boşluğu: masaüstü 6, tablet 4, mobil 3. */
@media (max-width: 1023px) {
  .stockPolicyView {
    padding: var(--ek-space-4);
  }
}

@media (max-width: 767px) {
  .stockPolicyView {
    padding: var(--ek-space-3);
  }
}

/* Vuetify ipucu/yüzen etiket rengi opaklık tabanlı (ölçülen ≈ 4,29:1) → axe color-contrast AA altında.
   Yalnızca bu ekranda token'lı `content-muted` ile düzeltilir (HashtagListView/ChoiceListView emsali). */
.stockPolicyView :deep(.v-field-label),
.stockPolicyView :deep(.v-input__details .v-messages) {
  color: var(--ek-color-content-muted) !important;
  opacity: 1 !important;
}

.stockPolicyView :deep(.v-input--error .v-input__details .v-messages) {
  color: var(--ek-color-error) !important;
}

.stockPolicyView__channel {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding: var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface);
}

@media (max-width: 767px) {
  .stockPolicyView__channel {
    padding: var(--ek-space-4);
  }
}

.stockPolicyView__channel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2);
}

.stockPolicyView__channel-title {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.stockPolicyView__readonly {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px dashed var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
}

.stockPolicyView__readonly p {
  margin: 0;
}

.stockPolicyView__readonly-label {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}

.stockPolicyView__readonly-value {
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
}

.stockPolicyView__readonly-hint {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}

.stockPolicyView__chips {
  display: flex;
  gap: var(--ek-space-2);
}

.stockPolicyView__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--ek-space-4);
}

@media (min-width: 768px) {
  .stockPolicyView__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.stockPolicyView__preview {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-2) var(--ek-space-3);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-muted);
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
}

.stockPolicyView__preview .v-icon {
  margin-top: 2px;
  flex-shrink: 0;
  color: var(--ek-color-content-muted);
}

.stockPolicyView__notice {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-3);
  border-radius: var(--ek-radius-md);
  font-size: var(--ek-font-size-sm);
  border: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.stockPolicyView__notice .v-icon {
  flex-shrink: 0;
}

.stockPolicyView__notice--warning {
  border-color: var(--ek-color-warning);
}

.stockPolicyView__notice--warning .v-icon {
  color: var(--ek-color-warning);
}

.stockPolicyView__notice--error {
  border-color: var(--ek-color-error);
}

.stockPolicyView__notice--error .v-icon {
  color: var(--ek-color-error);
}
</style>
