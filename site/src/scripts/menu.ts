/**
 * Mobil menü iyileştirmesi (progressive enhancement). Menü <details> ile JS'siz de açılıp kapanır;
 * bu betik yalnızca klavye/işaretçi kolaylığı ekler:
 *  - Esc: menüyü kapatır ve odağı açma düğmesine döndürür (WAI-ARIA disclosure deseni)
 *  - Menü dışına tıklama: kapatır
 *  - Masaüstü genişliğine geçişte (menü gizlenirse): kapatır — açık durum takılı kalmaz
 */
const menu = document.querySelector<HTMLDetailsElement>('[data-mobile-menu]')

if (menu) {
  const toggle = menu.querySelector<HTMLElement>('summary')

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false
      toggle?.focus()
    }
  })

  document.addEventListener('click', (event) => {
    if (menu.open && event.target instanceof Node && !menu.contains(event.target)) {
      menu.open = false
    }
  })

  window.addEventListener('resize', () => {
    if (menu.open && getComputedStyle(menu).display === 'none') menu.open = false
  })
}

/**
 * Sticky header durumu: sayfanın en üstünü işaretleyen sentinel görünürlükten çıkınca `html[data-scrolled="true"]`
 * (header opaklaşır, gölge gelir). IntersectionObserver — scroll dinleyicisi yok; yoksa header sade kalır.
 */
const sentinel = document.querySelector<HTMLElement>('[data-scroll-sentinel]')
if (sentinel && 'IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => {
    document.documentElement.dataset.scrolled = String(!entry.isIntersecting)
  }).observe(sentinel)
}
