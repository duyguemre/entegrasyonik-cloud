<template>
  <div class="einvoiceView">
    <div class="workarea-scroll screen-scroll-inset">

      <div class="ek-integration-head">
        <EkPageHeader section="Entegrasyonlar" title="E-Fatura"
          description="E-fatura sağlayıcınızı seçin ve ayarlarını buradan yönetin.">
          <template #tools><EkViewSwitch v-model="view" /></template>
        </EkPageHeader>
      </div>

      <div class="ek-integration-page">
        <!-- FE-LOCAL-1048: Liste | Özet — özet, bağlantı ayarlarının YERİNE açılır (ikisi aynı sayfada durmaz). -->
        <IntegrationOverview v-if="view === 'summary'" title="E-Fatura" noun="e-fatura sağlayıcısı" :items="einvoiceStore.getEInvoices()" :live-codes="liveCodes" list-label="E-fatura sağlayıcıları" :current="selectedPlatform"
          @select="(code: string) => { selectPlatform(code); view = 'list' }" />
      <div v-show="view === 'list'" class="ek-integration-layout">
        <div class="ek-integration-layout__main">
          <ListDashSection label="E-fatura sağlayıcıları">
            <IntegrationPlatformRail :items="einvoiceStore.getEInvoices()" :model-value="selectedPlatform"
              :live-codes="liveCodes" ariaLabel="E-fatura sağlayıcısı seçimi" @select="selectPlatform" />
          </ListDashSection>

          <ListDashSection label="Bağlantı ayarları">
          <v-card-text class="pa-0 px-0" role="tabpanel"
            :aria-label="selectedPlatform ? `${selectedPlatform} ayarları` : 'Seçim bekleniyor'">
            <component v-if="selectedPlatform" :is="getActiveComponent()" :properties="getActiveProperties()" />
            <EkEmptyState v-else variant="not-connected" title="Başlamak için seçim yapın"
              message="Yukarıdaki listeden bir e-fatura sağlayıcısı seçerek ayarları yönetmeye başlayabilirsiniz." />
          </v-card-text>
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

<script setup lang="ts">
import { ref, markRaw } from 'vue'
import useEInvoiceStore from '@/stores/einvoice'
import IntegrationGuideCard from '@/components/integrations/IntegrationGuideCard.vue'
import EkPageHeader from '@/components/page/EkPageHeader.vue'
import { EkEmptyState } from '@entegrasyonik/ui/components'
import IntegrationPlatformRail from '@/components/integrations/IntegrationPlatformRail.vue'
import IntegrationOverview from '@/components/integrations/IntegrationOverview.vue'
import EkViewSwitch, { type EkViewMode } from '@/components/page/EkViewSwitch.vue'
import ListDashSection from '@/components/page/ListDashSection.vue'

import TrendyolEFaturamComponent from '@/components/integrations/einvoice/TrendyolEFaturamComponent.vue'
import TurkcellESirketComponent from '@/components/integrations/einvoice/TurkcellESirketComponent.vue'
import ELogoComponent from '@/components/integrations/einvoice/ELogoComponent.vue'
import GelirIdaresiComponent from '@/components/integrations/einvoice/GelirIdaresiComponent.vue'
import { useIntegrationScreen } from '@/components/integrations/useIntegrationScreen'


const einvoiceStore = useEInvoiceStore()
const selectedPlatform = ref(einvoiceStore.getEInvoices()?.[0]?.code || '')

// `docs/INTEGRATIONS_REGISTRY.md` §5.2 — "NET: backend'de e-fatura sağlayıcı entegrasyonu YOK". C1.2: canlı küme
// `getCatalog` manifestosundan gelir (bugün BOŞ; yedek `FALLBACK_LIVE_CODES.einvoice` da boş — N13).
const { liveCodes, comingSoonGuide } = useIntegrationScreen('einvoice')
// FE-LOCAL-1048: Liste | Özet — varsayılan ayarlar; Özet ayar düzeninin yerine açılır.
const view = ref<EkViewMode>('list')

const componentMap: Record<string, any> = {
  trendyolefaturam: markRaw(TrendyolEFaturamComponent),
  turkcellesirket: markRaw(TurkcellESirketComponent),
  elogo: markRaw(ELogoComponent),
  geliridaresi: markRaw(GelirIdaresiComponent),
}

// C1.2 — eski rehber adımları ("Kaydet ve Test Et: … fatura kesmeyi deneyebilirsiniz") gerçeği yansıtmıyordu;
// yerine ortak dürüst `comingSoonGuide` kullanılır.

function selectPlatform(code: string) {
  selectedPlatform.value = code
}

function getActiveComponent() {
  return componentMap[selectedPlatform.value] || null
}

function getActiveProperties() {
  return einvoiceStore.getEInvoice(selectedPlatform.value)
}

</script>

<style scoped>
.einvoiceView {
  background-color: var(--ek-color-surface-muted);
}

/* Kaydırma alanının alt boşluğu — bkz. MarketplaceView.vue'daki aynı desenin gerekçe notu. */
.screen-scroll-inset {
  bottom: var(--ek-space-1);
}
</style>

<style scoped src="@/components/integrations/integration-layout.css"></style>
