<!--
  Pazarama'ya özgü kanal bilgileri (teslimat şekli, teslimat şehirleri) — ayar satırı (InfoRow) dili; kök öğesi yok.
  Kanal yanıtı NESNE (`{ deliveries, cities }`); eski "dizi değilse boşalt" koruması bu yanıtı her zaman boşaltıyordu.
-->
<template>
  <InfoRow id="ci-pz-delivery" label="Teslimat şekli" desc="Pazarama'da bu varyant için kullanılacak teslimat yöntemi." :custom="filled(m.shippingId)"
    :default-text="defaultDelivery" :note="failed && !filled(m.shippingId) ? 'Teslimat seçenekleri alınamadı — mağaza ayarı kullanılır.' : undefined"
    @reset="m.shippingId = undefined">
    <v-select id="ci-pz-delivery" v-model="m.shippingId" :items="deliveryOptions" item-title="name" item-value="id" variant="outlined"
      hide-details clearable :placeholder="defaultDelivery || 'Mağaza ayarı'" :disabled="!deliveryOptions.length && !filled(m.shippingId)"
      aria-describedby="ci-pz-delivery-state" />
  </InfoRow>
  <InfoRow id="ci-pz-cities" label="Teslimat şehirleri" desc="Ürünün gönderilebileceği şehirler." :custom="filled(m.cities)"
    :default-text="defaultCities" :note="failed && !filled(m.cities) ? 'Şehir listesi alınamadı — mağaza ayarı kullanılır.' : undefined"
    @reset="m.cities = undefined">
    <v-autocomplete id="ci-pz-cities" v-model="m.cities" :items="cities" item-title="name" item-value="id" multiple chips closable-chips
      variant="outlined" hide-details clearable :placeholder="defaultCities ? 'Mağaza ayarı' : 'Şehir seçin'"
      :disabled="!cities.length && !filled(m.cities)" aria-describedby="ci-pz-cities-state" />
  </InfoRow>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useIntegrationStore } from '@/stores/integrationStore'
import InfoRow from './InfoRow.vue'

defineProps<{ productInfoForm: any }>()
const m: any = defineModel({ default: {} })
const integrationStore = useIntegrationStore()

const settings = computed(() => integrationStore.getClientIntegration('pazarama')?.settings || {})
const info = ref<any>(null)
const failed = ref(false)
const EMPTY_ID = '00000000-0000-0000-0000-000000000000'
const deliveryOptions = computed(() => Object.entries(info.value?.deliveries || {})
  .filter(([, v]: any) => v && typeof v === 'object' && 'id' in v && v.id !== EMPTY_ID)
  .map(([name, v]: any) => ({ name, id: v.id })))
const cities = computed<any[]>(() => (Array.isArray(info.value?.cities) ? info.value.cities : []))
const defaultDelivery = computed(() => deliveryOptions.value.find((x) => x.id === settings.value.shipmentId)?.name || '')
const defaultCities = computed(() => {
  const ids: any[] = settings.value.cities || []
  const names = cities.value.filter((c) => ids.includes(c.id)).map((c) => c.name)
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ')
})
const filled = (v: any) => !(v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length))

onMounted(async () => {
  const r: any = await integrationStore.retrievePlatformInfos('pazarama')
  info.value = r && typeof r === 'object' && !(r instanceof Error) && !r.response ? r : null
  failed.value = !deliveryOptions.value.length && !cities.value.length
})
</script>
