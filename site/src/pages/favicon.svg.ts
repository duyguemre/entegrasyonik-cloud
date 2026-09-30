import type { APIRoute } from 'astro'
import { faviconSvg } from '../lib/brand-images'

/**
 * Favicon — token renklerinden derleme zamanında üretilir (statik dosyada ham hex tutulmaz).
 * S15: özgün işaret (src/components/Logo.astro ile aynı geometri). S19: geometri src/lib/brand-images.ts'te ortak
 * (PNG simgeler ve OG görselleri de aynı kaynaktan).
 */
export const GET: APIRoute = () => new Response(faviconSvg(), { headers: { 'Content-Type': 'image/svg+xml' } })
