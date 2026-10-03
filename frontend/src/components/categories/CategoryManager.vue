<!--
  frontend/src/components/categories/CategoryManager.vue

  "Kategoriler" ekranının tamamı (CategoryListView + CategoryDefinitionView bunu kullanır). Standart iskelet:
    EkPageBar (Katalog › Kategoriler + ampul; #status: "N kategori · M eksik eşleme") →
    ÇERÇEVESİZ araç şeridi: arama (36px; ağaçta eşleşenleri + üst dallarını gösterir, metni vurgular) ·
    segment [Tümü | Eksik eşlemeli] · sağ uçta birincil "+ Yeni kategori" →
    sol: kategori AĞACI (CategoryTree) · sağ: DETAY paneli (CategoryDetail; dar ekranda tam ekran sayfa).
  Yapılan iş DEĞİŞMEDİ — aynı uçlar ve gövdeler:
    CategoryService GET · addCategory { parentCategoryId, title } · updateCategory { categoryId, title } ·
    deleteCategory { _id } (+ AttributeMappingService/deleteFullMapping) · moveCategory { moveCategoryId, moveInCategoryId } ·
    changeOrderCategory { fromCategoryId, toCategoryId } · AttributeMappingService/autoMatchAllCategories {} ·
    kanal eşleme (CategoryChannelRow): saveCategoryMapping + kanal kategori/özellik listeleri.
  Eşleme kapsamı (karolar, "eksik eşleme" sayısı, süzgeç) için AttributeMappingService GET (tüm eşleme belgeleri; mevcut
  `attributeMapping` mağazası) okunur — kategori yanıtı eşlemeleri taşımaz.
-->
<template>
  <div class="cat-manager">
    <EkConfirmDialog :model-value="!!deleteTarget" :title="`'${deleteTarget?.title ?? ''}' kategorisi silinsin mi?`"
      :description="deleteDescription" :confirm-label="$t('common.delete')" :cancel-label="$t('common.cancel')"
      confirm-icon="mdi-trash-can-outline" icon="mdi-trash-can-outline" danger :loading="deleteBusy" attach=".cat-manager"
      @update:model-value="(v: boolean) => { if (!v) deleteTarget = null }" @confirm="confirmDelete" />

    <EkConfirmDialog v-model="autoMatchOpen" title="Eşleşmemiş kategoriler otomatik eşleştirilsin mi?"
      description="Eşleşmemiş uç kategorileriniz yapay zekâ desteğiyle Trendyol kategorileriyle eşleştirilir. Mevcut manuel eşleşmeleriniz korunur, yalnızca boş olanlar doldurulur. Benzer isimli kategorilerde hatalı eşleştirme olabilir; işlem sonrası eşleşmeleri kontrol edin."
      confirm-label="Eşleştirmeyi başlat" confirm-icon="mdi-flash-outline" icon="mdi-auto-fix" :loading="autoMatching"
      attach=".cat-manager" @confirm="runAutoMatch" />

    <EkDialogHost :model-value="!!moveSource" width="md" attach=".cat-manager" @update:model-value="(v: boolean) => { if (!v) moveSource = null }">
      <EkDialogCard v-if="moveSource" title="Başka bir kategorinin altına taşı" icon="mdi-file-move-outline"
        :description="`'${moveSource.title}' için yeni üst kategoriyi seçin.`" hide-actions @close="moveSource = null">
        <v-text-field v-model="moveQuery" variant="outlined" density="compact" hide-details clearable autofocus
          prepend-inner-icon="mdi-magnify" label="Kategori ara" class="cat-move__search" />
        <ul class="cat-move__list" aria-label="Hedef kategoriler">
          <li v-if="canMoveInto(moveSource, null) && matchesMove('Üst düzey')">
            <button type="button" class="cat-move__item" @click="moveTo(null)">
              <v-icon icon="mdi-file-tree-outline" size="16" aria-hidden="true" /><span>Üst düzey (ana kategori)</span>
            </button>
          </li>
          <li v-for="t in moveTargets" :key="t.id">
            <button type="button" class="cat-move__item" @click="moveTo(t)">
              <v-icon :icon="t.children.length ? 'mdi-folder-outline' : 'mdi-tag-outline'" size="16" aria-hidden="true" />
              <span>{{ t.path.join(' › ') }}</span>
            </button>
          </li>
          <li v-if="!moveTargets.length && !(canMoveInto(moveSource, null) && matchesMove('Üst düzey'))" class="cat-move__none">Uygun hedef bulunamadı.</li>
        </ul>
      </EkDialogCard>
    </EkDialogHost>

    <header class="cat-manager__head">
      <EkPageBar section="Katalog" :title="$t('menu.productDefinitions.categoryList')" refreshable :refreshing="refreshing"
        refresh-label="Yenile" @refresh="reload">
        <!-- FE-LOCAL-1052: sayaç çipleri Özet görünümüne taşındı; sağda Liste | Özet anahtarı. -->
        <template #actions><EkViewSwitch v-model="view" /></template>
      </EkPageBar>
    </header>

    <!-- Özet görünümü: ağaç + detayın YERİNE (sayılar bellekteki ağaç ve eşleme verisinden). -->
    <div v-if="view === 'summary'" class="cat-manager__dash">
      <MappingCoverageDashboard :cells="dashCells" :channels="dashChannels" :loading="isLoading"
        subtitle="Uç kategorilerin kanal kategorileriyle eşleme durumu" @select="onDashSelect" />
    </div>

    <div v-if="hasCategories || adding" v-show="view === 'list'" class="cat-manager__strip">
      <div class="cat-manager__search">
        <v-text-field v-model="searchText" label="Kategori ara" prepend-inner-icon="mdi-magnify" clearable hide-details
          density="compact" class="cat-manager__search-field" autocomplete="off" @keydown.esc="searchText = ''" />
        <div class="cat-seg" role="group" aria-label="Kategori filtresi">
          <button type="button" class="cat-seg__btn" :class="{ 'is-on': segment === 'all' }" :aria-pressed="segment === 'all'"
            @click="segment = 'all'">Tümü</button>
          <button type="button" class="cat-seg__btn" :class="{ 'is-on': segment === 'missing' }" :aria-pressed="segment === 'missing'"
            @click="segment = 'missing'">Eksik eşlemeli</button>
        </div>
      </div>
      <div class="cat-manager__strip-actions">
        <EkButton v-if="channels.length" tone="ghost" icon="mdi-flash-outline" class="cat-auto" @click="autoMatchOpen = true">Otomatik eşleştir</EkButton>
        <EkButton tone="primary" icon="mdi-plus" class="cat-new" @click="startAdd(null)">Yeni kategori</EkButton>
      </div>
    </div>

    <div v-show="view === 'list'" class="cat-manager__panes" :class="{ 'is-single': !hasCategories }">
      <section class="cat-panel cat-panel--tree" aria-label="Kategori listesi">
        <!-- FE-LOCAL-1048: panel başlığı (tablo başlığıyla aynı dil) — görsel etiket; bölümün adı `aria-label`da. -->
        <header v-if="hasCategories && !isLoading && !loadFailed" class="cat-panel__head" aria-hidden="true">
          <span class="cat-panel__label">Kategori ağacı</span>
          <span class="cat-panel__hint">Taşımak için sürükleyin</span>
        </header>
        <!-- yükleniyor -->
        <div v-if="isLoading" class="cat-state" role="status" aria-busy="true">
          <span class="ek-sr-only">Kategoriler yükleniyor</span>
          <v-skeleton-loader type="list-item-two-line@6" class="cat-skeleton" aria-hidden="true" />
        </div>
        <!-- hata -->
        <EkErrorState v-else-if="loadFailed" class="cat-state" message="Kategoriler yüklenemedi — Bağlantınızı kontrol edip tekrar deneyin."
          :retrying="refreshing" @retry="reload" />
        <!-- boş: ilk kullanım -->
        <div v-else-if="!hasCategories && !adding" class="cat-state cat-empty" role="status">
          <EkIconTile icon="mdi-shape-outline" tone="neutral" size="lg" />
          <p class="cat-empty__title">Henüz kategori yok</p>
          <p class="cat-empty__text">Ürünlerinizi gruplamak ve kanallardaki kategorilerle eşlemek için ilk kategorinizi ekleyin.</p>
          <EkButton tone="primary" icon="mdi-plus" @click="startAdd(null)">İlk kategorini ekle</EkButton>
        </div>
        <!-- süzgeç sonucu boş -->
        <div v-else-if="!rows.length && !adding" class="cat-state cat-empty" role="status">
          <EkIconTile icon="mdi-filter-remove-outline" tone="neutral" size="lg" />
          <p class="cat-empty__title">Kategori bulunamadı</p>
          <p class="cat-empty__text">{{ segment === 'missing' && !searchText ? 'Eşlemesi eksik uç kategori kalmadı.' : 'Arama veya filtreye uyan kategori yok. Yazımı kontrol edin ya da filtreyi temizleyin.' }}</p>
          <EkButton tone="secondary" size="sm" icon="mdi-filter-remove-outline" @click="clearFilters">Filtreleri temizle</EkButton>
        </div>
        <div v-else class="cat-panel__scroll">
          <CategoryTree ref="treeRef" :rows="rows" :tree="tree" :selected-id="selectedId" :coverage="coverage" :channels="channels"
            :mapping-ready="mappingReady" :query="searchText ?? ''" :match-ids="search.matchIds" :adding="adding" :add-busy="addBusy"
            :add-error="addError" :busy="actionBusy" :narrow="isNarrow" @select="selectCategory" @set-expanded="setExpanded" @add-child="startAdd"
            @add-submit="submitAdd" @add-cancel="cancelAdd" @move="(d: string, t: string) => moveCategory(d, t)" @swap="swapCategories" />
        </div>
      </section>

      <section v-if="hasCategories && (!isNarrow || selectedNode)" class="cat-panel cat-panel--detail" :class="{ 'is-sheet': isNarrow }"
        aria-label="Kategori ayrıntısı">
        <CategoryDetail v-if="selectedNode" :key="selectedNode.id" :node="selectedNode" :tree="tree" :channels="channels" :mappings="mappingIndex"
          :mapping-ready="mappingReady" :mapping-error="mappingFailed" :coverage="coverage" :show-back="isNarrow"
          :can-move-up="!!siblingOf(tree, selectedNode, -1)" :can-move-down="!!siblingOf(tree, selectedNode, 1)" :rename="renameCategory"
          @back="selectedId = null" @select="selectCategory" @action="onDetailAction" @retry-mappings="loadMappings" @mapping-saved="noop" />
        <div v-else class="cat-detail-empty">
          <EkIconTile icon="mdi-source-branch" tone="action" size="lg" />
          <h2 class="cat-detail-empty__title">Bir kategori seçin</h2>
          <p class="cat-detail-empty__text">Soldaki ağaçtan bir kategori seçerek adını düzenleyebilir, kanallardaki karşılığıyla eşleyebilirsiniz. Eşleme yalnızca alt kategorisi olmayan (uç) kategorilerde yapılır.</p>
          <p v-if="mappingReady && channels.length && missingCount > 0" class="cat-detail-empty__text">
            <strong class="ek-num">{{ missingCount }}</strong> uç kategoride eksik eşleme var.
            <button type="button" class="cat-link" @click="segment = 'missing'">Eksik olanları göster</button>
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { EkButton, EkConfirmDialog, EkDialogCard, EkDialogHost, EkErrorState, EkIconTile, EkStatusChip } from '@entegrasyonik/ui/components'
import EkPageBar from '@/components/page/EkPageBar.vue'
import EkViewSwitch, { type EkViewMode } from '@/components/page/EkViewSwitch.vue'
import type { ListSummaryCell } from '@/components/page/ListSummaryStrip.vue'
import MappingCoverageDashboard, { type MappingChannelCoverage } from '@/components/productDefinitions/definitions/MappingCoverageDashboard.vue'
import { formatNumber } from '@entegrasyonik/ui/format'
import CategoryTree from '@/components/categories/CategoryTree.vue'
import CategoryDetail from '@/components/categories/CategoryDetail.vue'
import useRestApi from '@/composables/restapi'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useAttributeMappingStore } from '@/stores/site/attributeMapping'
import { useSnackbarStore } from '@/stores/snackbarStore'
import {
  buildCategoryTree, canMoveInto, computeCoverage, countDescendants, fold, flattenVisible, incompleteVisibleIds,
  indexCategoryMappings, indexAttributeIssues, searchCategories, siblingOf, type CatNode,
} from '@/composables/categoryTree'

