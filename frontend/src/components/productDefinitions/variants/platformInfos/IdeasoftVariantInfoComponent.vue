<template>

  <v-card variant="elevated" elevation="0" class="ma-0 mt-2 pa-0" color="transparent"
    style="transition: none!important; box-shadow: none; transform: none!important;right:0;">


    <v-card-title class="d-flex" style="display:block!important">

      <v-row>
        <v-col cols="12" md="4" sm="6" lg="3" xl="2">
          <v-select clearable density="compact" v-model="variantPlatformInfo.stockTypeLabel" variant="outlined"
            :items="staticsStore.ideasoft.stockTypeLabelOptions" class="mr-1 customTextField">
            <template #label>
              Ürünün Stok Tipi (Varsayılan <span class="font-weight-medium">{{ computedDefaultStockTypeLabel }}</span>)
            </template>

          </v-select>
        </v-col>

        <v-col cols="12" md="4" sm="6" lg="3" xl="2">

          <v-select clearable density="compact" v-model="variantPlatformInfo.hasGift" variant="outlined" :items="[
            { title: 'Hediyesiz', value: 0 },
            { title: 'Hediyeli', value: 1 }
          ]" class="ml-1 customTextField">
            <template #label>
              Hediye Durumu (Varsayılan <span class="font-weight-medium">{{ computedDefaultHasGift == 1 ? 'Hediyeli' :
                'Hediyesiz' }}</span>)
            </template>
          </v-select>

        </v-col>

        <v-col cols="12" md="4" sm="6" lg="3" xl="2">

          <VCurrencyComponentVue :null-to-empty="true" @click.stop v-model="variantPlatformInfo.customShippingCost"
            :compact="true" clearable :isIconExist="false" :required="false" class="ml-1" style="min-width:200px">
            <template #label>
              Varsayılan Kargo Ücreti (Varsayılan <span class="font-weight-medium">{{ computedDefaultCustomShippingCost
                }}</span>)
            </template>
          </VCurrencyComponentVue>


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
import VCurrencyComponentVue from '@/components/VCurrencyComponent.vue';

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
const integrationCode = "trendyol"
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
  return shipments.value.find((item: any) => item.id == computedClientMarketplace.value?.settings?.shippingId)?.name
})

const computedDefaultFastDeliveryType = computed(() => {
  return staticsStore.fastDeliveryTypes.find((item: any) => item.id == computedClientMarketplace.value?.settings?.fastDeliveryType)?.name
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

const computedDefaultStockTypeLabel = computed(() => {
  const value = computedClientMarketplace.value?.settings?.stockTypeLabel ? computedClientMarketplace.value?.settings?.stockTypeLabel : staticsStore.ideasoft.defaults.stockTypeLabel
  const item: any = staticsStore.ideasoft.stockTypeLabelOptions.find((item: any) => item.value == value)
  return item.title
})

const computedDefaultHasGift = computed(() => {
  return computedClientMarketplace.value?.settings?.hasGift ? computedClientMarketplace.value?.settings?.hasGift : staticsStore.ideasoft.defaults.hasGift
})

const computedDefaultCustomShippingCost = computed(() => {
  return computedClientMarketplace.value?.settings?.customShippingCost ? computedClientMarketplace.value?.settings?.customShippingCost : staticsStore.ideasoft.defaults.customShippingCost
})


const computedMaxPurchaseQuantity = computed(() => {
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
  shipments.value = await integrationStore.retrievePlatformInfos('trendyol')
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