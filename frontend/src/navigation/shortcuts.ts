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
  | 'pageRefresh'

export interface ShortcutDefinition {
  id: ShortcutId
  /** Gösterim için tuş dizisi (EkKbd `keys`). */
  keys: readonly string[]
  /** Kısayol listesinde ve tooltip'te görünen açıklama. */
  label: string
  group: 'Genel' | 'Sekmeler' | 'Görünüm' | 'Sayfa'
  /** Metin alanında odak varken de çalışır mı. */
  allowInEditable?: boolean
  /** Aynı eylemi tetikleyen eski tuşlar (geri uyum; listede "ayrıca" olarak gösterilir). */
  aliases?: readonly (readonly string[])[]
  // --- fe-a14 (geri uyumlu, isteğe bağlı): kısayol diyaloğunun anlatım alanları ---
  /** Tek satır "ne işe yarar" açıklaması (diyalog satırının ikinci satırı). */
  description?: string
  /** Diyalog kategorisi; verilmezse `group`'tan türetilir (`GROUP_CATEGORY`). */
  category?: ShortcutCategoryId
  /** Bağlam rozeti (ör. "Her yerde", "Listede"); verilmezse "Her yerde". */
  context?: string
  /** "İpucu" kuşağında öne çıkarılan sıra (1–3; en çok kullanılanlar). */
  featured?: 1 | 2 | 3
  /** Kısa ad (ipucu kartı; verilmezse `label`). */
  shortLabel?: string
}

/**
 * fe-a14 — kısayol diyaloğu kategorileri (sıra = diyalogdaki sıra). Yeni kategori eklemek geriye uyumludur;
 * kaydın her öğesi bu listeden birine düşer (test korur).
 */
export type ShortcutCategoryId = 'navigation' | 'workspace' | 'list' | 'forms' | 'view' | 'help'

export interface ShortcutCategory {
  id: ShortcutCategoryId
  label: string
  /** MDI ikon adı (kategori listesinde). */
  icon: string
  /** Kategori seçildiğinde listenin üstünde görünen tek cümle. */
  description: string
}

export const SHORTCUT_CATEGORIES: readonly ShortcutCategory[] = [
  { id: 'navigation', label: 'Gezinme', icon: 'mdi-compass-outline', description: 'Aramaya, menülere ve sonuçlar arasında hızla ulaşın.' },
  { id: 'workspace', label: 'Sekmeler ve çalışma alanı', icon: 'mdi-tab', description: 'Açık ekranlar arasında geçin, sekmeleri kapatın.' },
  { id: 'list', label: 'Liste ve tablo', icon: 'mdi-table', description: 'Listeyi yenileyin, varyant tablosunda hücreleri düzenleyin.' },
  { id: 'forms', label: 'Formlar', icon: 'mdi-form-textbox', description: 'Alanlar arasında gezinin, gönderin, diyalogları kapatın.' },
  { id: 'view', label: 'Görünüm', icon: 'mdi-page-layout-sidebar-left', description: 'Çalışma alanını genişletin, odak moduna geçin.' },
  { id: 'help', label: 'Yardım', icon: 'mdi-help-circle-outline', description: 'Kısayolları ve yardımı her an açın.' },
] as const

/** `category` verilmemiş kabuk kısayolunun varsayılan kategorisi (eski `group` alanından). */
export const GROUP_CATEGORY: Readonly<Record<ShortcutDefinition['group'], ShortcutCategoryId>> = {
  Genel: 'navigation',
  Sekmeler: 'workspace',
  Görünüm: 'view',
  Sayfa: 'list',
}

