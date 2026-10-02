<template>
  <div class="productDefinitionView pdv-root" ref="rootRef">
    <EkPageHeader
      section="Katalog"
      :title="$t('definitions.product.create.title')"
      :description="$t('definitions.product.create.description')"
    />

    <ProductCompetitivePricesComponent v-model="isCompetitivePricesDialog" ref="productCompetitivePricesComponentRef"
      :productInfoForm="productInfoForm" v-if="isCompetitivePricesDialog" />

    <LoadingComponent attach=".productDefinitionView" ref="loadingComponentRef"></LoadingComponent>

    <EkDialogHost :model-value="isImagesDialog" :attach="dialogAttach" width="xl"
      @update:model-value="(v) => { if (!v) isImagesDialog = false }">
      <keep-alive>
        <ProductImagesComponent v-model="isImagesDialog" key="ProductImagesComponent"
          @close="isImagesDialog = false" v-if="isImagesDialog == true" :productInfoForm="productInfoForm" />
      </keep-alive>
    </EkDialogHost>

    <v-form @keydown.enter.prevent @submit.prevent ref="productInfoFormRef" v-model="isProductInfoFormValid">

      <div class="pdv-flow">
        <div class="pdv-grid">
          <!-- FE R5 B: ürün rayı (önizleme · adımlar · durum/Kaydet) — geniş kapta solda yapışkan, dar kapta üst + alt çubuk. -->
          <div class="pdv-rail">
            <ProductFormWizardBar :form="productInfoForm" :current="stepper" save-label="Kaydet" :saving="isSaving"
              :category-title="categoriesStore.getCategoryTitle(productInfoForm.category)"
              :brand-title="brandsStore.getBrandTitle(productInfoForm.brand)" :cover-src="preview.coverSrc.value"
              :category-path="preview.categoryPath.value" :feedback="saveFeedback" @navigate="onNavigate" @save="saveProduct" />
          </div>

          <div class="pdv-main">
            <div v-if="stepper == 0" class="pdv-category-step" data-pf-field="category">
              <v-form ref="formStep0Ref" @submit.stop>
                <ProductCategoryStep v-model="productInfoForm.category" />
              </v-form>
            </div>

            <div v-if="stepper == 1" class="pdv-step">
              <v-form ref="formStep1Ref" @submit.stop>
                <ProductInfoFormComponent :productInfoForm="productInfoForm" :quillToolbar="quillToolbar"
                  :galleryDisabled="!productInfoForm.tempId" :imageProductId="productInfoForm.tempId"
                  @openGallery="isImagesDialog = true" />
              </v-form>
            </div>

            <div v-if="stepper == 2" class="pdv-step-variants">
              <v-form ref="formStep2Ref" @submit.stop>
                <template v-if="productInfoForm.hasVariant">
                  <ProductVariantsComponent v-model="isVariantsDialog1" :productInfoForm="productInfoForm"
                    class="pdv-variants" :class="{ 'pdv-variants--dim': !isVariantsDialog1 }" key="ProductVariantsComponent"
                    @close="isVariantsDialog1 = false" v-if="isVariantsDialog1 == true" @refresh-images="refreshImages"
                    :dialogAttach="'.productDefinitionView'" @refresh-variants="refreshVariants" />
                </template>
                <template v-else>
                  <ProductSingleVariantComponent v-model="isVariantsDialog1" :productInfoForm="productInfoForm"
                    :single-variant="productInfoForm.variants[0]" class="pdv-variants" :class="{ 'pdv-variants--dim': !isVariantsDialog1 }" key="ProductVariantsComponent"
                    @close="isVariantsDialog1 = false" v-if="isVariantsDialog1 == true" @refresh-images="refreshImages"
                    :dialogAttach="'.productDefinitionView'" @refresh-variants="refreshVariants" />
                </template>
              </v-form>
            </div>

            <div v-if="stepper == 3" class="pdv-step">
              <v-form ref="formStep3Ref" @submit.stop>
                <ProductDetailsComponent :productInfoForm="productInfoForm" />
              </v-form>
            </div>

            <ProductFormStepFooter :form="productInfoForm" :current="stepper" @navigate="onNavigate" />
          </div>
        </div>
      </div>
    </v-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeMount, nextTick, onBeforeUnmount, onMounted, onActivated, onDeactivated } from 'vue'
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify'