const restApi = useRestApi()
const categoriesStore = useCategoriesStore()
const integrationStore = useIntegrationStore()
const attributeMappingStore = useAttributeMappingStore()
const snackbarStore = useSnackbarStore()

const isNarrow = useMediaQuery('(max-width: 959px)')
const treeRef = ref<InstanceType<typeof CategoryTree> | null>(null)
const noop = () => {}

// ---- Veri ---------------------------------------------------------------------------------------------------------------
const rawCategories = categoriesStore.getCategories()
const tree = computed(() => buildCategoryTree(rawCategories.value))
const totalCount = computed(() => tree.value.byId.size)
const hasCategories = computed(() => tree.value.nodes.length > 0)

const platformName = (code: string) => integrationStore.getIntegrationTitle(code) || (code ? code.charAt(0).toUpperCase() + code.slice(1) : '')
/** Eşleme yapılabilen kanallar: bağlı pazaryerleri + e-ticaret platformları (eski ekranla aynı küme). */
const channels = computed(() =>
  [...(integrationStore.getClientMarketplaces() ?? []), ...(integrationStore.getClientECommerces() ?? [])]
    .map((i: any) => ({ code: String(i.code), title: platformName(i.code) })))

const refreshing = ref(false)
const isLoading = computed(() => !rawCategories.value && categoriesStore.status !== 'ready' && categoriesStore.status !== 'error')
const loadFailed = computed(() => categoriesStore.status === 'error' && !rawCategories.value)

