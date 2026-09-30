<template>
  <div class="marketplaceView">
    <div class="workarea-scroll screen-scroll-inset">
      <LoadingComponent attach=".marketplaceView" ref="loadingComponentRef"></LoadingComponent>

      <div class="pa-6 pb-0">
        <EkPageHeader section="Entegrasyonlar" title="Pazaryeri"
          description="Pazaryeri hesaplarınızı bağlayın ve API ayarlarını buradan yönetin." />
      </div>

      <div class="ek-integration-layout">
        <div class="ek-integration-layout__main">
          <div>
            <IntegrationPlatformRail :items="clientMarketplaces" :model-value="editingClientIntegration.code"
              :live-codes="liveCodes" ariaLabel="Pazar yeri seçimi"
              @select="setAndRetrieveEditingClientMarketplace" />
          </div>
          <IntegrationCapabilityChips v-if="isLive(editingClientIntegration.code)" :code="editingClientIntegration.code"
            category="marketplace" :show-health-link="!!healthLink" @open-health="openHealth" />
          <v-form ref="newVariantFormRef" v-model="isFormValid">
            <v-card-text class="pa-0 px-0" role="tabpanel"
              :aria-label="editingClientIntegration.code ? `${editingClientIntegration.code} ayarları` : 'Seçim bekleniyor'">
              <div v-if="editingClientIntegration.code">
                <template v-if="editingClientIntegration.code == 'hepsiburada'">
                  <HepsiburadaComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientMarketplaceSettings" @refresh="setAndRetrieveEditingClientMarketplace"
                    @retrieveProducts="retrieveProductsFromClientMarketplace" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'trendyol'">
                  <TrendyolComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientMarketplaceSettings" @refresh="setAndRetrieveEditingClientMarketplace"
                    @retrieveProducts="retrieveProductsFromClientMarketplace" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'pazarama'">
                  <PazaramaComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientMarketplaceSettings" @refresh="setAndRetrieveEditingClientMarketplace"
                    @retrieveProducts="retrieveProductsFromClientMarketplace" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'n11'">
                  <N11Component :editingClientIntegration="editingClientIntegration"
                    @update="saveClientMarketplaceSettings" @refresh="setAndRetrieveEditingClientMarketplace"
                    @retrieveProducts="retrieveProductsFromClientMarketplace" />
                </template>
                <template v-else>
                  <IntegrationComingSoonPanel :platform-name="displayPlatformName(editingClientIntegration.code)"
                    category="pazaryeri" />
                </template>
              </div>
              <EkEmptyState v-else variant="not-connected" title="Başlamak için seçim yapın"
                message="Yukarıdaki listeden bir pazar yeri seçerek ayarları yönetmeye başlayabilirsiniz." />
            </v-card-text>
          </v-form>
        </div>

        <aside class="ek-integration-layout__aside">
          <IntegrationGuideCard :steps="guideSteps" />
        </aside>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import HepsiburadaComponent from '@/components/integrations/marketplace/HepsiburadaComponent.vue'
import TrendyolComponent from '@/components/integrations/marketplace/TrendyolComponent.vue'
import N11Component from '@/components/integrations/marketplace/N11Component.vue'
import PazaramaComponent from '@/components/integrations/marketplace/PazaramaComponent.vue'
import LoadingComponent from '@/components/LoadingComponent.vue'
import useRestApi from '@/composables/restapi'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useI18n } from 'vue-i18n'
import IntegrationGuideCard from '@/components/integrations/IntegrationGuideCard.vue'
import EkPageHeader from '@/components/ds/EkPageHeader.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import IntegrationPlatformRail from '@/components/integrations/IntegrationPlatformRail.vue'
import IntegrationComingSoonPanel from '@/components/integrations/IntegrationComingSoonPanel.vue'
import IntegrationCapabilityChips from '@/components/integrations/IntegrationCapabilityChips.vue'
import { useIntegrationScreen } from '@/components/integrations/useIntegrationScreen'

// C1.2 — canlı küme `getCatalog` manifestosundan (yedek: `FALLBACK_LIVE_CODES`, bkz. `integrationCatalog.ts`).
const { liveCodes, isLive, healthLink, openHealth } = useIntegrationScreen('marketplace')

const integrationStore: any = useIntegrationStore()
const { t } = useI18n()
const isFormValid = ref(false)
const loadingComponentRef: any = ref(null)
const restApi = useRestApi()
const editingClientIntegration: any = ref({ settings: {} })

const guideSteps = [
  { title: 'Platformu Belirleyin', text: 'Üstteki ikonlara tıklayarak işlem yapacağınız pazar yerini seçin.' },
  { title: 'API Bağlantısı', text: 'Pazar yeri panelinden aldığınız API anahtarlarını ilgili alanlara girin.' },
  { title: 'Katalog Senkronu', text: 'Kaydettikten sonra Ürünleri Çek butonuyla verilerinizi eşitleyin.' }
]

onMounted(() => {
  if (clientMarketplaces.value && clientMarketplaces.value.length > 0)
    setAndRetrieveEditingClientMarketplace(clientMarketplaces.value[0].code)
})

const clientMarketplaces = computed(() => integrationStore.getClientMarketplaces())

function displayPlatformName(code: string) {
  return code ? code.charAt(0).toUpperCase() + code.slice(1) : ''
}

const saveClientMarketplaceSettings = async (clientMarketplace: any) => {
  let guid = loadingComponentRef.value.info(t('loading.info.newProduct'))
  const response = await restApi.post("IntegrationService/saveClientMarketplaceSettings", { clientMarketplace })
  loadingComponentRef.value.remove(guid)
  if (response && response._id) {
    editingClientIntegration.value.settings = response.settings
  }
}

const setAndRetrieveEditingClientMarketplace = async (integrationCode: string) => {
  let guid = loadingComponentRef.value.info(t('loading.info.newProduct'))
  const response = await restApi.post("IntegrationService/retrieveClientMarketplaceSettings", { integrationCode })
  loadingComponentRef.value.remove(guid)
  if (response && response.settings) {
    editingClientIntegration.value = response
  }
}

const retrieveProductsFromClientMarketplace = async (integrationCode: string) => {
  loadingComponentRef.value.showProgress()
  const response = await restApi.post("IntegrationService/retrieveProductsFromClientMarketplace", { integrationCode })
  loadingComponentRef.value.closeProgress()
  if (response && response._id) {
    editingClientIntegration.value = response
  }
}
</script>

<style scoped>
.marketplaceView {
  background-color: var(--ek-color-surface-muted);
}

/* Kaydırma alanının alt boşluğu — global `.workarea-scroll` (2px) üzerine bu ekrana özgü
   4px'lik (--ek-space-1) override. Önceki literal değer 5px'ti; 1px'lik fark ekran
   görüntüsü toleransı (%2) içinde kalır ve token ölçeğinde karşılığı olmayan bir ara
   değerdi (bilinçli yakın-değer eşlemesi). */
.screen-scroll-inset {
  bottom: var(--ek-space-1);
}
</style>

<style scoped src="@/components/integrations/integration-layout.css"></style>
