/**
 * Faz 3 B2 — JS tarafı animasyon süresi (SortableJS `animation` ms ister). FR3 madde 7 (fe-r3a): değer artık hareketin
 * TEK kaynağından (`@entegrasyonik/ui/motion`) gelir; eski ölçek adları role eşlenir (fast → feedback, base → reveal,
 * slow → layout). Sistem reduced-motion'da ve `<html data-motion="reduced">`'da 0. Ham ms YOK.
 */
import { motionMs as roleMs, type MotionRole } from '@entegrasyonik/ui/motion'

const ROLE: Record<'fast' | 'base' | 'slow', MotionRole> = { fast: 'feedback', base: 'reveal', slow: 'layout' }

export function motionMs(token: 'fast' | 'base' | 'slow' = 'base'): number {
  return roleMs(ROLE[token])
}
