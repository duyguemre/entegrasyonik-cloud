/**
 * Kart etkileşimi: imleç takipli ışık + hafif 3D eğim (S8, 2026-09-29; çıkış geçişi düzeltmesi S10; S12: 2°, 700 ms ease-out). Animasyon
 * sahneleriyle (scenes.ts) ilgisizdir — DOM'a içerik eklemez, yalnızca `[data-tilt]` öğelerinde CSS özel
 * özelliklerini günceller (`src/styles/global.css` bunları okur). Yalnızca `pointer: fine` cihazlarda çalışır;
 * `prefers-reduced-motion: reduce` veya hareket durdurulmuşsa (`html[data-motion]==='paused'`) eğim uygulanmaz
 * (ışık/kenarlık CSS `:hover`/`:focus-within` ile yine de çalışır — bu statik, tek renk bir vurgudur, "hareket"
 * sayılmaz). Scroll'a dokunmaz, çerez yazmaz, üçüncü taraf kütüphane kullanmaz.
 *
 * S10 düzeltmesi: `--tilt-transition-duration` özel özelliği izleme sırasında KISA (`--ek-duration-fast`),
 * imleç karttan ayrılınca UZUN (`--site-tilt-leave-duration`) tutulur — bir karttan diğerine hızla geçilince
 * ilkinin eğimi aniden değil yumuşakça nötr konuma döner, ikincisi ise gecikmesiz tepki verir. (Not: bu özel
 * özellik yalnızca `--tilt-transition-duration`'ı DEĞİŞTİRİR; `.plan`/`.ig__card` gibi konak bileşenlerin kendi
 * `transition` kısayolları bunu KULLANIR — CSS kısayolları birleşmediği için `transform` o listelere de eklenmiş
 * olmalı, aksi hâlde bu düzeltme o bileşenlerde etkisiz kalır.)
 */

/** S12: 4° -> 2° (site-tokens.css `--site-tilt-max` ile aynı değer; kullanıcı: "hareket daha yumuşak ve zarif"). */
const MAX_TILT_DEG = 2
const root = document.documentElement
const fineQuery = window.matchMedia('(pointer: fine)')
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const els = Array.from(document.querySelectorAll<HTMLElement>('[data-tilt]'))

function tiltAllowed(): boolean {
  return fineQuery.matches && !reduceQuery.matches && root.dataset.motion !== 'paused'
}

/**
 * İzleme sırasında kısa/tepkisel geçiş; ayrılınca uzun (`--site-tilt-leave-duration`, 700 ms) ve ease-out
 * (`--site-tilt-leave-ease`) — kart "bir anda" değil, yavaşça yerine oturur.
 */
function setTiltTransition(el: HTMLElement, mode: 'move' | 'leave'): void {
  el.style.setProperty('--tilt-transition-duration', mode === 'leave' ? 'var(--site-tilt-leave-duration)' : 'var(--ek-duration-fast)')
  el.style.setProperty('--tilt-transition-ease', mode === 'leave' ? 'var(--site-tilt-leave-ease)' : 'var(--ek-easing-standard)')
}

function resetTilt(el: HTMLElement): void {
  el.style.setProperty('--mx', '50%')
  el.style.setProperty('--my', '50%')
  el.style.setProperty('--rx', '0deg')
  el.style.setProperty('--ry', '0deg')
}

if (els.length > 0 && fineQuery.matches) {
  for (const el of els) {
    // S12: pointermove olayları kare başına bire indirgenir (rAF) — gereksiz stil yazımı ve titreme yok.
    let frame = 0
    let last: PointerEvent | null = null
    const apply = () => {
      frame = 0
      if (!last) return
      const rect = el.getBoundingClientRect()
      const px = Math.min(1, Math.max(0, (last.clientX - rect.left) / rect.width))
      const py = Math.min(1, Math.max(0, (last.clientY - rect.top) / rect.height))
      el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
      el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
      el.style.setProperty('--ry', `${((px - 0.5) * 2 * MAX_TILT_DEG).toFixed(2)}deg`)
      el.style.setProperty('--rx', `${((0.5 - py) * 2 * MAX_TILT_DEG).toFixed(2)}deg`)
    }
    el.addEventListener('pointermove', (event: PointerEvent) => {
      if (!tiltAllowed()) {
        setTiltTransition(el, 'leave')
        resetTilt(el)
        return
      }
      setTiltTransition(el, 'move')
      last = event
      if (!frame) frame = requestAnimationFrame(apply)
    })
    el.addEventListener('pointerleave', () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      last = null
      setTiltTransition(el, 'leave')
      resetTilt(el)
    })
  }
}

