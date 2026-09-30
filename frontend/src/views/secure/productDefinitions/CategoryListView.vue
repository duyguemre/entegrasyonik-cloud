<!--
  frontend/src/views/secure/productDefinitions/CategoryListView.vue

  B7 (cloud/fe-b7) — Kategoriler sayfası: başlık satırı (EkPageHeader) + ana-detay (CatalogSplit).
    sol  : kategori ağacı (CategoryTree — arama/vurgu, "eşlemesi eksik" süzgeci, satır içi ekle/yeniden adlandır,
           sürükle-bırak + klavye ile sıra/taşı, eşleme noktaları)
    sağ  : seçim yokken genel bakış (sayılar, platform kapsaması, otomatik eşleştirme); seçimde CategoryDetail
           (özet + MEVCUT CategorySyncComponent: kaydet/sil + platform/seçenek eşleme).
  Uç noktalar ve istek gövdeleri DEĞİŞMEDİ: CategoryService (GET, addCategory, updateCategory, moveCategory,
  changeOrderCategory), AttributeMappingService (GET, autoMatchAllCategories). Eski bileşenler (CategoryListComponent,
  CategoryTreeComponent) Kategori Tanımları ekranında aynen duruyor. Geri alma: bu dosya + src/components/catalogPages/.
-->
<template>
  <div class="categoryListView cat-page">
    <EkPageHeader
      section="Katalog"
      :title="$t('menu.productDefinitions.categoryList')"
      description="Ürünlerinizi gruplayan kategori ağacı ve her kategorinin pazaryeri kategorisiyle eşlemesi."
      :tips="[
        'Satıra tıklayın ya da Enter: ayrıntı ve pazaryeri eşleme paneli sağda açılır.',
        'F2 ile yeniden adlandırın; Alt+↑/↓ ile sırayı değiştirin; satırı başka bir kategorinin üstüne sürükleyerek taşıyın.',
        'Noktalar platform başına eşleme durumunu gösterir: dolu = eşli, boş halka = eşlenmedi.',
      ]"
      :primary-action="{ label: 'Kategori ekle', icon: 'mdi-plus', onClick: () => startAdd(null) }"
      refreshable
      :refreshing="loading"
      @refresh="reloadAll()"
    />

    <CatalogSplit
      :detail-open="!!selected"
      list-label="Kategori ağacı"
      :detail-label="selected ? `${selected.title} ayrıntıları` : 'Kategori özeti'"
      back-label="Tüm kategoriler"
      @back="closeDetail"
      @update:narrow="(v: boolean) => (narrow = v)"
    >
      <template #list>
        <div class="cat-pane" @pointerdown="refreshMappingsSoon">
          <header class="cat-pane__head">
            <div class="cat-pane__titles">
              <h2 class="cat-pane__title">Kategori ağacı</h2>
              <p class="cat-pane__meta ek-num" aria-live="polite">{{ metaText }}</p>
            </div>
            <div v-if="tree.total" class="cat-pane__tools">
              <EkTooltip text="Tümünü aç">
                <EkButton tone="ghost" size="sm" icon="mdi-unfold-more-horizontal" icon-only aria-label="Tümünü aç" @click="treeRef?.expandAll()" />
              </EkTooltip>
              <EkTooltip text="Tümünü kapat">
                <EkButton tone="ghost" size="sm" icon="mdi-unfold-less-horizontal" icon-only aria-label="Tümünü kapat" @click="treeRef?.collapseAll()" />
              </EkTooltip>
            </div>
          </header>

          <div v-if="tree.total || query" class="cat-pane__toolbar">
            <v-text-field
              v-model="query"
              class="cat-pane__search"
              type="search"
              label="Kategorilerde ara"
              prepend-inner-icon="mdi-magnify"
              clearable
              hide-details
              density="compact"
              autocomplete="off"
              @keydown.down.prevent="treeRef?.focusTree()"
              @click:clear="query = ''"
            />
            <CatSegmented v-if="platforms.length" v-model="filterMode" label="Göster" :options="filterOptions" />
          </div>

          <div class="cat-pane__body">
            <div v-if="loading && !tree.total" class="cat-pane__skeleton" aria-busy="true" aria-label="Kategoriler yükleniyor">
              <span v-for="i in 9" :key="i" class="cat-pane__sk-row" :class="`is-w${(i % 4) + 1}`"></span>
            </div>
            <EkProblemState
              v-else-if="problem && !tree.total"
              title="Kategoriler yüklenemedi"
              :cause="problem.cause"
              :action="problem.action"
              :tone="problem.tone"
              :details="problem.details"
              :retrying="loading"
              @retry="reloadAll()"
            />
            <div v-else-if="!tree.total && !adding" class="cat-pane__empty">
              <EkEmptyState variant="first-run" title="Henüz kategori yok"
                message="Ürünlerinizi gruplamak için ilk ana kategoriyi ekleyin; alt kategorileri sonra ağaçtan ekleyebilirsiniz."
                show-action action-text="İlk kategoriyi ekle" @action="startAdd(null)" />
            </div>
            <template v-else>
              <div v-if="noResults" class="cat-pane__empty">
                <EkEmptyState
                  :variant="query ? 'no-results' : 'no-data'"
                  :title="query ? `“${query}” ile eşleşen kategori yok` : 'Eşlemesi eksik kategori yok'"
                  :message="query ? 'Yazımı kontrol edin ya da daha kısa bir ifade deneyin. Aramada Türkçe karakterler şart değil (tisort → Tişört).' : 'Tüm yaprak kategoriler bağlı platformların hepsinde eşli.'"
                  show-action
                  :action-text="query ? 'Aramayı temizle' : 'Tümünü göster'"
                  :action-icon="query ? 'mdi-close' : 'mdi-format-list-bulleted'"
                  @action="query ? (query = '') : (filterMode = 'all')"
                />
              </div>
              <CategoryTree
                ref="treeRef"
                :tree="tree"
                :index="mappingIndex"
                :platforms="platforms"
                :stats="stats"
                :selected-id="selectedId"
                :query="query ?? ''"
                :only-missing="filterMode === 'missing'"
                :busy="busy"
                label="Kategori ağacı"
                @select="select"
                @add="addCategory"
                @rename="renameCategory"
                @move="moveCategory"
                @reorder="reorderCategory"
                @cancel="adding = false"
              />
            </template>
          </div>
        </div>
      </template>

      <template #detail>
        <Transition name="cat-swap" mode="out-in">
          <CategoryDetail
            v-if="selected"
            :key="selected.id"
            :node="selected"
            :tree="tree"
            :index="mappingIndex"
            :platforms="platforms"
            :stats="stats.get(selected.id)"
            @select="select"
            @close="closeDetail"
            @add-child="(n) => startAdd(n.id)"
            @show-missing="showMissing"
            @deleted="onDeleted"
          />
          <CatalogOverview
            v-else
            title="Kategori özeti"
            :lead="tree.total ? 'Bir kategori seçin ya da eşlemesi eksik olanlardan başlayın.' : 'Ağaç boş. Soldan ilk ana kategoriyi ekleyin; eşleme özeti burada belirir.'"
            :empty="!tree.total"
            icon="mdi-shape-outline"
            unit="yaprak"
            :stats="overviewStats"
            :coverage="coverage"
            :missing="missingLeaves"
            :keys="[
              { keys: '↑/↓', label: 'gezin' },
              { keys: '→/←', label: 'aç / kapat' },
              { keys: 'F2', label: 'yeniden adlandır' },
              { keys: ['Alt', '↑'], label: 'sırala' },
            ]"
            @show-missing="showMissing"
          >
            <template #extra>
              <section class="cat-auto" aria-labelledby="cat-auto-title">
                <div class="cat-auto__text">
                  <h3 id="cat-auto-title" class="cat-auto__title">
                    <v-icon icon="mdi-auto-fix" size="18" aria-hidden="true" /> Otomatik eşleştirme
                  </h3>
                  <p class="cat-auto__lead">
                    Eşleşmemiş <strong>yaprak</strong> kategorileri yapay zeka desteğiyle pazaryeri kategorileriyle eşler.
                    Mevcut manuel eşleşmeler korunur, yalnız boş olanlar doldurulur; benzer adlı kategorilerde hata olabilir —
                    işlem sonrası kontrol etmeniz önerilir.
                  </p>
                </div>
                <EkButton tone="secondary" icon="mdi-flash-outline" :loading="autoMatching" :disabled="!tree.leafCount" @click="autoMatch">
                  Otomatik eşleştir
                </EkButton>
              </section>
            </template>
          </CatalogOverview>
        </Transition>
      </template>
    </CatalogSplit>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import EkPageHeader from '@/components/ds/EkPageHeader.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkTooltip from '@/components/ds/EkTooltip.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import EkProblemState from '@/components/ds/EkProblemState.vue'
