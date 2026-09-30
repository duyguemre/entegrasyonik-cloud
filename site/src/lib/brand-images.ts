/**
 * Derleme zamanı marka görselleri (S19): favicon SVG, PNG simgeler (apple-touch / manifest) ve sayfa başına
 * Open Graph görseli (1200×630). Renkler YALNIZCA token'lardan (statik dosyada ham hex yok); stok fotoğraf, rakip
 * adı/logosu, sayı veya iddia YOK — görseldeki metin SEO kaydının başlığı + bölüm etiketidir.
 *
 * Yazı tipi: SVG → PNG dönüştürücüsü (sharp/librsvg) sistem yazı tiplerini kullanır; yığın Inter öncelikli, yoksa
 * sistemdeki sans-serif'e düşer (derleme makinesine göre küçük farklar olabilir — görsel onayı yerelde yapılır).
 */
import sharp from 'sharp'
import { lightToken } from './tokens-node'
import { SITE_NAME, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, type SeoEntry } from '../data/seo'

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const FONT = "Inter, 'Segoe UI', 'Helvetica Neue', Arial, 'DejaVu Sans', sans-serif"

/** Logo.astro / favicon ile aynı geometri ("E" monogramı, iki kanal düğümü + teal merkez), 32×32 birimde. */
function markPaths(ink: string, hub: string): string {
  return (
    `<circle cx="18.5" cy="16" r="5" fill="${hub}" fill-opacity="0.22"/>` +
    `<path d="M20 9.5H13C10.8 9.5 9.5 10.8 9.5 13V19C9.5 21.2 10.8 22.5 13 22.5H20M9.5 16H15.5" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="18.5" cy="16" r="3" fill="${hub}"/>` +
    `<circle cx="22" cy="9.5" r="2.25" fill="${ink}"/>` +
    `<circle cx="22" cy="22.5" r="2.25" fill="${ink}"/>`
  )
}

function palette() {
  return {
    tileTop: lightToken('--ek-color-primary-darken-1'),
    tile: lightToken('--ek-color-primary'),
    hub: lightToken('--ek-color-secondary'),
    ink: lightToken('--ek-color-background'),
    deep: lightToken('--ek-color-content-strong'),
  }
}

/** Favicon / simge SVG'si. `rounded=false`: tam kare (iOS kendi maskesini uygular). */
export function faviconSvg(rounded = true): string {
  const c = palette()
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.tileTop}"/><stop offset="1" stop-color="${c.tile}"/></linearGradient></defs>` +
    `<rect x="0" y="0" width="32" height="32" rx="${rounded ? 9 : 0}" fill="url(#t)"/>` +
    markPaths(c.ink, c.hub) +
    `</svg>`
  )
}

