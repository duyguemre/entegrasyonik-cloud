/**
 * SSS arama + kategori süzgeci (S17) — aşamalı geliştirme. JS'siz hâlde tüm sorular görünür, sekmeler sayfa içi
 * bağlantıdır ve arama kutusu gizlidir. Bu betik:
 *  - arama kutusunu görünür yapar; soru + cevap metninde Türkçe katlamalı (İ/ı, ş, ğ, ü, ö, ç) tüm-sözcük-parçası eşleşmesi,
 *  - sekmeleri tek seçimli süzgece çevirir (`aria-current="true"` etkin sekmede),
 *  - sonucu `aria-live` bölgesinde duyurur, eşleşme yoksa boş durumu gösterir,
 *  - `/sss#<soru-id>` bağlantısında süzgeci sıfırlayıp hedef soruyu açar (S14 davranışı korunur).
 * Yalnızca `hidden` / `open` / `aria-current` değişir; ağ isteği, çerez veya depolama yok.
 */
const FOLD: Record<string, string> = { ç: 'c', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ı: 'i', â: 'a', î: 'i', û: 'u' }
const fold = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/[çşğüöıâîû]/g, (c) => FOLD[c] ?? c)

const input = document.querySelector<HTMLInputElement>('[data-faq-input]')
const searchBox = document.querySelector<HTMLElement>('[data-faq-search]')
const status = document.querySelector<HTMLElement>('[data-faq-status]')
const empty = document.querySelector<HTMLElement>('[data-faq-empty]')
const reset = document.querySelector<HTMLButtonElement>('[data-faq-reset]')
const tabs = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-faq-tab]'))
const groups = Array.from(document.querySelectorAll<HTMLElement>('[data-faq-group]'))

interface Entry {
  el: HTMLDetailsElement
  group: string
  text: string
}

const entries: Entry[] = groups.flatMap((g) =>
  Array.from(g.querySelectorAll<HTMLDetailsElement>('details.acc__item')).map((el) => ({
    el,
    group: g.dataset.faqGroup ?? '',
    text: fold(el.textContent ?? ''),
  })),
)

let category = 'all'
let query = ''

function apply(announce: boolean) {
  const tokens = fold(query).split(/\s+/).filter(Boolean)
  let shown = 0
  for (const e of entries) {
    const inCategory = category === 'all' || e.group === category
    const match = inCategory && tokens.every((t) => e.text.includes(t))
    e.el.hidden = !match
    if (match) shown += 1
  }
  for (const g of groups) g.hidden = !g.querySelector('details.acc__item:not([hidden])')
  for (const t of tabs) {
    if (t.dataset.faqTab === category) t.setAttribute('aria-current', 'true')
    else t.removeAttribute('aria-current')
  }
  if (empty) empty.hidden = shown > 0
  if (status && announce) {
    const label = tabs.find((t) => t.dataset.faqTab === category)?.querySelector('.faq-tab__label')?.textContent?.trim() ?? ''
    status.textContent =
      tokens.length > 0
        ? shown > 0
          ? `“${query.trim()}” için ${shown} soru bulundu${category === 'all' ? '' : ` (${label})`}.`
          : `“${query.trim()}” için sonuç bulunamadı.`
        : category === 'all'
          ? ''
          : `${label}: ${shown} soru gösteriliyor.`
  }
}

if (input && searchBox && entries.length > 0) {
  searchBox.hidden = false

  let timer: number | undefined
  input.addEventListener('input', () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      query = input.value
      apply(true)
    }, 120)
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && input.value) {
      input.value = ''
      query = ''
      apply(true)
    }
  })

  for (const t of tabs) {
    t.addEventListener('click', (event) => {
      event.preventDefault()
      category = t.dataset.faqTab ?? 'all'
      apply(true)
      document.getElementById('sss-title')?.closest('section')?.scrollIntoView({ block: 'start' })
    })
  }

  reset?.addEventListener('click', () => {
    input.value = ''
    query = ''
    category = 'all'
    apply(true)
    input.focus()
  })
}

/** S14: `/sss#<soru-id>` hedef soruyu açar; süzgeç açıksa önce sıfırlanır. */
function openTarget() {
  const id = decodeURIComponent(window.location.hash.slice(1))
  if (!id) return
  const target = document.getElementById(id)
  if (target instanceof HTMLDetailsElement) {
    if (target.hidden) {
      if (input) input.value = ''
      query = ''
      category = 'all'
      apply(true)
    }
    target.open = true
    target.scrollIntoView({ block: 'start' })
  }
}
openTarget()
window.addEventListener('hashchange', openTarget)