const mappingLoaded = ref(false)
const mappingFailed = computed(() => !!attributeMappingStore.loadError)
const mappingReady = computed(() => mappingLoaded.value && !mappingFailed.value)
const mappingIndex = computed(() => indexCategoryMappings(attributeMappingStore.mappings))
const attributeIssues = computed(() => indexAttributeIssues(attributeMappingStore.mappings))
const coverage = computed(() => computeCoverage(tree.value, channels.value.map((c) => c.code), mappingIndex.value, attributeIssues.value))
const missingCount = computed(() => {
  if (!mappingReady.value || !channels.value.length) return 0
  let n = 0
  for (const c of coverage.value.values()) if (c.leaf && c.missing.length) n++
  return n
})
/** [eslesme-fiyat WP2, Ek C P1-9] Kategori her kanalda eşli ama özellik/değer sorunu (bayat ya da zorunlu özellikte değer yok) olan uç kategoriler. */
const partialCount = computed(() => {
  if (!mappingReady.value || !channels.value.length) return 0
  let n = 0
  for (const c of coverage.value.values()) if (c.leaf && !c.missing.length && c.partial.length) n++
  return n
})

// ---- Liste | Özet (FE-LOCAL-1052) -----------------------------------------------------------------------------------------
const view = ref<EkViewMode>('list')
const dashCells = computed<ListSummaryCell[]>(() => {
  let leaves = 0
  for (const c of coverage.value.values()) if (c.leaf) leaves++
  const parents = totalCount.value - leaves
  const known = mappingReady.value && channels.value.length > 0
  const cell = (key: string, label: string, n: number | null, icon: string, tone: ListSummaryCell['tone'], hint: string, clickable = false): ListSummaryCell => ({
    key, label, hint, icon, tone, value: n === null ? '—' : formatNumber(n), zero: !n, clickable,
  })
  return [
    cell('total', 'Kategori', totalCount.value, 'mdi-shape-outline', 'action', 'Tanımlı tüm kategoriler'),
    cell('parents', 'Üst kategori', parents, 'mdi-folder-outline', 'neutral', 'Alt kategorisi olan'),
    cell('leaves', 'Uç kategori', leaves, 'mdi-tag-outline', 'info', 'Ürün atanabilen, eşlenen'),
    cell('complete', 'Tam eşli', known ? leaves - missingCount.value - partialCount.value : null, 'mdi-check-circle-outline', 'success', 'Tüm kanallarda kategori ve özellik/değer eşlemesi tamam'),
    cell('partial', 'Kısmi eşli', known ? partialCount.value : null, 'mdi-alert-circle-outline', 'warning', 'Kategori eşli; özellik/değer eşlemesi bayat ya da zorunlu özellikte değer yok'),
    cell('missing', 'Eksik eşlemeli', known ? missingCount.value : null, 'mdi-minus-circle-outline', 'warning', 'Listede göstermek için tıklayın', known && missingCount.value > 0),
  ]
})
const dashChannels = computed<MappingChannelCoverage[]>(() => {
  if (!mappingReady.value) return []
  const leaves = [...coverage.value.values()].filter((c) => c.leaf)
  return channels.value.map((ch) => ({ code: ch.code, title: ch.title, total: leaves.length, mapped: leaves.filter((c) => c.mapped.includes(ch.code)).length }))
})
function onDashSelect(key: string) {
  if (key !== 'missing') return
  segment.value = 'missing'
  view.value = 'list'
}

