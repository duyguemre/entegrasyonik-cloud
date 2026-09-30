/**
 * frontend/src/navigation/menuTitle.ts
 *
 * DS-v2 Aşama 3 — menü düğümü başlığının TEK çözümleyicisi (sol menü, ray, akıllı arama,
 * sekme şeridi). `MenuService` düğümlerinin `fullPath`'i (`menu.<üst>.<başlık>`) her zaman
 * bir i18n anahtarına karşılık gelmiyor (ör. `menu.user.user`); eskiden anahtar ham metin
 * olarak ekrana düşüyordu. Sıra: menü anahtarı → üst/başlık varyantları → `screens.ts`
 * `titleKey` → okunur bir yedek (anahtar biçimi ASLA gösterilmez). SAF TS (i18n dışarıdan).
 */
import { resolveScreenByKey, screenKeyForLink } from './screens'

type Translate = (key: string) => string
type Exists = (key: string) => boolean

export interface MenuLinkLike {
  code?: string
  parent?: string
  title?: string
  fullPath?: string
  singleton?: boolean
}

/** i18n'de gerçek bir METİN karşılığı olan ilk anahtarın çevirisi (alt ağaç nesneleri atlanır). */
export function firstMessage(keys: Array<string | undefined>, t: Translate, te: Exists): string | undefined {
  for (const key of keys) {
    if (!key || !te(key)) continue
    const text = t(key)
    if (typeof text === 'string' && text.trim() && text !== key) return text
  }
  return undefined
}

/** `productDefinitions` / `ProductListView` / `change_password` → "Product definitions" biçiminde okunur metin. */
export function humanizeKey(raw: string | undefined): string {
  const base = String(raw ?? '')
    .replace(/View$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ])/g, '$1 $2')
    .trim()
    .toLocaleLowerCase('tr-TR')
  return base ? base.charAt(0).toLocaleUpperCase('tr-TR') + base.slice(1) : ''
}

export function resolveMenuTitle(link: MenuLinkLike | null | undefined, t: Translate, te: Exists): string {
  if (!link) return ''
  if (link.singleton === false && link.title) return String(link.title)
  const title = link.title ?? ''
  const screen = link.code ? resolveScreenByKey(screenKeyForLink({ code: link.code, parent: link.parent })) : undefined
  return (
    firstMessage(
      [
        link.fullPath,
        link.parent ? `menu.${link.parent}.${title}` : undefined,
        title ? `menu.${title}` : undefined,
        title ? `menu.${title}.${title}` : undefined,
        screen?.titleKey,
      ],
      t,
      te,
    ) ?? humanizeKey(title || link.code)
  )
}
