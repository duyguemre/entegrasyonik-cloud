/**
 * Faz 3 B2 — JS tarafı animasyon süresi (SortableJS `animation` ms ister). Değer token'dan okunur
 * (`--ek-duration-*`); sistem reduced-motion'da token 0'a iner (app.css), uygulama tercihi
 * `<html data-motion="reduced">` da 0 döndürür. Ham ms YOK.
 */
export function motionMs(token: 'fast' | 'base' | 'slow' = 'base'): number {
  if (typeof document === 'undefined') return 0
  const root = document.documentElement
  if (root.dataset.motion === 'reduced') return 0
  const raw = getComputedStyle(root).getPropertyValue(`--ek-duration-${token}`).trim()
  const n = parseFloat(raw)
  if (!Number.isFinite(n)) return 0
  return raw.endsWith('ms') ? n : n * 1000
}
