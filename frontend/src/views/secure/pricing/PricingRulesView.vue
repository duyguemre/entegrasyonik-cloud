<!--
  PRC-R2 — Fiyat kuralları (Trendyol): rekabet kuralı (B-10 `competition` tipi), KURU öneri ve İNSAN ONAYLI uygulama.
  Sözleşme: docs/PRICING_COMPETITION.md §R2 (`PricingService/*`). Ekran = Otopilot/MCP (aynı yetenekler, tek kayıt).
  Hukuk (AUTO_PRICING_LEGAL): fiyatı SUNUCU hesaplar (K15); form alanları BOŞ başlar (K4); fark > 0, eşitleme yok (K1, sunucu reddeder);
  rakip/mağaza alanı yok (K6); "indirim" dili yok, "fiyat güncellendi" (K11); açarken taslak sorumluluk metni + çift motor onayı (K3, K17).
  OTOMATİK UYGULAMA YOK: fiyat yalnız onay penceresinden (önce → sonra önizlemeli) değişir; sunucu uygulamadan önce sigortayı yeniden çalıştırır.
  Durumlar: yükleniyor · hata · yetki yok · platform kapalı · tenant kapalı/metin bekliyor · buybox verisi kapalı · açık.
-->
<template>
  <div class="prView">
    <div class="pr-scroll">
      <div class="pr-page">
        <EkPageHeader
          :section="t('pricingRules.section')"
          :title="t('pricingRules.title')"
          :description="t('pricingRules.description')"
          :refreshable="state !== 'forbidden'"
          :refreshing="state === 'loading'"
          @refresh="loadAll"
        />

        <EkEmptyState v-if="state === 'forbidden'" variant="error" class="pr-panel"
          :title="t('pricingRules.errors.forbiddenTitle')" :message="t('pricingRules.errors.forbidden')" />

        <EkErrorState v-else-if="state === 'error' && !rules" class="pr-panel" :message="t('pricingRules.errors.load')" @retry="loadAll" />

        <EkSkeleton v-else-if="!rules" type="detail" />

        <template v-else>
          <!-- Durum bandı: ne oluyor → ne yapmalıyım -->
          <section class="pr-band" :class="`pr-band--${bannerTone}`" data-testid="pricing-banner" :data-state="banner" aria-labelledby="pr-band-title">
            <v-icon :icon="bannerIcon" size="22" aria-hidden="true" class="pr-band__icon" />
            <div class="pr-band__body">
              <h2 id="pr-band-title" class="pr-band__title">{{ t(`pricingRules.banner.${banner}.title`) }}</h2>
              <p class="pr-band__text">{{ t(`pricingRules.banner.${banner}.text`) }}</p>
              <p v-if="banner === 'active' || banner === 'competition_off'" class="pr-band__text pr-band__muted" data-testid="dual-engine-note">
                <v-icon icon="mdi-swap-horizontal" size="16" aria-hidden="true" /> {{ dualEngineText }}
              </p>
              <p v-if="rules.settings.consent.acceptedAt" class="pr-band__muted ek-num">
                {{ t('pricingRules.consent.acceptedAt', { time: formatDateTime(rules.settings.consent.acceptedAt) }) }} ·
                {{ t('pricingRules.consent.version', { version: rules.settings.consent.acceptedVersion }) }}
              </p>
            </div>
            <div class="pr-band__actions">
              <EkButton v-if="banner === 'needs_enable' || banner === 'needs_consent'" tone="primary" icon="mdi-power" data-testid="enable-pricing" @click="openConsent">
                {{ t('pricingRules.enable') }}
              </EkButton>
              <EkButton v-else-if="rules.settings.enabled && banner !== 'platform_off'" tone="ghost" icon="mdi-power-off" data-testid="disable-pricing" @click="disableOpen = true">
                {{ t('pricingRules.disable') }}
              </EkButton>
            </div>
          </section>

          <EkPageTabs v-model="tab" :tabs="tabs" :label="t('pricingRules.title')" data-testid="pricing-tabs" />

          <!-- ÖNERİLER -->
          <section v-if="tab === 'suggestions'" class="pr-panel pr-section" aria-labelledby="pr-sug-title" data-testid="suggestions-panel">
            <h2 id="pr-sug-title" class="sr-only">{{ t('pricingRules.tabs.suggestions') }}</h2>
            <div class="pr-toolbar">
              <v-select v-model="sugStatus" :items="statusItems" item-title="title" item-value="value" density="compact" variant="outlined" hide-details
                class="pr-toolbar__status" :label="t('pricingRules.suggestions.filterLabel')" data-testid="suggestion-status" />
              <v-checkbox v-model="lostOnly" density="compact" hide-details :label="t('pricingRules.suggestions.lostOnly')" data-testid="lost-only" />
              <div class="pr-toolbar__spacer" />
              <template v-if="sugStatus === 'open'">
                <EkButton tone="ghost" icon="mdi-close-circle-outline" :disabled="!selectedOpen.length || busy" data-testid="dismiss-selected" @click="dismiss(selectedOpen)">
                  {{ t('pricingRules.suggestions.dismissSelected') }}
                </EkButton>
                <EkButton tone="primary" icon="mdi-check-decagram-outline" :disabled="!selectedOpen.length || busy || !rules.active" data-testid="apply-selected" @click="openApply(selectedOpen)">
                  {{ t('pricingRules.suggestions.applySelected', { n: selectedOpen.length }) }}
                </EkButton>
              </template>
            </div>
            <p v-if="sugStatus === 'open' && selected.length > applyMax" class="pr-muted" role="status" data-testid="selection-cap">
              {{ t('pricingRules.suggestions.selectionCap', { max: applyMax }) }}
            </p>

            <EkAlert v-if="lastOutcome && lastOutcome.rejected.length" tone="warning" :title="t('pricingRules.apply.rejectedTitle')" dense data-testid="apply-rejected">
              <ul class="pr-list">
                <li v-for="r in lastOutcome.rejected" :key="r.suggestionId"><span class="ek-num">{{ r.barcode ?? '—' }}</span> — {{ t(reasonKey(r.reason)) }}</li>
              </ul>
            </EkAlert>

            <EkDataGrid
              :columns="sugColumns" :rows="sugRows" row-key="id" label-key="barcode" :label="t('pricingRules.suggestions.listLabel')"
              :selectable="sugStatus === 'open'" :selected="selected" :loading="sugLoading" :error="sugError"
              :error-title="t('pricingRules.errors.load')" :empty-title="sugStatus === 'open' ? t('pricingRules.suggestions.emptyTitle') : t('pricingRules.suggestions.emptyOther')"
              :empty-text="sugStatus === 'open' ? t('pricingRules.suggestions.emptyText') : ''" empty-icon="mdi-tag-check-outline"
              data-testid="suggestions-grid" @update:selected="onSelect"
            >
              <template #cell-product="{ row }">
                <div class="pr-cell">
                  <span class="pr-strong">{{ row.sku ?? row.barcode }}</span>
                  <span class="pr-muted ek-num">{{ row.barcode }}</span>
                </div>
              </template>
              <template #cell-current="{ row }"><span class="ek-num">{{ formatMoney(row.beforePrice) }}</span></template>
              <template #cell-suggested="{ row }">
                <span v-if="row.afterPrice !== null" class="ek-num pr-strong" :class="row.afterPrice < row.beforePrice ? 'pr-down' : 'pr-up'">
                  <v-icon :icon="row.afterPrice < row.beforePrice ? 'mdi-arrow-down' : 'mdi-arrow-up'" size="14" aria-hidden="true" />{{ formatMoney(row.afterPrice) }}
                </span>
                <span v-else class="pr-muted">—</span>
              </template>
              <template #cell-buybox="{ row }">
                <div class="pr-cell">
                  <span class="ek-num">{{ formatMoney(row.buyboxPrice) }}</span>
                  <span class="pr-muted ek-num">
                    <template v-if="row.buyboxOrder !== null">{{ t('pricingRules.suggestions.rank', { order: row.buyboxOrder }) }} · </template>{{ formatDateTime(row.buyboxObservedAt) }}
                  </span>
                </div>
              </template>
              <template #cell-profit="{ row }">
                <span class="ek-num">{{ formatMoney(row.profitBefore) }} → {{ formatMoney(row.profitAfter) }}</span>
              </template>
              <template #cell-bounds="{ row }"><span class="ek-num">{{ formatMoney(row.floor) }} / {{ formatMoney(row.ceiling) }}</span></template>
              <template #cell-lowest10d="{ row }"><span class="ek-num" :title="t('pricingRules.suggestions.lowestHint')">{{ formatMoney(row.lowest10d) }}</span></template>
              <template #cell-reason="{ row }">
                <div class="pr-cell pr-reasons">
                  <span v-if="row.blockedReason">{{ t(reasonKey(row.blockedReason)) }}</span>
                  <span v-else class="pr-muted">{{ t('pricingRules.suggestions.ruleVersion', { v: row.ruleVersion }) }}</span>
                  <EkStatusChip v-for="w in row.warnings" :key="w" tone="warning" :label="t(warningKey(w))" />
                </div>
              </template>
              <template #cell-actions="{ row }">
                <EkRowActions v-if="row.status === 'open'" :label="t('pricingRules.suggestions.rowActions', { barcode: row.barcode })" :items="[
                  { key: 'apply', action: 'approve', label: t('pricingRules.suggestions.applyOne'), disabled: !rules?.active || busy, onClick: () => openApply([row.id]) },
                  { key: 'dismiss', action: 'reject', label: t('pricingRules.suggestions.dismiss'), disabled: busy, onClick: () => dismiss([row.id]) },
                ]" />
              </template>
            </EkDataGrid>
            <div v-if="sugCursor" class="pr-more">
              <EkButton tone="ghost" icon="mdi-chevron-down" :loading="sugLoading" @click="loadSuggestions(true)">{{ t('pricingRules.suggestions.more') }}</EkButton>
            </div>
          </section>

          <!-- KURALLAR -->
          <section v-else-if="tab === 'rules'" class="pr-section" aria-labelledby="pr-rules-title" data-testid="rules-panel">
            <div class="pr-toolbar">
              <h2 id="pr-rules-title" class="pr-h2">{{ t('pricingRules.rules.listLabel') }}</h2>
              <div class="pr-toolbar__spacer" />
              <EkButton tone="primary" icon="mdi-plus" :disabled="banner === 'platform_off'" data-testid="add-rule" @click="openForm()">{{ t('pricingRules.rules.add') }}</EkButton>
            </div>
            <EkEmptyState v-if="!rules.rules.length" variant="no-data" class="pr-panel" :title="t('pricingRules.rules.emptyTitle')" :message="t('pricingRules.rules.emptyText')" />
            <ul v-else class="pr-rules" :aria-label="t('pricingRules.rules.listLabel')">
              <li v-for="r in rules.rules" :key="r.id" class="pr-panel pr-rule" :data-rule="r.id" :class="{ 'pr-rule--focus': r.id === focusRule }">
                <header class="pr-rule__head">
                  <h3 class="pr-rule__name">{{ r.name }}</h3>
                  <EkStatusChip :tone="r.pausedReason ? 'warning' : r.enabled ? 'success' : 'neutral'" dot
                    :label="r.pausedReason ? t('pricingRules.rules.paused') : r.enabled ? t('pricingRules.rules.on') : t('pricingRules.rules.off')" />
                  <span class="pr-muted ek-num">{{ t('pricingRules.rules.version', { v: r.version }) }}</span>
                  <div class="pr-toolbar__spacer" />
                  <EkRowActions :label="t('pricingRules.rules.actions', { name: r.name })" :items="[
                    { key: 'edit', action: 'edit', label: t('pricingRules.rules.edit'), onClick: () => openForm(r) },
                    { key: 'delete', action: 'delete', label: t('pricingRules.rules.delete'), onClick: () => askDelete(r) },
                  ]" />
                </header>
                <EkAlert v-if="r.pausedReason" tone="warning" dense :text="t(`pricingRules.pause.${r.pausedReason}`)" data-testid="rule-paused" />
                <dl class="pr-rule__grid">
                  <div><dt>{{ t('pricingRules.form.mode') }}</dt><dd>{{ r.competition.mode === 'below' ? t('pricingRules.rules.modeBelow') : t('pricingRules.rules.modeAbove') }}</dd></div>
                  <div><dt>{{ t('pricingRules.rules.delta') }}</dt><dd class="ek-num">{{ deltaText(r) }}</dd></div>
                  <div><dt>{{ t('pricingRules.rules.floor') }}</dt><dd>{{ t('pricingRules.rules.floorValue', { margin: formatNumber(r.competition.floorMarginPercent) }) }}</dd></div>
                  <div><dt>{{ t('pricingRules.rules.ceiling') }}</dt><dd class="ek-num">{{ formatMoney(r.competition.ceiling) }}</dd></div>
                  <div><dt>{{ t('pricingRules.rules.limits') }}</dt><dd class="ek-num">{{ t('pricingRules.rules.limitsValue', { changes: r.competition.maxChangesPerDay, cooldown: r.competition.cooldownMin, increase: formatNumber(r.competition.maxIncreasePercentPerDay) }) }}</dd></div>
                  <div><dt>{{ t('pricingRules.rules.scope') }}</dt><dd>{{ r.scope.barcodes.length ? t('pricingRules.rules.scopeBarcodes', { n: r.scope.barcodes.length }) : t('pricingRules.rules.scopeAll') }}</dd></div>
                </dl>
                <p class="pr-muted ek-num">{{ t('pricingRules.rules.open', { n: r.suggestions.open }) }} · {{ t('pricingRules.rules.blocked', { n: r.suggestions.blocked }) }}</p>
              </li>
            </ul>
          </section>

          <!-- FİYAT GEÇMİŞİ (denetim) -->
          <section v-else class="pr-panel pr-section" aria-labelledby="pr-hist-title" data-testid="history-panel">
            <h2 id="pr-hist-title" class="sr-only">{{ t('pricingRules.tabs.history') }}</h2>
            <EkDataGrid :columns="histColumns" :rows="histRows" row-key="id" label-key="barcode" :label="t('pricingRules.history.listLabel')"
              :loading="histLoading" :error="histError" :error-title="t('pricingRules.errors.load')"
              :empty-title="t('pricingRules.history.emptyTitle')" :empty-text="t('pricingRules.history.emptyText')" empty-icon="mdi-history" data-testid="history-grid">
              <template #cell-time="{ row }"><span class="ek-num">{{ formatDateTime(row.at) }}</span></template>
              <template #cell-change="{ row }"><span class="ek-num">{{ formatMoney(row.previousPrice) }} → {{ formatMoney(row.salePrice) }}</span></template>
              <template #cell-source="{ row }">
                <EkStatusChip :tone="row.source === 'external' ? 'warning' : 'info'" :label="t(`pricingRules.history.source.${row.source}`)" />
              </template>
              <template #cell-buybox="{ row }"><span class="ek-num">{{ formatMoney(row.buyboxPrice) }} · {{ formatDateTime(row.buyboxObservedAt) }}</span></template>
              <template #cell-rule="{ row }"><span class="ek-num">{{ row.ruleVersion ?? '—' }}</span></template>
            </EkDataGrid>
          </section>

          <p class="pr-legal" data-testid="legal-note">{{ t('pricingRules.legalNote') }}</p>
        </template>
      </div>
    </div>

    <!-- Açma: sorumluluk metni (TASLAK) + çift motor onayı -->
    <EkFormDialog v-model="consentOpen" :title="t('pricingRules.consent.title')" icon="mdi-file-sign" :submit-label="t('pricingRules.consent.submit')"
      :submit-disabled="!consentAccepted || !dualAck" :loading="busy" data-testid="consent-dialog" @submit="enable">
      <div v-if="rules" class="pr-consent">
        <EkStatusChip v-if="rules.consent.draft" tone="warning" icon="mdi-alert-circle-outline" :label="t('pricingRules.consent.draft')" data-testid="consent-draft" />
        <p class="pr-consent__text" data-testid="consent-text">{{ consentText }}</p>
        <p class="pr-muted ek-num">{{ t('pricingRules.consent.version', { version: rules.consent.version }) }}</p>
        <v-checkbox v-model="consentAccepted" density="compact" hide-details :label="t('pricingRules.consent.accept')" data-testid="consent-accept" />
        <p class="pr-muted">{{ dualEngineText }}</p>
        <v-checkbox v-model="dualAck" density="compact" hide-details :label="t('pricingRules.consent.dualEngine')" data-testid="dual-engine-ack" />
      </div>
    </EkFormDialog>

    <EkConfirmDialog v-model="disableOpen" :title="t('pricingRules.disableConfirm.title')" :description="t('pricingRules.disableConfirm.text')"
      :confirm-label="t('pricingRules.disableConfirm.confirm')" icon="mdi-power-off" :loading="busy" @confirm="disable" />

    <!-- Kural formu: TÜM sayısal alanlar boş başlar (K4) -->
    <EkFormDialog v-model="formOpen" :title="form.id ? t('pricingRules.form.titleEdit') : t('pricingRules.form.titleNew')" icon="mdi-tag-arrow-down-outline"
      :columns="2" width="lg" :submit-label="t('pricingRules.form.save')" :loading="busy" data-testid="rule-form" @submit="saveForm">
      <v-text-field v-model="form.name" :label="t('pricingRules.form.name')" density="compact" variant="outlined" maxlength="80"
        :error-messages="err('name')" data-testid="f-name" />
      <v-select v-model="form.mode" :items="modeItems" item-title="title" item-value="value" :label="t('pricingRules.form.mode')" density="compact" variant="outlined"
        :error-messages="err('mode')" data-testid="f-mode" />
      <v-text-field v-model.number="form.deltaAmount" type="number" min="0" step="0.01" :label="t('pricingRules.form.deltaAmount')" density="compact" variant="outlined"
        :error-messages="err('delta_required') || err('k1_equalize')" data-testid="f-delta-amount" />
      <v-text-field v-model.number="form.deltaPercent" type="number" min="0" step="0.1" :label="t('pricingRules.form.deltaPercent')" density="compact" variant="outlined"
        :hint="t('pricingRules.form.deltaHint')" persistent-hint data-testid="f-delta-percent" />
      <v-text-field v-model.number="form.floorMarginPercent" type="number" min="0" max="90" :label="t('pricingRules.form.floorMarginPercent')" density="compact" variant="outlined"
        :hint="t('pricingRules.form.floorHint')" persistent-hint :error-messages="err('floorMarginPercent')" data-testid="f-floor" />
      <v-text-field v-model.number="form.ceiling" type="number" min="0" step="0.01" :label="t('pricingRules.form.ceiling')" density="compact" variant="outlined"
        :error-messages="err('ceiling')" data-testid="f-ceiling" />
      <v-text-field v-model.number="form.step" type="number" min="0.01" step="0.01" :label="t('pricingRules.form.step')" density="compact" variant="outlined"
        :hint="t('pricingRules.form.stepHint')" persistent-hint :error-messages="err('step')" data-testid="f-step" />
      <v-text-field v-model.number="form.maxChangesPerDay" type="number" min="1" :max="limits.maxChangesPerDay" :label="t('pricingRules.form.maxChangesPerDay')" density="compact" variant="outlined"
        :error-messages="err('maxChangesPerDay')" data-testid="f-max-changes" />
      <v-text-field v-model.number="form.cooldownMin" type="number" :min="limits.minCooldownMin" :label="t('pricingRules.form.cooldownMin')" density="compact" variant="outlined"
        :error-messages="err('cooldownMin')" data-testid="f-cooldown" />
      <v-text-field v-model.number="form.maxIncreasePercentPerDay" type="number" min="0" :max="limits.maxIncreasePercentPerDay" :label="t('pricingRules.form.maxIncrease')" density="compact" variant="outlined"
        :hint="t('pricingRules.form.maxIncreaseHint', { max: limits.maxIncreasePercentPerDay, max30: limits.maxIncreasePercent30d })" persistent-hint
        :error-messages="err('maxIncreasePercentPerDay')" data-testid="f-max-increase" />
      <v-textarea v-model="form.barcodes" :label="t('pricingRules.form.barcodes')" :hint="t('pricingRules.form.barcodesHint')" persistent-hint rows="2" auto-grow
        density="compact" variant="outlined" class="pr-span-2" :error-messages="err('barcodes')" data-testid="f-barcodes" />
      <v-checkbox v-model="form.excludeIfOutOfStock" density="compact" hide-details :label="t('pricingRules.form.exclude')" data-testid="f-exclude" />
      <v-switch v-model="form.enabled" color="primary" density="compact" hide-details inset :label="t('pricingRules.form.enabled')" data-testid="f-enabled" />
      <EkAlert tone="info" dense class="pr-span-2" :text="`${t('pricingRules.form.valuesYours')} ${t('pricingRules.form.noSeller')}`" />
      <EkAlert v-if="saveError" tone="error" dense live class="pr-span-2" :text="saveError" data-testid="form-error" />
    </EkFormDialog>

    <EkConfirmDialog v-model="deleteState.open" danger icon="mdi-trash-can-outline" :title="t('pricingRules.rules.deleteTitle', { name: deleteState.name })"
      :description="t('pricingRules.rules.deleteText')" :confirm-label="t('pricingRules.rules.delete')" :loading="busy" @confirm="doDelete" />

    <!-- İNSAN ONAYI: önce → sonra önizlemesi; sunucu uygulamadan önce sigortayı yeniden çalıştırır -->
    <EkConfirmDialog v-model="applyState.open" :title="t('pricingRules.apply.title', { n: applyState.rows.length })" :description="t('pricingRules.apply.text')"
      :confirm-label="t('pricingRules.apply.confirm', { n: applyState.rows.length })" icon="mdi-check-decagram-outline" :loading="busy" data-testid="apply-dialog" @confirm="doApply">
      <EkDataGrid :columns="previewColumns" :rows="applyState.rows" row-key="id" label-key="barcode" :label="t('pricingRules.apply.previewLabel')" data-testid="apply-preview">
        <template #cell-product="{ row }"><span class="ek-num">{{ row.sku ?? row.barcode }}</span></template>
        <template #cell-before="{ row }"><span class="ek-num">{{ formatMoney(row.before) }}</span></template>
        <template #cell-after="{ row }"><span class="ek-num pr-strong">{{ formatMoney(row.after) }}</span></template>
        <template #cell-change="{ row }">
          <span class="ek-num" :class="row.change < 0 ? 'pr-down' : 'pr-up'">{{ formatMoney(row.change) }} ({{ formatNumber(row.changePercent) }}%)</span>
          <EkStatusChip v-for="w in row.warnings" :key="w" tone="warning" :label="t(warningKey(w))" />
        </template>
      </EkDataGrid>
    </EkConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { provideRefreshState } from '@entegrasyonik/ui/components/refreshState'
