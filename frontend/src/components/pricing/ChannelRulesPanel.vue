<!--
  frontend/src/components/pricing/ChannelRulesPanel.vue

  [eslesme-fiyat WP5, K-A/K-A2] Kanal fiyat kuralları (rakibe bakmaz): maliyet + kargo + komisyon + KDV + hedef marj ya da ana fiyat ± ayar
  → kanal satış fiyatı. Fiyatı SUNUCU hesaplar; bu panel kuralı kaydeder, önizler (salt okuma) ve kullanıcı onayıyla uygular.
  Otomatik uygulama: yalnız tenant anahtarı (bildirim onaylı) + kuralın kendi anahtarı açıkken. K4: form alanları boş başlar.
  K9: liste fiyatı yalnız "koru" ya da "satışla aynı" (yapay yükseltme yok). Mantık `composables/useChannelRulesApi.ts`.
-->
<template>
  <section class="cr" aria-labelledby="cr-title" data-testid="channel-rules-panel">
    <div class="pr-toolbar">
      <h2 id="cr-title" class="pr-h2">{{ t('pricingRules.channel.title') }}</h2>
      <div class="pr-toolbar__spacer" />
      <v-switch :model-value="autoApply" color="primary" density="compact" hide-details inset :disabled="!tenantEnabled || busy"
        :label="t('pricingRules.channel.autoApply')" data-testid="cr-auto-switch" @update:model-value="toggleAuto" />
      <EkButton tone="primary" icon="mdi-plus" :disabled="!tenantEnabled" data-testid="cr-add" @click="openForm()">{{ t('pricingRules.channel.add') }}</EkButton>
    </div>
    <p class="pr-muted">{{ t('pricingRules.channel.intro') }}</p>

    <EkEmptyState v-if="!channelRules.length" variant="no-data" class="pr-panel" :title="t('pricingRules.channel.emptyTitle')" :message="t('pricingRules.channel.emptyText')" />
    <ul v-else class="pr-rules" :aria-label="t('pricingRules.channel.title')">
      <li v-for="r in channelRules" :key="r.id" class="pr-panel pr-rule" :data-channel-rule="r.id">
        <header class="pr-rule__head">
          <h3 class="pr-rule__name">{{ r.name }}</h3>
          <EkStatusChip :tone="r.enabled ? 'success' : 'neutral'" dot :label="r.enabled ? t('pricingRules.rules.on') : t('pricingRules.rules.off')" />
          <EkStatusChip v-if="r.channel.autoApply" tone="info" icon="mdi-autorenew" :label="t('pricingRules.channel.autoChip')" />
          <span class="pr-muted ek-num">{{ r.integrationCode }} · {{ t('pricingRules.rules.version', { v: r.version }) }}</span>
          <div class="pr-toolbar__spacer" />
          <EkButton size="sm" tone="secondary" icon="mdi-eye-outline" :data-testid="`cr-preview-${r.id}`" @click="openPreview(r)">{{ t('pricingRules.channel.preview') }}</EkButton>
          <EkRowActions :label="t('pricingRules.rules.actions', { name: r.name })" :items="[
            { key: 'edit', action: 'edit', label: t('pricingRules.rules.edit'), onClick: () => openForm(r) },
            { key: 'delete', action: 'delete', label: t('pricingRules.rules.delete'), onClick: () => emit('delete', r) },
          ]" />
        </header>
        <dl class="pr-rule__grid">
          <div><dt>{{ t('pricingRules.channel.base') }}</dt><dd>{{ baseText(r) }}</dd></div>
          <div><dt>{{ t('pricingRules.channel.commission') }}</dt><dd class="ek-num">{{ r.channel.commission.source === 'static' ? `%${r.channel.commission.rate}` : t('pricingRules.channel.commissionAuto') }}</dd></div>
          <div><dt>{{ t('pricingRules.channel.cargo') }}</dt><dd class="ek-num">{{ formatMoney(r.channel.cargoCost) }}</dd></div>
          <div><dt>{{ t('pricingRules.channel.rounding') }}</dt><dd class="ek-num">{{ formatMoney(r.channel.rounding.step) }}{{ r.channel.rounding.psychological ? ' · ,99' : '' }}</dd></div>
          <div><dt>{{ t('pricingRules.rules.floor') }} / {{ t('pricingRules.rules.ceiling') }}</dt>
            <dd class="ek-num">{{ r.channel.floorMarginPercent === null || r.channel.floorMarginPercent === undefined ? '—' : `%${r.channel.floorMarginPercent}` }} / {{ r.channel.ceiling ? formatMoney(r.channel.ceiling) : '—' }}</dd></div>
          <div><dt>{{ t('pricingRules.rules.scope') }}</dt><dd>{{ r.scope.barcodes.length ? t('pricingRules.rules.scopeBarcodes', { n: r.scope.barcodes.length }) : t('pricingRules.rules.scopeAll') }}</dd></div>
        </dl>
      </li>
    </ul>

    <!-- Kural formu: sayısal alanlar boş başlar (K4) -->
    <EkFormDialog v-model="formOpen" :title="form.id ? t('pricingRules.channel.titleEdit') : t('pricingRules.channel.titleNew')" icon="mdi-calculator-variant-outline"
      :columns="2" width="lg" :submit-label="t('pricingRules.form.save')" :loading="busy" data-testid="cr-form" @submit="save">
      <v-text-field v-model="form.name" :label="t('pricingRules.form.name')" density="compact" variant="outlined" maxlength="80" :error-messages="miss('name')" data-testid="cr-f-name" />
      <v-select v-model="form.integrationCode" :items="channelItems" :label="t('pricingRules.channel.channel')" density="compact" variant="outlined" :error-messages="miss('integrationCode')" data-testid="cr-f-channel" />
      <v-select v-model="form.base" :items="baseItems" item-title="title" item-value="value" :label="t('pricingRules.channel.base')" density="compact" variant="outlined" data-testid="cr-f-base" />
      <v-text-field v-if="form.base === 'cost'" v-model="form.marginPercent" inputmode="decimal" suffix="%" :label="t('pricingRules.channel.margin')" density="compact" variant="outlined"
        :hint="t('pricingRules.channel.marginHint')" persistent-hint :error-messages="miss('marginPercent')" data-testid="cr-f-margin" />
      <template v-else>
        <v-text-field v-model="form.adjustPercent" inputmode="decimal" suffix="%" :label="t('pricingRules.channel.adjustPercent')" density="compact" variant="outlined" :error-messages="miss('adjustPercent')" data-testid="cr-f-adjust-pct" />
        <v-text-field v-model="form.adjustAmount" inputmode="decimal" prefix="₺" :label="t('pricingRules.channel.adjustAmount')" density="compact" variant="outlined" data-testid="cr-f-adjust-amt" />
      </template>
      <v-select v-model="form.commissionSource" :items="commissionItems" item-title="title" item-value="value" :label="t('pricingRules.channel.commission')" density="compact" variant="outlined" data-testid="cr-f-commission" />
      <v-text-field v-if="form.commissionSource === 'static'" v-model="form.commissionRate" inputmode="decimal" suffix="%" :label="t('pricingRules.channel.commissionRate')" density="compact" variant="outlined"
        :error-messages="miss('commissionRate')" data-testid="cr-f-commission-rate" />
      <v-text-field v-model="form.cargoCost" inputmode="decimal" prefix="₺" :label="t('pricingRules.channel.cargo')" :hint="t('pricingRules.channel.cargoHint')" persistent-hint density="compact" variant="outlined"
        :error-messages="miss('cargoCost')" data-testid="cr-f-cargo" />
      <v-text-field v-model="form.roundingStep" inputmode="decimal" prefix="₺" :label="t('pricingRules.channel.roundingStep')" density="compact" variant="outlined" :error-messages="miss('roundingStep')" data-testid="cr-f-step" />
      <v-select v-model="form.roundingDirection" :items="directionItems" item-title="title" item-value="value" :label="t('pricingRules.channel.roundingDirection')" density="compact" variant="outlined" data-testid="cr-f-direction" />
      <v-checkbox v-model="form.psychological" density="compact" hide-details :label="t('pricingRules.channel.psychological')" data-testid="cr-f-99" />
      <v-text-field v-model="form.floorMarginPercent" inputmode="decimal" suffix="%" :label="t('pricingRules.channel.floor')" density="compact" variant="outlined" data-testid="cr-f-floor" />
      <v-text-field v-model="form.ceiling" inputmode="decimal" prefix="₺" :label="t('pricingRules.form.ceiling')" density="compact" variant="outlined" data-testid="cr-f-ceiling" />
      <v-select v-model="form.listStrategy" :items="listItems" item-title="title" item-value="value" :label="t('pricingRules.channel.listPrice')" density="compact" variant="outlined" data-testid="cr-f-list" />
      <v-text-field v-model="form.maxChangePercent" inputmode="decimal" suffix="%" :label="t('pricingRules.channel.maxChange')" :hint="t('pricingRules.channel.maxChangeHint')" persistent-hint density="compact" variant="outlined" data-testid="cr-f-max-change" />
      <v-textarea v-model="form.barcodes" :label="t('pricingRules.form.barcodes')" :hint="t('pricingRules.form.barcodesHint')" persistent-hint rows="2" auto-grow density="compact" variant="outlined" class="pr-span-2" data-testid="cr-f-barcodes" />
      <v-switch v-model="form.enabled" color="primary" density="compact" hide-details inset :label="t('pricingRules.form.enabled')" data-testid="cr-f-enabled" />
      <v-switch v-model="form.autoApply" color="primary" density="compact" hide-details inset :label="t('pricingRules.channel.ruleAutoApply')" data-testid="cr-f-auto" />
      <EkAlert tone="info" dense class="pr-span-2" :text="t('pricingRules.channel.noCompetitor')" />
      <EkAlert v-if="saveError" tone="error" dense live class="pr-span-2" :text="saveError" data-testid="cr-form-error" />
    </EkFormDialog>

    <!-- Önizleme (salt okuma) + İNSAN ONAYI ile uygulama -->
    <EkConfirmDialog v-model="previewState.open" :title="t('pricingRules.channel.previewTitle', { name: previewState.rule?.name ?? '' })"
      :description="previewSummary" :confirm-label="t('pricingRules.channel.apply', { n: previewState.changed })" icon="mdi-check-decagram-outline"
      :loading="busy" data-testid="cr-preview-dialog" @confirm="apply">
      <EkDataGrid focusable-scroll :columns="previewColumns" :rows="previewState.rows" row-key="variantId" label-key="barcode" :label="t('pricingRules.channel.previewLabel')" data-testid="cr-preview-grid">
        <template #cell-barcode="{ row }"><span class="ek-num">{{ row.barcode ?? row.variantId }}</span></template>
        <template #cell-current="{ row }"><span class="ek-num">{{ row.current.salePrice === null ? '—' : formatMoney(row.current.salePrice) }}</span>
          <span class="pr-muted"> · {{ PRICE_SOURCE_TEXT[(row as ChannelPreviewRow).current.source] }}</span></template>
        <template #cell-next="{ row }">
          <span v-if="row.result.ok" class="ek-num pr-strong">{{ formatMoney(row.result.salePrice) }}</span>
          <EkStatusChip v-else tone="warning" :label="blockText(row as ChannelPreviewRow)" />
        </template>
        <template #cell-why="{ row }">
          <span class="pr-muted cr-why">{{ row.result.reasons.join(' → ') }}</span>
          <template v-if="row.result.ok"><EkStatusChip v-for="w in row.result.warnings" :key="w" tone="warning" :label="w" /></template>
        </template>
      </EkDataGrid>
    </EkConfirmDialog>

    <!-- K-A2: otomatik uygulama bildirimi (açarken bir kez onaylanır) -->
    <EkFormDialog v-model="autoOpen" :title="t('pricingRules.channel.autoTitle')" icon="mdi-autorenew" :submit-label="t('pricingRules.channel.autoSubmit')"
      :submit-disabled="!autoAck" :loading="busy" data-testid="cr-auto-dialog" @submit="enableAuto">
      <p class="pr-consent__text" data-testid="cr-auto-notice">{{ autoNotice }}</p>
      <v-checkbox v-model="autoAck" density="compact" hide-details :label="t('pricingRules.channel.autoAccept')" data-testid="cr-auto-ack" />
    </EkFormDialog>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  EkAlert, EkButton, EkConfirmDialog, EkDataGrid, EkEmptyState, EkFormDialog, EkRowActions, EkStatusChip, type EkGridColumn,
} from '@entegrasyonik/ui/components'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { formatMoney } from '@entegrasyonik/ui/format'
import {
  CHANNEL_BLOCK_TEXT, CHANNEL_RULE_CHANNELS, PRICE_SOURCE_TEXT, channelFormFromRule, channelFormMissing, emptyChannelForm, useChannelRulesApi,
  type ChannelPreviewRow, type ChannelRule, type ChannelRuleForm,
} from '@/composables/useChannelRulesApi'

