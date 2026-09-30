<template>
  <div class="productListView">
    <!-- DS-v2 Aşama 2 — liste standardı (EkListScreen). Ürüne özgü: satır altı varyant açılımı
         (`#expanded`, `#variant-target-<id>` kancası korunur), kısmi (varyant) seçim, platform
         hazır/yüklü durumu satır içinde. Toplu işlem merkezi ve aktarım panelleri (diyalog gövdeleri)
         bu adımın kapsamı dışında, olduğu gibi. -->
    <ProductDeleteConfirmDialog v-model="confirmationDelete.isDialogOpen" :product="confirmationDelete.product"
      @confirm="deleteProduct()" @cancel="cancelDeleteProduct()" />
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>
    <ProductGalleryDialog :open="!!galleryProduct" :images="galleryProduct ? productImageSrcs(galleryProduct) : []"
      :title="galleryProduct?.title ?? ''" :attach="dialogAttach"
      @close="galleryProduct = null" @edit="editFromGallery" />
    <EkDialogHost :model-value="!!(transferProductForm.transferProductFormMenu || batchProcessFormMenu)"
      :attach="dialogAttach" placement="end" width="lg"
      @update:model-value="(v) => { if (!v) { transferProductForm.transferProductFormMenu = false; batchProcessFormMenu = false } }">
      <keep-alive>
        <ProductTransferComponent v-if="transferProductForm.transferProductFormMenu"
          key="ProductTransferComponent" v-model="transferProductForm"
          @close="transferProductForm.transferProductFormMenu = false" @transferProducts="transferProducts"
          :isFiltered="isFiltered" />
      </keep-alive>
      <keep-alive>
        <ProductBatchProcessComponent v-if="batchProcessFormMenu"
          key="ProductBatchProcessComponent"
          @close="batchProcessFormMenu = false" @refreshProducts="getProducts" v-model="batchProcessFormMenu"
          :selectedProducts="selectedProducts" :searchProductForm="searchProductForm" />
      </keep-alive>
    </EkDialogHost>

    <EkListScreen
      section="Katalog"
      title="Ürünler"
      description="Tüm kanallardaki ürünlerinizi buradan yönetin."
      label="Ürün listesi"
      noun="ürün"
      row-key="_id"
      label-key="title"
      :columns="columns"
      :rows="products"
      :row-class="(r) => [r.onsale === false ? 'plv-row-offsale' : '', productIdForVariantList == r._id ? 'plv-row-open' : ''].filter(Boolean).join(' ') || undefined"
      :expanded-keys="productIdForVariantList ? [productIdForVariantList] : []"
      :indeterminate-keys="indeterminateKeys"
      :loading="loading"
      :error="loadError"
      error-title="Ürünler yüklenemedi"
      :search="searchProductForm.data.searchText ?? ''"
      :search-placeholder="$t('products.product.searchlabel')"
      :chips="activeChips"
      :filter-count="panelFilterCount"
      :filter-collapsed="filterCollapsed"
      selectable
      :selected="gridSelectedKeys"
      :sort="gridSort"
      :page="searchProductForm.pagination.page"
      :page-size="searchProductForm.pagination.limit"
      :total="searchProductForm.pagination.totalNumberOfRecords"
      :skeleton-rows="searchProductForm.pagination.limit"
      empty-title="Ürün bulunamadı"
      empty-text="Henüz ürün eklenmemiş. İlk ürününüzü tanımlayarak başlayın."
      empty-icon="mdi-tag-outline"
      filtered-empty-title="Ürün bulunamadı"
      filtered-empty-text="Arama kriterlerinize uygun herhangi bir ürün kaydı bulunamadı."
      @update:search="(v) => (searchProductForm.data.searchText = v || undefined)"
      @search-submit="search()"
      @update:filter-collapsed="(v) => (filterCollapsed = v)"
      @update:selected="onGridSelection"
      @update:sort="onGridSort"
      @update:page="onPageChange"
      @update:page-size="onPageSizeChange"
      @filter-submit="searchAdvanced"
      @filter-reset="clearForm"
      @remove-chip="removeChip"
      @clear-filters="clearForm"
      @refresh="getProducts(true)"
    >
      <!-- faz3-fe-help: ilk kullanım — hiç kayıt yokken "Nasıl başlanır?" (filtreli boş sonuçta gösterilmez). -->
      <template #empty-action><HelpStartLink article="gs-first-product-transfer" /></template>
      <template #header-actions>
        <EkButton icon="mdi-plus" @click="openProductDefinition()">Yeni ürün</EkButton>
      </template>

      <template #filters>
        <v-text-field v-model="searchProductForm.data.title" clearable maxlength="160" :label="$t('productDefinitions.product.define.productTitle')" />
        <v-text-field v-model="searchProductForm.data.barcode" clearable label="Barkod" />
        <v-text-field v-model="searchProductForm.data.stockcode" clearable label="Stok kodu" />
        <v-select v-model="searchProductForm.data.onSale" item-value="id" item-title="title" :items="ON_SALE_ITEMS" label="Satış durumu" />
        <CategorySelectBoxComponent v-model="searchProductForm.data.category" :withAll="false" noInit />
        <BrandSelectBoxComponent v-model="searchProductForm.data.brand" :withAll="false" noInit />
        <VCurrencyComponentVue v-model="searchProductForm.data.prices.minSalePrice" :isIconExist="false" label="Minimum fiyat" clearable :required="false" />
        <VCurrencyComponentVue v-model="searchProductForm.data.prices.maxSalePrice" :isIconExist="false" label="Maksimum fiyat" clearable :required="false" />
        <EkSelect v-model="searchProductForm.data.transferStatuses" :items="transferStatusOptions" item-title="title" item-value="value"
          label="Platform yüklenme durumu" multiple clearable class="ek-span-2" />
      </template>

      <template #bulk-actions>
        <v-menu scroll-strategy="close" v-model="headerMenu" :close-on-content-click="false" location="bottom end">
          <template v-slot:activator="{ props: menuProps }">
            <EkButton v-bind="menuProps" size="sm" icon="mdi-dots-horizontal">Toplu işlemler</EkButton>
          </template>
          <v-card class="plv-menu-card">
            <keep-alive>
              <BatchActionsRootComponent v-model:headerMenu="headerMenu" key="BatchActionsRootComponent" @refreshProducts="getProducts"
                v-model="batchPlatformProcessMenu" :selectedProducts="selectedProducts"
                v-model:selectedVariants="selectedVariantsMap" :searchProductForm="searchProductForm" mode="UPDATE" />
            </keep-alive>
          </v-card>
        </v-menu>
      </template>
      <template #toolbar-start>
        <span class="plv-hint">Toplu işlem için satır seçin veya tüm filtre sonucuna uygulayın</span>
      </template>
      <template #toolbar-end>
        <v-menu scroll-strategy="close" v-model="headerMenu" :close-on-content-click="false" location="bottom end">
          <template v-slot:activator="{ props: menuProps }">
            <EkButton v-bind="menuProps" size="sm" icon="mdi-dots-horizontal">Toplu işlemler</EkButton>
          </template>
          <v-card class="plv-menu-card">
            <keep-alive>
              <BatchActionsRootComponent v-model:headerMenu="headerMenu" key="BatchActionsRootComponent" @refreshProducts="getProducts"
                v-model="batchPlatformProcessMenu" :selectedProducts="selectedProducts"
                v-model:selectedVariants="selectedVariantsMap" :searchProductForm="searchProductForm" mode="UPDATE" />
            </keep-alive>
          </v-card>
        </v-menu>
      </template>

      <template #cell-title="{ row }">
        <div class="plv-product" @click="selectProduct(row)">
          <!-- FR2 18–19: büyük kare (56 px, `contain` → fotoğraf kırpılmaz); hover = tek büyük görsel + adet, tıklama = galeri. -->
          <ProductThumb interactive size="md" class="plv-thumb" :src="productImageSrcs(row)[0]" :gallery="productImageSrcs(row)"
            :label="productImageSrcs(row).length ? `${row.title} görsellerini aç` : `${row.title} — görsel yok, ürünü düzenle`"
            :caption="row.title" @click.stop="openGallery(row)" />
          <span class="plv-product__text">
            <span class="plv-product__title">{{ row.title }}</span>
            <button v-if="row.hasVariant" type="button" class="plv-variants-toggle" :aria-expanded="productIdForVariantList == row._id"
              :aria-controls="`variant-target-${row._id}`" :aria-label="`${row.variants.length} seçenek — varyantları ${productIdForVariantList == row._id ? 'gizle' : 'göster'}`"
              @click.stop="selectProduct(row)">
              <v-icon class="plv-variants-toggle__icon" icon="mdi-view-grid-outline" aria-hidden="true" />
              <span class="ek-num">{{ row.variants.length }}</span> seçenek
              <v-icon class="plv-variants-toggle__chevron" :class="{ 'is-open': productIdForVariantList == row._id }" icon="mdi-chevron-down" aria-hidden="true" />
            </button>
            <span v-if="row.hashtags?.length" class="plv-tags">
              <span v-for="hashtag of row.hashtags" :key="hashtag._id ?? hashtag.title" class="plv-tag" :title="hashtag.title">
                <span class="plv-tag__dot" aria-hidden="true" :style="{ '--plv-hashtag-color': hashtag.value }"></span>{{ hashtag.title }}
              </span>
            </span>
          </span>
        </div>
      </template>
      <template #cell-stockcode="{ row }">
        <!-- FR2 22: stok kodu + barkod tek sütunda (iki satır) — kanal sütununa yer açılır, tablo 1440'ta yatay taşmaz. -->
        <span v-if="!row.hasVariant" class="plv-two-line">
          <span class="ek-num">{{ row.variants[0]?.stockcode || '—' }}</span>
          <span class="plv-muted ek-num">{{ row.variants[0]?.barcode || 'Barkod yok' }}</span>
        </span>
        <span v-else class="plv-two-line">
          <span>Varyantlı</span>
          <span class="plv-muted"><span class="ek-num">{{ row.variants.length }}</span> stok kodu</span>
        </span>
      </template>
      <template #cell-price="{ row }">
        <span class="ek-num">{{ priceText(row) }}</span>
      </template>
      <template #cell-stock="{ row }">
        <span class="ek-num" :class="{ 'plv-stock-zero': !row.stock }">{{ row.stock ?? '—' }}</span>
      </template>
      <template #cell-brandCategory="{ row }">
        <span v-if="row.brand || row.category" class="plv-two-line">
          <span>{{ brandsStore.getBrand(row.brand)?.title || '—' }}</span>
          <span class="plv-muted">{{ categoriesStore.getCategory(row.category)?.title || '—' }}</span>
        </span>
        <span v-else class="plv-muted">—</span>
      </template>
      <template #cell-platforms="{ row }">
        <!-- FR2 21–22: kanal başına tek bakışta durum + tıklayınca kanal durumu / gönderime hazır paneli. -->
        <ProductChannelStatus :product="row" :channels="integrationStore.getClientPlatforms()"
          :busy="readyBusy && readyBusy.productId === row._id ? readyBusy.code : null"
          @toggle-ready="(code) => savePlatformUploadIsReadyForProduct(row, code)" />
      </template>
      <template #cell-actions="{ row }">
        <EkRowActions :label="`${row.title} işlemleri`" :items="[
          { key: 'edit', action: 'edit', label: 'Ürünü düzenle', onClick: () => openEditProduct(row) },
          { key: 'delete', action: 'delete', label: 'Ürünü sil', onClick: () => deleteConfirmation(row, focusedTarget()) },
        ]" />
      </template>

      <template #expanded="{ row }">
        <div :id="`variant-target-${row._id}`" class="plv-variants">
          <ProductVariantListComponent v-if="selectedProduct && selectedProduct._id === row._id" :productInfoForm="selectedProduct"
            v-model:selectedVariants="selectedVariantsMap[selectedProduct._id]"
            @transferVariant="(processItem) => transferProduct(selectedProduct, processItem)"
            @updatePriceVariant="(processItem) => updatePriceProduct(selectedProduct, processItem)"
            @updateStockVariant="(processItem) => updateStockProduct(selectedProduct, processItem)"
            @updateVariant="(processItem) => updateProduct(selectedProduct, processItem)"
            @checkVariantStatus="(processItem) => checkProductStatus(selectedProduct, processItem)"
            @editProduct="openEditProduct(selectedProduct)" />
        </div>
      </template>
    </EkListScreen>
  </div>
