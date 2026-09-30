<!--
  frontend/src/views/secure/adminPanel/integrations/ComplianceView.vue

  ADR-0018 Karar 2 "Konsol" + Karar 4 "Aşama B" — "Entegrasyon uyum" ekranı (`platformAdmin`).
  ADR-0015 Karar 6.1 liste + detay çekmecesi: `EkListPage` (sayfa başlığını İÇİNDE `EkPageHeader` ile
  üretir — tek H1, Karar 2.3) + `EkDetailSheet` (`ComplianceFindingSheet`).

  Backend TÜKETİLİR (`IntegrationComplianceService`, salt okunur referans):
   - `list()`   → bulgu tablosu. Beş filtrenin BEŞİ de sunucuya gider (backend `category`/`severity`'yi
                  kendi içinde bellekte süzer); FE yalnızca serbest metin aramasını yerelde uygular.
   - `summary()`→ entegrasyon başına özet kartları (`ComplianceSummaryPanel`).
   - `getDetail()` / `transition()` → detay çekmecesi.
  Sıralama: backend `lastSeenAt` azalan döner; triaj önceliği için FE ŞİDDETE göre (kararlı) yeniden
  sıralar — aynı şiddette backend sırası korunur.

  Boş durum: "Şu an bilinen bir uyum sorunu yok" + izleme notu. Boş liste "mükemmel" demek değildir;
  kapsam sınırı açıkça yazılır.