import {
  EkAlert, EkButton, EkConfirmDialog, EkDataGrid, EkEmptyState, EkErrorState, EkFormDialog, EkPageTabs, EkRowActions, EkSkeleton, EkStatusChip,
  type EkGridColumn,
} from '@entegrasyonik/ui/components'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { formatDateTime, formatMoney, formatNumber } from '@entegrasyonik/ui/format'
import EkPageHeader from '@/components/page/EkPageHeader.vue'
import {
  emptyRuleForm, formFromRule, previewRows, reasonKey, selectableIds, stateBanner, usePricingRulesApi, validateRuleForm, warningKey,
  type ApplyOutcome, type FormError, type HistoryEntry, type PreviewRow, type PriceRule, type RuleForm, type RulesState, type Suggestion, type SuggestionStatus,
} from '@/composables/usePricingRulesApi'

const props = defineProps<{ parameters?: any }>()
defineEmits(['clear'])

const { t, locale } = useI18n()
const api = usePricingRulesApi()
const { showToast } = useToast()

type Tab = 'suggestions' | 'rules' | 'history'
const TABS: Tab[] = ['suggestions', 'rules', 'history']
const initialTab = TABS.includes(props.parameters?.tab) ? (props.parameters.tab as Tab) : props.parameters?.rule ? 'rules' : 'suggestions'
const tab = ref<Tab>(initialTab)
const focusRule = ref<string | null>(typeof props.parameters?.rule === 'string' ? props.parameters.rule : null)

