<!--
  frontend/src/views/secure/productDefinitions/BrandListView.vue

  B7 (cloud/fe-b7) — Markalar sayfası: başlık satırı (EkPageHeader) + ana-detay (CatalogSplit), Kategoriler ile aynı dil.
    sol  : arama (vurgu) + "eşlemesi eksik" süzgeci + ızgara/liste anahtarı; BrandCollection (baş harf avatarı, eşleme)
    sağ  : seçim yokken genel bakış (sayılar, platform kapsaması); seçimde BrandDetail (özet + MEVCUT BrandSyncComponent).
  Uç noktalar/gövdeler DEĞİŞMEDİ: BrandService (GET, addBrand). BrandSyncComponent kendi uç noktalarını (updateBrand,
  saveIntegrationBrand, deleteBrand) aynen kullanır ve marka deposunu yeniler → koleksiyon depoyu benimser.
  Eski BrandListComponent dokunulmadı (artık bu ekranda kullanılmıyor). Geri alma: bu dosya + src/components/catalogPages/.
-->
<template>
  <div class="brandDefinition brand-page">
    <EkPageHeader
      section="Katalog"
      :title="$t('menu.productDefinitions.brandList')"
      description="Ürünlerinizde kullandığınız markalar ve her markanın pazaryeri markasıyla eşlemesi."
      :tips="[
        'Karta ya da satıra tıklayın: marka adı ve platform eşlemesi sağda açılır.',
        'Izgara / liste görünümü bu cihazda hatırlanır.',
        'Noktalar platform başına eşleme durumunu gösterir: dolu = eşli, boş halka = eşlenmedi.',
      ]"
      :primary-action="{ label: 'Marka ekle', icon: 'mdi-plus', onClick: startAdd }"
      refreshable
      :refreshing="loading"
      @refresh="load()"
    />

    <CatalogSplit
      :detail-open="!!selected"
      list-label="Marka listesi"
      :detail-label="selected ? `${selected.title} ayrıntıları` : 'Marka özeti'"
      back-label="Tüm markalar"
      @back="closeDetail"
    >
      <template #list>
        <div class="brand-pane">
          <header class="brand-pane__head">
            <div class="brand-pane__titles">
              <h2 class="brand-pane__title">Markalar</h2>
              <p class="brand-pane__meta ek-num" aria-live="polite">{{ metaText }}</p>
            </div>
            <CatSegmented v-if="all.length" v-model="view" label="Görünüm" :options="viewOptions" />
          </header>

          <div v-if="all.length || query" class="brand-pane__toolbar">
            <v-text-field
              v-model="query"
              class="brand-pane__search"
              type="search"
              label="Markalarda ara"
              prepend-inner-icon="mdi-magnify"
              clearable
              hide-details
              density="compact"
              autocomplete="off"
              @keydown.down.prevent="collectionRef?.focusFirst()"
              @click:clear="query = ''"
            />
            <CatSegmented v-if="platforms.length" v-model="filterMode" label="Göster" :options="filterOptions" />
          </div>

          <div class="brand-pane__body">
            <div v-if="loading && !all.length" class="brand-pane__skeleton" aria-busy="true" aria-label="Markalar yükleniyor">
              <span v-for="i in 8" :key="i" class="brand-pane__sk"><span class="brand-pane__sk-av"></span><span class="brand-pane__sk-line"></span></span>
            </div>
            <EkProblemState
              v-else-if="problem && !all.length"
              title="Markalar yüklenemedi"
              :cause="problem.cause"
              :action="problem.action"
              :tone="problem.tone"
              :details="problem.details"
              :retrying="loading"
              @retry="load()"
            />
            <div v-else-if="!all.length && !adding" class="brand-pane__empty">
              <EkEmptyState variant="first-run" title="Henüz marka yok"
                message="Ürünlerinize atayacağınız markaları ekleyin; ardından her markayı pazaryeri markasıyla eşleyebilirsiniz."
                show-action action-text="İlk markayı ekle" @action="startAdd" />
            </div>
            <template v-else>
              <div v-if="!shown.length && !adding" class="brand-pane__empty">
                <EkEmptyState
                  :variant="query ? 'no-results' : 'no-data'"
                  :title="query ? `“${query}” ile eşleşen marka yok` : 'Eşlemesi eksik marka yok'"
                  :message="query ? 'Yazımı kontrol edin ya da daha kısa bir ifade deneyin. Türkçe karakterler şart değil.' : 'Tüm markalar bağlı platformların hepsinde eşli.'"
                  show-action
                  :action-text="query ? 'Aramayı temizle' : 'Tümünü göster'"
                  :action-icon="query ? 'mdi-close' : 'mdi-format-list-bulleted'"
                  @action="query ? (query = '') : (filterMode = 'all')"
                />
              </div>
              <BrandCollection
                ref="collectionRef"
                :items="shown"
                :selected-id="selectedId"
                :view="view"
                :query="query ?? ''"
                :adding="adding"
                :busy="busy"
                label="Markalar"
                @select="select"
                @add="addBrand"
                @cancel-add="adding = false"
              />
            </template>
          </div>
        </div>
      </template>

      <template #detail>
        <Transition name="brand-swap" mode="out-in">
          <BrandDetail v-if="selected" :key="selected.id" :item="selected" @close="closeDetail" />
          <CatalogOverview
            v-else
            title="Marka özeti"
            :lead="all.length ? 'Bir marka seçin ya da eşlemesi eksik olanlardan başlayın.' : 'Henüz marka yok. Soldan ilk markayı ekleyin; eşleme özeti burada belirir.'"
            :empty="!all.length"
            icon="mdi-tag-multiple-outline"
            unit="marka"
            :stats="overviewStats"
            :coverage="coverage"
            :missing="missingCount"
            :keys="[
              { keys: '↑/↓', label: 'gezin' },
              { keys: 'Enter', label: 'aç' },
              { keys: 'A–Z', label: 'harfle atla' },
            ]"
            @show-missing="showMissing"
          />
        </Transition>
      </template>
    </CatalogSplit>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import EkPageHeader from '@/components/ds/EkPageHeader.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import EkProblemState from '@/components/ds/EkProblemState.vue'
