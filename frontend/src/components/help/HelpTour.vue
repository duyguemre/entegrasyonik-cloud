<!--
  frontend/src/components/help/HelpTour.vue — isteğe bağlı kısa uygulama turu (kabukta tek örnek, `SecureLayout`).

  1) Teklif: ilk girişte (tercih yoksa) sağ altta küçük, ENGELLEMEYEN kart — "Turu başlat" / "Şimdi değil" (kapatılabilir,
     tercih hatırlanır). 2) Tur: hedefi vurgulayan perde + yanında adım kartı (başlık, metin, "2 / 6", Geri / İleri / Bitti).
  Klavye: ←/→ adım, Esc kapatır; odak adım kartına taşınır, tur bitince önceki odağa döner. Yeniden başlatma: üst bar
  Yardım menüsü → `ek:help-tour` olayı. Tüm renkler token (perde `scrim-veil`); hareket yalnız opaklık, reduced-motion'da yok.
-->
<template>
  <Teleport to="body">
    <transition name="ek-tour-fade">
      <section
        v-if="offerOpen && !running"
        ref="offerEl"
        class="ek-tour-offer"
        role="dialog"
        aria-modal="false"
        aria-labelledby="ek-tour-offer-title"
        aria-describedby="ek-tour-offer-text"
        data-help-tour-offer
      >
        <EkIconTile icon="mdi-map-marker-path" tone="action" size="md" />
        <div class="ek-tour-offer__body">
          <p id="ek-tour-offer-title" class="ek-tour-offer__title">Uygulamayı 1 dakikada tanıyın</p>
          <p id="ek-tour-offer-text" class="ek-tour-offer__text">Menü, arama, sekmeler ve yardım — kısa bir turla gösterelim. Sonra da Yardım menüsünden başlatabilirsiniz.</p>
          <div class="ek-tour-offer__actions">
            <EkButton tone="primary" size="sm" icon="mdi-play-outline" @click="start">Turu başlat</EkButton>
            <EkButton size="sm" tone="ghost" @click="dismissOffer">Şimdi değil</EkButton>
          </div>
        </div>
        <button type="button" class="ek-tour__close" aria-label="Tur teklifini kapat" @click="dismissOffer">
          <v-icon icon="mdi-close" aria-hidden="true" />
        </button>
      </section>
    </transition>

    <div v-if="running && step" class="ek-tour" data-help-tour @keydown="onKeydown">
      <div class="ek-tour__spot" :class="{ 'is-none': !rect }" :data-rect="rectKey" aria-hidden="true" />
      <section
        ref="cardRef"
        class="ek-tour__card"
        :class="`is-${placement}`"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ek-tour-title"
        aria-describedby="ek-tour-text"
        tabindex="-1"
        data-help-tour-card
      >
        <p class="ek-tour__count ek-num">{{ index + 1 }} / {{ steps.length }}</p>
        <h2 id="ek-tour-title" class="ek-tour__title">{{ step.title }}</h2>
        <p id="ek-tour-text" class="ek-tour__text">{{ step.text }}</p>
        <div class="ek-tour__actions">
          <EkButton v-if="index > 0" size="sm" tone="ghost" icon="mdi-arrow-left" @click="go(index - 1)">Geri</EkButton>
          <span class="ek-tour__spacer" />
          <EkButton v-if="index < steps.length - 1" tone="primary" size="sm" trailing-icon="mdi-arrow-right" data-tour-next @click="go(index + 1)">İleri</EkButton>
          <EkButton v-else tone="primary" size="sm" icon="mdi-check" data-tour-done @click="finish('done')">Bitti</EkButton>
        </div>
        <button type="button" class="ek-tour__close" aria-label="Turu kapat" @click="finish('dismissed')">
          <v-icon icon="mdi-close" aria-hidden="true" />
        </button>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EkButton, EkIconTile } from '@entegrasyonik/ui/components'
import { TOUR_STEPS, readTourState, writeTourState, type TourState, type TourStep } from '@/help/tour'

const props = withDefaults(defineProps<{ /** Kabuk hazır mı (menü yüklendi) — teklif ancak o zaman. */ ready?: boolean }>(), { ready: false })

const offerOpen = ref(false)
const running = ref(false)
const steps = ref<TourStep[]>([])
const index = ref(0)
const rect = ref<DOMRect | null>(null)
const placement = ref<'below' | 'above' | 'center'>('below')
const cardRef = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null
let offerTimer: ReturnType<typeof setTimeout> | undefined

