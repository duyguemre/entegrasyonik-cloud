<template>
  <div class="pdv-root" :class="[dialogAttach.substring(1)]" ref="rootRef">
    <EkPageHeader
      section="Katalog"
      :trail="productTrail"
      :record="productRecord"
      :title="$t('definitions.product.update.title')"
      :description="$t('definitions.product.update.description')"
    >
      <template #status><div :id="statusId" class="pdv-status" /></template>
    </EkPageHeader>

    <ProductCompetitivePricesComponent v-model="isCompetitivePricesDialog" ref="productCompetitivePricesComponentRef"
      :productInfoForm="productInfoForm" v-if="isCompetitivePricesDialog" />

    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <EkDialogHost :model-value="isImagesDialog" :attach="dialogAttach" width="xl"
      @update:model-value="(v) => { if (!v) isImagesDialog = false }">
      <keep-alive>
        <ProductImagesComponent v-model="isImagesDialog" key="ProductImagesComponent"
          @close="isImagesDialog = false" v-if="isImagesDialog == true" :productInfoForm="productInfoForm" />
      </keep-alive>
    </EkDialogHost>

    <v-form @keydown.enter.prevent @submit.prevent ref="productInfoFormRef" v-model="isProductInfoFormValid"
      v-if="initialized">

      <div class="pdv-flow">
        <ProductFormWizardBar :form="productInfoForm" :current="stepper" :teleport-to="`#${statusId}`" save-label="Güncelle"
          :saving="isSaving" :category-title="categoriesStore.getCategoryTitle(productInfoForm.category)"
          :brand-title="brandsStore.getBrandTitle(productInfoForm.brand)" @navigate="onNavigate" @save="updateProduct" />

        <div v-if="stepper == 0" class="pdv-category-step" data-pf-field="category">
          <v-form ref="formStep0Ref" @submit.stop>
            <CategorySelectBoxLevelComponent v-model="productInfoForm.category" />
          </v-form>
        </div>



        <div v-if="stepper == 1" class="pdv-step">
          <v-form ref="formStep1Ref" @submit.stop>
            <ProductInfoFormComponent :productInfoForm="productInfoForm" :quillToolbar="quillToolbar"
              :galleryDisabled="!productInfoForm._id && !productInfoForm.tempId" :imageProductId="productInfoForm._id ? productInfoForm._id : productInfoForm.tempId"
              @openGallery="isImagesDialog = true" />
          </v-form>
        </div>


        <div v-if="stepper == 2" class="pdv-step-variants">
          <v-form ref="formStep2Ref" @submit.stop>
            <template v-if="productInfoForm.hasVariant">
              <ProductVariantsComponent v-model="isVariantsDialog1" :productInfoForm="productInfoForm"
                class="pdv-variants" :class="{ 'pdv-variants--dim': !isVariantsDialog1 }" key="ProductVariantsComponent"
                @close="isVariantsDialog1 = false" v-if="isVariantsDialog1 == true" @refresh-images="refreshImages"
                :dialogAttach="dialogAttach" @refresh-variants="refreshVariants" />
            </template>
            <template v-else>

              <ProductSingleVariantComponent v-model="isVariantsDialog1" :productInfoForm="productInfoForm"
                :single-variant="productInfoForm.variants[0]" class="pdv-variants" :class="{ 'pdv-variants--dim': !isVariantsDialog1 }" key="ProductVariantsComponent"
                @close="isVariantsDialog1 = false" v-if="isVariantsDialog1 == true" @refresh-images="refreshImages"
                :dialogAttach="dialogAttach" @refresh-variants="refreshVariants" />
            </template>
          </v-form>
        </div>

        <div v-if="stepper == 3" class="pdv-step">
          <v-form ref="formStep3Ref" @submit.stop>
            <ProductDetailsComponent :productInfoForm="productInfoForm" />
          </v-form>
        </div>

        <!-- PRC-R1: Rekabet ve kâr (Trendyol, salt okuma) — yalnız kayıtlı üründe, Varyantlar adımının altında. -->
        <CompetitionPanel v-if="stepper == 2 && productInfoForm._id" class="pdv-competition" :key="`${productInfoForm._id}-${competitionKey}`"
          :product-id="String(productInfoForm._id)" :variants="productInfoForm.variants || []" @focus-cost="focusCostColumn" />

      </div>

    </v-form>
    <!-- Yükleniyor durumu (ADR-0015 premium-ui-standards): `initialized` false iken önceden
         hiçbir görsel geri bildirim yoktu (boş ekran) — davranış AYNI kalır (form yine
         `retrieveProduct()` tamamlanınca render olur), yalnızca bu bekleme aralığına sade bir
         iskelet eklendi. -->
    <EkSkeleton v-else type="form" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeMount, nextTick, onBeforeUnmount, onMounted, onActivated, onDeactivated, inject, useId } from 'vue'
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify'

