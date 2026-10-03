<template>
  <div class="ecommerceView">
    <div class="workarea-scroll screen-scroll-inset">
      <LoadingComponent attach=".ecommerceView" ref="loadingComponentRef"></LoadingComponent>

      <div class="ek-integration-head">
        <EkPageHeader section="Entegrasyonlar" title="E-Ticaret"
          description="E-ticaret altyapınızı bağlayın ve API ayarlarını buradan yönetin.">
          <template #tools><EkViewSwitch v-model="view" /></template>
        </EkPageHeader>
      </div>

      <div class="ek-integration-page">
        <!-- FE-LOCAL-1048: Liste | Özet — özet, bağlantı ayarlarının YERİNE açılır (ikisi aynı sayfada durmaz). -->
        <IntegrationOverview v-if="view === 'summary' && clientECommerces?.length" title="E-Ticaret" noun="e-ticaret platformu" :items="clientECommerces" :live-codes="liveCodes"
          :active-codes="activeCodes" list-label="E-ticaret platformları" :current="editingClientIntegration.code"
          @select="(code: string) => { setAndRetrieveEditingClientECommerce(code); view = 'list' }" />
      <div v-show="view === 'list'" class="ek-integration-layout">
        <div class="ek-integration-layout__main">
          <ListDashSection label="E-ticaret platformları">
            <IntegrationPlatformRail :items="clientECommerces" :model-value="editingClientIntegration.code"
              :live-codes="liveCodes" :active-codes="activeCodes" ariaLabel="E-ticaret platformu seçimi"
              @select="setAndRetrieveEditingClientECommerce" />
          </ListDashSection>
          <ListDashSection label="Bağlantı ayarları">
          <div class="ek-integration-stack">
          <v-form ref="newVariantFormRef" v-model="isFormValid">
            <v-card-text class="pa-0 px-0" role="tabpanel"
              :aria-label="editingClientIntegration.code ? `${editingClientIntegration.code} ayarları` : 'Seçim bekleniyor'">
              <div v-if="editingClientIntegration.code">
                <template v-if="editingClientIntegration.code == 'ideasoft'">
                  <IdeasoftComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientECommerceSettings" @refresh="setAndRetrieveEditingClientECommerce" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'ticimax'">
                  <TicimaxComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientECommerceSettings" @refresh="setAndRetrieveEditingClientECommerce" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'shopify'">
                  <ShopifyComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientECommerceSettings" @refresh="setAndRetrieveEditingClientECommerce" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'woocommerce'">
                  <WooCommerceComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientECommerceSettings" @refresh="setAndRetrieveEditingClientECommerce" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'opencart'">
                  <OpencartComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientECommerceSettings" @refresh="setAndRetrieveEditingClientECommerce" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'wix'">
                  <WixComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientECommerceSettings" @refresh="setAndRetrieveEditingClientECommerce" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'anka'">
                  <AnkaETicaretComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientECommerceSettings" @refresh="setAndRetrieveEditingClientECommerce" />
                </template>
                <template v-else-if="editingClientIntegration.code == 'eticaretsoft'">
                  <ETicaretSoftComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientECommerceSettings" @refresh="setAndRetrieveEditingClientECommerce" />
                </template>
                <template v-else>
                  <IntegrationComingSoonPanel :platform-name="displayPlatformName(editingClientIntegration.code)"
                    category="e-ticaret" />
                </template>
              </div>
              <EkEmptyState v-else variant="not-connected" title="Başlamak için seçim yapın"
                message="Yukarıdaki listeden bir e-ticaret platformu seçerek ayarları yönetmeye başlayabilirsiniz." />
            </v-card-text>
          </v-form>
          <!-- FE-LOCAL-1048: kapsam ikincil bilgi — ayar formunun ALTINDA, katlanır sakin satır. -->
          <IntegrationCapabilityChips v-if="isLive(editingClientIntegration.code)" :code="editingClientIntegration.code"
            category="ecommerce" :show-health-link="!!healthLink" @open-health="openHealth" />
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
import IdeasoftComponent from '@/components/integrations/ecommerce/IdeasoftComponent.vue'
import TicimaxComponent from '@/components/integrations/ecommerce/TicimaxComponent.vue'
import ShopifyComponent from '@/components/integrations/ecommerce/ShopifyComponent.vue'
import WooCommerceComponent from '@/components/integrations/ecommerce/WooCommerceComponent.vue'
import OpencartComponent from '@/components/integrations/ecommerce/OpencartComponent.vue'
import WixComponent from '@/components/integrations/ecommerce/WixComponent.vue'
import AnkaETicaretComponent from '@/components/integrations/ecommerce/AnkaETicaretComponent.vue'
import ETicaretSoftComponent from '@/components/integrations/ecommerce/ETicaretSoftComponent.vue'
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
import { useIntegrationScreen } from '@/components/integrations/useIntegrationScreen'

