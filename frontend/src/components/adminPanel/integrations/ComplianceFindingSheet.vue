<!--
  frontend/src/components/adminPanel/integrations/ComplianceFindingSheet.vue

  ADR-0018 Karar 2 "Konsol" — bulgu detayı (`getDetail()`) + karar (`transition()`).
  Desen `PublishConfirmDialog.vue` (ADR-0020) ile AYNI: `EkDetailSheet` gövdesinde alanlar toplanır,
  `EkConfirmDialog` yalnızca son "emin misiniz" tıkını sağlar (`EkConfirmDialog`'un kendi gövdesinde
  serbest metin girişi YOK).

  Gizlilik: detay DTO'su `affectedTenants` (kimlik listesi) içerir ama bu ekran YALNIZCA SAYISINI
  gösterir (görev kapsamı: "etkilenen tenant SAYISI, PII yok"). Kanıt backend'de yazım anında
  redakte edilmiştir; burada yalnız `evidence`'ın bilinen alanları render edilir (ham gövde yok).

  Eylemler: `triage | accept | wontfix | false_positive | fixed`. `fixed` → `fixRef` ZORUNLU (FE önceden
  doğrular; backend yine tek doğruluk kaynağıdır). Diğerlerinde gerekçe opsiyonel.
-->
<template>
  <EkDetailSheet v-model="isOpen" :identity="identity">
    <template #status>
      <template v-if="current">
        <EkStatusChip :tone="FINDING_SEVERITY_TONE[current.severity].tone" :label="t(FINDING_SEVERITY_TONE[current.severity].labelKey)" />
        <EkStatusChip :tone="FINDING_STATUS_TONE[current.status].tone" :label="t(FINDING_STATUS_TONE[current.status].labelKey)" />
      </template>
    </template>

    <EkSkeleton v-if="detailState === 'loading'" type="detail" />
    <EkErrorState v-else-if="detailState === 'error'" size="inline" :message="t('integrationCompliance.detail.loadError')" @retry="loadDetail" />
    <template v-else-if="detail">
      <EkSection :title="t('integrationCompliance.detail.sections.overview')">
        <EkDescriptionList :items="overviewItems">
          <template #[subjectLabel]>
            <code class="compliance-sheet__code">{{ detail.subjectKey }}</code>
          </template>
          <template #[confirmedLabel]>
            <EkStatusChip :tone="detail.confirmed ? 'info' : 'neutral'" :label="t(detail.confirmed ? 'integrationCompliance.confirmed.yes' : 'integrationCompliance.confirmed.no')" />
          </template>
        </EkDescriptionList>
      </EkSection>

      <EkSection :title="t('integrationCompliance.detail.sections.impact')">
        <div class="compliance-sheet__impact">
          <span class="compliance-sheet__impact-value ek-num">{{ formatNumber(detail.affectedTenantsCount) }}</span>
          <span class="compliance-sheet__impact-label">{{ t('integrationCompliance.detail.impact.tenants') }}</span>
        </div>
        <p class="compliance-sheet__note">{{ t('integrationCompliance.detail.impact.tenantsNote') }}</p>
      </EkSection>

      <EkSection :title="t('integrationCompliance.detail.sections.evidence')" :description="t('integrationCompliance.detail.evidence.redactedNote')">
        <dl v-if="evidenceRows.length" class="compliance-sheet__evidence">
          <div v-for="row in evidenceRows" :key="row.key" class="compliance-sheet__evidence-row">
            <dt class="compliance-sheet__evidence-label">{{ t(`integrationCompliance.detail.evidence.${row.key}`) }}</dt>
            <dd class="compliance-sheet__evidence-value">
              <pre v-if="row.key === 'docDiff'" class="compliance-sheet__pre">{{ row.value }}</pre>
              <ul v-else-if="Array.isArray(row.value)" class="compliance-sheet__code-list">
                <li v-for="entry in row.value" :key="entry"><code class="compliance-sheet__code">{{ entry }}</code></li>
              </ul>
              <code v-else class="compliance-sheet__code">{{ row.value }}</code>
            </dd>
          </div>
        </dl>
        <p v-else class="compliance-sheet__note">{{ t('integrationCompliance.detail.evidence.none') }}</p>
      </EkSection>

      <EkSection :title="t('integrationCompliance.detail.sections.recommendation')">
        <p v-if="detail.recommendation" class="compliance-sheet__text">{{ detail.recommendation }}</p>
        <p v-else class="compliance-sheet__note">{{ t('integrationCompliance.detail.recommendationNone') }}</p>
      </EkSection>

      <EkSection :title="t('integrationCompliance.detail.sections.record')">
        <EkDescriptionList v-if="recordItems.length" :items="recordItems" />
        <p v-else class="compliance-sheet__note">{{ t('integrationCompliance.detail.recordNone') }}</p>
      </EkSection>

      <EkSection :title="t('integrationCompliance.detail.sections.decision')" :description="t('integrationCompliance.decision.description')">
        <form class="compliance-sheet__form" novalidate @submit.prevent="onSubmit">
          <v-radio-group v-model="form.action" :label="t('integrationCompliance.decision.actionLabel')" :error-messages="errorText('action')" class="compliance-sheet__actions">
            <v-radio v-for="action in actions" :key="action" :value="action">
              <template #label>
                <span class="compliance-sheet__radio-label">
                  <span class="compliance-sheet__radio-title">{{ t(`integrationCompliance.decision.actions.${action}`) }}</span>
                  <span class="compliance-sheet__radio-hint">{{ t(`integrationCompliance.decision.hints.${action}`) }}</span>
                </span>
              </template>
            </v-radio>
          </v-radio-group>

          <template v-if="form.action === 'fixed'">
            <v-text-field
              v-model="form.fixRef"
              :label="t('integrationCompliance.decision.fixRef')"
              :hint="t('integrationCompliance.decision.fixRefHint')"
              persistent-hint
              aria-required="true"
              :counter="TRANSITION_LIMITS.fixRef"
              :error-messages="errorText('fixRef')"
            />
            <v-text-field
              v-model="form.fixedInAdapterVersion"
              :label="t('integrationCompliance.decision.fixedInAdapterVersion')"
              :counter="TRANSITION_LIMITS.fixedInAdapterVersion"
              :error-messages="errorText('fixedInAdapterVersion')"
            />
          </template>

          <v-textarea
            v-model="form.reason"
            :label="t('integrationCompliance.decision.reason')"
            rows="2"
            auto-grow
            :counter="TRANSITION_LIMITS.reason"
            :error-messages="errorText('reason')"
          />

          <p v-if="submitError" class="compliance-sheet__submit-error" role="alert">{{ submitError }}</p>

          <div class="compliance-sheet__form-bar">
            <v-btn type="submit" color="primary" prepend-icon="mdi-check" :disabled="!form.action" :loading="submitting">
              {{ t('integrationCompliance.decision.submit') }}
            </v-btn>
          </div>
        </form>
      </EkSection>
    </template>
  </EkDetailSheet>

  <EkConfirmDialog
    v-model="confirmOpen"
    :title="confirmTitle"
    :description="confirmDescription"
    :confirm-label="t('integrationCompliance.decision.submit')"
    :loading="submitting"
    @confirm="doTransition"
  />
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EkDetailSheet from '@/components/ds/EkDetailSheet.vue'
import EkSection from '@/components/ds/EkSection.vue'
import EkDescriptionList, { type EkDescriptionListItem } from '@/components/ds/EkDescriptionList.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkSkeleton from '@/components/ds/EkSkeleton.vue'
import EkErrorState from '@/components/ds/EkErrorState.vue'
import EkConfirmDialog from '@/components/ds/EkConfirmDialog.vue'
import { FINDING_SEVERITY_TONE, FINDING_STATUS_TONE } from '@/design/status-map'
import { formatDateTime, formatNumber } from '@/composables/format'
import { useToast } from '@/composables/useToast'
import {
  CLOSED_STATUSES, STATUS_BY_ACTION, TRANSITION_LIMITS,
  availableActions, isErrorShapedResponse, serverErrorMessage, useIntegrationComplianceApi, validateTransition,
  type FindingDetail, type FindingListItem, type TransitionAction,
} from './useIntegrationComplianceApi'

