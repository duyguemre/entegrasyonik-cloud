<template>
  <div class="n11Component">
    <LoadingComponent attach=".marketplaceView" ref="loadingComponentRef"></LoadingComponent>

    <IntegrationFormFrame v-if="editingClientIntegration" v-model="activeTab" :tabs="[
        { value: 1, label: 'Api Bilgileri' },
        { value: 2, label: 'Varsayılan Bilgiler' },
      ]" @save="emits('update', editingClientIntegration)" @clear="emits('refresh', editingClientIntegration.code)">
      <v-window-item :value="1">
        <EkFormSection title="Bağlantı bilgileri" icon="mdi-key-outline"
          description="N11 mağaza panelindeki &quot;API Hesabı&quot; sayfasından alınır.">
          <template #legend-extra><EkHelpHint hint="integration.credentials.n11" /></template>
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
          <v-select :items="shipments" item-title="templateName" item-value="templateName"
            v-model="editingClientIntegration.settings.shippingId" label="Kargo Şablonu" />
          <v-text-field clearable type="number"
            v-model.number="editingClientIntegration.settings.shippingDuration" label="Kargo Süresi"
            :hint="`Boş bırakılırsa varsayılan: ${computedDefaultShipingDuration} gün`" persistent-hint />
        </EkFormSection>

        <EkFormSection title="Satış ve vergi ayarları" icon="mdi-tag-outline">
          <v-select :items="taxList" item-value="_id" clearable
            v-model.number="editingClientIntegration.settings.taxPercentage" label="Varsayılan KDV Oranı" />
          <v-text-field clearable v-model.number="editingClientIntegration.settings.maxPurchaseQuantity"
            label="Maksimum Satılabilir Adet"
            :hint="`Boş bırakılırsa varsayılan: ${computedDefaultMaxPurchaseQuantity}`" persistent-hint />
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
import EkHelpHint from '@/components/ds/EkHelpHint.vue'
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
const addresses: any = ref([])

const computedDefaultMaxPurchaseQuantity = computed(() => staticsStore.maxPurchaseQuantity)
const computedDefaultShipingDuration = computed(() => staticsStore.shippingDuration)

onMounted(() => {
  retrievePlatformInfos()
})

const retrievePlatformInfos = async () => {
  const platformInfos = await integrationStore.retrievePlatformInfos(props.editingClientIntegration.code || 'n11')
  shipments.value = platformInfos
}
</script>
