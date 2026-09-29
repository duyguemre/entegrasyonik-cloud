<template>
  <div class="productListView pt-4">
    <!-- ek-pattern-exception: EkListPage/EkDataTable/EkDetailSheet — gerçekten farklı bir
         etkileşim modeli (satır-içi varyant genişletme [rowspan+teleport], sürükle-seç
         benzeri toplu platform işlem paneli, sıralanabilir özel başlık slot'ları); mevcut
         spec kancası (`.productListView tbody tr` + satır tıklamasıyla açılan
         `.v-checkbox-btn`) bu yapıya sıkı bağlı. EkPageHeader/EkEmptyState ile hafif
         dokunuşla iyileştirildi (ADR-0015 Karar 6, B1 teslim raporunda gerekçelendirildi). -->
    <EkPageHeader
      section="Katalog"
      title="Ürünler"
      description="Tüm kanallardaki ürünlerinizi buradan yönetin."
      :primary-action="{ label: 'Yeni ürün', icon: 'mdi-plus', onClick: () => openProductDefinition() }"
    />
    <teleport v-if="isMounted" v-show="productIdForVariantList" :to="`#variant-target-${productIdForVariantList}`">
      <ProductVariantListComponent v-if="selectedProduct" :productInfoForm="selectedProduct"
        v-model:selectedVariants="selectedVariantsMap[selectedProduct._id]"
        @transferVariant="(processItem) => transferProduct(selectedProduct, processItem)"
        @updatePriceVariant="(processItem) => updatePriceProduct(selectedProduct, processItem)"
        @updateStockVariant="(processItem) => updateStockProduct(selectedProduct, processItem)"
        @updateVariant="(processItem) => updateProduct(selectedProduct, processItem)"
        @checkVariantStatus="(processItem) => checkProductStatus(selectedProduct, processItem)" />
    </teleport>
    <div id="variant-target-0" v-show="false" class="plv-variant-target-placeholder"></div>
    <v-menu v-model="confirmationDelete.isDialogOpen" :close-on-content-click="false"
      :activator="confirmationDelete.activator" @update:model-value="cancelDeleteProduct()">
      <template v-slot:activator>
        <span></span>
      </template>

      <v-card prepend-icon="mdi-delete-outline" color="danger" class="pl-4 pr-4">
        <template v-slot:prepend>
        </template>
        <template v-slot:title>
          <div class="d-flex align-center justify-center">
            <v-icon>mdi-exclamation</v-icon>
            ÜRÜN SİLİNECEK
            <v-icon size="xx-large">mdi-exclamation</v-icon>
          </div>
        </template>
        <template v-slot:text>
          <div class="d-flex justify-center">Silmek istediğnizden emin misiniz?</div>
          <div class="mt-4 mb-4 text-center">
            <v-btn color="tonal" min-width="100" variant="outlined" @click="cancelDeleteProduct()" class="mr-4">
              {{ $t('common.cancel') }}
            </v-btn>

            <v-btn color="error" bg-color="error" variant="flat" class="plv-border-surface" min-width="100"
              @click="deleteProduct()">
              {{ $t('common.delete') }}
            </v-btn>
          </div>
        </template>
      </v-card>
    </v-menu>


    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>
    <v-dialog scrim persistent :retain-focus="false" v-model="show" location-strategy="connected" target="cursor"
      no-click-animation :close-on-content-click="false" :attach="dialogAttach" class="plv-dialog-transition"
      :class="{ 'plv-dialog-hidden': !batchPlatformProcessMenu && !transferProductForm.transferProductFormMenu && !searchProductForm.searchProductFormMenu && !batchProcessFormMenu }"
      :contained="true" location="left" height="100%" width="100%">

      <keep-alive>
        <ProductTransferComponent class="plv-panel-transition"
          v-if="transferProductForm.transferProductFormMenu"
          :class="{ 'plv-panel-hidden': !transferProductForm.transferProductFormMenu }"
          key="ProductTransferComponent" v-model="transferProductForm"
          @close="transferProductForm.transferProductFormMenu = false" @transferProducts="transferProducts"
          :isFiltered="isFiltered" />
      </keep-alive>


      <keep-alive>
        <ProductBatchProcessComponent class="plv-panel-transition" v-if="batchProcessFormMenu"
          key="ProductBatchProcessComponent" :class="{ 'plv-panel-hidden': !batchProcessFormMenu }"
          @close="batchProcessFormMenu = false" @refreshProducts="getProducts" v-model="batchProcessFormMenu"
          :selectedProducts="selectedProducts" :searchProductForm="searchProductForm" />
      </keep-alive>

    </v-dialog>

    <div class="d-flex pa-2 plv-search-row">
      <v-text-field clearable density="compact" :label="$t('products.product.searchlabel')" variant="outlined"
        v-model="searchProductForm.data.searchText" bg-color="textfieldColor" class="customTextField"
        @keyup.enter.stop="search()">

        <template #append-inner>
          <v-tooltip open-delay="1000" :text="$t('products.product.search')">
            <template v-slot:activator="{ props: tooltipProps }">
              <v-btn flat size="40" v-bind="{ ...tooltipProps }" class="pa-2 plv-border-surface" elevation="0"
                :color="isFiltered ? 'activeButtonColor' : 'white'" aria-label="Ürünleri ara"
                @click.stop="search()"><v-icon size="x-large" color="processButtonColor">mdi-magnify</v-icon></v-btn>
            </template>
          </v-tooltip>

        </template>
      </v-text-field>


      <ProductAdvancedSearchComponent v-model="searchProductForm.data" :is-dirty="isFormDirty()"
        :transfer-status-items="transferStatusItems" @search="searchAdvanced" @clear="clearForm" />

      <v-tooltip open-delay="1000" text="Ürün listesini yenilemek için basınız">
        <template v-slot:activator="{ props: tooltipProps }">
          <v-btn @click="getProducts(true)" size="40" color="white" class="premium-cube-btn ml-2" elevation="0" aria-label="Ürün listesini yenile">
            <v-icon size="x-large" color="processButtonColor">mdi-refresh</v-icon>
          </v-btn>
        </template>
      </v-tooltip>
    </div>

    <v-data-table-server v-model="selectedProducts" item-value="_id" :loading="false" :itemsLength="products.length"
      :items="products" fixed-header :headers="headers" class="pa-0 ma-0 premium-table desktop-table plv-table"
      show-select @update:sort-by="sortProducts">


      <template v-slot:header.data-table-select="{ allSelected, selectAll, someSelected }">
        <v-checkbox-btn :model-value="allSelected" :indeterminate="someSelected && !allSelected" color="primaryLighten"
          @update:model-value="toggleAllProductsSelection"></v-checkbox-btn>
      </template>

      <template v-slot:item="{ item, isSelected, toggleSelect }: any">
        <tr
          :class="{
            'plv-row-dimmed': productIdForVariantList != item._id && productIdForVariantList != 0,
            'plv-row-active-shadow': productIdForVariantList == item._id && productIdForVariantList != 0
          }">

          <td :rowspan="item.hasVariant && productIdForVariantList == item._id ? 2 : 1"
            :class="{ 'plv-cell-no-border': item.hasVariant && productIdForVariantList == item._id }"
            class="pa-0">

            <div class="d-flex align-center justify-center fill-height w-100">
              <v-checkbox-btn class="plv-checkbox-flex" :model-value="isProductSelected(item)"
                :indeterminate="isProductIndeterminate(item)" color="primaryLighten"
                @update:model-value="val => onProductSelectionUpdate(item, !!val)" />
            </div>



          </td>

          <td @click="selectProduct(item)" class="plv-cursor-pointer plv-cell-tight">
            <div class="d-flex align-center"
              :class="{ 'plv-cell-offsale': item.onsale == false }">
              <div class="text-center mr-4 elevation-1 plv-thumb-wrap"
                @click="openEditProduct(item)">
                <div class="text-processButtonColor plv-image-count-badge"
                  v-if="item.images && item.images != 0">
                  <v-icon size="9">mdi-image-multiple-outline</v-icon>
                  <span class="font-weight-light plv-image-count-text">{{ item.images.length }}</span>
                </div>
                <v-tooltip location="bottom" open-delay="1000" text="Ürünü düzenlemek için basınız">
                  <template v-slot:activator="{ props: tooltipProps }">
                    <ProductImageComponent v-bind="tooltipProps" :productId="item._id" v-model="item.images[0]"
                      class="plv-cursor-pointer" />
                  </template>
                </v-tooltip>
              </div>

              <div>
                <span class="font-weight-bold text-body-2">{{ item.title }}</span>
                <template v-if="item.hasVariant">
                  <div class="font-weight-light text-caption text-left plv-caption-10">
                    ({{ item.variants.length }} Seçenek)
                    <div class="d-flex justify-left ml-4">
                      <v-icon size="20" color="processButtonColor">mdi-menu-down</v-icon>
                    </div>
                  </div>
                </template>
                <div class="d-flex">
                  <div class="plv-stockcode-col" v-if="item.hasVariant == false">
                    <div class="font-weight-light text-caption mt-1 plv-micro-caption">
                      Stok
                      Kodu
                    </div>
                    <span class="font-weight-bold">{{ item.variants[0]?.stockcode }}</span>
                    <div class="font-weight-light text-caption mt-1 plv-micro-caption">
                      Barkod
                    </div>
                    <span class="font-weight-medium">{{ item.variants[0]?.barcode }}&nbsp</span>
                  </div>
                  <div class="ml-8">
                    <template v-for="hashtag of item.hashtags">
                      <v-tooltip open-delay="500" :text="hashtag.title">
                        <template v-slot:activator="{ props: tooltipProps }">

                          <v-btn v-bind="{ ...tooltipProps }" class="mr-1 plv-hashtag-btn" flat size="13"
                            :style="{ '--plv-hashtag-color': hashtag.value }">
                          </v-btn>

                        </template>
                      </v-tooltip>
                    </template>
                  </div>
                </div>
              </div>
            </div>


          </td>
          <td>


            <div class="d-flex fill-height align-center plv-cursor-pointer plv-border-right-default">

              <div>
                <span class="font-weight-bold"> {{ formatMoney(item.prices?.minSalePrice) }} - {{
                  formatMoney(item.prices?.maxSalePrice) }} </span>
              </div>
            </div>
          </td>
          <td>
            <div :class="{ 'plv-opacity-full': item.onsale == false }">
              <div class="font-weight-light text-caption mt-0 plv-micro-caption">
                Stok
              </div>
              <span class="font-weight-bold">
                {{ item.stock }}
              </span>
            </div>
          </td>
          <td>
            <div :class="{ 'plv-opacity-full': item.onsale == false }">
              <div class="font-weight-light text-caption mt-1 plv-micro-caption">Marka
              </div>
              <span class="font-weight-medium plv-opacity-90">{{ brandsStore.getBrand(item.brand)?.title }}</span>
              <div class="font-weight-light text-caption mt-1 plv-micro-caption">Kategori
              </div>
              <span class="font-weight-medium plv-opacity-90"> {{ categoriesStore.getCategory(item.category)?.title
                }}
              </span>
            </div>
          </td>
          <td class="status-summary-cell">
            <div class="d-flex fill-height align-center plv-border-right-default"
              v-if="item.hasVariant == false">

              <div class="mt-1 mb-1 d-flex flex-wrap plv-platform-badges-wrap">
                <template v-if="integrationStore" v-for="(integration, index) of integrationStore.getClientPlatforms()">
                  <div class="plv-platform-badge-pos">
                    <div class="plv-platform-status-icon-pos">
                      <v-icon size="15"
                        v-if="item.platformUploads && item.platformUploads[integration.code] && item.platformUploads[integration.code].isUploaded"
                        color="white" class="elevation-0 bg-green plv-border-surface">mdi-check</v-icon>
                      <v-icon v-else color="white" class="elevation-0 bg-red plv-border-surface"
                        size="15">mdi-close</v-icon>
                    </div>
                    <IntegrationAvatarComponent mode="text" :platform="integration" width="85px" height="20px"
                      :class="[
                        'mb-2 mr-1 plv-cursor-pointer plv-platform-avatar',
                        (item.platformUploads && item.platformUploads[integration.code] && item.platformUploads[integration.code].isReady)
                          ? 'plv-platform-avatar-ready' : 'plv-platform-avatar-not-ready'
                      ]"
                      :style="{ '--plv-platform-color': integration.color }"
                      @click.stop="savePlatformUploadIsReadyForProduct(item, integration.code)" />
                  </div>
                </template>
              </div>
            </div>
            <div v-else>

              <div class="status-badge-wrapper">
                <template v-for="(summary, index) of getCountSummary(item.variants)" :key="summary.type">

                  <div class="status-item">
                    <v-tooltip activator="parent" location="top" :open-delay="50">
                      {{ getStatusLabel(summary.type) }}
                    </v-tooltip>

                    <div class="status-dot" :class="summary.type.toLowerCase()"></div>

                    <span class="status-count">
                      {{ summary.count }}<span v-if="summary.type === 'COMPLETED'" class="on-sale">/{{
                        summary.onSaleCount }}</span>
                    </span>

                    <div v-if="index < getCountSummary(item.variants).length - 1" class="mini-divider"></div>
                  </div>

                </template>
              </div>

            </div>
          </td>
          <td>
            <div class="d-flex justify-end">

              <v-btn flat size="35" @click="openEditProduct(item)" elevation=0 class="premium-cube-btn mr-0"
                color="processButtonColor" aria-label="Ürünü düzenle">
                <v-icon size="x-large" class="plv-opacity-full">mdi-tag-edit</v-icon>
              </v-btn>
              <v-btn flat size="35" @click="deleteConfirmation(item, $event)" elevation=0 class="premium-cube-btn ml-2"
                color="danger" aria-label="Ürünü sil">
                <v-icon size="x-large" class="plv-opacity-full">mdi-delete</v-icon>
              </v-btn>




            </div>

          </td>
        </tr>
        <tr v-show="item.hasVariant && productIdForVariantList == item._id"
          class="plv-variant-row-shadow">
          <td colspan="8" class="pa-0">
            <div :id="`variant-target-${item._id}`"></div>
          </td>
        </tr>

        <tr v-show="false"
          class="plv-variant-row-shadow">
          <td colspan="8" class="pa-0">
          </td>
        </tr>
      </template>
      <template v-slot:no-data>
        <EkEmptyState variant="no-results" title="Ürün Bulunamadı" message="Arama kriterlerinize uygun herhangi bir ürün kaydı bulunamadı."
          show-action action-text="Yeni ürün ekle" @action="openProductDefinition()" />
      </template>

      <template v-slot:header.title="{ column, getSortIcon, isSorted, someSelected }">
        <div class="d-flex  fill-height align-center plv-border-left-none">
          <div class="plv-col-header-image text-center"><v-icon class="mr-8">mdi-image-outline</v-icon></div>

          <div class="font-weight-bold text-body-2 plv-col-header-60"
            @click="toggleSort('title')" @mouseenter="sortIcon = 'title'" @mouseleave="sortIcon = undefined">
            Ürün
            <template v-if="searchProductForm.sort.field === 'title'">
              <v-icon>
                {{ searchProductForm.sort.direction === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>
            </template>
            <v-icon v-else class="plv-opacity-half" v-if="sortIcon == 'title'">
              {{ searchProductForm.sort.direction === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </div>
          |
          <div class="font-weight-bold text-caption ml-1 plv-col-header-95"
            @click="toggleSort('stockcode')" @mouseenter="sortIcon = 'stockcode'" @mouseleave="sortIcon = undefined">
            Stok Kodu
            <template v-if="searchProductForm.sort.field === 'stockcode'">
              <v-icon class="text-caption">
                {{ searchProductForm.sort.direction === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>
            </template>
            <v-icon class="text-caption plv-opacity-half" v-else v-if="sortIcon == 'stockcode'">
              {{ searchProductForm.sort.direction === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </div>
          |
          <div class="font-weight-bold text-caption ml-1 " @click="toggleSort('barcode')"
            @mouseenter="sortIcon = 'barcode'" @mouseleave="sortIcon = undefined">
            Barkod
            <template v-if="searchProductForm.sort.field === 'barcode'">
              <v-icon class="text-caption">
                {{ searchProductForm.sort.direction === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>
            </template>
            <v-icon class="text-caption plv-opacity-half" v-else v-if="sortIcon == 'barcode'">
              {{ searchProductForm.sort.direction === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </div>
        </div>

      </template>


      <template v-slot:header.price>
        <div class="d-flex fill-height align-center plv-border-right-default">

          <div class="font-weight-bold plv-col-header-70" @click="toggleSort('price')"
            @mouseenter="sortIcon = 'price'" @mouseleave="sortIcon = undefined">
            Fiyat
            <template v-if="searchProductForm.sort.field === 'price'">
              <v-icon>
                {{ searchProductForm.sort.direction === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>
            </template>
            <v-icon v-else class="plv-opacity-half" v-if="sortIcon == 'price'">
              {{ searchProductForm.sort.direction === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </div>
        </div>
      </template>
      <template v-slot:header.category>
        <div class="d-flex">
          <div class="font-weight-bold text-body-2 plv-col-header-70"
            @mouseenter="sortIcon = 'brand'" @mouseleave="sortIcon = undefined">
            Marka
          </div>
          |
          <div class="font-weight-bold text-caption ml-1 plv-col-header-95"
            @mouseenter="sortIcon = 'category'" @mouseleave="sortIcon = undefined">
            Kategori
          </div>
        </div>
      </template>


      <template v-slot:header.stock>
        <div class="d-flex">
          <div class="font-weight-bold plv-col-header-70" @click="toggleSort('stock')"
            @mouseenter="sortIcon = 'stock'" @mouseleave="sortIcon = undefined">
            Stok
            <template v-if="searchProductForm.sort.field === 'stock'">
              <v-icon>
                {{ searchProductForm.sort.direction === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>
            </template>
            <v-icon v-else class="plv-opacity-half" v-if="sortIcon == 'stock'">
              {{ searchProductForm.sort.direction === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </div>
        </div>
      </template>


      <template v-slot:header.platforms>
        <div class="d-flex  fill-height align-center plv-border-right-default">
          <div class="font-weight-bold">
            Platform Yüklenme Durumu
          </div>
        </div>

      </template>


      <template v-slot:header.actions>
        <div class="d-flex justify-end">
          <v-menu scroll-strategy="close" v-model="headerMenu" :close-on-content-click="false"
            attach=".productListView">
            <template v-slot:activator="{ props }">
              <v-btn flat size="35" v-bind="props" elevation=0 color="white" class="premium-cube-btn mr-2 mt-1 mb-1" aria-label="Toplu işlemler">
                <v-icon color="processButtonColor" size="x-large"
                  class="plv-opacity-full">mdi-dots-vertical</v-icon>


              </v-btn>


            </template>


            <v-card class="plv-menu-card">

              <keep-alive>
                <BatchActionsRootComponent class="plv-panel-transition"
                  v-model:headerMenu="headerMenu" key="BatchActionsRootComponent" @refreshProducts="getProducts"
                  v-model="batchPlatformProcessMenu" :selectedProducts="selectedProducts"
                  v-model:selectedVariants="selectedVariantsMap" :searchProductForm="searchProductForm" mode="UPDATE" />
              </keep-alive>

            </v-card>
          </v-menu>

          <v-tooltip open-delay="1000" text="Ürün seçeneği eklemek için kullanabilirsiniz">
            <template v-slot:activator="{ props: tooltipProps }">
              <v-btn flat size="35" color="success" v-bind="{ ...tooltipProps }" @click="openProductDefinition()"
                class="premium-cube-btn mt-1 mb-1" elevation="0" aria-label="Yeni ürün seçeneği ekle"><v-icon size="x-large">mdi-plus</v-icon></v-btn>
            </template>
          </v-tooltip>
        </div>
      </template>

      <template v-slot:bottom="{ }">
        <PaginationComponent :totalNumberOfPages="searchProductForm.pagination.totalNumberOfPages"
          :pagination="searchProductForm.pagination" @setPage="getProducts" v-model="searchProductForm.pagination.page"
          class="plv-pagination-bar" />
      </template>

    </v-data-table-server>

  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, onMounted, onBeforeMount, onActivated, watch, computed, nextTick, getCurrentInstance, inject, onDeactivated, onUnmounted, reactive } from 'vue'
import PaginationComponent from '@/components/PaginationComponent.vue';
import ProductAdvancedSearchComponent from '@/components/productDefinitions/products/ProductAdvancedSearchComponent.vue';
import LoadingComponent from '@/components/LoadingComponent.vue'
import ProductImageComponent from '@/components/productDefinitions/products/ProductImageComponent.vue'
import EkPageHeader from '@/components/ds/EkPageHeader.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import { formatMoney } from '@/composables/format'

import ProductTransferComponent from '@/components/productDefinitions/products/ProductTransferComponent.vue'
import ProductVariantListComponent from '@/components/productDefinitions/variants/ProductVariantListComponent.vue'

import ProductBatchProcessComponent from '@/components/productDefinitions/products/ProductBatchProcessComponent.vue'
import useRestApi from '@/composables/restapi'
import { useBrandsStore } from '@/stores/brandsStore';
import { useCategoriesStore } from '@/stores/categoriesStore';
import { useIntegrationStore } from '@/stores/integrationStore';
import { useTabStore } from '@/composables/opentab'
import IntegrationAvatarComponent from '@/components/IntegrationAvatarComponent.vue';
import { useSnackbarStore } from '@/stores/snackbarStore';
import { useStaticsStore } from '@/stores/staticsStore';
import useUser from '@/composables/user';
import { PLATFORM_PROCESS } from '@/types/PlatformProcess';
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
const verticalTableRef: any = ref(null)
const tableRecordCount: any = ref(0)
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





const getCountSummary = (variants: any) => {
  const summary = []
  let completedCount = 0,
    waitingCount = 0,
    pendingCount = 0,
    failedCount = 0,
    onSaleCount = 0;

  const integrations = integrationStore.getClientPlatforms()
  for (const variant of variants) {
    for (const integration of integrations) {
      const status = variant.platforms?.[integration.code]?.upload?.TRANSFER?.status
      const onSale = variant.platforms?.[integration.code]?.upload?.onSale

      if (status === 'COMPLETED') completedCount++
      else if (!status || status === 'PENDING') pendingCount++
      else if (status === 'FAILED') failedCount++
      else if (status === 'WAITING' || status === 'SENT') waitingCount++

      if (onSale === true) onSaleCount++
    }
  }
  summary.push({ type: 'PENDING', count: pendingCount })
  summary.push({ type: 'WAITING', count: waitingCount })
  summary.push({ type: 'FAILED', count: failedCount })
  summary.push({ type: 'COMPLETED', count: completedCount, onSaleCount })
  return summary
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

const tableContentWidth = computed(() => {
  if (verticalTableRef.value) {
    let divider = tableRecordCount.value
    return Math.ceil(Number(verticalTableRef.value.clientWidth - 190) / divider)
  }
  return 0
})


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

const savePlatformUploadIsReadyForProduct = async (product: any, integrationCode: string) => {
  var isReady = true
  if (product.platformUploads && product.platformUploads[integrationCode] && product.platformUploads[integrationCode].isReady) {
    isReady = !product.platformUploads[integrationCode].isReady
  }
  let guid = loadingComponentRef.value.info("")
  let response = await restApi.post("IntegrationService/savePlatformUploadIsReadyForProduct", { productId: product._id, integrationCode: integrationCode, isReady: isReady })
  loadingComponentRef.value.remove(guid)
  if (response && response.modifiedCount > 0) {
    getProducts()
  }

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
  selectedProducts.value.length = 0
  let guid = loadingComponentRef.value.info(t('loading.info.getProducts'))
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

  let response = await restApi.post("ProductService/getProducts", { searchProductForm: searchProductFormCloned })
  isSkeletonVisible.value = false
  loadingComponentRef.value.remove(guid)
  fromTo.value = response.fromTo

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
  tableRecordCount.value = searchProductForm.value.pagination.limit
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
    guid = loadingComponentRef.value.success(t('loading.success.deleteProduct'))
    loadingComponentRef.value.remove(guid)
    getProducts()

    snackbarStore.addSnackbar({
      show: true,
      text: 'Ürün silindi',
      timeout: 2000,
      color: 'success'
    })
  } else {
    guid = loadingComponentRef.value.error(t('loading.error.deleteProduct'))
    loadingComponentRef.value.remove(guid)
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
    { id: "PENDING", icon: 'mdi-pencil-box', color: 'var(--ek-color-info)', title: "Hazırlanan (Pending)", children: pendingItems },
    { id: "WAITING", icon: 'mdi-clock', color: 'var(--ek-color-secondary)', title: "Onay Bekleyen (Waiting)", children: waitingItems },
    { id: "FAILED", icon: 'mdi-close-box', color: 'var(--ek-color-danger)', title: "Hatalı (Failed)", children: failedItems },
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
      limit: 10,
      page: 1,
      totalNumberOfPages: 1,
      totalNumberOfRecords: 0
    }
  }
}
// Statü isimlerini tooltip için map'liyoruz
const getStatusLabel = (type: string) => {
  const labels: Record<string, string> = {
    'PENDING': 'Hazırlanan Ürünler',
    'WAITING': 'Onay Bekleyenler',
    'FAILED': 'Hatalı Gönderimler',
    'COMPLETED': 'Onaylanan / Satışta Olanlar'
  };
  return labels[type] || type;
};

const headers = [
  {
    id: 1,
    title: 'Ürün / Stok Kodu / Barkod',
    value: "title",
    sortable: true
  },
  {
    id: 1,
    title: 'Fiyat',
    value: "price",
    sortable: true
  },
  {
    id: 1,
    title: 'Stok',
    value: "stock",
    sortable: true
  },
  {
    id: 1,
    title: 'Kategori',
    value: "category",
    sortable: true
  },
  {
    id: 2,
    title: 'Platform Durumu',
    value: "platforms",
    sortable: true
  },
  {
    id: 1,
    title: "actions",
    value: "actions"
  },
]

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

/* --- ADR-0011 Karar 2 göçü: şablondan taşınan inline stil sınıfları (plv- öneki,
   bu <style> global olduğu için ad çakışmasını önler) --- */
.plv-variant-target-placeholder {
  position: absolute;
  z-index: -20;
  left: 2000px;
}

.plv-border-surface {
  border: 1px solid var(--ek-color-surface);
}

.plv-dialog-transition {
  transition: opacity var(--ek-duration-fast) var(--ek-easing-enter) !important;
}

.plv-dialog-hidden {
  visibility: hidden;
  opacity: .2 !important;
}

.plv-panel-transition {
  transition: opacity var(--ek-duration-base) var(--ek-easing-enter) !important;
}

.plv-panel-hidden {
  opacity: .2 !important;
}

.plv-table {
  position: absolute;
  top: 75px;
  bottom: 0;
  left: 0;
  right: 0;
  width: auto;
  height: auto;
}

.plv-search-row {
  max-width: 900px;
}

.plv-row-dimmed {
  filter: blur(0px);
  opacity: .4;
}

.plv-row-active-shadow {
  box-shadow: -2px -4px 6px 4px color-mix(in srgb, var(--ek-color-border-strong) 60%, transparent);
}

.plv-cell-no-border {
  border-right: 0px solid var(--ek-color-border-default) !important;
}

.plv-checkbox-flex {
  flex: 0 0 !important;
}

.plv-cursor-pointer {
  cursor: pointer;
}

.plv-cell-tight {
  cursor: pointer;
  padding-left: 1px;
}

.plv-cell-offsale {
  background-color: color-mix(in srgb, var(--ek-color-error) 4%, white);
  border-right: 2px solid var(--ek-color-surface-sunken) !important;
}

.plv-thumb-wrap {
  position: relative;
  width: 110px;
  min-width: 110px;
}

.plv-image-count-badge {
  position: absolute;
  cursor: pointer;
  opacity: .6;
  background-color: var(--ek-color-surface);
  margin-top: -2px;
  margin-left: 3px;
  z-index: 1;
  border-radius: 7px;
}

.plv-image-count-text {
  font-size: 10px;
  margin-left: 2px;
}

.plv-caption-10 {
  font-size: 10px !important;
}

.plv-stockcode-col {
  min-width: 130px;
}

.plv-micro-caption {
  line-height: .7;
  font-size: 10px !important;
}

.plv-hashtag-btn {
  border-radius: 2px !important;
  background-color: var(--plv-hashtag-color) !important;
  border: 1px solid var(--ek-color-content-muted);
}

.plv-border-right-default {
  border-right: 1px solid var(--ek-color-border-default);
}

.plv-opacity-full {
  opacity: 1;
}

.plv-opacity-90 {
  opacity: .9;
}

.plv-platform-badges-wrap {
  max-width: 400px;
  white-space: wrap;
}

.plv-platform-badge-pos {
  position: relative;
}

.plv-platform-status-icon-pos {
  position: absolute;
  right: 0px;
  top: -6px;
  margin-right: 1px;
  z-index: 1;
}

.plv-platform-avatar {
  cursor: pointer;
}

.plv-platform-avatar-ready {
  background-color: var(--plv-platform-color);
  opacity: 1;
  border: 1px solid var(--ek-color-border-default);
}

.plv-platform-avatar-not-ready {
  background-color: var(--ek-color-content-default);
  opacity: .6;
  border: 1px solid var(--ek-color-surface);
}

.plv-variant-row-shadow {
  position: relative;
  z-index: 1;
  box-shadow: 0px 6px 4px 2px color-mix(in srgb, var(--ek-color-border-strong) 60%, transparent);
  border-spacing: 0 0 !important;
}

.plv-border-left-none {
  border-left: 0px solid var(--ek-color-border-default);
}

.plv-col-header-image {
  width: 124px;
  opacity: .6;
}

.plv-col-header-60 {
  width: 60px;
  height: 20px !important;
}

.plv-col-header-95 {
  min-width: 95px !important;
}

.plv-col-header-70 {
  width: 70px;
  height: 20px !important;
}

.plv-opacity-half {
  opacity: .5;
}

.plv-menu-card {
  border-radius: 5px;
}

.plv-pagination-bar {
  position: relative;
  border-top: 1px solid var(--ek-color-border-default);
}
</style>