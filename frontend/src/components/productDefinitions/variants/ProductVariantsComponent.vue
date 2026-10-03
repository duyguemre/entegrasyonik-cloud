<template>
  <div class="pv">
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <EkDialogHost :model-value="isAnyVariantPanelOpen" :attach="dialogAttach" :width="variantPanelWidth"
      @update:model-value="(v) => { if (!v) closeVariantPanels() }">
      <keep-alive>
        <ProductImagesComponent v-model="isImagesDialog" key="ProductImagesComponent"
          @close="isImagesDialog = false" v-if="isImagesDialog == true" :productInfoForm="productInfoForm" initial-tab="variants" />
      </keep-alive>
      <keep-alive>
        <ProductVariantImagesComponent v-model="isVariantImagesDialog" :variant="selectedVariantForEdit" key="ProductVariantImagesComponent"
          @close="isVariantImagesDialog = false" v-if="isVariantImagesDialog == true" :productInfoForm="productInfoForm" />
      </keep-alive>
      <!-- keep-alive YOK: her açılışta düzenlenen varyantın taslağı yeniden kurulur (önbellekteki eski taslak başka varyanta taşınmasın). -->
      <ProductVariantAttributesComponent v-if="isVariantAttributesDialog" v-model="isVariantAttributesDialog" :editingVariant="editingVariant"
        :key="`pva-${editingVariant?._id || editingVariant?.tempId || ''}`" @close="isVariantAttributesDialog = false" :productInfoForm="productInfoForm" />
      <ProductBatchVariantAttributesComponent v-if="isBatchVariantDialog" key="ProductBatchVariantAttributesComponent"
        :variants="bulkTargets" :all-count="variantList.length" :product-info-form="productInfoForm"
        @close="isBatchVariantDialog = false" @applied="onBatchAttrsApplied" />
      <ProductVariantPlatformPricesComponent v-if="isVariantPlatformPricesMenu == true" v-model="isVariantPlatformPricesMenu"
        :editingVariant="editingVariant" key="ProductVariantPlatformPricesComponent" @close="isVariantPlatformPricesMenu = false"
        :productInfoForm="productInfoForm" />
      <VariantBulkEditor v-if="isBulkEditor" :variants="bulkTargets" :all-count="variantList.length"
        :product-info-form="productInfoForm" :preset="bulkPreset" @close="isBulkEditor = false" @applied="onBulkApplied" />
    </EkDialogHost>

    <ProductVariantGeneratorComponent v-model="isVariantGeneratorMenu" :attach="dialogAttach" :productInfoForm="productInfoForm"
      @generate-variants="generateVariants" @close="isVariantGeneratorMenu = false" />
    <EkConfirmDialog v-model="deleteConfirm.open" :attach="dialogAttach" danger icon="mdi-trash-can-outline"
      :title="deleteConfirm.title" :description="deleteConfirm.description" confirm-label="Sil" confirm-icon="mdi-trash-can-outline"
      @confirm="runDelete" />

    <section class="pv-frame" aria-labelledby="pv-title">
      <!-- araç çubuğu -->
      <!-- Aşama 6b (Standart 3): tek toplu işlem çubuğu (EkBulkBar) — seçim yokken başlık + araçlar. -->
      <EkBulkBar class="pv-bar" :count="selectedVariants.length" noun="varyant" @clear="selectedVariants = []">
        <template #actions>
          <EkButton size="sm" icon="mdi-table-edit" @click="openBulkEditor('selected')">Seçilenleri toplu düzenle</EkButton>
          <EkButton size="sm" icon="mdi-tag-multiple-outline" @click="openBatchAttributes('selected')">Özellik düzenle</EkButton>
          <EkActionButton action="delete" show-label label="Seçilenleri sil" @click="askDelete('selected')" />
        </template>
        <template #start>
          <div class="pv-bar__start">
            <EkIconTile icon="mdi-view-list-outline" size="md" class="pv-bar__icon" />
            <h2 id="pv-title" class="pv-title">Varyantlar</h2>
            <span class="pv-meta ek-num">{{ variantList.length }} varyant<template v-if="groupCount > 1"> · {{ groupCount }} {{ groupNoun }}</template></span>
            <!-- Hücre sorunları başlıkta (eskiden tablonun altındaki şeritteydi): sayı hapı + ilk hataya git. -->
            <span v-if="variantList.length" class="pv-issues" role="status">
              <template v-if="issues.errors || issues.warnings">
                <span v-if="issues.errors" class="pv-issue pv-issue--error"><v-icon icon="mdi-alert-circle-outline" aria-hidden="true" />{{ issues.errors }} hata</span>
                <span v-if="issues.warnings" class="pv-issue pv-issue--warning"><v-icon icon="mdi-alert-outline" aria-hidden="true" />{{ issues.warnings }} uyarı</span>
                <button v-if="issues.errors" type="button" class="pv-link" @click="gridRef?.goToFirstIssue()">İlk hataya git</button>
              </template>
              <span v-else class="pv-issue pv-issue--ok"><v-icon icon="mdi-check-circle-outline" aria-hidden="true" />Sorun yok</span>
            </span>
            <span v-if="changedCount > 0" class="pv-changed" role="status">
              <v-icon icon="mdi-circle-medium" aria-hidden="true" />{{ changedCount }} hücre değişti · kaydedilmedi
            </span>
          </div>
        </template>
        <template #end>
          <div class="pv-bar__tools">
            <v-text-field v-model="filterText" class="pv-search" density="compact" variant="outlined" hide-details
              prepend-inner-icon="mdi-magnify" placeholder="Stok kodu, barkod, seçenek" aria-label="Varyantlarda ara"
              clearable ref="searchRef" />
            <!-- Klavye kısayolları: ortak kart (toplu düzenleyici ve galeriyle aynı). -->
            <KeyboardHelpMenu :keys="tableKeys" />
            <EkTooltip text="Geri al (Ctrl+Z)">
              <EkButton size="sm" tone="ghost" icon="mdi-undo" icon-only aria-label="Geri al"
                  :disabled="!gridRef?.sheet.canUndo" @click="gridRef?.sheet.undo()" />
              </EkTooltip>
            <EkTooltip text="Yinele (Ctrl+Y)">
              <EkButton size="sm" tone="ghost" icon="mdi-redo" icon-only aria-label="Yinele"
                  :disabled="!gridRef?.sheet.canRedo" @click="gridRef?.sheet.redo()" />
              </EkTooltip>
            <!-- Faz 3 B2: varyant görsellerini seçenek grubu seviyesinde atama (galeri paneli, Varyantlar sekmesi). -->
            <EkButton size="sm" icon="mdi-image-multiple-outline" class="pv-bulk-btn" :disabled="!variantList.length" aria-label="Varyant görselleri"
              @click="isImagesDialog = true"><span class="pv-bulk-btn__label">Görseller</span></EkButton>
            <EkButton size="sm" icon="mdi-table-edit" class="pv-bulk-btn" :disabled="!variantList.length" aria-label="Toplu düzenle"
              @click="openBulkEditor('all')"><span class="pv-bulk-btn__label">Toplu düzenle</span></EkButton>
            <!-- Ana eylem: varyant oluşturucu penceresi (seçenek çipleri + canlı önizleme). -->
            <EkButton size="sm" tone="primary" icon="mdi-layers-plus" id="myfeature-2" class="pv-bulk-btn" aria-label="Varyant oluştur"
              @click="isVariantGeneratorMenu = true"><span class="pv-bulk-btn__label">Varyant oluştur</span></EkButton>
            <EkContextMenu :groups="variantOpsMenu" label="Varyant işlemleri" title="Varyant İşlemleri"
              description="İşlem yalnızca bu ürün için uygulama kataloğunda yapılır." @select="onVariantOp">
              <template #activator="{ props: mp }">
                <EkButton v-bind="mp" size="sm" tone="ghost" icon="mdi-dots-horizontal" icon-only aria-label="Varyant işlemleri" />
              </template>
            </EkContextMenu>
          </div>
        </template>
      </EkBulkBar>

      <VariantGrid ref="gridRef" :variants="variantList" :product-info-form="productInfoForm" :baseline="baseline"
        :filter="filterText || ''" v-model:selected="selectedVariants" aria-label="Varyantlar"
        @edit="openAttributes" @images="openImages" @delete="askDelete" @channel-prices="openVariantPlatformPrices">
        <template #empty>
          <EkEmptyState v-if="filterText" variant="no-results" title="Aramaya uyan varyant yok"
            message="Stok kodu, barkod, raf veya seçenek adıyla aradınız. Aramayı temizleyip tekrar deneyin."
            show-action action-text="Aramayı temizle" action-icon="mdi-close" @action="filterText = ''" />
          <EkEmptyState v-else variant="first-run" title="Henüz varyant yok"
            message="Seçenek gruplarından (ör. renk, beden) değerleri seçerek varyantları tek seferde oluşturun."
            show-action action-text="Varyant oluştur" action-icon="mdi-plus" @action="isVariantGeneratorMenu = true" />
        </template>
      </VariantGrid>

    </section>
  </div>
