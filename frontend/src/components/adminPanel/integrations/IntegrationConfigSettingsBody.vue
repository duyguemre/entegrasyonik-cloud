<!--
  frontend/src/components/adminPanel/integrations/IntegrationConfigSettingsBody.vue

  ADR-0020 Karar 4.1 ("Entegrasyon ayarları" + "Motor ayarları" — İKİSİ de `EkSettingsTemplate`) +
  Karar 4.2 (`SettingField`) + Karar 4.3 (arama/filtre/gelişmiş) + Karar 3.2 (taslak→fark→onay→yayın).
  `IntegrationSettingsView`/`EngineSettingsView` bu gövdeyi `target`/`mode` ile parametreleyip sarar
  (ikisi arasındaki TEK fark hangi bölümlerin göründüğü ve `target` değeridir — "tek iş = tek desen").

  BİLİNÇLİ SINIRLAMALAR (rapora yazıldı, backend sözleşmesi eksikleri):
  - "Uç noktalar"/"Kapsam beyanı"/"Uyum bulguları" bölümleri: hiçbir RPC bu veriyi DÖNDÜRMÜYOR
    (`getIntegrationDescriptor`/ADR-0018 `FindingService` FE'ye açık değil) — dürüst boş durum gösterilir.
  - "Bu sürüme dön" (rollback): `history()` yanıtı geçmiş revizyonun `overrides` GÖVDESİNİ taşımıyor
    (yalnızca `diff`/meta) — bu yüzden yayın-öncesi fark ÖNİZLEMESİ YAPILAMAZ. Rollback her zaman
    "dangerous" gibi ele alınır (gerekçe + yazılı onay ZORUNLU) — bu, backend'in gerçek onay kapısının
    olası bir ÜST KÜMESİDİR (safe/caution durumunu da geçer), veri kaybı/yanlış onaya YOL AÇMAZ.
  - Arama, bölüm içindeki alanları FİLTRELER (Karar 4.3 "bölüme atlar ve vurgular" — kaydırma/vurgu
    animasyonu bu sürümde YOK, basit filtre yeterli görüldü).
-->
<template>
  <EkSettingsTemplate
    section="Yönetim"
    :trail="trail"
    :title="targetLabel"
    :description="mode === 'engine' ? 'Tüm entegrasyonlar için geçerli motor parametreleri.' : 'Bu entegrasyona özgü ayarlar.'"
    :dirty="isDirty"
    :saving="!!savingKey"
    :unsaved-hint="unsavedHint"
    @discard="onDiscard"
    @save="onOpenPublish"
  >
    <EkSkeleton v-if="effectiveState === 'loading'" type="form" />
    <EkErrorState v-else-if="effectiveState === 'error'" :message="effectiveError" @retry="loadEffective" />
    <template v-else>
      <div class="settings-body__toolbar">
        <v-text-field
          v-model="searchQuery"
          hide-details
          clearable
          prepend-inner-icon="mdi-magnify"
          label="Ayarlarda ara (etiket, anahtar, açıklama)"
          class="settings-body__search"
        />
        <div class="settings-body__chips">
          <v-btn size="small" class="text-none" :variant="filterChip === 'changed' ? 'flat' : 'outlined'" :color="filterChip === 'changed' ? 'primary' : undefined" @click="toggleFilter('changed')">Yalnız değiştirilmişler</v-btn>
          <v-btn size="small" class="text-none" :variant="filterChip === 'dangerous' ? 'flat' : 'outlined'" :color="filterChip === 'dangerous' ? 'primary' : undefined" @click="toggleFilter('dangerous')">Yalnız tehlikeliler</v-btn>
          <v-btn size="small" class="text-none" :variant="filterChip === 'draft' ? 'flat' : 'outlined'" :color="filterChip === 'draft' ? 'primary' : undefined" @click="toggleFilter('draft')">Taslaktaki değişiklikler</v-btn>
        </div>
      </div>

      <p v-if="conflictMessage" class="settings-body__conflict" role="alert">
        {{ conflictMessage }}
        <button type="button" class="settings-body__conflict-retry" @click="reloadAfterConflict">Farkı yeniden gözden geçir</button>
      </p>

      <EkSettingsSection v-if="mode === 'integration'" title="Genel" description="Bu entegrasyonun temel kimlik bilgileri (koddan gelir, salt-okunur).">
        <EkSkeleton v-if="generalState === 'loading'" type="form" :rows="2" />
        <EkDescriptionList v-else-if="listRow" :items="generalItems" />
        <EkEmptyState v-else variant="no-data" title="Genel bilgi yüklenemedi" message="Entegrasyon kaydı bulunamadı." />
      </EkSettingsSection>

      <EkSettingsSection v-if="mode === 'integration'" title="Uç noktalar" description="Uç nokta host seçimi ve yol şablonları.">
        <EkEmptyState variant="not-connected" title="Bu bölüm bu sürümde bağlı değil" message="Uç nokta host/yol verisi hiçbir yönetim ucundan dönmüyor (ADR-0020 Aşama B kapsamı dışı kaldı)." />
      </EkSettingsSection>

      <template v-for="entry in visibleGroups" :key="entry.group">
        <EkSettingsSection :title="GROUP_LABELS[entry.group]" :description="GROUP_DESCRIPTIONS[entry.group]">
          <EkEmptyState v-if="entry.settings.length === 0" variant="no-data" title="Bu bölümde henüz yönetilebilir bir ayar yok" message="Katalog bu grup için henüz bir ayar taşımıyor." />
          <template v-else>
            <SettingField
              v-for="s in entry.visibleBasic"
              :key="s.key"
              :meta="s"
              :model-value="currentValue(s.key)"
              :effective-value="resolvedFor(s.key).value"
              :effective-source="resolvedFor(s.key).source"
              :effective-revision="resolvedFor(s.key).revision"
              :default-value="defaultFor(s)"
              :is-overridden="isOverridden(s.key)"
              @update:model-value="(v) => saveField(s.key, v)"
              @reset="resetField(s.key)"
            />
            <button v-if="entry.advancedCount > 0" type="button" class="settings-body__advanced-toggle" @click="toggleAdvanced(entry.group)">
              {{ isAdvancedOpen(entry.group) ? 'Gelişmiş ayarları gizle' : `Gelişmiş ayarları göster (${entry.advancedCount})` }}
            </button>
            <SettingField
              v-for="s in entry.visibleAdvanced"
              :key="s.key"
              :meta="s"
              :model-value="currentValue(s.key)"
              :effective-value="resolvedFor(s.key).value"
              :effective-source="resolvedFor(s.key).source"
              :effective-revision="resolvedFor(s.key).revision"
              :default-value="defaultFor(s)"
              :is-overridden="isOverridden(s.key)"
              @update:model-value="(v) => saveField(s.key, v)"
              @reset="resetField(s.key)"
            />
          </template>
        </EkSettingsSection>
      </template>

      <EkSettingsSection v-if="mode === 'integration'" title="Kapsam beyanı" description="Bu entegrasyonun bildirdiği yetenekler.">
        <EkEmptyState variant="not-connected" title="Bu bölüm bu sürümde bağlı değil" message="Kapsam/yetenek çipleri ADR-0018 manifestosundan gelir; bu görevde bağlanmadı." />
      </EkSettingsSection>

      <EkSettingsSection title="Sürüm geçmişi" description="Yayınlanan her sürüm, kim tarafından ve neden yayınlandığı.">
        <EkSkeleton v-if="historyState === 'loading'" type="table" :rows="3" />
        <EkErrorState v-else-if="historyState === 'error'" size="inline" message="Sürüm geçmişi yüklenemedi — bağlantınızı kontrol edip tekrar deneyin." @retry="loadHistory" />
        <EkEmptyState v-else-if="!history.length" variant="no-data" title="Henüz hiçbir ayar değiştirilmedi" message="Tüm değerler varsayılan." />
        <EkDataTable v-else :items="history" :columns="historyColumns" row-key="version">
          <template #cell-status="{ item }">
            <EkStatusChip :tone="CONFIG_REVISION_STATUS_TONE[item.status as ConfigRevisionStatus].tone" :label="revisionStatusLabel(item.status)" />
          </template>
          <template #cell-actions="{ item }">
            <v-btn v-if="item.status !== 'draft'" size="small" variant="text" @click="openRollback(item.version)">Bu sürüme dön</v-btn>
          </template>
        </EkDataTable>

        <div v-if="rollbackTarget !== null" class="settings-body__rollback">
          <p class="settings-body__rollback-title">Sürüm {{ rollbackTarget }}'e dönülecek</p>
          <p class="settings-body__rollback-note">Bu, seçilen sürümün ayar görüntüsünü YENİ bir sürüm olarak yayınlar (geçmiş silinmez). Gerekçe ve hedef kodu onayı zorunludur.</p>
          <v-textarea v-model="rollbackReason" label="Gerekçe" rows="2" counter="500" maxlength="500" />
          <v-text-field v-model="rollbackTypedConfirmation" :label="`Hedef kodu: ${target}`" />
          <p v-if="rollbackError" class="settings-body__conflict" role="alert">{{ rollbackError }}</p>
          <div class="settings-body__rollback-actions">
            <v-btn variant="outlined" :disabled="rollbackLoading" @click="rollbackTarget = null">Vazgeç</v-btn>
            <v-btn color="error" :loading="rollbackLoading" :disabled="!canConfirmRollback" @click="confirmRollback">Sürüme dön ve yayınla</v-btn>
          </div>
        </div>
      </EkSettingsSection>

      <EkSettingsSection v-if="mode === 'integration'" title="Uyum bulguları" description="Bu entegrasyon için açık uyum/sürüm bulguları.">
        <EkEmptyState variant="not-connected" title="Bu bölüm bu sürümde bağlı değil" message="ADR-0018 uyum bulgusu konsolu bu görevde bağlanmadı." />
      </EkSettingsSection>
    </template>
  </EkSettingsTemplate>

  <PublishConfirmDialog
    v-model="publishDialogOpen"
    :target="target"
    :target-label="targetLabel"
    :diff="previewData?.diff ?? []"
    :impact="previewData?.impact ?? null"
    :restart-count="previewData?.restartCount ?? 0"
    :danger="previewData?.danger ?? 'safe'"
    :requires-reason="previewData?.requiresReason ?? false"
    :requires-typed-approval="previewData?.requiresTypedApproval ?? false"
    :loading="publishLoading"
    :error-message="publishError"
    @confirm="onPublishConfirm"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import EkSettingsTemplate from '@/components/ds/templates/EkSettingsTemplate.vue'
import EkSettingsSection from '@/components/ds/templates/EkSettingsSection.vue'
import EkSkeleton from '@/components/ds/EkSkeleton.vue'
import EkErrorState from '@/components/ds/EkErrorState.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import EkDescriptionList, { type EkDescriptionListItem } from '@/components/ds/EkDescriptionList.vue'
import EkDataTable, { type EkTableColumn } from '@/components/ds/EkDataTable.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import { CONFIG_REVISION_STATUS_TONE, type ConfigRevisionStatus } from '@/design/status-map'
import SettingField from './SettingField.vue'
import { useOpenIntegrationConfigTab } from './useOpenIntegrationConfigTab'
import type { EkCrumb } from '@/components/ds/pageTrail'
import PublishConfirmDialog from './PublishConfirmDialog.vue'
import {
  applicableSettings, resolveDefault, ENGINE_TARGET, GROUP_LABELS, GROUP_DESCRIPTIONS, type SettingGroup, type SettingMeta,
} from './settingsCatalogMirror'
import {
  useIntegrationConfigApi, isErrorShapedResponse, serverErrorMessage,
  type EffectiveConfigResponse, type ResolvedValue, type HistoryEntry, type PreviewPublishResponse, type TargetSummary,
} from './useIntegrationConfigApi'

const props = defineProps<{ target: string; targetLabel: string; mode: 'integration' | 'engine' }>()

// A7 breadcrumb: Yönetim / Entegrasyonlar (bağlantı) / <hedef>.
const openConfigTab = useOpenIntegrationConfigTab()
const trail: EkCrumb[] = [{ label: 'Entegrasyonlar', icon: 'mdi-connection', onSelect: () => openConfigTab('IntegrationConfigListView') }]

const api = useIntegrationConfigApi()

// ---- Etkin yapılandırma ----
const effective = ref<EffectiveConfigResponse | null>(null)
const effectiveState = ref<'loading' | 'ready' | 'error'>('loading')
const effectiveError = ref('')

async function loadEffective() {
  effectiveState.value = 'loading'
  const res: any = await api.getEffectiveConfig(props.target)
  if (res && Array.isArray(res.values)) {
    effective.value = res
    effectiveState.value = 'ready'
  } else {
    effectiveError.value = isErrorShapedResponse(res)
      ? serverErrorMessage(res, 'Etkin yapılandırma yüklenemedi — tekrar deneyin.')
      : 'Etkin yapılandırma yüklenemedi — tekrar deneyin.'
    effectiveState.value = 'error'
  }
}

const effectiveMap = computed<Map<string, ResolvedValue>>(() => new Map((effective.value?.values ?? []).map((v) => [v.key, v])))
function resolvedFor(key: string): ResolvedValue {
  return effectiveMap.value.get(key) ?? { key, value: undefined, source: 'default' }
}

// ---- Genel (yalnızca integration mode) ----
const listRow = ref<TargetSummary | null>(null)
const generalState = ref<'loading' | 'ready' | 'error'>('loading')
async function loadGeneral() {
  if (props.mode !== 'integration') return
  generalState.value = 'loading'
  const res: any = await api.list()
  if (Array.isArray(res)) {
    listRow.value = res.find((r: TargetSummary) => r.target === props.target) ?? null
    generalState.value = 'ready'
  } else {
    generalState.value = 'error'
  }
}
const generalItems = computed<EkDescriptionListItem[]>(() => {
  if (!listRow.value) return []
  return [
    { label: 'Hedef kodu', value: listRow.value.target },
    { label: 'Kategori', value: listRow.value.category },
    { label: 'Adaptör sürümü', value: listRow.value.adapterVersion ?? '—' },
    { label: 'Yayındaki sürüm', value: `v${listRow.value.publishedVersion}` },
  ]
})

// ---- Taslak (saveDraft/discardDraft) ----
const draftOverrides = ref<Record<string, unknown>>({})
const draftRev = ref<number | undefined>(undefined)
const savingKey = ref<string | null>(null)
const conflictMessage = ref<string | null>(null)
const lastSavedAt = ref<Date | null>(null)

const isDirty = computed(() => Object.keys(draftOverrides.value).length > 0)
const unsavedHint = computed(() => {
  if (!isDirty.value) return undefined
  const n = Object.keys(draftOverrides.value).length
  const time = lastSavedAt.value ? lastSavedAt.value.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''
  return `Taslak kaydedildi ${time} · ${n} değişiklik`
})

function isOverridden(key: string): boolean { return Object.prototype.hasOwnProperty.call(draftOverrides.value, key) }
function currentValue(key: string): unknown {
  return isOverridden(key) ? draftOverrides.value[key] : resolvedFor(key).value
}
function defaultFor(meta: SettingMeta): unknown {
  return resolveDefault(meta, props.target !== ENGINE_TARGET ? props.target : undefined)
}

async function saveField(key: string, value: unknown) {
  savingKey.value = key
  conflictMessage.value = null
  const res: any = await api.saveDraft(props.target, { [key]: value }, undefined, draftRev.value)
  if (res && typeof res.draftRev === 'number') {
    draftOverrides.value = res.overrides ?? {}
    draftRev.value = res.draftRev
    lastSavedAt.value = new Date()
  } else if (isErrorShapedResponse(res) && res.response?.status === 409) {
    conflictMessage.value = serverErrorMessage(res, 'Taslak başka bir işlemle değişti; farkı yeniden gözden geçirin.')
  } else {
    conflictMessage.value = serverErrorMessage(res, 'Değişiklik kaydedilemedi — tekrar deneyin.')
  }
  savingKey.value = null
}

async function resetField(key: string) {
  savingKey.value = key
  const res: any = await api.saveDraft(props.target, {}, [key], draftRev.value)
  if (res && typeof res.draftRev === 'number') {
    draftOverrides.value = res.overrides ?? {}
    draftRev.value = res.draftRev
    lastSavedAt.value = new Date()
  }
  savingKey.value = null
}

async function onDiscard() {
  if (draftRev.value === undefined) { draftOverrides.value = {}; return }
  await api.discardDraft(props.target, draftRev.value)
  draftOverrides.value = {}
  draftRev.value = undefined
  await loadEffective()
}

async function reloadAfterConflict() {
  conflictMessage.value = null
  draftOverrides.value = {}
  draftRev.value = undefined
  await loadEffective()
}

// ---- Yayın (previewPublish/publish) ----
const publishDialogOpen = ref(false)
const previewData = ref<PreviewPublishResponse | null>(null)
const publishLoading = ref(false)
const publishError = ref<string | null>(null)

async function onOpenPublish() {
  publishError.value = null
  const res: any = await api.previewPublish(props.target)
  if (res && Array.isArray(res.diff)) {
    previewData.value = res
    publishDialogOpen.value = true
  } else {
    conflictMessage.value = serverErrorMessage(res, 'Yayın önizlemesi hesaplanamadı — tekrar deneyin.')
  }
}

async function onPublishConfirm(payload: { reason: string; typedConfirmation: string }) {
  publishLoading.value = true
  publishError.value = null
  const res: any = await api.publish(props.target, payload)
  if (res && typeof res.publishedVersion === 'number') {
    publishDialogOpen.value = false
    draftOverrides.value = {}
    draftRev.value = undefined
    await Promise.all([loadEffective(), loadHistory()])
  } else {
    publishError.value = serverErrorMessage(res, 'Yayınlanamadı — farkı yeniden gözden geçirin.')
  }
  publishLoading.value = false
}

// ---- Sürüm geçmişi + geri alma ----
const history = ref<HistoryEntry[]>([])
const historyState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
async function loadHistory() {
  historyState.value = 'loading'
  const res: any = await api.history(props.target, 10)
  if (Array.isArray(res)) { history.value = res; historyState.value = 'ready' } else { historyState.value = 'error' }
}
const historyColumns: EkTableColumn[] = [
  { key: 'version', label: 'Sürüm', align: 'end' },
  { key: 'status', label: 'Durum' },
  { key: 'createdBy', label: 'Kim' },
  { key: 'publishedAt', label: 'Ne zaman', type: 'datetime' },
  { key: 'reason', label: 'Gerekçe' },
  { key: 'actions', label: '', type: 'actions' },
]
function revisionStatusLabel(status: string) { return { draft: 'Taslak', published: 'Yayında', superseded: 'Yerini aldı', discarded: 'Atıldı' }[status] ?? status }

const rollbackTarget = ref<number | null>(null)
const rollbackReason = ref('')
const rollbackTypedConfirmation = ref('')
const rollbackLoading = ref(false)
const rollbackError = ref<string | null>(null)
function openRollback(version: number) {
  rollbackTarget.value = version
  rollbackReason.value = ''
  rollbackTypedConfirmation.value = ''
  rollbackError.value = null
}
const canConfirmRollback = computed(() => rollbackReason.value.trim().length >= 15 && rollbackTypedConfirmation.value.trim() === props.target)
async function confirmRollback() {
  if (rollbackTarget.value === null || !canConfirmRollback.value) return
  rollbackLoading.value = true
  rollbackError.value = null
  const res: any = await api.rollback(props.target, rollbackTarget.value, { reason: rollbackReason.value.trim(), typedConfirmation: rollbackTypedConfirmation.value.trim() })
  if (res && typeof res.publishedVersion === 'number') {
    rollbackTarget.value = null
    draftOverrides.value = {}
    draftRev.value = undefined
    await Promise.all([loadEffective(), loadHistory()])
  } else {
    rollbackError.value = serverErrorMessage(res, 'Geri alma yayınlanamadı — tekrar deneyin.')
  }
  rollbackLoading.value = false
}

// ---- Arama + gelişmiş/filtre ----
const searchQuery = ref('')
const filterChip = ref<'all' | 'changed' | 'dangerous' | 'draft'>('all')
function toggleFilter(f: 'changed' | 'dangerous' | 'draft') { filterChip.value = filterChip.value === f ? 'all' : f }
const advancedOpen = reactive<Record<string, boolean>>({})
function toggleAdvanced(group: SettingGroup) { advancedOpen[group] = !advancedOpen[group] }
function isAdvancedOpen(group: SettingGroup) { return !!advancedOpen[group] }

function matchesSearch(s: SettingMeta): boolean {
  if (!searchQuery.value.trim()) return true
  const q = searchQuery.value.trim().toLowerCase()
  return s.label.tr.toLowerCase().includes(q) || s.key.toLowerCase().includes(q) || s.help.tr.toLowerCase().includes(q)
}
function matchesChip(s: SettingMeta): boolean {
  if (filterChip.value === 'all') return true
  if (filterChip.value === 'dangerous') return s.danger !== 'safe'
  if (filterChip.value === 'draft') return isOverridden(s.key)
  if (filterChip.value === 'changed') {
    const r = resolvedFor(s.key)
    return r.source !== 'default'
  }
  return true
}

const ENGINE_GROUPS: SettingGroup[] = ['export.product', 'import.product', 'order.sync', 'order.support', 'stock', 'resilience', 'cache']
const INTEGRATION_GROUPS: SettingGroup[] = ['resilience', 'stock', 'mock']

const visibleGroups = computed(() => {
  const groups = props.mode === 'engine' ? ENGINE_GROUPS : INTEGRATION_GROUPS
  const all = applicableSettings(props.target)
  return groups.map((group) => {
    const inGroup = all.filter((s) => s.group === group).filter(matchesChip).filter(matchesSearch)
    const basic = inGroup.filter((s) => !s.advanced)
    const advanced = inGroup.filter((s) => s.advanced)
    return {
      group,
      settings: inGroup,
      visibleBasic: basic,
      visibleAdvanced: isAdvancedOpen(group) ? advanced : [],
      advancedCount: advanced.length,
    }
  })
})

onMounted(async () => {
  await Promise.all([loadEffective(), loadGeneral(), loadHistory()])
})

defineExpose({ reload: async () => { await Promise.all([loadEffective(), loadGeneral(), loadHistory()]) } })
</script>

<style scoped>
.settings-body__toolbar {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.settings-body__search {
  max-width: 420px;
}

.settings-body__chips {
  display: flex;
  gap: var(--ek-space-2);
  flex-wrap: wrap;
}

.settings-body__conflict {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-error);
}

.settings-body__conflict-retry {
  background: none;
  border: none;
  color: var(--ek-color-primary);
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}

.settings-body__advanced-toggle {
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-font-size-sm);
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}

.settings-body__rollback {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface-muted);
}

.settings-body__rollback-title {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  margin: 0;
}

.settings-body__rollback-note {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
  margin: 0;
}

.settings-body__rollback-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ek-space-2);
}
</style>