export const SHORTCUTS: readonly ShortcutDefinition[] = [
  { id: 'search', keys: ['Ctrl', 'K'], label: 'Akıllı aramaya git (ekran, sipariş, ürün, müşteri)', group: 'Genel', allowInEditable: true,
    description: 'Ekran adı, sipariş no, ürün veya müşteri yazın; sonuca Enter ile gidin.', featured: 1, shortLabel: 'Akıllı arama' },
  { id: 'shortcutHelp', keys: ['?'], label: 'Klavye kısayollarını göster', group: 'Genel',
    description: 'Bu listeyi açar; aradığınız kısayolu adına veya tuşuna göre bulun.', category: 'help' },
  { id: 'tabNext', keys: ['Ctrl', '→'], label: 'Sonraki sekme', group: 'Sekmeler',
    description: 'Sağdaki çalışma alanı sekmesine geçer; sondaysa başa döner.' },
  { id: 'tabPrev', keys: ['Ctrl', '←'], label: 'Önceki sekme', group: 'Sekmeler',
    description: 'Soldaki çalışma alanı sekmesine geçer; baştaysa sona döner.' },
  { id: 'tabGoto', keys: ['Alt', '1…9'], label: 'N. sekmeye git', group: 'Sekmeler',
    description: 'Soldan sıradaki sekmeye tek tuşla atlar (Alt+1 ilk sekme).', featured: 2, shortLabel: 'Sekmeye atla' },
  { id: 'tabClose', keys: ['Alt', 'W'], label: 'Etkin sekmeyi kapat', group: 'Sekmeler',
    description: 'Açık ekranı kapatır; sabit Anasayfa sekmesi kapanmaz.' },
  // Metin/zengin metin alanında Ctrl+B "kalın" demektir (ör. açıklama editörü) — orada EZİLMEZ.
  { id: 'sidebarToggle', keys: ['Ctrl', 'B'], label: 'Sol menüyü daralt / genişlet', group: 'Görünüm',
    description: 'Menüyü ikon şeridine indirir; tablolar için yer açar.' },
  // Aşama 5: üst bölüm düğmesi sekme şeridinden kalktı (üst barın altındaki yüzen tutamak + bu kısayol).
  // Ctrl+Shift+H: Chrome/Electron'da ayrılmış değil; metin alanında karakter üretmez. Eski Alt+U takma ad olarak çalışır.
  { id: 'headerToggle', keys: ['Ctrl', 'Shift', 'H'], label: 'Üst bölümü daralt / göster', group: 'Görünüm', allowInEditable: true, aliases: [['Alt', 'U']],
    description: 'Üst barı gizleyip gösterir; sekmeler ekranın en üstüne çıkar.' },
  { id: 'focusMode', keys: ['Ctrl', 'Shift', 'F'], label: 'Tam ekran (odak modu: üst bar ve sol menü gizlenir)', group: 'Görünüm', allowInEditable: true,
    description: 'Yalnız çalışma alanı kalır; aynı tuşla çıkarsınız.' },
  // Aşama 6b (Standart 9): etkin sekmenin sayfa verisini yenile. Ctrl+R / F5 tarayıcıyı yeniler (EZİLMEZ — tüm
  // çalışma alanı sekmeleri kaybolurdu); Alt+R Chrome/Edge/Electron'da ayrılmış değil, AltGr (Ctrl+Alt) ile çakışmaz.
  // Metin alanında çalışmaz (yazma sırasında yanlışlıkla yenileme yok).
  { id: 'pageRefresh', keys: ['Alt', 'R'], label: 'Sayfa verisini yenile (etkin sekme)', group: 'Sayfa',
    description: 'Yalnız açık sekmenin verisini tazeler; diğer sekmeler ve filtreler korunur.', context: 'Sayfada', featured: 3, shortLabel: 'Veriyi yenile' },
] as const

export const SHORTCUT_GROUPS: ReadonlyArray<{ label: ShortcutDefinition['group']; items: ShortcutDefinition[] }> = (
  ['Genel', 'Sekmeler', 'Görünüm', 'Sayfa'] as const
).map((label) => ({ label, items: SHORTCUTS.filter((s) => s.group === label) }))

/**
 * fe-a14 — BİLEŞEN içi kısayollar (başvuru kaydı). Bunları kabuğun global dinleyicisi DEĞİL, odaktaki bileşen işler
 * (satırdaki "Kaynak" yorumu). Kısayol diyaloğu ve yardım "tüm kısayollar"ı buradan + `SHORTCUTS`'tan üretir; bir
 * bileşene yeni tuş eklendiğinde buraya da bir satır eklenir → diyalog kendiliğinden güncellenir.
 * `matchShortcut` bu kaydı OKUMAZ (davranış değişmez).
 */
export interface ShortcutReference {
  /** Tekil kimlik (`SHORTCUTS` kimlikleriyle de çakışmaz — test korur). */
  id: string
  keys: readonly string[]
  label: string
  description: string
  category: ShortcutCategoryId
  /** Bağlam rozeti: kısayolun çalıştığı yer (ör. "Listede", "Dialogda"). */
  context: string
  aliases?: readonly (readonly string[])[]
  /** true: tuşlar birlikte değil SIRAYLA basılır ("G sonra D"). */
  sequence?: boolean
  featured?: 1 | 2 | 3
  shortLabel?: string
}

