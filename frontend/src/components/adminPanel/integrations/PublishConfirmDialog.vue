<!--
  frontend/src/components/adminPanel/integrations/PublishConfirmDialog.vue

  ADR-0020 Karar 3.2/4.1 "Yayın diyaloğu" — `EkDetailSheet` (fark tablosu + etki özeti + gerekçe +
  yazılı onay) + `EkConfirmDialog` (son "emin misiniz" tık, `dangerous` için yıkıcı görünüm). Onay
  kapısı backend `assertApprovalSatisfied` ile BİREBİR AYNI kurallar: `safe` → tek tık; `caution` →
  gerekçe ≥15 karakter; `dangerous` → gerekçe + hedef kodunu YAZARAK onay (`EkConfirmDialog`'un kendi
  gövdesinde serbest metin girişi YOK — bu yüzden gerekçe/yazılı onay alanları BU sayfada, sheet
  içinde toplanır; `EkConfirmDialog` yalnızca son tıkı sağlar).
-->
<template>
  <EkDetailSheet v-model="isOpen" :identity="sheetIdentity">
    <template #status>
      <EkStatusChip v-if="dangerEntry" :tone="dangerEntry.tone" :label="dangerLabel" />
    </template>
    <template #actions>
      <v-btn
        color="primary"
        :disabled="!canSubmit"
        :loading="loading"
        @click="onPublishClick"
      >
        Yayınla
      </v-btn>
    </template>

    <EkSection title="Fark">
      <EkDataTable
        v-if="diff.length"
        :items="diffRows"
        :columns="diffColumns"
        row-key="key"
        aria-label="Yayınlanacak ayar farkları"
      >
        <template #cell-danger="{ item }">
          <EkStatusChip v-if="item.dangerEntry" :tone="item.dangerEntry.tone" :label="item.dangerLabel" />
          <span v-else class="publish-confirm-dialog__muted">—</span>
        </template>
      </EkDataTable>
      <EkEmptyState v-else variant="no-data" title="Fark yok" message="Taslakta yayınlanacak bir değişiklik bulunamadı." />
    </EkSection>

    <EkSection title="Etki özeti">
      <EkDescriptionList :items="impactItems" />
    </EkSection>

    <EkSection v-if="requiresReason" title="Gerekçe">
      <v-textarea
        v-model="reason"
        label="Bu değişikliğin gerekçesi"
        hint="En az 15 karakter. Kişisel veri (ad, telefon, e-posta) yazmayın."
        persistent-hint
        counter="500"
        maxlength="500"
        rows="3"
        :disabled="loading"
      />
    </EkSection>

    <EkSection v-if="requiresTypedApproval" title="Yazılı onay">
      <p class="publish-confirm-dialog__typed-hint">
        Tehlikeli bir değişiklik yayınlıyorsunuz. Onaylamak için hedef kodunu birebir yazın: <code>{{ target }}</code>
      </p>
      <v-text-field
        v-model="typedConfirmation"
        :label="`Hedef kodu: ${target}`"
        :disabled="loading"
      />
    </EkSection>

    <p v-if="errorMessage" class="publish-confirm-dialog__error" role="alert">{{ errorMessage }}</p>
  </EkDetailSheet>

  <EkConfirmDialog
    v-model="showFinalConfirm"
    :title="finalConfirmTitle"
    :description="finalConfirmDescription"
    confirm-label="Yayınla"
    :danger="danger === 'dangerous'"
    :loading="loading"
    @confirm="onFinalConfirm"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EkDetailSheet, EkSection, EkStatusChip, EkDataTable, type EkTableColumn, EkDescriptionList, type EkDescriptionListItem, EkEmptyState, EkConfirmDialog } from '@entegrasyonik/ui/components'
import { SETTING_DANGER_TONE } from '@/design/status-map'
import { getSettingMeta } from './settingsCatalogMirror'
import { formatNumber } from '@entegrasyonik/ui/format'

export interface PublishDiffEntry {
  key: string
  from?: unknown
  to?: unknown
  danger: 'safe' | 'caution' | 'dangerous'
}

