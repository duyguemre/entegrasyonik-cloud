/**
 * frontend/src/chat/chatLinks.ts — Otopilot çalışma alanı bağlantıları (tam sayfa sohbet + Ayarlar → Otopilot).
 *
 * `help/helpLink.ts` ile AYNI desen: `MenuService` ağacına (ApplicationDB `menus`) bağlı DEĞİL, istemcide kurulur
 * (`singleton:false` + düz `title`; sekme tekilleştirmesi `code` ile). Görünürlük `AgentInfo`'dan (DISABLED → gizli)
 * ve ayarlar için yönetici ipucundan gelir; asıl yetki sınırı backend (`settings:manage`, ADR-0028).
 * Gerçek menü kaydı (ayarlar bölümü) yerel iştir.
 */
import { CHAT_ICON, CHAT_PRODUCT } from '@entegrasyonik/chat/brand'

/** `screens.ts` / `stores/site/menu.ts` views anahtarları. */
export const CHAT_SCREEN_KEY = 'chat'
export const CHAT_SETTINGS_SCREEN_KEY = 'OtopilotSettingsView'
export const CHAT_SCREEN_SLUG = CHAT_PRODUCT.slug
export const CHAT_SETTINGS_SCREEN_SLUG = `settings/${CHAT_PRODUCT.slug}`
/** Sekme başlığı yedeği (dil değişiminde `chatSettingsLink(…, title)` günceller). */
export const CHAT_SETTINGS_TITLE = `${CHAT_PRODUCT.name} ayarları`
export { CHAT_ICON }

type MenuStoreLike = { getViewComponent?: (key: string) => unknown } | null | undefined

const links: Record<string, any> = {}

function clientLink(code: string, title: string, icon: string, menuStore: MenuStoreLike) {
  if (!links[code]) {
    links[code] = { code, parent: '', title, icon, singleton: false, status: true, inMenu: true, isConstant: true }
  }
  if (!links[code].component) links[code].component = menuStore?.getViewComponent?.(code)
  return links[code]
}

export function chatPageLink(menuStore: MenuStoreLike): any {
  return clientLink(CHAT_SCREEN_KEY, CHAT_PRODUCT.name, CHAT_ICON, menuStore)
}

export function chatSettingsLink(menuStore: MenuStoreLike, title: string): any {
  const link = clientLink(CHAT_SETTINGS_SCREEN_KEY, title, 'mdi-cog-outline', menuStore)
  link.title = title
  return link
}

export function isChatClientScreen(key: string): boolean {
  return key === CHAT_SCREEN_KEY || key === CHAT_SETTINGS_SCREEN_KEY
}
