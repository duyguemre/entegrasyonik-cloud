// ADR-0034 / CHAT_UI_CONTRACT §7.1 — web yerleşimi: kısayol çakışması, ekran kaydı, sayfa bağlamı, yerel tercihler, host bağlantıları.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHAT_PRODUCT } from '@entegrasyonik/chat/brand'
import { CONTEXT_SHORTCUTS, SHORTCUTS, matchShortcut } from '@entegrasyonik/ui/shortcuts'
import { APP_SHORTCUTS, SHORTCUT_CATALOG, matchAppShortcut } from '../src/navigation/shortcutCatalog'
import { resolveScreenByKey, resolveScreenPath } from '../src/navigation/screens'
import { pageContextFor } from '../src/chat/pageContext'
import { clampWidth, OTOPILOT_PUSH_MIN, OTOPILOT_WIDTH, prefsKey } from '../src/chat/placement'
import { CHAT_SCREEN_KEY, CHAT_SETTINGS_SCREEN_KEY } from '../src/chat/chatLinks'

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')
const combo = (keys: readonly string[]) => keys.join('+').toLowerCase()
const ev = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ key, code: `Key${key.toUpperCase()}`, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods })

describe('kısayol (shortcutCatalog APP_SHORTCUTS)', () => {
  it('Ctrl/⌘+J hiçbir kabuk/bileşen kısayoluyla (ana tuş + takma adlar) çakışmaz', () => {
    const taken = new Set([...SHORTCUTS, ...CONTEXT_SHORTCUTS].flatMap((s) => [s.keys, ...(s.aliases ?? [])]).map(combo))
    for (const s of APP_SHORTCUTS) {
      expect(taken.has(combo(s.keys)), s.id).toBe(false)
      for (const a of s.aliases) expect(taken.has(combo(a)), `${s.id} alias`).toBe(false)
    }
    // ui eşleyicisi aynı olayı başka bir kısayola bağlamaz.
    expect(matchShortcut(ev('j', { ctrlKey: true }), null)).toBeUndefined()
    expect(matchShortcut(ev('j', { metaKey: true }), null)).toBeUndefined()
  })
  it('eşleyici: Ctrl+J ve ⌘+J; Shift/Alt ile değil; metin alanında da çalışır (composer\'dan kapatma)', () => {
    const textarea = { tagName: 'TEXTAREA' } as unknown as EventTarget
    expect(matchAppShortcut(ev('j', { ctrlKey: true }), null)).toBe('otopilotToggle')
    expect(matchAppShortcut(ev('J', { metaKey: true }), textarea)).toBe('otopilotToggle')
    expect(matchAppShortcut(ev('j', { ctrlKey: true, shiftKey: true }), null)).toBeUndefined()
    expect(matchAppShortcut(ev('j', { ctrlKey: true, altKey: true }), null)).toBeUndefined()
    expect(matchAppShortcut(ev('j'), null)).toBeUndefined()
  })
  it('kısayol diyalog kataloğunda (Görünüm), ad tek sabitten', () => {
    const item = SHORTCUT_CATALOG.find((s) => s.id === 'otopilotToggle')!
    expect(item).toMatchObject({ category: 'view', scope: 'global' })
    expect(item.label).toContain(CHAT_PRODUCT.name)
  })
  it('SecureLayout kısayolu yalnız kayıt eşleyicisiyle bağlar (elle tuş kontrolü yok)', () => {
    const src = read('src/layouts/SecureLayout.vue')
    expect(src).toMatch(/matchAppShortcut\(event, event\.target\) === 'otopilotToggle'/)
    expect(src).toContain('<OtopilotDock />')
  })
})

describe('ekran kaydı (screens.ts)', () => {
  it('tam sayfa: key "chat", slug CHAT_PRODUCT.slug; ayarlar: settings/<slug>; URL parametresi yok', () => {
    expect(resolveScreenByKey(CHAT_SCREEN_KEY)).toMatchObject({ slug: CHAT_PRODUCT.slug })
    expect(resolveScreenPath([CHAT_PRODUCT.slug])?.screen.key).toBe('chat')
    expect(resolveScreenPath(['settings', CHAT_PRODUCT.slug])?.screen.key).toBe(CHAT_SETTINGS_SCREEN_KEY)
    expect(resolveScreenByKey(CHAT_SCREEN_KEY)?.urlParams).toBeUndefined()
  })
  it('views kaydında iki ekran da var', () => {
    const menu = read('src/stores/site/menu.ts')
    expect(menu).toContain("['chat', shallowRef(defineAsyncComponent(() => import('@/views/secure/OtopilotView.vue')))]")
    expect(menu).toContain("['OtopilotSettingsView',")
  })
})

describe('sayfa bağlamı (pageContextFor)', () => {
  it('kayıtlı ekran → screen + izinli filtreler; PII/serbest metin (globalSearch) GEÇMEZ', () => {
    const ctx = pageContextFor({ code: 'OrderListView', parameters: { internalStatuses: ['AWAITING_APPROVAL'], globalSearch: 'Ayşe Yılmaz' } }, 'Siparişler')
    expect(ctx).toEqual({ value: { screen: 'OrderListView', filters: { internalStatuses: 'AWAITING_APPROVAL' } }, label: 'Siparişler' })
    expect(JSON.stringify(ctx)).not.toContain('Ayşe')
  })
  it('kayıtsız ekran ve sohbetin kendi ekranları → bağlam yok', () => {
    expect(pageContextFor({ code: 'KayitsizEkran' }, 'x')).toBeNull()
    expect(pageContextFor({ code: CHAT_SCREEN_KEY }, 'x')).toBeNull()
    expect(pageContextFor({ code: CHAT_SETTINGS_SCREEN_KEY }, 'x')).toBeNull()
  })
})

describe('yerel tercihler', () => {
  it('genişlik 360–560 aralığına kıstırılır; varsayılan 400', () => {
    expect([clampWidth(100), clampWidth(999), clampWidth('abc'), clampWidth(412.4)]).toEqual([360, 560, 400, 412])
    expect(OTOPILOT_WIDTH.default).toBe(400)
    expect(OTOPILOT_PUSH_MIN).toBe(1280)
  })
  it('anahtar kullanıcı + tenant kapsamlı; kullanıcı yoksa yazılmaz', () => {
    expect(prefsKey({ userId: 'u1', tenantId: 7 })).toBe('ek:chat:u1:7')
    expect(prefsKey({})).toBeNull()
  })
  it('depoya yalnız açık/genişlik yazılır (konuşma/anahtar değil)', () => {
    const src = read('src/chat/otopilotStore.ts')
    expect(src).toMatch(/JSON\.stringify\(\{ open: prefs\.open, width: prefs\.width \}\)/)
    expect((src.match(/localStorage\.setItem/g) ?? []).length).toBe(1)
  })
})

describe('kabuk dokunuşu minimal', () => {
  it('ApplicationBar yalnız #end-start yuvasına başlatıcı ekler; ShellSearch "sor" satırı en üstte', () => {
    expect(read('src/components/layout/ApplicationBar.vue')).toContain('<OtopilotLauncher :compact="!isDesktop" />')
    expect(read('src/components/layout/ShellSearch.vue')).toMatch(/return \[\.\.\.ask, screenGroup\.value/)
  })
  it('ui paketi sohbet paketini içe aktarmaz; sohbet paketi @/ içe aktarmaz', () => {
    expect(read('packages/ui/src/components/EkAppHeader.vue')).not.toContain('@entegrasyonik/chat')
  })
})