const step = computed(() => steps.value[index.value])
const rectKey = computed(() => (rect.value ? `${Math.round(rect.value.left)},${Math.round(rect.value.top)}` : 'none'))

function visibleTarget(s: TourStep): HTMLElement | null {
  if (s.minWidth && window.innerWidth < s.minWidth) return null
  for (const sel of s.targets) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      if (r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && r.bottom > 0 && r.top < window.innerHeight) return el
    }
  }
  return null
}

const GAP = 12
const MARGIN = 16

function layout() {
  const s = step.value
  const card = cardRef.value
  if (!s || !card) return
  const el = visibleTarget(s)
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(360, vw - MARGIN * 2)
  card.style.width = `${width}px`
  if (!el) {
    rect.value = null
    placement.value = 'center'
    card.style.left = `${Math.round((vw - width) / 2)}px`
    card.style.top = `${Math.round(vh / 2 - card.offsetHeight / 2)}px`
    return
  }
  const r = el.getBoundingClientRect()
  rect.value = r
  const spot = document.querySelector<HTMLElement>('.ek-tour__spot')
  if (spot) {
    const pad = 4
    // Hedef görünüm alanından taşıyorsa (tam yükseklik menü) vurgu görünür kısma kırpılır.
    const top = Math.max(r.top - pad, 4)
    const bottom = Math.min(r.bottom + pad, vh - 4)
    spot.style.left = `${Math.max(r.left - pad, 4)}px`
    spot.style.top = `${top}px`
    spot.style.width = `${Math.min(r.width + pad * 2, vw - 8)}px`
    spot.style.height = `${Math.max(bottom - top, 0)}px`
  }
  const h = card.offsetHeight
  let top: number
  // Uzun, dikey hedefte (sol menü) kart hedefin YANINA konur.
  if (r.height > vh * 0.5 && r.right + GAP + 4 + width <= vw - MARGIN) {
    placement.value = 'center'
    card.style.left = `${Math.round(r.right + GAP + 4)}px`
    card.style.top = `${Math.round(Math.min(Math.max(r.top + 24, MARGIN), vh - h - MARGIN))}px`
    return
  }
  if (r.bottom + GAP + h <= vh - MARGIN) {
    placement.value = 'below'
    top = r.bottom + GAP
  } else if (r.top - GAP - h >= MARGIN) {
    placement.value = 'above'
    top = r.top - GAP - h
  } else {
    placement.value = 'center'
    top = Math.max(MARGIN, vh - h - MARGIN)
  }
  const left = Math.min(Math.max(r.left + r.width / 2 - width / 2, MARGIN), vw - width - MARGIN)
  card.style.left = `${Math.round(left)}px`
  card.style.top = `${Math.round(top)}px`
}

async function go(i: number) {
  if (i < 0 || i >= steps.value.length) return
  index.value = i
  await nextTick()
  visibleTarget(steps.value[i])?.scrollIntoView?.({ block: 'nearest' })
  layout()
  cardRef.value?.focus({ preventScroll: true })
}

async function start() {
  offerOpen.value = false
  steps.value = TOUR_STEPS.filter((s) => !!visibleTarget(s))
  if (!steps.value.length) return
  returnFocus = document.activeElement as HTMLElement | null
  running.value = true
  index.value = 0
  await nextTick()
  await go(0)
}

function finish(state: TourState) {
  running.value = false
  writeTourState(state)
  const back = returnFocus
  returnFocus = null
  nextTick(() => back?.focus?.({ preventScroll: true }))
}

function dismissOffer() {
  offerOpen.value = false
  writeTourState('dismissed')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    finish('dismissed')
  } else if (e.key === 'ArrowRight' && !(e.target as HTMLElement)?.closest?.('input,textarea')) {
    e.preventDefault()
    if (index.value < steps.value.length - 1) go(index.value + 1)
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    go(index.value - 1)
  } else if (e.key === 'Tab') {
    // Odak adım kartında kalır (modal).
    const card = cardRef.value
    if (!card) return
    const items = Array.from(card.querySelectorAll<HTMLElement>('button:not([disabled])'))
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === card)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

const onResize = () => running.value && layout()
const onExternalStart = () => start()

watch(
  () => props.ready,
  (ready) => {
    if (!ready || readTourState()) return
    clearTimeout(offerTimer)
    offerTimer = setTimeout(() => {
      if (!running.value && !readTourState()) offerOpen.value = true
    }, 900)
  },
  { immediate: true },
)

