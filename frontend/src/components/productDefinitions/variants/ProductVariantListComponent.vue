<!--
  frontend/src/components/productDefinitions/variants/ProductVariantListComponent.vue

  Ürün listesinde varyantlı ürünün SEÇENEKLER bölümü (satırın altında açılır). Aşama 5 (kullanıcı geri
  bildirimi madde 11) — premium varyant ızgarası:
    ☐ │ [görsel] STOK KODU / barkod │ GRUP (ayırıcı seçenek, satır birleştirmeli) │ SEÇENEKLER (çip) │
      SATIŞ / PİYASA FİYATI (sağa hizalı) │ STOK (sağa hizalı, tükenen vurgulu) + raf │ KANAL DURUMLARI
  Kanal durumu: her kanal kendi renginde çip (kanal noktası + ad) + durum ikonu (ton `status-map` dilinde);
  çipe tıklayınca ayrıntı kartı (`ProductVariantListTooltipComponent`). Veri yalnız ürünün kendi varyant
  kayıtlarından; mantık (sıralama, seçim, grup birleştirme) değişmedi.
-->
<template>
  <v-data-table-server v-model="selectedVariants" :items-length="originalVariants ? originalVariants.length : 0"
    :items="originalVariants" fixed-header item-value="barcode" :headers="headers" class="vl-table"
    elevation="0" :show-select="true">

    <template v-slot:header.data-table-select="{ allSelected, selectAll, someSelected }">
      <div class="vl-head vl-head--select">
        <v-checkbox-btn :model-value="allSelected" :indeterminate="someSelected && !allSelected" color="primary"
          aria-label="Tüm varyantları seç" density="compact"
          @update:model-value="selectAll(!allSelected)"></v-checkbox-btn>
      </div>
    </template>

    <template v-slot:header.variant>
      <div class="vl-head">
        <button type="button" class="vl-sort" :class="{ 'is-on': sortBy === 'stockcode' }" @click="toggleSort('stockcode')">
          <span>Stok Kodu</span><v-icon class="vl-sort__icon" :icon="sortIconFor('stockcode')" aria-hidden="true" />
        </button>
        <span class="vl-head__sep" aria-hidden="true">/</span>
        <button type="button" class="vl-sort" :class="{ 'is-on': sortBy === 'barcode' }" @click="toggleSort('barcode')">
          <span>Barkod</span><v-icon class="vl-sort__icon" :icon="sortIconFor('barcode')" aria-hidden="true" />
        </button>
      </div>
    </template>

    <template v-slot:header.choiceTitle>
      <div class="vl-head">
        <button type="button" class="vl-sort" :class="{ 'is-on': sortBy === 'choiceValueTitle' }" @click="toggleSort('choiceValueTitle')">
          <span>Grup</span><v-icon class="vl-sort__icon" :icon="sortIconFor('choiceValueTitle')" aria-hidden="true" />
        </button>
      </div>
    </template>

    <template v-slot:header.choices>
      <div class="vl-head">
        <button type="button" class="vl-sort" :class="{ 'is-on': sortBy === 'choices' }" @click="toggleSort('choices')">
          <span>Seçenekler</span><v-icon class="vl-sort__icon" :icon="sortIconFor('choices')" aria-hidden="true" />
        </button>
      </div>
    </template>

    <template v-slot:header.prices>
      <div class="vl-head vl-head--end">
        <button type="button" class="vl-sort" :class="{ 'is-on': sortBy === 'prices.salePrice' }" @click="toggleSort('prices.salePrice')">
          <span>Satış Fiyatı</span><v-icon class="vl-sort__icon" :icon="sortIconFor('prices.salePrice')" aria-hidden="true" />
        </button>
        <span class="vl-head__sep" aria-hidden="true">/</span>
        <button type="button" class="vl-sort" :class="{ 'is-on': sortBy === 'prices.marketPrice' }" @click="toggleSort('prices.marketPrice')">
          <span>Piyasa Fiyatı</span><v-icon class="vl-sort__icon" :icon="sortIconFor('prices.marketPrice')" aria-hidden="true" />
        </button>
      </div>
    </template>

    <template v-slot:header.stock>
      <div class="vl-head vl-head--end">
        <button type="button" class="vl-sort" :class="{ 'is-on': sortBy === 'stock' }" @click="toggleSort('stock')">
          <span>Stok Adedi</span><v-icon class="vl-sort__icon" :icon="sortIconFor('stock')" aria-hidden="true" />
        </button>
      </div>
    </template>

    <template v-slot:header.platforms="{ column }">
      <div class="vl-head"><span class="vl-head__label">{{ column.title }}</span></div>
    </template>

    <template v-slot:header.shelf>
    </template>

    <template v-slot:header.actions>
    </template>

    <template v-slot:item="{ item, index }: any">
      <tr v-if="index != 0 && rowspanSet.get(item.barcode)" class="vl-group-gap" aria-hidden="true">
        <td :colspan="headers.length + 1"></td>
      </tr>

      <tr class="vl-row" :class="{ 'is-selected': selectedVariants.includes(item.barcode) }">
        <td class="vl-td vl-td--select">
          <v-checkbox-btn :model-value="selectedVariants.includes(item.barcode)" :aria-label="`${item.stockcode} varyantını seç`"
            color="primary" density="compact" @update:model-value="val => {
              if (val) selectedVariants.push(item.barcode)
              else selectedVariants = selectedVariants.filter((id: any) => id !== item.barcode)
            }" />
        </td>

        <td class="vl-td">
          <div class="vl-ident">
            <v-tooltip location="bottom" :open-delay="600" :eager="false" transition="fade-transition" text="Varyant görsellerini düzenle">
              <template v-slot:activator="{ props: tooltipProps }">
                <ProductVariantImageComponent v-bind="{ ...tooltipProps }" :productInfoForm="productInfoForm"
                  @click.stop="isVariantImagesDialog = true; selectedVariantForEdit = item"
                  :imageId="item.images ? item.images[0] : undefined" class="vl-thumb" />
              </template>
            </v-tooltip>
            <span class="vl-ident__text">
              <span class="vl-code ek-num">{{ item.stockcode }}</span>
              <span class="vl-barcode ek-num"><v-icon icon="mdi-barcode" aria-hidden="true" />{{ item.barcode }}</span>
            </span>
          </div>
        </td>

        <td :rowspan="rowspanSet.get(item.barcode)" v-if="productInfoForm.hasVariant && rowspanSet.get(item.barcode)"
          class="vl-td vl-td--group">
          <span class="vl-group">
            <span class="vl-group__name">{{ choicesStore.getChoiceValueName(getSlicerChoice(item.choices).choiceId,
              getSlicerChoice(item.choices).choiceValueId) }}</span>
            <span class="vl-group__count">{{ rowspanSet.get(item.barcode) }} varyant</span>
          </span>
        </td>

        <td class="vl-td">
          <span class="vl-choices">
            <template v-for="choice of item.choices" :key="choice.choiceId">
              <span v-if="choice.slicer != true" class="vl-choice">
                <span class="vl-choice__label">{{ choicesStore.getChoiceTitle(choice.choiceId) }}</span>
                <span class="vl-choice__value">{{ choicesStore.getChoiceValueName(choice.choiceId, choice.choiceValueId) }}</span>
              </span>
            </template>
            <span v-if="!item.choices?.some((c: any) => c.slicer != true)" class="vl-muted">—</span>
          </span>
        </td>

        <td class="vl-td vl-td--end">
          <span v-if="item.prices.isPlatformBasedPrice == true" class="vl-price" @click="editingVariantMenu = true; editingVariant = item">
            <span class="vl-price__note">Kanala göre</span>
            <span class="vl-price__sale ek-num">{{ formatCurrency(findMinimumSalePrice(item.platforms)) }} – {{ formatCurrency(findMaximumSalePrice(item.platforms)) }}</span>
            <span class="vl-price__market ek-num">Piyasa {{ formatCurrency(findMinimumMarketPrice(item.platforms)) }} – {{ formatCurrency(findMaximumMarketPrice(item.platforms)) }}</span>
          </span>
          <span v-else class="vl-price">
            <span class="vl-price__sale ek-num">{{ formatCurrency(item.prices.salePrice) }}</span>
            <span class="vl-price__market ek-num">Piyasa {{ formatCurrency(item.prices.marketPrice) }}</span>
          </span>
        </td>

        <td class="vl-td vl-td--end">
          <span class="vl-stock">
            <span class="vl-stock__qty ek-num" :class="{ 'is-out': !Number(item.stock) }">{{ item.stock ?? 0 }}</span>
            <span v-if="!Number(item.stock)" class="vl-stock__out">Stokta yok</span>
            <span v-if="item.shelf" class="vl-stock__shelf"><v-icon icon="mdi-map-marker-outline" aria-hidden="true" />Raf {{ item.shelf }}</span>
          </span>
        </td>

        <td class="vl-td">
          <div class="vl-platforms">
            <template v-if="integrationStore" v-for="integration of integrationStore.getClientPlatforms()" :key="integration.code">
              <v-menu :close-on-content-click="false" location="bottom center" transition="fade-transition" offset="8">
                <template v-slot:activator="{ props: menuProps }">
                  <div v-bind="menuProps" class="vl-platform platform-mini-card" :class="[channelClass(integration.code), `is-${platformState(integration, item).tone}`]"
                    role="button" tabindex="0"
                    :aria-label="`${integration.title || integration.code}: ${platformState(integration, item).label} — durum bilgisi`"
                    @keydown.enter.prevent="($event.currentTarget as HTMLElement).click()"
                    @keydown.space.prevent="($event.currentTarget as HTMLElement).click()">
                    <span class="vl-platform__dot" aria-hidden="true"></span>
                    <span class="vl-platform__name">{{ integration.title || integration.code }}</span>
                    <v-icon class="vl-platform__state" :icon="platformState(integration, item).icon" aria-hidden="true" />
                  </div>
                </template>
                <ProductVariantListTooltipComponent :data="item.platforms[integration.code]" />
              </v-menu>
            </template>
          </div>
        </td>
      </tr>
    </template>
    <template v-slot:bottom="{ }">
    </template>
  </v-data-table-server>