const state = ref<'loading' | 'ready' | 'error' | 'forbidden'>('loading')
provideRefreshState(() => ({ error: state.value === 'error' }))
const rules = ref<RulesState | null>(null)
const busy = ref(false)

const limits = computed(() => rules.value?.limits ?? { maxIncreasePercentPerDay: 10, maxIncreasePercent30d: 25, maxChangesPerDay: 24, minCooldownMin: 15, maxDropPercent: 50 })
const banner = computed(() => (rules.value ? stateBanner(rules.value) : 'needs_enable'))
const bannerTone = computed(() => ({ platform_off: 'neutral', competition_off: 'info', needs_enable: 'info', needs_consent: 'warning', active: 'success' } as const)[banner.value])
const bannerIcon = computed(() => ({ platform_off: 'mdi-pause-circle-outline', competition_off: 'mdi-information-outline', needs_enable: 'mdi-power', needs_consent: 'mdi-file-sign', active: 'mdi-check-circle-outline' } as const)[banner.value])
const isTr = computed(() => String(locale.value).startsWith('tr'))
const dualEngineText = computed(() => (rules.value ? (isTr.value ? rules.value.dualEngineWarning.tr : rules.value.dualEngineWarning.en) : ''))
const consentText = computed(() => (rules.value ? (isTr.value ? rules.value.consent.text.tr : rules.value.consent.text.en) : ''))

