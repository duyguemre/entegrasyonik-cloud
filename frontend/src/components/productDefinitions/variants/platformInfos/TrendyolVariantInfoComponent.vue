<!-- Trendyol'a özgü kanal bilgileri (kargo firması, teslimat seçeneği) — ayar satırı (InfoRow) dili; kök öğesi yok (ızgara çağıranda). -->
<template>
  <InfoRow id="ci-ty-shipping" label="Kargo firması" desc="Bu varyantın Trendyol'da gönderileceği kargo firması." :custom="filled(m.shippingId)"
    :default-text="defaultShipment" :note="shipmentsFailed && !filled(m.shippingId) ? 'Kargo firmaları alınamadı — mağaza ayarındaki firma kullanılır.' : undefined"
    @reset="m.shippingId = undefined">
    <v-autocomplete id="ci-ty-shipping" v-model="m.shippingId" :items="shipments" item-title="name" item-value="id" variant="outlined"
      hide-details clearable :placeholder="defaultShipment || 'Mağaza ayarı'" :disabled="!shipments.length && !filled(m.shippingId)"
      aria-describedby="ci-ty-shipping-state" />
  </InfoRow>
  <InfoRow id="ci-ty-delivery" label="Teslimat seçeneği" desc="Hızlı teslimat etiketi (ör. bugün kargoda)." :custom="filled(m.fastDeliveryType)"
    :default-text="defaultDelivery" @reset="m.fastDeliveryType = undefined">
    <v-select id="ci-ty-delivery" v-model="m.fastDeliveryType" :items="staticsStore.fastDeliveryTypes" item-title="name" item-value="id"
      variant="outlined" hide-details clearable :placeholder="defaultDelivery || 'Mağaza ayarı'" aria-describedby="ci-ty-delivery-state" />
  </InfoRow>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useStaticsStore } from '@/stores/staticsStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import InfoRow from './InfoRow.vue'

defineProps<{ productInfoForm: any }>()
const m: any = defineModel({ default: {} })
const staticsStore = useStaticsStore()
const integrationStore = useIntegrationStore()

const settings = computed(() => integrationStore.getClientIntegration('trendyol')?.settings || {})
const shipments = ref<any[]>([])
const shipmentsFailed = ref(false)
const defaultShipment = computed(() => shipments.value.find((x: any) => x.id == settings.value.shippingId)?.name || '')
const defaultDelivery = computed(() => staticsStore.fastDeliveryTypes.find((x: any) => x.id == settings.value.fastDeliveryType)?.name || '')
const filled = (v: any) => !(v === undefined || v === null || v === '')

onMounted(async () => {
  // Yanıt dizi değilse (hata/boş) liste boş kalır; satırda açıklama gösterilir.
  const r = await integrationStore.retrievePlatformInfos('trendyol')
  shipments.value = Array.isArray(r) ? r : []
  shipmentsFailed.value = !shipments.value.length
})
</script>