async function loadMappings() {
  await attributeMappingStore.retrieveAttributeMappings()
  mappingLoaded.value = true
}
async function reload() {
  refreshing.value = true
  try { await Promise.all([categoriesStore.retrieve(), loadMappings()]) } finally { refreshing.value = false }
}

// ---- Arama / süzgeç / açık dallar ---------------------------------------------------------------------------------------
const searchText = ref<string | null>('')
const segment = ref<'all' | 'missing'>('all')
const query = computed(() => (searchText.value ?? '').trim())
const search = computed(() => searchCategories(tree.value, query.value))
const incompleteIds = computed(() => (mappingReady.value && channels.value.length ? incompleteVisibleIds(tree.value, coverage.value) : new Set<string>()))

const visibleIds = computed<Set<string> | null>(() => {
  const bySearch = query.value ? search.value.visibleIds : null
  const byMissing = segment.value === 'missing' ? incompleteIds.value : null
  if (bySearch && byMissing) return new Set([...bySearch].filter((id) => byMissing.has(id)))
  return bySearch ?? byMissing
})

const expanded = ref(new Set<string>())
const collapsed = ref(new Set<string>())
const autoOpen = computed(() => {
  const open = new Set<string>()
  if (query.value) for (const id of search.value.openIds) open.add(id)
  if (segment.value === 'missing') for (const id of incompleteIds.value) if (tree.value.byId.get(id)?.children.length) open.add(id)
  return open
})
const effectiveExpanded = computed(() => {
  const out = new Set<string>([...expanded.value, ...autoOpen.value])
  for (const id of collapsed.value) out.delete(id)
  return out
})
const rows = computed(() => flattenVisible(tree.value.nodes, { expanded: effectiveExpanded.value, visibleIds: visibleIds.value }))