// C1.2 — canlı küme `getCatalog` manifestosundan (yedek: `FALLBACK_LIVE_CODES`, bkz. `integrationCatalog.ts`).
const { liveCodes, isLive, healthLink, openHealth, comingSoonGuide, noteSettings, activeCodesOf } = useIntegrationScreen('ecommerce')
// FE-LOCAL-1048: Liste | Özet — varsayılan ayarlar; Özet ayar düzeninin yerine açılır.
const view = ref<EkViewMode>('list')

const integrationStore: any = useIntegrationStore()
const { t } = useI18n()
const isFormValid = ref(false)
const loadingComponentRef: any = ref(null)
const restApi = useRestApi()
const editingClientIntegration: any = ref({ settings: {} })

const guideSteps = [
  { title: 'Kanalı seçin', text: 'Üstteki ikonlara tıklayarak işlem yapacağınız e-ticaret sitesini seçin.' },
  { title: 'API bağlantısı', text: 'E-ticaret panelinden aldığınız API anahtarlarını ilgili alanlara girin.' },
  { title: 'Senkronizasyon', text: 'Bağlantı sağlandıktan sonra ürün ve sipariş verileriniz otomatik olarak eşitlenecektir.' }
]

onMounted(() => {
  if (clientECommerces.value && clientECommerces.value.length > 0)
    setAndRetrieveEditingClientECommerce(clientECommerces.value[0].code)
})

// FE-LOCAL-1048: özet şeridi + kanal kartlarındaki Etkin / Pasif durumu (kayıtlı ayardan).
const activeCodes = computed(() => activeCodesOf(clientECommerces.value))

const clientECommerces = computed(() => integrationStore.getClientECommerces())

function displayPlatformName(code: string) {
  return code ? code.charAt(0).toUpperCase() + code.slice(1) : ''
}

const saveClientECommerceSettings = async (clientECommerce: any) => {
  let guid = loadingComponentRef.value.info(t('loading.info.newProduct'))
  const response = await restApi.post("IntegrationService/saveClientECommerceSettings", { clientECommerce })
  loadingComponentRef.value.remove(guid)
  if (response && response._id) {
    editingClientIntegration.value.settings = response.settings
    noteSettings(clientECommerce?.code ?? editingClientIntegration.value.code, response.settings)
  }
}

const setAndRetrieveEditingClientECommerce = async (integrationCode: string) => {
  let guid = loadingComponentRef.value.info(t('loading.info.newProduct'))
  const response = await restApi.post("IntegrationService/retrieveClientECommerceSettings", { integrationCode })
  loadingComponentRef.value.remove(guid)
  if (response && response.settings) {
    editingClientIntegration.value = response
    noteSettings(response.code ?? integrationCode, response.settings)
  }
}
</script>

<style scoped>
.ecommerceView {
  background-color: var(--ek-color-surface-muted);
}

/* Kaydırma alanının alt boşluğu — bkz. MarketplaceView.vue'daki aynı desenin gerekçe notu. */
.screen-scroll-inset {
  bottom: var(--ek-space-1);
}

.opacity-40 {
  opacity: 0.4;
}
</style>

<style scoped src="@/components/integrations/integration-layout.css"></style>
