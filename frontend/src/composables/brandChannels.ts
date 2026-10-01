/**
 * Marka ekranları (liste satırı özeti + kanal eşleme paneli) için ortak kanal/eşleme hesabı.
 * Kanal = müşterinin bağladığı pazaryeri + e-ticaret + ERP; yalnız marka eşlemesi sunanlar
 * ("mappable") sayılır. Eşleme bilgisi markanın `platforms[kod] = { id, title }` alanındadır.
 * Yeni backend alanı YOK: durum bu alandan türetilir (eşli = id dolu, eksik = boş).
 */
import { computed } from 'vue'
import { useIntegrationStore } from '@/stores/integrationStore'

export interface BrandChannel {
  code: string
  title: string
  /** Platform marka eşleme yeteneği sunuyor mu (hasBrandMapping !== false). */
  mappable: boolean
}

export function useBrandChannels() {
  const integrationStore = useIntegrationStore()

  const channels = computed<BrandChannel[]>(() => {
    const list = [
      ...(integrationStore.getClientMarketplaces() ?? []),
      ...(integrationStore.getClientECommerces() ?? []),
      ...(integrationStore.getClientErps() ?? []),
    ]
    return list.map((i: any) => ({
      code: i.code,
      title: i.title || (i.code ? String(i.code).charAt(0).toUpperCase() + String(i.code).slice(1) : ''),
      mappable: i.hasBrandMapping !== false,
    }))
  })

  const mappableChannels = computed(() => channels.value.filter((c) => c.mappable))
  const unmappableChannels = computed(() => channels.value.filter((c) => !c.mappable))

  const isMapped = (brand: any, code: string) => brand?.platforms?.[code]?.id != null && brand.platforms[code].id !== ''

  /** Markanın eşleme özeti: hangi kanallarda eşli, hangilerinde eksik. */
  const summarize = (brand: any) => {
    const mapped = mappableChannels.value.filter((c) => isMapped(brand, c.code))
    const missing = mappableChannels.value.filter((c) => !isMapped(brand, c.code))
    return { mapped, missing, total: mappableChannels.value.length }
  }

  return { channels, mappableChannels, unmappableChannels, isMapped, summarize }
}
