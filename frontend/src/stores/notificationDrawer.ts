import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import useRestApi from '@/composables/restapi'
import logger from '@/composables/logger'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { registerStoreReset } from '@/stores/resetRegistry'
import { useNotificationStream, type StreamEffect, type StreamMode } from '@/composables/useNotificationStream'
import type { NotificationItem } from '@/types/NotificationTypes'

/**
 * Rozet (okunmamış sayısı) yoklama aralığı — YALNIZ SSE yokken (C2b).
 * C1.5 (F-06): eskiden (tasarlanan ama hiç başlatılmayan) 10 sn'lik TAM LİSTE polling'i vardı;
 * artık yalnız `NotificationService/getUnreadCount` (tek `countDocuments`) yoklanır. Aralık 30 sn:
 * rozet "yakın gerçek zamanlı" kalır, sekme başına istek sayısı 3'te 1'e iner; sekme görünür hale
 * geldiğinde ve her okundu/sil eyleminden sonra sayım ANINDA tazelendiği için gecikme yalnız arka
 * planda yeni bildirim üretildiğinde hissedilir. Belge gizliyken (document.hidden) zamanlayıcı DURUR.
 *
 * C2b (ADR-0029 Karar 6): rozet artık SSE akışından (`composables/useNotificationStream.ts`) beslenir.
 * Akış `live` iken yoklama YAPILMAZ; `polling` modunda (503, bağlantı hatası, EventSource yok) bu aralık devrede.
 */
export const UNREAD_POLL_MS = 30_000

/** Liste isteği üst sınırı (backend `clampLimit` MAX_PAGE_LIMIT = 200). */
export const NOTIFICATION_LIST_LIMIT = 200

/** Merkez sayfa boyutu (sunucu sayfalaması; imleç ile "daha fazla"). */
export const NOTIFICATION_PAGE_SIZE = 25

/** Çekmecede gösterilen en yeni kayıt sayısı. */
export const DRAWER_LIST_LIMIT = 20

/** `NotificationService/get` gövdesi (NB4). Tanımsız alanlar gönderilmez. */
export interface NotificationListQuery {
  limit?: number
  cursor?: string
  afterId?: string
  category?: string
  onlyUnread?: boolean
  archived?: boolean
}

export interface NotificationPage {
  items: NotificationItem[]
  nextCursor?: string
  hasMore: boolean
  unreadCount?: number
}

/** İstek gövdesi (tek kaynak): boş/tanımsız alanları atar; limit 1..200'e sıkıştırılır. */
export function listBody(query: NotificationListQuery = {}): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const limit = query.limit ?? NOTIFICATION_PAGE_SIZE
  body.limit = Math.min(NOTIFICATION_LIST_LIMIT, Math.max(1, Math.floor(limit)))
  if (query.cursor) body.cursor = query.cursor
  if (query.afterId) body.afterId = query.afterId
  if (query.category) body.category = query.category
  if (query.onlyUnread !== undefined) body.onlyUnread = query.onlyUnread
  if (query.archived) body.archived = true
  return body
}

/**
 * Yanıt → sayfa. Sözleşme NB4: `data[]` + `nextCursor`. Bazı sürümler `hasMore` da dönebilir; ikisi de okunur.
 * `nextCursor` yok ve `hasMore` yoksa sayfa sonu sayılır.
 */
export function parsePage(response: any): NotificationPage | null {
  if (!response?.result || !Array.isArray(response.data)) return null
  const items = response.data as NotificationItem[]
  const serverCursor = typeof response.nextCursor === 'string' && response.nextCursor ? response.nextCursor : undefined
  const hasMore = typeof response.hasMore === 'boolean' ? response.hasMore && items.length > 0 : !!serverCursor
  // `hasMore` var ama imleç yoksa son kaydın kimliği imleç olur (kimlik sıralı sayfalama).
  const nextCursor = hasMore ? serverCursor ?? items[items.length - 1]?._id : undefined
  return {
    items,
    nextCursor,
    hasMore,
    unreadCount: typeof response.unreadCount === 'number' ? response.unreadCount : undefined,
  }
}

/**
 * Yeni gelenleri başa ekler: kimliği zaten listede olan kayıt YERİNDE güncellenir (grup sayacı artmış olabilir),
 * olmayanlar gelen sırayla başa. Saf — çekmece ve merkez aynı birleştirmeyi kullanır.
 */
export function mergeNewest(existing: NotificationItem[], incoming: NotificationItem[]): NotificationItem[] {
  if (!incoming.length) return existing
  const byId = new Map(incoming.map((n) => [n._id, n]))
  const known = new Set(existing.map((n) => n._id))
  const fresh = incoming.filter((n) => !known.has(n._id))
  const updated = existing.map((n) => byId.get(n._id) ?? n)
  return [...fresh, ...updated]
}

