<template>
  <div class="marketplaceView">
    <div class="workarea-scroll screen-scroll-inset">
      <LoadingComponent attach=".marketplaceView" ref="loadingComponentRef"></LoadingComponent>

      <div class="pa-6 pb-0">
        <EkPageHeader section="Entegrasyonlar" title="Pazaryeri"
          description="Pazaryeri hesaplarınızı bağlayın ve API ayarlarını buradan yönetin." />
      </div>

      <v-row class="ma-0">
        <v-col cols="12" lg="8" class="pa-0">
          <div class="pa-6">
            <IntegrationPlatformRail :items="clientMarketplaces" :model-value="editingClientIntegration.code"
              :live-codes="LIVE_CODES" ariaLabel="Pazar yeri seçimi"
              @select="setAndRetrieveEditingClientMarketplace" />
            <DividerComponent />
          </div>
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
              <EkEmptyState v-else variant="not-connected" title="Başlamak İçin Seçim Yapın"
                message="Yukarıdaki listeden bir pazar yeri seçerek ayarları yönetmeye başlayabilirsiniz." />
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
import HepsiburadaComponent from '@/components/integrations/marketplace/HepsiburadaComponent.vue'
import TrendyolComponent from '@/components/integrations/marketplace/TrendyolComponent.vue'
import N11Component from '@/components/integrations/marketplace/N11Component.vue'
import PazaramaComponent from '@/components/integrations/marketplace/PazaramaComponent.vue'
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

// `docs/INTEGRATIONS_REGISTRY.md`'deki 6 canlı koddan bu ekranı ilgilendiren 4'ü
// (ADR-0015 N13 — "Yakında" durumu ile aynı canlı küme, ADR-0014 ile tutarlı).
const LIVE_CODES = ['trendyol', 'hepsiburada', 'n11', 'pazarama']

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

.step-number {
  min-width: var(--ek-space-6);
  height: var(--ek-space-6);
  background: var(--ek-color-passive-color);
  /* Beyaz metin daire içindeki marka rengi üzerinde sabit kalır (dekoratif rozet,
     "app background" anlamına gelen `background` token'ıyla KARIŞTIRILMAZ) — bu yüzden
     bilinçli olarak literal CSS anahtar sözcüğü olarak bırakıldı; ratchet'in izlediği
     hex/rgb/inline-style/cubic-bezier/motion kategorilerine dahil değil. */
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
