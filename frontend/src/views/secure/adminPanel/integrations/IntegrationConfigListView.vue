<!--
  frontend/src/views/secure/adminPanel/integrations/IntegrationConfigListView.vue

  ADR-0020 Karar 4.1 "Entegrasyonlar (liste)" — `admin.integrations`, `platformAdmin`.
  `EkListScreen` (DS-v2 liste standardı) + `EkDetailSheet`. Yalnızca `IntegrationConfigService.list()`'in GERÇEKTEN döndürdüğü
  alanlar gösterilir (bkz. dosya sonu "veri boşlukları" notu — sağlık/kapsam/aktif mağaza/uyum bulgusu
  bu uçta YOK, ADR'nin istediği ama backend Aşama B'nin taşımadığı sütunlar `—` ile dürüstçe gösterilir).

  Not: sayfa H1'i `EkListScreen` başlığından gelir (tek H1). Liste küçüktür ve sayfalamasızdır:
  arama/filtre/sıralama İSTEMCİ tarafındadır (`sortRows`).
-->
<template>
  <div class="integrationConfigListView">
   <PlatformAdminGuard :allowed="isPlatformAdmin()">
    <EkListScreen
      section="Yönetim"
      class="integrationConfigListView__screen"
      title="Entegrasyonlar"
      description="Her entegrasyonun ve motorun yayındaki ayar sürümünü, kabul durumunu ve açık taslağını buradan görüp yönetebilirsiniz."
      label="Entegrasyonlar tablosu"
      noun="entegrasyon"
      row-key="target"
      label-key="displayName"
      :columns="columns"
      :rows="visibleRows"
      :loading="loading"
      :error="!!loadError"
      error-title="Entegrasyon listesi yüklenemedi"
      :error-text="loadError ?? undefined"
      :search="search"
      search-placeholder="Entegrasyon adı ara"
      :chips="activeChips"
      :filter-count="panelFilterCount"
      :sort="sort"
      empty-title="Henüz entegrasyon tanımı yok"
      empty-text="Katalogda tanımlı bir entegrasyon/motor hedefi bulunamadı."
      empty-icon="mdi-puzzle-outline"
      filtered-empty-title="Sonuç yok"
      filtered-empty-text="Arama/filtre kriterlerinize uyan bir entegrasyon bulunamadı."
      @update:search="onSearchInput"
      @update:sort="(s: EkGridSort) => (sort = s)"
      @filter-submit="applyFilters"
      @filter-reset="clearFilters"
      @remove-chip="removeChip"
      @clear-filters="clearFilters"
      @refresh="load"
    >
      <template #filters>
        <v-select v-model="categoryFilter" :items="categoryOptions" label="Kategori" clearable />
        <v-select v-model="intakeFilter" :items="intakeOptions" label="Kabul durumu" clearable />
        <v-checkbox v-model="draftOnly" label="Yalnızca taslağı olanlar" hide-details density="comfortable" />
      </template>

      <!-- fe-r3d (APP_IDENTITY §8): geliştirici notu ekrandan kalktı — bağlanmamış sütunlar "—" gösterir
           (sağlık/kapsam özeti, aktif mağaza sayısı, açık uyum bulgusu henüz bağlı değil). -->

      <template #cell-target="{ row }">
        <EkPlatformMark :name="row.displayName" :code="row.target !== '_engine' ? row.target : undefined" />
      </template>
      <template #cell-category="{ row }">{{ categoryLabel(row.category) }}</template>
      <template #cell-intake="{ row }">
        <EkStatusChip :tone="intakeTone(row.intake)" :label="intakeLabel(row.intake)" />
      </template>
      <template #cell-hasDraft="{ row }">
        <EkStatusChip v-if="row.hasDraft" tone="info" label="Taslak var" />
        <span v-else class="integrationConfigListView__muted">—</span>
      </template>
      <template #cell-actions="{ row }">
        <EkRowActions :label="`${row.displayName} işlemleri`" :items="[{ key: 'view', action: 'view', label: `${row.displayName} detayını aç`, onClick: () => openDetail(row as TargetSummary) }]" />
      </template>
    </EkListScreen>

    <EkDetailSheet v-if="selected" v-model="detailOpen" :identity="selected.displayName">
      <template #status>
        <EkStatusChip :tone="CONFIG_INTAKE_TONE[selected.intake].tone" :label="intakeLabel(selected.intake)" />
      </template>
      <template #actions>
        <v-btn variant="outlined" prepend-icon="mdi-tune" @click="goSettings(selected)">Ayarları düzenle</v-btn>
        <v-btn variant="outlined" prepend-icon="mdi-eye-outline" @click="goEffective(selected)">Etkin yapılandırmayı gör</v-btn>
      </template>

      <EkSection title="Özet">
        <EkDescriptionList :items="summaryItems" />
      </EkSection>

      <EkSection title="Son 5 revizyon">
        <EkSkeleton v-if="historyState === 'loading'" type="table" :rows="3" />
        <EkErrorState v-else-if="historyState === 'error'" size="inline" message="Sürüm geçmişi yüklenemedi — bağlantınızı kontrol edip tekrar deneyin." @retry="loadHistory" />
        <EkEmptyState v-else-if="!history.length" variant="no-data" title="Henüz hiçbir ayar değiştirilmedi" message="Tüm değerler varsayılan." />
        <EkDataTable v-else :items="history" :columns="historyColumns" row-key="version">
          <template #cell-status="{ item }">
            <EkStatusChip :tone="revisionTone(item.status)" :label="revisionStatusLabel(item.status)" />
          </template>
        </EkDataTable>
      </EkSection>
    </EkDetailSheet>
   </PlatformAdminGuard>
  </div>
