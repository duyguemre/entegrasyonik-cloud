<template>
  <div class="bizimhesapComponent">
    <LoadingComponent attach=".erpView" ref="loadingComponentRef"></LoadingComponent>

    <IntegrationFormFrame v-if="editingClientIntegration" v-model="activeTab" :tabs="[
        { value: 1, label: 'API Bilgileri' },
        { value: 2, label: 'Kargo Bilgileri' },
      ]" @save="emits('update', editingClientIntegration)" @clear="emits('refresh', editingClientIntegration.code)">
      <v-window-item :value="1">
        <EkFormSection title="Bağlantı bilgileri" icon="mdi-key-outline"
          description="Bizimhesap panelindeki API erişim bilgilerinden alınır.">
          <template #legend-extra><EkHelpHint hint="integration.credentials.bizimhesap" /></template>
          <v-text-field clearable v-model="editingClientIntegration.settings.key" label="Bizimhesap ID" />
          <v-text-field clearable v-model="editingClientIntegration.settings.secret" label="API Key" />
          <v-switch class="ek-span-full" hide-details color="primary"
            v-model="editingClientIntegration.settings.status" :label="$t('integrations.status')" />
        </EkFormSection>

        <EkFormSection title="Ürün işlemleri" icon="mdi-sync"
          description="Bizimhesap ürünlerini Entegrasyonik ürünleriyle eşleştirir.">
          <div class="ek-span-full">
            <EkButton tone="secondary" icon="mdi-link-variant" @click="checkStatus()">Ürünleri eşleştir</EkButton>
          </div>
        </EkFormSection>
      </v-window-item>

      <v-window-item :value="2">
        <EkFormSection title="Kargo ölçüleri" icon="mdi-package-variant-closed">
          <v-text-field clearable label="Varsayılan Desi" v-model="editingClientIntegration.settings.desi" />
          <v-text-field clearable label="Varsayılan Ağırlık" v-model="editingClientIntegration.settings.weight" />
        </EkFormSection>

        <EkFormSection title="Ödeme ve şube bilgileri" icon="mdi-bank-outline">
          <v-text-field clearable label="Şube" v-model="editingClientIntegration.settings.branch" />
          <v-text-field clearable label="Posta Çeki Hesap Numarası" v-model="editingClientIntegration.settings.cheque" />
          <v-select clearable label="Satıcı Ödeme Kodu" v-model="editingClientIntegration.settings.paymentCode" />
        </EkFormSection>

        <EkFormSection title="Otomasyon ayarları" icon="mdi-cog-sync-outline">
          <v-switch hide-details color="primary" v-model="editingClientIntegration.settings.isAutoBarcode"
            label="Gelen sipariş barkodu otomatik oluşturulsun" />
          <v-switch hide-details color="primary" v-model="editingClientIntegration.settings.isAutoShipment"
            label="Gelen sipariş otomatik kargoya gönderilsin" />
        </EkFormSection>
      </v-window-item>
    </IntegrationFormFrame>
  </div>
</template>

<script setup lang="ts">
import EkHelpHint from '@/components/page/EkHelpHint.vue'
import { ref, onBeforeMount } from 'vue'
import { useStaticsStore } from '@/stores/staticsStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import LoadingComponent from '@/components/LoadingComponent.vue'
import IntegrationFormFrame from '@/components/integrations/IntegrationFormFrame.vue'
import { EkButton, EkFormSection } from '@entegrasyonik/ui/components'
import useRestApi from '@/composables/restapi'
import { useSnackbarStore } from '@/stores/snackbarStore'

const snackbarStore = useSnackbarStore()
const activeTab = ref(1)
const emits = defineEmits(['update', 'refresh', 'retrieveProducts'])
const props = defineProps<{ editingClientIntegration: any }>()

const integrationCode = "bizimhesap"
const staticsStore = useStaticsStore()
const integrationStore = useIntegrationStore()
const restApi = useRestApi()
const loadingComponentRef: any = ref(null)

const integration: any = ref()

const checkStatus = async () => {
  let guid = loadingComponentRef.value.info("")
  let response = await restApi.post("IntegrationService/checkProductStatus", { integrationCode: props.editingClientIntegration.code })
  loadingComponentRef.value.remove(guid)
  if (response == true) {
    snackbarStore.addSnackbar({
      show: true,
      text: 'Ürün durum güncellemesi isteği kaydedildi.',
      timeout: 5000,
      color: 'warning'
    })
  }
}

onBeforeMount(() => {
  integration.value = integrationStore.getIntegration(integrationCode)
  props.editingClientIntegration.settings = props.editingClientIntegration.settings || {}
  props.editingClientIntegration.settings.barcode = props.editingClientIntegration.settings.barcode || { start: undefined, end: undefined }
})
</script>
