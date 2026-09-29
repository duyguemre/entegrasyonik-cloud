<template>
  <v-data-table-server v-model="selectedVariants" :items-length="originalVariants ? originalVariants.length : 0"
    :items="originalVariants" fixed-header item-value="barcode" :headers="headers" class="pa-0 ma-0 pl-0 pb-0 ma-0 vl-table"
    elevation="0" :show-select="true">

    <template v-slot:header.data-table-select="{ allSelected, selectAll, someSelected }">
      <div class="d-flex align-center justify-center fill-height vl-head-sep">
        <v-checkbox-btn :model-value="allSelected" :indeterminate="someSelected && !allSelected" color="primaryLighten"
          aria-label="Tüm varyantları seç"
          @update:model-value="selectAll(!allSelected)"></v-checkbox-btn>
      </div>
    </template>

    <template v-slot:header.variant="{ column, getSortIcon, isSorted, someSelected }">
      <div class="d-flex  fill-height align-center">
        <div class="text-center vl-image-head"><v-icon class="mr-8">mdi-image-outline</v-icon></div>
        <div class="font-weight-bold vl-sort-head vl-w-130" @click="toggleSort('stockcode')"
          @mouseenter="sortIcon = 'stockcode'" @mouseleave="sortIcon = undefined">

          Stok Kodu
          <template v-if="sortBy === 'stockcode'">
            <v-icon>
              {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </template>
          <v-icon v-else v-if="sortIcon == 'stockcode'" class="vl-sort-icon--hint">
            {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
          </v-icon>

        </div>
        |
        <div class="font-weight-bold text-caption ml-1 vl-sort-head vl-w-60"
          @click="toggleSort('barcode')" @mouseenter="sortIcon = 'barcode'" @mouseleave="sortIcon = undefined">
          Barkod
          <template v-if="sortBy === 'barcode'">
            <v-icon class="text-caption">
              {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </template>
          <v-icon class="text-caption vl-sort-icon--hint" v-else v-if="sortIcon == 'barcode'">
            {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
          </v-icon>
        </div>
      </div>
    </template>



    <template v-slot:header.choices="{ column, getSortIcon, isSorted, someSelected }">
      <div class="d-flex fill-height align-center vl-head-sep">
        <div class="font-weight-bold text-body-2 vl-sort-head vl-w-95"
          @click="toggleSort('choices')" @mouseenter="sortIcon = 'choices'" @mouseleave="sortIcon = undefined">
          Seçenekler
          <template v-if="sortBy === 'choices'">
            <v-icon>
              {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </template>
          <v-icon v-else v-if="sortIcon == 'choices'" class="vl-sort-icon--hint">
            {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
          </v-icon>
        </div>
      </div>
    </template>


    <template v-slot:header.prices>
      <div class="d-flex fill-height align-center vl-head-sep">
        <div class="font-weight-bold text-body-2 vl-sort-head vl-w-150"
          @click="toggleSort('prices.salePrice')" @mouseenter="sortIcon = 'prices.salePrice'"
          @mouseleave="sortIcon = undefined">


          Satış Fiyatı
          <template v-if="sortBy === 'prices.salePrice'">
            <v-icon>
              {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </template>
          <v-icon v-else v-if="sortIcon == 'prices.salePrice'" class="vl-sort-icon--hint">
            {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
          </v-icon>
        </div>
        |
        <div class="font-weight-bold text-caption ml-1 vl-sort-head vl-w-150"
          @click="toggleSort('prices.marketPrice')" @mouseenter="sortIcon = 'prices.marketPrice'"
          @mouseleave="sortIcon = undefined">

          Piyasa Fiyatı
          <template v-if="sortBy === 'prices.marketPrice'">
            <v-icon class="text-caption">
              {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </template>
          <v-icon class="text-caption vl-sort-icon--hint" v-else v-if="sortIcon == 'prices.marketPrice'">
            {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
          </v-icon>
        </div>
      </div>
    </template>



    <template v-slot:header.stock>
      <div class="d-flex fill-height align-center vl-head-sep">
        <div class="font-weight-bold vl-sort-head vl-w-70" @click="toggleSort('stock')"
          @mouseenter="sortIcon = 'stock'" @mouseleave="sortIcon = undefined">

          Stok Adedi
          <template v-if="sortBy === 'stock'">
            <v-icon>
              {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </template>
          <v-icon v-else v-if="sortIcon == 'stock'" class="vl-sort-icon--hint">
            {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
          </v-icon>
        </div>


      </div>
    </template>

    <template v-slot:header.choiceTitle="{ column }">

      <div class="d-flex fill-height align-center">
        <div class="font-weight-bold text-body-2 vl-sort-head" @click="toggleSort('choiceValueTitle')"
          @mouseenter="sortIcon = 'choiceValueTitle'" @mouseleave="sortIcon = undefined">
          Grup
          <template v-if="sortBy === 'choiceValueTitle'">
            <v-icon>
              {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </template>
          <v-icon v-else-if="sortIcon == 'choiceValueTitle'" class="vl-sort-icon--hint">
            {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
          </v-icon>
          <v-icon v-else class="vl-sort-icon--hidden">
            {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
          </v-icon>

        </div>
      </div>


    </template>

    <template v-slot:header.platforms="{ column }">
      <div class="d-flex fill-height align-center vl-head-sep">
        <div class="font-weight-bold text-left vl-platforms-head">{{ column.title }}
        </div>
      </div>
    </template>


    <template v-slot:header.shelf>
    </template>




    <template v-slot:header.actions>
    </template>




    <template v-slot:item="{ item, index, isSelected, toggleSelect }: any">
      <tr v-if="index != 0 && rowspanSet.get(item.barcode)">
        <td :colspan="headers.length + 1" class="vl-group-spacer">
        </td>
      </tr>


      <tr>
        <td class="pa-0 ma-0 vl-cell-sep">
          <div class="d-flex align-center justify-center fill-height w-100">
            <v-checkbox-btn :model-value="selectedVariants.includes(item.barcode)" aria-label="Varyantı seç"
              color="primaryLighten" @update:model-value="val => {
                if (val) selectedVariants.push(item.barcode)
                else selectedVariants = selectedVariants.filter((id: any) => id !== item.barcode)
              }" class="vl-cb-fixed" />

          </div>
        </td>
        <td class="pl-0 vl-cell-sep">
          <div class="d-flex align-center fill-height;" @click="">
            <div class="text-center mr-4 elevation-1 vl-thumb">
              <v-tooltip location="bottom" open-delay="1000" text="Ürünü düzenlemek için basınız">
                <template v-slot:activator="{ props: tooltipProps }">

                  <ProductVariantImageComponent v-bind="{ ...tooltipProps }" :productInfoForm="productInfoForm"
                    @click.stop="isVariantImagesDialog = true; selectedVariantForEdit = item"
                    :imageId="item.images ? item.images[0] : undefined" class="vl-thumb-img" />

                </template>
              </v-tooltip>
            </div>
            <div class="d-flex align-center fill-height vl-w-full">
              <div class="d-flex">
                <div>
                  <div class="font-weight-light text-caption mt-1 vl-field-caption">
                    Stok
                    Kodu
                  </div>
                  <span class="font-weight-bold">{{ item.stockcode }}</span>
                  <div class="font-weight-light text-caption mt-1 vl-field-caption">
                    Barkod
                  </div>
                  <span class="font-weight-medium">{{ item.barcode }}</span>

                  <!--                   <v-switch v-model="item.onsale" class="ma-0 pa-0 text-caption" color="processButtonColor" hide-details
                    density="compact">
                    <template #label>
                      <div class="font-weight-normal text-caption mt-0"
                        style="line-height: .8;font-size:11px!important">
                        Satışa <span v-if="item.onsale == true">Açık</span><span v-else
                          class="font-weight-bold text-red">Kapalı</span>
                      </div>
                    </template>
                  </v-switch>
 -->
                </div>
              </div>
            </div>
          </div>

        </td>
        <td :rowspan="rowspanSet.get(item.barcode)" v-if="productInfoForm.hasVariant && rowspanSet.get(item.barcode)"
          class="text-center vl-td-group">
          <div class="font-weight-bold">{{ choicesStore.getChoiceValueName(getSlicerChoice(item.choices).choiceId,
            getSlicerChoice(item.choices).choiceValueId) }} </div>
        </td>

        <td class="vl-td-choices">
          <div class="d-flex fill-height align-center d-block mt-1 vl-cell-sep vl-w-full">
            <div>
              <div v-for="(choice, index) of item.choices">
                <div class="d-flex" v-if="choice.slicer != true">
                  <div :class="(index as any) > 0 ? ['pt-1'] : []">
                    <div class="font-weight-light text-caption vl-field-caption">
                      {{ choicesStore.getChoiceTitle(choice.choiceId) }} </div>
                    <span class="font-weight-bold">{{ choicesStore.getChoiceValueName(choice.choiceId,
                      choice.choiceValueId) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </td>
        <td>
          <div class="d-flex fill-height align-center vl-cell-sep vl-w-full-soft">

            <div class="d-flex align-center fill-height vl-w-full">

              <template v-if="item.prices.isPlatformBasedPrice == true">
                <div @click="editingVariantMenu = true; editingVariant = item" class="d-flex align-center fill-height vl-price-cell">
                  <div>
                    <!--                         Platform Bazında <span class="font-weight-medium">Satış</span> Fiyatları -->
                    <div class="font-weight-light text-caption mb-3 vl-field-caption">
                      (Platform Bazında)
                    </div>

                    <div class="font-weight-light text-caption mt-1 vl-field-caption">
                      Satış Fiyatı
                    </div>
                    <span class="font-weight-bold"> {{ formatCurrency(findMinimumSalePrice(item.platforms)) }} - {{
                      formatCurrency(findMaximumSalePrice(item.platforms)) }}</span>
                    <div class="font-weight-light text-caption mt-1 vl-field-caption">
                      Piyasa Fiyatı
                    </div>
                    <span class="font-weight-medium"> {{ formatCurrency(findMinimumMarketPrice(item.platforms)) }} - {{
                      formatCurrency(findMaximumMarketPrice(item.platforms)) }}</span>
                  </div>

                </div>
              </template>
              <template v-else>
                <div @click="" class="d-flex align-center fill-height vl-price-cell">
                  <div>

                    <div class="font-weight-light text-caption mt-1 vl-field-caption">
                      Satış Fiyatı
                    </div>
                    <span class="font-weight-bold"> {{ formatCurrency(item.prices.salePrice) }}</span>
                    <div class="font-weight-light text-caption mt-1 vl-field-caption">
                      Piyasa Fiyatı
                    </div>
                    <span class="font-weight-medium"> {{ formatCurrency(item.prices.marketPrice) }}</span>
                  </div>
                </div>
              </template>
            </div>
          </div>

        </td>
        <td>
          <div class="d-flex font-weight-bold fill-height align-center pr-4 vl-cell-sep vl-w-full">

            <div>
              <div>
                <div class="font-weight-light text-caption mt-1 vl-field-caption">
                  Stok Adedi
                </div>
                <div class="d-flex font-weight-bold fill-height align-center vl-w-full">
                  {{ item.stock }}
                </div>
              </div>

              <div>
                <div class="font-weight-light text-caption mt-1 vl-field-caption">
                  Raf
                </div>
                <div class="d-flex font-weight-bold fill-height align-center vl-w-full">
                  {{ item.shelf || '-' }}
                </div>
              </div>
            </div>

          </div>

        </td>
        <td>

          <div class="d-flex fill-height align-center vl-cell-sep">

            <div class="mt-1 mb-1 d-flex flex-wrap ga-3 align-center vl-platforms">
              <template v-if="integrationStore" v-for="integration of integrationStore.getClientPlatforms()"
                :key="integration.code">

                <v-menu :close-on-content-click="false" location="bottom center" transition="scale-transition"
                  offset="10">
                  <template v-slot:activator="{ props: tooltipProps }">
                    <div v-bind="tooltipProps" class="position-relative d-flex align-center vl-platform-trigger"
                      role="button" tabindex="0" :aria-label="`${integration.title || integration.code} durum bilgisi`"
                      @keydown.enter.prevent="($event.currentTarget as HTMLElement).click()"
                      @keydown.space.prevent="($event.currentTarget as HTMLElement).click()">

                      <div v-if="getBadgeColor(integration, item) !== 'transparent'" class="status-indicator-dot vl-dot--active"></div>

                      <PlatformImageComponent :integrationCode="integration.code" height="25" width="100"
                        class="platform-mini-card"
                        :is-active="item.platforms[integration.code]?.upload?.TRANSFER?.status === 'COMPLETED'"
                        :isSelectable="true" />
                    </div>
                  </template>

                  <ProductVariantListTooltipComponent :data="item.platforms[integration.code]" />
                </v-menu>

              </template>
            </div>
          </div>


        </td>
        <!--         <td>
          <div class="d-flex justify-end align-center">
            <v-menu scroll-strategy="close" v-model="menuVariant[item._id]">
              <template v-slot:activator="{ props }">
                <v-btn flat size="30" v-bind="props" style="border:1px solid  rgb(var(--v-theme-borderColor));"
                  elevation=0 color="white">
                  <v-icon color="processButtonColor" v-bind="props" size="20" class=""
                    style="opacity: 1;">mdi-menu</v-icon>
                </v-btn>
              </template>
              <v-card style="border-radius:5px" v-if="menuVariant[item._id]">
                <v-list class="pt-0 pb-0" density="compact" style="background-color:rgb(var(--v-theme-loginForm))">
                  <v-divider color="passiveColor" class="ml-5 mr-5" />
                  <v-list-subheader
                    class="mt-0 d-flex align-center justify-start bg-primaryLightenMore text-white font-weight-bold">
                    <v-tooltip location="top" :open-delay="700">
                      <template #activator="{ props }">
                        <div v-bind="props">
                          <v-icon size="small" class="">mdi-information-outline</v-icon>
                          Varyant Platform İşlemleri
                        </div>
                      </template>
                      <span>İşlem, sadece bu varyant için bütün platformlarda uygulanacaktır.</span>
                    </v-tooltip>
                  </v-list-subheader>
                  <v-divider color="passiveColor" class="ml-5 mr-5" />
                  <v-list-item @click="transferVariant(item._id)" class="font-weight-medium">
                    <template #prepend>
                      <v-icon color="saveButtonColor" size="25" class="" style="opacity: 1;">mdi-cloud-upload</v-icon>
                    </template>
                    Yükle
                  </v-list-item>
                  <v-divider color="passiveColor" class="ml-5 mr-5" />
                  <v-list-item @click="checkVariantStatus(item._id)" class="font-weight-medium">
                    <template #prepend>
                      <v-icon color="success" size="25" class=""
                        style="opacity: 1;">mdi-cloud-check-variant-outline</v-icon>
                    </template>
                    Durum Güncelle
                  </v-list-item>
                  <v-divider color="passiveColor" class="ml-5 mr-5" />
                  <v-list-item @click="updateVariant(item._id)" class="font-weight-medium">
                    <template #prepend>
                      <v-icon color="success" size="25" class="" style="opacity: 1;">mdi-sync</v-icon>
                    </template>
                    Bilgileri Güncelle
                  </v-list-item>
                  <v-divider color="passiveColor" class="ml-5 mr-5" />
                  <v-list-item @click="updatePriceVariant(item._id)" class="font-weight-medium">
                    <template #prepend>
                      <v-icon color="success" size="25" class="" style="opacity: 1;">mdi-currency-try</v-icon>
                    </template>
                    Fiyatları Güncelle
                  </v-list-item>
                  <v-divider color="passiveColor" class="ml-5 mr-5" />
                  <v-list-item @click="updateStockVariant(item._id)" class="font-weight-medium">
                    <template #prepend>
                      <v-icon color="success" size="25" class="" style="opacity: 1;">mdi-counter</v-icon>
                    </template>
                    Stokları Güncelle
                  </v-list-item>
                </v-list>
              </v-card>
            </v-menu>

          </div>
        </td> -->
      </tr>
    </template>
    <template v-slot:bottom="{ }">
    </template>
  </v-data-table-server>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, computed, onBeforeMount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n';
import { useChoicesStore } from '@/stores/choicesStore';
import ProductVariantImageComponent from './ProductVariantImageComponent.vue'

import useIntegrations from '@/composables/integrations';
import useFormRules from '@/composables/formrules';
import { useIntegrationStore } from '@/stores/integrationStore';
import { useCategoriesStore } from '@/stores/categoriesStore';
import { useStaticsStore } from '@/stores/staticsStore';
import ProductVariantListTooltipComponent from './ProductVariantListTooltipComponent.vue';
import PlatformImageComponent from '@/components/platforms/PlatformImageComponent.vue';
const staticsStore = useStaticsStore()

const categoriesStore = useCategoriesStore()
const integrationStore = useIntegrationStore()
const menuIntegration = ref<{ [key: string]: boolean }>({})
const menuVariant = ref<{ [key: string]: boolean }>({})

const show = ref(true)
const emits = defineEmits(['checkVariantStatus', 'refreshImages', 'refreshVariants', 'refreshTotalVariantsStockCount', 'close', 'transferVariant', 'updatePriceVariant', 'updateStockVariant', 'updateVariant'])

enum PRODUCT_INTEGRATION_STATUS {
  PENDING = 'PENDING',
  SENT = 'SENT',
  WAITING = 'WAITING',
  FAILED = 'FAILED',
  COMPLETED = 'COMPLETED',
}

const STATUS_META: Record<PRODUCT_INTEGRATION_STATUS, { icon: string; order: number; message: string }> = {
  [PRODUCT_INTEGRATION_STATUS.PENDING]: {
    icon: 'mdi-pencil-box',
    order: 2,
    message: "Hazırlanıyor"
  },
  [PRODUCT_INTEGRATION_STATUS.SENT]: {
    icon: 'mdi-clock',
    order: 3,
    message: "Bekliyor"
  },
  [PRODUCT_INTEGRATION_STATUS.WAITING]: {
    icon: 'mdi-clock',
    order: 4,
    message: "Bekliyor"
  },
  [PRODUCT_INTEGRATION_STATUS.FAILED]: {
    icon: 'mdi-close-box',
    order: 5,
    message: "Reddedildi"
  },
  [PRODUCT_INTEGRATION_STATUS.COMPLETED]: {
    icon: 'mdi-checkbox-marked',
    order: 6,
    message: "Onaylandı"
  },
};

const openProduntInPlatform = (code: string, item: any) => {
  console.log(code)
  switch (code) {
    case 'ideasoft':
      const integration = integrationStore.getClientIntegration(code)
      console.log(integration)
      return item.title
  }
}

const getBadgeColor = (integration: any, item: any) => {
  const itemStatus: any = item.platforms[integration.code]?.upload?.TRANSFER?.status
  const hasMessage: any = item.platforms[integration.code]?.upload?.TRANSFER?.messages?.length > 0
  const onSale = item.platforms[integration.code]?.upload?.onSale
  if (onSale != true && itemStatus == PRODUCT_INTEGRATION_STATUS.COMPLETED) {
    return 'danger'
  }
  if (hasMessage)
    return 'success'
  else
    return 'transparent'
}


const getIcon = (integration: any, item: any) => {
  const itemStatus: any = item.platforms[integration.code]?.upload?.TRANSFER?.status;

  // Statü değerinin enum içinde olup olmadığını kontrol ediyoruz
  const isValidStatus = Object.values(PRODUCT_INTEGRATION_STATUS).includes(itemStatus);

  // Eğer statü geçerli bir enum değeriyse onu kullan, değilse (veya undefined ise) PENDING dön
  const status = isValidStatus ? (itemStatus as PRODUCT_INTEGRATION_STATUS) : PRODUCT_INTEGRATION_STATUS.PENDING;

  return STATUS_META[status]?.icon;
};


const formRules = useFormRules()
const batchProcesses: any = ref({
  barcode: {
    menu: false
  },
  stockcode: {
    menu: false
  },
  shelf: {
    menu: false,
    value: undefined
  },
  stock: {
    menu: false,
    value: undefined
  },
  isPlatformBasedPrice: {
    menu: false,
    value: undefined
  },
  marketPrice: {
    menu: false,
    value: undefined,
    isPlatformBasedPrice: false,
    prices: { isPlatformBasedPrice: true }
  },
  salePrice: {
    menu: false,
    value: undefined,
    isPlatformBasedPrice: false,
    prices: { isPlatformBasedPrice: true }
  }

})

const choicesStore = useChoicesStore()
var choicesStoreChoices: any = undefined
const integrations: any = useIntegrations()
const isVariants = defineModel({ default: false })
const searchVariantForm: any = ref()
const isFiltered = ref(false)
const headers: any = ref()
const multipleVariantHeaders: any = ref()
const singleVariantHeaders: any = ref()
const newVariantMenu = ref(false)
const batchProcessFormMenu = ref(false)
const editingVariantMenu = ref(false)
const isVariantImagesDialog = ref(false)

const { t } = useI18n()
const selectedVariantForEdit: any = ref(0)
const integrationCode: any = ref()
const sortBy: any = ref('choices')
const sortDesc: any = ref('asc')
const sortIcon: any = ref()
const editingComputedVariants: any = ref({})
const editingVariant: any = ref({})
var originalVariants: any = ref()
const selectedVariants: any = defineModel("selectedVariants", { default: [] })

const pagination = ref({
  limit: 100,
  page: 1,
  totalNumberOfPages: 1,
  totalNumberOfRecords: 0
})

const props = defineProps<{
  productInfoForm: any,
}>()

const formatCurrency = (number: number) => {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(number))
}


onBeforeMount(() => {
  initSearchVariantForm()
})

onMounted(() => {
  console.log("degisti mounted variantlist")
  choicesStoreChoices = choicesStore.getChoices()
  originalVariants.value = JSON.parse(JSON.stringify(props.productInfoForm.variants))
  search()
  multipleVariantHeaders.value = [
    {
      title: 'Stok Kodu',
      icon: 'mdi-checkbox-multiple-outline',
      align: 'left',
      sortable: true,
      value: 'variant',
    },
    {
      title: 'Varyant',
      icon: 'mdi-checkbox-multiple-outline',
      align: 'left',
      sortable: true,
      value: 'choiceTitle',
    },
    {
      title: 'Seçenekler',
      icon: 'mdi-checkbox-multiple-outline',
      align: 'left',
      sortable: true,
      value: 'choices',
    },
    { title: 'Fiyat', icon: 'mdi-currency-try', sortable: true, value: 'prices' },
    { title: 'Stok', icon: 'mdi-numeric', sortable: true, value: 'stock' },
    { title: 'Platform Yükleme Durumları', icon: 'mdi-numeric', sortable: false, value: 'platforms' },
    /*     { title: 'actions', icon: 'mdi-numeric', sortable: false, value: 'actions' } */
  ]

  singleVariantHeaders.value = [
    {
      title: '',
      icon: 'mdi-checkbox-multiple-outline',
      align: 'left',
      sortable: false,
      value: 'variant',
    },
    { title: '', icon: 'mdi-currency-try', sortable: false, value: 'prices' },
    { title: '', icon: 'mdi-numeric', sortable: false, value: 'stock' },
    { title: '', icon: 'mdi-numeric', sortable: false, value: 'shelf' },
    { title: '', icon: 'mdi-numeric', sortable: false, value: 'actions' }
  ]

  headers.value = singleVariantHeaders.value
  if (props.productInfoForm.hasVariant == true)
    headers.value = multipleVariantHeaders.value
})

const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}


const findMinimumSalePrice = (platforms: any) => {
  const res = Object.values(platforms).reduce((min: any, platform: any) =>
    platform.prices && platform.prices.salePrice && platform.prices.salePrice < min ? platform.prices.salePrice : min, Infinity);
  if (res == Infinity) return 0
  return Number(res)
}
const findMinimumMarketPrice = (platforms: any) => {
  const res = Object.values(platforms).reduce((min: any, platform: any) =>
    platform.prices && platform.prices.marketPrice && platform.prices.marketPrice < min ? platform.prices.marketPrice : min, Infinity);
  if (res == Infinity) return 0
  return Number(res)
}
const findMaximumSalePrice = (platforms: any) => {
  return Number(Object.values(platforms).reduce((max: any, platform: any) =>
    platform.prices && platform.prices.salePrice && platform.prices.salePrice > max ? platform.prices.salePrice : max, 0))
}
const findMaximumMarketPrice = (platforms: any) => {
  return Number(Object.values(platforms).reduce((max: any, platform: any) =>
    platform.prices && platform.prices.marketPrice && platform.prices.marketPrice > max ? platform.prices.marketPrice : max, 0))
}

watch(() => props.productInfoForm.hasVariant, (newValue) => {
  if (props.productInfoForm.hasVariant) {
    headers.value = multipleVariantHeaders.value
  } else {
    headers.value = singleVariantHeaders.value
  }
})

watch(() => props.productInfoForm.variants, (newValue) => {
  console.log("degisti")
  originalVariants.value = JSON.parse(JSON.stringify(props.productInfoForm.variants))
  newVariantMenu.value = false
  searchVariantForm.value.searchVariantFormMenu = false
  batchProcessFormMenu.value = false
  pagination.value.page = 1
  search()
},
  { deep: true } // Nested değişiklikleri de algılar
)


watch(isVariants, (newValue, oldValue) => {
  if (newValue == true) {
    pagination.value.page = 1
    emits('refreshVariants')
  }
})


const transferVariant = (variantId: any, integrationCode: any = undefined) => {
  emits('transferVariant', { variantId, integrationCode })
}

const updatePriceVariant = (variantId: any, integrationCode: any = undefined) => {
  emits('updatePriceVariant', { variantId, integrationCode })
}

const updateStockVariant = (variantId: any, integrationCode: any = undefined) => {
  emits('updateStockVariant', { variantId, integrationCode })
}

const updateVariant = (variantId: any, integrationCode: any = undefined) => {
  emits('updateVariant', { variantId, integrationCode })
}


const checkVariantStatus = (variantId: any, integrationCode: any = undefined) => {
  emits('checkVariantStatus', { variantId, integrationCode })
}


const toggleSort = (key: any) => {
  if (sortBy.value === key) {
    sortDesc.value = sortDesc.value == 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = key
    sortDesc.value = 'asc'
  }
  pagination.value.page = 1
  search()
}

const sort = (retrievedVariants: Array<any>) => {
  console.log("duygu", sortBy.value)
  if (!sortBy.value) sortBy.value = 'choices';
  return props.productInfoForm.variants.sort((a: any, b: any) => {
    console.log("sortBy.value", sortBy.value)
    if (getSlicerChoice(a.choices)?.choiceValueId === getSlicerChoice(b.choices).choiceValueId) {
      if (sortBy.value == 'choices') {
        console.log("asfgsdfd")
        const aFilteredChoices = a.choices.filter((c: any) => getVarianterChoice(c.choices)?.choiceValueId !== getSlicerChoice(a.choices)?.choiceValueId);
        const bFilteredChoices = b.choices.filter((c: any) => getVarianterChoice(c.choices)?.choiceValueId !== getSlicerChoice(b.choices)?.choiceValueId);

        const maxLength = Math.max(aFilteredChoices.length, bFilteredChoices.length);

        for (let i = 0; i < maxLength; i++) {
          const aChoice = aFilteredChoices[i];
          const bChoice = bFilteredChoices[i];

          if (!aChoice) return sortDesc.value === 'asc' ? -1 : 1;
          if (!bChoice) return sortDesc.value === 'asc' ? 1 : -1;

          const aTitle = choicesStore.getDirectChoiceValueTitle(aChoice.choiceValueId) || "";
          const bTitle = choicesStore.getDirectChoiceValueTitle(bChoice.choiceValueId) || "";

          const compare = aTitle.localeCompare(bTitle, 'tr', { sensitivity: 'base' });
          if (compare !== 0) return sortDesc.value === 'asc' ? compare : -1 * compare;
        }

        return 0;




      }
      else if (sortBy.value == 'prices.salePrice') {
        if (sortDesc.value === 'asc')
          return a.prices.salePrice - b.prices.salePrice // Fiyatı küçükten büyüğe sırala
        return b.prices.salePrice - a.prices.salePrice // Fiyatı küçükten büyüğe sırala
      }
      else if (sortBy.value == 'prices.marketPrice') {
        if (sortDesc.value === 'asc')
          return a.prices.marketPrice - b.prices.marketPrice // Fiyatı küçükten büyüğe sırala
        return b.prices.marketPrice - a.prices.marketPrice // Fiyatı küçükten büyüğe sırala
      }
      else if (sortBy.value == 'stockcode' || sortBy.value == 'barcode') {
        const compare = a[sortBy.value].localeCompare(b[sortBy.value], 'tr', { sensitivity: 'base' });
        if (compare !== 0) return sortDesc.value === 'asc' ? compare : -compare;
      }
      else {
        console.log("duygu genel sıralaama", a[sortBy.value], b[sortBy.value])
        if (sortDesc.value === 'asc')
          return a[sortBy.value] - b[sortBy.value] // Fiyatı küçükten büyüğe sırala
        return b[sortBy.value] - a[sortBy.value] // Fiyatı küçükten büyüğe sırala
      }

    }
    const aTitle = choicesStore.getDirectChoiceValueTitle(getSlicerChoice(a.choices)?.choiceValueId) || "";
    const bTitle = choicesStore.getDirectChoiceValueTitle(getSlicerChoice(b.choices)?.choiceValueId) || "";

    if (sortBy.value == 'choiceValueTitle' && sortDesc.value === 'asc')
      return bTitle.localeCompare(aTitle); // Kategoriyi alfabetik sırala
    return aTitle.localeCompare(bTitle); // Kategoriyi alfabetik sırala
  });
}

const computedMainChoiceId = computed(() => {
  const category = categoriesStore.getCategory(props.productInfoForm.category)
  return category?.mainChoiceId
})


const initSearchVariantForm = async () => {
  searchVariantForm.value = { searchVariantFormMenu: false }
  search()
}


const getSlicerChoice = (choices: any[]) => {
  return choices?.find((c: any) => c.slicer === true) || choices?.[0] || {};
}

const getVarianterChoice = (choices: any[]) => {
  return choices?.find((c: any) => c.varianter === true) || choices?.[0] || {};
}

const rowspanSet = computed(() => {
  const rowspanMap = new Map()
  let tempChoiceValueId = undefined

  for (const variant of originalVariants.value) {
    // 1. choices dizisi içinde isSlicer: true olanı bul, yoksa 0. elemanı al
    const targetChoice = getSlicerChoice(variant.choices)

    if (!targetChoice) continue

    const currentChoiceValueId = targetChoice.choiceValueId

    if (currentChoiceValueId !== tempChoiceValueId) {
      tempChoiceValueId = currentChoiceValueId

      // originalVariants içinde aynı slicer değerine sahip kaç tane variant olduğunu filtrele
      const count = originalVariants.value.filter((item: any) => {
        const itemTarget = getSlicerChoice(item.choices)
        return itemTarget?.choiceValueId === currentChoiceValueId
      }).length

      rowspanMap.set(variant.barcode, count)
    }
  }

  return rowspanMap
})


const preparePagination = () => {
  pagination.value.totalNumberOfRecords = originalVariants.value.length
  pagination.value.totalNumberOfPages = Math.ceil(pagination.value.totalNumberOfRecords / pagination.value.limit)
  isFiltered.value = originalVariants.value.isFiltered

  const start = (pagination.value.page - 1) * pagination.value.limit;
  const end = start + pagination.value.limit
  originalVariants.value = originalVariants.value.slice(start, end)

}



const checkSearchPrice = (variant: any) => {
  const min = searchVariantForm.value.min
  const max = searchVariantForm.value.max
  if (min == undefined && max == undefined) return true

  const variantSalePrice = variant.prices.salePrice
  const variantMarketPrice = variant.prices.marketPrice

  if (min != undefined && max != undefined) {
    if (variantSalePrice >= min && variantSalePrice <= max) return true
    if (variantMarketPrice >= min && variantMarketPrice <= max) return true
  } else if (min != undefined) {
    if (variantSalePrice >= min) return true
    if (variantMarketPrice >= min) return true
  } else if (max != undefined) {
    if (variantSalePrice <= max) return true
    if (variantMarketPrice <= max) return true
  }
  return false
}

const search = async () => {
  await nextTick(() => { })

  if (!props.productInfoForm.variants) return
  originalVariants.value = JSON.parse(JSON.stringify(props.productInfoForm.variants))
  const filteredVariants: any = []
  for (const variant of originalVariants.value) {
    if (searchVariantForm.value.shelf) {
      if (searchVariantForm.value.shelf != variant.shelf)
        continue
    }
    if (searchVariantForm.value.stock) {
      if (searchVariantForm.value.stock != variant.stock)
        continue
    }
    if (searchVariantForm.value.stockcode) {
      if (!variant.stock || !variant.stockcode.includes(searchVariantForm.value.stockcode))
        continue
    }
    if (searchVariantForm.value.barcode) {
      if (!variant.barcode || !variant.barcode.includes(searchVariantForm.value.barcode))
        continue
    }

    if (searchVariantForm.value.isPlatformBasedPrice == undefined || searchVariantForm.value.isPlatformBasedPrice == 0) {
      //
    } else if (searchVariantForm.value.isPlatformBasedPrice == 2 && variant.prices.isPlatformBasedPrice == false) {
      continue
    } else if (variant.prices.isPlatformBasedPrice == true) {
      continue
    }


    if (searchVariantForm.value.choices) {
      var flag = true
      for (let searchChoice of searchVariantForm.value.choices) {
        if (!searchChoice.choiceValueIds || searchChoice.choiceValueIds.length == 0) continue
        var choiceFlag = false
        for (let variantChoice of variant.choices) {
          if (searchChoice.choiceId === variantChoice.choiceId && searchChoice.choiceValueIds.includes(variantChoice.choiceValueId)) {
            choiceFlag = true
            break
          }
        }
        if (choiceFlag == false) {
          flag = false
          break
        }
      }
      if (flag == false) continue
    }

    if (!checkSearchPrice(variant)) continue

    filteredVariants.push(variant)
  }
  originalVariants.value = filteredVariants
  originalVariants.value = sort(originalVariants.value)
  preparePagination()
  if (integrationCode.value) {
    for (const variant of originalVariants.value) {
      if (!variant.prices) variant.prices = {}
      if (!variant.prices[integrationCode.value]) variant.prices[integrationCode.value] = { marketPrice: 0.00, salePrice: 0.00 }
    }
  }
  editingComputedVariants.value = JSON.parse(JSON.stringify(originalVariants.value))
  return
}

</script>


<style scoped>
.status-indicator-dot {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  z-index: 2;
  /* Beyaz çerçeve ile logonun üzerinden ayrılmasını sağlar */
  border: 2px solid var(--ek-color-surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Badge Renklerinin Anlamları (Görsel Netlik İçin) */
/* Yeşil: Yayında, Kırmızı: Hatalı, Turuncu: Bekliyor vb. */

/*
  ADR-0015 B5-2 — önceki satır içi stillerin token'lı karşılıkları. Satır içi stilin önceliği,
  Vuetify'ın yüksek özgüllüklü kurallarıyla (td yüksekliği/kenarlığı, tablo genişliği) çakışan
  yerlerde `!important` ile korunur.
*/
.vl-dot--active {
  background-color: var(--ek-color-success);
}

.vl-table {
  left: 0;
  z-index: 1;
  right: 0;
  width: auto !important;
  border: 1px solid var(--ek-color-border-color);
  border-radius: var(--ek-radius-sm);
}

.vl-head-sep {
  border-right: 1px solid var(--ek-color-border-default);
}

.vl-cell-sep {
  border-right: 1px solid var(--ek-color-border-default) !important;
}

.vl-image-head {
  width: 124px;
  opacity: .6;
}

.vl-sort-head {
  height: 20px !important;
  cursor: pointer;
}

.vl-w-130 {
  width: 130px;
}

.vl-w-60 {
  width: 60px;
}

.vl-w-95 {
  width: 95px;
}

.vl-w-150 {
  width: 150px !important;
}

.vl-w-70 {
  width: 70px;
}

.vl-sort-icon--hint {
  opacity: .5 !important;
}

.vl-sort-icon--hidden {
  opacity: 0 !important;
}

.vl-platforms-head {
  text-align: center;
  width: 100% !important;
}

.vl-group-spacer {
  min-height: 10px !important;
  line-height: 10px !important;
  height: 30px !important;
}

.vl-cb-fixed {
  flex: 0 0 !important;
}

.vl-thumb {
  width: 110px;
  min-width: 110px;
}

/* ProductVariantImageComponent kökünün kendi satır içi stili var → :global + !important. */
:global(.vl-thumb-img) {
  border-bottom: 1px solid var(--ek-color-surface-sunken) !important;
}

.vl-td-group {
  border-color: var(--ek-color-border-default) !important;
  background-color: var(--ek-color-card-component-hover-color) !important;
}

.vl-td-choices {
  border-left: 1px solid var(--ek-color-border-default) !important;
}

.vl-field-caption {
  font-size: var(--ek-font-size-xs) !important;
  line-height: .7;
}

.vl-price-cell {
  width: auto !important;
  min-width: 130px;
}

.vl-w-full {
  width: 100% !important;
}

.vl-w-full-soft {
  width: 100%;
}

.vl-platforms {
  max-width: 450px;
}

.vl-platform-trigger {
  cursor: pointer;
  border-radius: var(--ek-radius-sm);
}

.vl-platform-trigger:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
}
</style>