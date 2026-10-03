import type { APIRoute } from 'astro'
import { lightToken } from '../lib/tokens-node'

/**
 * Favicon — token renklerinden derleme zamanında üretilir (statik dosyada ham hex tutulmaz).
 * S15: özgün işaret (src/components/Logo.astro ile aynı geometri: "E" monogramı, iki kanal düğümü + teal merkez).
 * Karo hafif degradelidir (koyu sekme çubuğunda da seçilir); küçük boyutta okunurluk için çizgi biraz kalındır.
 */
export const GET: APIRoute = () => {
  const tileTop = lightToken('--ek-color-primary-darken-1')
  const tile = lightToken('--ek-color-primary')
  const hub = lightToken('--ek-color-secondary')
  const ink = lightToken('--ek-color-background')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tileTop}"/><stop offset="1" stop-color="${tile}"/></linearGradient></defs>` +
    `<rect x="0" y="0" width="32" height="32" rx="9" fill="url(#t)"/>` +
    `<circle cx="18.5" cy="16" r="5" fill="${hub}" fill-opacity="0.22"/>` +
    `<path d="M20 9.5H13C10.8 9.5 9.5 10.8 9.5 13V19C9.5 21.2 10.8 22.5 13 22.5H20M9.5 16H15.5" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="18.5" cy="16" r="3" fill="${hub}"/>` +
    `<circle cx="22" cy="9.5" r="2.25" fill="${ink}"/>` +
    `<circle cx="22" cy="22.5" r="2.25" fill="${ink}"/>` +
    `</svg>`
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } })
}