import CatalogSplit from '@/components/catalogPages/CatalogSplit.vue'
import CatalogOverview from '@/components/catalogPages/CatalogOverview.vue'
import CatSegmented from '@/components/catalogPages/CatSegmented.vue'
import CategoryTree from '@/components/catalogPages/CategoryTree.vue'
import CategoryDetail from '@/components/catalogPages/CategoryDetail.vue'
import {
  buildCategoryTree,
  categoryMappingIndex,
  groupStats,
  platformCoverage,
  visibleSpec,
  type CatNode,
  type PlatformRef,
} from '@/components/catalogPages/catalogModel'
import useRestApi from '@/composables/restapi'
import { problemFromError, type ProblemCopy } from '@/composables/useProblem'
import { useToast } from '@/composables/useToast'
import { channelName } from '@/design/channels'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useAttributeMappingStore } from '@/stores/site/attributeMapping'

const restApi = useRestApi()
const { showToast } = useToast()
const categoriesStore = useCategoriesStore()
const integrationStore = useIntegrationStore()
const mappingStore = useAttributeMappingStore()

// ------------------------------------------------------------------ veri
const raw = ref<any[]>([])
const loading = ref(false)
const problem = ref<ProblemCopy | null>(null)
const busy = ref(false)

async function load() {
  loading.value = true
  try {
    const resp: any = await restApi.get('CategoryService')
    if (Array.isArray(resp)) {
      raw.value = resp
      problem.value = null
    } else {
      problem.value = problemFromError(resp, 'CategoryService') ?? { action: 'Tekrar deneyin.', details: [{ label: 'Servis', value: 'CategoryService' }], tone: 'error' }
    }
  } finally {
    loading.value = false
  }
}

