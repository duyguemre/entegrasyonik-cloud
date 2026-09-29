<template>
  <div class="shippingView">
    <div class="workarea-scroll screen-scroll-inset">
      <LoadingComponent attach=".shippingView" ref="loadingComponentRef"></LoadingComponent>

      <div class="pa-6 pb-0">
        <EkPageHeader section="Entegrasyonlar" title="Kargo"
          description="Kargo firmalarınızı bağlayın ve ayarlarını buradan yönetin." />
      </div>

      <v-row class="ma-0">
        <v-col cols="12" lg="8" class="pa-0">
          <div class="pa-6">
            <IntegrationPlatformRail :items="clientShipments" :model-value="editingClientIntegration.code"
              :live-codes="LIVE_CODES" ariaLabel="Kargo firması seçimi"
              @select="setAndRetrieveEditingClientShipment" />
            <DividerComponent />
          </div>
          <v-form ref="newVariantFormRef" v-model="isFormValid">
            <v-card-text class="pa-0 px-0" role="tabpanel"
              :aria-label="editingClientIntegration.code ? `${editingClientIntegration.code} ayarları` : 'Seçim bekleniyor'">
              <div v-if="editingClientIntegration.code">
                <template v-if="editingClientIntegration.code == 'ptt'">
                  <PttComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientShipmentSettings" @refresh="setAndRetrieveEditingClientShipment" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'aras'">
                  <ArasComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientShipmentSettings" @refresh="setAndRetrieveEditingClientShipment" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'yurtici'">
                  <YurticiComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientShipmentSettings" @refresh="setAndRetrieveEditingClientShipment" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'mng'">
                  <MNGComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientShipmentSettings" @refresh="setAndRetrieveEditingClientShipment" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'hepsijet'">
                  <HepsijetComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientShipmentSettings" @refresh="setAndRetrieveEditingClientShipment" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'surat'">
                  <SuratComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientShipmentSettings" @refresh="setAndRetrieveEditingClientShipment" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'sendeo'">
                  <SendeoComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientShipmentSettings" @refresh="setAndRetrieveEditingClientShipment" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'oplog'">
                  <OplogComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientShipmentSettings" @refresh="setAndRetrieveEditingClientShipment" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'ups'">
                  <UPSComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientShipmentSettings" @refresh="setAndRetrieveEditingClientShipment" />
                </template>
                <template v-else>
                  <IntegrationComingSoonPanel :platform-name="displayPlatformName(editingClientIntegration.code)"
                    category="kargo" />
                </template>
              </div>
              <EkEmptyState v-else variant="not-connected" title="Başlamak İçin Seçim Yapın"
                message="Yukarıdaki listeden bir kargo firması seçerek ayarları yönetmeye başlayabilirsiniz." />
            </v-card-text>
          </v-form>
        </v-col>

        <v-col cols="12" lg="4" class="pa-6">
          <CardComponent>
            <div class="d-flex align-center mb-6">
              <v-icon color="passiveColor" class="mr-2">mdi-lightbulb-on-outline</v-icon>
              <span class="text-subtitle-1 font-weight-bold">Hızlı Başlangıç Rehberi</span>
            </div>

            <div v-for="(step, i) in guideSteps" :key="i" class="mb-5 d-flex">
              <div class="step-number mr-4">{{ i + 1 }}</div>
              <div>
                <div class="text-subtitle-2 font-weight-bold mb-1">{{ step.title }}</div>
                <div class="text-caption opacity-60">{{ step.text }}</div>
              </div>
            </div>

            <v-divider class="my-6 opacity-10"></v-divider>

            <v-alert variant="tonal" color="passiveColor" density="compact" class="rounded-lg border-opacity-25">
              <template v-slot:prepend>
                <v-icon size="small">mdi-help-circle-outline</v-icon>
              </template>
              <div class="text-caption">API bilgileriniz hatalı ise bağlantı "Pasif" görünecektir.</div>
            </v-alert>
          </CardComponent>
        </v-col>
      </v-row>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import PttComponent from '@/components/integrations/shipment/PttComponent.vue'
