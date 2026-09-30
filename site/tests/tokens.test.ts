import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { primaryNav, legalNav, published } from '../src/data/navigation'

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(siteRoot, 'src')
const staticTokensPath = path.resolve(siteRoot, '../frontend/src/design/tokens/dist/tokens.static.css')

const read = (p: string) => readFileSync(p, 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')

function walk(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) return walk(p, exts)
    return exts.some((e) => p.endsWith(e)) ? [p] : []
  })
}

const staticTokens = read(staticTokensPath)
const siteTokensCss = read(path.join(src, 'styles/site-tokens.css'))
const globalCss = read(path.join(src, 'styles/global.css'))
const styleFiles = walk(src, ['.astro', '.css', '.ts', '.mjs'])

const declared = (css: string) => [...stripComments(css).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])
const ekDefined = new Set(declared(staticTokens))
const siteDefined = new Set(declared(siteTokensCss))

const toMs = (v: string) => (v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000)
const siteValue = (name: string) => {
  const m = stripComments(siteTokensCss).match(new RegExp(`${name}:\\s*([^;]+);`))
  if (!m) throw new Error(`${name} tanımlı değil`)
  return m[1].trim()
}

describe('token kaynağı ve katman ayrımı (ADR-0014 Karar 1)', () => {
  it('tokens.static.css repo içinden okunur ve dolu', () => {
    expect(existsSync(staticTokensPath)).toBe(true)
    expect(ekDefined.size).toBeGreaterThan(100)
  })

  it('tokens.css statik token dosyasını KOPYALAMADAN import eder', () => {
    const tokensCss = read(path.join(src, 'styles/tokens.css'))
    expect(tokensCss).toMatch(/@import\s+'\.\.\/\.\.\/\.\.\/frontend\/src\/design\/tokens\/dist\/tokens\.static\.css'/)
    expect(existsSync(path.join(src, 'styles/tokens.static.css'))).toBe(false)
    // sıra: önce --ek-*, sonra --site-*
    expect(tokensCss.indexOf('tokens.static.css')).toBeLessThan(tokensCss.indexOf('site-tokens.css'))
  })

  it('site-tokens.css hiçbir --ek-* tanımlamaz; yalnızca --site-* (ve kanal paleti --channel-*) ekler', () => {
    const names = declared(siteTokensCss)
    expect(names.length).toBeGreaterThan(20)
    expect(names.filter((n) => n.startsWith('--ek-'))).toEqual([])
    expect(names.filter((n) => !n.startsWith('--site-') && !n.startsWith('--channel-'))).toEqual([])
  })

  it('site-tokens.css ham renk içermez; renkler --ek-color-* üzerinden (istisna: --channel-* kanal paleti)', () => {
    // Kanal (pazaryeri) resmi marka renkleri: TEK belgelenmiş istisna (C1S — docs/cloud-contracts/
    // CHANNEL_BRAND_COLORS.md, logo değil; bkz. site-tokens.css notu + tests/channel-colors.test.ts). Bu satırlar
    // hariç dosyanın geri kalanında hâlâ ham hex/rgb yasak.
    const CHANNEL_HEX_EXCEPTION = /^\s*--channel-[\w-]+:\s*#[0-9a-fA-F]{3,8}\s*;.*$/m
    const css = stripComments(siteTokensCss)
      .split('\n')
      .filter((line) => !CHANNEL_HEX_EXCEPTION.test(line))
      .join('\n')
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla|hwb|oklch|lab)\(/)
    // İstisna tam olarak uygulanmış 6 kanal × (marka + on) için mi (yeni kanal eklenirse bilinçli güncellenir)
    const exceptionLines = stripComments(siteTokensCss)
      .split('\n')
      .filter((line) => CHANNEL_HEX_EXCEPTION.test(line))
    expect(exceptionLines).toHaveLength(12)
  })

  it('kodda kullanılan her var(--ek-*/--site-*) bir yerde tanımlı', () => {
    const missing: string[] = []
    for (const file of styleFiles) {
      for (const m of stripComments(read(file)).matchAll(/var\((--(?:ek|site|channel)-[\w-]+)/g)) {
        const ok = m[1].startsWith('--ek-') ? ekDefined.has(m[1]) : siteDefined.has(m[1])
        if (!ok) missing.push(`${path.relative(siteRoot, file)}: ${m[1]}`)
      }
    }
    expect(missing).toEqual([])
  })
})