export const CONTEXT_SHORTCUTS: readonly ShortcutReference[] = [
  // Kaynak: EkSmartSearch.vue onKeydown (ArrowDown/ArrowUp/Enter/Escape).
  { id: 'searchMove', keys: ['↑'], aliases: [['↓']], label: 'Sonuçlar arasında gezin', description: 'Akıllı arama sonuç listesinde bir üst / alt sonuca geçer.', category: 'navigation', context: 'Aramada' },
  { id: 'searchOpen', keys: ['Enter'], label: 'Seçili sonucu aç', description: 'Vurgulanan ekranı veya kaydı çalışma alanında açar.', category: 'navigation', context: 'Aramada' },
  { id: 'searchClose', keys: ['Esc'], label: 'Aramayı kapat', description: 'Sonuç listesini kapatır ve aramadan çıkar.', category: 'navigation', context: 'Aramada' },
  // Kaynak: EkMenuPanel.vue (↑/↓ Home End Enter/Space Esc).
  { id: 'menuMove', keys: ['↑'], aliases: [['↓']], label: 'Menüde gezin', description: 'Satır ⋯, hesap ve yardım menülerinde; Home / End ilk ve son öğe.', category: 'navigation', context: 'Menüde' },
  { id: 'menuSelect', keys: ['Enter'], label: 'Menü öğesini seç', description: 'Odaktaki menü öğesini çalıştırır.', category: 'navigation', context: 'Menüde', aliases: [['Space']] },
  { id: 'menuClose', keys: ['Esc'], label: 'Menüyü kapat', description: 'Menüyü seçim yapmadan kapatır.', category: 'navigation', context: 'Menüde' },
  // Kaynak: EkWorkspaceTabs.vue onKeydown (ArrowLeft/Right, Home/End, Enter/Space, Delete, Shift+F10 / ContextMenu).
  { id: 'stripMove', keys: ['←'], aliases: [['→']], label: 'Sekme şeridinde gezin', description: 'Odak şeritteyken sekmeler arasında dolaşır; Home / End uçlar, Enter açar.', category: 'workspace', context: 'Sekme şeridinde' },
  { id: 'stripClose', keys: ['Delete'], label: 'Odaktaki sekmeyi kapat', description: 'Şeritte odaklanmış sekmeyi kapatır (sabit sekmeler hariç).', category: 'workspace', context: 'Sekme şeridinde' },
  { id: 'stripMenu', keys: ['Shift', 'F10'], label: 'Sekme menüsünü aç', description: 'Kapat, diğerlerini kapat, sağdakileri kapat seçenekleri.', category: 'workspace', context: 'Sekme şeridinde', aliases: [['Menü']] },
  // Kaynak: EkDataGrid.vue toggleSort (artan → azalan → kapalı).
  { id: 'gridSort', keys: ['Enter'], label: 'Sütuna göre sırala', description: 'Başlıktaki sıralama düğmesinde: artan → azalan → sıralamasız.', category: 'list', context: 'Tablo başlığında' },
  // Kaynak: useVariantSheet.ts onKeydown + VariantGrid/VariantBulkEditor copy/paste olayları.
  { id: 'sheetEdit', keys: ['Enter'], label: 'Hücreyi düzenle', description: 'Seçili hücrede düzenlemeyi açar; yazmaya başlamak da açar.', category: 'list', context: 'Varyant tablosunda', aliases: [['F2']] },
  { id: 'sheetExtend', keys: ['Shift', '↓'], label: 'Seçimi genişlet', description: 'Shift basılıyken oklarla birden çok hücre seçin.', category: 'list', context: 'Varyant tablosunda' },
  { id: 'sheetFillDown', keys: ['Ctrl', 'D'], label: 'Aşağı doldur', description: 'Seçimin ilk satırındaki değeri alttaki hücrelere kopyalar.', category: 'list', context: 'Varyant tablosunda' },
  { id: 'sheetUndo', keys: ['Ctrl', 'Z'], label: 'Geri al', description: 'Tablodaki son değişikliği geri alır.', category: 'list', context: 'Varyant tablosunda' },
  { id: 'sheetRedo', keys: ['Ctrl', 'Y'], label: 'Yinele', description: 'Geri alınan değişikliği yeniden uygular.', category: 'list', context: 'Varyant tablosunda', aliases: [['Ctrl', 'Shift', 'Z']] },
  { id: 'sheetSelectAll', keys: ['Ctrl', 'A'], label: 'Tüm hücreleri seç', description: 'Toplu değişiklik için tablonun tamamını seçer.', category: 'list', context: 'Varyant tablosunda' },
  { id: 'sheetClear', keys: ['Delete'], label: 'Seçili hücreleri temizle', description: 'Seçimdeki değerleri siler (kaydetmeden önce geri alınabilir).', category: 'list', context: 'Varyant tablosunda', aliases: [['Backspace']] },
  { id: 'sheetCopy', keys: ['Ctrl', 'C'], label: 'Kopyala / yapıştır', description: 'Hücreleri Excel ile karşılıklı kopyalayıp yapıştırın (Ctrl+V).', category: 'list', context: 'Varyant tablosunda', aliases: [['Ctrl', 'V']] },
  // Tarayıcı standardı (tüm formlar EkFormGrid sırasıyla gezilir).
  { id: 'formNext', keys: ['Tab'], label: 'Sonraki alan', description: 'Formda bir sonraki alana geçer; Shift+Tab bir öncekine döner.', category: 'forms', context: 'Formda', aliases: [['Shift', 'Tab']] },
  // Kaynak: EkFilterPanel.vue (native form submit).
  { id: 'filterSubmit', keys: ['Enter'], label: 'Filtreyi uygula (Sorgula)', description: 'Filtre alanındayken Enter listeyi yeni ölçütlerle getirir.', category: 'forms', context: 'Filtrede' },
  // Kaynak: EkDialog.vue `asForm` (Enter onayı gönderir) + Vuetify v-dialog Esc.
  { id: 'dialogSubmit', keys: ['Enter'], label: 'Formu kaydet', description: 'Form diyaloğunda Enter birincil düğmeyi (Kaydet) çalıştırır.', category: 'forms', context: 'Dialogda' },
  { id: 'dialogClose', keys: ['Esc'], label: 'Diyaloğu kapat', description: 'Kaydetmeden kapatır; yalnız odaktaki sekmenin en üstteki diyaloğu kapanır.', category: 'forms', context: 'Dialogda' },
  // Kaynak: ticketRules.ts isSubmitShortcut (Ctrl/⌘+Enter).
  { id: 'replySend', keys: ['Ctrl', 'Enter'], label: 'Yanıtı gönder', description: 'Destek kaydı yanıt kutusunda yazarken mesajı gönderir.', category: 'forms', context: 'Destek yanıtında' },
  // Kaynak: EkCascadePicker.vue (sütunlar arası ←/→, ↑/↓, Enter).
  { id: 'cascadeMove', keys: ['←'], aliases: [['→']], label: 'Kategori sütunları arasında geç', description: 'Alt kategoriye in (→) veya üst sütuna dön (←); ↑/↓ satırda gezer.', category: 'forms', context: 'Kategori seçicide' },
] as const