watch([query, segment], () => { collapsed.value = new Set() })

function setExpanded(id: string, open: boolean) {
  const e = new Set(expanded.value)
  const c = new Set(collapsed.value)
  if (open) { e.add(id); c.delete(id) } else { e.delete(id); c.add(id) }
  expanded.value = e
  collapsed.value = c
}
function clearFilters() { searchText.value = ''; segment.value = 'all' }

// İlk veri geldiğinde üst düzey kategorilerin altlarını göster (yapı ilk bakışta okunur).
let seeded = false
watch(() => tree.value.nodes.length, (n) => {
  if (seeded || !n) return
  seeded = true
  expanded.value = new Set(tree.value.nodes.filter((x) => x.children.length).map((x) => x.id))
}, { immediate: true })

// ---- Seçim --------------------------------------------------------------------------------------------------------------
const selectedId = ref<string | null>(null)
const selectedNode = computed(() => (selectedId.value ? tree.value.byId.get(selectedId.value) ?? null : null))
watch(tree, (t) => { if (selectedId.value && !t.byId.has(selectedId.value)) selectedId.value = null })

function selectCategory(id: string) {
  selectedId.value = id
  // Uç kategoriye atlanırken (ör. eksik listesinden) ağaçta da görünür kıl.
  const node = tree.value.byId.get(id)
  if (node) for (const a of node.pathIds.slice(0, -1)) setExpanded(a, true)
}

// ---- Yeni kategori (ağaçta yerinde satır) --------------------------------------------------------------------------------
const adding = ref<{ parentId: string | null } | null>(null)
const addBusy = ref(false)
const addError = ref('')

function startAdd(parentId: string | null) {
  clearFilters()
  addError.value = ''
  if (parentId) setExpanded(parentId, true)
  if (isNarrow.value) selectedId.value = null // dar ekranda ağaç görünür olsun
  adding.value = { parentId }
  nextTick(() => document.querySelector('.cnr__input')?.scrollIntoView({ block: 'nearest' }))
}
function cancelAdd() { adding.value = null; addError.value = '' }

