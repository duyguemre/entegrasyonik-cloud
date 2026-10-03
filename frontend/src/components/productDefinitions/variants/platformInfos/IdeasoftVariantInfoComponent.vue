<!--
  Ideasoft'a özgü kanal bilgileri (stok tipi, hediye, kargo ücreti) — ayar satırı (InfoRow) dili; kök öğesi yok.
  Varsayılanlar Ideasoft mağaza ayarlarından (eskiden yanlışlıkla Trendyol ayarları okunuyordu).
-->
<template>
  <InfoRow id="ci-is-stocktype" label="Stok tipi" desc="Stoğun hangi birimle sayıldığı (adet, çift, kg…)." :custom="filled(m.stockTypeLabel)"
    :default-text="defaultStockType" @reset="m.stockTypeLabel = undefined">
    <v-select id="ci-is-stocktype" v-model="m.stockTypeLabel" :items="staticsStore.ideasoft.stockTypeLabelOptions" variant="outlined"
      hide-details clearable :placeholder="defaultStockType" aria-describedby="ci-is-stocktype-state" />
  </InfoRow>
  <InfoRow id="ci-is-gift" label="Hediye durumu" desc="Ürünün hediye paketiyle satılıp satılmadığı." :custom="filled(m.hasGift)"
    :default-text="giftText(defaultHasGift)" @reset="m.hasGift = undefined">
    <v-select id="ci-is-gift" v-model="m.hasGift" :items="GIFT" variant="outlined" hide-details clearable :placeholder="giftText(defaultHasGift)"
      aria-describedby="ci-is-gift-state" />
  </InfoRow>
  <InfoRow id="ci-is-shipcost" label="Kargo ücreti" desc="Bu varyant için müşteriden alınacak sabit kargo ücreti." :custom="filled(m.customShippingCost)"
    :default-text="formatMoney(Number(defaultShippingCost) || 0)" @reset="m.customShippingCost = undefined">
    <VCurrencyComponentVue id="ci-is-shipcost" v-model="m.customShippingCost" :null-to-empty="true" :compact="true" clearable :is-icon-exist="false"
      :required="false" aria-describedby="ci-is-shipcost-state" />
  </InfoRow>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatMoney } from '@entegrasyonik/ui/format'
import { useStaticsStore } from '@/stores/staticsStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import VCurrencyComponentVue from '@/components/VCurrencyComponent.vue'
import InfoRow from './InfoRow.vue'

defineProps<{ productInfoForm: any }>()
const m: any = defineModel({ default: {} })
const staticsStore = useStaticsStore()
const integrationStore = useIntegrationStore()

const GIFT = [{ title: 'Hediyesiz', value: 0 }, { title: 'Hediyeli', value: 1 }]
const giftText = (v: any) => (Number(v) === 1 ? 'Hediyeli' : 'Hediyesiz')
const settings = computed(() => integrationStore.getClientIntegration('ideasoft')?.settings || {})
const defaultStockType = computed(() => {
  const value = settings.value.stockTypeLabel || staticsStore.ideasoft.defaults.stockTypeLabel
  return staticsStore.ideasoft.stockTypeLabelOptions.find((x: any) => x.value == value)?.title || ''
})
const defaultHasGift = computed(() => settings.value.hasGift ?? staticsStore.ideasoft.defaults.hasGift)
const defaultShippingCost = computed(() => settings.value.customShippingCost || staticsStore.ideasoft.defaults.customShippingCost)
const filled = (v: any) => !(v === undefined || v === null || v === '')
</script>