import EkPageHeader from '@/components/page/EkPageHeader.vue'
import ProductFormWizardBar from '@/components/productDefinitions/crud/ProductFormWizardBar.vue'
import { focusProductField } from '@/composables/productFormFocus'
import type { StepIndex } from '@/composables/useProductFormProgress'
import { EkSkeleton, EkDialogHost } from '@entegrasyonik/ui/components'
import ProductCompetitivePricesComponent from '@/components/productDefinitions/crud/ProductCompetitivePricesComponent.vue'
import ProductVariantsComponent from '@/components/productDefinitions/variants/ProductVariantsComponent.vue'
import ProductImagesComponent from '@/components/productDefinitions/crud/ProductImagesComponent.vue'
import LoadingComponent from '@/components/LoadingComponent.vue'
import { useChoicesStore } from '@/stores/choicesStore';

import ProductSingleVariantComponent from '@/components/productDefinitions/variants/ProductSingleVariantComponent.vue';

import useFormRules from '@/composables/formrules';
import useRestApi from '@/composables/restapi'
import useBarcode from '@/composables/barcode';

import { useBrandsStore } from '@/stores/brandsStore';
import { useCategoriesStore } from '@/stores/categoriesStore';
import { useIntegrationStore } from '@/stores/integrationStore';
;
import CategorySelectBoxLevelComponent from '@/components/CategorySelectBoxLevelComponent.vue';
import { useSnackbarStore } from '@/stores/snackbarStore';
import ProductDetailsComponent from '@/components/productDefinitions/variants/ProductDetailsComponent.vue';
import CompetitionPanel from '@/components/pricing/CompetitionPanel.vue'
import { useCostSave } from '@/composables/useCostSave'
import type { CostBaseline } from '@/composables/usePricingApi'
import ProductInfoFormComponent from '@/components/productDefinitions/crud/ProductInfoFormComponent.vue';

/** Sayfa başlığındaki durum yuvası (zorunlu bilgi çubuğu buraya taşınır); sekme başına benzersiz. */
const statusId = `pf-status-${useId()}`
const snackbarStore = useSnackbarStore();
const costSave = useCostSave()
// PRC-R0: açılıştaki (sunucudaki) maliyetler — kaydetmede yalnız DEĞİŞENLER `setVariantCosts` ile gider.
const costBase = ref<CostBaseline>({})
const competitionKey = ref(0)
const focusCostColumn = () => {
  stepper.value = 2
  nextTick(() => rootRef.value?.querySelector<HTMLElement>('.pv-frame')?.scrollIntoView({ block: 'center' }))
}

const menuStore: any = inject('useMenuStore')
const eventBus: any = inject('eventBus', undefined)
const choicesStore = useChoicesStore()
var choicesStoreChoices: any = ref()
const stepper = ref(0)
const formStep0Ref: any = ref(null)
const formStep1Ref: any = ref(null)
const formStep2Ref: any = ref(null)
const formStep3Ref: any = ref(null)

const { t } = useI18n()
const { name } = useDisplay()
const restApi = useRestApi()
const brandsStore = useBrandsStore()
const categoriesStore = useCategoriesStore()
const integrationStore = useIntegrationStore()
const formRules: any = useFormRules()

const initialized = ref(false)

const productInfoFormRef = ref()
const isProductInfoFormValid = ref(false)
const productInfoForm = ref()

// A7 breadcrumb: Katalog / Ürünler (bağlantı) / Ürünü düzenle · [stok kodu ⧉].
const productTrail = [{ label: 'Ürünler', icon: 'mdi-tag-outline', onSelect: () => {
  const link = menuStore?.getMenuLinkWithCode?.('ProductListView')
  if (link) eventBus?.emit('openTab', link)
} }]
const productRecord = computed(() => {
  // Tekil ürünün stok kodu = kaydın kısa kimliği; varyantlı üründe tek bir kod yok (uydurma kimlik gösterilmez).
  const form = productInfoForm.value
  const code = form && !form.hasVariant ? form.variants?.[0]?.stockcode : undefined
  return code ? { code: String(code), label: 'Stok kodu' } : null
})
const isCompetitivePricesDialog = ref(false)
const isVariantsDialog = ref(false)
const isVariantsDialog1 = ref(true)
const isImagesDialog = ref(false)
const loadingComponentRef: any = ref(null)
const productCompetitivePricesComponentRef: any = ref(null)
const taxList: any = ref([])

