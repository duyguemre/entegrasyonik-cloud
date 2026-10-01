/**
 * "Adresi kopyala" (S16) — e-posta istemcisi olmayan ziyaretçiler için. `[data-copy]` düğmesi, `data-copy`
 * değerini Clipboard API ile panoya yazar; sonuç düğmedeki `[data-copy-status]` (aria-live="polite") ile
 * duyurulur. Clipboard API yoksa/izin verilmezse adres metni seçilir ve "kopyalamak için Ctrl+C" denir.
 * Ağ isteği yapmaz, veri saklamaz (ADR-0014 Karar 2: site kişisel veri toplamaz).
 */
const RESET_MS = 2400

function selectText(el: Element | null): void {
  if (!el) return
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  btn.hidden = false
  const status = btn.parentElement?.querySelector<HTMLElement>('[data-copy-status]')
  const label = btn.querySelector<HTMLElement>('[data-copy-label]')
  const idle = label?.textContent ?? ''
  let timer: number | undefined

  btn.addEventListener('click', async () => {
    const value = btn.dataset.copy ?? ''
    let ok = false
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard yok')
      await navigator.clipboard.writeText(value)
      ok = true
    } catch {
      selectText(document.querySelector(btn.dataset.copyTarget ?? ''))
    }
    btn.dataset.state = ok ? 'copied' : 'manual'
    if (label) label.textContent = ok ? 'Kopyalandı' : idle
    if (status) status.textContent = ok ? `${value} panoya kopyalandı.` : 'Adres seçildi; kopyalamak için Ctrl+C (Mac: Cmd+C) kullanın.'
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      delete btn.dataset.state
      if (label) label.textContent = idle
    }, RESET_MS)
  })
}
