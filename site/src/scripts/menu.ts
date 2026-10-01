/**
 * Gezinme iyileştirmesi (progressive enhancement).
 *
 * Mobil çekmece <details> ile JS'siz de açılıp kapanır; bu betik yalnızca klavye/işaretçi kolaylığı ekler:
 *  - Esc: çekmeceyi kapatır ve odağı açma düğmesine döndürür (WAI-ARIA disclosure deseni)
 *  - Çekmece dışına tıklama veya çekmecedeki bir bağlantıya tıklama (aynı sayfa çapası dahil): kapatır
 *  - Masaüstü genişliğine geçişte (çekmece gizlenirse): kapatır — açık durum takılı kalmaz
 *
 * S23 — masaüstü gruplanmış menü (WAI-ARIA "disclosure navigation menu" deseni; odak tuzağı YOK):
 *  - Grup düğmesi `aria-expanded` aç/kapa (Enter/Space yerel düğme davranışı); aynı anda tek panel açık
 *  - Düğmede ↓ / ↑: paneli açar, ilk / son bağlantıya odaklanır; panelde ↓ / ↑ bağlantılar arasında dolaşır
 *  - ← / →: üst düzey öğeler (grup düğmeleri + doğrudan bağlantılar) arasında; Home / End: ilk / son öğe
 *  - Esc: açık paneli kapatır, odağı düğmesine döndürür; Tab ile gruptan çıkınca ve dışarı tıklayınca kapanır
 * `data-js` işareti, JS'siz yedek (üzerine gelince / odak içindeyken görünme) CSS kuralını devre dışı bırakır.
 *
 * S25 — hover niyeti (yalnızca fare; dokunmatik/kalem tıklamayla çalışır): imleç düğmede HOVER_OPEN_MS durursa açılır,
 * grup dışına çıkınca HOVER_CLOSE_MS sonra kapanır (geri dönülürse iptal) — çapraz geçişte panel yanıp sönmez
 * (WCAG 1.4.13: üzerine gelinebilir, kalıcı, Esc ile kapatılabilir). Bir panel açıkken diğerine geçiş anında ve
 * animasyonsuzdur (`data-switching`). Tıklama/klavye her zaman beklemesizdir.
 */
const HOVER_OPEN_MS = 120
const HOVER_CLOSE_MS = 240
const CLICK_AFTER_HOVER_MS = 500
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
    if (!menu.open || !(event.target instanceof Element)) return
    if (!menu.contains(event.target)) menu.open = false
    else if (event.target.closest('a[href]')) menu.open = false
  })

  window.addEventListener('resize', () => {
    if (menu.open && getComputedStyle(menu).display === 'none') menu.open = false
  })

  // site-wdg W07: çekmece açıkken arkadaki sayfa etkisiz — Tab sabit panelin altında kalan (görünmeyen) içeriğe kaçmaz.
  const behind = [...document.querySelectorAll<HTMLElement>('main, .site-footer, .skip-link')]
  menu.addEventListener('toggle', () => {
    for (const el of behind) el.inert = menu.open
  })
}

const nav = document.querySelector<HTMLElement>('[data-nav]')