// ── Öneriler ──
const sugStatus = ref<SuggestionStatus>('open')
const lostOnly = ref(false)
const suggestions = ref<Suggestion[]>([])
const sugCursor = ref<string | null>(null)
const sugLoading = ref(false)
const sugError = ref(false)
const summary = ref({ open: 0, blocked: 0 })
const applyMax = ref(50)
const selected = ref<string[]>([])
const lastOutcome = ref<ApplyOutcome | null>(null)
const selectedOpen = computed(() => selectableIds(suggestions.value, selected.value, applyMax.value))

const tabs = computed(() => [
  { value: 'suggestions', label: t('pricingRules.tabs.suggestions'), icon: 'mdi-tag-arrow-down-outline', count: summary.value.open },
  { value: 'rules', label: t('pricingRules.tabs.rules'), icon: 'mdi-tune-variant', count: rules.value?.rules.length ?? null },
  { value: 'history', label: t('pricingRules.tabs.history'), icon: 'mdi-history' },
])
const statusItems = computed(() => (['open', 'blocked', 'applied', 'dismissed'] as const).map((v) => ({ value: v, title: t(`pricingRules.suggestions.${v}`) })))
const modeItems = computed(() => [{ value: 'below', title: t('pricingRules.rules.modeBelow') }, { value: 'above', title: t('pricingRules.rules.modeAbove') }])