async function reloadAll() {
  await Promise.all([load(), mappingStore.retrieveAttributeMappings()])
}

// Mevcut panel (CategorySyncComponent) güncelle/sil sonrası kategori deposunu yeniler → ağaç onu benimser.
const storeCategories = categoriesStore.getCategories()
watch(storeCategories, (v) => {
  if (Array.isArray(v) && v.length) raw.value = v
})

let lastMappingFetch = 0
function refreshMappingsSoon() {
  const now = Date.now()
  if (now - lastMappingFetch < 4000) return
  lastMappingFetch = now
  mappingStore.retrieveAttributeMappings()
}

onMounted(() => {
  lastMappingFetch = Date.now()
  reloadAll()
})

const tree = computed(() => buildCategoryTree(raw.value))
const platforms = computed<PlatformRef[]>(() =>
  [...(integrationStore.getClientMarketplaces() ?? []), ...(integrationStore.getClientECommerces() ?? [])].map((p: any) => ({
    code: String(p.code),
    name: channelName(p.code, integrationStore.getIntegrationTitle(p.code)),
  })),
)
const mappingIndex = computed(() => categoryMappingIndex(mappingStore.mappings))
const stats = computed(() => groupStats(tree.value, mappingIndex.value, platforms.value))
const coverage = computed(() => platformCoverage(tree.value, mappingIndex.value, platforms.value))
const missingLeaves = computed(() => tree.value.roots.reduce((n, r) => n + (stats.value.get(r.id)?.missing ?? 0), 0))

