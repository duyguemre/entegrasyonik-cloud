// MOB-06 — backoffice PWA: kurulum ipucu kararı, ayrı manifest/kimlik/kapsam, çevrimdışı ekranı, depo izni.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installHint, isIosSafari, INSTALL_DISMISS_KEY } from '../src/pwa/pwaState'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')
const base = { standalone: false, dismissed: false, mobile: true, signedIn: true, hasPromptEvent: false, iosSafari: false }

describe('installHint', () => {
  it('Android istemi varsa "android", iOS Safari ise "ios"', () => {
    expect(installHint({ ...base, hasPromptEvent: true })).toBe('android')
    expect(installHint({ ...base, iosSafari: true })).toBe('ios')
    expect(installHint(base)).toBe('none')
  })
  it('kurulu, kapatılmış, geniş ekran ya da oturum yok → hiçbiri', () => {
    for (const k of ['standalone', 'dismissed'] as const) expect(installHint({ ...base, hasPromptEvent: true, [k]: true })).toBe('none')
    expect(installHint({ ...base, hasPromptEvent: true, mobile: false })).toBe('none')
    expect(installHint({ ...base, hasPromptEvent: true, signedIn: false })).toBe('none')
  })
})

describe('isIosSafari', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  it('iPhone Safari evet; iOS Chrome ve Android hayır', () => {
    expect(isIosSafari(iphone)).toBe(true)
    expect(isIosSafari(iphone.replace('Version/18.0', 'CriOS/130.0'))).toBe(false)
    expect(isIosSafari('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36')).toBe(false)
  })
})

describe('manifest — ayrı kimlik', () => {
  const m = JSON.parse(read('public/manifest.json'))
  it('ad "Entegrasyonik Yönetim", standalone, kendi kapsamı, 192 + 512 PNG + maskable (dosyalar var)', () => {
    expect(m.name).toBe('Entegrasyonik Yönetim')
    expect(m.short_name).toBe('EK Yönetim')
    expect(m.id).toBe('/')
    expect(m.scope).toBe('/')
    expect(m.start_url).toBe('/genel-bakis')
    expect(m.display).toBe('standalone')
    expect(m.lang).toBe('tr')
    const sizes = m.icons.map((i: { sizes: string; type: string; purpose: string }) => `${i.sizes}:${i.type}:${i.purpose}`)
    expect(sizes).toEqual(expect.arrayContaining(['192x192:image/png:any', '512x512:image/png:any', '512x512:image/png:maskable']))
    for (const i of m.icons) expect(existsSync(resolve(root, 'public', i.src.slice(1))), i.src).toBe(true)
    expect(existsSync(resolve(root, 'public/icons/apple-touch-icon.png'))).toBe(true)
  })
  it('uygulama PWA\'sıyla çakışmaz: ad, kısa ad ve başlangıç adresi farklı; ikonlar ayrı dosyalar', () => {
    const appPath = resolve(root, '../public/manifest.json')
    if (!existsSync(appPath)) return
    const app = JSON.parse(readFileSync(appPath, 'utf8'))
    expect(m.name).not.toBe(app.name)
    expect(m.short_name).not.toBe(app.short_name)
    expect(m.start_url).not.toBe(app.start_url)
    expect(readFileSync(resolve(root, 'public/icons/icon-512.png')).equals(readFileSync(resolve(root, '../public/icons/icon-512.png')))).toBe(false)
  })
  it('index.html: manifest, açık + koyu tema rengi, iOS ikonu ve başlığı, SW kaydı ayrı modül', () => {
    const html = read('index.html')
    expect(html).toContain('<link rel="manifest" href="/manifest.json" />')
    expect(html).toMatch(/theme-color" content="#13255B" media="\(prefers-color-scheme: light\)"/)
    expect(html).toMatch(/theme-color" content="#0B1530" media="\(prefers-color-scheme: dark\)"/)
    expect(html).toContain('/icons/apple-touch-icon.png')
    expect(html).toContain('apple-mobile-web-app-title" content="EK Yönetim"')
    expect(html).toContain('<script type="module" src="/src/registerServiceWorker.ts"></script>')
  })
  it('SW geliştirmede kaydedilmez; kapsam "/"', () => {
    const reg = read('src/registerServiceWorker.ts')
    expect(reg).toMatch(/!import\.meta\.env\.DEV/)
    expect(reg).toContain("register('/service-worker.js', { scope: '/' })")
  })
})

describe('çevrimdışı ekranı', () => {
  const html = read('public/offline.html')
  it('satır içi betik ve dış kaynak yok (CSP), dürüst metin, backoffice tema anahtarı', () => {
    expect(html).not.toMatch(/<script>(?!<\/script>)|https?:\/\//)
    expect(html).toContain('verisi göstermez')
    expect(html).toContain('hiçbir işlem yapmaz')
    expect(html).toContain('data-storage-key="ek-bo-theme"')
    expect(html).toContain('noindex')
  })
})

describe('depo', () => {
  it('pwaState yalnız kurulum kartı bayrağını yazar (bo- önekli, değer "1")', () => {
    const src = read('src/pwa/pwaState.ts')
    expect(INSTALL_DISMISS_KEY).toBe('bo-pwa-install-dismissed')
    const writes = [...src.matchAll(/localStorage\.setItem\(([^)]*)\)/g)].map((x) => x[1])
    expect(writes).toEqual(["INSTALL_DISMISS_KEY, '1'"])
    expect(src).not.toMatch(/sessionStorage|document\.cookie/)
  })
})
