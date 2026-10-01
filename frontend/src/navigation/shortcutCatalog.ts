/**
 * frontend/src/navigation/shortcutCatalog.ts
 *
 * fe-a14 — klavye kısayolları diyaloğunun SAF mantığı (vue/vuetify import'u YOK; `shortcuts.ts` ile aynı disiplin):
 *   - `buildShortcutCatalog()`  kabuk kaydı (`SHORTCUTS`) + bileşen başvuru kaydı (`CONTEXT_SHORTCUTS`) → tek düz liste.
 *     Diyalogda ELLE yazılmış satır yoktur; kayda eklenen her kısayol diyaloğa kendiliğinden düşer.
 *   - `detectPlatform()` / `platformKeys()` / `spokenKeys()`  macOS'ta ⌘ ⌥ ⇧ sembolleri, Windows/Linux'ta Ctrl/Alt/Shift.
 *     ⌘ gösterimi doğrudur: kabuk eşleyicisi (`matchShortcut`) ve bileşenler Ctrl'ü `ctrlKey || metaKey` olarak okur (test korur).
 *   - `searchShortcuts()` / `highlightParts()`  Türkçe duyarlı arama (ad, açıklama, bağlam, kategori, tuş) + eşleşme vurgusu.
 */
import {
  CONTEXT_SHORTCUTS,
  GROUP_CATEGORY,
  SHORTCUT_CATEGORIES,
  SHORTCUTS,
  type ShortcutCategoryId,
  type ShortcutDefinition,
  type ShortcutReference,
} from '@entegrasyonik/ui/shortcuts'
import { isEditableTarget, type ShortcutKeyEvent } from '@entegrasyonik/ui/shortcuts'
import { CHAT_PRODUCT } from '@entegrasyonik/chat/brand'

export type KeyPlatform = 'mac' | 'win'

export interface CatalogShortcut {
  id: string
  keys: readonly string[]
  aliases: readonly (readonly string[])[]
  label: string
  description: string
  category: ShortcutCategoryId
  context: string
  /** Kabuk geneli (global dinleyici) mi, bileşen içi mi. */
  scope: 'global' | 'context'
  /** Metin alanında yazarken de çalışır (yalnız kabuk kısayolları). */
  allowInEditable: boolean
  sequence: boolean
  featured?: 1 | 2 | 3
  shortLabel: string
}

export const DEFAULT_CONTEXT = 'Her yerde'

export function fromDefinition(def: ShortcutDefinition): CatalogShortcut {
  return {
    id: def.id,
    keys: def.keys,
    aliases: def.aliases ?? [],
    label: def.label,
    description: def.description ?? '',
    category: def.category ?? GROUP_CATEGORY[def.group] ?? 'navigation',
    context: def.context ?? DEFAULT_CONTEXT,
    scope: 'global',
    allowInEditable: !!def.allowInEditable,
    sequence: false,
    featured: def.featured,
    shortLabel: def.shortLabel ?? def.label,
  }
}

export function fromReference(ref: ShortcutReference): CatalogShortcut {
  return {
    id: ref.id,
    keys: ref.keys,
    aliases: ref.aliases ?? [],
    label: ref.label,
    description: ref.description,
    category: ref.category,
    context: ref.context,
    scope: 'context',
    allowInEditable: false,
    sequence: !!ref.sequence,
    featured: ref.featured,
    shortLabel: ref.shortLabel ?? ref.label,
  }
}

// ---- Uygulama düzeyi kabuk kısayolları (ui paketindeki `SHORTCUTS` kaydına DOKUNMADAN; ADR-0034 / CHAT_UI_CONTRACT §7.1) ----

export type AppShortcutId = 'otopilotToggle'

