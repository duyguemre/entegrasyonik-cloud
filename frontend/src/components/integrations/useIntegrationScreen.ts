/**
 * frontend/src/components/integrations/useIntegrationScreen.ts
 *
 * C1.2 — entegrasyon ayar ekranlarının (Pazaryeri/E-ticaret/ERP/Kargo/E-fatura) ortak yardımcısı:
 *  - `liveCodes`: "canlı" (kodu olan) sağlayıcılar — `getCatalog` manifestosundan; katalog gelene kadar/gelmezse
 *    `FALLBACK_LIVE_CODES` (aynı 6 kod). Ekran bu kümede OLMAYAN seçimde form yerine "Yakında" paneli gösterir.
 *  - `healthLink`/`openHealth`: "Entegrasyon sağlığı" sekmesi menüde varsa açılır (yoksa bağlantı gösterilmez).
 *  - `comingSoonGuide`: kodu olmayan sağlayıcı seçiliyken rehber kartı "API anahtarını girin" DEMEZ (dürüst adımlar).
 */
import { computed, inject, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMenuStore } from '@/stores/site/menu'
import { FALLBACK_LIVE_CODES, liveCodesFor, toCatalogCategory, useIntegrationCatalog } from './integrationCatalog'

export function useIntegrationScreen(screenCategory: string) {
  const { getCatalog } = useIntegrationCatalog()
  const { t } = useI18n()
  const menuStore: any = useMenuStore()
  const eventBus: any = inject('eventBus', null)

  const liveCodes = ref<string[]>([...(FALLBACK_LIVE_CODES[toCatalogCategory(screenCategory)] ?? [])])

  onMounted(async () => {
    const res = await getCatalog()
    if (res.ok) liveCodes.value = liveCodesFor(res.data, screenCategory)
  })

  function isLive(code: string | undefined | null) {
    return !!code && liveCodes.value.includes(code)
  }

  const healthLink = computed(() => menuStore.getMenuLinkWithCode?.('IntegrationHealthView'))

  function openHealth() {
    if (healthLink.value && eventBus) eventBus.emit('openTab', healthLink.value)
  }

  const comingSoonGuide = computed(() => [
    { title: t('integrationComingSoon.guide.step1Title'), text: t('integrationComingSoon.guide.step1Text') },
    { title: t('integrationComingSoon.guide.step2Title'), text: t('integrationComingSoon.guide.step2Text') },
    { title: t('integrationComingSoon.guide.step3Title'), text: t('integrationComingSoon.guide.step3Text') },
  ])

  return { liveCodes, isLive, healthLink, openHealth, comingSoonGuide }
}