-->
<template>
  <div class="complianceView">
   <PlatformAdminGuard :allowed="isPlatformAdmin()">
    <EkListPage
      :section="t('integrationCompliance.section')"
      :title="t('integrationCompliance.title')"
      :description="t('integrationCompliance.description')"
      :search="search"
      :search-placeholder="t('integrationCompliance.searchPlaceholder')"
      :active-filters="activeFilters"
      :state="viewState"
      @update:search="(v) => (search = v)"
      @clear-filters="clearFilters"
      @remove-filter="removeFilter"
      @refresh="refreshAll"
    >
      <template #filters-extra>
        <v-select v-model="filters.integrationCode" :items="integrationOptions" :label="t('integrationCompliance.filters.integration')" clearable density="comfortable" hide-details class="complianceView__filter" />
        <v-select v-model="filters.category" :items="categoryOptions" :label="t('integrationCompliance.filters.category')" clearable density="comfortable" hide-details class="complianceView__filter" />
        <v-select v-model="filters.kind" :items="kindOptions" :label="t('integrationCompliance.filters.kind')" clearable density="comfortable" hide-details class="complianceView__filter" />
        <v-select v-model="filters.severity" :items="severityOptions" :label="t('integrationCompliance.filters.severity')" clearable density="comfortable" hide-details class="complianceView__filter" />
        <v-select v-model="filters.status" :items="statusOptions" :label="t('integrationCompliance.filters.status')" clearable density="comfortable" hide-details class="complianceView__filter" />
      </template>

      <template #loading>
        <ComplianceSummaryPanel :items="summaryRows" :state="summaryState" :active-code="filters.integrationCode" @select="toggleIntegration" @retry="loadSummary" />
        <EkSkeleton type="table" />
      </template>

      <template #empty>
        <!-- Önce "sorun yok" mesajı (sayfanın asıl yanıtı), sonra özet: kullanıcı ekranın durumunu kaydırmadan görür. -->
        <div class="complianceView__empty">
          <EkEmptyState variant="no-data" :title="t('integrationCompliance.empty.title')" :message="t('integrationCompliance.empty.message')" />
          <p class="complianceView__empty-note">
            <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
            {{ t('integrationCompliance.empty.note') }}
          </p>
        </div>
        <ComplianceSummaryPanel :items="summaryRows" :state="summaryState" :active-code="filters.integrationCode" @select="toggleIntegration" @retry="loadSummary" />
      </template>

      <template #empty-filtered>
        <ComplianceSummaryPanel :items="summaryRows" :state="summaryState" :active-code="filters.integrationCode" @select="toggleIntegration" @retry="loadSummary" />
        <EkEmptyState
          variant="no-results"
          :title="t('integrationCompliance.emptyFiltered.title')"
          :message="t('integrationCompliance.emptyFiltered.message')"
          show-action
          :action-text="t('integrationCompliance.emptyFiltered.action')"
          action-icon="mdi-filter-off-outline"
          @action="clearFilters"
        />
      </template>

      <template #error>
        <ComplianceSummaryPanel :items="summaryRows" :state="summaryState" :active-code="filters.integrationCode" @select="toggleIntegration" @retry="loadSummary" />
        <EkErrorState :message="loadError ?? ''" @retry="loadList" />
      </template>

      <ComplianceSummaryPanel :items="summaryRows" :state="summaryState" :active-code="filters.integrationCode" @select="toggleIntegration" @retry="loadSummary" />

      <section class="complianceView__findings" aria-labelledby="compliance-findings-title">
        <div class="complianceView__findings-header">
          <h2 id="compliance-findings-title" class="complianceView__findings-title">{{ t('integrationCompliance.table.title') }}</h2>
          <span class="complianceView__findings-count ek-num">{{ t('integrationCompliance.table.count', { n: visibleRows.length }) }}</span>
        </div>

        <EkDataTable :items="visibleRows" :columns="columns" row-key="dedupKey" :aria-label="t('integrationCompliance.table.ariaLabel')">
          <template #cell-integrationCode="{ item }">
            <EkPlatformMark :name="integrationName(item.integrationCode)" :code="item.integrationCode" />
          </template>
          <template #cell-subjectKey="{ item }">
            <span class="complianceView__subject">
              <code class="complianceView__subject-key" :title="item.subjectKey">{{ item.subjectKey }}</code>
              <span class="complianceView__subject-kind">{{ kindLabel(item.kind) }} · {{ sourceLabel(item.source) }}</span>
            </span>
          </template>
          <template #cell-severity="{ item }">
            <EkStatusChip :tone="FINDING_SEVERITY_TONE[item.severity as FindingSeverity].tone" :label="t(FINDING_SEVERITY_TONE[item.severity as FindingSeverity].labelKey)" />
          </template>
          <template #cell-status="{ item }">
            <span class="complianceView__status">
              <EkStatusChip :tone="FINDING_STATUS_TONE[item.status as FindingStatus].tone" :label="t(FINDING_STATUS_TONE[item.status as FindingStatus].labelKey)" />
              <span class="complianceView__confirmed">
                <v-icon :icon="item.confirmed ? 'mdi-check-decagram-outline' : 'mdi-timer-sand'" size="14" aria-hidden="true" />
                {{ t(item.confirmed ? 'integrationCompliance.confirmed.yes' : 'integrationCompliance.confirmed.no') }}
              </span>
            </span>
          </template>
          <template #cell-actions="{ item }">
            <v-btn icon="mdi-eye-outline" variant="text" density="comfortable" :aria-label="t('integrationCompliance.table.openDetail', { subject: item.subjectKey })" @click="openDetail(item as FindingListItem)" />
          </template>
        </EkDataTable>
      </section>
    </EkListPage>

    <ComplianceFindingSheet
      v-model="detailOpen"
      :finding="selected"
      :integration-name="selected ? integrationName(selected.integrationCode) : ''"
      @updated="onUpdated"
    />
   </PlatformAdminGuard>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EkListPage from '@/components/ds/templates/EkListPage.vue'
import EkDataTable, { type EkTableColumn } from '@/components/ds/EkDataTable.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import EkErrorState from '@/components/ds/EkErrorState.vue'
import EkSkeleton from '@/components/ds/EkSkeleton.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkPlatformMark from '@/components/ds/EkPlatformMark.vue'
import { FINDING_SEVERITY_TONE, FINDING_STATUS_TONE } from '@/design/status-map'
import useUser from '@/composables/user'
import PlatformAdminGuard from '@/components/adminPanel/integrations/PlatformAdminGuard.vue'
import ComplianceSummaryPanel from '@/components/adminPanel/integrations/ComplianceSummaryPanel.vue'
import ComplianceFindingSheet from '@/components/adminPanel/integrations/ComplianceFindingSheet.vue'
import {
  FINDING_KINDS, FINDING_SEVERITIES, FINDING_STATUSES, INTEGRATION_CATEGORIES,
  isErrorShapedResponse, serverErrorMessage, useIntegrationComplianceApi,
  type ComplianceSummaryItem, type FindingDetail, type FindingKind, type FindingListItem, type FindingSeverity,
  type FindingStatus, type IntegrationCategory,
} from '@/components/adminPanel/integrations/useIntegrationComplianceApi'

const { t, te } = useI18n()
const { isPlatformAdmin } = useUser()
const api = useIntegrationComplianceApi()

