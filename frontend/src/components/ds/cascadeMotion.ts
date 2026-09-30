/**
 * frontend/src/components/ds/cascadeMotion.ts
 *
 * Faz 3 A9 — `EkCascadePicker` seviye geçişlerinin SAF mantığı (Vue/DOM yok → vitest `node` ortamında test edilir).
 *   - Seviye planı: yol değişince hangi kolonlar kalır / kapanır (derinden sığa) / açılır, yön (ileri · geri · yenile).
 *   - Sıralı kapanış: kapanan her kolon bir öncekinden `adım` sonra kapanır; yeni kolon kapanışlar bitince açılır.
 *     Adım = `--ek-duration-fast / 3` ve en fazla 2 adım → toplam hareket ≤ fast + 2·adım + base = `--ek-duration-slow`
 *     (DS §4: slow üstü hareket yok). Süre/eğri token'ı TANIMLANMAZ; yalnız mevcut token'lar kullanılır.
 *   - Hareket tercihi: işletim sistemi `prefers-reduced-motion` VEYA uygulama `<html data-motion="reduced">`
 *     → hareket yok (anında). CSS tarafında token'lar zaten 0'a iner (app.css); JS yalnız kaydırma davranışı ve
 *     statik sınıf için bu kararı kullanır.
 *   - Klavye: tuş → eylem eşlemesi (↑/↓ Home/End kolon içinde, → / Enter klasörü açıp odağı yeni seviyenin ilk
 *     öğesine taşır, ← / Backspace üst seviye, Enter yaprağı seçer).
 *   - aria-live duyuru metinleri (Türkçe).
 */

export interface CascadeTreeNode {
  id: string
  label: string
  children?: CascadeTreeNode[]
  /** Alt kategorileri henüz yüklenmemiş klasör (çağıran `loadChildren` ile getirir). */
  lazy?: boolean
}

export type CascadeDirection = 'forward' | 'back' | 'replace' | 'none'

export interface CascadeLevelPlan {
  direction: CascadeDirection
  /** Değişmeden kalan kolon anahtarları (sığdan derine). */
  kept: string[]
  /** Kapanan kolonlar — KAPANIŞ SIRASINA göre (en derin önce). */
  closing: string[]
  /** Açılan kolonlar — açılış sırasına göre (sığdan derine). */
  opening: string[]
}

export const ROOT_COLUMN = 'root'
/** Sıralı kapanışta en fazla bu kadar adım bekletilir (toplam hareket ≤ slow). */
export const MAX_STAGGER_STEPS = 2

export function isBranch(node: CascadeTreeNode | undefined, loaded?: ReadonlyMap<string, unknown[]>): boolean {
  if (!node) return false
  return !!node.children?.length || !!node.lazy || !!loaded?.get(node.id)?.length
}

/** Yolun gösterdiği kolon anahtarları: kök + yol üzerindeki her KLASÖR düğümün id'si. */
export function columnKeys(nodes: CascadeTreeNode[], path: string[], loaded?: ReadonlyMap<string, CascadeTreeNode[]>): string[] {
  const keys = [ROOT_COLUMN]
  let level = nodes
  for (const id of path) {
    const n = level.find((x) => x.id === id)
    if (!n) break
    if (!isBranch(n, loaded)) break
    keys.push(n.id)
    level = n.children?.length ? n.children : loaded?.get(n.id) ?? []
  }
  return keys
}

/** Önceki ve sonraki kolon listesinden geçiş planı. */
export function planLevels(prev: string[], next: string[]): CascadeLevelPlan {
  let common = 0
  while (common < prev.length && common < next.length && prev[common] === next[common]) common++
  const kept = next.slice(0, common)
  const closing = prev.slice(common).reverse()
  const opening = next.slice(common)
  let direction: CascadeDirection = 'none'
  if (closing.length && opening.length) direction = 'replace'
  else if (opening.length) direction = 'forward'
  else if (closing.length) direction = 'back'
  return { direction, kept, closing, opening }
}

/** Kapanan kolonun gecikme adımı (0 = hemen). Derindeki önce kapanır. */
export function closingStep(plan: CascadeLevelPlan, key: string): number {
  const i = plan.closing.indexOf(key)
  return i < 0 ? 0 : Math.min(i, MAX_STAGGER_STEPS)
}

/** Açılan kolonların bekleyeceği adım: önce kapanışlar biter (en fazla `MAX_STAGGER_STEPS`). */
export function openingStep(plan: CascadeLevelPlan): number {
  return Math.min(plan.closing.length, MAX_STAGGER_STEPS)
}

/** Dar ekran (tek panel): görünen seviye indeksinin değişimi → kayma yönü. */
export function panelDirection(from: number, to: number): CascadeDirection {
  if (to > from) return 'forward'
  if (to < from) return 'back'
  return 'none'
}

export type MotionPreference = 'reduced' | 'full' | undefined

/** Uygulama tercihi (`<html data-motion>`) varsa o, yoksa işletim sistemi ayarı. */
export function motionEnabled(systemReduced: boolean, preference: MotionPreference): boolean {
  if (preference === 'reduced') return false
  return !systemReduced
}

export function readMotionPreference(root: { dataset?: Record<string, string | undefined> } | undefined): MotionPreference {
  const v = root?.dataset?.motion
  return v === 'reduced' || v === 'full' ? v : undefined
}

export type CascadeKeyAction =
  | { type: 'move'; index: number }
  | { type: 'open' }
  | { type: 'pick' }
  | { type: 'up' }

export interface CascadeKeyContext {
  /** Odaklı öğenin kolon (seviye) indeksi. */
  col: number
  /** Odaklı öğenin kolondaki sırası. */
  index: number
  /** Kolondaki öğe sayısı. */
  count: number
  /** Odaklı öğe klasör mü (alt seviyesi var/yüklenebilir). */
  branch: boolean
}

/** Tuş → eylem. `null` = bileşen olayı yutmaz (Tab vb.). */
export function cascadeKeyAction(key: string, ctx: CascadeKeyContext): CascadeKeyAction | null {
  const { col, index, count, branch } = ctx
  if (!count) return null
  switch (key) {
    case 'ArrowDown':
      return { type: 'move', index: (index + 1) % count }
    case 'ArrowUp':
      return { type: 'move', index: (index - 1 + count) % count }
    case 'Home':
      return { type: 'move', index: 0 }
    case 'End':
      return { type: 'move', index: count - 1 }
    case 'ArrowRight':
      return branch ? { type: 'open' } : null
    case 'Enter':
    case ' ':
      return branch ? { type: 'open' } : { type: 'pick' }
    case 'ArrowLeft':
    case 'Backspace':
      return col > 0 ? { type: 'up' } : null
    default:
      return null
  }
}

/** aria-live duyurusu: seviye açıldı / yükleniyor / seçildi. */
export function levelAnnouncement(input: {
  depth: number
  label: string
  count?: number
  loading?: boolean
  chosenPath?: string[]
}): string {
  if (input.chosenPath?.length) return `Seçildi: ${input.chosenPath.join(' › ')}`
  if (input.loading) return `${input.label} alt kategorileri yükleniyor…`
  const count = input.count ?? 0
  return `${input.depth}. seviye: ${input.label}, ${count} öğe`
}
