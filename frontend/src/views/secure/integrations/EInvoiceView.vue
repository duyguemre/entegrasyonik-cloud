<template>
  <div class="einvoiceView">
    <div class="workarea-scroll screen-scroll-inset">

      <div class="pa-6 pb-0">
        <EkPageHeader section="Entegrasyonlar" title="E-Fatura"
          description="E-fatura sağlayıcınızı seçin ve ayarlarını buradan yönetin." />
      </div>

      <div class="ek-integration-layout">
        <div class="ek-integration-layout__main">
          <div>
            <IntegrationPlatformRail :items="einvoiceStore.getEInvoices()" :model-value="selectedPlatform"
              :live-codes="liveCodes" ariaLabel="E-fatura sağlayıcısı seçimi" @select="selectPlatform" />
          </div>

          <v-card-text class="pa-0 px-0" role="tabpanel"
            :aria-label="selectedPlatform ? `${selectedPlatform} ayarları` : 'Seçim bekleniyor'">
            <component v-if="selectedPlatform" :is="getActiveComponent()" :properties="getActiveProperties()" />
            <EkEmptyState v-else variant="not-connected" title="Başlamak için seçim yapın"
              message="Yukarıdaki listeden bir e-fatura sağlayıcısı seçerek ayarları yönetmeye başlayabilirsiniz." />
          </v-card-text>
        </div>

        <aside class="ek-integration-layout__aside">
          <IntegrationGuideCard :steps="comingSoonGuide" note="" />
        </aside>
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
