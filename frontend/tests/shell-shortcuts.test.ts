// DS-v2 Aşama 2 (kabuk) — kısayol kaydı: eşleme, metin alanı koruması, tek kaynak bütünlüğü.
import { describe, it, expect } from 'vitest'
import { SHORTCUTS, SHORTCUT_GROUPS, matchShortcut, isEditableTarget, shortcutKeys, withShortcut } from '@entegrasyonik/ui/shortcuts'

const ev = (key: string, mods: Partial<{ ctrl: boolean; meta: boolean; alt: boolean; shift: boolean; code: string }> = {}) => ({
  key,
  code: mods.code,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
})
const input = (type = 'text') => ({ tagName: 'INPUT', type }) as unknown as EventTarget
const div = { tagName: 'DIV' } as unknown as EventTarget

describe('matchShortcut', () => {
  it('Ctrl/⌘+K aramayı, Ctrl+B menüyü eşler', () => {
    expect(matchShortcut(ev('k', { ctrl: true }))).toEqual({ id: 'search' })
    expect(matchShortcut(ev('K', { meta: true }))).toEqual({ id: 'search' })
    expect(matchShortcut(ev('b', { ctrl: true }))).toEqual({ id: 'sidebarToggle' })
  })

  it('Ctrl+←/→ sekmeler arası; Alt+1…9 n. sekme; Alt+W kapat', () => {
    expect(matchShortcut(ev('ArrowRight', { ctrl: true }))).toEqual({ id: 'tabNext' })
    expect(matchShortcut(ev('ArrowLeft', { ctrl: true }))).toEqual({ id: 'tabPrev' })
    expect(matchShortcut(ev('3', { alt: true, code: 'Digit3' }))).toEqual({ id: 'tabGoto', index: 2 })
    expect(matchShortcut(ev('∑', { alt: true, code: 'KeyW' }))).toEqual({ id: 'tabClose' })
  })

  it('Alt+U üst bölüm, Ctrl+Shift+F odak modu, ? kısayol listesi', () => {
    expect(matchShortcut(ev('u', { alt: true, code: 'KeyU' }))).toEqual({ id: 'headerToggle' })
    expect(matchShortcut(ev('F', { ctrl: true, shift: true, code: 'KeyF' }))).toEqual({ id: 'focusMode' })
    expect(matchShortcut(ev('?', { shift: true }))).toEqual({ id: 'shortcutHelp' })
  })

  it('Aşama 5: Ctrl+Shift+H üst bölüm (metin alanında da); Alt+U takma adı metin alanında çalışmaz', () => {
    expect(matchShortcut(ev('H', { ctrl: true, shift: true, code: 'KeyH' }))).toEqual({ id: 'headerToggle' })
    expect(matchShortcut(ev('H', { ctrl: true, shift: true, code: 'KeyH' }), input())).toEqual({ id: 'headerToggle' })
    expect(matchShortcut(ev('u', { alt: true, code: 'KeyU' }), input())).toBeUndefined()
    expect(shortcutKeys('headerToggle')).toEqual(['Ctrl', 'Shift', 'H'])
    expect(SHORTCUTS.find((s) => s.id === 'headerToggle')?.aliases).toEqual([['Alt', 'U']])
  })

  it('tarayıcının kendi kısayollarını ve AltGr karakterlerini ezmez', () => {
    expect(matchShortcut(ev('ArrowLeft', { alt: true }))).toBeUndefined() // geri
    expect(matchShortcut(ev('w', { ctrl: true }))).toBeUndefined() // sekme kapat (tarayıcı)
    expect(matchShortcut(ev('@', { ctrl: true, alt: true, code: 'KeyQ' }))).toBeUndefined() // AltGr+Q
    expect(matchShortcut(ev('1', { ctrl: true, alt: true, code: 'Digit1' }))).toBeUndefined()
  })

  it('metin alanında yalnızca izinli kısayollar çalışır', () => {
    expect(matchShortcut(ev('ArrowRight', { ctrl: true }), input())).toBeUndefined()
    expect(matchShortcut(ev('?', { shift: true }), input())).toBeUndefined()
    expect(matchShortcut(ev('k', { ctrl: true }), input())).toEqual({ id: 'search' })
    // Ctrl+B metin/zengin metin alanında "kalın" olarak kalır.
    expect(matchShortcut(ev('b', { ctrl: true }), { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBeUndefined()
    expect(matchShortcut(ev('b', { ctrl: true }), input())).toBeUndefined()
    expect(matchShortcut(ev('ArrowRight', { ctrl: true }), input('checkbox'))).toEqual({ id: 'tabNext' })
    expect(matchShortcut(ev('ArrowRight', { ctrl: true }), div)).toEqual({ id: 'tabNext' })
  })
})

describe('kayıt bütünlüğü', () => {
  it('kimlikler tekil, her kısayol bir gruba ait ve etiketli', () => {
    const ids = SHORTCUTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(SHORTCUT_GROUPS.flatMap((g) => g.items).length).toBe(SHORTCUTS.length)
    for (const s of SHORTCUTS) {
      expect(s.label.length).toBeGreaterThan(3)
      expect(s.keys.length).toBeGreaterThan(0)
    }
  })

  it('gösterim yardımcıları kayıttan okur', () => {
    expect(shortcutKeys('search')).toEqual(['Ctrl', 'K'])
    expect(withShortcut('Menüyü daralt', 'sidebarToggle')).toBe('Menüyü daralt (Ctrl+B)')
  })

  it('isEditableTarget: contenteditable/textarea/metin input', () => {
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true)
    expect(isEditableTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true)
    expect(isEditableTarget(input('search'))).toBe(true)
    expect(isEditableTarget(input('radio'))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})
