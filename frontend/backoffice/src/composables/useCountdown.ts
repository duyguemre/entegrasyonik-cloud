/**
 * Bitiş anına (`expiresAt`, ISO ya da ms) göre geri sayım — saniyede bir tazelenir, bitince durur.
 * Kaynak her zaman SUNUCU bitiş anıdır (K41: destek oturumu 30 dk, uzatılamaz; geri sayım `expiresAt`'ten);
 * istemci süre eklemez. Saf biçimleyici `formatCountdown` testlenir (tests/countdown.test.ts).
 */
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'

/** ms → "mm:ss" (≥ 1 saatte "s:mm:ss"); negatif → "00:00". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function toMs(expiresAt: string | number | null | undefined): number | null {
  if (expiresAt === null || expiresAt === undefined) return null
  const n = typeof expiresAt === 'number' ? expiresAt : Date.parse(expiresAt)
  return Number.isFinite(n) ? n : null
}

export function useCountdown(expiresAt: Ref<string | number | null | undefined>, clock: () => number = Date.now) {
  const now = ref(clock())
  let timer: ReturnType<typeof setInterval> | undefined
  const end = computed(() => toMs(expiresAt.value))
  const remainingMs = computed(() => (end.value === null ? 0 : Math.max(0, end.value - now.value)))
  const active = computed(() => remainingMs.value > 0)
  const text = computed(() => formatCountdown(remainingMs.value))

  function stop() {
    if (timer) clearInterval(timer)
    timer = undefined
  }
  function tick() {
    now.value = clock()
    if (!active.value) stop()
  }
  watch(
    end,
    () => {
      stop()
      now.value = clock()
      if (active.value) timer = setInterval(tick, 1000)
    },
    { immediate: true },
  )
  onBeforeUnmount(stop)
  return { remainingMs, active, text, stop }
}
