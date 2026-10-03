<template>
  <v-card variant="elevated" elevation="0" class="ma-0 pa-0" color="transparent"
    style="transition: none!important; box-shadow: none; transform: none!important;right:0;">

    <v-card-title class="d-flex" style="display:block!important">

      <v-row>
        <v-col cols="12" sm="12" md="8" lg="6" xl="4" class="pb-0">
          <v-text-field clearable :rules="formRules.length_0_16" maxlength="20" type="tel" class="" density="compact"
            v-model="variantPlatformInfo.title" variant="outlined" bg-color="textfieldColor"
            :hint="'Varsayılan ' + productInfoForm.title">
            <template #label>
              Variant Başlık (Varsayılan <span class="font-weight-medium">{{ productInfoForm.title }}</span>)
            </template>
          </v-text-field>

        </v-col>
        <v-col cols="12" sm="6" md="4" lg="3" xl="2" class="pb-0">
          <v-text-field clearable :rules="formRules.length_0_16" maxlength="20" type="tel" class="" density="compact"
            v-model="variantPlatformInfo.shippingDuration" variant="outlined" bg-color="textfieldColor"
            :hint="'Varsayılan ' + computedDefaultShipingDuration + '  gün'">
            <template #label>
              Kargo Süresi (Varsayılan <span class="font-weight-medium">{{ computedDefaultShipingDuration }} Gün</span>)
            </template>
          </v-text-field>

        </v-col>
        <v-col cols="12" sm="6" md="4" lg="3" xl="2" class="pb-0">
          <v-text-field clearable :rules="formRules.length_0_16" maxlength="16" type="tel" class="" density="compact"
            v-model="variantPlatformInfo.desi" variant="outlined" bg-color="textfieldColor"
            :hint="'Varsayılan ' + computedDefaultDesi + ' dm³'">
            <template #label>
              Desi (Varsayılan <span class="font-weight-medium">{{ computedDefaultDesi }} dm³</span>)
            </template>
          </v-text-field>

        </v-col>

        <v-col cols="12" sm="6" md="4" lg="3" xl="2" class="pb-0">

          <v-text-field clearable :rules="formRules.length_0_16" maxlength="16" type="tel" class="" density="compact"
            v-model="variantPlatformInfo.warranty" variant="outlined" bg-color="textfieldColor"
            :hint="'Varsayılan ' + computedDefaultWarranty + ' Ay'">
            <template #label>
              Garanti Süresi (Varsayılan <span class="font-weight-medium">{{ computedDefaultWarranty }} Ay</span>)
            </template>
          </v-text-field>


        </v-col>
        <v-col cols="12" sm="6" md="4" lg="3" xl="2" class="pb-0">
          <v-text-field clearable :rules="formRules.length_0_16" maxlength="16" type="tel" class="" density="compact"
            v-model="variantPlatformInfo.maxPurchaseQuantity" variant="outlined" bg-color="textfieldColor"
            :hint="'Varsayılan ' + computedDefaultMaxPurchaseQuantity + ' Adet'">
            <template #label>
              Maksimum Satılabilir Adet (Varsayılan <span class="font-weight-medium">{{
                computedDefaultMaxPurchaseQuantity }} Adet</span>)
            </template>
          </v-text-field>
        </v-col>


        <v-col cols="12" sm="6" md="4" lg="3" xl="2" class="pb-0">
          <v-select :rules="formRules.mandatoryRule" density="compact" class="customTextField"
            v-model.number="productInfoForm.taxPercentage" item-value="_id" :items="taxList" variant="outlined"
            bg-color="textfieldColor">
            <template #label>
              {{ $t('productDefinitions.product.define.taxPercentage')
              }}
            </template>
          </v-select>
        </v-col>



      </v-row>

    </v-card-title>
  </v-card>

</template>

<script setup lang="ts">
import { ref, onBeforeMount, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n';
import { useStaticsStore } from '@/stores/staticsStore';
import { useIntegrationStore } from '@/stores/integrationStore';

import useFormRules from '@/composables/formrules';
const taxList = Array.from({ length: 29 }, (_, i) => ({ _id: i + 1, value: i + 1, title: i + 1 }))

const show = ref(true)
const emits = defineEmits(['refreshImages', 'refreshVariants', 'refreshTotalVariantsStockCount', 'close'])
const staticsStore = useStaticsStore()
const integrationStore = useIntegrationStore()

const formRules = useFormRules()

var choicesStoreChoices: any = undefined
const loadingComponentRef: any = ref(null)
const isVariantAttributesDialog = ref(false)
const isVariantPlatformPricesDialog = ref(false)
const shipments: any = ref([])
const { t } = useI18n()
const variantPlatformInfo: any = defineModel({ default: {} })
const integrationCode = "hepsiburada"
const props = defineProps<{
  productInfoForm: any
}>()

const formatCurrency = (number: number) => {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(number))
}


const computedClientMarketplace = computed(() => {
  return integrationStore.getClientIntegration(integrationCode)
})

const computedDefaultShipment = computed(() => {
  return shipments.value.find((item: any) => item.templateName == computedClientMarketplace.value?.settings?.shippingId)?.templateName
})


const computedDefaultShipingDuration = computed(() => {
  return props.productInfoForm.shippingDuration ? props.productInfoForm.shippingDuration : computedClientMarketplace.value?.settings?.shippingDuration ? computedClientMarketplace.value?.settings?.shippingDuration : staticsStore.shippingDuration
})

const computedDefaultDesi = computed(() => {
  return props.productInfoForm.desi ? props.productInfoForm.desi : computedClientMarketplace.value?.settings?.desi ? computedClientMarketplace.value?.settings?.desi : staticsStore.desi
})

const computedDefaultWarranty = computed(() => {
  return props.productInfoForm.warranty ? props.productInfoForm.warranty : computedClientMarketplace.value?.settings?.warranty ? computedClientMarketplace.value?.settings?.warranty : staticsStore.warranty
})

const computedDefaultMaxPurchaseQuantity = computed(() => {
  return props.productInfoForm.maxPurchaseQuantity ? props.productInfoForm.maxPurchaseQuantity : computedClientMarketplace.value?.settings?.maxPurchaseQuantity ? computedClientMarketplace.value?.settings?.maxPurchaseQuantity : staticsStore.maxPurchaseQuantity
})



onBeforeMount(() => {
})

onMounted(() => {
  retrieveShipments()
})

const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}


const retrieveShipments = async () => {
  shipments.value = await integrationStore.retrievePlatformInfos(integrationCode)
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