</template>

<script setup lang="ts">
import { EkRowActions, EkDataTable, type EkTableColumn, EkDetailSheet, EkSection, EkDescriptionList, type EkDescriptionListItem, EkEmptyState, EkErrorState, EkSkeleton, EkStatusChip, EkPlatformMark } from '@entegrasyonik/ui/components'
import type { EkGridColumn, EkGridSort, EkActiveFilterChip } from '@entegrasyonik/ui/components'
import { computed, onMounted, ref } from 'vue'
import EkListScreen from '@/components/page/templates/EkListScreen.vue'
import { sortRows } from '@entegrasyonik/ui/components/listStandard'
import { CONFIG_INTAKE_TONE, CONFIG_REVISION_STATUS_TONE, type ConfigIntakeStatus, type ConfigRevisionStatus } from '@/design/status-map'
import useUser from '@/composables/user'
import { useIntegrationConfigApi, isErrorShapedResponse, serverErrorMessage, type TargetSummary, type HistoryEntry } from '@/components/adminPanel/integrations/useIntegrationConfigApi'
import { useOpenIntegrationConfigTab } from '@/components/adminPanel/integrations/useOpenIntegrationConfigTab'
import PlatformAdminGuard from '@/components/adminPanel/integrations/PlatformAdminGuard.vue'

const CATEGORY_LABELS: Record<string, string> = {
  engine: 'Motor', marketplace: 'Pazaryeri', ecommerce: 'E-ticaret', erp: 'ERP', shipping: 'Kargo', einvoice: 'E-fatura',
}
function categoryLabel(code: string) { return CATEGORY_LABELS[code] ?? code }
function intakeLabel(status: ConfigIntakeStatus) { return { on: 'Açık', drain: 'Boşaltılıyor', off: 'Kapalı' }[status] }
function revisionStatusLabel(status: ConfigRevisionStatus) { return { draft: 'Taslak', published: 'Yayında', superseded: 'Yerini aldı', discarded: 'Atıldı' }[status] }
function intakeTone(status: ConfigIntakeStatus) { return CONFIG_INTAKE_TONE[status].tone }
function revisionTone(status: ConfigRevisionStatus) { return CONFIG_REVISION_STATUS_TONE[status].tone }

const { isPlatformAdmin } = useUser()
const api = useIntegrationConfigApi()
const openTab = useOpenIntegrationConfigTab()

const rows = ref<TargetSummary[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)

const search = ref('')
const categoryFilter = ref<string | null>(null)
const intakeFilter = ref<string | null>(null)
const draftOnly = ref(false)

async function load() {
  if (!isPlatformAdmin()) { loading.value = false; return } // yetkisiz durumda gereksiz RPC atılmaz (guard zaten render'ı engeller)
  loading.value = true
  loadError.value = null
  const res: any = await api.list()
  if (Array.isArray(res)) {
    rows.value = res
  } else if (isErrorShapedResponse(res)) {
    loadError.value = serverErrorMessage(res, 'Entegrasyon listesi şu anda yüklenemiyor — tekrar deneyin.')
  } else {
    loadError.value = 'Entegrasyon listesi şu anda yüklenemiyor — tekrar deneyin.'
  }
  loading.value = false
}

const categoryOptions = computed(() => {
  const set = new Set(rows.value.map((r) => r.category))
  return Array.from(set).map((c) => ({ title: categoryLabel(c), value: c }))
})
const intakeOptions = [
  { title: 'Açık', value: 'on' }, { title: 'Boşaltılıyor', value: 'drain' }, { title: 'Kapalı', value: 'off' },
]

// Sorgulanan değerler (çipler ve liste bunlardan türer). Arama anlık, panel alanları "Sorgula" ile uygulanır.
const applied = ref<{ search: string; category: string | null; intake: string | null; draftOnly: boolean }>({
  search: '', category: null, intake: null, draftOnly: false,
})

