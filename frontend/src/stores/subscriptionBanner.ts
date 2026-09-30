/**
 * frontend/src/stores/subscriptionBanner.ts
 *
 * C2.2 — kabuktaki abonelik durum bandının verisi. `BillingService/getMySubscription` (member)
 * oturum açılışında (`SecureLayout` bağlanınca) ve 15 dakikada bir çağrılır.
 *
 * Hata SESSİZDİR (C2.2 madde 3): bant gösterilmez, ekran çalışmaya devam eder; iz `logger.warn`'a
 * düşer (üretimde konsola yazılmaz, sunucu log ucuna gider — ADR-0017 Karar 1.8).
 * Deneme bandının "küçült" tercihi yalnız bellekte tutulur (oturum içi; sayfa yenilenince bant
 * yeniden açık gelir — kalıcı saklama/PII yok).
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import useRestApi from '@/composables/restapi'
import logger from '@/composables/logger'
import { resolveSubscriptionBanner, type MySubscriptionResponse } from '@/composables/subscriptionStatus'
import { registerStoreReset } from '@/stores/resetRegistry'

export const SUBSCRIPTION_POLL_MS = 15 * 60 * 1000

export const useSubscriptionBannerStore = defineStore('subscriptionBanner', () => {
  const restApi = useRestApi()

  const response = ref<MySubscriptionResponse | null>(null)
  /** Son başarılı yanıtın zamanı — deneme kalan gün hesabı buna göre (her render'da `new Date()` değil). */
  const checkedAt = ref<Date>(new Date())
  const minimized = ref(false)
  let timer: ReturnType<typeof setInterval> | undefined
  let inflight: Promise<void> | undefined

  const banner = computed(() => resolveSubscriptionBanner(response.value, checkedAt.value))

  async function load(): Promise<void> {
    try {
      const res: any = await restApi.post('BillingService/getMySubscription', {})
      if (res && res.result === true) {
        response.value = { status: res.status, subscription: res.subscription, access: res.access, reason: res.reason }
        checkedAt.value = new Date()
        return
      }
      response.value = null
      logger.warn('Abonelik durumu alınamadı (bant gizlendi)', { module: 'subscriptionBanner', op: 'refresh', status: res?.response?.status })
    } catch (error) {
      response.value = null
      logger.warn('Abonelik durumu alınamadı (bant gizlendi)', { module: 'subscriptionBanner', op: 'refresh', error })
    }
  }

  /** Aynı anda tek istek (yoklama + sekme dönüşü üst üste gelirse ikinci çağrı ilkine katılır). */
  function refresh(): Promise<void> {
    if (!inflight) inflight = load().finally(() => { inflight = undefined })
    return inflight
  }

  function start() {
    stop()
    void refresh()
    timer = setInterval(() => { void refresh() }, SUBSCRIPTION_POLL_MS)
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = undefined
  }

  function setMinimized(value: boolean) {
    minimized.value = value
  }

  function reset() {
    stop()
    response.value = null
    minimized.value = false
  }

  registerStoreReset('subscriptionBanner', reset)

  return { response, banner, minimized, refresh, start, stop, setMinimized, reset }
})
