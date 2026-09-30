<!--
  frontend/src/views/secure/adminPanel/integrations/EffectiveConfigView.vue

  ADR-0020 Karar 4.1 "Etkin yapılandırma" — `admin.effectiveConfig?code=`, `EkReadonlyPanelTemplate`,
  `platformAdmin`. Salt-okunur tablo: anahtar, etkin değer, kaynak çipi, varsayılan, uygulanma zamanı.

  NOT (dürüstlük, rapora yazıldı): ADR'nin istediği "Çelişkiler" filtresi (legacy ≠ default / emekli /
  env kilidi) bu RPC'nin verisiyle KURULAMAZ — `getEffectiveConfig` yalnızca `default|platform|env`
  kaynaklarını döndürüyor (`legacy` katmanı bu uçta YOK, host/emekli-uç verisi hiç YOK). Bu yüzden
  filtre GERÇEKTEN bilinen tek anlamı ("varsayılan dışına çıkmış değerler") ile "Varsayılan dışı"
  adıyla sunulur — var olmayan bir "çelişki" tespiti iddia EDİLMEZ (E3/C7).

  DS-v2 Aşama 2: tablo `EkListScreen` (liste standardı) ile gösterilir — anahtar/değer listesi, sayfalamasız,
  arama/filtre/sıralama İSTEMCİ tarafında (`sortRows`). KPI satırı listenin üstünde kalır; "Son güncelleme"
  bilgisi açıklama satırındadır. Sayfa H1'i `EkListScreen` başlığıdır (tek H1).
-->
<template>
  <div class="effectiveConfigView">
   <PlatformAdminGuard :allowed="isPlatformAdmin()">
    <EkEmptyState v-if="!target" variant="no-data" title="Hedef seçilmedi" message="Bu ekran bir entegrasyon kodu (?code=) ya da motor hedefiyle açılmalıdır." />
    <template v-else>
      <EkKpiRow class="effectiveConfigView__kpis">
        <EkKpiCard label="Yayındaki sürüm" :value="publishedVersionLabel" />
        <EkKpiCard label="Katalog sürümü" :value="catalogVersionLabel" />
        <EkKpiCard label="Toplam ayar" :value="rows.length" />
        <EkKpiCard label="Varsayılan dışı" :value="nonDefaultCount" />
      </EkKpiRow>

      <EkListScreen
        section="Yönetim"
        class="effectiveConfigView__screen"
        :title="`Etkin Yapılandırma — ${targetLabel}`"
        :description="description"
        label="Etkin yapılandırma tablosu"
        noun="ayar"
        row-key="key"
        label-key="label"
        :columns="columns"
        :rows="visibleRows"
        :loading="state === 'loading'"
        :error="state === 'error'"
        error-title="Etkin yapılandırma yüklenemedi"
        :error-text="errorMessage"
        :search="search"
        search-placeholder="Ayar adı veya anahtarı ara"
        :chips="activeChips"
        :filter-count="panelFilterCount"
        :filter-columns="2"
        :sort="sort"
        empty-title="Ayar bulunamadı"
        empty-text="Bu hedef için gösterilecek bir ayar yok."
        empty-icon="mdi-tune-variant"
        filtered-empty-title="Sonuç yok"
        filtered-empty-text="Bu filtreye uyan bir ayar bulunamadı."
        @update:search="onSearchInput"
        @update:sort="(s: EkGridSort) => (sort = s)"
        @filter-submit="applyFilters"
        @filter-reset="clearFilters"
        @remove-chip="removeChip"
        @clear-filters="clearFilters"
        @refresh="load"
      >
        <template #header-actions>
          <EkButton icon="mdi-download-outline" :disabled="state !== 'ready'" @click="exportJson">Dışa aktar (JSON)</EkButton>
        </template>

        <template #filters>
          <v-checkbox v-model="conflictsOnly" label="Varsayılan dışı" hide-details density="comfortable" />
        </template>

        <template #cell-label="{ row }">
          <span class="effectiveConfigView__label-cell">
            <span>{{ row.label }}</span>
            <code class="effectiveConfigView__key">{{ row.key }}</code>
          </span>
        </template>
        <template #cell-source="{ row }">
          <EkStatusChip :tone="sourceTone(row.source)" :label="row.sourceLabel" />
        </template>
      </EkListScreen>
    </template>
   </PlatformAdminGuard>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import EkListScreen from '@/components/ds/templates/EkListScreen.vue'