const sugColumns = computed<EkGridColumn[]>(() => [
  { key: 'product', label: t('pricingRules.suggestions.col.product') },
  { key: 'current', label: t('pricingRules.suggestions.col.current'), align: 'end' },
  { key: 'suggested', label: t('pricingRules.suggestions.col.suggested'), align: 'end' },
  { key: 'buybox', label: t('pricingRules.suggestions.col.buybox'), align: 'end' },
  { key: 'profit', label: t('pricingRules.suggestions.col.profit'), align: 'end' },
  { key: 'bounds', label: t('pricingRules.suggestions.col.bounds'), align: 'end' },
  { key: 'lowest10d', label: t('pricingRules.suggestions.col.lowest10d'), align: 'end' },
  { key: 'reason', label: t('pricingRules.suggestions.col.reason'), wrap: true },
  { key: 'actions', label: t('pricingRules.suggestions.col.actions'), hideLabel: true, pin: 'end' },
])
const sugRows = computed(() => suggestions.value.map((s) => ({ ...s, lowest10d: s.lowestPrice10d })))
const previewColumns = computed<EkGridColumn[]>(() => [
  { key: 'product', label: t('pricingRules.apply.col.product') },
  { key: 'before', label: t('pricingRules.apply.col.before'), align: 'end' },
  { key: 'after', label: t('pricingRules.apply.col.after'), align: 'end' },
  { key: 'change', label: t('pricingRules.apply.col.change'), align: 'end' },
])