/** Canlı dinleyici (merkez sayfası): `new` → yenileri çek, `resync` → tam tazele. */
export type LiveSignal = 'new' | 'resync'

export const useNotificationDrawerStore = defineStore('notificationDrawer', () => {
  const restApi = useRestApi()
  const { showToast } = useToast()

  // --- STATE ---
  const drawer = ref(false)
  const notifications = ref<any[]>([])
  const unreadCount = ref(0)
  const isPollingActive = ref(false)
  const loading = ref(false)
  /** SSE bağlantı modu (üst bar/çekmece durum göstergesi ve testler için). */
  const streamMode = ref<StreamMode>('idle')
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let visibilityBound = false
  const liveListeners = new Set<(signal: LiveSignal) => void>()

  // --- GETTERS ---
  const getDrawer = computed(() => drawer.value)
  const getNotifications = computed(() => notifications.value)
  const getUnreadCount = computed(() => unreadCount.value)
  const isLive = computed(() => streamMode.value === 'live')

  // --- ACTIONS ---

  /**
   * Drawer açma/kapama
   */
  function toggleDrawer() {
    drawer.value = !drawer.value
  }

  // C1.5: tam liste YALNIZ çekmece açıldığında çekilir (rozet sayımı ayrı, hafif uçtan gelir).
  watch(drawer, (open) => {
    if (open) fetchNotifications()
  })

  /**
   * Bildirimleri backend'den çeker
   */
  async function fetchNotifications() {
    try {
      // Backend'deki get metoduna istek atar
      const response = await restApi.get('NotificationService')

      if (response && response.result) {
        notifications.value = response.data
        unreadCount.value = response.unreadCount
      }
    } catch (error) {
      logger.error('Bildirim listesi alınamadı', { module: 'notificationDrawer', op: 'fetchNotifications', error })
    }
  }

  /** Merkez/çekmece sayfa isteği (tek gövde kaynağı: `listBody`). Hata/geçersiz yanıtta `null`. */
  async function fetchPage(query: NotificationListQuery = {}): Promise<NotificationPage | null> {
    try {
      const response: any = await restApi.post('NotificationService/get', listBody(query))
      const page = parsePage(response)
      if (page?.unreadCount !== undefined && !query.archived) unreadCount.value = page.unreadCount
      return page
    } catch (error) {
      logger.error('Bildirim sayfası alınamadı', { module: 'notificationDrawer', op: 'fetchPage', error })
      return null
    }
  }

  /** SSE `notification`: çekmece açıksa yalnız yenileri (`afterId` = listedeki en yeni) başa ekler. */
  async function fetchNewForDrawer() {
    const newest = notifications.value[0]?._id
    if (!newest) return fetchNotifications()
    const page = await fetchPage({ afterId: newest, limit: DRAWER_LIST_LIMIT })
    if (page) notifications.value = mergeNewest(notifications.value, page.items).slice(0, NOTIFICATION_LIST_LIMIT)
  }

  /**
   * Yalnız okunmamış sayısını çeker (üst bar rozeti). Hata/geçersiz yanıtta mevcut değer korunur.
   */
  async function fetchUnreadCount() {
    try {
      const response: any = await restApi.post('NotificationService/getUnreadCount', {})
      if (response?.result && typeof response.unreadCount === 'number') {
        unreadCount.value = response.unreadCount
      }
    } catch (error) {
      logger.error('Okunmamış bildirim sayısı alınamadı', { module: 'notificationDrawer', op: 'fetchUnreadCount', error })
    }
  }

  function clearTimer() {
    if (pollTimer !== undefined) {
      clearInterval(pollTimer)
      pollTimer = undefined
    }
  }

  function armTimer() {
    clearTimer()
    pollTimer = setInterval(fetchUnreadCount, UNREAD_POLL_MS)
  }

  /** Yoklama yalnız SSE `polling` modunda ve belge görünürken çalışır. */
  function syncPollTimer() {
    const hidden = typeof document !== 'undefined' && document.hidden
    if (isPollingActive.value && streamMode.value === 'polling' && !hidden) {
      if (pollTimer === undefined) armTimer()
    } else {
      clearTimer()
    }
  }

  function onVisibilityChange() {
    if (!isPollingActive.value) return
    if (document.hidden) {
      clearTimer()
    } else {
      if (streamMode.value === 'polling') fetchUnreadCount()
      syncPollTimer()
    }
  }

  function notifyLive(signal: LiveSignal) {
    for (const listener of liveListeners) {
      try {
        listener(signal)
      } catch (error) {
        logger.error('Bildirim canlı dinleyicisi hata verdi', { module: 'notificationDrawer', op: 'notifyLive', error })
      }
    }
  }

  /** Merkez gibi ekranlar yeni bildirim sinyaline abone olur; dönen fonksiyon aboneliği kaldırır (onUnmounted). */
  function onLive(listener: (signal: LiveSignal) => void): () => void {
    liveListeners.add(listener)
    return () => liveListeners.delete(listener)
  }

  function applyEffect(effect: StreamEffect) {
    switch (effect.kind) {
      case 'setUnread':
        unreadCount.value = effect.count
        break
      case 'countUnread':
        fetchUnreadCount()
        break
      case 'fetchNew':
        if (drawer.value) fetchNewForDrawer()
        notifyLive('new')
        break
      case 'resync':
        fetchUnreadCount()
        if (drawer.value) fetchNotifications()
        notifyLive('resync')
        break
      case 'critical':
        // Kritik önem: tek, sakin bir uyarı toast'ı (kalıcı kayıt çekmecede). Diğer önemlerde toast YOK.
        showToast({
          tone: 'warning',
          title: 'Kritik bildirim',
          message: 'Hemen ilgilenmeniz gereken yeni bir bildirim var.',
          actionLabel: 'Görüntüle',
          onAction: () => (drawer.value = true),
        })
        break
      case 'unauthorized':
        // Akış kapandı; oturumun ne olacağına restapi 401 akışı karar verir (tek sayım isteği onu tetikler).
        clearTimer()
        fetchUnreadCount()
        break
      case 'expectReconnect':
        break
    }
  }

  const stream = useNotificationStream({
    onEffect: applyEffect,
    onModeChange: (next, previous) => {
      streamMode.value = next
      syncPollTimer()
      // Kopmadan dönüşte kaçan olaylar: sayım + açık listeler tazelenir.
      if (next === 'live' && (previous === 'reconnecting' || previous === 'polling' || previous === 'paused')) {
        applyEffect({ kind: 'resync' })
      }
    },
  })

  /**
   * Canlı rozet: ilk sayım hemen; SSE akışı açılır. Akış yoksa/düşerse `UNREAD_POLL_MS` yoklamasına düşer
   * (belge gizliyken durur). Ad geriye uyum için korunur (ApplicationBar çağırır).
   */
  function startPolling() {
    if (isPollingActive.value) return

    isPollingActive.value = true
    if (!visibilityBound && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
      visibilityBound = true
    }
    if (typeof document === 'undefined' || !document.hidden) fetchUnreadCount()
    stream.start()
    syncPollTimer()
  }

  /**
   * Akışı ve polling'i durdurur (R9b: çıkışta interval/bağlantı sızmasın).
   */
  function stopPolling() {
    stream.stop()
    clearTimer()
    if (visibilityBound) {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      visibilityBound = false
    }
    isPollingActive.value = false
  }

  // R9b: çıkış sonrası önceki kullanıcının bildirimleri/sayaçları kalmasın; akış + polling durur.
  registerStoreReset('notificationDrawer', () => {
    stopPolling()
    drawer.value = false
    notifications.value = []
    unreadCount.value = 0
    loading.value = false
    liveListeners.clear()
  })

  /** Değişiklik sonrası: çekmece açıksa listesi (sayım dahil), değilse yalnız rozet sayımı tazelenir. */
  const refreshAfterChange = () => (drawer.value ? fetchNotifications() : fetchUnreadCount())

  /** Tekil kimlik, kimlik listesi ya da (boş) "tümü" → mevcut uç gövdesi. */
  const idsPayload = (id?: string | string[]) => {
    const ids = Array.isArray(id) ? id : id ? [id] : []
    return ids.length ? { notificationIds: ids } : { all: true }
  }

  /**
   * Okundu İşaretleme (Tekil, seçili liste veya Toplu)
   * @param id Gönderilmezse hepsini okundu yapar
   * @returns istek başarılıysa `true`
   */
  async function markAsRead(id?: string | string[]): Promise<boolean> {
    try {
      const response = await restApi.post('NotificationService/markAsRead', idsPayload(id))

      if (response?.result) {
        await refreshAfterChange()
        return true
      }
    } catch (error) {
      logger.error('Bildirim okundu işaretlenemedi', { module: 'notificationDrawer', op: 'markAsRead', error })
    }
    return false
  }

  /**
   * Bildirim Silme (Tekil, seçili liste veya Toplu)
   * @param id Gönderilmezse hepsini siler
   * @returns istek başarılıysa `true`
   */
  async function deleteNotification(id?: string | string[]): Promise<boolean> {
    try {
      const response = await restApi.post('NotificationService/delete', idsPayload(id))

      if (response?.result) {
        await refreshAfterChange()
        return true
      }
    } catch (error) {
      logger.error('Bildirim silinemedi', { module: 'notificationDrawer', op: 'deleteNotification', error })
    }
    return false
  }

  return {
    drawer,
    notifications,
    unreadCount,
    loading,
    streamMode,
    isLive,
    getDrawer,
    getNotifications,
    getUnreadCount,
    toggleDrawer,
    startPolling,
    stopPolling,
    fetchNotifications,
    fetchUnreadCount,
    fetchPage,
    onLive,
    markAsRead,
    deleteNotification
  }
})
