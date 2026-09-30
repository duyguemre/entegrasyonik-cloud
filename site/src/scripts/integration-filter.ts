/**
 * Entegrasyon kataloğu kategori süzgeci (S16). İlerleyici geliştirme: JS'siz hâlde tüm kartlar görünür, düğmeler
 * yalnızca görsel bir özet olur. `aria-pressed` durum düğmeleri (tek seçim) + `aria-live` sonuç duyurusu.
 * Yalnızca `hidden` özniteliğini değiştirir; ağ isteği/çerez/depolama yok.
 */
for (const bar of document.querySelectorAll<HTMLElement>('[data-int-filter]')) {
  const section = bar.closest('section')
  const grid = section?.querySelector<HTMLElement>('#int-grid')
  const status = section?.querySelector<HTMLElement>('[data-int-filter-status]')
  const buttons = Array.from(bar.querySelectorAll<HTMLButtonElement>('[data-filter]'))
  if (!grid) continue
  const items = Array.from(grid.querySelectorAll<HTMLElement>(':scope > li'))

  const apply = (filter: string, announce: boolean) => {
    let shown = 0
    for (const li of items) {
      const match = filter === 'all' || li.dataset.kind === filter
      li.hidden = !match
      if (match) shown += 1
    }
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.filter === filter))
    grid.dataset.filter = filter
    if (announce && status) {
      const label = buttons.find((b) => b.dataset.filter === filter)?.firstChild?.textContent?.trim() ?? ''
      status.textContent = `${label}: ${shown} entegrasyon gösteriliyor.`
    }
  }

  for (const b of buttons) b.addEventListener('click', () => apply(b.dataset.filter ?? 'all', true))
}