// ── Geçmiş ──
const history = ref<HistoryEntry[]>([])
const histLoading = ref(false)
const histError = ref(false)
const histRows = computed(() => history.value)
const histColumns = computed<EkGridColumn[]>(() => [
  { key: 'time', label: t('pricingRules.history.col.time') },
  { key: 'barcode', label: t('pricingRules.history.col.product'), type: 'id' },
  { key: 'change', label: t('pricingRules.history.col.change'), align: 'end' },
  { key: 'source', label: t('pricingRules.history.col.source') },
  { key: 'buybox', label: t('pricingRules.history.col.buybox'), align: 'end' },
  { key: 'rule', label: t('pricingRules.history.col.rule'), align: 'end' },
])

async function loadRules(): Promise<boolean> {
  const r = await api.getRules()
  if (!r.ok) { state.value = r.reason === 'unauthorized' ? 'forbidden' : 'error'; return false }
  rules.value = r.data
  state.value = 'ready'
  return true
}

async function loadSuggestions(more = false) {
  sugLoading.value = true
  sugError.value = false
  const r = await api.listSuggestions({ status: sugStatus.value, ...(lostOnly.value ? { buyboxLostOnly: true } : {}), limit: 50, ...(more && sugCursor.value ? { cursor: sugCursor.value } : {}) })
  sugLoading.value = false
  if (!r.ok) { sugError.value = true; return }
  suggestions.value = more ? [...suggestions.value, ...r.data.items] : r.data.items
  sugCursor.value = r.data.nextCursor
  summary.value = r.data.summary
  applyMax.value = r.data.applyMax
  if (!more) selected.value = []
}

async function loadHistory() {
  histLoading.value = true
  histError.value = false
  const r = await api.getHistory({ days: 30, limit: 100 })
  histLoading.value = false
  if (!r.ok) { histError.value = true; return }
  history.value = r.data.items
}