async function submitAdd(title: string) {
  if (!adding.value || addBusy.value) return
  const parentId = adding.value.parentId
  addBusy.value = true
  addError.value = ''
  try {
    const res = await categoriesStore.addCategory({ parentId: parentId ?? undefined, title })
    if ('id' in res && res.id) {
      adding.value = null
      if (parentId) setExpanded(parentId, true)
      selectedId.value = res.id
      snackbarStore.addSnackbar({ show: true, text: `'${title}' kategorisi eklendi.`, timeout: 3000, color: 'success' })
      await nextTick()
      treeRef.value?.focusRow(res.id)
    } else addError.value = 'Kategori eklenemedi — adı kontrol edip tekrar deneyin.'
  } catch {
    addError.value = 'Kategori eklenemedi — bağlantınızı kontrol edip tekrar deneyin.'
  } finally {
    addBusy.value = false
  }
}

// ---- Ad değiştirme ------------------------------------------------------------------------------------------------------
async function renameCategory(title: string): Promise<true | string> {
  const node = selectedNode.value
  if (!node) return 'Kategori bulunamadı — listeyi yenileyip tekrar deneyin.'
  try {
    const response: any = await restApi.post('CategoryService/updateCategory', { categoryId: node.id, title })
    if (response && response.result) {
      await categoriesStore.retrieve()
      return true
    }
  } catch { /* aşağıdaki ortak ileti */ }
  return 'Ad değiştirilemedi — bağlantınızı kontrol edip tekrar deneyin.'
}

// ---- Silme (onaylı) -----------------------------------------------------------------------------------------------------
const deleteTarget = ref<CatNode | null>(null)
const deleteBusy = ref(false)
const deleteDescription = computed(() => {
  const n = deleteTarget.value ? countDescendants(deleteTarget.value) : 0
  const base = 'Kategori ve kanal eşleştirmeleri kalıcı olarak silinir. Bu işlem geri alınamaz.'
  return n > 0 ? `Bu kategorinin ${n} alt kategorisi var; silinirse alt kategoriler ağaçta artık görünmez olur. Önce taşımanız önerilir. ${base}` : base
})

async function confirmDelete() {
  const node = deleteTarget.value
  if (!node) return
  deleteBusy.value = true
  try {
    const response: any = await restApi.post('CategoryService/deleteCategory', { _id: node.id })
    if (response && response.acknowledged) {
      await restApi.post('AttributeMappingService/deleteFullMapping', { localCategoryId: node.id, integrationCode: -1 })
      await Promise.all([categoriesStore.retrieve(), loadMappings()])
      if (selectedId.value === node.id) selectedId.value = null
      snackbarStore.addSnackbar({ show: true, text: `'${node.title}' kategorisi silindi.`, timeout: 3000, color: 'success' })
    } else {
      snackbarStore.addSnackbar({ show: true, text: 'Kategori silinemedi — bağlantınızı kontrol edip tekrar deneyin.', color: 'error' })
    }
  } catch {
    snackbarStore.addSnackbar({ show: true, text: 'Kategori silinemedi — bağlantınızı kontrol edip tekrar deneyin.', color: 'error' })
  } finally {
    deleteBusy.value = false
    deleteTarget.value = null
  }
}

// ---- Taşıma / sıralama (eski ağaçla aynı uçlar) -------------------------------------------------------------------------
const actionBusy = ref(false)

async function moveCategory(dragId: string, targetId: string | null) {
  const target = targetId ? tree.value.byId.get(targetId) : null
  const moveInId = targetId ?? tree.value.mainId
  if (!moveInId) return
  actionBusy.value = true
  try {
    const response: any = await restApi.post('CategoryService/moveCategory', { moveCategoryId: dragId, moveInCategoryId: moveInId })
    if (response && response.result && response.result.acknowledged == true) {
      await categoriesStore.retrieve()
      if (targetId) setExpanded(targetId, true)
      selectedId.value = dragId
      snackbarStore.addSnackbar({ show: true, text: target ? `Kategori '${target.title}' altına taşındı.` : 'Kategori üst düzeye taşındı.', timeout: 3000, color: 'success' })
    } else {
      snackbarStore.addSnackbar({ show: true, text: 'Kategori taşınamadı — tekrar deneyin.', color: 'error' })
    }
  } finally {
    actionBusy.value = false
  }
}

