/**
 * Yasal belge içindekiler iyileştirmesi (S17) — aşamalı geliştirme. JS'siz hâlde içindekiler sıradan bağlantı
 * listesidir ve "Yazdır" düğmesi gizlidir. Bu betik:
 *  - "Yazdır" düğmesini görünür yapar (tarayıcının yazdırma iletişim kutusu; `@media print` stili uygulanır),
 *  - okunan bölümün içindekiler bağlantısını `aria-current="true"` ile işaretler (IntersectionObserver; kaydırma
 *    dinleyicisi yok). Ağ isteği, çerez veya depolama yok.
 */
const printButton = document.querySelector<HTMLButtonElement>('[data-legal-print]')
if (printButton && typeof window.print === 'function') {
  printButton.hidden = false
  printButton.addEventListener('click', () => window.print())
}

const links = new Map(
  Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')).map((a) => [a.dataset.tocLink ?? '', a]),
)
const targets = Array.from(links.keys())
  .map((id) => document.getElementById(id))
  .filter((el): el is HTMLElement => el !== null)

if (targets.length > 0 && 'IntersectionObserver' in window) {
  const visible = new Set<string>()
  const mark = () => {
    const current = targets.find((t) => visible.has(t.id))?.id
    for (const [id, a] of links) {
      if (id === current) a.setAttribute('aria-current', 'true')
      else a.removeAttribute('aria-current')
    }
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target.id)
        else visible.delete(e.target.id)
      }
      mark()
    },
    { rootMargin: '-20% 0px -60% 0px' },
  )
  for (const t of targets) io.observe(t)
}
