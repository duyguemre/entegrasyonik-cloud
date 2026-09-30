<template>

  <v-card variant="elevated" elevation="0" class="vinfo-card ma-2 pa-0" color="transparent">
    <v-card-title class="vinfo-title d-flex">
      <v-row>
        <v-col cols="12" md="4" sm="6" lg="3" xl="2">
          <v-select density="compact" class="" :items="shipments" item-title="templateName" item-value="templateName"
            v-model="variantPlatformInfo.shippingId" variant="outlined">
            <template #label>
              Ön Tanımlı Kargo Şablonu (Varsayılan <span class="font-weight-medium">{{ computedDefaultShipment
                }}</span>)
            </template>

          </v-select>
        </v-col>
      </v-row>

    </v-card-title>
  </v-card>

</template>

<script setup lang="ts">
import { formatMoney } from '@/composables/format'
import { ref, onBeforeMount, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n';
import { useStaticsStore } from '@/stores/staticsStore';
import { useIntegrationStore } from '@/stores/integrationStore';

import useFormRules from '@/composables/formrules';

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
const integrationCode = "n11"
const props = defineProps<{
  productInfoForm: any
}>()

const formatCurrency = (number: number) => {
  return formatMoney(Number(number))
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
  shipments.value = await integrationStore.retrievePlatformInfos('n11')
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


<style scoped>
.vinfo-card {
  transition: none !important;
  box-shadow: none;
  transform: none !important;
  right: 0;
}

.vinfo-title {
  display: block !important;
}
</style>