/** Metin alanında yazarken de çalışan kısayollar (kısayol diyaloğundaki not buradan üretilir). */
export const EDITABLE_SAFE_SHORTCUTS: readonly ShortcutDefinition[] = SHORTCUTS.filter((s) => s.allowInEditable)

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
  if (mod && !event.altKey && event.shiftKey && (key === 'h' || code === 'KeyH')) return { id: 'headerToggle' }
  if (mod && !event.altKey && !event.shiftKey && key === 'ArrowRight') return { id: 'tabNext' }
  if (mod && !event.altKey && !event.shiftKey && key === 'ArrowLeft') return { id: 'tabPrev' }

  if (event.altKey && !mod) {
    if (!event.shiftKey && (code === 'KeyW' || key === 'w')) return { id: 'tabClose' }
    if (!event.shiftKey && (code === 'KeyR' || key === 'r')) return { id: 'pageRefresh' }
    if (!event.shiftKey && (code === 'KeyU' || key === 'u' || key === 'ü')) return { id: 'headerToggle' }
    const digit = /^Digit([1-9])$/.exec(code)?.[1] ?? (/^[1-9]$/.test(key) ? key : undefined)
    if (!event.shiftKey && digit) return { id: 'tabGoto', index: Number(digit) - 1 }
  }

  if (!mod && !event.altKey && key === '?') return { id: 'shortcutHelp' }
  return undefined
}

/** Takma ad yalnız kendi tuşuyla eşleşir: metin alanında Alt+U (ü karakteri üretebilir) çalışmaz, Ctrl+Shift+H çalışır. */
function isAlias(match: ShortcutMatch, event: ShortcutKeyEvent): boolean {
  return match.id === 'headerToggle' && event.altKey
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
    if (!def?.allowInEditable || isAlias(match, event)) return undefined
  }
  return match
}
