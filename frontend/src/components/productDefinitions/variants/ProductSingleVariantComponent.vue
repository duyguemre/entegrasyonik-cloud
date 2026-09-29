<template>

  <v-card variant="elevated" elevation="0" class="ma-0 pa-0" color="transparent"
    style="transition: none!important; box-shadow: none; transform: none!important;right:0;" height="100%">

    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>


    <v-card-title class="d-flex" style="display:block!important">

      <v-row v-if="singleVariant && singleVariant.prices">
        <v-col cols="2">
        </v-col>

        <v-col>
          <v-text-field clearable :rules="formRules.titleRules" maxlength="160" type="tel" class="mb-3 mt-2"
             density="compact" v-model="singleVariant.stockcode"
            variant="outlined" bg-color="textfieldColor"
            :hint="$t('productDefinitions.product.define.productTitleDesc')" counter>
            <template #label>
              Stok Kodu<v-icon size="12" class="mb-2 ml-1">mdi-asterisk</v-icon>
            </template>
          </v-text-field>

          <v-text-field clearable :rules="formRules.titleRules" maxlength="160" type="tel" class="mb-3 mt-2"
             density="compact" v-model="singleVariant.barcode"
            variant="outlined" bg-color="textfieldColor"
            :hint="$t('productDefinitions.product.define.productTitleDesc')" counter>
            <template #label>
              Barkod<v-icon size="12" class="mb-2 ml-1">mdi-asterisk</v-icon>
            </template>
          </v-text-field>


          <div class="d-flex">
            <v-icon class="mr-1 mt-8" style="opacity:.6">mdi-currency-try</v-icon>
            <div style="width:280px!important;min-height:100px;" class="mb-4">

              <div v-if="singleVariant?.prices?.isPlatformBasedPrice == false" style="">
                <div class="d-flex align-center justify-start">
                  <VCurrencyComponentVue v-model="singleVariant.prices.salePrice"
                    :rules="formRules.mandatoryRule" :compact="true"
                    :label="$t('productDefinitions.product.variants.salePrice')" clearable :required="true" class="mt-1"
                    style="max-width:300px">
                  </VCurrencyComponentVue>
                </div>

                <div class="d-flex align-center justify-start">
                  <VCurrencyComponentVue v-model="singleVariant.prices.marketPrice"
                    :rules="formRules.mandatoryRule" :compact="true"
                    :label="$t('productDefinitions.product.variants.marketPrice')" clearable :required="true"
                    class="mt-2" style="max-width:300px">
                  </VCurrencyComponentVue>
                </div>
              </div>
              <template v-else>
                <div @click="isVariantPlatformPricesDialog = true; editingVariant = singleVariant"
                  style="cursor:pointer;width:auto!important;min-width:130px">
                  <div>

                    <div class="font-weight-light text-caption mt-1" style="line-height: .7;font-size:10px!important">
                      Satış Fiyatı
                    </div>
                    <span class="font-weight-bold"> {{
                      formatCurrency(findMinimumSalePrice(singleVariant.platforms)) }} - {{
                        formatCurrency(findMaximumSalePrice(singleVariant.platforms)) }}</span>
                    <div class="font-weight-light text-caption mt-1" style="line-height: .7;font-size:10px!important">
                      Piyasa Fiyatı
                    </div>
                    <span class="font-weight-medium"> {{
                      formatCurrency(findMinimumMarketPrice(singleVariant.platforms)) }} - {{
                        formatCurrency(findMaximumMarketPrice(singleVariant.platforms)) }}</span>
                  </div>
                </div>
              </template>
            </div>

            <v-checkbox :label="$t('productDefinitions.product.platformPrice')" @update:modelValue="" density="compact"
              hide-details v-model="singleVariant.prices.isPlatformBasedPrice" @click.stop
              class="ma-0 ml-12 mb-0 mt-4 pa-0" style="min-width:180px" />


          </div>


          <v-text-field clearable :rules="formRules.titleRules" maxlength="160" type="tel" class="mb-3 mt-2"
            density="compact" v-model="singleVariant.stock"
            variant="outlined" bg-color="textfieldColor"
            :hint="$t('productDefinitions.product.define.productTitleDesc')" counter>
            <template #label>
              Stok Adedi<v-icon size="12" class="mb-2 ml-1">mdi-asterisk</v-icon>
            </template>
          </v-text-field>

          <v-text-field clearable :rules="formRules.titleRules" maxlength="160" type="tel" class="mb-3 mt-2"
            density="compact" v-model="singleVariant.shelf"
            variant="outlined" bg-color="textfieldColor"
            :hint="$t('productDefinitions.product.define.productTitleDesc')" counter>
            <template #label>
              Raf
            </template>
          </v-text-field>


          <v-tooltip location="bottom" open-delay="1000" text="Ürün seçeneğini düzenlemek için basınız">
            <template v-slot:activator="{ props: tooltipProps }">

              <v-btn v-bind="{ ...tooltipProps }" elevation="0" class="ml-7" style="min-width:0;border:1px solid #bbb"
                @click.stop="isVariantAttributesDialog = !isVariantAttributesDialog; editingVariant = singleVariant"
                color="processButtonColor">Ürün Özellikleri</v-btn>
            </template>
          </v-tooltip>

        </v-col>
        <v-col cols="2">
        </v-col>

      </v-row>

    </v-card-title>
    <v-card-text class="mt-0 pt-1 vertical-table-container">

      <div class="d-flex pa-2" style="max-width:900px;display:none!important">
      </div>

      <v-dialog scrim persistent :retain-focus="false" v-model="show" location-strategy="connected" target="cursor"
        no-click-animation :close-on-content-click="false" :attach="dialogAttach"
        style="transition: opacity .1s ease-in!important"
        :style="!isVariantPlatformPricesDialog && !isVariantAttributesDialog ? { 'visibility': 'hidden', 'opacity': '.2!important' } : {}"
        :contained="true" location="left" height="100%" width="100%">


        <keep-alive>
          <ProductVariantAttributesComponent v-model="isVariantAttributesDialog"
            style="transition: opacity .2s ease-in!important" :editingVariant="editingVariant"
            :style="!isVariantAttributesDialog ? { 'opacity': '.2!important' } : {}" key="ProductImagesComponent"
            @close="isVariantAttributesDialog = false" v-if="isVariantAttributesDialog == true"
            :productInfoForm="productInfoForm" />
        </keep-alive>

        <keep-alive>
          <ProductVariantPlatformPricesComponent v-model="isVariantPlatformPricesDialog"
            :editingVariant="editingVariant" style="transition: opacity .2s ease-in!important"
            :style="!isVariantPlatformPricesDialog ? { 'opacity': '.2!important' } : {}" key="ProductImagesComponent"
            @close="isVariantPlatformPricesDialog = false" v-if="isVariantPlatformPricesDialog == true"
            :productInfoForm="productInfoForm" />
        </keep-alive>

      </v-dialog>


    </v-card-text>
  </v-card>