export async function iconPng(size: number, rounded: boolean): Promise<Uint8Array> {
  const buf = await sharp(Buffer.from(faviconSvg(rounded)), { density: Math.ceil((72 * size) / 32) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer()
  return new Uint8Array(buf)
}

/** Basit sözcük kaydırma (SVG'de otomatik satır kırma yok). Satır sayısı aşılırsa son satır "…" ile biter. */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (next.length > maxChars && line) {
      lines.push(line)
      line = w
    } else line = next
  }
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s,.:;]+$/, '')}…`
  return kept
}

/** Sayfa OG görseli (SVG). Sol: marka + bölüm etiketi + başlık; sağ: soyut kanal→merkez diyagramı (logo yok). */
export function ogImageSvg(entry: Pick<SeoEntry, 'title' | 'ogEyebrow'>, host: string): string {
  const c = palette()
  const W = OG_IMAGE_WIDTH
  const H = OG_IMAGE_HEIGHT
  const size = entry.title.length > 34 ? 60 : 68
  const lines = wrapText(entry.title, size === 60 ? 22 : 20, 3)
  const lineH = Math.round(size * 1.12)
  // Sabit dikey düzen: marka (üst) → bölüm etiketi → başlık (en çok üç satır) → alt satır; çakışma olmaz.
  const titleTop = 262 + size
  const title = lines
    .map((l, i) => `<text x="80" y="${titleTop + i * lineH}" font-size="${size}" font-weight="700" fill="${c.ink}" letter-spacing="-1">${esc(l)}</text>`)
    .join('')
  const eyebrowW = Math.round(entry.ogEyebrow.length * 14.5 + 48)
  // Sağdaki diyagram: altı kanal düğümü → merkez (soyut; ad/logo yok).
  const cx = 930
  const cy = 315
  const nodes = [
    [cx - 170, cy - 150],
    [cx + 150, cy - 170],
    [cx + 200, cy + 20],
    [cx + 130, cy + 180],
    [cx - 160, cy + 160],
    [cx - 210, cy + 5],
  ]
  const diagram =
    nodes.map(([x, y]) => `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${c.ink}" stroke-opacity="0.22" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round"/>`).join('') +
    nodes
      .map(
        ([x, y]) =>
          `<rect x="${x - 34}" y="${y - 34}" width="68" height="68" rx="18" fill="${c.ink}" fill-opacity="0.08" stroke="${c.ink}" stroke-opacity="0.28" stroke-width="2"/>` +
          `<rect x="${x - 14}" y="${y - 5}" width="28" height="10" rx="5" fill="${c.ink}" fill-opacity="0.5"/>`,
      )
      .join('') +
    `<circle cx="${cx}" cy="${cy}" r="92" fill="${c.hub}" fill-opacity="0.16"/>` +
    `<g transform="translate(${cx - 64} ${cy - 64}) scale(4)"><rect width="32" height="32" rx="9" fill="url(#tile)"/>${markPaths(c.ink, c.hub)}</g>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${esc(FONT)}">` +
    `<defs>` +
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.deep}"/><stop offset="1" stop-color="${c.tileTop}"/></linearGradient>` +
    `<linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.tileTop}"/><stop offset="1" stop-color="${c.tile}"/></linearGradient>` +
    `<radialGradient id="glow" cx="0.78" cy="0.5" r="0.5"><stop offset="0" stop-color="${c.hub}" stop-opacity="0.28"/><stop offset="1" stop-color="${c.hub}" stop-opacity="0"/></radialGradient>` +
    `<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="${c.ink}" stroke-opacity="0.05" stroke-width="1"/></pattern>` +
    `</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#grid)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#glow)"/>` +
    `<rect x="0" y="0" width="${W}" height="8" fill="${c.hub}"/>` +
    diagram +
    `<g transform="translate(80 64) scale(1.75)"><rect width="32" height="32" rx="9" fill="url(#tile)"/>${markPaths(c.ink, c.hub)}</g>` +
    `<text x="148" y="103" font-size="34" font-weight="700" fill="${c.ink}">${esc(SITE_NAME)}</text>` +
    `<rect x="80" y="176" width="${eyebrowW}" height="46" rx="23" fill="${c.hub}" fill-opacity="0.18" stroke="${c.hub}" stroke-opacity="0.6"/>` +
    `<text x="104" y="208" font-size="24" font-weight="600" fill="${c.ink}">${esc(entry.ogEyebrow)}</text>` +
    title +
    `<text x="80" y="566" font-size="26" font-weight="500" fill="${c.ink}" fill-opacity="0.78">Pazaryeri entegrasyonu ve stok yönetimi · ${esc(host)}</text>` +
    `</svg>`
  )
}

export async function ogImagePng(entry: Pick<SeoEntry, 'title' | 'ogEyebrow'>, host: string): Promise<Uint8Array> {
  const buf = await sharp(Buffer.from(ogImageSvg(entry, host))).png({ compressionLevel: 9, palette: true, quality: 90, dither: 0.6 }).toBuffer()
  return new Uint8Array(buf)
}
