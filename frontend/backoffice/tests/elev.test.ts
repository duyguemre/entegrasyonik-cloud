// BO-ELEV: kabuk kısayolları (g + harf, ?, Alt+R), ekran kaydındaki kısayol harfleri, son açılanlar deposu.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { HOTKEYS, SCREENS } from '@bo/navigation/screens'
import { SEQUENCE_MS, createHotkeyHandler } from '@bo/navigation/hotkeys'
import { sanitize } from '@bo/navigation/recents'

type Ev = Partial<KeyboardEvent> & { target?: unknown }
const key = (k: string, extra: Ev = {}) =>
  ({ key: k, code: k.length === 1 ? `Key${k.toUpperCase()}` : k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false, target: { tagName: 'BODY' }, preventDefault: vi.fn(), ...extra }) as unknown as KeyboardEvent

function setup(blocked = false) {
  let t = 1000
  const actions = { go: vi.fn(), help: vi.fn(), refresh: vi.fn(), blocked: () => blocked, now: () => t }
  const on = createHotkeyHandler(actions)
  return { actions, on, tick: (ms: number) => (t += ms) }
}

describe('ekran kaydı kısayolları', () => {
  it('harfler tekil, tek karakter ve yalnız hazır/taslak ekranlarda', () => {
    const keys = SCREENS.filter((s) => s.hotkey).map((s) => s.hotkey!)
    expect(new Set(keys).size).toBe(keys.length)
    for (const s of SCREENS.filter((x) => x.hotkey)) {
      expect(s.hotkey).toMatch(/^[a-z]$/)
      expect(s.status).not.toBe('planned')
    }
    expect(HOTKEYS.map((h) => h.key)).toEqual(expect.arrayContaining(['o', 'm', 'l', 'd', 'k']))
  })
})

describe('createHotkeyHandler', () => {
  it('g → m: müşteri listesine gider', () => {
    const { on, actions } = setup()
    on(key('g'))
    on(key('m'))
    expect(actions.go).toHaveBeenCalledWith('/musteriler')
  })

  it('dizi süresi dolarsa gitmez; bilinmeyen harf yok sayılır', () => {
    const { on, actions, tick } = setup()
    on(key('g'))
    tick(SEQUENCE_MS + 1)
    on(key('m'))
    on(key('g'))
    on(key('z'))
    expect(actions.go).not.toHaveBeenCalled()
  })

  it('metin alanında, Ctrl/⌘ ile ve açık diyalogda çalışmaz', () => {
    const typing = setup()
    typing.on(key('g', { target: { tagName: 'INPUT' } }))
    typing.on(key('m', { target: { tagName: 'INPUT' } }))
    typing.on(key('?', { target: { tagName: 'TEXTAREA' } }))
    expect(typing.actions.go).not.toHaveBeenCalled()
    expect(typing.actions.help).not.toHaveBeenCalled()

    const ctrl = setup()
    ctrl.on(key('g', { ctrlKey: true }))
    ctrl.on(key('m'))
    expect(ctrl.actions.go).not.toHaveBeenCalled()

    const blocked = setup(true)
    blocked.on(key('g'))
    blocked.on(key('m'))
    blocked.on(key('?'))
    expect(blocked.actions.go).not.toHaveBeenCalled()
    expect(blocked.actions.help).not.toHaveBeenCalled()
  })

  it('? yardımı, Alt+R sayfa yenilemeyi açar', () => {
    const { on, actions } = setup()
    on(key('?', { shiftKey: true }))
    on(key('r', { altKey: true, code: 'KeyR' }))
    expect(actions.help).toHaveBeenCalledOnce()
    expect(actions.refresh).toHaveBeenCalledOnce()
  })
})

describe('son açılanlar deposu', () => {
  it('yalnız bilinen biçim; ad ve fazlalık alanlar atılır; en çok 6', () => {
    const raw = [
      { kind: 'tenant', tid: 102, name: 'Ahmet Yılmaz Ticaret' },
      { kind: 'screen', key: 'overview' },
      { kind: 'screen', key: '<script>' },
      { kind: 'tenant', tid: -1 },
      { kind: 'other' },
      ...Array.from({ length: 10 }, (_, i) => ({ kind: 'tenant', tid: 200 + i })),
    ]
    const out = sanitize(raw)
    expect(out).toHaveLength(6)
    expect(out[0]).toEqual({ kind: 'tenant', tid: 102 })
    expect(out[1]).toEqual({ kind: 'screen', key: 'overview' })
    expect(JSON.stringify(out)).not.toMatch(/Ahmet|script/)
    expect(sanitize('bozuk')).toEqual([])
  })

  it('depo anahtarı bo: önekli ve yönetici başına; müşteri uygulaması anahtarlarına dokunmaz', () => {
    const src = readFileSync(new URL('../src/navigation/recents.ts', import.meta.url), 'utf8')
    expect(src).toMatch(/'bo:recent:'/)
    expect(src).not.toMatch(/ek:|sessionStorage|document\.cookie/)
  })
})