const props = defineProps<{
  modelValue: boolean
  finding: FindingListItem | null
  integrationName: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  updated: [detail: FindingDetail]
}>()

const { t, te } = useI18n()
const api = useIntegrationComplianceApi()
const { showToast } = useToast()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const detail = ref<FindingDetail | null>(null)
const detailState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
/** Başlık rozetleri: detay gelene kadar liste satırındaki değer, sonra detay (geçiş sonrası da güncel). */
const current = computed(() => detail.value ?? props.finding)

type FieldKey = 'action' | 'reason' | 'fixRef' | 'fixedInAdapterVersion'
const form = reactive<{ action: TransitionAction | null; reason: string; fixRef: string; fixedInAdapterVersion: string }>({
  action: null, reason: '', fixRef: '', fixedInAdapterVersion: '',
})
const errors = ref<Partial<Record<FieldKey, string>>>({})
const submitError = ref('')
const submitting = ref(false)
const confirmOpen = ref(false)

function resetForm() {
  form.action = null
  form.reason = ''
  form.fixRef = ''
  form.fixedInAdapterVersion = ''
  errors.value = {}
  submitError.value = ''
}

function kindLabel(kind: string) {
  const key = `integrationCompliance.kind.${kind}`
  return te(key) ? t(key) : kind
}
function sourceLabel(source: string) {
  const key = `integrationCompliance.source.${source}`
  return te(key) ? t(key) : source
}
function categoryLabel(code: string) {
  const key = `integrationCompliance.category.${code}`
  return te(key) ? t(key) : code
}

