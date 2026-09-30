/**
 * frontend/src/composables/productFormFocus.ts
 *
 * Sihirbaz adım değişiminden sonra bir alana odaklanma yardımcısı (DOM). Alanlar `data-pf-field="<anahtar>"`
 * niteliğiyle işaretlenir (v-text-field bu niteliği doğrudan `<input>`a taşır; sarmalayıcılarda içteki ilk
 * odaklanabilir öğeye inilir). Kapsam görünümün kök öğesidir — aynı anda açık başka sekmelerdeki formlar
 * (KeepAlive) yanlışlıkla hedeflenmez. Adım içeriği asenkron bağlanabildiği için birkaç kare beklenir.
 */
const FOCUSABLE = 'input:not([type="hidden"]), textarea, select, button:not([disabled]), [tabindex]:not([tabindex="-1"])'

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

export function findProductField(root: ParentNode | null, field: string): HTMLElement | null {
  if (!root) return null
  const el = root.querySelector<HTMLElement>(`[data-pf-field="${field}"]`)
  if (!el) return null
  if (el.matches(FOCUSABLE)) return el
  return el.querySelector<HTMLElement>(FOCUSABLE)
}

/** Alanı bulunca odaklar ve görünür alana kaydırır; `field` verilmezse sihirbaz şeridini (gerekirse) görünür kılar. */
export async function focusProductField(root: HTMLElement | null, field?: string): Promise<boolean> {
  if (!root) return false
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await nextFrame()
    if (!field) {
      root.querySelector<HTMLElement>('.pfw')?.scrollIntoView?.({ block: 'nearest' })
      return true
    }
    const target = findProductField(root, field)
    if (target) {
      target.focus({ preventScroll: true })
      target.scrollIntoView?.({ block: 'center' })
      return true
    }
  }
  return false
}