import ArasComponent from '@/components/integrations/shipment/ArasComponent.vue'
import YurticiComponent from '@/components/integrations/shipment/YurticiComponent.vue'
import MNGComponent from '@/components/integrations/shipment/MNGComponent.vue'
import HepsijetComponent from '@/components/integrations/shipment/HepsijetComponent.vue'
import SuratComponent from '@/components/integrations/shipment/SuratComponent.vue'
import SendeoComponent from '@/components/integrations/shipment/SendeoComponent.vue'
import OplogComponent from '@/components/integrations/shipment/OplogComponent.vue'
import UPSComponent from '@/components/integrations/shipment/UPSComponent.vue'
import LoadingComponent from '@/components/LoadingComponent.vue'
import useRestApi from '@/composables/restapi'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useI18n } from 'vue-i18n'
import CardComponent from '@/components/CardComponent.vue'
import DividerComponent from '@/components/layout/DividerComponent.vue'
import EkPageHeader from '@/components/ds/EkPageHeader.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import IntegrationPlatformRail from '@/components/integrations/IntegrationPlatformRail.vue'
import IntegrationComingSoonPanel from '@/components/integrations/IntegrationComingSoonPanel.vue'

// `docs/INTEGRATIONS_REGISTRY.md` §5.1 — "NET: backend'de hiçbir kargo API
// entegrasyonu YOK". Canlı küme KASITLI olarak BOŞTUR (N13).
const LIVE_CODES: string[] = []

const integrationStore: any = useIntegrationStore()
const { t } = useI18n()
const isFormValid = ref(false)
const loadingComponentRef: any = ref(null)
const restApi = useRestApi()
const editingClientIntegration: any = ref({ settings: {} })

const guideSteps = [
  { title: 'Firmayı Seçin', text: 'Üstteki ikonlara tıklayarak işlem yapacağınız kargo firmasını seçin.' },
  { title: 'API Bağlantısı', text: 'Kargo firmasının panelinden aldığınız API bilgilerini ilgili alanlara girin.' },
  { title: 'Kaydet ve Aktifleştir', text: 'Bilgileri kaydettikten sonra entegrasyon otomatik olarak aktif hale gelir.' }
]

onMounted(() => {
  if (clientShipments.value && clientShipments.value.length > 0)
    setAndRetrieveEditingClientShipment(clientShipments.value[0].code)
})

const clientShipments = computed(() => integrationStore.getClientShipments())

function displayPlatformName(code: string) {
  return code ? code.charAt(0).toUpperCase() + code.slice(1) : ''
}

const saveClientShipmentSettings = async (clientShipment: any) => {
  let guid = loadingComponentRef.value.info(t('loading.info.newProduct'))
  const response = await restApi.post("IntegrationService/saveClientShipmentSettings", { clientShipment })
  loadingComponentRef.value.remove(guid)
  if (response && response._id) {
    editingClientIntegration.value.settings = response.settings
  }
}

const setAndRetrieveEditingClientShipment = async (integrationCode: string) => {
  let guid = loadingComponentRef.value.info(t('loading.info.newProduct'))
  const response = await restApi.post("IntegrationService/retrieveClientShipmentSettings", { integrationCode })
  loadingComponentRef.value.remove(guid)
  if (response && response.settings) {
    editingClientIntegration.value = response
  }
}
</script>

<style scoped>
.shippingView {
  background-color: var(--ek-color-surface-muted);
}

/* Kaydırma alanının alt boşluğu — bkz. MarketplaceView.vue'daki aynı desenin gerekçe notu. */
.screen-scroll-inset {
  bottom: var(--ek-space-1);
}

.step-number {
  min-width: var(--ek-space-6);
  height: var(--ek-space-6);
  background: var(--ek-color-passive-color);
  color: white;
  border-radius: var(--ek-radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-bold);
}

.opacity-70 {
  opacity: 0.7;
}

.opacity-60 {
  opacity: 0.6;
}

.opacity-50 {
  opacity: 0.5;
}

.opacity-10 {
  opacity: 0.1;
}
</style>
