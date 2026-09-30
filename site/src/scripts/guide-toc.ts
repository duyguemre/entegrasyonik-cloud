/**
 * Rehber içindekiler (S20) — aşamalı geliştirme. Okunan bölüm vurgusu ortak `legal-toc` betiğinden gelir
 * (`data-toc-link`, IntersectionObserver). Bu betik yalnızca içindekiler `<details>` öğesini geniş ekranda (≥1024)
 * açık tutar; dar ekranda kapalı başlar (uzun liste içeriği aşağı itmesin). JS'siz hâlde öğe kapalıdır ve
 * "İçindekiler" başlığına dokunarak açılır. Ağ isteği, çerez veya depolama yok.
 */
import './legal-toc'

const details = document.querySelector<HTMLDetailsElement>('[data-guide-toc]')
if (details && 'matchMedia' in window) {
  const wide = window.matchMedia('(min-width: 1024px)')
  const sync = () => {
    details.open = wide.matches
  }
  sync()
  wide.addEventListener('change', sync)
}
