// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRowNav, ROW_MARK } from '@bo/navigation/rowNav'
import { createHotkeyHandler } from '@bo/navigation/hotkeys'

function key(k: string, target: EventTarget = document.body) {
  const e = new KeyboardEvent('keydown', { key: k, cancelable: true })
  Object.defineProperty(e, 'target', { value: target })
  return e
}

describe('NT-10 tablo satırı klavyesi', () => {
  let nav: ReturnType<typeof createRowNav>
  let clicked: string[]
  beforeEach(() => {
    clicked = []
    document.body.innerHTML = `<main id="bo-main"><table><tbody>
      <tr id="r1"><th><a href="/musteriler/101">101</a></th></tr>
      <tr id="r2"><td>satır bağlantısız</td></tr>
      <tr id="r3"><th><a href="/musteriler/103">103</a></th></tr>
    </tbody></table></main>`
    document.getElementById('r2')!.addEventListener('click', () => clicked.push('r2'))
    nav = createRowNav(() => document.querySelector('#bo-main'), () => true)
  })

  it('j ilk satırın birincil bağlantısına odaklanır; sınırda durur', () => {
    nav.move(1)
    expect(document.activeElement?.getAttribute('href')).toBe('/musteriler/101')
    expect(document.getElementById('r1')!.hasAttribute(ROW_MARK)).toBe(true)
    nav.move(-1)
    expect(document.activeElement?.getAttribute('href')).toBe('/musteriler/101')
  })

  it('bağlantısız satırda satırın kendisi odaklanır ve Enter satırı açar', () => {
    nav.move(1)
    nav.move(1)
    expect(document.activeElement?.id).toBe('r2')
    expect(nav.enter()).toBe(true)
    expect(clicked).toEqual(['r2'])
    nav.move(1)
    expect(document.activeElement?.getAttribute('href')).toBe('/musteriler/103')
    expect(document.getElementById('r2')!.hasAttribute(ROW_MARK)).toBe(false)
  })

  it('Esc odaktan çıkar; işaret yoksa tuşu tüketmez', () => {
    nav.move(1)
    expect(nav.exit()).toBe(true)
    expect(document.querySelector(`[${ROW_MARK}]`)).toBeNull()
    expect(nav.exit()).toBe(false)
  })

  it('kısayol işleyicisi: j/k satıra gider, metin alanında ve "g k" dizisinde gitmez', () => {
    const row = vi.fn(() => true)
    const go = vi.fn()
    const h = createHotkeyHandler({ go, help: vi.fn(), refresh: vi.fn(), blocked: () => false, row, now: () => 1000 })
    h(key('j'))
    expect(row).toHaveBeenLastCalledWith('next')
    const input = document.createElement('input')
    h(key('k', input))
    expect(row).toHaveBeenCalledTimes(1)
    h(key('g'))
    h(key('k'))
    expect(go).toHaveBeenCalledWith('/motor')
    expect(row).toHaveBeenCalledTimes(1)
  })
})