import EkButton from '@/components/ds/EkButton.vue'
import type { EkGridColumn, EkGridSort } from '@/components/ds/EkDataGrid.vue'
import type { EkActiveFilterChip } from '@/components/ds/EkActiveFilters.vue'
import { sortRows } from '@/components/ds/listStandard'
import EkKpiRow from '@/components/ds/EkKpiRow.vue'
import EkKpiCard from '@/components/ds/EkKpiCard.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import PlatformAdminGuard from '@/components/adminPanel/integrations/PlatformAdminGuard.vue'
import useUser from '@/composables/user'
import { formatDateTime, formatDuration, formatNumber } from '@/composables/format'
import { getSettingMeta, resolveDefault, ENGINE_TARGET } from '@/components/adminPanel/integrations/settingsCatalogMirror'
import { useIntegrationConfigApi, isErrorShapedResponse, serverErrorMessage, type EffectiveConfigResponse, type ValueSource } from '@/components/adminPanel/integrations/useIntegrationConfigApi'

const KNOWN_CODES = ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap']
const { isPlatformAdmin } = useUser()
const api = useIntegrationConfigApi()

const target = ref<string | null>(null)
const targetLabel = computed(() => {
  if (!target.value) return ''
  if (target.value === ENGINE_TARGET) return 'Motor Ayarları'
  return target.value.charAt(0).toUpperCase() + target.value.slice(1)
})

function applyParameters(parameters: any) {
  const c = parameters?.code
  if (c === ENGINE_TARGET || (typeof c === 'string' && KNOWN_CODES.includes(c))) {
    target.value = c
    void load()
  } else {
    target.value = null
  }
}

const state = ref<'loading' | 'ready' | 'error'>('loading')
const errorMessage = ref('')
const effective = ref<EffectiveConfigResponse | null>(null)
const lastUpdated = ref<Date | null>(null)
const conflictsOnly = ref(false)
const search = ref('')

async function load() {
  if (!target.value) return
  state.value = 'loading'
  const res: any = await api.getEffectiveConfig(target.value)
  if (res && Array.isArray(res.values)) {
    effective.value = res
    lastUpdated.value = new Date()
    state.value = 'ready'
  } else {
    errorMessage.value = isErrorShapedResponse(res)
      ? serverErrorMessage(res, 'Etkin yapılandırma yüklenemedi — tekrar deneyin.')
      : 'Etkin yapılandırma yüklenemedi — tekrar deneyin.'
    state.value = 'error'
  }
}

const SOURCE_LABELS: Record<ValueSource, string> = { default: 'Varsayılan', platform: 'Platform', env: 'Ortam değişkeni', tenant: 'Kiracı', legacy: 'Eski DB' }
function sourceTone(source: ValueSource) {
  return ({ default: 'neutral', platform: 'info', env: 'warning', tenant: 'info', legacy: 'danger' } as const)[source]
}

function displayValue(value: unknown, unit?: string, type?: string): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'boolean') return value ? 'Açık' : 'Kapalı'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(boş liste)'
  if (typeof value === 'number') return type === 'duration' ? formatDuration(value, unit) : formatNumber(value)
  return String(value)
}

const APPLIES_LABELS: Record<string, string> = { immediate: 'Hemen', next_cycle: 'Sonraki turda', restart: 'Yeniden başlatma gerekir' }

