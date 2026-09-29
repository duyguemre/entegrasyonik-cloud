<template>

  <v-card variant="elevated" elevation="0" class="ma-0 pa-0" color="transparent"
    style="transition: none!important; box-shadow: none; transform: none!important;right:0;" height="100%">


    <v-card-title class="d-flex" style="display:block!important">

      <v-row>
        <v-col cols="2">
        </v-col>

        <v-col>
          <v-text-field clearable :rules="formRules.length_0_16" maxlength="20" type="tel" class="mb-3 mt-2"
            density="compact" v-model="productInfoForm.maxPurchaseQuantity" variant="outlined" bg-color="textfieldColor"
            hint="Üründen tek seferde maksimum sipariş edilebilecek miktar" counter>
            <template #label>
              Maksimum Satış Adedi (Varsayılan <span class="font-weight-medium">{{ computedDefaultMaxPurchaseQuantity }}
                Adet</span>)
            </template>
          </v-text-field>
          <v-text-field clearable :rules="formRules.length_0_16" maxlength="20" type="tel" class="mb-3 mt-2"
            density="compact" v-model="productInfoForm.shippingDuration" variant="outlined" bg-color="textfieldColor"
            hint="Ürünün kargoya verilme süresi" counter>
            <template #label>
              Kargo Süresi (Varsayılan <span class="font-weight-medium">{{ computedDefaultShipingDuration }} Gün</span>)
            </template>
          </v-text-field>
          <v-text-field clearable :rules="formRules.length_0_16" maxlength="16" type="tel" class="mb-3 mt-2"
            density="compact" v-model="productInfoForm.desi" variant="outlined" bg-color="textfieldColor"
            hint="Ürünün desi miktarı" counter>
            <template #label>
              Desi (Varsayılan <span class="font-weight-medium">{{ computedDefaultDesi }} dm3</span>)
            </template>
          </v-text-field>
          <v-text-field clearable :rules="formRules.length_0_16" maxlength="16" type="tel" class="mb-3 mt-2"
            density="compact" v-model="productInfoForm.warranty" variant="outlined" bg-color="textfieldColor"
            hint="Ürünün desi miktarı" counter>
            <template #label>
              Garanti Süresi(Varsayılan <span class="font-weight-medium">{{ computedDefaultWarranty }} Ay</span>)
            </template>
          </v-text-field>

          <v-select density="compact" class="customTextField" clearable
            v-model.number="productInfoForm.taxPercentage" item-value="_id" :items="taxList" variant="outlined"
            bg-color="textfieldColor">
            <template #label>
              KDV (Varsayılan <span class="font-weight-medium">%{{ computedDefaultTaxPercentage }}</span>)
            </template>
          </v-select>

        </v-col>
        <v-col cols="2">
        </v-col>

      </v-row>

    </v-card-title>
    <v-card-text class="mt-0 pt-1 vertical-table-container">


    </v-card-text>
  </v-card>

</template>

<script setup lang="ts">
import { ref, onBeforeMount, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n';
import { useStaticsStore } from '@/stores/staticsStore';
import { useIntegrationStore } from '@/stores/integrationStore';

import useFormRules from '@/composables/formrules';

const show = ref(true)
const emits = defineEmits(['refreshImages', 'refreshVariants', 'refreshTotalVariantsStockCount', 'close'])
const staticsStore = useStaticsStore()
const integrationStore = useIntegrationStore()
const taxList = Array.from({ length: 29 }, (_, i) => ({ _id: i + 1, value: i + 1, title: i + 1 }))

const formRules = useFormRules()

var choicesStoreChoices: any = undefined
const loadingComponentRef: any = ref(null)
const isVariantAttributesDialog = ref(false)
const isVariantPlatformPricesDialog = ref(false)

const { t } = useI18n()
const editingVariant: any = ref({})

const props = defineProps<{
  productInfoForm: any
}>()


const computedDefaultTaxPercentage = computed(() => {
  return staticsStore.taxPercentage
})


const computedDefaultWarranty = computed(() => {
  return staticsStore.warranty
})

const computedDefaultDesi = computed(() => {
  return staticsStore.desi
})

const computedDefaultShipingDuration = computed(() => {
  return staticsStore.shippingDuration
})

const computedDefaultMaxPurchaseQuantity = computed(() => {
  return staticsStore.maxPurchaseQuantity
})



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
  const res = Object.values(platforms).reduce((min: any, platform: any) =>
    platform.prices.salePrice && platform.prices.salePrice < min ? platform.prices.salePrice : min, Infinity);
  if (res == Infinity) return 0
  return Number(res)
}
const findMinimumMarketPrice = (platforms: any) => {
  const res = Object.values(platforms).reduce((min: any, platform: any) =>
    platform.prices.marketPrice && platform.prices.marketPrice < min ? platform.prices.marketPrice : min, Infinity);
  if (res == Infinity) return 0
  return Number(res)
}
const findMaximumSalePrice = (platforms: any) => {
  return Number(Object.values(platforms).reduce((max: any, platform: any) =>
    platform.prices.salePrice && platform.prices.salePrice > max ? platform.prices.salePrice : max, 0))
}
const findMaximumMarketPrice = (platforms: any) => {
  return Number(Object.values(platforms).reduce((max: any, platform: any) =>
    platform.prices.marketPrice && platform.prices.marketPrice > max ? platform.prices.marketPrice : max, 0))
}




</script>


<style scoped></style>