// FR2-SHELL madde 3 sonrası (fe-r2a): çalışma alanı kendi içinde kaydığı için sağ alttaki teklif kartı sayfanın EN ALTINDAKİ
// içeriği (ör. formun "Kaydet" düğmesi) kalıcı olarak örtebiliyordu. Kart açıkken yüksekliği kadar alt pay ayrılır
// (`--ek-tour-offer-space`, kabuk `.workplace-area` alt dolgusu) → içerik kartın üstüne kaydırılabilir.
const offerEl = ref<HTMLElement | null>(null)
let offerObserver: ResizeObserver | undefined
function setOfferSpace(px: number) {
  document.documentElement.style.setProperty('--ek-tour-offer-space', px > 0 ? `${Math.ceil(px)}px` : '0px')
}
watch(offerEl, (el) => {
  offerObserver?.disconnect()
  offerObserver = undefined
  if (!el) return setOfferSpace(0)
  const measure = () => setOfferSpace(el.getBoundingClientRect().height + 24)
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    offerObserver = new ResizeObserver(measure)
    offerObserver.observe(el)
  }
}, { flush: 'post' })

onMounted(() => {
  window.addEventListener('ek:help-tour', onExternalStart)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  offerObserver?.disconnect()
  setOfferSpace(0)
  clearTimeout(offerTimer)
  window.removeEventListener('ek:help-tour', onExternalStart)
  window.removeEventListener('resize', onResize)
})

defineExpose({ start })
</script>

<style scoped>
.ek-tour-offer {
  position: fixed;
  /* ADR-0034: Otopilot yan paneli açıkken teklif kartı panelin soluna kayar (`--ek-otopilot-offset`, OtopilotDock yazar). */
  right: calc(var(--ek-otopilot-offset, 0px) + var(--ek-space-6));
  bottom: var(--ek-space-6);
  z-index: var(--ek-z-toast);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--ek-space-3);
  width: min(400px, calc(100vw - 32px));
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-raised);
  box-shadow: var(--ek-shadow-dialog);
}

.ek-tour-offer__body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
}

.ek-tour-offer__title,
.ek-tour__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-tour-offer__text,
.ek-tour__text {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-table-size);
  line-height: 1.5;
}

.ek-tour-offer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin-top: var(--ek-space-2);
}

.ek-tour__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--ek-radius-chip);
  background: transparent;
  color: var(--ek-color-content-muted);
  cursor: pointer;
}

.ek-tour__close:hover {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.ek-tour__close:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-tour {
  position: fixed;
  inset: 0;
  z-index: var(--ek-z-toast);
}

/* Perde: vurgu kutusunun dev gölgesi — hedef dışını karartır, hedef "delik" olarak kalır. */
.ek-tour__spot {
  position: fixed;
  border-radius: var(--ek-radius-card);
  box-shadow: 0 0 0 9999px var(--ek-color-scrim-veil);
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 0;
  pointer-events: none;
  transition: left var(--ek-duration-base) var(--ek-easing-standard), top var(--ek-duration-base) var(--ek-easing-standard),
    width var(--ek-duration-base) var(--ek-easing-standard), height var(--ek-duration-base) var(--ek-easing-standard);
}

.ek-tour__spot.is-none {
  inset: 0;
  width: 0;
  height: 0;
  outline: 0;
}

.ek-tour__card {
  position: fixed;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-raised);
  box-shadow: var(--ek-shadow-dialog);
  outline: none;
}

.ek-tour__card .ek-tour__close {
  position: absolute;
  top: var(--ek-space-2);
  right: var(--ek-space-2);
}

.ek-tour__count {
  margin: 0;
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
}

.ek-tour__actions {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin-top: var(--ek-space-2);
}

.ek-tour__spacer {
  flex: 1;
}

.ek-tour-fade-enter-active,
.ek-tour-fade-leave-active {
  transition: opacity var(--ek-duration-base) var(--ek-easing-standard);
}

.ek-tour-fade-enter-from,
.ek-tour-fade-leave-to {
  opacity: 0;
}

@media (max-width: 599px) {
  .ek-tour-offer {
    right: var(--ek-space-4);
    bottom: var(--ek-space-4);
    left: var(--ek-space-4);
    width: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ek-tour__spot,
  .ek-tour-fade-enter-active,
  .ek-tour-fade-leave-active {
    transition: none;
  }
}
</style>