const props = defineProps<{
  rules: any[]
  /** Tenant fiyat kuralları anahtarı + metin kabulü (rekabet kuralıyla ortak). */
  tenantEnabled: boolean
  autoApply: boolean
  autoNoticeText: { tr: string; en: string } | null
  channels?: string[]
}>()
const emit = defineEmits<{ (e: 'changed'): void; (e: 'delete', r: { id: string; name: string }): void }>()

const { t, locale } = useI18n()
const api = useChannelRulesApi()
const { showToast } = useToast()
const busy = ref(false)
const blockText = (row: ChannelPreviewRow) => (row.result.ok ? '' : CHANNEL_BLOCK_TEXT[row.result.blocked])

const channelRules = computed<ChannelRule[]>(() => (props.rules || []).filter((r: any) => r?.type === 'channel'))
const channelItems = computed(() => props.channels?.length ? props.channels : [...CHANNEL_RULE_CHANNELS])
const baseItems = computed(() => [{ value: 'cost', title: t('pricingRules.channel.baseCost') }, { value: 'salePrice', title: t('pricingRules.channel.baseSale') }])
const commissionItems = computed(() => [{ value: 'auto', title: t('pricingRules.channel.commissionAuto') }, { value: 'static', title: t('pricingRules.channel.commissionStatic') }])
const directionItems = computed(() => [{ value: 'up', title: t('pricingRules.channel.up') }, { value: 'down', title: t('pricingRules.channel.down') }, { value: 'nearest', title: t('pricingRules.channel.nearest') }])
const listItems = computed(() => [{ value: 'keep', title: t('pricingRules.channel.listKeep') }, { value: 'same', title: t('pricingRules.channel.listSame') }])
const autoNotice = computed(() => (props.autoNoticeText ? (String(locale.value).startsWith('tr') ? props.autoNoticeText.tr : props.autoNoticeText.en) : ''))

