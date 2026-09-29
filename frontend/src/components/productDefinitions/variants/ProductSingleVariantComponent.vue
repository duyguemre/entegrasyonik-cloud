<template>

  <v-card variant="elevated" elevation="0" class="ma-0 pa-0 psvc-s1" color="transparent" height="100%">

    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>


    <v-card-title class="d-flex psvc-s2">

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
            <v-icon class="mr-1 mt-8 psvc-s3">mdi-currency-try</v-icon>
            <div class="mb-4 psvc-s4">

              <div v-if="singleVariant?.prices?.isPlatformBasedPrice == false">
                <div class="d-flex align-center justify-start">
                  <VCurrencyComponentVue v-model="singleVariant.prices.salePrice"
                    :rules="formRules.mandatoryRule" :compact="true"
                    :label="$t('productDefinitions.product.variants.salePrice')" clearable :required="true" class="mt-1 psvc-s5">
                  </VCurrencyComponentVue>
                </div>

                <div class="d-flex align-center justify-start">
                  <VCurrencyComponentVue v-model="singleVariant.prices.marketPrice"
                    :rules="formRules.mandatoryRule" :compact="true"
                    :label="$t('productDefinitions.product.variants.marketPrice')" clearable :required="true"
                    class="mt-2 psvc-s5">
                  </VCurrencyComponentVue>
                </div>
              </div>
              <template v-else>
                <div @click="isVariantPlatformPricesDialog = true; editingVariant = singleVariant" class="psvc-s6">
                  <div>

                    <div class="font-weight-light text-caption mt-1 psvc-s7">
                      Satış Fiyatı
                    </div>
                    <span class="font-weight-bold"> {{
                      formatCurrency(findMinimumSalePrice(singleVariant.platforms)) }} - {{
                        formatCurrency(findMaximumSalePrice(singleVariant.platforms)) }}</span>
                    <div class="font-weight-light text-caption mt-1 psvc-s7">
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
              class="ma-0 ml-12 mb-0 mt-4 pa-0 psvc-s8" />


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

              <v-btn v-bind="{ ...tooltipProps }" elevation="0" class="ml-7 psvc-s9"
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

      <div class="d-flex pa-2 psvc-s10">
      </div>

      <v-dialog scrim persistent :retain-focus="false" v-model="show" location-strategy="connected" target="cursor"
        no-click-animation :close-on-content-click="false" :attach="dialogAttach"
        :contained="true" location="left" height="100%" width="100%" class="psvc-s11" :class="{ 'psvc-dialog-idle': !isVariantPlatformPricesDialog && !isVariantAttributesDialog }">


        <keep-alive>
          <ProductVariantAttributesComponent v-model="isVariantAttributesDialog" :editingVariant="editingVariant" key="ProductImagesComponent"
            @close="isVariantAttributesDialog = false" v-if="isVariantAttributesDialog == true"
            :productInfoForm="productInfoForm" class="psvc-s11" :class="{ 'psvc-dim': !isVariantAttributesDialog }" />
        </keep-alive>

        <keep-alive>
          <ProductVariantPlatformPricesComponent v-model="isVariantPlatformPricesDialog"
            :editingVariant="editingVariant" key="ProductImagesComponent"
            @close="isVariantPlatformPricesDialog = false" v-if="isVariantPlatformPricesDialog == true"
            :productInfoForm="productInfoForm" class="psvc-s11" :class="{ 'psvc-dim': !isVariantPlatformPricesDialog }" />
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

<style>
/* ADR-0015 B5-2 — satir ici stillerden tasinan siniflar (autostyle). Satir ici stilin onceligi
   !important ile korunur; ayni ozellikte Vuetify yardimci sinifi/`color` prop cakismasi varsa
   (satir ici stil zaten yeniliyordu) !important eklenmez. Scope'suz: v-dialog/v-menu ve alt
   bilesen kokleri scoped ozniteligi almayabilir; onek dosyaya ozgudur. */
.psvc-s1 {
  transition: none !important;
  box-shadow: none !important;
  transform: none !important;
  right: 0 !important;
}

.psvc-s2 {
  display: block !important;
}

.psvc-s3 {
  opacity: .6 !important;
}

.psvc-s4 {
  width: 280px !important;
  min-height: 100px !important;
}

.psvc-s5 {
  max-width: 300px !important;
}

.psvc-s6 {
  cursor: pointer !important;
  width: auto !important;
  min-width: 130px !important;
}

.psvc-s7 {
  line-height: .7;
  font-size: 10px !important;
}

.psvc-s8 {
  min-width: 180px !important;
}

.psvc-s9 {
  min-width: 0 !important;
  border: 1px solid var(--ek-color-border-strong) !important;
}

.psvc-s10 {
  max-width: 900px !important;
  display: none !important;
}

.psvc-s11 {
  transition: opacity var(--ek-duration-base) var(--ek-easing-standard) !important;
}

/* Onceki dinamik satir ici stiller (v-dialog koku fragment -> scope'suz). */
.psvc-dialog-idle {
  visibility: hidden !important;
  opacity: .2 !important;
}

.psvc-dim {
  opacity: .2 !important;
}
</style>