</template>

<script setup lang="ts">
import { formatMoney } from '@/composables/format'
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
import { channelClass } from '@/design/channels'
import type { StatusTone } from '@/design/status-map'
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
    icon: 'mdi-pencil-outline',
    order: 2,
    message: "Hazırlanıyor"
  },
  [PRODUCT_INTEGRATION_STATUS.SENT]: {
    icon: 'mdi-clock-outline',
    order: 3,
    message: "Bekliyor"
  },
  [PRODUCT_INTEGRATION_STATUS.WAITING]: {
    icon: 'mdi-clock-outline',
    order: 4,
    message: "Bekliyor"
  },
  [PRODUCT_INTEGRATION_STATUS.FAILED]: {
    icon: 'mdi-close-box-outline',
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
    return 'error'
  }
  if (hasMessage)
    return 'success'
  else
    return 'transparent'
}


/**
 * Aşama 5 — kanal çipinin durum ikonu/tonu (yalnız varyant kaydındaki `upload.TRANSFER.status` + `onSale`).
 * Ton adları `status-map` dilinde; metin ekran okuyucu adına girer (renk tek başına anlam taşımaz).
 */
const platformState = (integration: any, item: any): { tone: StatusTone; icon: string; label: string } => {
  const upload = item.platforms?.[integration.code]?.upload
  const status = upload?.TRANSFER?.status
  if (status === PRODUCT_INTEGRATION_STATUS.COMPLETED) {
    return upload?.onSale === true
      ? { tone: 'success', icon: 'mdi-check-circle-outline', label: 'Yayında' }
      : { tone: 'warning', icon: 'mdi-pause-circle-outline', label: 'Onaylandı, satışa kapalı' }
  }
  if (status === PRODUCT_INTEGRATION_STATUS.FAILED) return { tone: 'danger', icon: 'mdi-alert-circle-outline', label: 'Reddedildi' }
  if (status === PRODUCT_INTEGRATION_STATUS.SENT || status === PRODUCT_INTEGRATION_STATUS.WAITING) return { tone: 'info', icon: 'mdi-clock-outline', label: 'Onay bekliyor' }
  if (status === PRODUCT_INTEGRATION_STATUS.PENDING) return { tone: 'info', icon: 'mdi-upload-outline', label: 'Hazırlanıyor' }
  return { tone: 'neutral', icon: 'mdi-circle-outline', label: 'Gönderilmedi' }
}

