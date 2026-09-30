<template>
  <div class="pazaramaComponent">
    <LoadingComponent attach=".marketplaceView" ref="loadingComponentRef"></LoadingComponent>

    <IntegrationFormFrame v-if="editingClientIntegration" v-model="activeTab" :tabs="[
        { value: 1, label: 'Api Bilgileri' },
        { value: 2, label: 'Varsayılan Bilgiler' },
      ]" @save="emits('update', editingClientIntegration)" @clear="emits('refresh', editingClientIntegration.code)">
      <v-window-item :value="1">
        <EkFormSection title="Bağlantı bilgileri" icon="mdi-key-outline"
          description="Pazarama satıcı panelindeki API bilgileri sayfasından alınır.">
          <v-text-field clearable v-model="editingClientIntegration.settings.storename"
            :label="$t('integrations.storename')" />
          <v-text-field clearable v-model="editingClientIntegration.settings.SELLERID"
            label="Mağaza ID (Seller ID)" />
          <v-text-field clearable v-model="editingClientIntegration.settings.APIKEY"
            label="API Key" />
          <v-text-field clearable v-model="editingClientIntegration.settings.APISECRET"
            label="API Password (Secret)" />
          <v-switch class="ek-span-full" hide-details color="primary"
            v-model="editingClientIntegration.settings.status" :label="$t('integrations.status')" />
        </EkFormSection>
      </v-window-item>

      <v-window-item :value="2">
        <EkFormSection title="Lojistik ayarları" icon="mdi-truck-delivery-outline">
          <v-select :items="computedDeliveryOptions" item-title="name" item-value="id"
            v-model="editingClientIntegration.settings.shipmentId" label="Teslimat Şekli" />
          <v-select multiple chips closable-chips :items="shipments?.cities" item-title="name" item-value="id"
            v-model="editingClientIntegration.settings.cities" label="Teslimat Şehirleri" />
          <v-text-field clearable v-model.number="editingClientIntegration.settings.maxPurchaseQuantity"
            label="Maksimum Satılabilir Adet"
            :hint="`Boş bırakılırsa varsayılan: ${computedDefaultMaxPurchaseQuantity}`" persistent-hint />
        </EkFormSection>

        <EkFormSection title="Satış ve vergi ayarları" icon="mdi-tag-outline">
          <v-select :items="taxList" item-value="_id" clearable
            v-model.number="editingClientIntegration.settings.taxPercentage" label="Varsayılan KDV Oranı" />
        </EkFormSection>

        <EkFormSection title="Otomasyon" icon="mdi-cog-sync-outline">
          <v-switch hide-details color="primary"
            v-model="editingClientIntegration.settings.autoProcessOrders" :label="$t('integrations.autoProcessOrders')" />
          <v-switch hide-details color="primary"
            v-model="editingClientIntegration.settings.barcodeIntegration" :label="$t('integrations.barcodeIntegration')" />
          <v-textarea class="ek-span-full" rows="3" auto-grow
            v-model="editingClientIntegration.settings.constantProductDesc"
            :label="$t('integrations.constantProductDesc')"
            hint="Tüm ürünlerin altına eklenecek sabit metin (ör. iade koşulları)" persistent-hint />
        </EkFormSection>
      </v-window-item>
    </IntegrationFormFrame>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useStaticsStore } from '@/stores/staticsStore';
import { useIntegrationStore } from '@/stores/integrationStore';
import LoadingComponent from '@/components/LoadingComponent.vue'
import IntegrationFormFrame from '@/components/integrations/IntegrationFormFrame.vue'
import EkFormSection from '@/components/ds/EkFormSection.vue'
import { useSnackbarStore } from '@/stores/snackbarStore';

const snackbarStore = useSnackbarStore();
const activeTab = ref(1)
const emits = defineEmits(['update', 'refresh', 'retrieveProducts'])
const props = defineProps<{ editingClientIntegration: any }>()

const taxList = Array.from({ length: 29 }, (_, i) => ({ _id: i + 1, value: i + 1, title: i + 1 }))
const staticsStore = useStaticsStore()
const integrationStore = useIntegrationStore()
const loadingComponentRef: any = ref(null)
const shipments: any = ref([])

const computedDefaultMaxPurchaseQuantity = computed(() => staticsStore.maxPurchaseQuantity)

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

onMounted(() => {
  retrievePlatformInfos()
})

const retrievePlatformInfos = async () => {
  shipments.value = await integrationStore.retrievePlatformInfos('pazarama')
}
</script>