import EkPageHeader from '@/components/page/EkPageHeader.vue'
import ProductFormWizardBar from '@/components/productDefinitions/crud/ProductFormWizardBar.vue'
import ProductFormStepFooter from '@/components/productDefinitions/crud/ProductFormStepFooter.vue'
import ProductCategoryStep from '@/components/productDefinitions/crud/ProductCategoryStep.vue'
import type { ProductFormFeedback } from '@/components/productDefinitions/crud/ProductFormWizardBar.vue'
import { useProductFormPreview } from '@/composables/useProductFormPreview'
import { focusProductField } from '@/composables/productFormFocus'
import type { StepIndex } from '@/composables/useProductFormProgress'
import ProductCompetitivePricesComponent from '@/components/productDefinitions/crud/ProductCompetitivePricesComponent.vue'
import ProductVariantsComponent from '@/components/productDefinitions/variants/ProductVariantsComponent.vue'
import ProductImagesComponent from '@/components/productDefinitions/crud/ProductImagesComponent.vue'
import LoadingComponent from '@/components/LoadingComponent.vue'
import { useChoicesStore } from '@/stores/choicesStore';


import useIntegrations from '@/composables/integrations';
import usePriceCalculator from '@/composables/priceCalculator';
import useFormRules from '@/composables/formrules';
import useRestApi from '@/composables/restapi'
import useBarcode from '@/composables/barcode';
import { ObjectId } from 'bson'
import { useBrandsStore } from '@/stores/brandsStore';
import { useCategoriesStore } from '@/stores/categoriesStore';
import { useIntegrationStore } from '@/stores/integrationStore';
import { EkDialogHost } from '@entegrasyonik/ui/components';
import ProductSingleVariantComponent from '@/components/productDefinitions/variants/ProductSingleVariantComponent.vue';
import ProductDetailsComponent from '@/components/productDefinitions/variants/ProductDetailsComponent.vue';
import ProductInfoFormComponent from '@/components/productDefinitions/crud/ProductInfoFormComponent.vue';
import { useSnackbarStore } from '@/stores/snackbarStore';
const snackbarStore = useSnackbarStore();
import { useCostSave } from '@/composables/useCostSave'
const costSave = useCostSave()


const choicesStore = useChoicesStore()
var choicesStoreChoices: any = ref()
const newVariant: any = ref({})
const stepper = ref(0)
const isStepEditable = ref([false, false, false, false])
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
const priceCalculator = usePriceCalculator()
const barcode = useBarcode()

const generatedVariants: any = ref([])


const dialogAttach: any = ref()
const productInfoFormRef = ref()
const isProductInfoFormValid = ref(false)
const productInfoForm = ref()
const categorySearchText = ref()
const isPlatformPriceDialog = ref(false)
const isCompetitivePricesDialog = ref(false)
const isVariantsDialog = ref(false)
const isVariantsDialog1 = ref(true)
const isImagesDialog = ref(false)
const isPlatformDialog = ref(false)
const loadingComponentRef: any = ref(null)
const ProductImagesComponentRef: any = ref(null)
const productPlatformPriceComponentRef: any = ref(null)
const productCompetitivePricesComponentRef: any = ref(null)
const taxList: any = ref([])
const isAttributesDialog = ref(false)

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


watch(() => productInfoForm.value?.hasVariant, (newValue) => {
  console.log("hasVariant changed", newValue)
  productInfoForm.value.variants = []
})


const checkSingleVariant = () => {
  if (
    productInfoForm.value.hasVariant === false &&
    (!productInfoForm.value?.variants || productInfoForm.value.variants.length === 0)
  ) {
    initSingleVariant()
  }
}

const initSingleVariant = () => {
  productInfoForm.value.variants = [createVariant([])]
}

const rootRef = ref<HTMLElement | null>(null)
const isSaving = ref(false)

// FE R5 B: rayın önizleme kartı + son kayıt denemesinin satır içi geri bildirimi (toast'a ek).
const preview = useProductFormPreview(productInfoForm, () => productInfoForm.value?.tempId)
const saveFeedback = ref<ProductFormFeedback | null>(null)
let feedbackTimer: ReturnType<typeof setTimeout> | undefined
const showFeedback = (value: ProductFormFeedback | null) => {
  clearTimeout(feedbackTimer)
  saveFeedback.value = value
  if (value?.tone === 'success') feedbackTimer = setTimeout(() => { saveFeedback.value = null }, 8000)
}