</template>

<script setup lang="ts">
import { EkBulkBar, EkActionButton, EkDialogHost, EkContextMenu, EkButton, EkConfirmDialog, EkEmptyState, EkIconTile, EkTooltip } from '@entegrasyonik/ui/components'
import type { EkMenuGroup, EkMenuItem } from '@entegrasyonik/ui/components'
import { ref, inject, watch, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n';
import { useChoicesStore } from '@/stores/choicesStore';
import LoadingComponent from '@/components/LoadingComponent.vue'
import useRestApi from '@/composables/restapi'
import ProductImagesComponent from '../crud/ProductImagesComponent.vue';
import KeyboardHelpMenu, { type KeyHelp } from '../KeyboardHelpMenu.vue';
import ProductVariantAttributesComponent from './ProductVariantAttributesComponent.vue';
import ProductBatchVariantAttributesComponent from './ProductBatchVariantAttributesComponent.vue';
import ProductVariantPlatformPricesComponent from './ProductVariantPlatformPricesComponent.vue';
import ProductVariantGeneratorComponent from './ProductVariantGeneratorComponent.vue';
import ProductVariantImagesComponent from './ProductVariantImagesComponent.vue';
import VariantGrid from './grid/VariantGrid.vue'
import VariantBulkEditor from './grid/VariantBulkEditor.vue'
import { BASE_COLUMNS, channelColumns, rowId, snapshot, type Snapshot } from './grid/variantSheet'
import { useIntegrationStore } from '@/stores/integrationStore';
import { useCategoriesStore } from '@/stores/categoriesStore';
import { useSnackbarStore } from '@/stores/snackbarStore';

const categoriesStore = useCategoriesStore()
const integrationStore = useIntegrationStore()
const snackbarStore = useSnackbarStore()
const choicesStore = useChoicesStore()
const restApi = useRestApi()
const { t } = useI18n()
const eventBus: any = inject('eventBus', undefined)

const emits = defineEmits(['refreshImages', 'refreshVariants', 'refreshTotalVariantsStockCount', 'close'])
const isVariants = defineModel({ default: false })
const props = defineProps<{
  productInfoForm: any,
  dialogAttach: any
}>()

const loadingComponentRef: any = ref(null)
const gridRef = ref<InstanceType<typeof VariantGrid> | null>(null)
const searchRef: any = ref(null)
const filterText = ref<string | null>('')
/** Tablo kısayolları — ortak kart (KeyboardHelpMenu). */
const tableKeys: KeyHelp[] = [
  { keys: ['↑', '↓', '←', '→'], text: 'hücreler arasında gezin' },
  { keys: 'Enter', text: 'düzenle / kaydet ve aşağı in' },
  { keys: 'Esc', text: 'düzenlemeden vazgeç' },
  { keys: ['Ctrl', 'C'], text: 'kopyala' },
  { keys: ['Ctrl', 'V'], text: 'tablodan yapıştır (Excel)' },
  { keys: ['Ctrl', 'Z'], text: 'geri al' },
  { keys: ['Ctrl', 'Y'], text: 'yinele' },
]
const selectedVariants = ref<string[]>([])
const editingVariant: any = ref({})
const selectedVariantForEdit: any = ref(0)

const isVariantGeneratorMenu = ref(false)
const isVariantPlatformPricesMenu = ref(false)
const isImagesDialog = ref(false)
const isVariantImagesDialog = ref(false)
const isVariantAttributesDialog = ref(false)
const isBatchVariantDialog = ref(false)
const isBulkEditor = ref(false)
const bulkScope = ref<'all' | 'selected'>('all')
const bulkPreset = ref<'all' | 'prices' | 'channelPrices'>('all')

const variantList = computed<any[]>(() => props.productInfoForm.variants || [])
const groupCount = computed(() => new Set(variantList.value.map((v: any) => v.choices?.[0]?.choiceValueId)).size)
const groupNoun = computed(() => {
  const first = variantList.value.find((v: any) => v.choices?.[0])
  const title = first ? choicesStore.getChoiceTitle(first.choices[0].choiceId) : ''
  const lower = title ? String(title).toLocaleLowerCase('tr') : ''
  // Seçenek adı zaten "… grubu" ise yinelenmez ("renk grubu grubu" değil).
  return lower ? (/\bgrubu$/.test(lower) ? lower : `${lower} grubu`) : 'grup'
})

// ── değişen hücre tabanı: bileşen açıldığında / varyantlar yeniden yüklendiğinde (kaydetme sonrası) ──
const allChannels = () => [...(integrationStore.getClientMarketplaces() || []), ...(integrationStore.getClientECommerces() || [])]
const baselineColumns = () => [...BASE_COLUMNS, ...channelColumns(allChannels().map((p: any) => ({ code: p.code, title: p.title })))]
const baseline = ref<Snapshot>({})
const resetBaseline = () => {
  baseline.value = snapshot(variantList.value, baselineColumns())
  gridRef.value?.sheet.resetHistory()
}
onMounted(resetBaseline)
// Varyant dizisi YENİDEN atanınca (sunucudan yenileme) taban sıfırlanır; ekleme/silme tabanı bozmaz.
watch(() => props.productInfoForm.variants, (next, prev) => { if (next !== prev) resetBaseline() })
// Yeni oluşturulan varyant tabana eklenir (tamamı "değişti" görünmesin).
watch(() => variantList.value.length, () => {
  const cols = baselineColumns()
  const add = snapshot(variantList.value.filter((v: any) => !baseline.value[rowId(v)]), cols)
  if (Object.keys(add).length) baseline.value = { ...baseline.value, ...add }
})
const changedCount = computed(() => gridRef.value?.changedCount ?? 0)
const issues = computed(() => gridRef.value?.issueCounts ?? { errors: 0, warnings: 0, first: null })

watch(isVariants, (on) => { if (on) getVariants() })

// ── paneller ──
const isAnyVariantPanelOpen = computed(() => !!(isVariantPlatformPricesMenu.value || isImagesDialog.value ||
  isVariantAttributesDialog.value || isBatchVariantDialog.value || isVariantImagesDialog.value || isBulkEditor.value))
const variantPanelWidth = computed<'md' | 'lg' | 'xl'>(() => 'xl')
function closeVariantPanels() {
  isVariantPlatformPricesMenu.value = false
  isImagesDialog.value = false
  isVariantAttributesDialog.value = false
  isBatchVariantDialog.value = false
  isVariantImagesDialog.value = false
  isBulkEditor.value = false
}
const openAttributes = (v: any) => { editingVariant.value = v; isVariantAttributesDialog.value = true }
const openImages = (v: any) => { selectedVariantForEdit.value = v; isVariantImagesDialog.value = true }

const bulkTargets = computed(() => {
  if (bulkScope.value === 'selected' && selectedVariants.value.length) {
    const ids = new Set(selectedVariants.value)
    return variantList.value.filter((v: any) => ids.has(rowId(v)))
  }
  return variantList.value
})
function openBulkEditor(scope: 'all' | 'selected', preset: 'all' | 'prices' | 'channelPrices' = 'all') {
  bulkScope.value = scope
  bulkPreset.value = preset
  isBulkEditor.value = true
}
function onBulkApplied(count: number) {
  isBulkEditor.value = false
  snackbarStore.addSnackbar({ show: true, text: `${count} hücre güncellendi — kaydetmek için ürünü kaydedin`, timeout: 4000, color: 'success' })
}

const openVariantPlatformPrices = (variant: any) => {
  editingVariant.value = variant
  if (editingVariant.value.platforms == undefined) editingVariant.value.platforms = {}
  for (const platform of integrationStore.getClientPlatforms()) {
    editingVariant.value.platforms[platform.code] = editingVariant.value.platforms[platform.code] || {}
    editingVariant.value.platforms[platform.code].prices = editingVariant.value.platforms[platform.code].prices || { salePrice: 0, marketPrice: 0 }
  }
  isVariantPlatformPricesMenu.value = true
}

// ── toplu özellik (kanal özellikleri + kanal bilgileri): seçili varyantlar ya da tümü ──
function openBatchAttributes(scope: 'all' | 'selected') {
  bulkScope.value = scope
  isBatchVariantDialog.value = true
}
function onBatchAttrsApplied(count: number) {
  isBatchVariantDialog.value = false
  snackbarStore.addSnackbar({ show: true, text: `${count} özellik değişikliği varyantlara yazıldı — kaydetmek için ürünü kaydedin`, timeout: 4000, color: 'success' })
}

// ── seçenek eşleme (kanal özellik değerleri seçenek eşlemesinden) ──
const mapAllChoices = async () => {
  const platforms = integrationStore.getClientPlatforms()
  const variants = props.productInfoForm.variants || []
  const choices = choicesStore.getChoices().value
  const currentCategory = categoriesStore.getCategory(props.productInfoForm.category)
  if (currentCategory == undefined) {
    snackbarStore.addSnackbar({ show: true, text: 'Ürünün kategorisi bulunamadı — önce kategori seçin', timeout: 4000, color: 'warning' })
    return
  }
  let mapped = 0
  for (const platform of platforms) {
    const integrationCategoryId = currentCategory.platforms?.[platform.code]
    const integrationCategoryAttributes = await integrationStore.retrieveIntegrationCategoryChoices(platform.code, integrationCategoryId)
    if (!Array.isArray(integrationCategoryAttributes)) continue
    for (const variant of variants) {
      variant.platforms = variant.platforms || {}
      const variantAttributes = variant.platforms[platform.code]?.attributes
      if (variantAttributes) {
        for (const variantIntegrationAttributeId in variantAttributes) {
          const integrationCategoryAttribute = integrationCategoryAttributes.find((item: any) => item._id == variantIntegrationAttributeId)
          let deleteFlag = false
          if (integrationCategoryAttribute?.allowCustom == false) {
            const found = integrationCategoryAttribute?.values?.find((item: any) => item.id == variantAttributes[variantIntegrationAttributeId])
            if (!found) deleteFlag = true
          }
          if (deleteFlag || !integrationCategoryAttribute || !variantAttributes[variantIntegrationAttributeId]) {
            delete variant.platforms[platform.code].attributes[variantIntegrationAttributeId]
          }
        }
      }
      for (const integrationCategoryAttribute of integrationCategoryAttributes) {
        for (const variantChoice of variant.choices) {
          const currentChoice = choices.find((item: any) => item._id == variantChoice.choiceId)
          if (!currentChoice) continue
          const integrationAttributeValueId = currentChoice.platforms?.[platform.code]?.[integrationCategoryId + '_' + integrationCategoryAttribute._id]?.[variantChoice.choiceValueId]
          if (integrationAttributeValueId) {
            variant.platforms[platform.code] = variant.platforms[platform.code] || {}
            variant.platforms[platform.code].attributes = variant.platforms[platform.code].attributes || {}
            variant.platforms[platform.code].attributes[integrationCategoryAttribute._id] = integrationAttributeValueId
            mapped++
          }
        }
      }
    }
  }
  snackbarStore.addSnackbar({ show: true, text: mapped ? `${mapped} kanal özelliği seçenek eşlemesinden dolduruldu` : 'Eşlenecek seçenek değeri bulunamadı', timeout: 3000, color: mapped ? 'success' : 'info' })
}

// ── kod üretimi (önceki başlık menülerindeki davranış aynen) ──
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const stockcodeBatchProcess = async () => {
  for (const variant of props.productInfoForm.variants) {
    let choiceStr = ''
    for (const choice of variant.choices) {
      const choiceValueTitle = choicesStore.getChoiceValueName(choice.choiceId, choice.choiceValueId)
      if (choiceStr != '') choiceStr += '-'
      choiceStr += String(choiceValueTitle || '').substring(0, 2).toUpperCase()
    }
    await sleep(1)
    variant.stockcode = choiceStr + '_' + Date.now()
  }
}
const barcodeBatchProcess = async () => {
  for (const variant of props.productInfoForm.variants) {
    variant.barcode = Date.now()
    await sleep(1)
  }
}

// ── silme ──
const deleteConfirm = ref<{ open: boolean; title: string; description: string; targets: any[] }>({ open: false, title: '', description: '', targets: [] })
function askDelete(arg: any) {
  let targets: any[]
  if (arg === 'selected') {
    const ids = new Set(selectedVariants.value)
    targets = variantList.value.filter((v: any) => ids.has(rowId(v)))
  } else if (arg === 'all') targets = [...variantList.value]
  else targets = [arg]
  if (!targets.length) return
  const saved = targets.filter((v) => v._id).length
  deleteConfirm.value = {
    open: true,
    title: targets.length === 1 ? `'${targets[0].stockcode || 'Varyant'}' silinsin mi?` : `${targets.length} varyant silinsin mi?`,
    description: saved
      ? `Kayıtlı ${saved} varyant uygulama kataloğundan hemen silinir; bu işlem geri alınamaz.`
      : 'Varyant formdan kaldırılır; ürünü kaydedene kadar kalıcı olmaz.',
    targets,
  }
}
async function runDelete() {
  const targets = deleteConfirm.value.targets
  deleteConfirm.value.open = false
  for (const v of targets) await deleteVariant(v)
  const ids = new Set(targets.map(rowId))
  selectedVariants.value = selectedVariants.value.filter((x) => !ids.has(x))
}
const deleteVariant = async (variant: any) => {
  const index = props.productInfoForm.variants.findIndex((item: any) => rowId(item) === rowId(variant))
  if (index !== -1) props.productInfoForm.variants.splice(index, 1)
  if (!variant._id) return
  const guid = loadingComponentRef.value.info(t('loading.info.deleteVariant'))
  await restApi.post('VariantService/deleteVariant', { variantId: variant._id })
  loadingComponentRef.value.remove(guid)
}

// ── oluşturma ──
const getCombinations = (data: any): any[] => {
  const entries = data.map((item: any) => item.choiceValueIds.map((valueId: string) => ({ choiceId: item.choiceId, choiceValueId: valueId })))
  return entries.reduce((acc: any[], val: any[]) => acc.flatMap((a: any) => val.map((v: any) => [...a, v])), [[]])
}
const areArraysEqual = (arr1: any, arr2: any) => arr1.length === arr2.length &&
  arr1.every((c: any, i: number) => c.choiceId === arr2[i].choiceId && c.choiceValueId === arr2[i].choiceValueId)
const generateUUID = () => Math.floor(Date.now() / 1000).toString(16) + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, () => (Math.random() * 16 | 0).toString(16)).toLowerCase()
const createVariant = async (choices: any) => {
  const platforms: any = {}
  for (const platform of integrationStore.getPlatforms()) platforms[platform.code] = { attributes: {}, prices: { marketPrice: 0, salePrice: 0 } }
  const v: any = { tempId: generateUUID(), choices, platforms, images: [], stockcode: '', barcode: '', stock: 0, prices: { isPlatformBasedPrice: false, marketPrice: 0, salePrice: 0 }, shelf: '' }
  if (choices[0]) {
    v.choiceId = choices[0].choiceId
    v.choiceValueId = choices[0].choiceValueId
    v.choiceValueTitle = choicesStore.getDirectChoiceValueTitle(choices[0].choiceValueId)
  }
  return v
}
const generateVariants = async (newVariants: any) => {
  const existingChoice = props.productInfoForm.variants?.[0]?.choices
  if (existingChoice && existingChoice.length > 0) {
    const allExist = existingChoice.every((existing: any) => newVariants.some((n: any) => n.choiceId === existing.choiceId))
    if (!allExist) {
      snackbarStore.addSnackbar({ show: true, text: 'Eklenmek istenen varyant seçenekleri, ekli olan varyantlardan farklıdır.', timeout: 10000, color: 'error' })
      return
    }
  }
  let count = 0
  for (const combination of getCombinations(newVariants)) {
    if (props.productInfoForm.variants.some((v: any) => areArraysEqual(v.choices, combination))) continue
    props.productInfoForm.variants.push(await createVariant(combination))
    count++
  }
  isVariantGeneratorMenu.value = false
  snackbarStore.addSnackbar({ show: true, text: count ? `${count} varyant eklendi` : 'Seçilen kombinasyonların hepsi zaten var', timeout: 3000, color: count ? 'success' : 'info' })
}