// ---- Özet (summary) ----
const summaryRows = ref<ComplianceSummaryItem[]>([])
const summaryState = ref<'loading' | 'ready' | 'error'>('loading')

async function loadSummary() {
  if (!isPlatformAdmin()) return
  summaryState.value = 'loading'
  const res: any = await api.summary()
  if (Array.isArray(res)) {
    summaryRows.value = res
    summaryState.value = 'ready'
  } else {
    summaryState.value = 'error'
  }
}

// ---- Liste ----
const rows = ref<FindingListItem[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
let listRequestSeq = 0

const search = ref('')
const filters = reactive<{
  integrationCode: string | null
  category: IntegrationCategory | null
  kind: FindingKind | null
  severity: FindingSeverity | null
  status: FindingStatus | null
}>({ integrationCode: null, category: null, kind: null, severity: null, status: null })

const hasServerFilter = computed(() => Object.values(filters).some((v) => !!v))

async function loadList() {
  if (!isPlatformAdmin()) { loading.value = false; return } // yetkisiz: gereksiz RPC yok (guard render'ı zaten engeller)
  const seq = ++listRequestSeq
  loading.value = true
  loadError.value = null
  const res: any = await api.list({
    integrationCode: filters.integrationCode ?? undefined,
    category: filters.category ?? undefined,
    kind: filters.kind ?? undefined,
    severity: filters.severity ?? undefined,
    status: filters.status ?? undefined,
  })
  if (seq !== listRequestSeq) return // daha yeni bir filtre isteği yola çıktı; eski yanıt yok sayılır
  if (Array.isArray(res)) {
    rows.value = res
  } else {
    const fallback = t('integrationCompliance.loadError')
    loadError.value = isErrorShapedResponse(res) ? serverErrorMessage(res, fallback) : fallback
  }
  loading.value = false
}

function refreshAll() {
  void loadSummary()
  void loadList()
}

watch(filters, () => { void loadList() })

// ---- Etiketler ----
function labelOr(key: string, fallback: string) { return te(key) ? t(key) : fallback }
function kindLabel(kind: string) { return labelOr(`integrationCompliance.kind.${kind}`, kind) }
function sourceLabel(source: string) { return labelOr(`integrationCompliance.source.${source}`, source) }
function categoryLabel(code: string) { return labelOr(`integrationCompliance.category.${code}`, code) }
function integrationName(code: string) {
  return summaryRows.value.find((s) => s.integrationCode === code)?.displayName ?? code
}

// ---- Filtre seçenekleri ----
const integrationOptions = computed(() => {
  const codes = new Map<string, string>()
  for (const s of summaryRows.value) codes.set(s.integrationCode, s.displayName)
  for (const r of rows.value) if (!codes.has(r.integrationCode)) codes.set(r.integrationCode, r.integrationCode)
  return Array.from(codes, ([value, title]) => ({ value, title }))
})
const categoryOptions = computed(() => INTEGRATION_CATEGORIES.map((c) => ({ value: c, title: categoryLabel(c) })))
const kindOptions = computed(() => FINDING_KINDS.map((k) => ({ value: k, title: kindLabel(k) })))
const severityOptions = computed(() => FINDING_SEVERITIES.map((s) => ({ value: s, title: t(FINDING_SEVERITY_TONE[s].labelKey) })))
const statusOptions = computed(() => FINDING_STATUSES.map((s) => ({ value: s, title: t(FINDING_STATUS_TONE[s].labelKey) })))

type FilterKey = keyof typeof filters
const activeFilters = computed(() => {
  const chip = (key: FilterKey, value: string) => ({ key, label: t('integrationCompliance.filters.chip', { label: t(`integrationCompliance.filters.${key === 'integrationCode' ? 'integration' : key}`), value }) })
  const list: { key: string; label: string }[] = []
  if (filters.integrationCode) list.push(chip('integrationCode', integrationName(filters.integrationCode)))
  if (filters.category) list.push(chip('category', categoryLabel(filters.category)))
  if (filters.kind) list.push(chip('kind', kindLabel(filters.kind)))
  if (filters.severity) list.push(chip('severity', t(FINDING_SEVERITY_TONE[filters.severity].labelKey)))
  if (filters.status) list.push(chip('status', t(FINDING_STATUS_TONE[filters.status].labelKey)))
  return list
})

function removeFilter(key: string) {
  if (key in filters) filters[key as FilterKey] = null
}
function clearFilters() {
  search.value = ''
  filters.integrationCode = null
  filters.category = null
  filters.kind = null
  filters.severity = null
  filters.status = null
}
function toggleIntegration(code: string) {
  filters.integrationCode = filters.integrationCode === code ? null : code
}

// ---- Görünür satırlar: yerel arama + şiddet sırası ----
const SEVERITY_RANK: Record<FindingSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

const visibleRows = computed(() => {
  const q = search.value.trim().toLocaleLowerCase('tr-TR')
  const filtered = q
    ? rows.value.filter((r) => r.subjectKey.toLocaleLowerCase('tr-TR').includes(q) || integrationName(r.integrationCode).toLocaleLowerCase('tr-TR').includes(q))
    : rows.value
  return filtered
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (SEVERITY_RANK[a.r.severity] - SEVERITY_RANK[b.r.severity]) || (a.i - b.i))
    .map(({ r }) => r)
})

