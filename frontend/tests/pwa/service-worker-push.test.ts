// MOB-04 — service worker `push` + `notificationclick` (sahte push olayı). Gerçek SW dosyası VM'de çalıştırılır.
// Kurallar: her push görünür bildirim üretir; bozuk yükte genel metin; tıklama yalnız uygulama içi yolu açar (açık yönlendirme yok).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const source = readFileSync(resolve(root, 'public/service-worker.js'), 'utf8')
const ORIGIN = 'https://app.entegrasyonik.com'

function load(windows: Array<{ url: string }> = []) {
  const listeners: Record<string, Array<(e: any) => void>> = {}
  const shown: Array<{ title: string; options: any }> = []
  const opened: string[] = []
  const navigated: string[] = []
  const focused: string[] = []
  const clientList = windows.map((w) => ({
    url: w.url,
    focus: async function (this: any) { focused.push(this.url); return this },
    navigate: async (u: string) => { navigated.push(u); return null },
  }))
  const self = {
    location: new URL(ORIGIN + '/service-worker.js'),
    addEventListener: (type: string, fn: (e: any) => void) => ((listeners[type] ||= []).push(fn)),
    skipWaiting: () => {},
    registration: { showNotification: async (title: string, options: any) => { shown.push({ title, options }) } },
    clients: {
      claim: async () => {},
      matchAll: async () => clientList,
      openWindow: async (u: string) => { opened.push(u); return null },
    },
  }
  vm.runInContext(source, vm.createContext({ self, caches: {}, URL, Request, Response, Promise, console, fetch }))
  const fire = async (type: string, event: any) => {
    let waited: Promise<any> | undefined
    event.waitUntil = (p: Promise<any>) => { waited = p }
    listeners[type].forEach((fn) => fn(event))
    await waited
  }
  const push = (payload: unknown) => fire('push', { data: payload === undefined ? null : { json: () => (typeof payload === 'string' ? JSON.parse(payload) : payload) } })
  const click = (data: any) => {
    const n = { data, closed: false, close() { this.closed = true } }
    return fire('notificationclick', { notification: n }).then(() => n)
  }
  return { shown, opened, navigated, focused, push, click }
}

describe('SW push', () => {
  it('geçerli yük: başlık/metin/etiket/uygulama içi yol; kritik → yeniden uyar', async () => {
    const sw = load()
    await sw.push({ v: 1, title: 'Stok aşırı satıldı', body: 'Ayrıntılar için Entegrasyonik’i açın.', url: '/orders?allocation=OVERSOLD', tag: 'ntf:e1', severity: 'critical' })
    expect(sw.shown).toHaveLength(1)
    expect(sw.shown[0].title).toBe('Stok aşırı satıldı')
    expect(sw.shown[0].options).toMatchObject({ body: 'Ayrıntılar için Entegrasyonik’i açın.', tag: 'ntf:e1', renotify: true, data: { url: '/orders?allocation=OVERSOLD' }, icon: '/icons/icon-192.png' })
  })
  it('boş / bozuk / bilinmeyen sürüm yük → yine görünür genel bildirim (sessiz push yok)', async () => {
    for (const p of [undefined, '{bozuk', { v: 2, title: 'x' }, { v: 1 }]) {
      const sw = load()
      await sw.push(p)
      expect(sw.shown).toHaveLength(1)
      expect(sw.shown[0].title).toBe('Entegrasyonik')
      expect(sw.shown[0].options.data.url).toBe('/notifications')
    }
  })
  it('dış / protokol-göreli / ters eğik çizgili yol bildirim merkezine düşer', async () => {
    for (const url of ['https://evil.example/x', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/a\nb']) {
      const sw = load()
      await sw.push({ v: 1, title: 't', body: 'b', url, tag: 'x' })
      expect(sw.shown[0].options.data.url).toBe('/notifications')
    }
  })
})

describe('SW notificationclick', () => {
  it('açık uygulama penceresi varsa odaklanır ve hedefe gider', async () => {
    const sw = load([{ url: `${ORIGIN}/dashboard` }])
    const n = await sw.click({ url: '/orders/42' })
    expect(n.closed).toBe(true)
    expect(sw.focused).toEqual([`${ORIGIN}/dashboard`])
    expect(sw.navigated).toEqual([`${ORIGIN}/orders/42`])
    expect(sw.opened).toEqual([])
  })
  it('pencere yoksa yeni pencere; başka origin penceresi kullanılmaz; kurcalanmış veri → bildirim merkezi', async () => {
    const sw = load([{ url: 'https://other.example/' }])
    await sw.click({ url: '//evil.example/x' })
    expect(sw.opened).toEqual([`${ORIGIN}/notifications`])
    expect(sw.focused).toEqual([])
  })
})
