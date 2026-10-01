/**
 * @entegrasyonik/ui/motion — FR3 madde 7 (fe-r3a): JS tarafındaki hareketin TEK kaynağı.
 *
 * CSS geçişleri `--ek-motion-<rol>` değişkenlerini kullanır; JS'te süre/eğri gereken yerler (Web Animations API,
 * SortableJS `animation`, kaydırma) BU modülü kullanır — ham ms / eğri literali yazılmaz (bekçi:
 * `frontend/tests/motion-single-source.test.ts`). Değer önce canlı CSS değişkeninden okunur (reduced-motion ve
 * `<html data-motion="reduced">` kökten akar), okunamazsa token kaynağındaki (`tokens/scale.ts`) değer kullanılır.
 * SAF TS — Vue/DOM bağımlılığı yalnız çalışma anında `document` varsa.
 */
import { duration, easing, motionDistance, motionRole } from './tokens/scale'

export type MotionRole = keyof typeof motionRole

function rootEl(): HTMLElement | undefined {
  return typeof document === 'undefined' ? undefined : document.documentElement
}

function cssVar(name: string): string {
  const root = rootEl()
  if (!root || typeof getComputedStyle === 'undefined') return ''
  return getComputedStyle(root).getPropertyValue(name).trim()
}

/** "200ms" | "0.2s" → 200; çözülemezse `undefined`. */
export function parseMs(raw: string): number | undefined {
  const n = parseFloat(raw)
  if (!Number.isFinite(n)) return undefined
  return raw.endsWith('ms') ? n : raw.endsWith('s') ? n * 1000 : n
}

/** Hareket azaltılmış mı (uygulama tercihi önce, sonra işletim sistemi). */
export function motionReduced(): boolean {
  const root = rootEl()
  if (!root) return true
  if (root.dataset.motion === 'reduced') return true
  if (root.dataset.motion === 'full') return false
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Rolün süresi (ms). Hareket azaltılmışsa 0. */
export function motionMs(role: MotionRole = 'overlay'): number {
  if (motionReduced()) return 0
  const live = parseMs(cssVar(`--ek-motion-${role}-duration`))
  return live ?? duration[motionRole[role].duration]
}

/** Rolün eğrisi (CSS easing dizesi). */
export function motionEasing(role: MotionRole = 'overlay'): string {
  return cssVar(`--ek-motion-${role}-easing`) || easing[motionRole[role].easing]
}

/** Hareket mesafesi (px) — `--ek-motion-distance-*`. */
export function motionDistancePx(size: 'sm' | 'md' = 'sm'): number {
  const live = parseFloat(cssVar(`--ek-motion-distance-${size}`))
  return Number.isFinite(live) ? live : motionDistance[size]
}
