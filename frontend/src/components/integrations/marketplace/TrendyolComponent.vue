<template>
  <div class="trendyolComponent">
    <LoadingComponent attach=".marketplaceView" ref="loadingComponentRef"></LoadingComponent>

    <v-row v-if="editingClientIntegration" class="pa-0 ma-0">
      <v-col cols="12" class="pa-0">
        <IntegrationFormFrame v-model="activeTab" :tabs="[
            { value: 1, label: 'Api Bilgileri' },
            { value: 2, label: 'Varsayılan Bilgiler' },
          ]" @save="emits('update', editingClientIntegration)" @clear="emits('refresh', editingClientIntegration.code)">
            <v-window-item :value="1">
              <v-text-field class="customTextField" clearable density="compact"
                v-model="editingClientIntegration.settings.storename" :label="$t('integrations.storename')"
                variant="outlined" bg-color="textfieldColor"></v-text-field>

              <v-text-field class="customTextField" clearable density="compact" :label="$t('integrations.sellerid')"
                v-model="editingClientIntegration.settings.SELLERID" variant="outlined"
                bg-color="textfieldColor"></v-text-field>

              <v-text-field class="customTextField" clearable density="compact" :label="$t('integrations.apikey')"
                v-model="editingClientIntegration.settings.APIKEY" variant="outlined"
                bg-color="textfieldColor"></v-text-field>

              <v-text-field class="customTextField" clearable density="compact" :label="$t('integrations.apisecret')"
                v-model="editingClientIntegration.settings.APISECRET" variant="outlined"
                bg-color="textfieldColor"></v-text-field>


              <v-switch class="mr-0 ml-8" hide-details color="success"
                v-model="editingClientIntegration.settings.status" inset>
                <template v-slot:label>
                  {{ $t('integrations.status') }}
                </template>
              </v-switch>
            </v-window-item>

            <v-window-item :value="2">
              <v-container class="pa-0">
                <v-row dense>

                  <v-col cols="12">
                    <div class="text-subtitle-2 mb-2 ml-1 font-weight-bold opacity-70">
                      <v-icon size="small" class="mr-1">mdi-truck-delivery-outline</v-icon> Lojistik ve Adres
                      Bilgileri
                    </div>
                    <v-divider class="mb-4" />
                  </v-col>

                  <v-col cols="12" sm="6">
                    <v-select class="customTextField" density="compact" :items="shipments" item-title="name"
                      item-value="id" v-model="editingClientIntegration.settings.shippingId" label="Kargo Firması"
                      variant="outlined" bg-color="textfieldColor" />
                  </v-col>

                  <v-col cols="12" sm="6">
                    <v-text-field class="customTextField" clearable type="tel" density="compact" maxlength="16"
                      counter v-model.number="editingClientIntegration.settings.shippingDuration" variant="outlined"
                      bg-color="textfieldColor">
                      <template #label>
                        Kargo Süresi (Varsayılan <span class="font-weight-medium">{{ computedDefaultShipingDuration
                        }}</span>)
                      </template>
                    </v-text-field>
                  </v-col>

                  <v-col cols="12" sm="6">
                    <v-select class="customTextField" density="compact" :items="addresses" item-title="title"
                      item-value="id" v-model="editingClientIntegration.settings.shipmentAddressId"
                      label="Sevkiyat Adresi" variant="outlined" bg-color="textfieldColor" />
                  </v-col>

                  <v-col cols="12" sm="6">
                    <v-select class="customTextField" density="compact" :items="addresses" item-title="title"
                      item-value="id" v-model="editingClientIntegration.settings.returningAddressId"
                      label="İade Adresi" variant="outlined" bg-color="textfieldColor" />
                  </v-col>

                  <v-col cols="12" class="mt-4">
                    <div class="text-subtitle-2 mb-2 ml-1 font-weight-bold opacity-70">
                      <v-icon size="small" class="mr-1">mdi-tag-outline</v-icon> Ürün ve Satış Ayarları
                    </div>
                    <v-divider class="mb-4" />
                  </v-col>

                  <v-col cols="12" sm="4">
                    <v-select class="customTextField" density="compact" :items="taxList" item-value="_id"
                      v-model.number="editingClientIntegration.settings.taxPercentage" variant="outlined"
                      bg-color="textfieldColor" label="KDV Oranı" clearable />
                  </v-col>

                  <v-col cols="12" sm="8">
                    <v-select class="customTextField" density="compact" :items="staticsStore.fastDeliveryTypes"
                      item-title="name" item-value="id" v-model="editingClientIntegration.settings.fastDeliveryType"
                      label="Özel Teslimat Seçeneği" variant="outlined" bg-color="textfieldColor" />
                  </v-col>

                  <v-col cols="12">
                    <v-text-field class="customTextField" clearable density="compact"
                      v-model.number="editingClientIntegration.settings.maxPurchaseQuantity" variant="outlined"
                      bg-color="textfieldColor">
                      <template #label>
                        Maksimum Satılabilir Adet (Varsayılan <span class="font-weight-medium">{{
                          computedDefaultMaxPurchaseQuantity }}</span>)
                      </template>
                    </v-text-field>
                  </v-col>

                  <v-col cols="12" class="mt-4">
                    <div class="text-subtitle-2 mb-2 ml-1 font-weight-bold opacity-70">
                      <v-icon size="small" class="mr-1">mdi-cog-sync-outline</v-icon> Otomasyon ve Ek Bilgiler
                    </div>
                    <v-divider class="mb-4" />
                  </v-col>

                  <v-col cols="12" sm="6">
                    <v-switch class="px-2" hide-details color="success"
                      v-model="editingClientIntegration.settings.autoProcessOrders" inset>
                      <template v-slot:label>
                        <span class="text-body-2">{{ $t('integrations.autoProcessOrders') }}</span>
                      </template>
                    </v-switch>
                  </v-col>

                  <v-col cols="12" sm="6">
                    <v-switch class="px-2" hide-details color="info"
                      v-model="editingClientIntegration.settings.barcodeIntegration" inset>
                      <template v-slot:label>
                        <span class="text-body-2">{{ $t('integrations.barcodeIntegration') }}</span>
                      </template>
                    </v-switch>
                  </v-col>

                  <v-col cols="12">
                    <v-textarea class="customTextField mt-2" density="compact"
                      v-model="editingClientIntegration.settings.constantProductDesc"
                      :label="$t('integrations.constantProductDesc')" variant="outlined" bg-color="textfieldColor"
                      rows="3" hint="Tüm ürünlerin altına eklenecek sabit metin (Örn: İade koşulları)"
                      persistent-hint />
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
import { ref, computed, onMounted } from 'vue'
import { useStaticsStore } from '@/stores/staticsStore';
import { useIntegrationStore } from '@/stores/integrationStore';
import LoadingComponent from '@/components/LoadingComponent.vue'
import IntegrationFormFrame from '@/components/integrations/IntegrationFormFrame.vue'
import useRestApi from '@/composables/restapi'
import { useSnackbarStore } from '@/stores/snackbarStore';