/**
 * Uygulamaya özgü kabuk kısayolları: `@entegrasyonik/ui/shortcuts` kaydı ortak (backoffice de kullanır) ve paralel
 * işler orada; Otopilot girişi bu yüzden burada durur. Diyalog kataloğuna kabuk kısayolu olarak düşer; eşleyici
 * `matchAppShortcut`. Çakışma testi: `tests/shell-shortcuts.test.ts` (ui kaydı + bileşen başvuruları).
 * Ctrl/⌘+J: tarayıcıda "İndirilenler" kısayoludur ama sayfa tarafından ezilebilir (Ctrl+W/T/N gibi ayrılmış değil);
 * sohbet paneli için yaygın beklenen tuş. Metin alanındayken de çalışır (composer'dan paneli kapatmak için).
 */
export const APP_SHORTCUTS: readonly CatalogShortcut[] = [
  {
    id: 'otopilotToggle',
    keys: ['Ctrl', 'J'],
    aliases: [],
    label: `${CHAT_PRODUCT.name} panelini aç / kapat`,
    description: `${CHAT_PRODUCT.name} sohbet panelini açar; açıksa kapatır ve odağı geri verir.`,
    category: 'view',
    context: DEFAULT_CONTEXT,
    scope: 'global',
    allowInEditable: true,
    sequence: false,
    shortLabel: CHAT_PRODUCT.name,
  },
]

export function appShortcutKeys(id: AppShortcutId): string[] {
  return [...(APP_SHORTCUTS.find((s) => s.id === id)?.keys ?? [])]
}

/** Uygulama kısayolu eşleyicisi (ui `matchShortcut` ile aynı kurallar: Ctrl ≡ ⌘, `code` düzen bağımsız). */
export function matchAppShortcut(event: ShortcutKeyEvent, target?: EventTarget | null): AppShortcutId | undefined {
  const mod = event.ctrlKey || event.metaKey
  const key = event.key.length === 1 ? event.key.toLocaleLowerCase('en-US') : event.key
  if (mod && !event.altKey && !event.shiftKey && (key === 'j' || event.code === 'KeyJ')) {
    const def = APP_SHORTCUTS.find((s) => s.id === 'otopilotToggle')
    if (isEditableTarget(target) && !def?.allowInEditable) return undefined
    return 'otopilotToggle'
  }
  return undefined
}

/** Kayıtlardan diyalog kataloğu: kategori sırası `SHORTCUT_CATEGORIES`, kategori içinde önce kabuk sonra bileşen kısayolları. */
export function buildShortcutCatalog(
  global: readonly ShortcutDefinition[] = SHORTCUTS,
  contextual: readonly ShortcutReference[] = CONTEXT_SHORTCUTS,
  app: readonly CatalogShortcut[] = APP_SHORTCUTS,
): CatalogShortcut[] {
  const all = [...global.map(fromDefinition), ...app, ...contextual.map(fromReference)]
  const order = new Map(SHORTCUT_CATEGORIES.map((c, i) => [c.id, i]))
  return all
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (order.get(a.item.category) ?? 99) - (order.get(b.item.category) ?? 99) || a.index - b.index)
    .map((x) => x.item)
}

export const SHORTCUT_CATALOG: readonly CatalogShortcut[] = buildShortcutCatalog()

/** "İpucu" kuşağı: `featured` 1–3 sırasıyla. */
export function featuredShortcuts(catalog: readonly CatalogShortcut[] = SHORTCUT_CATALOG): CatalogShortcut[] {
  return catalog.filter((s) => s.featured).sort((a, b) => (a.featured ?? 9) - (b.featured ?? 9)).slice(0, 3)
}

// ---- Platform ----

interface NavigatorLike {
  platform?: string
  userAgent?: string
  userAgentData?: { platform?: string } | null
}

/** macOS / iOS → 'mac'; diğer her şey (Windows, Linux, ChromeOS) → 'win'. */
export function detectPlatform(nav: NavigatorLike | undefined = typeof navigator === 'undefined' ? undefined : navigator): KeyPlatform {
  if (!nav) return 'win'
  const hint = nav.userAgentData?.platform || nav.platform || nav.userAgent || ''
  return /mac|iphone|ipad|ipod/i.test(hint) ? 'mac' : 'win'
}

