/**
 * Animasyon sahneleri yürütücüsü (ADR-0014 Karar 3, S3 + S7). Animasyonun kendisi CSS'tedir (src/styles/scenes.css +
 * scenes-loops.css); bu betik yalnızca DURUM üretir — DOM'a içerik eklemez, süre/koordinat bilmez:
 *
 *  html[data-motion]   "play" | "paused" (kullanıcı durdurdu) | "reduced" (prefers-reduced-motion)
 *                      "play" DIŞINDA hiçbir sahne animasyonu çalışmaz → sahneler anlamlı statik son durumdadır.
 *  html[data-tab]      "hidden" iken (sekme arka planda) ortam döngüleri durur
 *  [data-scene][data-state]    "ready" (görünmeden önce başlangıç pozu) -> "play" (görünür olunca bir kez oynar)
 *  [data-scene][data-visible]  "true" | "false": döngüsel (ambient) animasyonlar YALNIZCA görünürken çalışır
 *
 * Kullanıcı tercihi ("durdurdu") yalnızca kullanıcı düğmeye bastığında localStorage'a yazılır (çerez YOK);
 * depolama kapalıysa tercih o sayfa ömrüyle sınırlı kalır. Scroll-jacking yok: kaydırma hiç ele geçirilmez.
 * IntersectionObserver yoksa hiçbir şey yapılmaz (statik hâl).
 *
 * S7 eklemeleri (yine yalnızca durum/metin üretir, içerik uydurmaz):
 *  - `[data-count]` (sahne içinde): sahne oynatılınca sayı 0'dan kayıttaki son değere sayar; hareket kapalıysa son değer statiktir
 *  - `[data-spy]` / `[data-spy-link]`: kaydırırken ekranın ortasındaki adım, sabit sütundaki göstergede `data-active` alır
 *    (IntersectionObserver bandı; scroll dinleyicisi YOK)
 */

const STORAGE_KEY = 'ek-site-motion'
/** Sahnenin bu oranı görününce giriş animasyonu bir kez oynar. */
const REVEAL_RATIO = 0.15

const root = document.documentElement
const scenes = Array.from(document.querySelectorAll<HTMLElement>('[data-scene]'))
const toggle = document.querySelector<HTMLButtonElement>('[data-motion-toggle]')
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const spySteps = Array.from(document.querySelectorAll<HTMLElement>('[data-spy]'))
const spyLinks = Array.from(document.querySelectorAll<HTMLElement>('[data-spy-link]'))

function readPaused(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'paused'
  } catch {
    return false
  }
}

function writePaused(paused: boolean): void {
  try {
    if (paused) window.localStorage.setItem(STORAGE_KEY, 'paused')
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* depolama kapalı/dolu: tercih yalnızca bu sayfa ömrü boyunca geçerli */
  }
}

/** CSS token'ından süre (ms): sayaç süresi stil dosyasıyla tek kaynaktan gelir. */
function tokenMs(name: string, fallback: number): number {
  const raw = getComputedStyle(root).getPropertyValue(name).trim()
  const value = parseFloat(raw)
  if (Number.isNaN(value)) return fallback
  return raw.endsWith('ms') ? value : value * 1000
}

if (scenes.length > 0 && 'IntersectionObserver' in window) {
  let paused = readPaused()
  /** Giriş eşiğini geçmiş sahneler (durdur → oynat sonrası sıfırlanır: görünenler yeniden oynar). */
  const revealed = new Set<HTMLElement>()
  /** Çalışan sayaçlar: durdurulunca iptal edilir ve son değer yazılır. */
  const counters = new Map<HTMLElement, number>()

  const motionOn = () => !paused && !reduceQuery.matches

  const finishCount = (el: HTMLElement) => {
    const frame = counters.get(el)
    if (frame !== undefined) cancelAnimationFrame(frame)
    counters.delete(el)
    // `data-count-final`: biçimlendirilmiş son metin (ör. "₺2.490") — sayaç DÜZ rakamla sayar, bitişte kayıttaki
    // biçimli etikete döner (PricingSummary.astro). Yoksa eski davranış: ham sayı.
    el.textContent = el.dataset.countFinal ?? el.dataset.count ?? el.textContent
  }

  const startCount = (el: HTMLElement) => {
    const target = Number(el.dataset.count)
    if (!Number.isFinite(target)) return
    const duration = tokenMs('--site-motion-duration-reveal-lg', 900)
    const begin = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - begin) / duration)
      const eased = 1 - (1 - t) ** 3
      if (t < 1) {
        el.textContent = String(Math.round(target * eased))
        counters.set(el, requestAnimationFrame(tick))
      } else {
        el.textContent = el.dataset.countFinal ?? String(target)
        counters.delete(el)
      }
    }
    el.textContent = '0'
    counters.set(el, requestAnimationFrame(tick))
  }

  const play = (scene: HTMLElement) => {
    scene.dataset.state = 'play'
    for (const el of scene.querySelectorAll<HTMLElement>('[data-count]')) startCount(el)
  }

  const render = () => {
    root.dataset.motion = reduceQuery.matches ? 'reduced' : paused ? 'paused' : 'play'
    toggle?.setAttribute('aria-pressed', String(paused))
    for (const scene of scenes) {
      if (motionOn()) scene.dataset.state = revealed.has(scene) ? 'play' : 'ready'
      else {
        delete scene.dataset.state
        for (const el of scene.querySelectorAll<HTMLElement>('[data-count]')) finishCount(el)
      }
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const scene = entry.target as HTMLElement
        scene.dataset.visible = String(entry.isIntersecting)
        if (entry.isIntersecting && entry.intersectionRatio >= REVEAL_RATIO && !revealed.has(scene)) {
          revealed.add(scene)
          if (motionOn()) play(scene)
        }
      }
    },
    { threshold: [0, REVEAL_RATIO], rootMargin: '0px 0px -8% 0px' },
  )

  /** IntersectionObserver, gözlem başlayınca güncel durumu yeniden bildirir. */
  const watch = () => {
    for (const scene of scenes) {
      observer.unobserve(scene)
      observer.observe(scene)
    }
  }

  const restart = () => {
    revealed.clear()
    render()
    watch()
  }

  toggle?.addEventListener('click', () => {
    paused = !paused
    writePaused(paused)
    if (paused) render()
    else restart()
  })

  reduceQuery.addEventListener('change', restart)

  document.addEventListener('visibilitychange', () => {
    root.dataset.tab = document.hidden ? 'hidden' : 'visible'
  })

  for (const scene of scenes) scene.dataset.visible = 'false'
  root.dataset.tab = document.hidden ? 'hidden' : 'visible'
  render()
  watch()

  // "Nasıl çalışır" gösterge takibi: ekranın ortasındaki dar bantta kesişen adım etkindir (hareket tercihinden bağımsız;
  // yalnızca renk/vurgu değişir).
  if (spySteps.length > 0 && spyLinks.length > 0) {
    const activate = (id: string) => {
      for (const link of spyLinks) link.dataset.active = String(link.dataset.spyLink === id)
    }
    activate(spySteps[0].dataset.spy ?? '')
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) activate((entry.target as HTMLElement).dataset.spy ?? '')
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    for (const step of spySteps) spy.observe(step)
  }
}
