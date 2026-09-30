import type { APIRoute, GetStaticPaths } from 'astro'
import { seoEntries, ogSlug, type SeoEntry } from '../../data/seo'
import { ogImagePng } from '../../lib/brand-images'
import { siteConfig } from '../../lib/site-config'

/**
 * Sayfa başına Open Graph görseli (S19) — SEO kaydındaki HER sayfa için derleme zamanında PNG (1200×630).
 * Metin: kayıttaki bölüm etiketi + sayfa başlığı; alt satırda alan adı (yayın modunda PUBLIC_SITE_URL, taslakta hedef ad).
 */
export const getStaticPaths = (() =>
  seoEntries.filter((e) => !e.previewOnly).map((entry) => ({ params: { slug: ogSlug(entry.path) }, props: { entry } }))) satisfies GetStaticPaths

export const GET: APIRoute = async ({ props }) => {
  const { entry } = props as { entry: SeoEntry }
  const host = siteConfig.siteUrl ? new URL(siteConfig.siteUrl).host : 'entegrasyonik.com'
  return new Response(await ogImagePng(entry, host), { headers: { 'Content-Type': 'image/png' } })
}