const MAC_SYMBOL: Record<string, string> = {
  Ctrl: '⌘',
  Alt: '⌥',
  Shift: '⇧',
  Enter: '↩',
  Backspace: '⌫',
  Delete: '⌦',
}

const SPOKEN: Record<KeyPlatform, Record<string, string>> = {
  win: {},
  mac: { Ctrl: 'Command', Alt: 'Option', Shift: 'Shift', Enter: 'Return', Backspace: 'Delete', Delete: 'İleri sil' },
}
const SPOKEN_COMMON: Record<string, string> = {
  '←': 'Sol ok',
  '→': 'Sağ ok',
  '↑': 'Yukarı ok',
  '↓': 'Aşağı ok',
  '?': 'Soru işareti',
  Esc: 'Escape',
  Space: 'Boşluk',
  '1…9': '1 ile 9 arası',
}

/** Görünen tuş etiketi (platforma göre). */
export function platformKey(key: string, platform: KeyPlatform): string {
  if (platform === 'mac') return MAC_SYMBOL[key] ?? key
  return key === 'Space' ? 'Boşluk' : key
}

export function platformKeys(keys: readonly string[], platform: KeyPlatform): string[] {
  return keys.map((k) => platformKey(k, platform))
}

/** Ekran okuyucu metni: "Command K", "Ctrl artı K", "G sonra D". */
export function spokenKeys(keys: readonly string[], platform: KeyPlatform, sequence = false): string {
  const words = keys.map((k) => SPOKEN[platform][k] ?? SPOKEN_COMMON[k] ?? k)
  return words.join(sequence ? ' sonra ' : platform === 'mac' ? ' ' : ' artı ')
}

// ---- Arama ----

