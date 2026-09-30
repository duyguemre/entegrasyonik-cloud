/**
 * frontend/src/composables/useOpenIntegrationSettings.ts
 *
 * "Entegrasyon ayarına git": mevcut gezinme yolunu kullanır — menü düğümünü bulup `eventBus.emit('openTab', link)`
 * (NavigationMenu / ApplicationBar / EkCommandPalette ile AYNI yol; `SecureLayout` → `workspace.openTab`).
 * Yeni rota UYDURMAZ. Hedef ekran, entegrasyonun türüne göre menü başlığıdır (`stores/site/menu.ts`,
 * `getMenuLinkWithTitle`): pazaryeri → `marketplace`, e-ticaret → `ecommerce`. MarketplaceView/ECommerceView
 * açılışta ilk platformu seçer (ekran parametre almaz) — belirli platformu önceden seçmek MÜMKÜN DEĞİL.
 *
 * `eventBus` sağlanmamışsa (izole test/vitrin) veya menü düğümü kullanıcıda yoksa `canOpen(code)` false döner
 * ve panel düğmeyi göstermez.
 */
import { inject } from 'vue'
import { useMenuStore } from '@/stores/site/menu'
import { useIntegrationStore } from '@/stores/integrationStore'

const MENU_TITLE_BY_TYPE: Record<string, string> = { marketplace: 'marketplace', ecommerce: 'ecommerce' }

export function useOpenIntegrationSettings() {
  const eventBus: any = inject('eventBus', null)
  const menuStore: any = useMenuStore()
  const integrationStore: any = useIntegrationStore()

  const linkFor = (integrationCode?: string) => {
    if (!integrationCode) return undefined
    let typeCode: string | undefined
    try {
      typeCode = integrationStore.getIntegration(integrationCode)?.type?.code
    } catch {
      return undefined // integrationList henüz yüklenmedi
    }
    const title = typeCode ? MENU_TITLE_BY_TYPE[typeCode] : undefined
    return title ? menuStore.getMenuLinkWithTitle?.(title) : undefined
  }

  const canOpen = (integrationCode?: string) => !!eventBus && !!linkFor(integrationCode)

  const open = (integrationCode?: string) => {
    const link = linkFor(integrationCode)
    if (eventBus && link) eventBus.emit('openTab', link)
  }

  return { canOpen, open }
}
