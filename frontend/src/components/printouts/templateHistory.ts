/**
 * frontend/src/components/printouts/templateHistory.ts
 *
 * FR3 madde 15 — geri al / yinele (araştırma 9.1). Anlık görüntü yığını (JSON), saf TS. Sürükleme gibi
 * sürekli değişiklikler bırakıldığında TEK adım olarak işlenir (çağıran `commit`'i pointerup'ta yapar).
 */
export const HISTORY_LIMIT = 100

export class TemplateHistory<T> {
  private past: string[] = []
  private future: string[] = []
  private current: string

  constructor(initial: T, private readonly limit = HISTORY_LIMIT) {
    this.current = JSON.stringify(initial)
  }

  /** Yeni durumu kaydeder; öncekiyle aynıysa yok sayar (boş adım oluşmaz). Yinele yığını temizlenir. */
  commit(state: T): boolean {
    const next = JSON.stringify(state)
    if (next === this.current) return false
    this.past.push(this.current)
    if (this.past.length > this.limit) this.past.shift()
    this.current = next
    this.future = []
    return true
  }

  undo(): T | undefined {
    const prev = this.past.pop()
    if (prev === undefined) return undefined
    this.future.push(this.current)
    this.current = prev
    return JSON.parse(prev) as T
  }

  redo(): T | undefined {
    const next = this.future.pop()
    if (next === undefined) return undefined
    this.past.push(this.current)
    this.current = next
    return JSON.parse(next) as T
  }

  get canUndo() { return this.past.length > 0 }
  get canRedo() { return this.future.length > 0 }
  get undoCount() { return this.past.length }

  /** Kaydedilmiş sürümden bu yana değişiklik var mı (kaydedilmemiş uyarısı). */
  isDirtyAgainst(saved: T | undefined): boolean {
    return saved === undefined ? this.past.length > 0 : JSON.stringify(saved) !== this.current
  }
}
