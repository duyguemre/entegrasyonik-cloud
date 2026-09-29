/**
 * frontend/src/navigation/shortcuts.ts
 *
 * DS-v2 Aşama 2 (kabuk) — klavye kısayolu KAYDI. Kabuğun tüm kısayolları
 * YALNIZCA burada tanımlanır; üç tüketici aynı kaydı okur:
 *   1. `SecureLayout.vue` global `keydown` dinleyicisi → `matchShortcut()`
 *   2. menü/tooltip/düğme etiketleri → `shortcutKeys()` (EkKbd ile gösterim)
 *   3. `?` ile açılan kısayol listesi diyaloğu → `SHORTCUT_GROUPS`
 * SAF TS (vue/vuetify/`@/` bileşen import'u YOK — screens.ts ile aynı disiplin).
 *
 * Tuş seçimi ilkeleri:
 *  - Tarayıcının/işletim sisteminin ayrılmış kısayolları EZİLMEZ (Ctrl+W/T/N,
 *    Alt+←/→ geri-ileri, Alt+F menü, F11). Sekme kapatma bu yüzden Alt+W.
 *  - Metin alanındayken (input/textarea/contenteditable) yazma davranışı
 *    bozulmaz: `allowInEditable` işaretli olmayan kısayollar orada TETİKLENMEZ
 *    (ör. Ctrl+←/→ metin içinde kelime atlamaya devam eder, `?` yazılabilir).
 *  - AltGr (Windows'ta Ctrl+Alt olarak gelir) Türkçe klavyede karakter üretir;
 *    Alt'lı kısayollar Ctrl basılıyken eşleşmez.
 */

export type ShortcutId =
  | 'search'
  | 'tabNext'
  | 'tabPrev'
  | 'tabClose'
  | 'tabGoto'
  | 'sidebarToggle'
  | 'headerToggle'
  | 'focusMode'
  | 'shortcutHelp'

export interface ShortcutDefinition {
  id: ShortcutId
  /** Gösterim için tuş dizisi (EkKbd `keys`). */
  keys: readonly string[]
  /** Kısayol listesinde ve tooltip'te görünen açıklama. */
  label: string
  group: 'Genel' | 'Sekmeler' | 'Görünüm'
  /** Metin alanında odak varken de çalışır mı. */
  allowInEditable?: boolean
}

export const SHORTCUTS: readonly ShortcutDefinition[] = [
  { id: 'search', keys: ['Ctrl', 'K'], label: 'Akıllı aramaya git (ekran, sipariş, ürün, müşteri)', group: 'Genel', allowInEditable: true },
  { id: 'shortcutHelp', keys: ['?'], label: 'Klavye kısayollarını göster', group: 'Genel' },
  { id: 'tabNext', keys: ['Ctrl', '→'], label: 'Sonraki sekme', group: 'Sekmeler' },
  { id: 'tabPrev', keys: ['Ctrl', '←'], label: 'Önceki sekme', group: 'Sekmeler' },
  { id: 'tabGoto', keys: ['Alt', '1…9'], label: 'N. sekmeye git', group: 'Sekmeler' },
  { id: 'tabClose', keys: ['Alt', 'W'], label: 'Etkin sekmeyi kapat', group: 'Sekmeler' },
  { id: 'sidebarToggle', keys: ['Ctrl', 'B'], label: 'Sol menüyü daralt / genişlet', group: 'Görünüm', allowInEditable: true },
  { id: 'headerToggle', keys: ['Alt', 'U'], label: 'Üst bölümü daralt / göster', group: 'Görünüm' },
  { id: 'focusMode', keys: ['Ctrl', 'Shift', 'F'], label: 'Odak modu (tam ekran çalışma alanı)', group: 'Görünüm', allowInEditable: true },
] as const

export const SHORTCUT_GROUPS: ReadonlyArray<{ label: ShortcutDefinition['group']; items: ShortcutDefinition[] }> = (
  ['Genel', 'Sekmeler', 'Görünüm'] as const
).map((label) => ({ label, items: SHORTCUTS.filter((s) => s.group === label) }))

export function shortcutKeys(id: ShortcutId): string[] {
  return [...(SHORTCUTS.find((s) => s.id === id)?.keys ?? [])]
}

/** Etiket + kısayol metni (aria-label/title için): "Menüyü daralt (Ctrl+B)". */
export function withShortcut(label: string, id: ShortcutId): string {
  return `${label} (${shortcutKeys(id).join('+')})`
}

/** `matchShortcut`'ın ihtiyaç duyduğu KeyboardEvent alt kümesi (test edilebilirlik için). */
export interface ShortcutKeyEvent {
  key: string
  code?: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export interface ShortcutMatch {
  id: ShortcutId
  /** `tabGoto` için 0-tabanlı sekme sırası. */
  index?: number
}

/** Odak bir metin giriş alanında mı (input/textarea/select/contenteditable). */
export function isEditableTarget(target: EventTarget | null | undefined): boolean {
  const el = target as (HTMLElement & { isContentEditable?: boolean }) | null
  if (!el || typeof el !== 'object' || !('tagName' in el)) return false
  if (el.isContentEditable) return true
  const tag = String(el.tagName).toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag !== 'INPUT') return false
  const type = String((el as HTMLInputElement).type || 'text').toLowerCase()
  return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file', 'image'].includes(type)
}

function raw(event: ShortcutKeyEvent): ShortcutMatch | undefined {
  const mod = event.ctrlKey || event.metaKey
  const key = event.key.length === 1 ? event.key.toLocaleLowerCase('en-US') : event.key
  // `code` klavye düzeninden bağımsızdır (Türkçe Q/F klavyede de doğru harf).
  const code = event.code ?? ''

  if (mod && !event.altKey && !event.shiftKey && (key === 'k' || code === 'KeyK')) return { id: 'search' }
  if (mod && !event.altKey && !event.shiftKey && (key === 'b' || code === 'KeyB')) return { id: 'sidebarToggle' }
  if (mod && !event.altKey && event.shiftKey && (key === 'f' || code === 'KeyF')) return { id: 'focusMode' }
  if (mod && !event.altKey && !event.shiftKey && key === 'ArrowRight') return { id: 'tabNext' }
  if (mod && !event.altKey && !event.shiftKey && key === 'ArrowLeft') return { id: 'tabPrev' }

  if (event.altKey && !mod) {
    if (!event.shiftKey && (code === 'KeyW' || key === 'w')) return { id: 'tabClose' }
    if (!event.shiftKey && (code === 'KeyU' || key === 'u' || key === 'ü')) return { id: 'headerToggle' }
    const digit = /^Digit([1-9])$/.exec(code)?.[1] ?? (/^[1-9]$/.test(key) ? key : undefined)
    if (!event.shiftKey && digit) return { id: 'tabGoto', index: Number(digit) - 1 }
  }

  if (!mod && !event.altKey && key === '?') return { id: 'shortcutHelp' }
  return undefined
}

/**
 * Bir klavye olayını kayıttaki kısayola eşler. Metin alanında odak varken
 * yalnızca `allowInEditable` kısayolları eşleşir.
 */
export function matchShortcut(event: ShortcutKeyEvent, target?: EventTarget | null): ShortcutMatch | undefined {
  const match = raw(event)
  if (!match) return undefined
  if (isEditableTarget(target)) {
    const def = SHORTCUTS.find((s) => s.id === match.id)
    if (!def?.allowInEditable) return undefined
  }
  return match
}
