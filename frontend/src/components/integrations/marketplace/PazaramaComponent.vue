<template>
  <div class="pazaramaComponent">
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

            <v-text-field class="customTextField" clearable density="compact" label="Mağaza ID (Seller ID)"
              v-model="editingClientIntegration.settings.SELLERID" variant="outlined"
              bg-color="textfieldColor"></v-text-field>

            <v-text-field class="customTextField" clearable density="compact" label="API Key"
              v-model="editingClientIntegration.settings.APIKEY" variant="outlined"
              bg-color="textfieldColor"></v-text-field>

            <v-text-field class="customTextField" clearable density="compact" label="API Password (Secret)"
              v-model="editingClientIntegration.settings.APISECRET" variant="outlined"
              bg-color="textfieldColor"></v-text-field>

            <v-switch class="mr-0 ml-8" hide-details color="success"
              v-model="editingClientIntegration.settings.status" inset shadow>
              <template v-slot:label>
                <span class="text-body-2 font-weight-bold">{{ $t('integrations.status') }}</span>
              </template>
            </v-switch>
          </v-window-item>

          <v-window-item :value="2">
            <v-container class="pa-0">
              <v-row dense>
                <v-col cols="12">
                  <div class="text-subtitle-2 mb-2 ml-1 font-weight-bold opacity-70">
                    <v-icon size="small" class="mr-1">mdi-truck-delivery-outline</v-icon> Lojistik Ayarları
                  </div>
                  <v-divider class="mb-4" />
                </v-col>

                <v-col cols="12" sm="6">
                  <v-select class="customTextField" density="compact" :items="computedDeliveryOptions"
                    item-title="name" item-value="id" v-model="editingClientIntegration.settings.shipmentId"
                    label="Teslimat Şekli" variant="outlined" bg-color="textfieldColor" />
                </v-col>

                <v-col cols="12" sm="6">
                  <v-select class="customTextField" density="compact" multiple :items="shipments?.cities"
                    item-title="name" item-value="id" v-model="editingClientIntegration.settings.cities"
                    label="Teslimat Şehirleri" variant="outlined" bg-color="textfieldColor" />
                </v-col>

                <v-col cols="12" sm="6">
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
                    <v-icon size="small" class="mr-1">mdi-tag-outline</v-icon> Satış ve Vergi Ayarları
                  </div>
                  <v-divider class="mb-4" />
                </v-col>

                <v-col cols="12" sm="6">
                  <v-select class="customTextField" density="compact" :items="taxList" item-value="_id"
                    v-model.number="editingClientIntegration.settings.taxPercentage" variant="outlined"
                    bg-color="textfieldColor" label="Varsayılan KDV Oranı" clearable />
                </v-col>

                <v-col cols="12" class="mt-4">
                  <div class="text-subtitle-2 mb-2 ml-1 font-weight-bold opacity-70">
                    <v-icon size="small" class="mr-1">mdi-cog-sync-outline</v-icon> Otomasyon
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
                    rows="3" persistent-hint />
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