</template>

<script setup lang="ts">
import { ref, onBeforeMount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n';
import LoadingComponent from '@/components/LoadingComponent.vue'

import useFormRules from '@/composables/formrules';
import VCurrencyComponentVue from '@/components/VCurrencyComponent.vue';
import ProductVariantAttributesComponent from './ProductVariantAttributesComponent.vue';
import ProductVariantPlatformPricesComponent from './ProductVariantPlatformPricesComponent.vue';

const show = ref(true)
const emits = defineEmits(['refreshImages', 'refreshVariants', 'refreshTotalVariantsStockCount', 'close'])

const formRules = useFormRules()

var choicesStoreChoices: any = undefined
const loadingComponentRef: any = ref(null)
const isVariantAttributesDialog = ref(false)
const isVariantPlatformPricesDialog = ref(false)

const { t } = useI18n()
const editingVariant: any = ref({})

const props = defineProps<{
  productInfoForm: any,
  singleVariant: any,
  dialogAttach: any
}>()

const formatCurrency = (number: number) => {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(number))
}


onBeforeMount(() => {
})

onMounted(() => {
})

const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}




const findMinimumSalePrice = (platforms: any) => {
  if(!platforms) return 0
  const res = Object.values(platforms).reduce((min: any, platform: any) =>
    platform.prices.salePrice && platform.prices.salePrice < min ? platform.prices.salePrice : min, Infinity);
  if (res == Infinity) return 0
  return Number(res)
}
const findMinimumMarketPrice = (platforms: any) => {
  if(!platforms) return 0
  const res = Object.values(platforms).reduce((min: any, platform: any) =>
    platform.prices.marketPrice && platform.prices.marketPrice < min ? platform.prices.marketPrice : min, Infinity);
  if (res == Infinity) return 0
  return Number(res)
}
const findMaximumSalePrice = (platforms: any) => {
  if(!platforms) return 0
  return Number(Object.values(platforms).reduce((max: any, platform: any) =>
    platform.prices.salePrice && platform.prices.salePrice > max ? platform.prices.salePrice : max, 0))
}
const findMaximumMarketPrice = (platforms: any) => {
  if(!platforms) return 0
  return Number(Object.values(platforms).reduce((max: any, platform: any) =>
    platform.prices.marketPrice && platform.prices.marketPrice > max ? platform.prices.marketPrice : max, 0))
}




</script>


<style scoped></style>