// Sihirbaz şeridi/altbilgi/eksikler paneli ortak gezinti noktası: adım değişir, isteniyorsa alana odaklanılır.
const onNavigate = async ({ step, field }: { step: StepIndex; field?: string }) => {
  if (saveFeedback.value?.tone === 'error') showFeedback(null)
  if (step === 2) checkSingleVariant()
  stepper.value = step
  await focusProductField(rootRef.value, field)
}

/* watch(() => productInfoForm.value?.hasVariant, (newValue) => {
  if (productInfoForm.value.hasVariant == false) {
    singleVariant.value = createVariant([])
  } else {
    productInfoForm.value.variants = generatedVariants.value
  }
})
 */


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

  return { tempId: generateUUID(), choices: choices, platforms: platforms, images: [], stockcode: '', barcode: '', stock: 0, prices: { isPlatformBasedPrice: false, marketPrice: 100, salePrice: 0 }, shelf: '' }
}
const generateVariants = (newVariants: any) => {
  console.log("newVariants", newVariants)
  const combinations = getCombinations(newVariants)
  for (const combination of combinations) {
    var flag = false
    for (const variant of productInfoForm.value.variants) {
      console.log(variant.choices, combination, areArraysEqual(variant.choices, combination))
      if (areArraysEqual(variant.choices, combination)) {
        flag = true
        break
      }
    }
    if (flag == false)
      productInfoForm.value.variants.push(createVariant(combination))
  }
  /*     var tempChoiceId:any = undefined
    for(const newVariant of newVariants) {
      tempChoiceId = newVariant.choiceId
      for(const choiceValueId of newVariant.choiceValueIds) {
  
      }    
    }   */
}


const computedCols = computed(() => {
  switch (name.value) {
    case 'xs': return 12
    case 'sm': return 12
    case 'md': return 5
    case 'lg': return 5
    case 'xl': return 6
    case 'xxl': return 7
  }
  return 6
})

const computedOuterCols = computed(() => {
  switch (name.value) {
    case 'xs': return 12
    case 'sm': return 12
    case 'md': return 5
    case 'lg': return 5
    case 'xl': return 4
    case 'xxl': return 3
  }
  return 6
})


const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const generateUUID = () => {
  const id = new ObjectId();              // ObjectId nesnesi
  return id.toHexString()
}

const createBarCode = () => {
  /*   productInfoForm.value.barcode = barcode.getBarcode(2) */
  productInfoForm.value.barcode = Date.now()
}

const calculateDesi = () => {
}

const calculateSetMarketPrice = async () => {
  await nextTick(() => { })
  if (!productInfoForm.value.prices.marketPrice && productInfoForm.value.prices.salePrice)
    productInfoForm.value.prices.marketPrice = productInfoForm.value.prices.salePrice
}

const calculateSetSalePrice = async () => {
  await nextTick(() => { })
  productInfoForm.value.prices.price = productInfoForm.value.prices.salePrice * (100 / (100 + productInfoForm.value.taxPercentage))
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
  }
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

const saveProduct = async () => {
  if (isSaving.value) return
  isSaving.value = true
  let guid = loadingComponentRef.value.info(t('loading.info.newProduct'))
  checkVariantAttributes()

  if (productInfoForm.value.hasVariant == false) {
    productInfoForm.value.maincode = generateUUID()
    productInfoForm.value.variants[0].images = productInfoForm.value.images?.map((image: any) => image.url)
  }
  for (const variant of productInfoForm.value.variants) {
    variant.maincode = productInfoForm.value.maincode
  }
  const { images, ...productRequest } = productInfoForm.value
  // PRC-R0: yeni varyantların maliyeti genel kayda GİTMEZ (backend süzer); kayıttan sonra barkodla ayrı yazılır.
  const costDiff = costSave.plan({}, productInfoForm.value.variants)
  let response: any
  const savedTitle = productInfoForm.value.title
  showFeedback(null)
  try {
    response = await restApi.post("ProductService/saveProduct", { productInfo: productRequest })
  } catch (error) {
    showFeedback({ tone: 'error', title: 'Ürün kaydedilemedi', message: 'Bağlantı kurulamadı — bilgileriniz korunuyor, birazdan yeniden deneyin.' })
    throw error
  } finally {
    loadingComponentRef.value.remove(guid)
    isSaving.value = false
  }

  if (response != true) {
    showFeedback({ tone: 'error', title: 'Ürün kaydedilemedi', message: 'Bilgileriniz korunuyor — eksik ya da hatalı alanları düzeltip yeniden deneyin.' })
  }
  if (response == true) {
    showFeedback({ tone: 'success', title: 'Ürün eklendi', message: savedTitle ? `“${savedTitle}” kataloğa kaydedildi; yeni ürün için form temizlendi.` : 'Yeni ürün için form temizlendi.' })
    snackbarStore.addSnackbar({
      show: true,
      text: 'Ürün eklendi',
      timeout: 2000,
      color: 'success'
    })
    await costSave.persist(undefined, costDiff, 'create')
    reset()
  }
}