/**
 * Kaydırma ilerlemesi (S12, "Sorun -> çözüm" sahnesi): `[data-scroll-progress]` öğesine, öğe görünüm alanına girerken
 * 0'dan 1'e giden `--scroll-p` yazılır (üst kenarı görünüm alanının %92'sindeyken 0, %30'undayken 1). Bileşen CSS'i
 * bu değerle YALNIZCA transform/opacity hesaplar (kaotik paneller toplanır, marka kartı öne çıkar). Scroll-jacking
 * DEĞİL: dinleyici `passive`, kaydırma hiç ele geçirilmez; hesap kare başına bir kez (rAF).
 * Hareket kapalıyken (reduced-motion / durdurma düğmesi) veya JS yokken özellik yazılmaz → CSS varsayılanı
 * `--scroll-p: 1` (anlamlı statik SON durum) geçerlidir.
 */
const progressEls = Array.from(document.querySelectorAll<HTMLElement>('[data-scroll-progress]'))

if (progressEls.length > 0) {
  const progressAllowed = (): boolean => !reduceQuery.matches && root.dataset.motion !== 'paused'
  const START = 0.92
  const END = 0.3
  let ticking = false

  const update = () => {
    ticking = false
    const vh = window.innerHeight
    for (const el of progressEls) {
      if (!progressAllowed()) {
        el.style.removeProperty('--scroll-p')
        continue
      }
      const top = el.getBoundingClientRect().top
      const p = Math.min(1, Math.max(0, (START * vh - top) / ((START - END) * vh)))
      el.style.setProperty('--scroll-p', p.toFixed(3))
    }
  }
  const schedule = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(update)
  }

  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule, { passive: true })
  reduceQuery.addEventListener('change', schedule)
  // Durdurma düğmesi `html[data-motion]`'u değiştirir (scenes.ts): değişince ilerleme hemen güncellenir.
  new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ['data-motion'] })
  schedule()
}

/**
 * Hero derinlik katmanları (S9): panelin arkasındaki iki ofset pencere (`.mock::after`, `.hero__visual::after`
 * — bkz. Hero.astro), imleç konumuna (yalnızca `pointer: fine`) ve kaydırma konumuna (her cihazda, çok küçük
 * genlikte) göre hafifçe kayar — "vay" anı, scroll-jacking DEĞİL: sayfa kaydırması hiç ele geçirilmez (`passive`
 * dinleyici, `preventDefault` yok), genlik birkaç piksel ile sınırlıdır. `--depth-a-*`/`--depth-b-*` özel
 * özellikleri `[data-parallax-root]` üzerine yazılır ve alt öğelere (pseudo-elementler dahil) miras kalır;
 * JS'siz veya hareket kapalıyken (`prefers-reduced-motion` / durdurma düğmesi) katmanlar sabit ofsette kalır.
 */
const parallaxRoot = document.querySelector<HTMLElement>('[data-parallax-root]')

if (parallaxRoot) {
  const POINTER_RANGE: Record<'a' | 'b', number> = { a: 10, b: 5 }
  const SCROLL_RANGE = 8

  const parallaxAllowed = (): boolean => !reduceQuery.matches && root.dataset.motion !== 'paused'

  const resetParallax = () => {
    for (const key of ['a', 'b'] as const) {
      parallaxRoot.style.removeProperty(`--depth-${key}-x`)
      parallaxRoot.style.removeProperty(`--depth-${key}-y`)
    }
  }

  let scrollShift = 0
  const applyScroll = () => {
    if (!parallaxAllowed()) return
    const rect = parallaxRoot.getBoundingClientRect()
    const center = rect.top + rect.height / 2 - window.innerHeight / 2
    const ratio = Math.min(1, Math.max(-1, center / window.innerHeight))
    scrollShift = ratio * SCROLL_RANGE
    for (const key of ['a', 'b'] as const) parallaxRoot.style.setProperty(`--depth-${key}-y`, `${scrollShift.toFixed(1)}px`)
  }

  let scrollTicking = false
  window.addEventListener(
    'scroll',
    () => {
      if (!parallaxAllowed()) {
        resetParallax()
        return
      }
      if (scrollTicking) return
      scrollTicking = true
      requestAnimationFrame(() => {
        applyScroll()
        scrollTicking = false
      })
    },
    { passive: true },
  )
  applyScroll()

  if (fineQuery.matches) {
    parallaxRoot.addEventListener('pointermove', (event: PointerEvent) => {
      if (!parallaxAllowed()) {
        resetParallax()
        return
      }
      const rect = parallaxRoot.getBoundingClientRect()
      const px = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) - 0.5
      const py = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) - 0.5
      for (const key of ['a', 'b'] as const) {
        const range = POINTER_RANGE[key]
        parallaxRoot.style.setProperty(`--depth-${key}-x`, `${(px * range).toFixed(1)}px`)
        parallaxRoot.style.setProperty(`--depth-${key}-y`, `${(py * range + scrollShift).toFixed(1)}px`)
      }
    })
    parallaxRoot.addEventListener('pointerleave', () => applyScroll())
  }

  reduceQuery.addEventListener('change', () => {
    if (!parallaxAllowed()) resetParallax()
  })
}