// ------------------------------------------------------------------ arama / süzgeç
const query = ref<string | null>('')
const filterMode = ref<'all' | 'missing'>('all')
const filterOptions = computed(() => [
  { value: 'all', label: 'Tümü' },
  { value: 'missing', label: 'Eşlemesi eksik', count: missingLeaves.value },
])
const spec = computed(() => visibleSpec(tree.value, query.value ?? '', filterMode.value === 'missing', mappingIndex.value, platforms.value))
const noResults = computed(() => !!spec.value.visible && spec.value.visible.size === 0)

const metaText = computed(() => {
  if (loading.value && !tree.value.total) return 'Yükleniyor…'
  const q = (query.value ?? '').trim()
  if (q) return `${spec.value.hits.size} eşleşme · ${tree.value.total} kategori`
  if (filterMode.value === 'missing') return `${missingLeaves.value} yaprakta eşleme eksik`
  return `${tree.value.total} kategori · ${tree.value.leafCount} yaprak`
})

const overviewStats = computed(() => [
  { label: 'Kategori', value: tree.value.total },
  { label: 'Yaprak', value: tree.value.leafCount },
  platforms.value.length
    ? { label: 'Eşlemesi eksik', value: missingLeaves.value, tone: missingLeaves.value ? ('warning' as const) : ('success' as const) }
    : { label: 'Ana kategori', value: tree.value.roots.length },
])

function showMissing() {
  query.value = ''
  filterMode.value = 'missing'
}

// ------------------------------------------------------------------ seçim
const treeRef = ref<InstanceType<typeof CategoryTree> | null>(null)
const selectedId = ref<string | null>(null)
const selected = computed<CatNode | null>(() => (selectedId.value ? tree.value.byId.get(selectedId.value) ?? null : null))

watch(tree, (t) => {
  if (selectedId.value && !t.byId.has(selectedId.value)) selectedId.value = null
})

const narrow = ref(false)

/** Dar ekranda gruba dokunmak yalnız açar/kapatır (ağaçta gezinme sürer); ayrıntı Enter / menü / yaprakla açılır. */
function select(n: CatNode, explicit = true) {
  if (narrow.value && !explicit && n.children.length) return
  const changed = selectedId.value !== n.id
  selectedId.value = n.id
  treeRef.value?.reveal(n.id, false)
  if (changed) refreshMappingsSoon()
}

function closeDetail() {
  const id = selectedId.value
  selectedId.value = null
  if (id) nextTick(() => treeRef.value?.reveal(id))
}

function onDeleted() {
  selectedId.value = null
  load()
}

// ------------------------------------------------------------------ değişiklikler (mevcut uç noktalar)
const adding = ref(false)

function startAdd(parentId: string | null) {
  selectedId.value = parentId ? selectedId.value : null
  adding.value = true
  query.value = ''
  filterMode.value = 'all'
  nextTick(() => treeRef.value?.startAdd(parentId))
}

const failed = (message: string) => showToast({ tone: 'error', title: 'İşlem tamamlanamadı', message })

async function addCategory(parentId: string | null, title: string) {
  busy.value = true
  try {
    const resp: any = await restApi.post('CategoryService/addCategory', { parentCategoryId: parentId ?? tree.value.mainId ?? undefined, title })
    if (resp && resp._id) {
      treeRef.value?.finishEdit()
      adding.value = false
      await load()
      const id = String(resp._id)
      selectedId.value = id
      nextTick(() => treeRef.value?.reveal(id))
      showToast({ tone: 'success', message: `“${title}” kategorisi eklendi.` })
    } else failed('Kategori eklenemedi. Tekrar deneyin.')
  } finally {
    busy.value = false
  }
}

async function renameCategory(n: CatNode, title: string) {
  busy.value = true
  try {
    const resp: any = await restApi.post('CategoryService/updateCategory', { categoryId: n.id, title })
    if (resp && resp.result) {
      treeRef.value?.finishEdit()
      await load()
      nextTick(() => treeRef.value?.reveal(n.id))
      showToast({ tone: 'success', message: `Kategori adı “${title}” olarak güncellendi.` })
    } else failed('Kategori adı güncellenemedi.')
  } finally {
    busy.value = false
  }
}

