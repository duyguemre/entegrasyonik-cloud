import type { APIRoute } from 'astro'
import { siteConfig } from '../lib/site-config'
import { buildRobots } from '../lib/robots'
import { previewOnlyPaths } from '../data/seo'

/** robots.txt — kural ve yapay zeka tarayıcı kararı: src/lib/robots.ts (S19). */
export const GET: APIRoute = () =>
  new Response(buildRobots({ draft: siteConfig.draft, siteUrl: siteConfig.siteUrl, disallow: previewOnlyPaths() }), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