async function loadAll() {
  state.value = 'loading'
  if (!(await loadRules())) return
  await Promise.all([loadSuggestions(), tab.value === 'history' ? loadHistory() : Promise.resolve()])
}

watch([sugStatus, lostOnly], () => { lastOutcome.value = null; void loadSuggestions() })
watch(tab, (v) => { if (v === 'history') void loadHistory() })

function onSelect(keys: Array<string | number>) { selected.value = keys.map(String) }

// ── Açma / kapama (K3, K17, K19) ──
const consentOpen = ref(false)
const consentAccepted = ref(false)
const dualAck = ref(false)
const disableOpen = ref(false)
function openConsent() { consentAccepted.value = false; dualAck.value = !!rules.value?.settings.dualEngineAcknowledgedAt; consentOpen.value = true }

async function enable() {
  if (!rules.value) return
  busy.value = true
  const r = await api.setSettings({ enabled: true, consentVersion: rules.value.consent.version, dualEngineAcknowledged: dualAck.value })
  busy.value = false
  if (!r.ok) { showToast({ tone: 'error', message: r.reason === 'unauthorized' ? t('pricingRules.errors.forbidden') : t('pricingRules.errors.save') }); return }
  rules.value = r.data
  consentOpen.value = false
  void loadSuggestions()
}

async function disable() {
  busy.value = true
  const r = await api.setSettings({ enabled: false })
  busy.value = false
  disableOpen.value = false
  if (!r.ok) { showToast({ tone: 'error', message: r.reason === 'unauthorized' ? t('pricingRules.errors.forbidden') : t('pricingRules.errors.save') }); return }
  rules.value = r.data
  void loadSuggestions()
}

// ── Kural formu (K4: boş başlar) ──
const formOpen = ref(false)
const form = reactive<RuleForm>(emptyRuleForm())
const formErrors = ref<FormError[]>([])
const saveError = ref('')
const ERROR_PARAMS: Partial<Record<FormError, () => Record<string, unknown>>> = {
  maxChangesPerDay: () => ({ max: limits.value.maxChangesPerDay }),
  cooldownMin: () => ({ min: limits.value.minCooldownMin }),
  maxIncreasePercentPerDay: () => ({ max: limits.value.maxIncreasePercentPerDay }),
}
function err(k: FormError): string | undefined {
  return formErrors.value.includes(k) ? t(`pricingRules.errors.${k}`, ERROR_PARAMS[k]?.() ?? {}) : undefined
}
function openForm(r?: PriceRule) {
  Object.assign(form, r ? formFromRule(r) : { ...emptyRuleForm(), id: undefined })
  formErrors.value = []
  saveError.value = ''
  formOpen.value = true
}
async function saveForm() {
  formErrors.value = validateRuleForm(form, limits.value)
  if (formErrors.value.length) return
  busy.value = true
  const r = await api.saveRule(form)
  busy.value = false
  if (!r.ok) { saveError.value = r.reason === 'unauthorized' ? t('pricingRules.errors.forbidden') : t('pricingRules.errors.save'); return }
  formOpen.value = false
  await loadRules()
  void loadSuggestions()
}

const deleteState = reactive({ open: false, id: '', name: '' })
function askDelete(r: PriceRule) { Object.assign(deleteState, { open: true, id: r.id, name: r.name }) }
async function doDelete() {
  busy.value = true
  const r = await api.deleteRule(deleteState.id)
  busy.value = false
  deleteState.open = false
  if (!r.ok) { showToast({ tone: 'error', message: r.reason === 'unauthorized' ? t('pricingRules.errors.forbidden') : t('pricingRules.errors.save') }); return }
  await loadRules()
  void loadSuggestions()
}

function deltaText(r: PriceRule): string {
  const parts: string[] = []
  if (r.competition.deltaAmount !== null) parts.push(formatMoney(r.competition.deltaAmount))
  if (r.competition.deltaPercent !== null) parts.push(isTr.value ? `%${formatNumber(r.competition.deltaPercent)}` : `${formatNumber(r.competition.deltaPercent)}%`)
  return parts.join(' / ') || '—'
}

// ── İnsan onayı ──
const applyState = reactive<{ open: boolean; ids: string[]; rows: PreviewRow[] }>({ open: false, ids: [], rows: [] })
function openApply(ids: string[]) {
  const capped = selectableIds(suggestions.value, ids, applyMax.value)
  if (!capped.length) return
  applyState.ids = capped
  applyState.rows = previewRows(suggestions.value, capped)
  applyState.open = true
}
async function doApply() {
  busy.value = true
  const r = await api.apply(applyState.ids)
  busy.value = false
  applyState.open = false
  if (!r.ok) { showToast({ tone: 'error', message: r.reason === 'unauthorized' ? t('pricingRules.errors.forbidden') : t('pricingRules.apply.error') }); return }
  lastOutcome.value = r.data
  const applied = r.data.applied.length, rejected = r.data.rejected.length
  showToast({
    tone: applied && !rejected ? 'success' : applied ? 'warning' : 'error',
    message: applied && !rejected ? t('pricingRules.apply.done', { n: applied }) : applied ? t('pricingRules.apply.partial', { applied, rejected }) : t('pricingRules.apply.none'),
  })
  await loadSuggestions()
}

