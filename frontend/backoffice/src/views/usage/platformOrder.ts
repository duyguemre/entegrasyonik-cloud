/** MOB-08 — ekranlardaki platform sırası (tek kaynak paketten). */
import { CLIENT_PLATFORMS } from '@entegrasyonik/ui/platform'
import type { PlatformClass, PlatformFilter } from '@entegrasyonik/ui/platform'

export { CLIENT_PLATFORMS }
export const PLATFORM_CLASSES_UI: readonly PlatformClass[] = ['desktop', 'mobile', 'unknown']
const FILTERS: readonly string[] = ['desktop', 'mobile', ...CLIENT_PLATFORMS]

/** URL `?platform=` → süzgeç (geçersiz/boş → null = tümü). */
export function platformFromQuery(v: unknown): PlatformFilter | null {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' && FILTERS.includes(s) ? (s as PlatformFilter) : null
}
