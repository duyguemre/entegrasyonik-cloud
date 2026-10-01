// MOB-01 — kurulum ipucu kararı ve manifest.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installHint, isIosSafari } from '../../src/pwa/pwaState'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const base = { desktopShell: false, standalone: false, dismissed: false, mobile: true, hasPromptEvent: false, iosSafari: false }

describe('installHint', () => {
  it('Android istemi varsa "android", iOS Safari ise "ios"', () => {
    expect(installHint({ ...base, hasPromptEvent: true })).toBe('android')
    expect(installHint({ ...base, iosSafari: true })).toBe('ios')
    expect(installHint(base)).toBe('none')
  })
  it('masaüstü kabuğu, kurulu, kapatılmış veya geniş ekran → hiçbiri', () => {
    for (const k of ['desktopShell', 'standalone', 'dismissed'] as const) {
      expect(installHint({ ...base, hasPromptEvent: true, [k]: true })).toBe('none')
    }
    expect(installHint({ ...base, hasPromptEvent: true, mobile: false })).toBe('none')
  })
})

describe('isIosSafari', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  it('iPhone Safari evet; iOS Chrome hayır; Android hayır; iPadOS (Macintosh + dokunmatik) evet', () => {
    expect(isIosSafari(iphone)).toBe(true)
    expect(isIosSafari(iphone.replace('Version/18.0', 'CriOS/130.0'))).toBe(false)
    expect(isIosSafari('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36')).toBe(false)
    expect(isIosSafari('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 5)).toBe(true)
    expect(isIosSafari('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 0)).toBe(false)
  })
})

describe('manifest', () => {
  const m = JSON.parse(readFileSync(resolve(root, 'public/manifest.json'), 'utf8'))
  it('kurulabilirlik alanları: ad, start_url, standalone, 192 + 512 PNG, maskable', () => {
    expect(m.name).toBe('Entegrasyonik')
    expect(m.short_name).toBe('Entegrasyonik')
    expect(m.start_url).toBe('/')
    expect(m.display).toBe('standalone')
    expect(m.theme_color).toBe('#13255B')
    const sizes = m.icons.map((i: any) => `${i.sizes}:${i.type}:${i.purpose}`)
    expect(sizes).toEqual(expect.arrayContaining(['192x192:image/png:any', '512x512:image/png:any', '512x512:image/png:maskable']))
    for (const i of m.icons) expect(existsSync(resolve(root, 'public', i.src.slice(1)))).toBe(true)
  })
  it('index.html açık + koyu tema rengi ve iOS ana ekran ikonu', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8')
    expect(html).toMatch(/theme-color" content="#13255B" media="\(prefers-color-scheme: light\)"/)
    expect(html).toMatch(/theme-color" content="#0B1530" media="\(prefers-color-scheme: dark\)"/)
    expect(html).toContain('/icons/apple-touch-icon.png')
  })
  it('çevrimdışı ekranı: satır içi betik ve dış kaynak yok (CSP), dürüst metin', () => {
    const html = readFileSync(resolve(root, 'public/offline.html'), 'utf8')
    expect(html).not.toMatch(/<script>(?!<\/script>)|https?:\/\//)
    expect(html).toContain('veri göstermez')
  })
})
