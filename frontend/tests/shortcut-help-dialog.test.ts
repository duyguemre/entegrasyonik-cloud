// fe-a14 — klavye kısayolları diyaloğu: kayıt defterinden türetme, otomatik güncelleme, arama + vurgu,
// platform sembolleri (⌘ gösterimi eşleyiciyle tutarlı), uygulama geneli örtü kuralı (A6b §17.1).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CONTEXT_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  matchShortcut,
  type ShortcutDefinition,
  type ShortcutReference,
} from '@entegrasyonik/ui/shortcuts'
import {
  SHORTCUT_CATALOG,
  buildShortcutCatalog,
  detectPlatform,
  featuredShortcuts,
  fold,
  highlightParts,
  keyMatchesQuery,
  platformKeys,
  searchShortcuts,
  spokenKeys,
} from '../src/navigation/shortcutCatalog'

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')
const ids = (list: { item: { id: string } }[]) => list.map((r) => r.item.id)

describe('kayıt defterinden türetme', () => {
  it('katalog = kabuk kaydı + bileşen başvuru kaydı; eksik/fazla yok, kimlikler tekil', () => {
    const expected = [...SHORTCUTS.map((s) => s.id), ...CONTEXT_SHORTCUTS.map((s) => s.id)]
    expect(new Set(expected).size).toBe(expected.length)
    expect(SHORTCUT_CATALOG.map((s) => s.id).sort()).toEqual([...expected].sort())
  })

  it('her kısayol bir kategoride, anlatımlı (ad + tek satır açıklama + bağlam) ve tuşlu', () => {
    const cats = new Set(SHORTCUT_CATEGORIES.map((c) => c.id))
    for (const s of SHORTCUT_CATALOG) {
      expect(cats.has(s.category), s.id).toBe(true)
      expect(s.description.length, `${s.id} açıklama`).toBeGreaterThan(10)
      expect(s.description, `${s.id} tek satır`).not.toMatch(/\n/)
      expect(s.context.length, s.id).toBeGreaterThan(2)
      expect(s.keys.length, s.id).toBeGreaterThan(0)
    }
    // İstenen altı kategori, istenen sırada; her biri en az bir kısayol taşır.
    expect(SHORTCUT_CATEGORIES.map((c) => c.label)).toEqual(['Gezinme', 'Sekmeler ve çalışma alanı', 'Liste ve tablo', 'Formlar', 'Görünüm', 'Yardım'])
    for (const c of SHORTCUT_CATEGORIES) expect(SHORTCUT_CATALOG.some((s) => s.category === c.id), c.id).toBe(true)
  })

  it('katalog kategori sırasıyla dizilir; kategori içinde kabuk kısayolları önce', () => {
    const order = SHORTCUT_CATEGORIES.map((c) => c.id)
    const seen = SHORTCUT_CATALOG.map((s) => order.indexOf(s.category))
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
    const nav = SHORTCUT_CATALOG.filter((s) => s.category === 'navigation')
    expect(nav[0].id).toBe('search')
  })

  it('yeni kısayol kayda eklenince diyalog kataloğuna kendiliğinden düşer (kategori eski `group`tan türer)', () => {
    const extraGlobal = { id: 'yeniKabuk', keys: ['Alt', 'N'], label: 'Yeni kayıt', group: 'Sayfa' } as unknown as ShortcutDefinition
    const extraRef: ShortcutReference = { id: 'yeniBilesen', keys: ['Ctrl', 'S'], label: 'Taslağı kaydet', description: 'Formu taslak olarak saklar.', category: 'forms', context: 'Formda' }
    const catalog = buildShortcutCatalog([...SHORTCUTS, extraGlobal], [...CONTEXT_SHORTCUTS, extraRef])
    expect(catalog).toHaveLength(SHORTCUT_CATALOG.length + 2)
    const g = catalog.find((s) => s.id === 'yeniKabuk')!
    expect(g).toMatchObject({ category: 'list', context: 'Her yerde', scope: 'global', description: '' })
    expect(catalog.find((s) => s.id === 'yeniBilesen')).toMatchObject({ category: 'forms', scope: 'context' })
    expect(ids(searchShortcuts('taslak', catalog))).toEqual(['yeniBilesen'])
  })

  it('diyalogda elle yazılmış kısayol YOK: satırlar katalogdan, açan tuş kayıttan', () => {
    const src = read('src/components/layout/ShortcutHelpDialog.vue')
    expect(src).toMatch(/SHORTCUT_CATALOG/)
    expect(src).toMatch(/shortcutKeys\('shortcutHelp'\)/)
    // Eski elle yazılmış not paragrafı ve sabit tuş dizileri kalmadı.
    expect(src).not.toMatch(/:keys="\[/)
    expect(src).not.toMatch(/\skeys="[^"]/)
    expect(src).not.toMatch(/Sekme şeridinde ayrıca/)
  })

  it('geriye uyum: SHORTCUT_GROUPS (yardım merkezi tablosu) ve mevcut kısayolların tuş/ad/grup alanları değişmedi', () => {
    expect(SHORTCUT_GROUPS.map((g) => g.label)).toEqual(['Genel', 'Sekmeler', 'Görünüm', 'Sayfa'])
    expect(SHORTCUTS.map((s) => [s.id, s.keys.join('+'), s.group])).toEqual([
      ['search', 'Ctrl+K', 'Genel'],
      ['shortcutHelp', '?', 'Genel'],
      ['tabNext', 'Ctrl+→', 'Sekmeler'],
      ['tabPrev', 'Ctrl+←', 'Sekmeler'],
      ['tabGoto', 'Alt+1…9', 'Sekmeler'],
      ['tabClose', 'Alt+W', 'Sekmeler'],
      ['sidebarToggle', 'Ctrl+B', 'Görünüm'],
      ['headerToggle', 'Ctrl+Shift+H', 'Görünüm'],
      ['focusMode', 'Ctrl+Shift+F', 'Görünüm'],
      ['pageRefresh', 'Alt+R', 'Sayfa'],
    ])
  })

  it('ipucu kuşağı: en çok kullanılan üç kısayol (1–3 sıralı, kısa adlı)', () => {
    const tips = featuredShortcuts()
    expect(tips.map((t) => t.id)).toEqual(['search', 'tabGoto', 'pageRefresh'])
    for (const t of tips) expect(t.shortLabel.length).toBeLessThanOrEqual(16)
  })
})

