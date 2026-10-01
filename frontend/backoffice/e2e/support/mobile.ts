// MOB-06: telefon denetimi yardımcıları — dokunma hedefi ≥ 44 px ve yatay kaydırma yok.
import type { Browser, Page } from '@playwright/test'
import { signInFully } from './session'

export const MIN_TARGET = 44

/** Telefon bağlamı (dokunmatik) + tam giriş. */
export async function phone(browser: Browser, width: number, colorScheme: 'light' | 'dark' = 'light') {
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true, colorScheme })
  const page = await context.newPage()
  await signInFully(page)
  return { context, page }
}

/** SPA içi gezinme (sahte API durumu korunur). */
export async function spaGo(page: Page, path: string) {
  await page.evaluate((p) => {
    history.pushState({}, '', p)
    dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

/** Sayfa yatay taşma miktarı (px). */
export function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

/**
 * Görünür etkileşimli öğelerden dokunma alanı 44 × 44'ün altında kalanlar. Dokunma alanı = kutu ∪ mutlak konumlu
 * `::after` (mobile.css genişletmesi). İstisnalar (WCAG 2.5.5): paragraf/liste içindeki satır içi metin bağlantısı,
 * etiketin ya da Vuetify alanının içindeki yerel giriş (hedef etiket/alandır), odaklanmamış "İçeriğe geç".
 */
export function smallTargets(page: Page, min = MIN_TARGET) {
  return page.evaluate((min) => {
    const vw = document.documentElement.clientWidth
    const out: string[] = []
    const sel = 'a[href], button, [role=button], [role=tab], [role=radio], [role=switch], [role=checkbox], input:not([type=hidden]), select, textarea'
    for (const e of document.querySelectorAll<HTMLElement>(sel)) {
      const r = e.getBoundingClientRect()
      if (!r.width || !r.height || r.right <= 0 || r.left >= vw || r.bottom <= 0) continue
      if (e.closest('[inert], [aria-hidden="true"], .ek-sr-only')) continue
      if (getComputedStyle(e).visibility === 'hidden') continue
      if (e.matches('.bo-skip') && document.activeElement !== e) continue
      if (e.matches('input, textarea, select') && e.closest('label, .v-field, .v-selection-control')) continue
      if (e.tagName === 'A' && getComputedStyle(e).display === 'inline' && e.closest('p, li, dd')) continue
      const a = getComputedStyle(e, '::after')
      let h = r.height
      let w = r.width
      if (a.content !== 'none' && a.position === 'absolute') {
        h = Math.max(h, r.height - (parseFloat(a.top) || 0) - (parseFloat(a.bottom) || 0))
        w = Math.max(w, r.width - (parseFloat(a.left) || 0) - (parseFloat(a.right) || 0))
      }
      // Kartın tamamını kaplayan bağlantı (HealthKpi): ::after kartı örter.
      if (a.content !== 'none' && a.position === 'absolute' && a.inset === '0px') continue
      if (h < min - 0.5 || w < min - 0.5) {
        const name = (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
        out.push(`${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 2).join('.')} "${name}" ${Math.round(w)}×${Math.round(h)}`)
      }
    }
    return out
  }, min)
}
