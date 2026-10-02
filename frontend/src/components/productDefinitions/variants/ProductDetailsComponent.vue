<template>
  <ProductStepCard :step="4" title="Detay bilgiler" icon="mdi-package-variant-closed"
    description="Bu adımdaki tüm alanlar isteğe bağlıdır; boş bırakılanlarda pazaryeri ayarlarındaki varsayılanlar kullanılır.">
    <ProductFormSection title="Satış ve kargo" icon="mdi-truck-fast-outline" description="Sipariş sınırı ve kargoya verilme süresi.">
      <v-text-field clearable :rules="formRules.length_0_16" maxlength="20" type="tel" counter
        v-model="productInfoForm.maxPurchaseQuantity" label="Maksimum Satış Adedi"
        :hint="`Tek seferde sipariş edilebilecek en fazla miktar · varsayılan ${computedDefaultMaxPurchaseQuantity} adet`"
        persistent-hint />
      <v-text-field clearable :rules="formRules.length_0_16" maxlength="20" type="tel" counter
        v-model="productInfoForm.shippingDuration" label="Kargo Süresi"
        :hint="`Ürünün kargoya verilme süresi · varsayılan ${computedDefaultShipingDuration} gün`" persistent-hint />
    </ProductFormSection>
    <ProductFormSection title="Ölçü, garanti ve vergi" icon="mdi-ruler-square" :columns="3" description="Kargo ücreti desiye göre hesaplanır; KDV fiyatlara dahildir.">
      <v-text-field clearable :rules="formRules.length_0_16" maxlength="16" type="tel" counter
        v-model="productInfoForm.desi" label="Desi"
        :hint="`Ürünün desi miktarı · varsayılan ${computedDefaultDesi} dm³`" persistent-hint />
      <v-text-field clearable :rules="formRules.length_0_16" maxlength="16" type="tel" counter
        v-model="productInfoForm.warranty" label="Garanti Süresi"
        :hint="`Ürünün garanti süresi · varsayılan ${computedDefaultWarranty} ay`" persistent-hint />
      <v-select clearable v-model.number="productInfoForm.taxPercentage" item-value="_id" :items="taxList" label="KDV"
        :hint="`Varsayılan %${computedDefaultTaxPercentage}`" persistent-hint />
    </ProductFormSection>
  </ProductStepCard>
</template>

<script setup lang="ts">
import { formatMoney } from '@entegrasyonik/ui/format'
import { ref, onBeforeMount, onMounted, computed } from 'vue'
import ProductStepCard from '../crud/ProductStepCard.vue'
import ProductFormSection from '../crud/ProductFormSection.vue'
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
  return formatMoney(Number(number))
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
