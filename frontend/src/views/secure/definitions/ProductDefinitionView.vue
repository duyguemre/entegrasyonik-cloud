<template>
  <div class="productDefinitionView">
    <!-- ek-pattern-exception: EkWizardTemplate — bu ekran çok adımlı bir sihirbaz değil,
         kendi adım/gezinme+Kaydet şeridini taşıyan mevcut bir `v-stepper`dir (ADR-0015
         Karar 6, B5-1); yapısal göç ayrı ve daha riskli bir iş olduğu için bu turda
         yalnızca EkPageHeader eklenip mevcut stepper token'larla yenilendi. -->
    <EkPageHeader
      section="Katalog"
      :title="$t('definitions.product.create.title')"
      :description="$t('definitions.product.create.description')"
    />

    <ProductCompetitivePricesComponent v-model="isCompetitivePricesDialog" ref="productCompetitivePricesComponentRef"
      :productInfoForm="productInfoForm" v-if="isCompetitivePricesDialog" />

    <LoadingComponent attach=".productDefinitionView" ref="loadingComponentRef"></LoadingComponent>

    <v-dialog scrim persistent :retain-focus="false" v-model="show" location-strategy="connected" target="cursor"
      no-click-animation :close-on-content-click="false" :attach="dialogAttach"
      style="transition: opacity .1s ease-in!important"
      :style="!isImagesDialog ? { 'visibility': 'hidden', 'opacity': '.2!important' } : {}" :contained="true"
      location="left" height="100%" width="100%">

      <keep-alive>
        <ProductImagesComponent v-model="isImagesDialog" style="transition: opacity .2s ease-in!important"
          :style="!isImagesDialog ? { 'opacity': '.2!important' } : {}" key="ProductImagesComponent"
          @close="isImagesDialog = false" v-if="isImagesDialog == true" :productInfoForm="productInfoForm" />

      </keep-alive>

    </v-dialog>

    <v-form @keydown.enter.prevent @submit.prevent ref="productInfoFormRef" v-model="isProductInfoFormValid">

      <div class="mt-2">
        <v-stepper bg-color="transparent" style="border:none!important"
          class="custom-stepper ml-1 mr-0 flex-grow-1 productDefinition-stepper" elevation="0" v-model="stepper">

          <v-stepper-header style="height:40px!important" class="">
            <v-stepper-item @click="stepper = 0" title="Kategori Seçimi" value="1" :complete="stepper > 0" editable
              color="primary">
            </v-stepper-item>
            <v-divider class="mr-1 ml-1" color="border-default" opacity="1"></v-divider>
            <v-stepper-item @click="stepper = 1" title="Ürün Tanımı" value="2" :complete="stepper > 1"
              :editable="productInfoForm.category != undefined" color="primary"></v-stepper-item>
            <v-divider class="mr-1 ml-1" color="border-default" opacity="1"></v-divider>
            <v-stepper-item @click="stepper = 2; checkSingleVariant()" value="3" :complete="stepper > 2"
              :editable="isVariantInfoEditable()" color="primary">
              <template v-slot:title>
                <span v-if="productInfoForm.hasVariant">Varyant Bilgileri</span>
                <span v-else>Tekil Ürün Bilgisi</span>
              </template>
            </v-stepper-item>
            <v-divider class="mr-1 ml-1" color="border-default" opacity="1"></v-divider>
            <v-stepper-item @click="stepper = 3" title="Detay Bilgiler" value="4" :complete="stepper > 3"
              :editable="productInfoForm.title?.length > 2" color="primary"></v-stepper-item>
            <v-divider class="mr-1 ml-1" color="border-default" opacity="1"></v-divider>
            <v-btn-group elevation="0" class="ma-0 mr-4"
              style="height:40px;border:0px solid white;min-width:113px!important;margin-top:0px" density="compact">
              <v-btn class="fill-height" color="primary" @click="saveProduct" :disabled="isSaveDisabled()"
                style="height:40px;min-width:0;padding:0;width:100%">
                <span class="">
                  Kaydet
                </span></v-btn>
            </v-btn-group>
          </v-stepper-header>
        </v-stepper>

        <div style="height:30px"></div>

        <div v-if="stepper == 0">
          <v-row>
            <v-col :cols="2">
            </v-col>
            <v-col>
              <v-form ref="formStep0Ref" @submit.stop>
                <CategorySelectBoxLevelComponent v-model="productInfoForm.category" />
              </v-form>
            </v-col>
            <v-col :cols="2">
            </v-col>
          </v-row>
        </div>


        <div v-if="stepper == 1">
          <v-form ref="formStep1Ref" @submit.stop>

            <v-btn :disabled="!productInfoForm.tempId" density="compact" elevation="0" class=" ml-12"
              style="position:absolute;top:100px;z-index:1;min-width:0!important;padding:2px;width:193px;height:216px;border:1px solid var(--ek-color-border-default)"
              color="surface" @click="isImagesDialog = true">
              <v-row>
                <v-col>
                  <div v-if="productInfoForm.images == undefined || !productInfoForm.images[0]">
                    <v-icon size="180" style="opacity:.5" color="content-muted">mdi-image-outline</v-icon>
                  </div>
                  <div v-else>
                    <div style="width:189px;height:191px;background-color:white;" class="d-flex">
                      <ProductImageComponent v-model="productInfoForm.images[0]" :productId="productInfoForm.tempId"
                        :height="187">
                      </ProductImageComponent>
                    </div>
                  </div>
                  Resim Galerisi <span class="text-caption" v-if="productInfoForm.images">({{
                    productInfoForm.images?.length }})</span>
                </v-col>
              </v-row>
            </v-btn>
            <v-row>
              <v-col :cols="2">
              </v-col>
              <v-col class="pb-0">
                <div class="d-flex mt-2">
                  <div style="width:270px!important">
                    <v-radio-group inline v-model="productInfoForm.hasVariant">
                      <v-radio :value=false
                        :label="$t('productDefinitions.product.define.withoutVariant')">
                      </v-radio>
                      <v-radio :value=true
                        :label="$t('productDefinitions.product.define.withVariant')">
                      </v-radio>
                    </v-radio-group>
                  </div>
                  <v-text-field class="customTextField mb-0" clearable maxlength="32" type="tel"
                    v-if="productInfoForm.hasVariant" :rules="formRules.stockcodeRules" density="compact"
                    v-model="productInfoForm.maincode" variant="outlined"
                    :hint="$t('productDefinitions.product.define.maincodeDesc')" counter>
                    <template #label>
                      {{ $t('productDefinitions.product.define.maincode') }}<v-icon size="12"
                        class="mb-2 ml-1">mdi-asterisk</v-icon>
                    </template>
                  </v-text-field>
                </div>
              </v-col>
              <v-col :cols="2">
              </v-col>
            </v-row>
            <v-row>
              <v-col :cols="2">
              </v-col>
              <v-col>
                <BrandSelectBoxComponent v-model="productInfoForm.brand" :mandatory="true" class="mt-0" />
                <v-text-field class="customTextField mb-3 mt-2" clearable :rules="formRules.titleRules" maxlength="160"
                  type="tel" density="compact" v-model="productInfoForm.title" variant="outlined"
                  :hint="$t('productDefinitions.product.define.productTitleDesc')" counter>
                  <template #label>
                    {{ $t('productDefinitions.product.define.productTitle') }}<v-icon size="12"
                      class="mb-2 ml-1">mdi-asterisk</v-icon>
                  </template>
                </v-text-field>
                <div class="d-flex ml-0">
                  <div style="height:385px;width:100%">
                    <QuillEditor v-model:content="productInfoForm.description" content-type="html" theme="snow"
                      :toolbar="quillToolbar" />
                  </div>
                </div>
              </v-col>
              <v-col :cols="2">
              </v-col>
            </v-row>
          </v-form>
        </div>


        <temnplate v-if="stepper == 2">
          <v-form ref="formStep2Ref" @submit.stop>
            <temnplate v-if="productInfoForm.hasVariant">
              <ProductVariantsComponent v-model="isVariantsDialog1" :productInfoForm="productInfoForm"
                style="transition: opacity .2s ease-in!important"
                :style="!isVariantsDialog1 ? { 'opacity': '.2!important' } : {}" key="ProductVariantsComponent"
                @close="isVariantsDialog1 = false" v-if="isVariantsDialog1 == true" @refresh-images="refreshImages"
                :dialogAttach="'.productDefinitionView'" @refresh-variants="refreshVariants" />
            </temnplate>
            <temnplate v-else>

              <ProductSingleVariantComponent v-model="isVariantsDialog1" :productInfoForm="productInfoForm"
                :single-variant="productInfoForm.variants[0]" style="transition: opacity .2s ease-in!important"
                :style="!isVariantsDialog1 ? { 'opacity': '.2!important' } : {}" key="ProductVariantsComponent"
                @close="isVariantsDialog1 = false" v-if="isVariantsDialog1 == true" @refresh-images="refreshImages"
                :dialogAttach="'.productDefinitionView'" @refresh-variants="refreshVariants" />
            </temnplate>
          </v-form>
        </temnplate>

        <div v-if="stepper == 3">
          <v-row>
            <v-col :cols="2">
            </v-col>
            <v-col>
              <v-form ref="formStep0Ref" @submit.stop>
                <ProductDetailsComponent :productInfoForm="productInfoForm" />
              </v-form>
            </v-col>
            <v-col :cols="2">
            </v-col>
          </v-row>
        </div>
      </div>
    </v-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeMount, nextTick, onBeforeUnmount, onMounted, onActivated, onDeactivated } from 'vue'
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify'