const viewState = computed(() => {
  if (loading.value) return 'loading'
  if (loadError.value) return 'error'
  if (rows.value.length === 0 && !hasServerFilter.value && !search.value.trim()) return 'empty'
  if (visibleRows.value.length === 0) return 'empty-filtered'
  return 'ready'
})

const columns = computed<EkTableColumn[]>(() => [
  // Şiddet ilk sütun: liste şiddete göre sıralı (triaj önceliği) ve dar ekranda yatay kaydırmadan görünür kalır.
  { key: 'severity', label: t('integrationCompliance.table.severity') },
  { key: 'integrationCode', label: t('integrationCompliance.table.integration') },
  { key: 'subjectKey', label: t('integrationCompliance.table.subject') },
  { key: 'status', label: t('integrationCompliance.table.status') },
  { key: 'affectedTenantsCount', label: t('integrationCompliance.table.tenants'), type: 'number' },
  { key: 'occurrences', label: t('integrationCompliance.table.occurrences'), type: 'number' },
  { key: 'lastSeenAt', label: t('integrationCompliance.table.lastSeen'), type: 'datetime' },
  { key: 'actions', label: '', type: 'actions' },
])

// ---- Detay ----
const selected = ref<FindingListItem | null>(null)
const detailOpen = ref(false)

function openDetail(item: FindingListItem) {
  selected.value = item
  detailOpen.value = true
}

/** Geçiş sonrası: satırı yerinde güncelle (liste DTO alanları), özet sayıları yeniden çek. */
function onUpdated(d: FindingDetail) {
  const idx = rows.value.findIndex((r) => r.dedupKey === d.dedupKey)
  const { affectedTenants: _ids, evidence: _ev, recommendation: _rec, decidedBy: _by, decidedAt: _at, notes: _n, closedAt: _c, ...listItem } = d
  if (idx >= 0) rows.value.splice(idx, 1, listItem)
  selected.value = listItem
  void loadSummary()
}

function initialize() {
  void loadSummary()
  void loadList()
}

onMounted(initialize)

defineExpose({
  initialize,
  activate: initialize,
})
</script>

<style scoped>
.complianceView__filter {
  flex: 0 1 168px;
  min-width: 140px;
}

.complianceView {
  min-width: 0;
  /* Aşama 3: diğer ekranlarla aynı sayfa kenar boşluğu (içerik sol menüye yapışıyordu). */
  padding: var(--ek-space-6);
}

.complianceView__findings {
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.complianceView__findings-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ek-space-2);
}

.complianceView__findings-title {
  font-size: var(--ek-font-size-lg);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  margin: 0;
}

.complianceView__findings-count {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}

.complianceView__subject {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  max-width: 280px;
}

.complianceView__subject-key {
  font-family: var(--ek-font-mono);
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.complianceView__subject-kind {
  font-size: var(--ek-font-size-xs);
  /* Tablo satır zemini (`surface-muted`) üzerinde `content-muted` 4,48:1 — AA için `content-default`. */
  color: var(--ek-color-content-default);
}

.complianceView__status {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.complianceView__confirmed {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  font-size: var(--ek-font-size-xs);
  /* Satır zemini (`surface-muted`) üzerinde `content-muted` 4,48:1 — AA için `content-default`. */
  color: var(--ek-color-content-default);
  white-space: nowrap;
}

.complianceView__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-2);
  margin-bottom: var(--ek-space-8);
}

.complianceView__empty-note {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  max-width: 560px;
  margin: 0;
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
  text-align: left;
}
</style>