import CatalogSplit from '@/components/catalogPages/CatalogSplit.vue'
import CatalogOverview from '@/components/catalogPages/CatalogOverview.vue'
import CatSegmented from '@/components/catalogPages/CatSegmented.vue'
import BrandCollection from '@/components/catalogPages/BrandCollection.vue'
import BrandDetail from '@/components/catalogPages/BrandDetail.vue'
import { brandCoverage, brandItems, filterBrands, type BrandItem, type PlatformRef } from '@/components/catalogPages/catalogModel'
import useRestApi from '@/composables/restapi'
import { problemFromError, type ProblemCopy } from '@/composables/useProblem'
import { useToast } from '@/composables/useToast'
import { channelName } from '@/design/channels'
import { useBrandsStore } from '@/stores/brandsStore'
import { useIntegrationStore } from '@/stores/integrationStore'

const restApi = useRestApi()
const { showToast } = useToast()
const brandsStore = useBrandsStore()
const integrationStore = useIntegrationStore()

// ------------------------------------------------------------------ veri
const raw = ref<any[]>([])
const loading = ref(false)
const problem = ref<ProblemCopy | null>(null)
const busy = ref(false)

async function load() {
  loading.value = true
  try {
    // Mevcut panel (BrandSyncComponent) markayı depodan okur → depo da tazelenir.
    const [resp]: any[] = await Promise.all([restApi.get('BrandService'), brandsStore.retrieve()])
    if (Array.isArray(resp)) {
      raw.value = resp
      problem.value = null
    } else {
      problem.value = problemFromError(resp, 'BrandService') ?? { action: 'Tekrar deneyin.', details: [{ label: 'Servis', value: 'BrandService' }], tone: 'error' }
    }
  } finally {
    loading.value = false
  }
}

// Panel kaydet/sil sonrası depoyu yeniler → koleksiyon benimser.
const storeBrands = brandsStore.getBrands()
watch(storeBrands, (v) => {
  if (Array.isArray(v)) raw.value = v
})

onMounted(load)

const platforms = computed<PlatformRef[]>(() =>
  [...(integrationStore.getClientMarketplaces() ?? []), ...(integrationStore.getClientECommerces() ?? []), ...(integrationStore.getClientErps() ?? [])]
    // BrandSyncComponent ile aynı kural: `hasBrandMapping === false` olan platformda marka eşlemesi yok.
    .filter((p: any) => p?.hasBrandMapping !== false)
    .map((p: any) => ({ code: String(p.code), name: channelName(p.code, integrationStore.getIntegrationTitle(p.code)) })),
)
const all = computed(() => brandItems(raw.value, platforms.value))
const missingCount = computed(() => all.value.filter((b) => b.mapping.length && b.mappedCount < b.mapping.length).length)
const coverage = computed(() => brandCoverage(all.value, platforms.value))

