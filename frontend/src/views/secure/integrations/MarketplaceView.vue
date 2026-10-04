<template>
  <div class="marketplaceView">
    <div class="workarea-scroll screen-scroll-inset">
      <LoadingComponent attach=".marketplaceView" ref="loadingComponentRef"></LoadingComponent>

      <div class="ek-integration-head">
        <EkPageHeader section="Entegrasyonlar" title="Pazaryeri"
          description="Pazaryeri hesaplarınızı bağlayın ve API ayarlarını buradan yönetin.">
          <template #tools><EkViewSwitch v-model="view" /></template>
        </EkPageHeader>
      </div>

      <div class="ek-integration-page">
        <!-- FE-LOCAL-1048: Liste | Özet — özet, bağlantı ayarlarının YERİNE açılır (ikisi aynı sayfada durmaz). -->
        <IntegrationOverview v-if="view === 'summary' && clientMarketplaces?.length" title="Pazaryeri" noun="pazaryeri" :items="clientMarketplaces" :live-codes="liveCodes"
          :active-codes="activeCodes" list-label="Pazaryerleri" :current="editingClientIntegration.code"
          @select="(code: string) => { setAndRetrieveEditingClientMarketplace(code); view = 'list' }" />
      <div v-show="view === 'list'" class="ek-integration-layout">
        <div class="ek-integration-layout__main">
          <ListDashSection label="Pazaryerleri">
            <IntegrationPlatformRail :items="clientMarketplaces" :model-value="editingClientIntegration.code"
              :live-codes="liveCodes" :active-codes="activeCodes" ariaLabel="Pazar yeri seçimi"
              @select="setAndRetrieveEditingClientMarketplace" />
          </ListDashSection>
          <ListDashSection label="Bağlantı ayarları">
          <div class="ek-integration-stack">
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
          <!-- [eslesme-fiyat WP7b, F-10] Son senkron · Şimdi senkronize et (yalnız canlı kanal). -->
          <IntegrationSyncBar v-if="isLive(editingClientIntegration.code)" :code="editingClientIntegration.code" />
          <!-- FE-LOCAL-1048: kapsam ikincil bilgi — ayar formunun ALTINDA, katlanır sakin satır. -->
          <IntegrationCapabilityChips v-if="isLive(editingClientIntegration.code)" :code="editingClientIntegration.code"
            category="marketplace" :show-health-link="!!healthLink" @open-health="openHealth" />
          </div>
          </ListDashSection>
        </div>

        <aside class="ek-integration-layout__aside">
          <ListDashSection label="Rehber">
          <!-- C1.2: kodu olmayan sağlayıcı seçiliyken "API anahtarını girin" adımları gösterilmez. -->
          <IntegrationGuideCard v-if="!editingClientIntegration.code || isLive(editingClientIntegration.code)" :steps="guideSteps" />
          <IntegrationGuideCard v-else :steps="comingSoonGuide" note="" />
          </ListDashSection>
        </aside>
      </div>
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
import EkPageHeader from '@/components/page/EkPageHeader.vue'
import { EkEmptyState } from '@entegrasyonik/ui/components'
import IntegrationPlatformRail from '@/components/integrations/IntegrationPlatformRail.vue'
import IntegrationOverview from '@/components/integrations/IntegrationOverview.vue'
import EkViewSwitch, { type EkViewMode } from '@/components/page/EkViewSwitch.vue'
import ListDashSection from '@/components/page/ListDashSection.vue'
import IntegrationComingSoonPanel from '@/components/integrations/IntegrationComingSoonPanel.vue'
import IntegrationCapabilityChips from '@/components/integrations/IntegrationCapabilityChips.vue'
import IntegrationSyncBar from '@/components/integrations/IntegrationSyncBar.vue'
import { useIntegrationScreen } from '@/components/integrations/useIntegrationScreen'

// C1.2 — canlı küme `getCatalog` manifestosundan (yedek: `FALLBACK_LIVE_CODES`, bkz. `integrationCatalog.ts`).
const { liveCodes, isLive, healthLink, openHealth, comingSoonGuide, noteSettings, activeCodesOf } = useIntegrationScreen('marketplace')
// FE-LOCAL-1048: Liste | Özet — varsayılan ayarlar; Özet ayar düzeninin yerine açılır.
const view = ref<EkViewMode>('list')

const integrationStore: any = useIntegrationStore()
const { t } = useI18n()
const isFormValid = ref(false)
const loadingComponentRef: any = ref(null)
const restApi = useRestApi()
const editingClientIntegration: any = ref({ settings: {} })

const guideSteps = [
  { title: 'Kanalı seçin', text: 'Üstteki ikonlara tıklayarak işlem yapacağınız pazar yerini seçin.' },
  { title: 'API bağlantısı', text: 'Pazar yeri panelinden aldığınız API anahtarlarını ilgili alanlara girin.' },
  { title: 'Katalog Senkronu', text: 'Kaydettikten sonra Ürünleri çek butonuyla verilerinizi eşitleyin.' }
]

onMounted(() => {
  if (clientMarketplaces.value && clientMarketplaces.value.length > 0)
    setAndRetrieveEditingClientMarketplace(clientMarketplaces.value[0].code)
})

// FE-LOCAL-1048: özet şeridi + kanal kartlarındaki Etkin / Pasif durumu (kayıtlı ayardan).
const activeCodes = computed(() => activeCodesOf(clientMarketplaces.value))

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
    noteSettings(clientMarketplace?.code ?? editingClientIntegration.value.code, response.settings)
  }
}

const setAndRetrieveEditingClientMarketplace = async (integrationCode: string) => {
  let guid = loadingComponentRef.value.info(t('loading.info.newProduct'))
  const response = await restApi.post("IntegrationService/retrieveClientMarketplaceSettings", { integrationCode })
  loadingComponentRef.value.remove(guid)
  if (response && response.settings) {
    editingClientIntegration.value = response
    noteSettings(response.code ?? integrationCode, response.settings)
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