const snackbarStore = useSnackbarStore();
const activeTab = ref(1)
const emits = defineEmits(['update', 'refresh', 'retrieveProducts'])
const props = defineProps<{ editingClientIntegration: any }>()

const taxList = Array.from({ length: 29 }, (_, i) => ({ _id: i + 1, value: i + 1, title: i + 1 }))
const staticsStore = useStaticsStore()
const integrationStore = useIntegrationStore()
const restApi = useRestApi()
const loadingComponentRef: any = ref(null)
const shipments: any = ref([])
const addresses: any = ref([])

const computedDefaultShipingDuration = computed(() => staticsStore.shippingDuration)
const computedDefaultMaxPurchaseQuantity = computed(() => staticsStore.maxPurchaseQuantity)

const requestFetchFromPlatform = async () => {
  let guid = loadingComponentRef.value.info('Ürün çekme isteği gönderiliyor...')
  try {
    let response = await restApi.post("IntegrationService/requestFetchFromPlatform", {
      integrationCode: props.editingClientIntegration.code,
      query: { init: false }
    })
    loadingComponentRef.value.remove(guid)
    if (response?.success === true) {
      snackbarStore.addSnackbar({ show: true, text: 'Ürün çekme isteği kuyruğa alındı...', timeout: 10000, color: 'success' })
      emits('refresh', props.editingClientIntegration.code)
    } else {
      snackbarStore.addSnackbar({ show: true, text: response?.message || 'Hata', timeout: 4000, color: 'error' })
    }
  } catch (error) {
    loadingComponentRef.value.remove(guid)
  }
}

onMounted(() => {
  retrievePlatformInfos()
  if (props.editingClientIntegration?.settings) {
    props.editingClientIntegration.settings.fastDeliveryType = props.editingClientIntegration.settings.fastDeliveryType || "-1"
  }
})

const retrievePlatformInfos = async () => {
  const platformInfos = await integrationStore.retrievePlatformInfos(props.editingClientIntegration.code || 'trendyol')
  shipments.value = platformInfos.shipments
  addresses.value = platformInfos.addresses
}
</script>