const identity = computed(() => current.value
  ? t('integrationCompliance.detail.identity', { integration: props.integrationName, kind: kindLabel(current.value.kind) })
  : '')

async function loadDetail() {
  if (!props.finding) return
  const id = props.finding.dedupKey
  detailState.value = 'loading'
  const res: any = await api.getDetail(id)
  if (props.finding?.dedupKey !== id) return // bu arada başka bir bulgu açıldıysa eski yanıt yok sayılır
  if (res && typeof res === 'object' && !isErrorShapedResponse(res) && res.dedupKey === id) {
    detail.value = res as FindingDetail
    detailState.value = 'ready'
  } else {
    detailState.value = 'error'
  }
}

watch(() => [props.modelValue, props.finding?.dedupKey] as const, ([open, id], old) => {
  if (!open || !id) return
  if (old && old[0] && old[1] === id && detail.value) return
  detail.value = null
  resetForm()
  void loadDetail()
}, { immediate: true })

// Eylem değişince önceki doğrulama hataları temizlenir (fixRef hatası başka eylemde anlamsız).
watch(() => form.action, () => { errors.value = {}; submitError.value = '' })

const actions = computed(() => (current.value ? availableActions(current.value.status) : []))

// `EkDescriptionList` değer slot'u etiket adıyla adlandırılır.
const subjectLabel = computed(() => t('integrationCompliance.detail.fields.subjectKey'))
const confirmedLabel = computed(() => t('integrationCompliance.detail.fields.confirmed'))

const overviewItems = computed<EkDescriptionListItem[]>(() => {
  const d = detail.value
  if (!d) return []
  return [
    { label: subjectLabel.value, value: d.subjectKey },
    { label: t('integrationCompliance.detail.fields.kind'), value: kindLabel(d.kind) },
    { label: t('integrationCompliance.detail.fields.source'), value: sourceLabel(d.source) },
    { label: t('integrationCompliance.detail.fields.category'), value: categoryLabel(d.category) },
    { label: confirmedLabel.value, value: '' },
    { label: t('integrationCompliance.detail.fields.occurrences'), value: formatNumber(d.occurrences) },
    { label: t('integrationCompliance.detail.fields.firstSeen'), value: formatDateTime(d.firstSeenAt) },
    { label: t('integrationCompliance.detail.fields.lastSeen'), value: formatDateTime(d.lastSeenAt) },
    { label: t('integrationCompliance.detail.fields.adapterVersionSeen'), value: d.adapterVersionSeen || '—' },
  ]
})

const recordItems = computed<EkDescriptionListItem[]>(() => {
  const d = detail.value
  if (!d) return []
  const rows: EkDescriptionListItem[] = []
  if (d.decidedBy) rows.push({ label: t('integrationCompliance.detail.fields.decidedBy'), value: d.decidedBy })
  if (d.decidedAt) rows.push({ label: t('integrationCompliance.detail.fields.decidedAt'), value: formatDateTime(d.decidedAt) })
  if (d.notes) rows.push({ label: t('integrationCompliance.detail.fields.notes'), value: d.notes })
  if (d.fixRef) rows.push({ label: t('integrationCompliance.detail.fields.fixRef'), value: d.fixRef })
  if (d.fixedInAdapterVersion) rows.push({ label: t('integrationCompliance.detail.fields.fixedInAdapterVersion'), value: d.fixedInAdapterVersion })
  if (d.closedAt) rows.push({ label: t('integrationCompliance.detail.fields.closedAt'), value: formatDateTime(d.closedAt) })
  return rows
})

/** Yalnız `evidence`'ın BİLİNEN (redakte) alanları, dolu olanlar, sabit sırayla. Bilinmeyen anahtar render EDİLMEZ. */
const EVIDENCE_KEYS = ['httpStatus', 'enumValue', 'paths', 'types', 'headerNames', 'sunsetAt', 'fingerprint', 'docDiff'] as const
const evidenceRows = computed(() => {
  const ev = detail.value?.evidence
  if (!ev) return []
  const rows: { key: typeof EVIDENCE_KEYS[number]; value: string | string[] }[] = []
  for (const key of EVIDENCE_KEYS) {
    const raw = (ev as Record<string, unknown>)[key]
    if (raw === undefined || raw === null || raw === '') continue
    if (Array.isArray(raw)) {
      const list = raw.filter((x) => typeof x === 'string' && x)
      if (list.length) rows.push({ key, value: list as string[] })
    } else if (key === 'sunsetAt') {
      rows.push({ key, value: formatDateTime(String(raw)) === '—' ? String(raw) : formatDateTime(String(raw)) })
    } else {
      rows.push({ key, value: String(raw) })
    }
  }
  return rows
})

