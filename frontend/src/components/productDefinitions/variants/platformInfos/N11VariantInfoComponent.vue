<!-- N11'e özgü kanal bilgisi (kargo şablonu) — ayar satırı (InfoRow) dili; kök öğesi yok (ızgara çağıranda). -->
<template>
  <InfoRow id="ci-n11-shipping" label="Kargo şablonu" desc="N11'de tanımlı, bu varyant için kullanılacak kargo şablonu." :custom="filled(m.shippingId)"
    :default-text="defaultShipment" :note="shipmentsFailed && !filled(m.shippingId) ? 'Kargo şablonları alınamadı — mağaza ayarındaki şablon kullanılır.' : undefined"
    @reset="m.shippingId = undefined">
    <v-autocomplete id="ci-n11-shipping" v-model="m.shippingId" :items="shipments" item-title="templateName" item-value="templateName"
      variant="outlined" hide-details clearable :placeholder="defaultShipment || 'Mağaza ayarı'" :disabled="!shipments.length && !filled(m.shippingId)"
      aria-describedby="ci-n11-shipping-state" />
  </InfoRow>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useIntegrationStore } from '@/stores/integrationStore'
import InfoRow from './InfoRow.vue'

defineProps<{ productInfoForm: any }>()
const m: any = defineModel({ default: {} })
const integrationStore = useIntegrationStore()

const settings = computed(() => integrationStore.getClientIntegration('n11')?.settings || {})
const shipments = ref<any[]>([])
const shipmentsFailed = ref(false)
const defaultShipment = computed(() => shipments.value.find((x: any) => x.templateName == settings.value.shippingId)?.templateName || '')
const filled = (v: any) => !(v === undefined || v === null || v === '')

onMounted(async () => {
  const r = await integrationStore.retrievePlatformInfos('n11')
  shipments.value = Array.isArray(r) ? r : []
  shipmentsFailed.value = !shipments.value.length
})
</script>