</template>

<script setup lang="ts">
import HelpStartLink from '@/components/help/HelpStartLink.vue'
import { EkSelect, EkRowActions, EkButton, EkDialogHost } from '@entegrasyonik/ui/components'
import type { EkGridColumn, EkGridSort, EkActiveFilterChip } from '@entegrasyonik/ui/components'
import { useI18n } from 'vue-i18n';
import { ref, onMounted, onBeforeMount, onActivated, watch, computed, nextTick, getCurrentInstance, inject, onDeactivated, onUnmounted, reactive } from 'vue'
import LoadingComponent from '@/components/LoadingComponent.vue'
import ProductThumb from '@/components/productDefinitions/products/ProductThumb.vue'
import ProductGalleryDialog from '@/components/productDefinitions/products/ProductGalleryDialog.vue'
import ProductChannelStatus from '@/components/productDefinitions/products/ProductChannelStatus.vue'
import { productImageSrcs } from '@/components/productDefinitions/products/productImage'
import { formatMoney } from '@entegrasyonik/ui/format'
import EkListScreen from '@/components/page/templates/EkListScreen.vue'
import { isRequestError } from '@entegrasyonik/ui/components/listStandard'
import CategorySelectBoxComponent from '@/components/common/CategorySelectBoxComponent.vue'
import BrandSelectBoxComponent from '@/components/common/BrandSelectBoxComponent.vue'
import VCurrencyComponentVue from '@/components/VCurrencyComponent.vue'