describe('hardcode yasağı (bileşen/sayfa/stil kaynakları)', () => {
  const checked = styleFiles.filter((f) => !f.endsWith('site-tokens.css'))

  it('ham hex/rgb/hsl renk yok', () => {
    const offenders: string[] = []
    for (const file of checked) {
      const text = stripComments(read(file))
      // `&#39;` HTML varlıkları ve `href="#..."` bağlantıları renk değildir
      for (const m of text.matchAll(/(?<![\w&])#[0-9a-fA-F]{3,8}\b/g)) {
        if (/href=["']$/.test(text.slice(Math.max(0, m.index! - 6), m.index!))) continue
        offenders.push(`${path.relative(siteRoot, file)}: ${m[0]}`)
      }
      for (const m of text.matchAll(/\b(?:rgb|rgba|hsl|hsla)\(/g)) offenders.push(`${path.relative(siteRoot, file)}: ${m[0]}`)
    }
    expect(offenders).toEqual([])
  })

  it('ham px yok (kırılım @media satırları hariç) — boşluk/boyut token üzerinden', () => {
    const offenders: string[] = []
    for (const file of checked.filter((f) => /\.(astro|css)$/.test(f))) {
      stripComments(read(file))
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*@(media|container)\b/.test(line)) return
          for (const m of line.matchAll(/(?<![\w.-])\d+(?:\.\d+)?px\b/g)) {
            offenders.push(`${path.relative(siteRoot, file)}:${i + 1} ${m[0]}`)
          }
        })
    }
    expect(offenders).toEqual([])
  })

  it('geçiş/animasyon süreleri ham değer değil token (yalnızca reduced-motion 0.01ms istisnası)', () => {
    const offenders: string[] = []
    for (const file of checked.filter((f) => /\.(astro|css)$/.test(f))) {
      stripComments(read(file))
        .split('\n')
        .forEach((line, i) => {
          if (!/(transition|animation)[\w-]*\s*:/.test(line) && !/^\s+(?:background|border|color|opacity|transform)[\w-]*\s+\d/.test(line)) return
          for (const m of line.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)(ms|s)\b/g)) {
            if (m[0] === '0.01ms') continue
            offenders.push(`${path.relative(siteRoot, file)}:${i + 1} ${m[0]}`)
          }
        })
    }
    expect(offenders).toEqual([])
  })

  it('yasaklı "lunapark" animasyonları yok (bounce/pulse/wobble/shake/jelly/elastic keyframes)', () => {
    const offenders = checked.flatMap((file) =>
      [...stripComments(read(file)).matchAll(/@keyframes\s+([\w-]+)/g)]
        .filter((m) => /bounce|pulse|wobble|shake|jelly|elastic|swing|tada|flip/i.test(m[1]))
        .map((m) => `${path.relative(siteRoot, file)}: ${m[1]}`),
    )
    expect(offenders).toEqual([])
  })
})