describe('platform sembolleri', () => {
  it('navigator.platform / userAgentData ile algılar', () => {
    expect(detectPlatform({ platform: 'MacIntel' })).toBe('mac')
    expect(detectPlatform({ userAgentData: { platform: 'macOS' }, platform: '' })).toBe('mac')
    expect(detectPlatform({ platform: 'iPad' })).toBe('mac')
    expect(detectPlatform({ platform: 'Win32' })).toBe('win')
    expect(detectPlatform({ platform: 'Linux x86_64' })).toBe('win')
    expect(detectPlatform({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' })).toBe('win') // UA-CH önceliklidir
    expect(detectPlatform(undefined)).toBe('win')
  })

  it("macOS'ta ⌘ ⌥ ⇧ ↩; Windows/Linux'ta Ctrl/Alt/Shift aynen", () => {
    expect(platformKeys(['Ctrl', 'Shift', 'H'], 'mac')).toEqual(['⌘', '⇧', 'H'])
    expect(platformKeys(['Alt', 'R'], 'mac')).toEqual(['⌥', 'R'])
    expect(platformKeys(['Ctrl', 'Enter'], 'mac')).toEqual(['⌘', '↩'])
    expect(platformKeys(['Ctrl', 'Shift', 'H'], 'win')).toEqual(['Ctrl', 'Shift', 'H'])
    expect(platformKeys(['Space'], 'win')).toEqual(['Boşluk'])
  })

  it('ekran okuyucu metni sembol değil ad okur', () => {
    expect(spokenKeys(['Ctrl', 'K'], 'mac')).toBe('Command K')
    expect(spokenKeys(['Ctrl', 'K'], 'win')).toBe('Ctrl artı K')
    expect(spokenKeys(['Ctrl', '→'], 'win')).toBe('Ctrl artı Sağ ok')
    expect(spokenKeys(['G', 'D'], 'win', true)).toBe('G sonra D')
  })

  it('⌘ gösterimi doğru: Ctrl içeren her kabuk kısayolu ⌘ (metaKey) ile de eşleşir', () => {
    const KEY: Record<string, { key: string; code?: string }> = { '→': { key: 'ArrowRight' }, '←': { key: 'ArrowLeft' } }
    const withCtrl = SHORTCUTS.filter((s) => s.keys.includes('Ctrl'))
    expect(withCtrl.length).toBeGreaterThan(3)
    for (const s of withCtrl) {
      const main = s.keys[s.keys.length - 1]
      const k = KEY[main] ?? { key: main.toLowerCase(), code: `Key${main.toUpperCase()}` }
      const ev = { key: k.key, code: k.code, ctrlKey: false, metaKey: true, altKey: s.keys.includes('Alt'), shiftKey: s.keys.includes('Shift') }
      expect(matchShortcut(ev)?.id, s.id).toBe(s.id)
    }
  })
})

describe('arama', () => {
  it('boş sorgu tüm kataloğu döner; anlamsız sorgu boş', () => {
    expect(searchShortcuts('')).toHaveLength(SHORTCUT_CATALOG.length)
    expect(searchShortcuts('zzqx')).toEqual([])
  })

  it('ad / açıklama / bağlam ile bulur; Türkçe büyük-küçük ve aksan duyarsız', () => {
    expect(ids(searchShortcuts('sekme'))).toEqual(expect.arrayContaining(['tabNext', 'tabPrev', 'tabClose', 'stripClose']))
    expect(ids(searchShortcuts('SEKME'))).toEqual(ids(searchShortcuts('sekme')))
    expect(ids(searchShortcuts('serit'))).toEqual(ids(searchShortcuts('şerit')))
    expect(ids(searchShortcuts('varyant'))).toEqual(expect.arrayContaining(['sheetUndo', 'sheetFillDown']))
    expect(ids(searchShortcuts('dialogda'))).toEqual(expect.arrayContaining(['dialogClose', 'dialogSubmit']))
    expect(ids(searchShortcuts('sol menü'))).toEqual(['sidebarToggle', 'focusMode']) // odak modu da sol menüyü gizler
  })

  it('tuşla bulur: "ctrl k", "⌘K", "alt r"; tuş adı metinde aranmaz ("alt" ≠ "alt sonuca")', () => {
    expect(ids(searchShortcuts('ctrl k'))).toEqual(['search'])
    expect(ids(searchShortcuts('Ctrl+K'))).toEqual(['search'])
    expect(ids(searchShortcuts('⌘K'))).toEqual(['search'])
    expect(ids(searchShortcuts('alt r'))).toEqual(['pageRefresh'])
    const alt = ids(searchShortcuts('alt'))
    expect(alt).toEqual(expect.arrayContaining(['tabGoto', 'tabClose', 'pageRefresh', 'headerToggle']))
    expect(alt).not.toContain('searchMove')
    expect(alt).not.toContain('sheetFillDown')
    expect(searchShortcuts('alt').every((r) => r.keyMatch)).toBe(true)
  })

  it('vurgu: eşleşen parçalar <mark> olur; katlama dizinleri özgün metne uyar; tuş adları metinde vurgulanmaz', () => {
    expect(highlightParts('Sonraki sekme', 'sekme')).toEqual([{ text: 'Sonraki ', match: false }, { text: 'sekme', match: true }])
    expect(highlightParts('Şeritte odaklanmış', 'serit')).toEqual([{ text: 'Şerit', match: true }, { text: 'te odaklanmış', match: false }])
    expect(highlightParts('İPUCU', 'ipucu')).toEqual([{ text: 'İPUCU', match: true }])
    expect(highlightParts('Üst bölümü daralt', 'alt')).toEqual([{ text: 'Üst bölümü daralt', match: false }])
    expect(highlightParts('metin', '')).toEqual([{ text: 'metin', match: false }])
    expect(fold('IĞDIR')).toHaveLength(5)
  })

  it('tuş kapağı vurgusu yalnız işaret edilen tuşta', () => {
    expect(keyMatchesQuery('Alt', 'alt')).toBe(true)
    expect(keyMatchesQuery('Ctrl', 'alt')).toBe(false)
    expect(keyMatchesQuery('Ctrl', 'cmd')).toBe(true)
    expect(keyMatchesQuery('→', 'ok')).toBe(true)
  })
})

describe('uygulama geneli örtü (A6b §17.1)', () => {
  it('diyalog SecureLayout’ta sekme kabının dışında bağlanır ve kendini bir sekmeye iliştirmez', () => {
    const layout = read('src/layouts/SecureLayout.vue')
    const at = layout.indexOf('<ShortcutHelpDialog')
    expect(at).toBeGreaterThan(0)
    expect(layout.slice(at - 400, at)).not.toMatch(/WorkspaceTabHost|ek-tab-host/)
    const src = read('src/components/layout/ShortcutHelpDialog.vue')
    expect(src).not.toMatch(/\sattach=|:attach=/)
    expect(read('DESIGN_SYSTEM.md')).toMatch(/Tam ekran kalan \(uygulama geneli\) örtüler:\*\* kısayol listesi \(`ShortcutHelpDialog`/)
  })
})