import EkPageHeader from '@/components/ds/EkPageHeader.vue'
import ProductCompetitivePricesComponent from '@/components/productDefinitions/crud/ProductCompetitivePricesComponent.vue'
import ProductVariantsComponent from '@/components/productDefinitions/variants/ProductVariantsComponent.vue'
import ProductImagesComponent from '@/components/productDefinitions/crud/ProductImagesComponent.vue'
import LoadingComponent from '@/components/LoadingComponent.vue'
import BrandSelectBoxComponent from '@/components/common/BrandSelectBoxComponent.vue'
import ProductImageComponent from '@/components/productDefinitions/products/ProductImageComponent.vue'
import { useChoicesStore } from '@/stores/choicesStore';


import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';
import useIntegrations from '@/composables/integrations';
import usePriceCalculator from '@/composables/priceCalculator';
import useFormRules from '@/composables/formrules';
import useRestApi from '@/composables/restapi'
import useBarcode from '@/composables/barcode';
import { ObjectId } from 'bson'
import { useBrandsStore } from '@/stores/brandsStore';
import { useCategoriesStore } from '@/stores/categoriesStore';
import { useIntegrationStore } from '@/stores/integrationStore';
import CategorySelectBoxLevelComponent from '@/components/CategorySelectBoxLevelComponent.vue';
import ProductSingleVariantComponent from '@/components/productDefinitions/variants/ProductSingleVariantComponent.vue';
import ProductDetailsComponent from '@/components/productDefinitions/variants/ProductDetailsComponent.vue';
import { useSnackbarStore } from '@/stores/snackbarStore';
const snackbarStore = useSnackbarStore();


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
const show = ref(true)
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

const isVariantInfoEditable = () => {
  if (productInfoForm.value.title?.length > 3 && productInfoForm.value.hasVariant == false)
    return true
  else if (productInfoForm.value.title?.length > 3 && productInfoForm.value.maincode)
    return true
  return false
}

const isSaveDisabled = () => {
  if (productInfoForm.value.category && productInfoForm.value.brand) {
    if (productInfoForm.value.variants?.length > 0) {
      const unFinishedVariant = productInfoForm.value.variants.find((variant: any) => !variant.barcode || !variant.stockcode)
      if (!unFinishedVariant) {
        return false
      }
    }
  }
  return true
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
  const response = await restApi.post("ProductService/saveProduct", { productInfo: productRequest })
  loadingComponentRef.value.remove(guid)

  if (response == true) {
    snackbarStore.addSnackbar({
      show: true,
      text: 'Ürün eklendi',
      timeout: 2000,
      color: 'success'
    })
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

.productDefinition-stepper .v-stepper-header {
  box-shadow: none;
}

/* .productDefinitionView .v-overlay__content {
  width:100%!important
}
 */
</style>
