/**
 * Marka ekranları (liste satırı özeti + kanal eşleme paneli) için ortak kanal/eşleme hesabı.
 * Kanal = müşterinin bağladığı pazaryeri + e-ticaret + ERP; yalnız marka eşlemesi sunanlar
 * ("mappable") sayılır. Eşleme bilgisi markanın `platforms[kod] = { id, title }` alanındadır.
 * Yeni backend alanı YOK: durum bu alandan türetilir (eşli = id dolu, eksik = boş).
 * [eslesme-fiyat WP2, Ek C P1-10 / K-C] "mappable" kaynağı backend yetenek manifestosu (`getCatalog` → `brandMapping === 'id'`:
 * TY/PZ/IS). HB marka ADI gönderir, N11 markayı özellik olarak taşır, BH marka taşımaz → eşleme istenmez ("Eşlenmedi" uyarısı çıkmaz).
 * Katalog alınamazsa eski bayrağa (`hasBrandMapping !== false`) düşülür.
 */
import { computed, ref } from 'vue'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useIntegrationCatalog, type BrandMappingMode } from '@/components/integrations/integrationCatalog'

/** Oturum boyunca paylaşılan kanal → marka eşleme biçimi (katalog bir kez yüklenir). */
const brandModes = ref<Map<string, BrandMappingMode>>(new Map())
let catalogRequested = false

/** Saf: kanal marka eşlemesi istiyor mu (katalog biçimi öncelikli; yoksa eski bayrak). */
export function isBrandMappable(mode: BrandMappingMode | undefined, legacyFlag: unknown): boolean {
  return mode ? mode === 'id' : legacyFlag !== false
}

export interface BrandChannel {
  code: string
  title: string
  /** Platform marka KİMLİĞİ eşlemesi istiyor mu (katalog `brandMapping === 'id'`; yoksa eski `hasBrandMapping !== false`). */
  mappable: boolean
}

export function useBrandChannels() {
  const integrationStore = useIntegrationStore()
  if (!catalogRequested) {
    catalogRequested = true
    void useIntegrationCatalog().getCatalog().then((r) => {
      if (!r.ok) { catalogRequested = false; return }
      brandModes.value = new Map(r.data.filter((e) => e.brandMapping).map((e) => [e.code, e.brandMapping as BrandMappingMode]))
    })
  }

  const channels = computed<BrandChannel[]>(() => {
    const list = [
      ...(integrationStore.getClientMarketplaces() ?? []),
      ...(integrationStore.getClientECommerces() ?? []),
      ...(integrationStore.getClientErps() ?? []),
    ]
    return list.map((i: any) => ({
      code: i.code,
      title: i.title || (i.code ? String(i.code).charAt(0).toUpperCase() + String(i.code).slice(1) : ''),
      mappable: isBrandMappable(brandModes.value.get(String(i.code).toLowerCase()), i.hasBrandMapping),
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
