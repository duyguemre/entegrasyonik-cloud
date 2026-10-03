// DS-v2 — içerik değişince kabın YÜKSEKLİĞİNİ yumuşak geçişle değiştirir (diyalog kartı "tak" diye uzayıp kısalmasın).
//
// Yöntem (FLIP): gövdenin çocukları gözlenir (ResizeObserver + eklenen/çıkan çocuk için MutationObserver). Değişiklikte
// kabın yeni DOĞAL yüksekliği `height:auto` ile ölçülür, kab önceki yüksekliğe sabitlenir ve bir sonraki karede yeni
// yüksekliğe geçiş başlar; geçiş bitince yükseklik yeniden `auto` olur (kab içerikle serbestçe büyür/kısalır,
// `max-height` sınırı CSS'te kalır). ResizeObserver geri çağrısı çizimden ÖNCE çalıştığı için ara karede sıçrama görünmez.
// Gövdeye sarmalayıcı EKLEMEZ: diyalogların gövdeyi doğrudan biçimleyen (flex/gap) kuralları bozulmaz.
// İlk ölçümde (açılış) ve "azaltılmış hareket" tercihinde geçiş yapılmaz.
import { onBeforeUnmount, onMounted, type Ref } from 'vue'

const reducedMotion = () =>
  (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) ||
  (typeof document !== 'undefined' && /^(reduced|paused)$/.test(document.documentElement.dataset.motion ?? ''))

export function useAutoHeight(box: Ref<HTMLElement | null | undefined>, content: Ref<HTMLElement | null | undefined>, opts: { enabled?: () => boolean } = {}) {
  let last = 0
  let animating = false
  let ro: ResizeObserver | null = null
  let mo: MutationObserver | null = null

  function settle(el: HTMLElement) {
    animating = false
    el.style.height = ''
    el.style.transition = ''
  }

  function onEnd(e: TransitionEvent) {
    const el = box.value
    if (el && e.target === el && e.propertyName === 'height') settle(el)
  }

  function measure() {
    const el = box.value
    if (!el || (opts.enabled && !opts.enabled())) return
    // Geçiş sürerken başlangıç = o anki (ara) yükseklik; değilse son ölçülen doğal yükseklik.
    const from = animating ? el.getBoundingClientRect().height : last
    el.style.transition = 'none'
    el.style.height = ''
    const to = el.getBoundingClientRect().height
    last = to
    if (!from || Math.abs(to - from) < 2 || reducedMotion()) {
      if (animating) settle(el)
      return
    }
    el.style.height = `${from}px`
    void el.offsetHeight // başlangıç yüksekliğini uygula
    el.style.transition = 'height var(--ek-motion-layout)'
    el.style.height = `${to}px`
    animating = true
  }

  function observeChildren(target: HTMLElement) {
    if (!ro) return
    for (const child of Array.from(target.children)) ro.observe(child)
  }

  onMounted(() => {
    const target = content.value
    if (!target || typeof ResizeObserver === 'undefined') return
    last = box.value?.getBoundingClientRect().height ?? 0
    // Yalnız ÇOCUKLAR gözlenir (gövdenin kendisi değil): gövde kabın yüksekliğine bağlıdır; onu gözlemek kendi
    // ayarımızla tekrar tetiklenip "ResizeObserver loop" uyarısı üretirdi.
    ro = new ResizeObserver(() => measure())
    observeChildren(target)
    if (typeof MutationObserver !== 'undefined') {
      mo = new MutationObserver(() => { observeChildren(target); measure() })
      mo.observe(target, { childList: true })
    }
    box.value?.addEventListener('transitionend', onEnd)
  })

  onBeforeUnmount(() => {
    ro?.disconnect()
    mo?.disconnect()
    box.value?.removeEventListener('transitionend', onEnd)
  })
}