import ProductTransferComponent from '@/components/productDefinitions/products/ProductTransferComponent.vue'
import ProductVariantListComponent from '@/components/productDefinitions/variants/ProductVariantListComponent.vue'

import ProductBatchProcessComponent from '@/components/productDefinitions/products/ProductBatchProcessComponent.vue'
import useRestApi from '@/composables/restapi'
import { useBrandsStore } from '@/stores/brandsStore';
import { useCategoriesStore } from '@/stores/categoriesStore';
import { useIntegrationStore } from '@/stores/integrationStore';
import { useTabStore } from '@/composables/opentab'
import { useSnackbarStore } from '@/stores/snackbarStore';
import { useStaticsStore } from '@/stores/staticsStore';
import useUser from '@/composables/user';
import { PLATFORM_PROCESS } from '@/types/PlatformProcess';
;
import ProductDeleteConfirmDialog from '@/components/productDefinitions/products/ProductDeleteConfirmDialog.vue';
import BatchActionsRootComponent from '@/components/productDefinitions/products/BatchActions/BatchActionsRootComponent.vue';
const userApi = useUser()

const emits = defineEmits(['clear'])
const menuProduct = ref<{ [key: string]: boolean }>({})
const headerMenu = ref(false)

const staticsStore = useStaticsStore()

const snackbarStore = useSnackbarStore();

const integrationStore = useIntegrationStore()
const productIdForVariantList = ref(0)
const selectedProduct = ref()
const dialogAttach: any = ref("")
const selectedProducts: any = ref([])
const sortIcon: any = ref(false)
const isSkeletonVisible: any = ref(false)
const variantListKey = ref(0)
const eventBus: any = inject('eventBus');
const transferStatusItems: any = ref([])
const confirmationDelete = reactive<any>(
  {
    activator: undefined,
    isDialogOpen: false,
    product: undefined
  }
)

const menuStore: any = inject('useMenuStore')
const isMounted = ref(false)
const restApi = useRestApi()
const brandsStore = useBrandsStore()
const categoriesStore = useCategoriesStore()
const loadingComponentRef: any = ref(null)
const searchProductForm: any = ref()
const transferProductForm: any = ref({ transferProductFormMenu: false, transferProduct: undefined })
const batchProcessFormMenu: any = ref(false)
const batchPlatformProcessMenu: any = ref(false)
const isFiltered = ref(false)
const products: any = ref<any>([])
const fromTo: any = ref({})
const loading = ref(false)
const show = ref(true)

const selectedVariantsMap = ref<any>({})

const isProductIndeterminate = (item: any) => {
  if (!item.hasVariant) return false
  const selected = selectedVariantsMap.value[item._id] || []
  return selected.length > 0 && selected.length < item.variants.length
}

const isProductSelected = (item: any) => {
  if (!item.hasVariant) return selectedProducts.value.includes(item._id)
  const selected = selectedVariantsMap.value[item._id] || []
  return selected.length === item.variants.length && item.variants.length > 0
}

const onProductSelectionUpdate = (item: any, val: boolean) => {
  if (val) {
    if (!selectedProducts.value.includes(item._id)) {
      selectedProducts.value.push(item._id)
    }
    if (item.hasVariant) {
      selectedVariantsMap.value[item._id] = item.variants.map((v: any) => v.barcode)
    }
  } else {
    selectedProducts.value = selectedProducts.value.filter((id: any) => id !== item._id)
    if (item.hasVariant) {
      selectedVariantsMap.value[item._id] = []
    }
  }
}