const retrieveProduct = async () => {
  let guid = loadingComponentRef.value.info('')
  const response = await restApi.post("ProductService/retrieveProduct", { _id: productInfoForm.value._id })
  loadingComponentRef.value.remove(guid)

  if (response && response.product && response.product._id) {
    productInfoForm.value = response.product
    if (productInfoForm.value.prices == undefined) productInfoForm.value.prices = {}
  }
}

const updateProduct = async () => {
  await productInfoFormRef.value?.validate()
  if (isProductInfoFormValid.value == false) return

  if (productInfoForm.value.prices) {
    calculateSetSalePrice()
  }

  let guid = loadingComponentRef.value.info(t('loading.info.updateProduct'))
  const response = await restApi.post("ProductService/updateProduct", { productInfo: productInfoForm.value })
  loadingComponentRef.value.remove(guid)
  if (response && response._id) {
    console.log("updated")
    productInfoForm.value = response
  }
}


onMounted(() => {
  choicesStoreChoices.value = choicesStore.getChoices()
  dialogAttach.value = '.productDefinitionView'
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
  clearTimeout(feedbackTimer)
  productInfoForm.value = null
})




const reset = () => {
  stepper.value = 0
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
    maxPurchaseQuantity: 100,
    shippingDuration: 3,
    variants: [],
    maincode: undefined,
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
    taxPercentage: 20,
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
  initSingleVariant()

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
    retrieveProduct()
  }
}

const activate = async (parameters: any) => {
  console.log("ProductDefinitionView Activated", parameters)
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
  console.log("ProductDefinitionView Destroyed")
  await sleep(20)
  reset()
}



defineExpose({
  initialize,
  activate,
  destroy,
  openTab
});

</script>


<style>
.productDefinitionView {
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
/* Sayfa kenar boşluğu — başlık/adım şeridi/içerik iş alanı kenarına yapışmasın. */
.pdv-root {
  padding: var(--ek-space-2) var(--ek-space-6) var(--ek-space-8);
}

@media (max-width: 599px) {
  .pdv-root {
    padding: var(--ek-space-2) var(--ek-space-4) var(--ek-space-6);
  }
}

/* FE R5 B — ürün rayı + geniş içerik. Kap sorgusu (`pform`): kabuk menüsü açık/kapalı fark etmez, iş alanının
   GERÇEK genişliğine göre düzen seçilir. Dar kap: önizleme → adım şeridi → içerik; durum kartı içeriğin altında
   yapışkan çubuk (ProductFormWizardBar `grid-area: main`, `align-self: end`). Geniş kap (≥ 960px): solda 288px yapışkan
   ray (önizleme · adımlar · durum/Kaydet), sağda içerik. */
.pdv-flow {
  container: pform / inline-size;
  max-width: 1440px;
  margin: var(--ek-space-4) auto 0;
}

.pdv-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: "preview" "nav" "main";
  gap: var(--ek-space-3);
}

.pdv-rail {
  display: contents;
}

.pdv-main {
  grid-area: main;
  min-width: 0;
  /* alttaki yapışkan kayıt çubuğu son içeriği örtmesin */
  padding-bottom: calc(var(--ek-control-h-lg) + var(--ek-space-12));
}

@container pform (max-width: 599px) {
  .pdv-main {
    padding-bottom: calc(var(--ek-control-h-lg) * 2 + var(--ek-space-16));
  }
}

@container pform (min-width: 960px) {
  .pdv-grid {
    grid-template-columns: 288px minmax(0, 1fr);
    grid-template-areas: "rail main";
    align-items: start;
    gap: var(--ek-space-6);
  }

  .pdv-rail {
    position: sticky;
    top: var(--ek-space-4);
    z-index: var(--ek-z-sticky);
    display: flex;
    flex-direction: column;
    gap: var(--ek-space-3);
    grid-area: rail;
  }

  .pdv-main {
    padding-bottom: 0;
  }
}
</style>