function errorText(field: FieldKey) {
  const key = errors.value[field]
  return key ? [t(key)] : []
}

function onSubmit() {
  const result = validateTransition({ action: form.action ?? undefined, reason: form.reason, fixRef: form.fixRef, fixedInAdapterVersion: form.fixedInAdapterVersion })
  errors.value = result ?? {}
  submitError.value = ''
  if (result) return
  confirmOpen.value = true
}

const confirmTitle = computed(() => form.action
  ? t('integrationCompliance.decision.confirm.title', { action: t(`integrationCompliance.decision.actions.${form.action}`) })
  : '')

const confirmDescription = computed(() => {
  if (!form.action || !current.value) return ''
  const parts = [t('integrationCompliance.decision.confirm.description', { integration: props.integrationName, subject: current.value.subjectKey })]
  const target = STATUS_BY_ACTION[form.action]
  if (CLOSED_STATUSES.includes(target)) parts.push(t('integrationCompliance.decision.confirm.closes'))
  if (target === 'fixed') parts.push(t('integrationCompliance.decision.confirm.regression'))
  return parts.join(' ')
})

async function doTransition() {
  if (!form.action || !current.value) return
  const id = current.value.dedupKey
  const action = form.action
  submitting.value = true
  const res: any = await api.transition(id, {
    action, reason: form.reason, fixRef: form.fixRef, fixedInAdapterVersion: form.fixedInAdapterVersion,
  })
  submitting.value = false
  confirmOpen.value = false
  if (res && typeof res === 'object' && !isErrorShapedResponse(res) && res.dedupKey === id) {
    detail.value = res as FindingDetail
    detailState.value = 'ready'
    resetForm()
    emit('updated', res as FindingDetail)
    showToast({ tone: 'success', message: t('integrationCompliance.decision.success', { status: t(FINDING_STATUS_TONE[STATUS_BY_ACTION[action]].labelKey) }) })
  } else {
    submitError.value = isErrorShapedResponse(res)
      ? serverErrorMessage(res, t('integrationCompliance.decision.errors.failed'))
      : t('integrationCompliance.decision.errors.failed')
  }
}
</script>

<style scoped>
.compliance-sheet__code {
  font-family: var(--ek-font-mono);
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-strong);
  background: var(--ek-color-surface-sunken);
  border-radius: var(--ek-radius-md);
  padding: 1px var(--ek-space-1);
  word-break: break-all;
}

.compliance-sheet__code-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}

.compliance-sheet__pre {
  font-family: var(--ek-font-mono);
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-strong);
  background: var(--ek-color-surface-sunken);
  border-radius: var(--ek-radius-md);
  padding: var(--ek-space-3);
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow: auto;
}

.compliance-sheet__evidence {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  margin: 0;
}

.compliance-sheet__evidence-row {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: var(--ek-space-2);
  align-items: baseline;
}

@media (max-width: 767px) {
  .compliance-sheet__evidence-row {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-1);
  }
}

.compliance-sheet__evidence-label {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}

.compliance-sheet__evidence-value {
  margin: 0;
  min-width: 0;
}

.compliance-sheet__impact {
  display: flex;
  align-items: baseline;
  gap: var(--ek-space-2);
}

.compliance-sheet__impact-value {
  font-size: var(--ek-font-size-2xl);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.compliance-sheet__impact-label {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
}

.compliance-sheet__note {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
  margin: 0;
}

.compliance-sheet__text {
  font-size: var(--ek-font-size-md);
  color: var(--ek-color-content-default);
  margin: 0;
  white-space: pre-line;
}

.compliance-sheet__form {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

/* Vuetify boş alan etiketi `--v-medium-emphasis-opacity` ile soluklaşıyor (beyaz zeminde 4,29:1, AA altı —
 * axe). DS katmanına (vuetify-overrides.css) DOKUNULMADAN yalnız bu formda token rengine çekilir. */
.compliance-sheet__form :deep(.v-label),
.compliance-sheet__form :deep(.v-counter),
.compliance-sheet__form :deep(.v-messages) {
  opacity: 1;
  color: var(--ek-color-content-muted);
}

.compliance-sheet__radio-label {
  display: flex;
  flex-direction: column;
  padding: var(--ek-space-1) 0;
}

.compliance-sheet__radio-title {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
}

.compliance-sheet__radio-hint {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

.compliance-sheet__submit-error {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-error);
  margin: 0;
}

.compliance-sheet__form-bar {
  display: flex;
  justify-content: flex-end;
}
</style>
