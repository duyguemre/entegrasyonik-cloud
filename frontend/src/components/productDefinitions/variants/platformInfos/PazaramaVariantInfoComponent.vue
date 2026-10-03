<template>

  <v-card variant="elevated" elevation="0" class="ma-0 mt-2 pa-0" color="transparent"
    style="transition: none!important; box-shadow: none; transform: none!important;right:0;">


    <v-card-title class="d-flex" style="display:block!important">

      <v-row>

        <v-col cols="12" md="4" sm="6" lg="3" xl="2">
          <v-select item-value="id" item-title="name" @click.stop style="min-width:200px" v-if="shipments"
            v-model="variantPlatformInfo.shippingId" label="Teslimat Şekli" :items="computedDeliveryOptions"
            density="compact" class="" variant="outlined" bg-color="textfieldColor" clearable>
            <template #label>
              Teslimat Şekli (Varsayılan <span class="font-weight-medium">{{ computedDefaultShipment }}</span>)
            </template>
          </v-select>
        </v-col>

        <v-col cols="12" md="4" sm="6" lg="3" xl="2">
          <v-select multiple item-value="id" item-title="name" @click.stop style="min-width:200px" v-if="shipments"
            v-model="variantPlatformInfo.cities" label="Teslimat Şehirleri" :items="shipments.cities" density="compact"
            class="" variant="outlined" bg-color="textfieldColor" clearable>
            <template #label>
              Teslimat Şehirleri (Varsayılan <span class="font-weight-medium">{{ computedDefaultCities }}</span>)
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

const show = ref(true)
const emits = defineEmits(['refreshImages', 'refreshVariants', 'refreshTotalVariantsStockCount', 'close'])
const staticsStore = useStaticsStore()
const integrationStore = useIntegrationStore()

const formRules = useFormRules()

var choicesStoreChoices: any = undefined
const loadingComponentRef: any = ref(null)
const isVariantAttributesDialog = ref(false)
const isVariantPlatformPricesDialog = ref(false)
const shipments: any = ref()
const { t } = useI18n()
const variantPlatformInfo: any = defineModel({ default: {} })
const integrationCode = "pazarama"
const props = defineProps<{
  productInfoForm: any
}>()


const computedClientMarketplace = computed(() => {
  return integrationStore.getClientIntegration(integrationCode)
})

const computedDefaultShipment = computed(() => {
  return computedDeliveryOptions.value.find((item: any) => item.id === computedClientMarketplace.value?.settings?.shipmentId)?.name
})

const computedDefaultCities = computed(() => {
  return shipments.value?.cities
    .filter((item: any) =>
      computedClientMarketplace.value?.settings?.cities?.includes(item.id)
    )
    .map((item: any) => item.name)
    .join(', ');
})

const computedDefaultDesi = computed(() => {
  return props.productInfoForm.desi ? props.productInfoForm.desi : computedClientMarketplace.value?.settings?.desi ? computedClientMarketplace.value?.settings?.desi : staticsStore.desi
})

const computedDefaultMaxPurchaseQuantity = computed(() => {
  return props.productInfoForm.maxPurchaseQuantity ? props.productInfoForm.maxPurchaseQuantity : computedClientMarketplace.value?.settings?.maxPurchaseQuantity ? computedClientMarketplace.value?.settings?.maxPurchaseQuantity : staticsStore.maxPurchaseQuantity
})

const computedDeliveryOptions = computed(() => {
  if (!shipments.value?.deliveries) return []
  return Object.entries(shipments.value?.deliveries)
    .filter(([key, value]: any) =>
      value && typeof value === 'object' && 'id' in value && value.id !== '00000000-0000-0000-0000-000000000000'
    )
    .map(([key, value]: any) => ({
      name: key,
      id: value.id
    }));
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


</script>


<style scoped></style>