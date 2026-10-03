<!--
  frontend/src/views/secure/adminPanel/integrations/IntegrationConfigListView.vue

  ADR-0020 Karar 4.1 "Entegrasyonlar (liste)" — `admin.integrations`, `platformAdmin`.
  `EkListPage` + `EkDetailSheet`. Yalnızca `IntegrationConfigService.list()`'in GERÇEKTEN döndürdüğü
  alanlar gösterilir (bkz. dosya sonu "veri boşlukları" notu — sağlık/kapsam/aktif mağaza/uyum bulgusu
  bu uçta YOK, ADR'nin istediği ama backend Aşama B'nin taşımadığı sütunlar `—` ile dürüstçe gösterilir).

  Not (ADR-0015 Karar 6.4 desen mandalı): `EkPageHeader` bu dosyada DOĞRUDAN kullanılmaz — `EkListPage`
  şablonu onu İÇİNDE render eder (ADR-0015 Karar 2.3, tek kaynak). Başlık hiyerarşisi bu yüzden yine
  tektir (sayfa H1'i `EkListPage` → `EkPageHeader` üretir).
-->
<template>
  <div class="integrationConfigListView">
   <PlatformAdminGuard :allowed="isPlatformAdmin()">
    <EkListPage
      section="Yönetim"
      title="Entegrasyonlar"
      description="Her entegrasyonun ve motorun yayındaki ayar sürümünü, kabul durumunu ve açık taslağını buradan görüp yönetebilirsiniz."
      :search="search"
      search-placeholder="Entegrasyon adı ara"
      :active-filters="activeFilters"
      :state="viewState"
      @update:search="(v) => (search = v)"
      @clear-filters="clearFilters"
      @remove-filter="removeFilter"
      @refresh="load"
    >
      <template #filters-extra>
        <v-select
          v-model="categoryFilter"
          :items="categoryOptions"
          label="Kategori"
          clearable
          density="comfortable"
          hide-details
          class="integrationConfigListView__filter"
        />
        <v-select
          v-model="intakeFilter"
          :items="intakeOptions"
          label="Kabul durumu"
          clearable
          density="comfortable"
          hide-details
          class="integrationConfigListView__filter"
        />
        <v-btn
          :variant="draftOnly ? 'flat' : 'outlined'"
          :color="draftOnly ? 'primary' : undefined"
          size="small"
          class="text-none"
          @click="draftOnly = !draftOnly"
        >
          Yalnızca taslağı olanlar
        </v-btn>
      </template>

      <template #empty>
        <EkEmptyState variant="no-data" title="Henüz entegrasyon tanımı yok" message="Katalogda tanımlı bir entegrasyon/motor hedefi bulunamadı." />
      </template>
      <template #empty-filtered>
        <EkEmptyState variant="no-results" title="Sonuç yok" message="Arama/filtre kriterlerinize uyan bir entegrasyon bulunamadı." show-action action-text="Filtreleri temizle" action-icon="mdi-filter-off-outline" @action="clearFilters" />
      </template>
      <template #error>
        <EkErrorState :message="errorMessage" @retry="load" />
      </template>

      <p class="integrationConfigListView__data-note">
        Sağlık özeti, kapsam özeti, aktif mağaza sayısı ve açık uyum bulgusu bu sürümde bağlanmadı — ilgili sütunlarda "—" görünür.
      </p>

      <EkDataTable :items="filteredRows" :columns="columns" row-key="target" aria-label="Entegrasyonlar tablosu">
        <template #cell-target="{ item }">
          <EkPlatformMark :name="item.displayName" :code="item.target !== '_engine' ? item.target : undefined" />
        </template>
        <template #cell-category="{ item }">{{ categoryLabel(item.category) }}</template>
        <template #cell-intake="{ item }">
          <EkStatusChip :tone="intakeTone(item.intake)" :label="intakeLabel(item.intake)" />
        </template>
        <template #cell-hasDraft="{ item }">
          <EkStatusChip v-if="item.hasDraft" tone="info" label="Taslak var" />
          <span v-else class="integrationConfigListView__muted">—</span>
        </template>
        <template #cell-actions="{ item }">
          <v-btn icon="mdi-eye-outline" variant="text" density="comfortable" :aria-label="`${item.displayName} detayını aç`" @click="openDetail(item as TargetSummary)" />
        </template>
      </EkDataTable>
    </EkListPage>

    <EkDetailSheet v-if="selected" v-model="detailOpen" :identity="selected.displayName">
      <template #status>
        <EkStatusChip :tone="CONFIG_INTAKE_TONE[selected.intake].tone" :label="intakeLabel(selected.intake)" />
      </template>
      <template #actions>
        <v-btn variant="outlined" prepend-icon="mdi-tune" @click="goSettings(selected)">Ayarları düzenle</v-btn>
        <v-btn variant="outlined" prepend-icon="mdi-table-eye" @click="goEffective(selected)">Etkin yapılandırmayı gör</v-btn>
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
import { computed, onMounted, ref } from 'vue'
import EkListPage from '@/components/ds/templates/EkListPage.vue'
import EkDataTable, { type EkTableColumn } from '@/components/ds/EkDataTable.vue'
import EkDetailSheet from '@/components/ds/EkDetailSheet.vue'
import EkSection from '@/components/ds/EkSection.vue'
import EkDescriptionList, { type EkDescriptionListItem } from '@/components/ds/EkDescriptionList.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import EkErrorState from '@/components/ds/EkErrorState.vue'
import EkSkeleton from '@/components/ds/EkSkeleton.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkPlatformMark from '@/components/ds/EkPlatformMark.vue'
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

const filteredRows = computed(() => rows.value.filter((r) => {
  if (search.value && !r.displayName.toLowerCase().includes(search.value.toLowerCase())) return false
  if (categoryFilter.value && r.category !== categoryFilter.value) return false
  if (intakeFilter.value && r.intake !== intakeFilter.value) return false
  if (draftOnly.value && !r.hasDraft) return false
  return true
}))

const activeFilters = computed(() => {
  const list: { key: string; label: string }[] = []
  if (categoryFilter.value) list.push({ key: 'category', label: `Kategori: ${categoryLabel(categoryFilter.value)}` })
  if (intakeFilter.value) list.push({ key: 'intake', label: `Durum: ${intakeLabel(intakeFilter.value as ConfigIntakeStatus)}` })
  if (draftOnly.value) list.push({ key: 'draft', label: 'Yalnızca taslağı olanlar' })
  return list
})

function removeFilter(key: string) {
  if (key === 'category') categoryFilter.value = null
  if (key === 'intake') intakeFilter.value = null
  if (key === 'draft') draftOnly.value = false
}
function clearFilters() {
  search.value = ''
  categoryFilter.value = null
  intakeFilter.value = null
  draftOnly.value = false
}

const viewState = computed(() => {
  if (loading.value) return 'loading'
  if (loadError.value) return 'error'
  if (rows.value.length === 0) return 'empty'
  if (filteredRows.value.length === 0) return 'empty-filtered'
  return 'ready'
})
const errorMessage = computed(() => loadError.value ?? '')

const columns: EkTableColumn[] = [
  { key: 'target', label: 'Entegrasyon' },
  { key: 'category', label: 'Kategori' },
  { key: 'adapterVersion', label: 'Adaptör sürümü' },
  { key: 'intake', label: 'Kabul durumu' },
  { key: 'publishedVersion', label: 'Yayındaki sürüm', align: 'end' },
  { key: 'hasDraft', label: 'Taslak' },
  { key: 'actions', label: '', type: 'actions' },
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
.integrationConfigListView__filter {
  max-width: 200px;
}

.integrationConfigListView__muted {
  color: var(--ek-color-content-muted);
}

.integrationConfigListView__data-note {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
  margin: 0 0 var(--ek-space-2) 0;
}
</style>