const sortIconFor = (key: string) => (sortBy.value === key ? (sortDesc.value === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up') : 'mdi-swap-vertical')

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
  return formatMoney(Number(number))
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
/* Aşama 5 — varyant ızgarası: ürün satırının altında "iç tablo" — sunken çerçeve içinde beyaz ızgara,
   mikro başlık, satır ayraçları ince, sayılar sağa hizalı tabular, gruplar arasında ince bant. */
.vl-table {
  width: auto !important; /* Vuetify tablo kabı satır içi genişlik verir */
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
  overflow: hidden;
}

.vl-table :deep(thead th) {
  height: 36px !important; /* Vuetify başlık yüksekliği satır içi değişkenle gelir */
  padding: 0 var(--ek-space-2) !important;
  border-bottom: 1px solid var(--ek-color-border-default) !important;
  background: var(--ek-color-surface-muted) !important;
}

.vl-head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  height: 100%;
}

.vl-head--end {
  justify-content: flex-end;
}

.vl-head--select {
  justify-content: center;
}

.vl-head__sep {
  color: var(--ek-color-content-subtle);
  font-size: var(--ek-type-micro-size);
}

.vl-head__label,
.vl-sort {
  color: var(--ek-color-content-muted);
  font-family: inherit;
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  white-space: nowrap;
}

.vl-sort {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px var(--ek-space-1);
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.vl-sort:hover,
.vl-sort.is-on {
  color: var(--ek-color-action-emphasis);
}

.vl-sort:focus-visible,
.vl-platform:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.vl-sort__icon {
  font-size: var(--ek-icon-xs);
  opacity: 0.45;
}

.vl-sort.is-on .vl-sort__icon {
  opacity: 1;
}

.vl-row > .vl-td {
  height: auto !important;
  padding: var(--ek-space-2) !important;
  border-bottom: 1px solid var(--ek-color-border-subtle) !important;
  vertical-align: middle;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-table-size);
  line-height: var(--ek-type-table-line);
  transition: background-color var(--ek-duration-fast) var(--ek-easing-standard);
}

.vl-row:hover > .vl-td:not(.vl-td--group) {
  background: var(--ek-color-surface-muted);
}

.vl-row.is-selected > .vl-td:not(.vl-td--group) {
  background: var(--ek-color-selection);
}

.vl-td--select {
  width: 44px;
  padding: 0 var(--ek-space-1) !important;
}

.vl-td--end {
  text-align: right;
}

.vl-group-gap > td {
  height: 6px !important;
  padding: 0 !important;
  border-bottom: 1px solid var(--ek-color-border-subtle) !important;
  background: var(--ek-color-surface-sunken);
}

/* Kimlik: 40px görsel + stok kodu (güçlü) + barkod (soluk, ikonlu). */
.vl-ident {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 180px;
}

:deep(.vl-thumb img),
:deep(.vl-thumb .v-img__img) {
  width: 100% !important; /* görsel bileşeni satır içi ölçü taşır */
  height: 100% !important;
  object-fit: cover;
}

:deep(.vl-thumb) {
  flex: none;
  width: 40px !important; /* görsel bileşeni satır içi ölçü taşır */
  height: 40px !important;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
  cursor: pointer;
}

.vl-ident__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.vl-code {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.vl-barcode {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.vl-barcode .v-icon {
  font-size: var(--ek-icon-xs);
}

/* Grup (ayırıcı seçenek): birleştirilmiş hücre, sunken zemin, üstte hizalı ad + varyant sayısı. */
.vl-td--group {
  width: 1%;
  vertical-align: top !important;
  padding-top: var(--ek-space-3) !important;
  border-right: 1px solid var(--ek-color-border-subtle) !important;
  background: var(--ek-color-surface-sunken);
}

.vl-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  white-space: nowrap;
}

.vl-group__name {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.vl-group__count {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

/* Seçenek değerleri çip: "ETİKET değer" (etiket soluk, değer güçlü) — DS çip ölçüsü. */
.vl-choices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}

.vl-choice {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  height: var(--ek-app-chip-h-sm);
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-sunken);
  font-size: var(--ek-type-caption-size);
  white-space: nowrap;
}

.vl-choice__label {
  color: var(--ek-color-content-muted);
}

.vl-choice__value {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.vl-muted {
  color: var(--ek-color-content-muted);
}

.vl-price,
.vl-stock {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  white-space: nowrap;
}

.vl-price__note {
  color: var(--ek-color-info-emphasis);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-font-weight-semibold);
}

.vl-price__sale,
.vl-stock__qty {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.vl-price__market,
.vl-stock__shelf {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.vl-stock__qty.is-out {
  color: var(--ek-color-error-emphasis);
}

.vl-stock__out {
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
}

.vl-stock__shelf {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.vl-stock__shelf .v-icon {
  font-size: var(--ek-icon-xs);
}

/* Kanal durumu: kanalın kendi renginde çip (kanal noktası + ad, kanal tonu metin) + durum ikonu (durum tonu). */
.vl-platforms {
  /* Sarılan kanal çipleri: genişlik yetince satır başına 2 çip; dar alanda kolon en geniş çipe kadar daralır. */
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
  max-width: 260px;
}

.vl-platform {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: var(--ek-app-chip-h-sm);
  padding: 0 6px 0 var(--ek-space-2);
  border: 1px solid var(--ek-ch-border);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-ch-subtle);
  color: var(--ek-ch-text);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.vl-platform:hover {
  border-color: var(--ek-ch-solid);
}

.vl-platform__dot {
  width: 7px;
  height: 7px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-ch-solid);
}

.vl-platform__state {
  font-size: var(--ek-icon-sm);
}

.vl-platform.is-success .vl-platform__state { color: var(--ek-color-success); }
.vl-platform.is-warning .vl-platform__state { color: var(--ek-color-warning); }
.vl-platform.is-danger .vl-platform__state { color: var(--ek-color-error); }
.vl-platform.is-info .vl-platform__state { color: var(--ek-color-info); }
.vl-platform.is-neutral .vl-platform__state { color: var(--ek-color-content-muted); }
</style>
