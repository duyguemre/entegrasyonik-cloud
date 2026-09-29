<template>
  <div class="einvoiceView">
    <div class="workarea-scroll screen-scroll-inset">

      <div class="pa-6 pb-0">
        <EkPageHeader section="Entegrasyonlar" title="E-Fatura"
          description="E-fatura sağlayıcınızı seçin ve ayarlarını buradan yönetin." />
      </div>

      <v-row class="ma-0">
        <v-col cols="12" lg="8" class="pa-0">
          <div class="pa-6">
            <IntegrationPlatformRail :items="einvoiceStore.getEInvoices()" :model-value="selectedPlatform"
              :live-codes="LIVE_CODES" ariaLabel="E-fatura sağlayıcısı seçimi" @select="selectPlatform" />
            <DividerComponent />
          </div>

          <v-card-text class="pa-0 px-0" role="tabpanel"
            :aria-label="selectedPlatform ? `${selectedPlatform} ayarları` : 'Seçim bekleniyor'">
            <component v-if="selectedPlatform" :is="getActiveComponent()" :properties="getActiveProperties()"
              @update="onUpdate" />
            <EkEmptyState v-else variant="not-connected" title="Başlamak İçin Seçim Yapın"
              message="Yukarıdaki listeden bir e-fatura sağlayıcısı seçerek ayarları yönetmeye başlayabilirsiniz." />
          </v-card-text>
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

<script setup lang="ts">
import { ref, markRaw } from 'vue'
import useEInvoiceStore from '@/stores/einvoice'
import CardComponent from '@/components/CardComponent.vue'
import DividerComponent from '@/components/layout/DividerComponent.vue'
import EkPageHeader from '@/components/ds/EkPageHeader.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import IntegrationPlatformRail from '@/components/integrations/IntegrationPlatformRail.vue'

import TrendyolEFaturamComponent from '@/components/integrations/einvoice/TrendyolEFaturamComponent.vue'
import TurkcellESirketComponent from '@/components/integrations/einvoice/TurkcellESirketComponent.vue'
import ELogoComponent from '@/components/integrations/einvoice/ELogoComponent.vue'
import GelirIdaresiComponent from '@/components/integrations/einvoice/GelirIdaresiComponent.vue'

const einvoiceStore = useEInvoiceStore()
const selectedPlatform = ref(einvoiceStore.getEInvoices()?.[0]?.code || '')

// `docs/INTEGRATIONS_REGISTRY.md` §5.2 — "NET: backend'de e-fatura sağlayıcı
// entegrasyonu YOK". Canlı küme KASITLI olarak BOŞTUR (N13).
const LIVE_CODES: string[] = []

const componentMap: Record<string, any> = {
  trendyolefaturam: markRaw(TrendyolEFaturamComponent),
  turkcellesirket: markRaw(TurkcellESirketComponent),
  elogo: markRaw(ELogoComponent),
  geliridaresi: markRaw(GelirIdaresiComponent),
}

const guideSteps = [
  { title: 'Sağlayıcıyı Belirleyin', text: 'Üstteki logolara tıklayarak kullandığınız e-fatura sağlayıcısını seçin.' },
  { title: 'API Bağlantısı', text: 'Sağlayıcı panelinizden aldığınız kimlik bilgilerini ilgili alanlara girin.' },
  { title: 'Kaydet ve Test Et', text: 'Kaydettikten sonra bir sipariş üzerinden fatura kesmeyi deneyebilirsiniz.' },
]

function selectPlatform(code: string) {
  selectedPlatform.value = code
}

function getActiveComponent() {
  return componentMap[selectedPlatform.value] || null
}

function getActiveProperties() {
  return einvoiceStore.getEInvoice(selectedPlatform.value)
}

function onUpdate(payload: any) {
  console.log('E-Invoice update:', payload)
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

.opacity-60 {
  opacity: 0.6;
}

.opacity-10 {
  opacity: 0.1;
}
</style>
