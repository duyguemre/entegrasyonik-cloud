<template>
  <div class="erpView">
    <div class="workarea-scroll screen-scroll-inset">
      <LoadingComponent attach=".erpView" ref="loadingComponentRef"></LoadingComponent>

      <div class="pa-6 pb-0">
        <EkPageHeader section="Entegrasyonlar" title="ERP"
          description="ERP/muhasebe yazılımınızı bağlayın ve API ayarlarını buradan yönetin." />
      </div>

      <div class="ek-integration-layout">
        <div class="ek-integration-layout__main">
          <div>
            <IntegrationPlatformRail :items="clientErps" :model-value="editingClientIntegration.code"
              :live-codes="liveCodes" ariaLabel="ERP platformu seçimi" @select="setAndRetrieveEditingClientErp" />
          </div>
          <IntegrationCapabilityChips v-if="isLive(editingClientIntegration.code)" :code="editingClientIntegration.code"
            category="erp" :show-health-link="!!healthLink" @open-health="openHealth" />
          <v-form ref="newVariantFormRef" v-model="isFormValid">
            <v-card-text class="pa-0 px-0" role="tabpanel"
              :aria-label="editingClientIntegration.code ? `${editingClientIntegration.code} ayarları` : 'Seçim bekleniyor'">
              <div v-if="editingClientIntegration.code">
                <template v-if="editingClientIntegration.code == 'bizimhesap'">
                  <BizimhesapComponent :editingClientIntegration="editingClientIntegration"
                    @update="saveClientErpSettings" @refresh="setAndRetrieveEditingClientErp" />
                </template>
                <template v-else>
                  <IntegrationComingSoonPanel :platform-name="displayPlatformName(editingClientIntegration.code)"
                    category="ERP" />
                </template>
              </div>
              <EkEmptyState v-else variant="not-connected" title="Başlamak için seçim yapın"
                message="Yukarıdaki listeden bir ERP platformu seçerek ayarları yönetmeye başlayabilirsiniz." />
            </v-card-text>
          </v-form>
        </div>

        <aside class="ek-integration-layout__aside">
          <!-- C1.2: kodu olmayan sağlayıcı seçiliyken "API anahtarını girin" adımları gösterilmez. -->
          <IntegrationGuideCard v-if="!editingClientIntegration.code || isLive(editingClientIntegration.code)" :steps="guideSteps" />
          <IntegrationGuideCard v-else :steps="comingSoonGuide" note="" />
        </aside>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import BizimhesapComponent from '@/components/integrations/erp/BizimhesapComponent.vue'
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
const { liveCodes, isLive, healthLink, openHealth, comingSoonGuide } = useIntegrationScreen('erp')

const integrationStore: any = useIntegrationStore()
const { t } = useI18n()
const isFormValid = ref(false)
const loadingComponentRef: any = ref(null)
const restApi = useRestApi()
const editingClientIntegration: any = ref({ settings: {} })

const guideSteps = [
  { title: 'Platformu Belirleyin', text: 'Üstteki ikonlara tıklayarak işlem yapacağınız ERP yazılımını seçin.' },
  { title: 'API Bağlantısı', text: 'ERP panelinizden aldığınız API anahtarlarını ilgili alanlara girin.' },
  { title: 'Ürün Eşleştirme', text: 'Kaydettikten sonra Ürünleri Eşleştir butonuyla verilerinizi senkronize edin.' }
]

onMounted(() => {
  if (clientErps.value && clientErps.value.length > 0)
    setAndRetrieveEditingClientErp(clientErps.value[0].code)
})

const clientErps = computed(() => integrationStore.getClientErps())

function displayPlatformName(code: string) {
  return code ? code.charAt(0).toUpperCase() + code.slice(1) : ''
}

const saveClientErpSettings = async (clientErp: any) => {
  let guid = loadingComponentRef.value.info(t('loading.info.newProduct'))
  const response = await restApi.post("IntegrationService/saveClientErpSettings", { clientErp })
  loadingComponentRef.value.remove(guid)
  if (response && response._id) {
    editingClientIntegration.value.settings = response.settings
  }
}

const setAndRetrieveEditingClientErp = async (integrationCode: string) => {
  let guid = loadingComponentRef.value.info(t('loading.info.newProduct'))
  const response = await restApi.post("IntegrationService/retrieveClientErpSettings", { integrationCode })
  loadingComponentRef.value.remove(guid)
  if (response && response.settings) {
    editingClientIntegration.value = response
  }
}
</script>

<style scoped>
.erpView {
  background-color: var(--ek-color-surface-muted);
}

/* Kaydırma alanının alt boşluğu — bkz. MarketplaceView.vue'daki aynı desenin gerekçe notu. */
.screen-scroll-inset {
  bottom: var(--ek-space-1);
}
</style>

<style scoped src="@/components/integrations/integration-layout.css"></style>
