// MOB-06 — backoffice SW web push: gösterim, bozuk yük, açık yönlendirme koruması, tıklamada mevcut panel penceresine odak.
// SW betiği gerçek dosyadan okunur ve sahte `self` ile bir VM bağlamında çalıştırılır.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(resolve(root, 'public/service-worker.js'), 'utf8')
const ORIGIN = 'https://admin.entegrasyonik.com'

function load(windows: Array<{ url: string }> = []) {
  const listeners: Record<string, Array<(e: any) => void>> = {}
  const shown: Array<{ title: string; opts: any }> = []
  const opened: string[] = []
  const navigated: string[] = []
  const clients = windows.map((w) => ({ url: w.url, focus: async function () { return this }, navigate: async (u: string) => { navigated.push(u) } }))
  const self = {
    location: new URL(ORIGIN + '/service-worker.js'),
    addEventListener: (type: string, fn: (e: any) => void) => ((listeners[type] ||= []).push(fn)),
    registration: { showNotification: async (title: string, opts: any) => { shown.push({ title, opts }) } },
    clients: { claim: async () => {}, matchAll: async () => clients, openWindow: async (u: string) => { opened.push(u) } },
    skipWaiting: () => {},
  }
  vm.runInContext(source, vm.createContext({ self, caches: {}, URL, Request, Response, Promise, console, fetch }))
  const fire = async (type: string, event: any) => {
    let p: Promise<unknown> | undefined
    listeners[type].forEach((fn) => fn({ ...event, waitUntil: (x: Promise<unknown>) => (p = x) }))
    await p
  }
  const push = (payload: unknown) => fire('push', { data: payload === undefined ? null : { json: () => (typeof payload === 'string' ? JSON.parse(payload) : payload) } })
  const click = (url: unknown) => fire('notificationclick', { notification: { close: () => {}, data: { url } } })
  return { shown, opened, navigated, push, click }
}

describe('backoffice SW push', () => {
  it('geçerli yük: başlık/metin/etiket; kritik olduğu için renotify; hedef data.url', async () => {
    const sw = load()
    await sw.push({ v: 1, title: 'Kritik: Kuyruk okunamıyor', body: 'Ayrıntılar için yönetim panelini açın.', url: '/', tag: 'bo-attention', severity: 'critical' })
    expect(sw.shown).toHaveLength(1)
    expect(sw.shown[0].title).toBe('Kritik: Kuyruk okunamıyor')
    expect(sw.shown[0].opts).toMatchObject({ tag: 'bo-attention', renotify: true, data: { url: '/' } })
  })
  it('bozuk/bilinmeyen sürüm/boş yük: yine görünür bildirim (genel metin)', async () => {
    for (const p of [undefined, '{bozuk', { v: 2, title: 'x' }]) {
      const sw = load()
      await sw.push(p).catch(() => undefined)
      expect(sw.shown[0]?.title).toBe('Entegrasyonik Yönetim')
    }
  })
  it.each(['https://kotu.example/x', '//kotu.example', '/\\kotu', 'javascript:alert(1)', '/a\u0001b'])('açık yönlendirme yok: %s -> /', async (url) => {
    const sw = load()
    await sw.push({ v: 1, title: 't', body: 'b', url, tag: 'bo-attention', severity: 'critical' })
    expect(sw.shown[0].opts.data.url).toBe('/')
    await sw.click(url)
    expect(sw.opened).toEqual([`${ORIGIN}/`])
  })
  it('açık panel penceresi varsa odaklanır ve gider; başka origin penceresine dokunmaz', async () => {
    const sw = load([{ url: 'https://app.entegrasyonik.com/' }, { url: `${ORIGIN}/musteriler` }])
    await sw.click('/uyarilar')
    expect(sw.navigated).toEqual([`${ORIGIN}/uyarilar`])
    expect(sw.opened).toEqual([])
  })
})
