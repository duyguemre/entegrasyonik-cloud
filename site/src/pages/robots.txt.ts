import type { APIRoute } from 'astro'
import { siteConfig } from '../lib/site-config'

/** TASLAK: her şey kapalı. Yayın (SITE_DRAFT=false, insan onayı) + PUBLIC_SITE_URL: açık + sitemap. */
export const GET: APIRoute = () => {
  const body = siteConfig.draft
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap-index.xml', siteConfig.siteUrl).href}\n`
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