var brandsStoreBrands: any = undefined
var categoriesStoreCategories: any = undefined
var editorData = '<p>' + t('productDefinitions.product.define.productDesc') + '</p>'
// CKEditor5 Classic build'in varsayılan toolbar'ına en yakın eşdeğer (GPL-2.0-or-later lisans riski nedeniyle
// MIT lisanslı @vueup/vue-quill'e geçirildi, bkz. docs/LICENSE_AUDIT.md). Tablo/medya gömme/resim yükleme gibi
// CKEditor'a özgü bazı öğelerin birebir karşılığı yok (aşağıdaki rapora bakınız).
const quillToolbar = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  [{ indent: '-1' }, { indent: '+1' }],
  ['blockquote', 'link'],
  ['clean']
]

var props = defineProps<{
  parameters: any
}>()



const checkSingleVariant = () => {
  if (
    productInfoForm.value.hasVariant === false &&
    (!productInfoForm.value?.variants || productInfoForm.value.variants.length === 0)
  ) {
    initSingleVariant()
  }
}

const rootRef = ref<HTMLElement | null>(null)
const isSaving = ref(false)

// Sihirbaz şeridi/altbilgi/eksikler paneli ortak gezinti noktası: adım değişir, isteniyorsa alana odaklanılır.
const onNavigate = async ({ step, field }: { step: StepIndex; field?: string }) => {
  if (step === 2) checkSingleVariant()
  stepper.value = step
  await focusProductField(rootRef.value, field)
}


const getCombinations = (data: any): any[] => {
  // choiceValueIds içeren her öğeyi, { choiceId, choiceValueId } formatına dönüştür
  const entries = data.map((item: any) =>
    item.choiceValueIds.map((valueId: string) => ({
      choiceId: item.choiceId,
      choiceValueId: valueId
    }))
  );

  // Cartesian çarpımı ile tüm kombinasyonları oluştur
  const cartesianProduct = (arr: any[]): any[] =>
    arr.reduce((acc, val) =>
      acc.flatMap((a: any) => val.map((v: any) => [...a, v])), [[]]
    );

  return cartesianProduct(entries);
};

const areArraysEqual = (arr1: any, arr2: any) => {
  // Eğer array'ler farklı uzunluktaysa hemen false döneriz
  if (arr1.length !== arr2.length) {
    return false;
  }

  // Her iki array'deki öğeleri sırasıyla karşılaştırıyoruz
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i].choiceId !== arr2[i].choiceId || arr1[i].choiceValueId !== arr2[i].choiceValueId) {
      return false;
    }
  }

  // Eğer bütün öğeler eşitse, array'ler eşittir
  return true;
};

const createVariant = (choices: any) => {
  const platforms: any = {}
  for (const platform of integrationStore.getPlatforms()) {
    platforms[platform.code] = {
      attributes: {},
      prices: {
        marketPrice: 0,
        salePrice: 0
      }
    }
  }

  return { choices: choices, platforms: platforms, images: [], stockcode: '', barcode: '', stock: 0, prices: { isPlatformBasedPrice: false, marketPrice: 100, salePrice: 0 }, shelf: '' }
}


const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const generateUUID = () => {
  return Math.floor(Date.now() / 1000).toString(16) + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function () {
    return (Math.random() * 16 | 0).toString(16);
  }).toLowerCase();
}



const refreshImages = async () => {
  await nextTick(() => { })
  let guid = loadingComponentRef.value.info(t('loading.info.getImages'))
  const resp = await restApi.postImage('getImages', {
    productId: productInfoForm.value._id ? productInfoForm.value._id : productInfoForm.value.tempId
  })
  productInfoForm.value.images = resp.images
  loadingComponentRef.value.remove(guid)
}

const refreshVariants = async () => {
  await nextTick(() => { })
  let guid = loadingComponentRef.value.info(t('loading.info.getVariants'))
  const response = await restApi.post("VariantService/getVariants", { _id: productInfoForm.value._id })
  loadingComponentRef.value.remove(guid)
  if (response) {
    productInfoForm.value.variants = response
    costBase.value = costSave.baseline(response)
  }
}