describe('pazarlama hareket kuralları (ADR-0014 Karar 3)', () => {
  it('uygulama motion token\'ları 150–300 ms (etkileşim geri bildirimi)', () => {
    for (const name of ['--ek-duration-fast', '--ek-duration-base', '--ek-duration-slow']) {
      const m = staticTokens.match(new RegExp(`${name}:\\s*(\\d+)ms`))
      const ms = Number(m?.[1])
      expect(ms, name).toBeGreaterThanOrEqual(150)
      expect(ms, name).toBeLessThanOrEqual(300)
    }
  })

  it('reveal süreleri 400–900 ms', () => {
    for (const name of ['--site-motion-duration-reveal-sm', '--site-motion-duration-reveal', '--site-motion-duration-reveal-lg']) {
      const ms = toMs(siteValue(name))
      expect(ms, name).toBeGreaterThanOrEqual(400)
      expect(ms, name).toBeLessThanOrEqual(900)
    }
  })

  it('stagger <= 80 ms/öğe, sahne toplamı <= 1.6 sn', () => {
    expect(toMs(siteValue('--site-motion-stagger'))).toBeLessThanOrEqual(80)
    expect(toMs(siteValue('--site-motion-scene-max'))).toBeLessThanOrEqual(1600)
  })

  it('ambient döngüler 6–30 sn', () => {
    expect(toMs(siteValue('--site-motion-ambient-fast'))).toBeGreaterThanOrEqual(6000)
    expect(toMs(siteValue('--site-motion-ambient-slow'))).toBeLessThanOrEqual(30000)
  })

  it('reduced-motion bloğu var: reveal <= 150 ms, stagger/ambient 0', () => {
    const css = stripComments(siteTokensCss)
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/)
    expect(block, 'site-tokens.css reduced-motion bloğu').not.toBeNull()
    const body = block![1]
    for (const name of ['reveal-sm', 'reveal', 'reveal-lg']) {
      expect(body).toMatch(new RegExp(`--site-motion-duration-${name}:\\s*var\\(--ek-duration-fast\\)`))
    }
    expect(body).toMatch(/--site-motion-stagger:\s*0ms/)
    expect(body).toMatch(/--site-motion-ambient-fast:\s*0s/)
    expect(body).toMatch(/--site-motion-ambient-slow:\s*0s/)
    // reveal token'ı reduce altında gerçekten <= 150 ms'e çözülür
    expect(ekDefined.has('--ek-duration-fast')).toBe(true)
    expect(Number(staticTokens.match(/--ek-duration-fast:\s*(\d+)ms/)![1])).toBeLessThanOrEqual(150)
  })

  it('global.css reduced-motion altında animasyon/geçiş/kaydırmayı kapatır', () => {
    const block = stripComments(globalCss).match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\n\}/)
    expect(block).not.toBeNull()
    expect(block![1]).toMatch(/animation-duration:\s*0\.01ms/)
    expect(block![1]).toMatch(/scroll-behavior:\s*auto/)
    expect(block![1]).toMatch(/transition-duration:\s*var\(--ek-duration-fast\)/)
  })

  it('display ölçeği akışkan clamp(), sıkı satır aralığı ve negatif harf aralığı', () => {
    for (const size of ['sm', 'md', 'lg', 'xl']) {
      expect(siteValue(`--site-font-display-${size}`)).toMatch(/^clamp\(/)
    }
    expect(Number(siteValue('--site-font-display-line-height'))).toBeLessThanOrEqual(1.15)
    expect(siteValue('--site-font-display-tracking')).toMatch(/^-/)
    expect(Number(siteValue('--site-font-body-line-height'))).toBeGreaterThanOrEqual(1.5)
  })
})

describe('gezinme haritası', () => {
  it('yayımlanmış her gezinme öğesinin sayfası vardır (kırık bağlantı üretilmez)', () => {
    const missing = published([...primaryNav, ...legalNav])
      .map((i) => i.href)
      .filter((href) => {
        const base = path.join(src, 'pages', href)
        return !(existsSync(`${base}.astro`) || existsSync(path.join(base, 'index.astro')))
      })
    expect(missing).toEqual([])
  })
})

describe('font (self-host, latin + latin-ext)', () => {
  const fonts = read(path.join(src, 'styles/fonts.css'))

  it('CDN yok; yalnızca yerel woff2', () => {
    expect(fonts).not.toMatch(/https?:\/\//)
    expect(fonts).not.toMatch(/fonts\.googleapis|fonts\.gstatic/)
    expect([...fonts.matchAll(/url\(([^)]+)\)/g)].every((m) => m[1].endsWith('.woff2'))).toBe(true)
  })

  it('S3 kararı: alt küme başına TEK değişken dosya (latin + latin-ext; Türkçe ğ/ş/İ için latin-ext zorunlu), tüm ağırlıklar aralık olarak, font-display: swap', () => {
    const faces = [...fonts.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]).filter((b) => /font-family:\s*'Inter'\s*;/.test(b))
    expect(faces).toHaveLength(2)
    expect(fonts).toContain('inter-latin-wght-normal.woff2')
    expect(fonts).toContain('inter-latin-ext-wght-normal.woff2')
    for (const f of faces) {
      expect(f).toMatch(/font-weight:\s*100 900/)
      expect(f).toMatch(/font-display:\s*swap/)
      expect(f).toMatch(/unicode-range:/)
    }
    // eski 10 statik dosya geri gelmemeli (LCP: ~300 KB, iki aşamalı istek)
    expect(fonts).not.toMatch(/inter-latin(?:-ext)?-\d{3}-normal/)
  })

  it('metrik-uyumlu yedek korunur (CLS)', () => {
    expect(fonts).toMatch(/font-family:\s*'Inter Fallback'/)
    expect(fonts).toMatch(/size-adjust:/)
  })
})