function baseText(r: ChannelRule) {
  const c = r.channel
  if (c.base === 'cost') return t('pricingRules.channel.baseCostValue', { margin: c.marginPercent === null || c.marginPercent === undefined ? '—' : `%${c.marginPercent}` })
  const parts = [c.adjustPercent ? `${c.adjustPercent > 0 ? '+' : ''}%${c.adjustPercent}` : '', c.adjustAmount ? `${c.adjustAmount > 0 ? '+' : ''}${formatMoney(c.adjustAmount)}` : ''].filter(Boolean)
  return `${t('pricingRules.channel.baseSale')} ${parts.join(' ')}`
}

// ── form ──
const formOpen = ref(false)
const form = reactive<ChannelRuleForm>(emptyChannelForm())
const missing = ref<string[]>([])
const saveError = ref('')
const miss = (k: string) => (missing.value.includes(k) ? [t('pricingRules.channel.required')] : [])
function openForm(r?: ChannelRule) {
  Object.assign(form, r ? channelFormFromRule(r) : { ...emptyChannelForm(), id: undefined })
  missing.value = []
  saveError.value = ''
  formOpen.value = true
}
async function save() {
  missing.value = channelFormMissing(form)
  if (missing.value.length) return
  busy.value = true
  try {
    const r = await api.save(form)
    if (!r.ok) { saveError.value = t('pricingRules.channel.saveError'); return }
    formOpen.value = false
    showToast({ tone: 'success', message: t('pricingRules.channel.saved') })
    emit('changed')
  } finally { busy.value = false }
}