async function moveCategory(n: CatNode, newParentId: string) {
  busy.value = true
  try {
    const resp: any = await restApi.post('CategoryService/moveCategory', { moveCategoryId: n.id, moveInCategoryId: newParentId })
    if (resp && resp.result && resp.result.acknowledged == true) {
      await load()
      nextTick(() => treeRef.value?.reveal(n.id))
      const target = tree.value.byId.get(newParentId)
      showToast({ tone: 'success', message: target ? `“${n.title}”, “${target.title}” altına taşındı.` : `“${n.title}” ana seviyeye taşındı.` })
    } else failed('Kategori taşınamadı.')
  } finally {
    busy.value = false
  }
}

async function reorderCategory(n: CatNode, target: CatNode) {
  busy.value = true
  try {
    const resp: any = await restApi.post('CategoryService/changeOrderCategory', { fromCategoryId: n.id, toCategoryId: target.id })
    if (resp?.result?.fromResp?.acknowledged == true && resp?.result?.toResp?.acknowledged == true) {
      await load()
      nextTick(() => treeRef.value?.reveal(n.id))
    } else failed('Sıra değiştirilemedi.')
  } finally {
    busy.value = false
  }
}

const autoMatching = ref(false)
async function autoMatch() {
  autoMatching.value = true
  try {
    const resp: any = await restApi.post('AttributeMappingService/autoMatchAllCategories', {})
    if (resp && resp.result) {
      showToast({ tone: 'success', message: `${resp.matchedCount ?? 0} yeni kategori eşleştirildi. Sonuçları kontrol etmeyi unutmayın.` })
      await mappingStore.retrieveAttributeMappings()
    } else failed('Otomatik eşleştirme tamamlanamadı.')
  } finally {
    autoMatching.value = false
  }
}

// Sekme kapatılırken (WorkspaceTabHost) çağrılır — eski ekranla aynı dışa açım.
const destroyComponent = () => {
  selectedId.value = null
}
defineExpose({ destroyComponent })
</script>

<style scoped>
.cat-page {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

@media (max-width: 767px) {
  .cat-page {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}

.cat-pane {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.cat-pane__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-4) 0 var(--ek-space-5);
}

.cat-pane__titles {
  flex: 1;
  min-width: 0;
}

.cat-pane__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.cat-pane__meta {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.cat-pane__tools {
  display: flex;
  flex: none;
  gap: 2px;
}

.cat-pane__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-3) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.cat-pane__search {
  flex: 1 1 200px;
  min-width: 0;
}

.cat-pane__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.cat-pane__empty {
  padding: var(--ek-space-4);
}

.cat-pane__skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding: var(--ek-space-5);
}

.cat-pane__sk-row {
  height: 12px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-sunken);
}

.cat-pane__sk-row.is-w1 { width: 62%; }
.cat-pane__sk-row.is-w2 { width: 48%; margin-left: 28px; }
.cat-pane__sk-row.is-w3 { width: 40%; margin-left: 56px; }
.cat-pane__sk-row.is-w4 { width: 54%; margin-left: 28px; }

.cat-auto {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ek-space-3) var(--ek-space-4);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
}

.cat-auto__text {
  flex: 1 1 280px;
  min-width: 0;
}

.cat-auto__title {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-1);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.cat-auto__title .v-icon {
  color: var(--ek-color-action);
}

.cat-auto__lead {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.cat-auto__lead strong {
  color: var(--ek-color-content-default);
}

/* Detay değişimi: sakin çapraz geçiş (opaklık + distance-sm), A9 envanteriyle aynı süre/eğri. */
.cat-swap-enter-active {
  transition:
    opacity var(--ek-duration-base) var(--ek-easing-enter),
    transform var(--ek-duration-base) var(--ek-easing-enter);
}

.cat-swap-leave-active {
  transition: opacity var(--ek-duration-fast) var(--ek-easing-standard);
}

.cat-swap-enter-from {
  opacity: 0;
  transform: translateY(var(--ek-motion-distance-sm));
}

.cat-swap-leave-to {
  opacity: 0;
}
</style>