async function swapCategories(fromId: string, toId: string) {
  actionBusy.value = true
  try {
    const response: any = await restApi.post('CategoryService/changeOrderCategory', { fromCategoryId: fromId, toCategoryId: toId })
    const r = response?.result
    if (r && r.fromResp && r.fromResp.acknowledged == true && r.toResp && r.toResp.acknowledged == true) {
      await categoriesStore.retrieve()
    } else {
      snackbarStore.addSnackbar({ show: true, text: 'Sıra değiştirilemedi — tekrar deneyin.', color: 'error' })
    }
  } finally {
    actionBusy.value = false
  }
}

// Başka kategorinin altına taşı (sürükleme yerine klavye/dokunmatik yolu).
const moveSource = ref<CatNode | null>(null)
const moveQuery = ref<string | null>('')
const matchesMove = (text: string) => !moveQuery.value?.trim() || fold(text).includes(fold(moveQuery.value.trim()))
const moveTargets = computed(() => {
  const src = moveSource.value
  if (!src) return []
  return [...tree.value.byId.values()].filter((t) => canMoveInto(src, t) && matchesMove(t.path.join(' › ')))
})
function moveTo(target: CatNode | null) {
  const src = moveSource.value
  moveSource.value = null
  if (src) moveCategory(src.id, target?.id ?? null)
}

function onDetailAction(key: 'add-child' | 'move-up' | 'move-down' | 'move-to' | 'delete') {
  const node = selectedNode.value
  if (!node) return
  if (key === 'add-child') startAdd(node.id)
  else if (key === 'delete') deleteTarget.value = node
  else if (key === 'move-to') { moveQuery.value = ''; moveSource.value = node }
  else {
    const other = siblingOf(tree.value, node, key === 'move-up' ? -1 : 1)
    if (other) swapCategories(node.id, other.id)
  }
}

// ---- Otomatik eşleştirme (eski akış: gövde {}) --------------------------------------------------------------------------
const autoMatchOpen = ref(false)
const autoMatching = ref(false)
async function runAutoMatch() {
  autoMatching.value = true
  try {
    const response: any = await restApi.post('AttributeMappingService/autoMatchAllCategories', {})
    if (response && response.result) {
      snackbarStore.addSnackbar({ show: true, text: `${response.matchedCount} yeni kategori başarıyla eşleştirildi!`, color: 'success' })
      await loadMappings()
    } else {
      snackbarStore.addSnackbar({ show: true, text: 'Otomatik eşleştirme tamamlanamadı — bağlantınızı kontrol edip tekrar deneyin.', color: 'error' })
    }
  } catch {
    snackbarStore.addSnackbar({ show: true, text: 'Otomatik eşleştirme tamamlanamadı — bağlantınızı kontrol edip tekrar deneyin.', color: 'error' })
  } finally {
    autoMatching.value = false
    autoMatchOpen.value = false
  }
}

onMounted(() => {
  categoriesStore.retrieve()
  loadMappings()
})
</script>

<style scoped>
.cat-manager {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

.cat-manager__head {
  flex: none;
}

/* Özet görünümü: ağaç + detayın yerini alır, kendi içinde kayar. */
.cat-manager__dash {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: var(--ek-space-6);
}

.cat-manager__strip {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2) var(--ek-space-3);
}

.cat-manager__search {
  display: flex;
  flex: 0 1 560px;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 200px;
}

.cat-manager__search-field {
  flex: 1;
  min-width: 0;
}

.cat-manager__strip-actions {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin-inline-start: auto;
}

/* Segment filtre: iki konumlu, etkin = site mavisi (Markalar ile aynı dil). */
.cat-seg {
  display: inline-flex;
  flex: none;
  padding: 2px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
}

.cat-seg__btn {
  height: 30px;
  padding: 0 var(--ek-space-3);
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: none;
  color: var(--ek-color-content-muted);
  font: inherit;
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  white-space: nowrap;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.cat-seg__btn:hover {
  color: var(--ek-color-content-default);
}

.cat-seg__btn.is-on {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action);
}