watch(selectedVariantsMap, (newMap) => {
  // Varyant seçimleri değiştiğinde, eğer bir ürünün tüm varyantları seçiliyse ürünü de seçili yap, hiçbiri seçili değilse çıkar
  for (const productId in newMap) {
    const product = products.value.find((p: any) => p._id === productId)
    if (product && product.hasVariant) {
      const selectedCount = newMap[productId].length
      if (selectedCount === product.variants.length && product.variants.length > 0) {
        if (!selectedProducts.value.includes(productId)) selectedProducts.value.push(productId)
      } else if (selectedCount === 0) {
        selectedProducts.value = selectedProducts.value.filter((id: any) => id !== productId)
      } else {
        // Indeterminate durumu checkbox tarafından isProductIndeterminate ile yönetilecek, 
        // ancak toplu işlemler için ürünün listede olması gerekebilir (opsiyonel tercih)
        if (!selectedProducts.value.includes(productId)) selectedProducts.value.push(productId)
      }
    }
  }
}, { deep: true })


const { t } = useI18n()
const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}







const selectProduct = async (product: any) => {
  if (product && product._id && !selectedVariantsMap.value[product._id]) {
    selectedVariantsMap.value[product._id] = []
  }

  if (productIdForVariantList.value != 0) {
    productIdForVariantList.value = 0
    return
  }
  if (product?.hasVariant) {
    selectedProduct.value = product

    if (productIdForVariantList.value == product._id) {
      productIdForVariantList.value = 0
    }
    else productIdForVariantList.value = product._id

  }
}

const tabStore = useTabStore()

const openProductDefinition = () => {
  let link: any = menuStore.getMenuLinkWithTitle('productDefinition')
  eventBus.emit('openTab', link)
}


const openEditProduct = (product?: any) => {
  let link: any = menuStore.getMenuLinkWithTitle('productUpdate')
  if (product)
    link.parameters = { productId: product._id }

  const clonedLink = JSON.parse(JSON.stringify(link))
  clonedLink.component = menuStore.getViewComponent(link.code)
  clonedLink.code = link.code + '_' + product._id
  clonedLink.title = product.title

  eventBus.emit('openTab', clonedLink)
}



const toggleSort = (key: any) => {
  if (searchProductForm.value.sort.field === key) {
    searchProductForm.value.sort.direction = searchProductForm.value.sort.direction == 'asc' ? 'desc' : 'asc'
  } else {
    searchProductForm.value.sort.field = key
    searchProductForm.value.sort.direction = 'asc'
  }
  getProducts(true)
}

const sortProducts = (sortBys: any) => {
}


const checkProductStatus = async (product: any, processItem: any = undefined) => {
  var isReady = true
  let guid = loadingComponentRef.value.info("")
  let response = await restApi.post("IntegrationService/checkProductStatus", { productId: product._id, variantId: processItem?.variantId, integrationCode: processItem?.integrationCode })
  loadingComponentRef.value.remove(guid)
  if (response == true) {
    search()
    snackbarStore.addSnackbar({
      show: true,
      text: 'Ürün durum güncellemesi isteği kaydedildi.',
      timeout: 5000,
      color: 'info'
    })

  }
}



const transferProduct = async (product: any, processItem: any = undefined) => {
  var isReady = true
  let guid = loadingComponentRef.value.info("")
  let response = await restApi.post("IntegrationService/processPlatformProduct", { mode: PLATFORM_PROCESS.TRANSFER, productId: product._id, variantId: processItem?.variantId, integrationCode: processItem?.integrationCode })
  loadingComponentRef.value.remove(guid)
  if (response?.length > 0) {
    search()
    userApi.retrieveProductStatistics()
    snackbarStore.addSnackbar({
      show: true,
      text: 'Ürün gönderim isteği alındı, Platform Yüklenme Durumları bölümünden kontrol edebilirsiniz.',
      timeout: 10000,
      color: 'info'
    })

  }
}


const updatePriceProduct = async (product: any, processItem: any = undefined) => {
  var isReady = true
  let guid = loadingComponentRef.value.info("")
  let response = await restApi.post("IntegrationService/processPlatformProduct", { mode: PLATFORM_PROCESS.UPDATE_PRICE, productId: product._id, variantId: processItem?.variantId, integrationCode: processItem?.integrationCode })
  loadingComponentRef.value.remove(guid)
  if (response && response.modifiedCount > 0) {
    getProducts()
  }
}

const updateStockProduct = async (product: any, processItem: any = undefined) => {
  var isReady = true
  let guid = loadingComponentRef.value.info("")
  let response = await restApi.post("IntegrationService/processPlatformProduct", { mode: PLATFORM_PROCESS.UPDATE_STOCK, productId: product._id, variantId: processItem?.variantId, integrationCode: processItem?.integrationCode })
  loadingComponentRef.value.remove(guid)
  if (response && response.modifiedCount > 0) {
    getProducts()
  }
}

const updateProduct = async (product: any, processItem: any = undefined) => {
  var isReady = true
  let guid = loadingComponentRef.value.info("")
  let response = await restApi.post("IntegrationService/processPlatformProduct", { mode: PLATFORM_PROCESS.UPDATE, productId: product._id, variantId: processItem?.variantId, integrationCode: processItem?.integrationCode })
  loadingComponentRef.value.remove(guid)
  if (response && response.modifiedCount > 0) {
    getProducts()
  }
}