export interface PublishImpact {
  activeTenants: number
  approximate: boolean
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    target: string
    targetLabel: string
    diff: PublishDiffEntry[]
    impact?: PublishImpact | null
    restartCount?: number
    danger?: 'safe' | 'caution' | 'dangerous'
    requiresReason?: boolean
    requiresTypedApproval?: boolean
    loading?: boolean
    errorMessage?: string | null
    /** "Bu sürüme dön" akışında gerekçe önceden dolu gelebilir (ADR Karar 3.4). */
    initialReason?: string
  }>(),
  {
    diff: () => [],
    impact: null,
    restartCount: 0,
    danger: 'safe',
    requiresReason: false,
    requiresTypedApproval: false,
    loading: false,
    errorMessage: null,
    initialReason: '',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [payload: { reason: string; typedConfirmation: string }]
}>()

const isOpen = computed({ get: () => props.modelValue, set: (v: boolean) => emit('update:modelValue', v) })
const sheetIdentity = computed(() => `${props.targetLabel} — Yayın önizlemesi`)

const reason = ref(props.initialReason)
const typedConfirmation = ref('')
const showFinalConfirm = ref(false)

watch(() => props.modelValue, (open) => {
  if (open) {
    reason.value = props.initialReason
    typedConfirmation.value = ''
    showFinalConfirm.value = false
  }
})

const dangerEntry = computed(() => SETTING_DANGER_TONE[props.danger])
const dangerLabel = computed(() => (props.danger === 'dangerous' ? 'Tehlikeli' : props.danger === 'caution' ? 'Dikkat' : 'Güvenli'))

function humanValue(v: unknown): string {
  if (v === undefined) return '(yok)'
  if (v === null) return '—'
  if (typeof v === 'boolean') return v ? 'Açık' : 'Kapalı'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(boş liste)'
  return String(v)
}

const diffColumns: EkTableColumn[] = [
  { key: 'label', label: 'Ayar' },
  { key: 'from', label: 'Eski' },
  { key: 'to', label: 'Yeni' },
  { key: 'danger', label: 'Tehlike' },
]

const diffRows = computed(() =>
  props.diff.map((d) => {
    const meta = getSettingMeta(d.key)
    const entry = SETTING_DANGER_TONE[d.danger]
    return {
      key: d.key,
      label: meta ? meta.label.tr : d.key,
      from: humanValue(d.from),
      to: humanValue(d.to),
      dangerEntry: entry,
      dangerLabel: d.danger === 'dangerous' ? 'Tehlikeli' : d.danger === 'caution' ? 'Dikkat' : 'Güvenli',
    }
  }),
)

const impactItems = computed<EkDescriptionListItem[]>(() => {
  const items: EkDescriptionListItem[] = []
  if (props.impact) {
    const tenantLabel = `${props.impact.approximate ? '~' : ''}${formatNumber(props.impact.activeTenants)}`
    items.push({ label: 'Etkilenen aktif mağaza', value: tenantLabel })
  }
  items.push({ label: 'Yeniden başlatma gereken ayar sayısı', value: props.restartCount ?? 0 })
  items.push({ label: 'Değişen anahtar sayısı', value: props.diff.length })
  return items
})

const canSubmit = computed(() => {
  if (props.diff.length === 0) return false
  if (props.requiresReason && reason.value.trim().length < 15) return false
  if (props.requiresTypedApproval && typedConfirmation.value.trim() !== props.target) return false
  return true
})

function onPublishClick() {
  if (!canSubmit.value) return
  if (props.danger === 'safe') {
    emit('confirm', { reason: reason.value.trim(), typedConfirmation: typedConfirmation.value.trim() })
    return
  }
  showFinalConfirm.value = true
}

const finalConfirmTitle = computed(() => `'${props.targetLabel}' için bu değişiklikler yayınlansın mı?`)
const finalConfirmDescription = computed(() => {
  const restartNote = props.restartCount ? ` ${props.restartCount} ayar yeniden başlatma gerektirir.` : ''
  return `${props.diff.length} ayar değişecek.${restartNote} Bu işlem denetim kaydına yazılır ve geri alınabilir.`
})

function onFinalConfirm() {
  emit('confirm', { reason: reason.value.trim(), typedConfirmation: typedConfirmation.value.trim() })
}
</script>

<style scoped>
.publish-confirm-dialog__muted {
  color: var(--ek-color-content-muted);
}

.publish-confirm-dialog__typed-hint {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
  margin: 0 0 var(--ek-space-2) 0;
}

.publish-confirm-dialog__error {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-error);
  margin: 0;
}
</style>
