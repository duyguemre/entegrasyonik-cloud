// Dashboard → ilgili ekran geçişi. Mevcut sekme açma deseni: menü düğümü `menuStore`'dan bulunur,
// isteğe bağlı `parameters` (ör. `internalStatuses`) düğüme yazılır ve `openTab` olayı yayılır
// (WrapperComponent `activate(link.parameters)` ile ekrana iletir).
//
// Menü, sunucunun kullanıcıya verdiği yetkilere göre gelir: bir ekranın menü düğümü yoksa kullanıcı
// o ekrana erişemez → kart başlığındaki ok ve satır bağlantıları GİZLENİR (`canOpen`).
import { inject } from 'vue'
import type { Emitter } from 'mitt'
import { useMenuStore } from '@/stores/site/menu'

export type DashboardScreen =
  | 'orderList'
  | 'claimList'
  | 'messageList'
  | 'productList'
  | 'productDefinition'
  | 'logList'
  | 'marketplace'
  | 'StockHealthView'
  | 'integrations/IntegrationHealthView'

export function useDashboardNavigation() {
  const menuStore: any = useMenuStore()
  const eventBus = inject('eventBus') as Emitter<any> | undefined

  const linkOf = (screen: DashboardScreen) => menuStore.getMenuLinkWithCode(screen)

  const canOpen = (screen: DashboardScreen) => Boolean(linkOf(screen))

  const open = (screen: DashboardScreen, parameters?: Record<string, unknown>) => {
    const link = linkOf(screen)
    if (!link) return
    link.parameters = parameters
    eventBus?.emit('openTab', link)
  }

  return { canOpen, open }
}