// FR2 22: "gönderime hazır" anahtarı (kanal durumu paneli; bayrak backend'de yalnız saklanır). Kayıt süresince yalnız o anahtar kilitlenir; sonuç satıra
// hemen yansır (liste yeniden yüklenmeden — panel açık kalır, kaydırma/açık varyant kaybolmaz). API ve gövde AYNI.
const readyBusy = ref<{ productId: string; code: string } | null>(null)
const savePlatformUploadIsReadyForProduct = async (product: any, integrationCode: string) => {
  if (readyBusy.value) return
  const isReady = !product.platformUploads?.[integrationCode]?.isReady
  readyBusy.value = { productId: product._id, code: integrationCode }
  try {
    const response = await restApi.post("IntegrationService/savePlatformUploadIsReadyForProduct", { productId: product._id, integrationCode: integrationCode, isReady: isReady })
    if (response && response.modifiedCount > 0) {
      product.platformUploads = { ...(product.platformUploads ?? {}), [integrationCode]: { ...(product.platformUploads?.[integrationCode] ?? {}), isReady } }
    } else if (!isRequestError(response)) {
      snackbarStore.addSnackbar({ text: 'Gönderime hazır işareti değişmedi — ürün kaydı güncel olmayabilir, listeyi yenileyin.', color: 'warning' })
    }
  } finally {
    readyBusy.value = null
  }
}

// FR2 19: hover önizlemesinin devamı — tıklayınca salt-okunur galeri; görsel yoksa doğrudan düzenleme.
const galleryProduct = ref<any>(null)
function openGallery(product: any) {
  if (!productImageSrcs(product).length) return openEditProduct(product)
  galleryProduct.value = product
}
function editFromGallery() {
  const product = galleryProduct.value
  galleryProduct.value = null
  if (product) openEditProduct(product)
}

const updateOnsale = async (product: any) => {
  let guid = loadingComponentRef.value.info("")
  let response = await restApi.post("ProductService/updateOnsale", { _id: product._id, onsale: product.onsale })
  loadingComponentRef.value.remove(guid)
  if (response && response.result == true) {
    getProducts()
  }
}

const transferProducts = async () => {
  transferProductForm.transferSearchText = undefined
  //transferProducts()
}



const getProducts = async (reset: boolean = false) => {
  loading.value = true
  loadError.value = false
  selectedProducts.value.length = 0
  isSkeletonVisible.value = false
  if (reset == true) {
    searchProductForm.value.pagination.page = 1
  }

  const transferStatuses = []

  if (searchProductForm.value?.data?.transferStatuses) {
    for (const transferStatus of searchProductForm.value.data.transferStatuses) {
      /**
       * MAPPING MANTIĞI:
       * Önyüzden gelen 'WAITING|trendyol' seçimini backend'in anlayacağı 
       * WAITING ve SENT statülerine çeviriyoruz.
       */
      const [status, code] = transferStatus.split('|')

      if (status === 'WAITING') {
        transferStatuses.push(`WAITING|${code}`)
        transferStatuses.push(`SENT|${code}`)
      } else {
        // PENDING, FAILED ve COMPLETED doğrudan eklenir
        transferStatuses.push(transferStatus)
      }
    }
  }

  const searchProductFormCloned = JSON.parse(JSON.stringify(searchProductForm.value))
  if (searchProductFormCloned.data)
    searchProductFormCloned.data.transferStatuses = transferStatuses

  // EĞER SATIŞTA OLAN ÜRÜNLER FİLTRESİ SEÇİLİR VE HİÇBİR PLATFORM SEÇİLMEZSE TÜM PLATFORMLARDA SATIŞTA OLANLARI GETİR
  if (searchProductFormCloned.data?.onSale != -1 && transferStatuses.length == 0) {
    for (const integration of integrationStore.getClientPlatforms()) {
      searchProductFormCloned.data.transferStatuses.push(`PENDING|${integration.code}`)
      searchProductFormCloned.data.transferStatuses.push(`SENT|${integration.code}`)
      searchProductFormCloned.data.transferStatuses.push(`WAITING|${integration.code}`)
      searchProductFormCloned.data.transferStatuses.push(`FAILED|${integration.code}`)
      searchProductFormCloned.data.transferStatuses.push(`COMPLETED|${integration.code}`)
    }
  }

  applied.value = JSON.parse(JSON.stringify(searchProductForm.value.data))
  let response = await restApi.post("ProductService/getProducts", { searchProductForm: searchProductFormCloned })
  isSkeletonVisible.value = false
  loading.value = false
  if (isRequestError(response)) {
    loadError.value = true
    return
  }
  fromTo.value = response?.fromTo

  if (response && response.products) {
    products.value = response.products

    for (const product of products.value) {
      product.images = product.images.sort((a: any, b: any) => a.order - b.order)
      if (!product.images) product.images = []

      if (product.hasVariant && product.variants) {
        product.variants.forEach((v: any, index: number) => {
          if (!v.barcode) v.barcode = v.barcode || `${product._id}_${index}`
        })
      }
    }

    selectProduct(undefined)
    productIdForVariantList.value = 0
    const selectedProductId = selectedProduct.value?._id
    selectedProduct.value = undefined

    if (selectedProductId && products.value) {
      const foundProduct = products.value.find((product: any) => product._id == selectedProductId)
      selectProduct(foundProduct)
    }

    searchProductForm.value.pagination.totalNumberOfPages = Math.ceil(response.totalNumberOfRecords / searchProductForm.value.pagination.limit)
    searchProductForm.value.pagination.totalNumberOfRecords = response.totalNumberOfRecords
    isFiltered.value = response.isFiltered

    loading.value = false
  }
}