const getVariants = async () => { emits('refreshVariants') }

// ── "Varyant işlemleri" menüsü ──
const variantOpsMenu: EkMenuGroup[] = [
  {
    label: 'Düzenle',
    items: [
      { key: 'search', label: 'Ara', icon: 'mdi-magnify' },
      // Fiyat (genel + kanal), stok, kod ve raf tek tabloda; ayrı "Toplu Fiyat Düzenleme" aynı ekranı açtığı için kaldırıldı.
      { key: 'bulk', label: 'Toplu düzenle', icon: 'mdi-table-edit', description: 'Fiyat, kanal fiyatı, stok, kod, raf' },
      { key: 'batchAttributes', label: 'Toplu özellik düzenle', icon: 'mdi-tag-multiple-outline', description: 'Pazaryeri özellikleri ve kanal bilgileri' },
      { key: 'mapChoices', label: 'Toplu Seçenek Eşleştir', icon: 'mdi-map-outline' },
    ],
  },
  {
    label: 'Kod üret',
    items: [
      { key: 'genStockcode', label: 'Stok kodlarını oluştur', icon: 'mdi-barcode' },
      { key: 'genBarcode', label: 'Barkodları oluştur', icon: 'mdi-barcode-scan' },
    ],
  },
  { items: [{ key: 'deleteAll', label: 'Toplu Silme', icon: 'mdi-trash-can-outline', danger: true }] },
]
function onVariantOp(item: EkMenuItem) {
  switch (item.key) {
    case 'search': searchRef.value?.focus?.(); break
    case 'bulk': openBulkEditor(selectedVariants.value.length ? 'selected' : 'all'); break
    case 'batchAttributes': openBatchAttributes(selectedVariants.value.length ? 'selected' : 'all'); break
    case 'mapChoices': mapAllChoices(); break
    case 'genStockcode': stockcodeBatchProcess(); break
    case 'genBarcode': barcodeBatchProcess(); break
    case 'deleteAll': askDelete(selectedVariants.value.length ? 'selected' : 'all'); break
  }
}
void eventBus
</script>

