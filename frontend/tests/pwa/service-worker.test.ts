// MOB-01 — service worker: API yanıtları ve kiracı verisi ÖNBELLEĞE ALINMAZ; yalnız kabuk + karmalı statik varlıklar.
// SW betiği gerçek dosyadan okunur ve sahte `self`/`caches` ile bir VM bağlamında çalıştırılır.
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const source = readFileSync(resolve(root, 'public/service-worker.js'), 'utf8')
const ORIGIN = 'https://app.entegrasyonik.com'

type Listener = (event: any) => void

function load() {
  const listeners: Record<string, Listener[]> = {}
  const store = new Map<string, Map<string, Response>>()
  const puts: string[] = []
  const caches = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map())
      const c = store.get(name)!
      return {
        addAll: async (urls: string[]) => urls.forEach((u) => { puts.push(u); c.set(new URL(u, ORIGIN).href, new Response('x')) }),
        put: async (req: Request, res: Response) => { puts.push(req.url); c.set(req.url, res) },
      }
    },
    match: async (req: Request | string) => {
      const key = typeof req === 'string' ? new URL(req, ORIGIN).href : req.url
      for (const c of store.values()) if (c.has(key)) return c.get(key)
      return undefined
    },
    keys: async () => [...store.keys()],
    delete: async (k: string) => store.delete(k),
  }
  let network: (req: Request) => Promise<Response> = async () => new Response('net', { status: 200 })
  const fetchSpy: string[] = []
  const self = {
    location: new URL(ORIGIN + '/service-worker.js'),
    addEventListener: (type: string, fn: Listener) => ((listeners[type] ||= []).push(fn)),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  }
  const ctx = vm.createContext({
    self, caches, URL, Request, Response, Promise, console,
    fetch: (req: Request) => { fetchSpy.push(req.url); return network(req) },
  })
  vm.runInContext(source, ctx)
  const dispatchFetch = async (url: string, init: RequestInit & { mode?: string } = {}) => {
    const { mode, ...rest } = init
    const request = new Request(url, rest)
    let responded: Promise<Response> | undefined
    const event = { request: mode ? { mode, url: request.url, method: request.method } : request, respondWith: (p: Promise<Response>) => { responded = p } }
    listeners.fetch.forEach((fn) => fn(event))
    const res = responded ? await responded : undefined
    await new Promise((r) => setTimeout(r, 0))
    return { responded: !!responded, res }
  }
  return { listeners, store, puts, fetchSpy, dispatchFetch, setNetwork: (fn: typeof network) => (network = fn) }
}

describe('service worker önbellek kuralı', () => {
  let sw: ReturnType<typeof load>
  beforeEach(() => { sw = load() })

  it('kurulumda yalnız kabuk dosyaları önbelleğe girer (API yok, HTML sayfası yok)', async () => {
    let p: Promise<unknown> | undefined
    sw.listeners.install.forEach((fn) => fn({ waitUntil: (x: Promise<unknown>) => (p = x) }))
    await p
    expect(sw.puts).toContain('/offline.html')
    expect(sw.puts).not.toContain('/')
    expect(sw.puts).not.toContain('/index.html')
    expect(sw.puts.some((u) => u.includes('/api'))).toBe(false)
  })

  it.each([
    `${ORIGIN}/api/products?page=1`,
    `${ORIGIN}/api/orders`,
    'https://api.entegrasyonik.com/api/products',
    'http://127.0.0.1:5001/api/user/context',
    'https://cdn.example.com/img/urun.jpg',
    `${ORIGIN}/assets/index-abc123.js?v=2`,
  ])('karışmaz ve önbelleğe yazmaz: %s', async (url) => {
    const { responded } = await sw.dispatchFetch(url)
    expect(responded).toBe(false)
    expect(sw.puts).toEqual([])
  })

  it('GET dışı istekler (aynı origin bile) karışılmaz', async () => {
    const { responded } = await sw.dispatchFetch(`${ORIGIN}/assets/x.js`, { method: 'POST', body: 'a' })
    expect(responded).toBe(false)
  })

  it('karmalı /assets/ dosyası ağdan alınır ve önbelleğe yazılır; ikinci istek önbellekten', async () => {
    const url = `${ORIGIN}/assets/index-abc123.js`
    sw.setNetwork(async () => Object.defineProperty(new Response('js', { status: 200 }), 'type', { value: 'basic' }))
    await sw.dispatchFetch(url)
    expect(sw.puts).toEqual([url])
    sw.setNetwork(async () => { throw new Error('offline') })
    const { res } = await sw.dispatchFetch(url)
    expect(res).toBeTruthy()
  })

  it('gezinme ağdan; ağ yoksa dürüst çevrimdışı ekranı (eski HTML değil)', async () => {
    let p: Promise<unknown> | undefined
    sw.listeners.install.forEach((fn) => fn({ waitUntil: (x: Promise<unknown>) => (p = x) }))
    await p
    sw.setNetwork(async () => { throw new Error('offline') })
    const { responded, res } = await sw.dispatchFetch(`${ORIGIN}/orders`, { mode: 'navigate' })
    expect(responded).toBe(true)
    const offline = [...sw.store.values()].find((c) => c.has(`${ORIGIN}/offline.html`))!.get(`${ORIGIN}/offline.html`)
    expect(res).toBe(offline)
  })

  it('etkinleşince eski sürüm önbellekleri (premium-v1 dahil) silinir', async () => {
    sw.store.set('premium-v1', new Map())
    sw.store.set('ek-shell-eski', new Map())
    let p: Promise<unknown> | undefined
    sw.listeners.activate.forEach((fn) => fn({ waitUntil: (x: Promise<unknown>) => (p = x) }))
    await p
    expect([...sw.store.keys()]).toEqual([])
  })

  it('kurulumda kendiliğinden skipWaiting yok; yalnız kullanıcı "Yenile" deyince', () => {
    const install = source.slice(source.indexOf("addEventListener('install'"), source.indexOf("addEventListener('message'"))
    expect(install).not.toMatch(/skipWaiting\(\)/)
    expect(source).toMatch(/SKIP_WAITING'\) self\.skipWaiting\(\)/)
  })

  it('sürüm yer tutucusu derlemede değiştirilir', () => {
    expect(source).toContain("const VERSION = '__EK_SW_VERSION__'")
    expect(readFileSync(resolve(root, 'vite.config.mts'), 'utf8')).toMatch(/__EK_SW_VERSION__/)
  })
})