const setTabTitle = () => {
  const link = menuStore.tabProcessedMenu.find((item: any) => item.code == 'ProductUpdateView_' + productInfoForm.value._id)
  if (link)
    link.title = productInfoForm.value.title
}

const retrieveProduct = async () => {
  let guid = loadingComponentRef.value.info('')
  const response = await restApi.post("ProductService/retrieveProduct", { _id: productInfoForm.value._id })
  loadingComponentRef.value.remove(guid)

  if (response && response.product && response.product._id) {
    productInfoForm.value = response.product
    checkSingleVariant()
    costBase.value = costSave.baseline(productInfoForm.value.variants)

    console.log("productInfoForm.value", productInfoForm.value, productInfoForm.value.variants)
    if (productInfoForm.value.prices == undefined) productInfoForm.value.prices = {}
    setTabTitle()
  }
}


const initSingleVariant = () => {
  productInfoForm.value.variants = [createVariant([])]
}




const checkVariantAttributes = async () => {
  const platforms = integrationStore.getClientMarketplaces().filter((item: any) => item.type.code == 'marketplace')
  const variants = productInfoForm.value.variants || []
  const currentCategory = categoriesStore.getCategory(productInfoForm.value.category)
  if (currentCategory == undefined) {
    console.error('Current category not found')
    return
  }
  for (const platform of platforms) {
    const integrationCategoryId = currentCategory.platforms[platform.code]
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
    }
  }
}


const updateProduct = async () => {
  if (isSaving.value) return
  isSaving.value = true
  /*   await productInfoFormRef.value?.validate()
    if (isProductInfoFormValid.value == false) return
   */
  /*   if (productInfoForm.value.prices) {
      calculateSetSalePrice()
    }
   */
  const costDiff = costSave.plan(costBase.value, productInfoForm.value.variants)
  let guid = loadingComponentRef.value.info(t('loading.info.updateProduct'))
  checkVariantAttributes()
  let response: any
  try {
    response = await restApi.post("ProductService/updateProduct", { productInfo: productInfoForm.value })
  } finally {
    loadingComponentRef.value.remove(guid)
    isSaving.value = false
  }
  if (response && response.product && response.product._id) {
    productInfoForm.value = response.product
    snackbarStore.addSnackbar({
      show: true,
      text: 'Ürün Güncellendi',
      timeout: 2000,
      color: 'success'
    })
    setTabTitle()
    // PRC-R0: maliyet ayrı yazma yolu; sonucu AYRI bildirilir (kayıt başarılı + maliyet başarısız açıkça görünür).
    costBase.value = costSave.baseline(productInfoForm.value.variants)
    const outcome = await costSave.persist(productInfoForm.value.variants, costDiff, 'update')
    if (outcome.status === 'ok') costBase.value = costSave.baseline(productInfoForm.value.variants)
    if (outcome.status !== 'none') competitionKey.value++
  }
}

onMounted(() => {
  console.log("PRODUCTUPDATEMOUNTED")
  choicesStoreChoices.value = choicesStore.getChoices()
})

const dialogAttach = computed(() => {
  return '.productUpdateView' + productInfoForm.value._id
})

onBeforeMount(() => {
  reset()
})

onActivated(() => {
})

onDeactivated(() => {
  productInfoForm.value = undefined
})

onBeforeUnmount(() => {
  productInfoForm.value = null
})




const reset = () => {
  for (let i = 1; i < 30; i++) {
    taxList.value.push({ _id: i, value: i, title: i })
  }

  brandsStoreBrands = brandsStore.getBrands()
  categoriesStoreCategories = categoriesStore.getSelectCategories()
  isVariantsDialog.value = false

  const platforms: any = {}
  for (const platform of integrationStore.getPlatforms()) {
    platforms[platform.code] = {
      attributes: {}
    }
  }

  productInfoForm.value = {
    /*     image: undefined,
        stockcode: undefined,
        platformUploads: {}, */

    tempId: generateUUID(),
    variants: [],
    platforms: platforms,
    hasVariant: false,
    title: undefined,
    barcode: undefined,
    category: undefined,
    brand: undefined,
    stock: 0,
    shelf: 0,
    prepDuration: 3,
    warrantyDuration: 0,
    desi: 0,
    taxPercentage: 10,
    subtitle: undefined,
    invoiceTitle: undefined,
    images: [],
    prices: {
      costPrice: 0,
      price: 0,
      salePrice: 0,
      marketPrice: 0,
      manuelPricesFlag: false,
      competitivePricesFlag: false,
      competitive: {
        minPrice: 0,
        stepAmount: 0
      },
      isPlatformBasedPrice: false
    },
  }

  /*   for (const integration of integrationStore.getClientMarketplaces().filter((item: any) => item.type.code == 'marketplace')) {
      productInfoForm.value.platformUploads[integration.code] = { isReady: true }
    } */

}