async function dismiss(ids: string[]) {
  if (!ids.length) return
  busy.value = true
  const r = await api.dismiss(ids)
  busy.value = false
  if (!r.ok) { showToast({ tone: 'error', message: r.reason === 'unauthorized' ? t('pricingRules.errors.forbidden') : t('pricingRules.errors.save') }); return }
  showToast({ tone: 'success', message: t('pricingRules.suggestions.dismissed', { n: r.data.dismissed }) })
  await loadSuggestions()
}

onMounted(loadAll)
</script>

<style scoped>
.prView { height: 100%; }
.pr-scroll { position: absolute; inset: 0; overflow-y: auto; background: var(--ek-color-app-bg); }
.pr-page { display: flex; flex-direction: column; gap: var(--ek-space-5); max-width: 1600px; margin: 0 auto; padding: var(--ek-space-6); }
.pr-panel { background: var(--ek-color-surface); border: 1px solid var(--ek-color-border-default); border-radius: var(--ek-radius-card); }
.pr-section { display: flex; flex-direction: column; gap: var(--ek-space-3); }
.pr-panel.pr-section { padding: var(--ek-space-4); }
.pr-band {
  display: flex; align-items: flex-start; gap: var(--ek-space-3); padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default); border-radius: var(--ek-radius-card); background: var(--ek-color-surface);
}
.pr-band--success { border-color: var(--ek-color-success-border); background: var(--ek-color-success-subtle); }
.pr-band--warning { border-color: var(--ek-color-warning-border); background: var(--ek-color-warning-subtle); }
.pr-band--info { border-color: var(--ek-color-info-border); background: var(--ek-color-info-subtle); }
.pr-band__icon { flex: none; margin-top: 2px; color: var(--ek-color-content-strong); }
.pr-band__body { display: flex; flex: 1; flex-direction: column; gap: var(--ek-space-1); min-width: 0; }
.pr-band__title { margin: 0; font-size: var(--ek-type-subheading-size); font-weight: var(--ek-font-weight-semibold); color: var(--ek-color-content-strong); }
.pr-band__text { margin: 0; color: var(--ek-color-content-default); font-size: var(--ek-type-body-size); }
.pr-band__muted { color: var(--ek-color-content-muted); font-size: var(--ek-type-label-size); }
.pr-band__actions { display: flex; flex-wrap: wrap; gap: var(--ek-space-2); }
.pr-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ek-space-3); }
.pr-toolbar__status { max-width: 220px; }
.pr-toolbar__spacer { flex: 1; }
.pr-h2 { margin: 0; font-size: var(--ek-type-subheading-size); font-weight: var(--ek-font-weight-semibold); color: var(--ek-color-content-strong); }
.pr-cell { display: flex; flex-direction: column; gap: 2px; }
.pr-reasons { flex-direction: row; flex-wrap: wrap; align-items: center; gap: var(--ek-space-1); }
.pr-strong { font-weight: var(--ek-font-weight-semibold); color: var(--ek-color-content-strong); }
.pr-muted { margin: 0; color: var(--ek-color-content-muted); font-size: var(--ek-type-label-size); }
.pr-down { color: var(--ek-color-success-emphasis); }
.pr-up { color: var(--ek-color-warning-emphasis); }
.pr-list { margin: 0; padding-left: var(--ek-space-4); }
.pr-more { display: flex; justify-content: center; }
.pr-rules { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: var(--ek-space-3); margin: 0; padding: 0; list-style: none; }
.pr-rule { display: flex; flex-direction: column; gap: var(--ek-space-3); padding: var(--ek-space-4); }
.pr-rule--focus { border-color: var(--ek-color-border-focus); }
.pr-rule__head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ek-space-2); }
.pr-rule__name { margin: 0; font-size: var(--ek-type-body-size); font-weight: var(--ek-font-weight-semibold); color: var(--ek-color-content-strong); }
.pr-rule__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ek-space-2) var(--ek-space-4); margin: 0; }
.pr-rule__grid dt { color: var(--ek-color-content-muted); font-size: var(--ek-type-label-size); }
.pr-rule__grid dd { margin: 0; color: var(--ek-color-content-default); font-size: var(--ek-type-body-size); }
.pr-consent { display: flex; flex-direction: column; gap: var(--ek-space-2); }
.pr-consent__text { margin: 0; padding: var(--ek-space-3); border: 1px solid var(--ek-color-border-default); border-radius: var(--ek-radius-control); background: var(--ek-color-surface-muted); color: var(--ek-color-content-default); font-size: var(--ek-type-body-size); }
.pr-span-2 { grid-column: 1 / -1; }
.pr-legal { margin: 0; color: var(--ek-color-content-muted); font-size: var(--ek-type-label-size); }
@media (max-width: 600px) {
  .pr-page { padding: var(--ek-space-4); }
  .pr-rules { grid-template-columns: minmax(0, 1fr); }
  .pr-rule__grid { grid-template-columns: minmax(0, 1fr); }
  .pr-band { flex-direction: column; }
}
</style>