const filteredRows = computed(() => rows.value.filter((r) => {
  const f = applied.value
  if (f.search && !r.displayName.toLowerCase().includes(f.search.toLowerCase())) return false
  if (f.category && r.category !== f.category) return false
  if (f.intake && r.intake !== f.intake) return false
  if (f.draftOnly && !r.hasDraft) return false
  return true
}))

// İstemci tarafı sıralama (liste sayfalamasız, tümü yüklü).
const sort = ref<EkGridSort>(null)
const visibleRows = computed(() => sortRows(filteredRows.value, sort.value, { target: (r) => r.displayName }))

const activeChips = computed<EkActiveFilterChip[]>(() => {
  const f = applied.value
  const list: EkActiveFilterChip[] = []
  if (f.search) list.push({ key: 'search', label: 'Arama', value: f.search })
  if (f.category) list.push({ key: 'category', label: 'Kategori', value: categoryLabel(f.category) })
  if (f.intake) list.push({ key: 'intake', label: 'Kabul durumu', value: intakeLabel(f.intake as ConfigIntakeStatus) })
  if (f.draftOnly) list.push({ key: 'draft', label: 'Taslak', value: 'Yalnızca taslağı olanlar' })
  return list
})
const panelFilterCount = computed(() => activeChips.value.filter((c) => c.key !== 'search').length)

function onSearchInput(v: string) {
  search.value = v
  applied.value = { ...applied.value, search: v }
}
function applyFilters() {
  applied.value = { search: search.value, category: categoryFilter.value, intake: intakeFilter.value, draftOnly: draftOnly.value }
}
function removeChip(key: string) {
  if (key === 'search') search.value = ''
  if (key === 'category') categoryFilter.value = null
  if (key === 'intake') intakeFilter.value = null
  if (key === 'draft') draftOnly.value = false
  applyFilters()
}
function clearFilters() {
  search.value = ''
  categoryFilter.value = null
  intakeFilter.value = null
  draftOnly.value = false
  applyFilters()
}

const columns: EkGridColumn[] = [
  { key: 'target', label: 'Entegrasyon', sortable: true },
  { key: 'category', label: 'Kategori', sortable: true },
  { key: 'adapterVersion', label: 'Adaptör sürümü' },
  { key: 'intake', label: 'Kabul durumu', sortable: true },
  { key: 'publishedVersion', label: 'Yayındaki sürüm', type: 'num', sortable: true },
  { key: 'hasDraft', label: 'Taslak' },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
]

const selected = ref<TargetSummary | null>(null)
const detailOpen = ref(false)
const history = ref<HistoryEntry[]>([])
const historyState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')

const historyColumns: EkTableColumn[] = [
  { key: 'version', label: 'Sürüm', align: 'end' },
  { key: 'status', label: 'Durum' },
  { key: 'createdBy', label: 'Kim' },
  { key: 'publishedAt', label: 'Ne zaman', type: 'datetime' },
]

async function loadHistory() {
  if (!selected.value) return
  historyState.value = 'loading'
  const res: any = await api.history(selected.value.target, 5)
  if (Array.isArray(res)) {
    history.value = res
    historyState.value = 'ready'
  } else {
    historyState.value = 'error'
  }
}

function openDetail(item: TargetSummary) {
  selected.value = item
  detailOpen.value = true
  history.value = []
  void loadHistory()
}

const summaryItems = computed<EkDescriptionListItem[]>(() => {
  if (!selected.value) return []
  return [
    { label: 'Hedef kodu', value: selected.value.target },
    { label: 'Kategori', value: categoryLabel(selected.value.category) },
    { label: 'Adaptör sürümü', value: selected.value.adapterVersion ?? '—' },
    { label: 'Yayındaki sürüm', value: `v${selected.value.publishedVersion}` },
    { label: 'Açık taslak', value: selected.value.hasDraft ? `Var${selected.value.draftLockedBy ? ' · ' + selected.value.draftLockedBy + ' düzenliyor' : ''}` : 'Yok' },
  ]
})

function goSettings(item: TargetSummary) {
  // `EkDetailSheet` (`v-dialog`) yeni sekme açılırken KENDİLİĞİNDEN kapanmıyor (teleport edildiği
  // için sekme görünürlüğünden bağımsız) — araştırma bulgusu, elle kapatılır.
  detailOpen.value = false
  if (item.target === '_engine') { openTab('EngineSettingsView'); return }
  openTab('IntegrationSettingsView', { code: item.target })
}
function goEffective(item: TargetSummary) {
  detailOpen.value = false
  openTab('EffectiveConfigView', { code: item.target })
}

onMounted(load)

defineExpose({
  initialize: load,
  activate: load,
})
</script>

<style scoped>
.integrationConfigListView {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

@media (max-width: 767px) {
  .integrationConfigListView {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}

.integrationConfigListView__screen {
  flex: 1;
  height: auto;
  min-height: 0;
}

.integrationConfigListView__muted {
  color: var(--ek-color-content-muted);
}

</style>