// --- DS-v2 liste standardı (EkListScreen) ---
const loadError = ref(false)
// 9 alanlı panel: tablo ilk ekranda görünsün diye kapalı başlar (aktif filtreler çip olarak görünür).
const filterCollapsed = ref(true)
const ON_SALE_ITEMS = [{ id: -1, title: 'Hepsi' }, { id: 1, title: 'Satışta olanlar' }, { id: 0, title: 'Satışta olmayanlar' }]
const TRANSFER_STATUS_TITLES: Record<string, string> = { PENDING: 'Hazırlanan', WAITING: 'Onay bekleyen', FAILED: 'Hatalı', COMPLETED: 'Onaylanan' }

// Sıralama: ProductService.getProducts `sort.field` izin listesi (SUNUCU tarafı). Kolon anahtarı = alan.
const columns: EkGridColumn[] = [
  { key: 'title', label: 'Ürün', sortable: true, wrap: true, width: '320px' },
  { key: 'stockcode', label: 'Stok kodu / barkod', sortable: true },
  { key: 'price', label: 'Fiyat', type: 'num', sortable: true },
  { key: 'stock', label: 'Stok', type: 'num', sortable: true },
  { key: 'brandCategory', label: 'Marka / kategori' },
  { key: 'platforms', label: 'Kanallar', width: '200px' },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
]

const gridSort = computed<EkGridSort>(() => {
  const sort = searchProductForm.value?.sort
  if (!sort?.field || sort.field === '_id') return null
  return { key: sort.field, dir: sort.direction === 'asc' ? 'asc' : 'desc' }
})

function onGridSort(sort: EkGridSort) {
  searchProductForm.value.sort = sort ? { field: sort.key, direction: sort.dir } : { field: '_id', direction: 'desc' }
  getProducts(true)
}

// Grid seçimi → mevcut ürün/varyant seçim mantığı (tümü / tek satır).
function onGridSelection(keys: Array<string | number>) {
  const total = products.value.length
  const before = gridSelectedKeys.value.length
  // Başlıktaki "tümünü seç" kutusu: tümü ↔ hiçbiri
  if (total > 1 && keys.length === total && before !== total && keys.length - before > 1) return toggleAllProductsSelection(true)
  if (total > 1 && keys.length === 0 && before === total) return toggleAllProductsSelection(false)
  const next = new Set(keys)
  for (const product of products.value) {
    const was = gridSelectedKeys.value.includes(product._id)
    const now = next.has(product._id)
    if (was !== now) onProductSelectionUpdate(product, now)
  }
}

const gridSelectedKeys = computed(() => products.value.filter((p: any) => isProductSelected(p)).map((p: any) => p._id))
const indeterminateKeys = computed(() => products.value.filter((p: any) => isProductIndeterminate(p)).map((p: any) => p._id))

const transferStatusOptions = computed(() => transferStatusItems.value.flatMap((group: any) =>
  (group.children ?? []).map((child: any) => ({ title: `${TRANSFER_STATUS_TITLES[group.id] ?? group.id} · ${child.title}`, value: child.id }))))

// Aktif filtre çipleri — SON SORGULANAN değerlerden.
const applied = ref<any>({})

const activeChips = computed<EkActiveFilterChip[]>(() => {
  const a = applied.value || {}
  const chips: EkActiveFilterChip[] = []
  if (a.searchText) chips.push({ key: 'searchText', label: 'Arama', value: a.searchText })
  if (a.title?.trim()) chips.push({ key: 'title', label: 'Ürün adı', value: a.title })
  if (a.barcode?.trim()) chips.push({ key: 'barcode', label: 'Barkod', value: a.barcode })
  if (a.stockcode?.trim()) chips.push({ key: 'stockcode', label: 'Stok kodu', value: a.stockcode })
  if (a.onSale !== undefined && a.onSale !== null && a.onSale !== -1) chips.push({ key: 'onSale', label: 'Satış', value: ON_SALE_ITEMS.find(i => i.id === a.onSale)?.title ?? String(a.onSale) })
  if (a.category) chips.push({ key: 'category', label: 'Kategori', value: categoriesStore.getCategory(a.category)?.title ?? 'Seçili' })
  if (a.brand) chips.push({ key: 'brand', label: 'Marka', value: brandsStore.getBrand(a.brand)?.title ?? 'Seçili' })
  if (a.prices?.minSalePrice) chips.push({ key: 'minSalePrice', label: 'Min. fiyat', value: formatMoney(a.prices.minSalePrice) })
  if (a.prices?.maxSalePrice) chips.push({ key: 'maxSalePrice', label: 'Maks. fiyat', value: formatMoney(a.prices.maxSalePrice) })
  if (a.transferStatuses?.length) {
    const titleOf = (id: string) => transferStatusOptions.value.find((o: any) => o.value === id)?.title ?? id
    chips.push({ key: 'transferStatuses', label: 'Platform durumu', value: a.transferStatuses.map(titleOf).join(', ') })
  }
  return chips
})

const panelFilterCount = computed(() => activeChips.value.filter(c => c.key !== 'searchText').length)

function removeChip(key: string) {
  const d = searchProductForm.value.data
  if (key === 'minSalePrice' || key === 'maxSalePrice') d.prices[key] = 0
  else if (key === 'onSale') d.onSale = -1
  else if (key === 'transferStatuses') d.transferStatuses = []
  else d[key] = undefined
  getProducts(true)
}

function onPageChange(page: number) {
  searchProductForm.value.pagination.page = page
  getProducts()
}

function onPageSizeChange(size: number) {
  searchProductForm.value.pagination.limit = size
  getProducts(true)
}

