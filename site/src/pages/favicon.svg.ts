import type { APIRoute } from 'astro'
import { lightToken } from '../lib/tokens-node'

/**
 * Favicon — token renklerinden derleme zamanında üretilir (statik dosyada ham hex tutulmaz).
 * Yer tutucu işaret; nihai logo insan kararıdır (ADR-0014 Açık Soru 3).
 */
export const GET: APIRoute = () => {
  const tile = lightToken('--ek-color-primary')
  const hub = lightToken('--ek-color-secondary')
  const node = lightToken('--ek-color-background')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${tile}"/><circle cx="16" cy="16" r="5" fill="${hub}"/><circle cx="16" cy="6.5" r="2.5" fill="${node}"/><circle cx="24.2" cy="20.8" r="2.5" fill="${node}"/><circle cx="7.8" cy="20.8" r="2.5" fill="${node}"/></svg>`
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } })
}
