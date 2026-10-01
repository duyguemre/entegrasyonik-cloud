/**
 * Kabuk klavye kısayolları (BO-ELEV E2, CONSOLE_IDENTITY ilke 4). Saf işleyici — ShellLayout bağlar, hotkeys.test.ts sınar.
 *   g + harf  → ekran (ekran kaydındaki `hotkey`; 1,5 sn içinde)
 *   ?         → kısayol yardımı
 *   Alt+R     → sayfa verisini yenile (görünür ilk `[data-page-refresh]`; EkRefreshButton ipucunda zaten yazıyordu)
 *   j / k     → tablo satırı (NT-10; navigation/rowNav.ts), Enter satırı açar, Esc satır odağından çıkar
 * Metin alanında, açık diyalog/palet varken ya da Ctrl/⌘ ile birlikte basıldığında hiçbir şey yapmaz (Ctrl+K/J kendi
 * işleyicilerinde).
 */
import { HOTKEYS } from './screens'

export const SEQUENCE_MS = 1500

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? ''))
}

export interface HotkeyActions {
  go(path: string): void
  help(): void
  refresh(): void
  /** Açık diyalog / palet / menü örtüsü: kısayollar beklemede. */
  blocked(): boolean
  /** NT-10 satır gezinmesi; true dönerse tuş tüketildi. */
  row?(cmd: 'next' | 'prev' | 'enter' | 'exit'): boolean
  now?(): number
}

export function createHotkeyHandler(actions: HotkeyActions) {
  const now = actions.now ?? (() => Date.now())
  let pendingAt = 0
  return (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || isTypingTarget(e.target) || actions.blocked()) {
      pendingAt = 0
      return
    }
    if (e.altKey) {
      if (e.code === 'KeyR' && !e.shiftKey) {
        e.preventDefault()
        actions.refresh()
      }
      pendingAt = 0
      return
    }
    if (e.key === '?') {
      e.preventDefault()
      pendingAt = 0
      actions.help()
      return
    }
    const key = e.key.toLocaleLowerCase('tr-TR')
    if (pendingAt && now() - pendingAt <= SEQUENCE_MS) {
      pendingAt = 0
      const hit = HOTKEYS.find((h) => h.key === key)
      if (hit) {
        e.preventDefault()
        actions.go(hit.screen.path)
      }
      return
    }
    if (actions.row && !e.shiftKey && !e.altKey) {
      const cmd = key === 'j' ? 'next' : key === 'k' ? 'prev' : e.key === 'Enter' ? 'enter' : e.key === 'Escape' ? 'exit' : null
      if (cmd && actions.row(cmd)) {
        e.preventDefault()
        pendingAt = 0
        return
      }
    }
    pendingAt = key === 'g' && !e.shiftKey ? now() : 0
  }
}

/** Görünür ilk sayfa yenileme düğmesi (sayfa başlığındaki önce gelir; gizli sekmedeki sayılmaz). */
export function clickPageRefresh(root: ParentNode = document) {
  const btn = [...root.querySelectorAll<HTMLButtonElement>('#bo-main [data-page-refresh]')].find((b) => b.offsetParent !== null && !b.disabled)
  btn?.click()
  return !!btn
}
