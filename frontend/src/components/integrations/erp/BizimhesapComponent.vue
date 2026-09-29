<!--
  ADR-0015 Aşama B2 — Bizimhesap (canlı, `docs/INTEGRATIONS_REGISTRY.md` §4.1).
  ARAŞTIRMA BULGUSU (BACKLOG'a taşındı): önceki sürümde template
  `<BizimhesapAuthComponent>` referans veriyordu ama bu bileşen PROJEDE HİÇ
  YOKTU (dosya bulunamadı) ve `isAuthDialog` hiçbir yerden `true`
  yapılmıyordu — blok asla render OLMUYORDU (ölü + kırık referans). Silindi
  (davranış DEĞİŞMEDİ — zaten hiç render olmuyordu).
-->
<template>
  <div class="bizimhesapComponent">
    <LoadingComponent attach=".erpView" ref="loadingComponentRef"></LoadingComponent>

    <v-row v-if="editingClientIntegration" class="pa-0 ma-0">
      <v-col cols="12" class="pa-0">
        <IntegrationFormFrame v-model="activeTab" :tabs="[
          { value: 1, label: 'Api Bilgileri' },
          { value: 2, label: 'Kargo Bilgileri' },
        ]" @save="emits('update', editingClientIntegration)" @clear="emits('refresh', editingClientIntegration.code)">
          <!-- Tab 1: API Bilgileri -->
          <v-window-item :value="1">
            <v-text-field class="customTextField" clearable density="compact"
              v-model="editingClientIntegration.settings.key"
              label="Bizimhesap ID" variant="outlined" bg-color="textfieldColor"></v-text-field>

            <v-text-field class="customTextField" clearable density="compact" label="Api Key"
              v-model="editingClientIntegration.settings.secret" variant="outlined"
              bg-color="textfieldColor"></v-text-field>

            <v-switch class="mr-0 ml-8" hide-details color="success"
              v-model="editingClientIntegration.settings.status" inset>
              <template v-slot:label>
                {{ $t('integrations.status') }}
              </template>
            </v-switch>

            <v-divider class="my-4 opacity-10"></v-divider>

            <div class="text-subtitle-2 mb-3 ml-1 font-weight-bold opacity-70">
              <v-icon size="small" class="mr-1">mdi-sync</v-icon> Ürün İşlemleri
            </div>
            <v-btn color="primary" variant="flat" @click="checkStatus()">
              <v-icon start size="18">mdi-link-variant</v-icon>
              Ürünleri Eşleştir
            </v-btn>
          </v-window-item>

          <!-- Tab 2: Kargo Bilgileri -->
          <v-window-item :value="2">
            <v-container class="pa-0">
              <v-row dense>

                <v-col cols="12">
                  <div class="text-subtitle-2 mb-2 ml-1 font-weight-bold opacity-70">
                    <v-icon size="small" class="mr-1">mdi-package-variant-closed</v-icon> Kargo Ölçüleri
                  </div>
                  <v-divider class="mb-4" />
                </v-col>

                <v-col cols="12" sm="6">
                  <v-text-field class="customTextField" clearable density="compact" label="Varsayılan Desi"
                    v-model="editingClientIntegration.settings.desi" variant="outlined"
                    bg-color="textfieldColor"></v-text-field>
                </v-col>

                <v-col cols="12" sm="6">
                  <v-text-field class="customTextField" clearable density="compact" label="Varsayılan Ağırlık"
                    v-model="editingClientIntegration.settings.weight" variant="outlined"
                    bg-color="textfieldColor"></v-text-field>
                </v-col>

                <v-col cols="12" class="mt-4">
                  <div class="text-subtitle-2 mb-2 ml-1 font-weight-bold opacity-70">
                    <v-icon size="small" class="mr-1">mdi-bank-outline</v-icon> Ödeme ve Şube Bilgileri
                  </div>
                  <v-divider class="mb-4" />
                </v-col>

                <v-col cols="12" sm="6">
                  <v-text-field class="customTextField" clearable density="compact" label="Şube"
                    v-model="editingClientIntegration.settings.branch" variant="outlined"
                    bg-color="textfieldColor"></v-text-field>
                </v-col>

                <v-col cols="12" sm="6">
                  <v-text-field class="customTextField" clearable density="compact" label="Posta Çeki Hesap Numarası"
                    v-model="editingClientIntegration.settings.cheque" variant="outlined"
                    bg-color="textfieldColor"></v-text-field>
                </v-col>

                <v-col cols="12" sm="6">
                  <v-select class="customTextField" clearable density="compact" label="Satıcı Ödeme Kodu"
                    v-model="editingClientIntegration.settings.paymentCode" variant="outlined"
                    bg-color="textfieldColor"></v-select>
                </v-col>

                <v-col cols="12" class="mt-4">
                  <div class="text-subtitle-2 mb-2 ml-1 font-weight-bold opacity-70">
                    <v-icon size="small" class="mr-1">mdi-cog-sync-outline</v-icon> Otomasyon Ayarları
                  </div>
                  <v-divider class="mb-4" />
                </v-col>

                <v-col cols="12" sm="6">
                  <v-switch class="px-2" hide-details color="success"
                    v-model="editingClientIntegration.settings.isAutoBarcode" inset>
                    <template v-slot:label>
                      <span class="text-body-2">Gelen sipariş barkodu otomatik oluşturulsun</span>
                    </template>
                  </v-switch>
                </v-col>

                <v-col cols="12" sm="6">
                  <v-switch class="px-2" hide-details color="info"
                    v-model="editingClientIntegration.settings.isAutoShipment" inset>
                    <template v-slot:label>
                      <span class="text-body-2">Gelen sipariş otomatik kargoya gönderilsin</span>
                    </template>
                  </v-switch>
                </v-col>

              </v-row>
            </v-container>
          </v-window-item>
        </IntegrationFormFrame>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeMount } from 'vue'
import { useStaticsStore } from '@/stores/staticsStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import LoadingComponent from '@/components/LoadingComponent.vue'
import IntegrationFormFrame from '@/components/integrations/IntegrationFormFrame.vue'
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

<style scoped>
.opacity-70 {
  opacity: 0.7;
}

.opacity-10 {
  opacity: 0.1;
}
</style>
