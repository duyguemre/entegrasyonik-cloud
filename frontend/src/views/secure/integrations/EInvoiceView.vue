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
          <IntegrationGuideCard :steps="guideSteps" :note="''" />
        </aside>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, markRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import useEInvoiceStore from '@/stores/einvoice'
import IntegrationGuideCard from '@/components/integrations/IntegrationGuideCard.vue'
import EkPageHeader from '@/components/ds/EkPageHeader.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import IntegrationPlatformRail from '@/components/integrations/IntegrationPlatformRail.vue'

import TrendyolEFaturamComponent from '@/components/integrations/einvoice/TrendyolEFaturamComponent.vue'
import TurkcellESirketComponent from '@/components/integrations/einvoice/TurkcellESirketComponent.vue'
import ELogoComponent from '@/components/integrations/einvoice/ELogoComponent.vue'
import GelirIdaresiComponent from '@/components/integrations/einvoice/GelirIdaresiComponent.vue'
import { useIntegrationScreen } from '@/components/integrations/useIntegrationScreen'

const { t } = useI18n()

const einvoiceStore = useEInvoiceStore()
const selectedPlatform = ref(einvoiceStore.getEInvoices()?.[0]?.code || '')

// `docs/INTEGRATIONS_REGISTRY.md` §5.2 — "NET: backend'de e-fatura sağlayıcı entegrasyonu YOK". C1.2: canlı küme
// `getCatalog` manifestosundan gelir (bugün BOŞ; yedek `FALLBACK_LIVE_CODES.einvoice` da boş — N13).
const { liveCodes } = useIntegrationScreen('einvoice')

const componentMap: Record<string, any> = {
  trendyolefaturam: markRaw(TrendyolEFaturamComponent),
  turkcellesirket: markRaw(TurkcellESirketComponent),
  elogo: markRaw(ELogoComponent),
  geliridaresi: markRaw(GelirIdaresiComponent),
}

// C1.2 — eski adımlar ("Kaydet ve Test Et: … fatura kesmeyi deneyebilirsiniz") gerçeği yansıtmıyordu.
const guideSteps = computed(() => [
  { title: t('integrationComingSoon.guide.step1Title'), text: t('integrationComingSoon.guide.step1Text') },
  { title: t('integrationComingSoon.guide.step2Title'), text: t('integrationComingSoon.guide.step2Text') },
  { title: t('integrationComingSoon.guide.step3Title'), text: t('integrationComingSoon.guide.step3Text') },
])

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
