import type { APIRoute, GetStaticPaths } from 'astro'
import { iconPng } from '../lib/brand-images'

/**
 * PNG simgeler (S19): apple-touch-icon (180, tam kare — iOS kendi maskesini uygular) ve web manifest simgeleri
 * (192/512, yuvarlatılmış karo). Kaynak: favicon ile aynı token'lı SVG (src/lib/brand-images.ts).
 */
const ICONS = {
  'apple-touch-icon': { size: 180, rounded: false },
  'icon-192': { size: 192, rounded: true },
  'icon-512': { size: 512, rounded: true },
} as const

export const getStaticPaths = (() => Object.keys(ICONS).map((icon) => ({ params: { icon } }))) satisfies GetStaticPaths

export const GET: APIRoute = async ({ params }) => {
  const spec = ICONS[params.icon as keyof typeof ICONS]
  return new Response(await iconPng(spec.size, spec.rounded), { headers: { 'Content-Type': 'image/png' } })
}
