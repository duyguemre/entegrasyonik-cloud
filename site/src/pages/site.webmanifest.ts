import type { APIRoute } from 'astro'
import { lightToken } from '../lib/tokens-node'
import { SITE_NAME, TAGLINE } from '../data/seo'

/** Web uygulama manifesti (S19): ad, dil, tema rengi ve simgeler. Tanıtım sitesi → `display: browser`. */
export const GET: APIRoute = () => {
  const manifest = {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: TAGLINE,
    lang: 'tr',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'browser',
    theme_color: lightToken('--ek-color-primary'),
    background_color: lightToken('--ek-color-background'),
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }
  return new Response(JSON.stringify(manifest, null, 2), { headers: { 'Content-Type': 'application/manifest+json' } })
}