if (nav) {
  nav.dataset.js = 'true'
  const triggers = [...nav.querySelectorAll<HTMLButtonElement>('[data-nav-trigger]')]
  const tops = [...nav.querySelectorAll<HTMLElement>('[data-nav-top]')]
  const panelOf = (t: HTMLElement) => document.getElementById(t.getAttribute('aria-controls') ?? '')
  const linksOf = (t: HTMLElement) => [...(panelOf(t)?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? [])]
  const isOpen = (t: HTMLElement) => t.getAttribute('aria-expanded') === 'true'
  const close = (t: HTMLElement) => t.setAttribute('aria-expanded', 'false')
  const open = (t: HTMLElement) => {
    const switching = triggers.some((o) => o !== t && isOpen(o))
    if (switching) {
      nav.dataset.switching = ''
      requestAnimationFrame(() => requestAnimationFrame(() => delete nav.dataset.switching))
    }
    for (const other of triggers) if (other !== t) close(other)
    t.setAttribute('aria-expanded', 'true')
  }
  let hoverTimer: number | undefined
  // Hover ile az önce açılan paneli, hemen ardından gelen tıklama KAPATMAZ (fareyle düğmeye gelip tıklayan kullanıcı).
  let hoverOpened: { t: HTMLElement; at: number } | undefined
  const hoverOpen = (t: HTMLElement) => {
    open(t)
    hoverOpened = { t, at: performance.now() }
  }
  const later = (ms: number, fn: () => void) => {
    window.clearTimeout(hoverTimer)
    hoverTimer = window.setTimeout(fn, ms)
  }
  const openTrigger = () => triggers.find(isOpen)
  const focusTop = (i: number) => tops[(i + tops.length) % tops.length]?.focus()

  for (const t of triggers) {
    const group = t.closest<HTMLElement>('[data-nav-group]')!

    t.addEventListener('click', () => {
      window.clearTimeout(hoverTimer)
      const justHovered = hoverOpened?.t === t && performance.now() - hoverOpened.at < CLICK_AFTER_HOVER_MS
      hoverOpened = undefined
      if (isOpen(t) && !justHovered) close(t)
      else open(t)
    })

    // Hover niyeti (yalnızca fare). Açık bir panel varken komşu gruba geçiş beklemesizdir.
    t.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return
      if (openTrigger()) {
        window.clearTimeout(hoverTimer)
        if (!isOpen(t)) hoverOpen(t)
      } else later(HOVER_OPEN_MS, () => hoverOpen(t))
    })
    group.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse' && isOpen(t)) window.clearTimeout(hoverTimer)
    })
    group.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'mouse') return
      later(isOpen(t) ? HOVER_CLOSE_MS : 0, () => {
        if (!group.contains(document.activeElement) || document.activeElement === t) close(t)
      })
    })

    group.addEventListener('keydown', (event) => {
      const onTrigger = event.target === t
      const links = linksOf(t)
      const at = links.indexOf(event.target as HTMLAnchorElement)
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp': {
          event.preventDefault()
          if (!links.length) return
          if (onTrigger) {
            open(t)
            links[event.key === 'ArrowDown' ? 0 : links.length - 1].focus()
          } else if (at >= 0) {
            const next = event.key === 'ArrowDown' ? at + 1 : at - 1
            links[(next + links.length) % links.length].focus()
          }
          break
        }
        case 'Home':
        case 'End':
          if (at >= 0) {
            event.preventDefault()
            links[event.key === 'Home' ? 0 : links.length - 1].focus()
          }
          break
      }
    })

    // Tab ile grubun dışına çıkınca kapanır (odak tuzağı yok).
    group.addEventListener('focusout', (event) => {
      const next = event.relatedTarget
      if (isOpen(t) && next instanceof Node && !group.contains(next)) close(t)
    })
  }

  // Üst düzey ←/→/Home/End (düğmeler + doğrudan bağlantılar).
  for (const [i, el] of tops.entries()) {
    el.addEventListener('keydown', (event) => {
      const map: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tops.length - 1 }
      if (!(event.key in map)) return
      event.preventDefault()
      const wasOpen = openTrigger()
      if (wasOpen) close(wasOpen)
      focusTop(map[event.key])
    })
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const t = openTrigger()
    if (!t) return
    close(t)
    t.focus()
  })

  document.addEventListener('click', (event) => {
    const t = openTrigger()
    if (!t || !(event.target instanceof Element)) return
    const group = t.closest('[data-nav-group]')
    if (!group?.contains(event.target) || event.target.closest('a[href]')) close(t)
  })

  window.addEventListener('resize', () => {
    const t = openTrigger()
    if (t && getComputedStyle(nav).display === 'none') close(t)
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