const rows = computed(() => {
  return (effective.value?.values ?? []).map((v) => {
    const meta = getSettingMeta(v.key)
    return {
      key: v.key,
      label: meta?.label.tr ?? v.key,
      value: displayValue(v.value, meta?.unit, meta?.type),
      source: v.source,
      sourceLabel: v.source === 'platform' && v.revision ? `${SOURCE_LABELS[v.source]} v${v.revision}` : SOURCE_LABELS[v.source],
      default: meta ? displayValue(resolveDefault(meta, target.value !== ENGINE_TARGET ? target.value ?? undefined : undefined), meta.unit, meta.type) : '—',
      applies: meta ? APPLIES_LABELS[meta.applies] ?? meta.applies : '—',
    }
  })
})

// Sorgulanan değerler (çipler ve liste bunlardan türer). Arama anlık, panel alanı "Sorgula" ile uygulanır.
const applied = ref({ search: '', conflictsOnly: false })
const filteredRows = computed(() => {
  const q = applied.value.search.trim().toLowerCase()
  return rows.value.filter((r) => {
    if (applied.value.conflictsOnly && r.source === 'default') return false
    if (q && !`${r.label} ${r.key}`.toLowerCase().includes(q)) return false
    return true
  })
})

const sort = ref<EkGridSort>(null)
const visibleRows = computed(() => sortRows(filteredRows.value, sort.value, { source: (r) => r.sourceLabel }))

const activeChips = computed<EkActiveFilterChip[]>(() => {
  const list: EkActiveFilterChip[] = []
  if (applied.value.search) list.push({ key: 'search', label: 'Arama', value: applied.value.search })
  if (applied.value.conflictsOnly) list.push({ key: 'conflicts', label: 'Kaynak', value: 'Varsayılan dışı' })
  return list
})
const panelFilterCount = computed(() => (applied.value.conflictsOnly ? 1 : 0))

function onSearchInput(v: string) {
  search.value = v
  applied.value = { ...applied.value, search: v }
}
function applyFilters() {
  applied.value = { search: search.value, conflictsOnly: conflictsOnly.value }
}
function removeChip(key: string) {
  if (key === 'search') search.value = ''
  if (key === 'conflicts') conflictsOnly.value = false
  applyFilters()
}
function clearFilters() {
  search.value = ''
  conflictsOnly.value = false
  applyFilters()
}

const description = computed(() =>
  `Her ayarın şu an gerçekten kullanılan değeri ve kaynağı. Son güncelleme: ${lastUpdated.value ? formatDateTime(lastUpdated.value) : '—'}`,
)
const nonDefaultCount = computed(() => rows.value.filter((r) => r.source !== 'default').length)
const publishedVersionLabel = computed(() => (effective.value ? `v${effective.value.publishedVersion}` : '—'))
const catalogVersionLabel = computed(() => effective.value?.catalogVersion ?? '—')

const columns: EkGridColumn[] = [
  { key: 'label', label: 'Ayar', sortable: true },
  { key: 'value', label: 'Etkin değer', sortable: true },
  { key: 'source', label: 'Kaynak', sortable: true },
  { key: 'default', label: 'Varsayılan' },
  { key: 'applies', label: 'Uygulanma zamanı' },
]

function exportJson() {
  const payload = { target: target.value, publishedVersion: effective.value?.publishedVersion, catalogVersion: effective.value?.catalogVersion, values: effective.value?.values ?? [] }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `entegrasyonik-etkin-yapilandirma-${target.value}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const initialize = (parameters?: any) => applyParameters(parameters)
const activate = (parameters?: any) => applyParameters(parameters)
defineExpose({ initialize, activate })
</script>

<style scoped>
.effectiveConfigView {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

@media (max-width: 767px) {
  .effectiveConfigView {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}

.effectiveConfigView__kpis {
  flex: none;
}

.effectiveConfigView__screen {
  flex: 1;
  height: auto;
  min-height: 0;
}

.effectiveConfigView__label-cell {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
}

.effectiveConfigView__key {
  /* NOT (araştırma bulgusu, mobil genişlikte axe `color-contrast`): `content-muted` + `font-size-xs`
   * kombinasyonu 4.48/4.5 ile SINIRDA başarısız oluyordu — `content-default`e yükseltildi. */
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-default);
}
</style>