function priceText(item: any): string {
  const min = item.prices?.minSalePrice
  const max = item.prices?.maxSalePrice
  if (min === undefined && max === undefined) return '—'
  return min === max || max === undefined ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`
}


const isObject = (value: any) => {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const cancelDeleteProduct = async () => {
  confirmationDelete.product = undefined
  confirmationDelete.isDialogOpen = false
  await sleep(100)
  confirmationDelete.activator = undefined
}

/** Satır eylem menüsünden gelen silmede diyaloğun odak dönüş hedefi: o an odaktaki düğme. */
const focusedTarget = () => ({ currentTarget: document.activeElement })

const deleteConfirmation = async (product: any, event: any) => {
  confirmationDelete.activator = event.currentTarget
  confirmationDelete.isDialogOpen = true
  confirmationDelete.product = product
}

const deleteProduct = async () => {
  confirmationDelete.isDialogOpen = false
  if (confirmationDelete.product == undefined) {
    return
  }
  let guid = loadingComponentRef.value.info(t('loading.info.deleteProduct'))
  const response = await restApi.post("ProductService/deleteProduct", { _id: confirmationDelete.product._id })
  loadingComponentRef.value.remove(guid)
  if (response && response.deletedCount == 1 && response.acknowledged == true) {
    getProducts()

    snackbarStore.addSnackbar({
      show: true,
      text: 'Ürün silindi',
      timeout: 2000,
      color: 'success'
    })
  } else {
    snackbarStore.addSnackbar({
      show: true,
      text: 'Ürün silinemedi',
      timeout: 2000,
      color: 'error'
    })
  }
}


var a = () => {
}

var props = defineProps<{
  isRendered: boolean,
  parameters: any
}>()


const resetAndSetTransferStatus = (forceSearchProducts?: boolean) => {
  if (!props.parameters) return
  reset()
  if (props.parameters?.transferStatuses?.length > 0) {
    for (const transferStatus of props.parameters.transferStatuses) {
      searchProductForm.value.data?.transferStatuses?.push(transferStatus.status + '|' + transferStatus.integrationCode)
    }
    if (forceSearchProducts == true) {
      getProducts()
    }
  }
  emits("clear")
}

const initialize = async () => {
  resetAndSetTransferStatus()
  getProducts()
  /*   console.log("ProductListView Initialized", props.parameters) */

}
const activate = async () => {
  resetAndSetTransferStatus(true)
  /*   console.log("ProductListView1111 Activated", props.parameters) */
}

const destroy = async () => {/* 
  console.log("ProductListView Destroyed") */
  reset()
}


onActivated(() => {
  console.log("ProductListView onactivated")

  /*   console.log("onactivated productlist") */

});
onDeactivated(() => {/* 
  console.log("ondeactivated test productlist", props.isRendered) */
  /*   if (props.isRendered == false) */
})

defineExpose({
  initialize,
  activate,
  destroy
});

onMounted(() => {
  isMounted.value = true
  dialogAttach.value = '.productListView'
  initTransferStatusItems()
});

onBeforeMount(() => {
  reset()
})

const reset = () => {
  transferProductForm.value = { transferProductFormMenu: false, transferProduct: undefined }

  resetSearchProductForm()
}

const isFormDirty = () => {
  const data = searchProductForm.value.data

  return (
    data.prices.minSalePrice !== 0 ||
    data.prices.maxSalePrice !== 0 ||
    data.category !== undefined ||
    data.brand !== undefined ||
    !!data.title?.trim() ||         // boşluklu bile olsa temizler
    !!data.barcode?.trim() ||
    !!data.stockcode?.trim() ||
    data.transferStatuses?.length > 0
  )
}


const toggleAllProductsSelection = (value: boolean) => {
  if (value) {
    // Tüm ürünleri seç
    selectedProducts.value = products.value.map((p: any) => p._id);

    // Varyantı olan tüm ürünlerin varyantlarını da haritaya ekle
    products.value.forEach((product: any) => {
      if (product.hasVariant) {
        selectedVariantsMap.value[product._id] = product.variants.map((v: any) => v.barcode);
      }
    });
  } else {
    // Seçimleri temizle
    selectedProducts.value = [];
    selectedVariantsMap.value = {};
  }
};


const clearForm = () => {
  resetSearchProductForm()
  getProducts(true)
}

const searchAdvanced = () => {
  searchProductForm.value.data.searchText = undefined
  search()
}

const search = () => {
  getProducts(true)
  searchProductForm.value.form.menu = false
}

const initTransferStatusItems = () => {
  const pendingItems = []
  const waitingItems = []
  const failedItems = []
  const completedItems = []

  for (const integration of integrationStore.getClientPlatforms()) {
    pendingItems.push({ id: 'PENDING|' + integration.code, title: integration.title })
    waitingItems.push({ id: 'WAITING|' + integration.code, title: integration.title })
    failedItems.push({ id: 'FAILED|' + integration.code, title: integration.title })
    completedItems.push({ id: 'COMPLETED|' + integration.code, title: integration.title })
  }

  transferStatusItems.value = [
    { id: "PENDING", icon: 'mdi-pencil-outline', color: 'var(--ek-color-info)', title: "Hazırlanan (Pending)", children: pendingItems },
    { id: "WAITING", icon: 'mdi-clock-outline', color: 'var(--ek-color-secondary)', title: "Onay Bekleyen (Waiting)", children: waitingItems },
    { id: "FAILED", icon: 'mdi-close-box-outline', color: 'var(--ek-color-danger)', title: "Hatalı (Failed)", children: failedItems },
    { id: "COMPLETED", icon: 'mdi-checkbox-marked', color: 'var(--ek-color-success)', title: "Onaylanan (Completed)", children: completedItems },
  ]
}


const resetSearchProductForm = () => {
  searchProductForm.value = {
    data: {
      searchText: undefined,
      prices: { minSalePrice: 0, maxSalePrice: 0 },
      category: undefined,
      brand: undefined,
      title: undefined,
      barcode: undefined,
      stockcode: undefined,
      onSale: -1,
      transferStatuses: []
    },
    form: {
      menu: false,
      valid: false
    },
    sort: { field: '_id', direction: 'desc' },
    pagination: {
      limit: 25,
      page: 1,
      totalNumberOfPages: 1,
      totalNumberOfRecords: 0
    }
  }
}


</script>

<style>
.masked {
  position: relative;
  /* bu olmazsa ::before belgeye göre konumlanır! */
  z-index: 0;
  overflow: hidden;
  /* istenirse taşmaları engeller */
}

.masked::before {
  content: "";
  position: absolute;
  inset: 0;
  background: black;
  mix-blend-mode: multiply;
  opacity: 0.2;
  z-index: 1;
  pointer-events: none;
}

.table-container {
  display: flex;
  margin-top: 20px;
  flex-grow: 1;
  overflow: hidden;
}

.flex-table {
  display: flex;
  flex-grow: 1;
  width: 100%;
}

.flex-table>div {
  width: 100%;
}

.custom-float {
  animation: float 1s ease-in-out infinite;
}

@keyframes float {
  0% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(5px);
  }

  100% {
    transform: translateY(0);
  }
}

/* Ana Kapsayıcı: Tek bir temiz rozet görünümü */
.status-badge-wrapper {
  display: inline-flex;
  align-items: center;
  background-color: white;
  /* Slate 100 */
  border: 1px solid var(--ek-color-border-color-light);
  /* Slate 200 */
  padding: 0 8px;
  border-radius: 8px;
  height: 26px;
  cursor: help;
  /* Tooltip olduğunu kullanıcıya hissettirir */
}

.status-item {
  display: flex;
  align-items: center;
  position: relative;
}

/* Renkli Noktalar: Karmaşayı bitiren minimal dokunuş */
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 5px;
}

.pending {
  background-color: var(--ek-color-info);
}

/* Mavi */
.waiting {
  background-color: var(--ek-color-secondary);
}

/* Turkuaz */
.failed {
  background-color: var(--ek-color-danger);
}

/* Kırmızı */
.completed {
  background-color: var(--ek-color-success);
}

/* Yeşil */

/* Sayılar: Net ve okunabilir */
.status-count {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--ek-color-content-muted);
  margin-right: 6px;
}

.on-sale {
  font-weight: 400;
  opacity: 0.6;
  font-size: 0.7rem;
}

/* Öğeler arası dikey çizgi */
.mini-divider {
  width: 1px;
  height: 10px;
  background-color: var(--ek-color-border-strong);
  margin-right: 8px;
}

/* Hover Efekti */
.status-badge-wrapper:hover {
  background-color: var(--ek-color-light-color);
  border-color: var(--ek-color-border-color);
}

.status-summary-cell {
  vertical-align: middle;
  padding: 4px 8px;
}

/* --- plv- öneki: bu <style> global olduğu için ad çakışmasını önler. Toplu işlem/aktarım
   diyaloğu kabın içine (attach) iliştirilir; kapalıyken görünmez tutulur. --- */
.plv-dialog-transition {
  transition: opacity var(--ek-duration-fast) var(--ek-easing-enter) !important;
}

.plv-dialog-hidden {
  visibility: hidden;
  opacity: .2 !important;
}

.plv-menu-card {
  border-radius: var(--ek-radius-popover);
}

</style>

<style scoped>
.productListView {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

@media (max-width: 767px) {
  .productListView {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}

.plv-hint,
.plv-muted {
  color: var(--ek-color-content-muted);
}

.plv-hint {
  font-size: var(--ek-type-caption-size);
}

.plv-product {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-width: 260px;
  max-width: 380px;
  padding: var(--ek-space-1) 0;
  cursor: pointer;
}

.plv-product__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  white-space: normal;
}

.plv-product__title {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.plv-variants-toggle {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: var(--ek-space-1);
  height: var(--ek-app-chip-h-sm);
  margin-top: 2px;
  padding: 0 var(--ek-space-1) 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.plv-variants-toggle:hover,
.plv-variants-toggle[aria-expanded='true'] {
  border-color: var(--ek-color-action);
}

.plv-variants-toggle__icon {
  font-size: var(--ek-icon-xs);
}

.plv-variants-toggle__chevron {
  font-size: var(--ek-icon-sm);
  transition: transform var(--ek-duration-base) var(--ek-easing-standard);
}

.plv-variants-toggle__chevron.is-open {
  transform: rotate(180deg);
}

.plv-variants-toggle:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
  border-radius: var(--ek-radius-sm);
}

.plv-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
  margin-top: 2px;
}

.plv-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.plv-tag__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-chip);
  background: var(--plv-hashtag-color, var(--ek-color-neutral));
}

.plv-stock-zero {
  color: var(--ek-color-error);
  font-weight: var(--ek-font-weight-semibold);
}

.plv-two-line {
  display: inline-flex;
  flex-direction: column;
}

.plv-two-line .plv-muted {
  font-size: var(--ek-type-caption-size);
}

.plv-row-actions {
  display: inline-flex;
  gap: var(--ek-space-1);
}

.plv-danger {
  color: var(--ek-color-error);
}

/* A11 — açık ürün satırı ile varyant alanı tek parça: satırın alt çizgisi kalkar, zemin varyant alanıyla aynı ton. */
.plv-variants {
  padding: 0;
}

:deep(.plv-row-open) > td {
  border-bottom-color: transparent !important; /* ızgara satır çizgisi — açık satır varyant alanına bağlanır */
  background: var(--ek-color-surface-sunken) !important; /* yapışık kolonun kendi yüzeyi de aynı tona */
}

/* Varyant alanının sol şeridi (EkDataGrid genişleme hücresi) ürün satırında başlar → satır + alan tek blok. */
:deep(.plv-row-open) > td:first-child {
  box-shadow: inset 3px 0 0 var(--ek-color-action-border) !important; /* yapışık seçim hücresi gölgesinin yerine */
}

:deep(.plv-row-offsale) .plv-product__title {
  color: var(--ek-color-content-muted);
}
</style>
