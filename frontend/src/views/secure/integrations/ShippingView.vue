<template>
  <div class="shippingView">
    <!-- C1.2: kargo kaydı yokken kaydırılan alanda odaklanabilir öğe kalmaz (Kaydet nedenli devre dışı) — klavyeyle
         kaydırılabilsin diye alan odaklanabilir bölgedir (axe scrollable-region-focusable). -->
    <div class="workarea-scroll screen-scroll-inset" tabindex="0" role="region" aria-label="Kargo entegrasyonları">
      <LoadingComponent attach=".shippingView" ref="loadingComponentRef"></LoadingComponent>

      <div class="ek-integration-head">
        <EkPageHeader section="Entegrasyonlar" title="Kargo"
          description="Kargo firmalarınızı bağlayın ve ayarlarını buradan yönetin.">
          <template #tools><EkViewSwitch v-model="view" /></template>
        </EkPageHeader>
      </div>

      <div class="ek-integration-page">
        <!-- FE-LOCAL-1048: Liste | Özet — özet, bağlantı ayarlarının YERİNE açılır (ikisi aynı sayfada durmaz). -->
        <IntegrationOverview v-if="view === 'summary' && clientShipments?.length" title="Kargo" noun="kargo firması" :items="clientShipments" :live-codes="liveCodes"
          :active-codes="activeCodes" list-label="Kargo firmaları" :current="editingClientIntegration.code"
          @select="(code: string) => { setAndRetrieveEditingClientShipment(code); view = 'list' }" />
      <div v-show="view === 'list'" class="ek-integration-layout">
        <div class="ek-integration-layout__main">
          <ListDashSection v-if="clientShipments?.length" label="Kargo firmaları">
            <IntegrationPlatformRail :items="clientShipments" :model-value="editingClientIntegration.code"
              :live-codes="liveCodes" :active-codes="activeCodes" ariaLabel="Kargo firması seçimi"
              @select="setAndRetrieveEditingClientShipment" />
          </ListDashSection>
          <ListDashSection label="Bağlantı ayarları">
          <div class="ek-integration-stack">
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
              <!-- C1.2: mağazada hiç kargo kaydı yoksa "yukarıdan seçin" demek yanıltıcıdır (seçilecek bir şey yok) —
                   kategori düzeyi dürüst "Yakında" paneli + bugün pazaryeri üzerinden yapılabilen (katalogdan). -->
              <IntegrationComingSoonPanel v-else-if="!clientShipments?.length" category="Kargo"
                alternative-capability="shippingNotice" />
              <EkEmptyState v-else variant="not-connected" title="Başlamak için seçim yapın"
                message="Yukarıdaki listeden bir kargo firması seçerek ayarları yönetmeye başlayabilirsiniz." />
            </v-card-text>
          </v-form>
          </div>
          </ListDashSection>
        </div>

        <aside class="ek-integration-layout__aside">
          <ListDashSection label="Rehber">
          <IntegrationGuideCard :steps="comingSoonGuide" note="" />
          </ListDashSection>
        </aside>
      </div>
      </div>
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
import IntegrationGuideCard from '@/components/integrations/IntegrationGuideCard.vue'
import EkPageHeader from '@/components/page/EkPageHeader.vue'
import { EkEmptyState } from '@entegrasyonik/ui/components'
import IntegrationPlatformRail from '@/components/integrations/IntegrationPlatformRail.vue'
import IntegrationOverview from '@/components/integrations/IntegrationOverview.vue'
import EkViewSwitch, { type EkViewMode } from '@/components/page/EkViewSwitch.vue'
import ListDashSection from '@/components/page/ListDashSection.vue'
import IntegrationComingSoonPanel from '@/components/integrations/IntegrationComingSoonPanel.vue'
import { useIntegrationScreen } from '@/components/integrations/useIntegrationScreen'

// `docs/INTEGRATIONS_REGISTRY.md` §5.1 — "NET: backend'de hiçbir kargo API entegrasyonu YOK". C1.2: canlı küme
// `getCatalog` manifestosundan gelir (bugün BOŞ; yedek `FALLBACK_LIVE_CODES.shipping` da boş — N13).
const { liveCodes, comingSoonGuide, noteSettings, activeCodesOf } = useIntegrationScreen('shipment')
// FE-LOCAL-1048: Liste | Özet — varsayılan ayarlar; Özet ayar düzeninin yerine açılır.
const view = ref<EkViewMode>('list')

const integrationStore: any = useIntegrationStore()
const { t } = useI18n()
const isFormValid = ref(false)
const loadingComponentRef: any = ref(null)
const restApi = useRestApi()
const editingClientIntegration: any = ref({ settings: {} })

// C1.2 — eski rehber adımları ("Kaydet ve Aktifleştir: … otomatik olarak aktif hale gelir") gerçeği yansıtmıyordu;
// yerine ortak dürüst `comingSoonGuide` kullanılır.

onMounted(() => {
  if (clientShipments.value && clientShipments.value.length > 0)
    setAndRetrieveEditingClientShipment(clientShipments.value[0].code)
})

// FE-LOCAL-1048: özet şeridi + kanal kartlarındaki Etkin / Pasif durumu (kayıtlı ayardan).
const activeCodes = computed(() => activeCodesOf(clientShipments.value))

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
    noteSettings(clientShipment?.code ?? editingClientIntegration.value.code, response.settings)
  }
}

const setAndRetrieveEditingClientShipment = async (integrationCode: string) => {
  let guid = loadingComponentRef.value.info(t('loading.info.newProduct'))
  const response = await restApi.post("IntegrationService/retrieveClientShipmentSettings", { integrationCode })
  loadingComponentRef.value.remove(guid)
  if (response && response.settings) {
    editingClientIntegration.value = response
    noteSettings(response.code ?? integrationCode, response.settings)
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
</style>

<style scoped src="@/components/integrations/integration-layout.css"></style>