const openTab = (parameters: any) => {
  /*   parameters = {productId: '66ffc044dd64c61bfe277a2c'} */
  if (parameters && parameters.productId && parameters.productId != productInfoForm.value._id) {
    productInfoForm.value._id = parameters.productId
    retrieveProduct()
  }
}


const initialize = async (parameters: any) => {
  if (parameters && parameters.productId && parameters.productId != productInfoForm.value._id) {
    productInfoForm.value._id = parameters.productId
    await retrieveProduct()
    initialized.value = true
  }
}

const activate = async (parameters: any) => {
  console.log(dialogAttach.value + " Activated", parameters)
  if (parameters) {
    if (parameters.productId && parameters.productId != productInfoForm.value._id) {
      productInfoForm.value._id = parameters.productId
      retrieveProduct()
    }
  } else {
    if (productInfoForm.value._id)
      reset()
  }
}

const destroy = async () => {
  console.log(dialogAttach.value + " Destroyed")
  await sleep(20)
  reset()
}



defineExpose({
  initialize,
  activate,
  destroy,
  openTab
});


const headers = [
  {
    id: 0,
    title: t('common.platform'),
    value: "platform"
  },
  {
    id: 1,
    title: t('productDefinitions.product.define.price'),
    value: "price"
  },
  {
    id: 2,
    title: t('productDefinitions.product.define.listPrice'),
    value: "listPrice"
  },
  {
    id: 3,
    title: "actions",
    value: "actions"
  },
]


</script>

<style>
.productUpdateView {
  position: absolute;
  bottom: 0px;
  top: 0px;
  left: 0px;
  right: 0px;
  width: auto
}

.workarea-scroll {
  position: absolute;
  overflow-y: auto;
  overflow-x: hidden;
  bottom: 2px;
  top: 0px;
  left: 0px;
  right: 0px;
  width: auto
}

.ql-editor {
  min-height: 345px;
  max-height: 345px;
  overflow-y: auto;
}

.pdv-variants {
  transition: opacity var(--ek-motion-overlay) !important;
}

.pdv-variants--dim {
  opacity: 0.2 !important;
}

/* .productDefinitionView .v-overlay__content {
  width:100%!important
}
 */
</style>

<style scoped>
/* Başlıktaki durum yuvası: zorunlu bilgi çubuğu başlığın sağındaki alanı doldurur. */
.pdv-root :deep(.ek-page-bar__status) {
  flex: 1 1 auto;
  overflow: visible;
}

.pdv-status {
  flex: 1 1 auto;
  min-width: 0;
}

/* Sayfa kenar boşluğu — başlık/adım şeridi/içerik iş alanı kenarına yapışmasın. */
.pdv-root {
  padding: var(--ek-space-2) var(--ek-space-6) var(--ek-space-4);
}

@media (max-width: 599px) {
  .pdv-root {
    padding: var(--ek-space-2) var(--ek-space-4) var(--ek-space-6);
  }
}

/* FE R4 B: sihirbaz şeridi, kayıt çubuğu, adım içeriği ve altbilgi TEK sütunda (önceden adım kartları 880/1200/tam
   genişlik arasında değişiyordu). Kayıt çubuğu bu sütunda yapışkandır (ProductFormWizardBar).
   Sütun iş alanının tam genişliğine yayılır (önceden 1280px ile ortada kalıyordu). */
.pdv-flow {
  margin-top: var(--ek-space-4);
}

.pdv-category-step,
.pdv-step,
.pdv-step-variants {
  display: block;
  margin-top: var(--ek-space-3);
}

/* PRC-R1: Rekabet ve kâr bölümü — varyant tablosu ile adım altbilgisi arasında. */
.pdv-competition {
  margin-top: var(--ek-space-4);
}
</style>