<style scoped>
.pv { display: flex; flex-direction: column; min-height: 0; }
.pv-frame {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
  overflow: hidden;
}
.pv-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-3);
  min-height: 56px;
  padding: var(--ek-space-2) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
}
.pv-bar.is-on { background: var(--ek-color-selection); }
.pv-bar :deep(.ek-bulk__end) { flex: 0 1 auto; justify-content: flex-end; flex-wrap: wrap; }
.pv-bar__start { display: flex; align-items: center; flex-wrap: wrap; gap: var(--ek-space-1) var(--ek-space-3); flex: 1 1 auto; min-width: 0; }
.pv-bar__tools { display: flex; align-items: center; flex-wrap: wrap; gap: var(--ek-space-2); }
/* FE R4 B: adım kartlarıyla aynı başlık motifi (ikon kapsülü + başlık). */
.pv-bar__icon { flex: none; }
.pv-title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}
.pv-meta { color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); }
.pv-changed {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--ek-space-2) 0 var(--ek-space-1);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: 22px;
  font-weight: 600;
}
.pv-changed .v-icon { color: var(--ek-color-warning); }
.pv-search { width: 260px; flex: 0 1 260px; }
.pv-danger-text { color: var(--ek-color-error) !important; }

.pv-issues { display: inline-flex; align-items: center; flex-wrap: wrap; gap: var(--ek-space-1) var(--ek-space-3); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); }