.cat-seg__btn:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.cat-manager__panes {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(360px, 5fr) minmax(0, 7fr);
  gap: var(--ek-space-4);
  min-height: 0;
}

.cat-manager__panes.is-single {
  grid-template-columns: minmax(0, 1fr);
}

.cat-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.cat-panel__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.cat-state {
  padding: var(--ek-space-5);
}

.cat-skeleton {
  background: transparent;
}

.cat-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-3);
  text-align: center;
}

.cat-empty__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  font-weight: var(--ek-type-subheading-weight);
  line-height: var(--ek-type-subheading-line);
}

.cat-empty__text {
  max-width: 360px;
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.cat-detail-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-3);
  max-width: 420px;
  margin: 0 auto;
  padding: var(--ek-space-6);
  text-align: center;
}

.cat-detail-empty__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  font-weight: var(--ek-type-subheading-weight);
  line-height: var(--ek-type-subheading-line);
}

.cat-detail-empty__text {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.cat-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ek-color-action);
  font: inherit;
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
}

.cat-link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.cat-move__search {
  margin-bottom: var(--ek-space-3);
}

.cat-move__list {
  display: flex;
  flex-direction: column;
  max-height: 320px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.cat-move__item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: 100%;
  min-height: var(--ek-control-h-lg);
  padding: 0 var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: none;
  color: var(--ek-color-content-default);
  font: inherit;
  font-size: var(--ek-type-body-size);
  text-align: start;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.cat-move__item:hover {
  background: var(--ek-color-surface-muted);
}

.cat-move__item:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.cat-move__none {
  padding: var(--ek-space-3) var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
}

/* Dar ekran: ağaç tam genişlik (sayfa kayar); detay tam ekran sayfa olarak ağacın ÜSTÜNÜ örter. */
@media (max-width: 959px) {
  .cat-manager {
    overflow-y: auto;
  }

  .cat-manager__panes {
    flex: none;
    grid-template-columns: minmax(0, 1fr);
  }

  .cat-panel--tree {
    min-height: 320px;
  }

  .cat-panel__scroll {
    overflow-y: visible;
  }

  .cat-panel--detail.is-sheet {
    position: absolute;
    inset: 0;
    z-index: 2;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
}

@media (max-width: 767px) {
  .cat-manager {
    padding: var(--ek-space-4);
  }
}

/* Sayfanın birincil eylemi; dar ekranda yalnız "+" (etiket ekran okuyucuya açık). */
@media (max-width: 599px) {
  .cat-new {
    gap: 0;
    min-width: var(--ek-control-h-md);
    padding-inline: 0;
    justify-content: center;
  }

  .cat-new :deep(.ek-btn__label),
  .cat-auto :deep(.ek-btn__label) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .cat-auto {
    gap: 0;
    min-width: var(--ek-control-h-md);
    padding-inline: 0;
    justify-content: center;
  }

  .cat-manager__search {
    flex-wrap: wrap;
    flex-basis: 100%;
  }
}

/* ================= FE-LOCAL-1048 — Kategoriler: uygulamanın ortak tasarım dili =================
   Sayfa adı diğer sayfalarla AYNI noktada (kabuk yalnız sekmenin kök öğesinin üst boşluğunu 12px yapar; içerik burada
   olduğu için üst boşluk burada verilir). Segment = Liste | Özet anahtarıyla aynı görünüm. Paneller: düz yüzey, ince
   çerçeve, tablo başlığı tonunda mikro etiketli başlık. */
.cat-manager {
  padding-top: var(--ek-space-3);
}

.cat-seg {
  gap: 2px;
  border-color: var(--ek-color-border-input);
  border-radius: var(--ek-radius-tile);
}

.cat-seg__btn {
  height: calc(var(--ek-control-h-sm) - 6px);
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
}

.cat-seg__btn:hover {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.cat-seg__btn.is-on {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.cat-panel__head {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  min-height: 36px;
  padding: 0 var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
}

.cat-panel__label {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-sidebar-section);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.cat-panel__label::before {
  content: '';
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.cat-panel__hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.cat-move__item {
  border-radius: var(--ek-radius-md);
}

@media (max-width: 767px) {
  .cat-manager {
    padding-top: var(--ek-space-3);
  }
}

@media (hover: none) {
  .cat-panel__hint {
    display: none;
  }
}
</style>