const FOLD: Record<string, string> = { ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' }

/**
 * Türkçe duyarlı katlama — HARF BAŞINA 1:1 (dizin korunur; vurgu aralıkları özgün metne aynen uygulanır).
 * "İ"→"i", "I"→"i", "ş"→"s" …
 */
export function fold(text: string): string {
  let out = ''
  for (const ch of text) {
    const lower = ch.toLocaleLowerCase('tr')
    const single = lower.length === 1 ? lower : ch.toLowerCase().charAt(0)
    out += FOLD[single] ?? single
  }
  return out
}

/** Sorgu → terimler ("ctrl+k" → ["ctrl","k"]; "⌘K" → ["⌘","k"]). */
export function queryTerms(query: string): string[] {
  return fold(query)
    .replace(/([⌘⌥⇧⌃↩⌫⌦←→↑↓])/g, ' $1 ')
    .split(/[\s+]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

const KEY_WORDS: Record<string, string[]> = {
  Ctrl: ['ctrl', 'control', 'kontrol', '⌘', 'cmd', 'command'],
  Alt: ['alt', '⌥', 'option', 'opt'],
  Shift: ['shift', '⇧'],
  Enter: ['enter', '↩', 'return'],
  Esc: ['esc', 'escape'],
  Delete: ['delete', 'del', '⌦'],
  Backspace: ['backspace', '⌫'],
  '←': ['←', 'sol', 'ok'],
  '→': ['→', 'sag', 'ok'],
  '↑': ['↑', 'yukari', 'ok'],
  '↓': ['↓', 'asagi', 'ok'],
  Space: ['space', 'bosluk'],
  '1…9': ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
}

/** Metinde ARANMAYAN, yalnız tuş olarak eşleşen terimler (Latin tuş adları; Türkçe sözcük olanlar — "sol", "ok" — hariç). */
const KEY_ONLY_TERMS = new Set([
  'ctrl', 'control', 'kontrol', 'cmd', 'command', 'alt', 'option', 'opt', 'shift', 'enter', 'return', 'esc', 'escape',
  'delete', 'del', 'backspace', 'tab', 'space', 'home', 'end', 'f2', 'f10',
])

/** Tek tuşun arama terimleri (her iki platform yazımı + konuşma adları). */
export function wordsForKey(key: string): string[] {
  return KEY_WORDS[key] ?? [fold(key)]
}

/** Tuş terimleri (her iki platform yazımı + konuşma adları) — "⌘k" Windows modunda da bulur. */
export function keyWords(item: CatalogShortcut): string[] {
  const combos = [item.keys, ...item.aliases]
  return combos.flatMap((combo) => combo.flatMap(wordsForKey))
}

/** Sorgunun bu tuşu işaret edip etmediği (tuş kapağı vurgusu yalnız eşleşen kapağa). */
export function keyMatchesQuery(key: string, query: string): boolean {
  const terms = queryTerms(query)
  if (!terms.length) return false
  const words = wordsForKey(key)
  return terms.some((t) => words.includes(t))
}

export interface ShortcutMatchInfo {
  item: CatalogShortcut
  /** Tuş terimlerinden biri eşleşti (tuş kapakları vurgulanır). */
  keyMatch: boolean
}

/**
 * Her terim ad/açıklama/bağlam/kategori metninde (içerir) VEYA tuşlarda (tam eşleşme) geçmeli; tek karakterlik terim yalnız tuşta.
 * Boş sorgu → tüm katalog.
 */
export function searchShortcuts(query: string, catalog: readonly CatalogShortcut[] = SHORTCUT_CATALOG): ShortcutMatchInfo[] {
  const terms = queryTerms(query)
  if (!terms.length) return catalog.map((item) => ({ item, keyMatch: false }))
  const catLabel = new Map(SHORTCUT_CATEGORIES.map((c) => [c.id, c.label]))
  const out: ShortcutMatchInfo[] = []
  for (const item of catalog) {
    const text = fold([item.label, item.description, item.context, catLabel.get(item.category) ?? ''].join(' '))
    const keys = keyWords(item)
    let keyMatch = false
    const ok = terms.every((t) => {
      // Tek karakterlik terim ("k", "?", "⌘") ve tuş adı ("alt", "ctrl", "enter") yalnız TUŞ olarak aranır —
      // "ctrl k" metinde k geçen her satırı, "alt" ise "alt sonuca / alttaki" metnini getirmesin.
      if (t.length > 1 && !KEY_ONLY_TERMS.has(t) && text.includes(t)) return true
      if (keys.includes(t)) {
        keyMatch = true
        return true
      }
      return false
    })
    if (ok) out.push({ item, keyMatch })
  }
  return out
}

export interface HighlightPart {
  text: string
  match: boolean
}

/** Metni sorgu terimlerinin geçtiği yerlerde böler (`<mark>` için). Katlama 1:1 olduğundan dizinler özgün metne uyar. */
export function highlightParts(text: string, query: string): HighlightPart[] {
  // Tuş adları ("alt", "ctrl") metinde vurgulanmaz — aramada da metinle eşleşmezler (bkz. searchShortcuts).
  const terms = queryTerms(query).filter((t) => t.length > 1 && !KEY_ONLY_TERMS.has(t))
  if (!terms.length || !text) return [{ text, match: false }]
  const folded = fold(text)
  const hit = new Array<boolean>(folded.length).fill(false)
  for (const term of terms) {
    let from = 0
    for (;;) {
      const at = folded.indexOf(term, from)
      if (at < 0) break
      for (let i = at; i < at + term.length; i++) hit[i] = true
      from = at + term.length
    }
  }
  const chars = [...text]
  const parts: HighlightPart[] = []
  chars.forEach((ch, i) => {
    const match = !!hit[i]
    const last = parts[parts.length - 1]
    if (last && last.match === match) last.text += ch
    else parts.push({ text: ch, match })
  })
  return parts
}