.pv-issue { display: inline-flex; align-items: center; gap: var(--ek-space-1); font-weight: 600; }
.pv-issue .v-icon { font-size: var(--ek-icon-sm); }
.pv-issue--error { color: var(--ek-color-error-emphasis); }
.pv-issue--error .v-icon { color: var(--ek-color-error); }
.pv-issue--warning { color: var(--ek-color-warning-emphasis); }
.pv-issue--warning .v-icon { color: var(--ek-color-warning); }
.pv-issue--ok { color: var(--ek-color-content-muted); font-weight: 400; }
.pv-issue--ok .v-icon { color: var(--ek-color-success); }
.pv-link {
  color: var(--ek-color-action);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
  border-radius: var(--ek-radius-control);
}
.pv-link:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }

@media (max-width: 760px) {
  .pv-bar { padding: var(--ek-space-2) var(--ek-space-3); }
  .pv-bar__tools { width: 100%; gap: var(--ek-space-1); }
  .pv-bar :deep(.ek-bulk__end) { width: 100%; }
  .pv-search { flex: 1 1 100%; width: auto; margin-bottom: var(--ek-space-1); }
}
@media (max-width: 480px) {
  /* dar ekranda "Görseller / Toplu düzenle / Varyant oluştur" yalnız ikon (aria-label korunur) — araç çubuğu tek satır */
  .pv-bulk-btn__label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
}

/* FE-LOCAL-1054 — varyantlar paneli: düz kart (gölge yok); başlık bandı sakin zeminde (adım kartlarıyla aynı). */
.pv-frame {
  box-shadow: none;
}

.pv-bar {
  background: var(--ek-color-surface-muted);
}

.pv-bar :deep(.ek-icon-tile) {
  background: var(--ek-color-surface);
}

.pv-changed {
  border: 1px solid var(--ek-color-warning-border);
  border-radius: var(--ek-radius-md);
}
</style>