// ── önizleme + onaylı uygulama ──
const previewState = reactive<{ open: boolean; rule: ChannelRule | null; rows: ChannelPreviewRow[]; changed: number; blocked: number }>({ open: false, rule: null, rows: [], changed: 0, blocked: 0 })
const previewColumns = computed<EkGridColumn[]>(() => [
  { key: 'barcode', label: t('pricingRules.channel.colProduct') },
  { key: 'current', label: t('pricingRules.channel.colCurrent'), align: 'end' },
  { key: 'next', label: t('pricingRules.channel.colNext'), align: 'end' },
  { key: 'why', label: t('pricingRules.channel.colWhy') },
] as EkGridColumn[])
const previewSummary = computed(() => t('pricingRules.channel.previewSummary', { changed: previewState.changed, blocked: previewState.blocked }))
async function openPreview(r: ChannelRule) {
  busy.value = true
  try {
    const p = await api.preview(r.id, 100)
    if (!p.ok) { showToast({ tone: 'error', message: t('pricingRules.channel.previewError') }); return }
    Object.assign(previewState, { open: true, rule: r, rows: p.data.items, changed: p.data.summary.changed, blocked: p.data.summary.blocked })
  } finally { busy.value = false }
}
async function apply() {
  if (!previewState.rule) return
  busy.value = true
  try {
    const r = await api.apply(previewState.rule.id)
    if (!r.ok) { showToast({ tone: 'error', message: t('pricingRules.channel.applyError') }); return }
    previewState.open = false
    showToast({ tone: 'success', message: t('pricingRules.channel.applied', { applied: r.data.applied, pending: r.data.pending, blocked: r.data.blocked }) })
    emit('changed')
  } finally { busy.value = false }
}

// ── K-A2 otomatik uygulama anahtarı ──
const autoOpen = ref(false)
const autoAck = ref(false)
async function toggleAuto(on: boolean | null) {
  if (on) { autoAck.value = false; autoOpen.value = true; return }
  busy.value = true
  try {
    const r = await api.setAutoApply(true, false, false)
    if (!r.ok) showToast({ tone: 'error', message: t('pricingRules.channel.autoError') })
    else emit('changed')
  } finally { busy.value = false }
}
async function enableAuto() {
  busy.value = true
  try {
    const r = await api.setAutoApply(true, true, autoAck.value)
    if (!r.ok) { showToast({ tone: 'error', message: t('pricingRules.channel.autoError') }); return }
    autoOpen.value = false
    emit('changed')
  } finally { busy.value = false }
}
</script>

<style scoped>
.cr {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  margin-top: var(--ek-space-6);
}

.cr-why {
  font-size: var(--ek-type-caption-size);
}
</style>