// ------------------------------------------------------------------ arama / süzgeç / görünüm
const query = ref<string | null>('')
const filterMode = ref<'all' | 'missing'>('all')
const shown = computed(() => filterBrands(all.value, query.value ?? '', filterMode.value === 'missing'))
const filterOptions = computed(() => [
  { value: 'all', label: 'Tümü' },
  { value: 'missing', label: 'Eşlemesi eksik', count: missingCount.value },
])

const VIEW_KEY = 'ek.b7.brandView'
const readView = (): 'grid' | 'list' => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}
const view = ref<'grid' | 'list'>(readView())
watch(view, (v) => {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    /* depolama kapalı: tercih yalnız bu oturumda */
  }
})
const viewOptions = [
  { value: 'grid', label: 'Izgara görünümü', icon: 'mdi-view-grid-outline', iconOnly: true },
  { value: 'list', label: 'Liste görünümü', icon: 'mdi-format-list-bulleted', iconOnly: true },
]

const metaText = computed(() => {
  if (loading.value && !all.value.length) return 'Yükleniyor…'
  const q = (query.value ?? '').trim()
  if (q || filterMode.value === 'missing') return `${shown.value.length} / ${all.value.length} marka`
  return `${all.value.length} marka`
})

const overviewStats = computed(() => [
  { label: 'Marka', value: all.value.length },
  platforms.value.length
    ? { label: 'Tamamı eşli', value: all.value.length - missingCount.value, tone: 'success' as const }
    : { label: 'Bağlı platform', value: 0 },
  ...(platforms.value.length ? [{ label: 'Eşlemesi eksik', value: missingCount.value, tone: missingCount.value ? ('warning' as const) : undefined }] : []),
])

function showMissing() {
  query.value = ''
  filterMode.value = 'missing'
}

// ------------------------------------------------------------------ seçim
const collectionRef = ref<InstanceType<typeof BrandCollection> | null>(null)
const selectedId = ref<string | null>(null)
const selected = computed<BrandItem | null>(() => all.value.find((b) => b.id === selectedId.value) ?? null)

watch(all, (items) => {
  if (selectedId.value && !items.some((b) => b.id === selectedId.value)) selectedId.value = null
})

function select(b: BrandItem) {
  selectedId.value = b.id
}

function closeDetail() {
  const id = selectedId.value
  selectedId.value = null
  if (id) nextTick(() => document.getElementById(`brand-opt-${id}`)?.focus())
}

// ------------------------------------------------------------------ ekleme (mevcut uç nokta)
const adding = ref(false)

function startAdd() {
  selectedId.value = null
  query.value = ''
  filterMode.value = 'all'
  adding.value = true
}

async function addBrand(title: string) {
  busy.value = true
  try {
    const resp: any = await restApi.post('BrandService/addBrand', { title })
    if (resp && resp._id) {
      adding.value = false
      await load()
      selectedId.value = String(resp._id)
      showToast({ tone: 'success', message: `“${title}” markası eklendi.` })
    } else showToast({ tone: 'error', title: 'İşlem tamamlanamadı', message: 'Marka eklenemedi. Tekrar deneyin.' })
  } finally {
    busy.value = false
  }
}

// Sekme kapatılırken (WorkspaceTabHost) çağrılır — eski ekranla aynı dışa açım.
const destroyComponent = () => {
  selectedId.value = null
}
defineExpose({ destroyComponent })
</script>

<style scoped>
.brand-page {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

@media (max-width: 767px) {
  .brand-page {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}

.brand-pane {
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

.brand-pane__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-4) 0 var(--ek-space-5);
}

.brand-pane__titles {
  flex: 1;
  min-width: 0;
}

.brand-pane__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.brand-pane__meta {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.brand-pane__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-3) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.brand-pane__search {
  flex: 1 1 200px;
  min-width: 0;
}

.brand-pane__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.brand-pane__empty {
  padding: var(--ek-space-4);
}

.brand-pane__skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(208px, 1fr));
  gap: var(--ek-space-3);
  padding: var(--ek-space-4);
}

.brand-pane__sk {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
}

.brand-pane__sk-av {
  width: 40px;
  height: 40px;
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
}

.brand-pane__sk-line {
  flex: 1;
  height: 12px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-sunken);
}

.brand-swap-enter-active {
  transition:
    opacity var(--ek-duration-base) var(--ek-easing-enter),
    transform var(--ek-duration-base) var(--ek-easing-enter);
}

.brand-swap-leave-active {
  transition: opacity var(--ek-duration-fast) var(--ek-easing-standard);
}

.brand-swap-enter-from {
  opacity: 0;
  transform: translateY(var(--ek-motion-distance-sm));
}

.brand-swap-leave-to {
  opacity: 0;
}
</style>
