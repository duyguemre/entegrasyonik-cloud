import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import useRestApi from '@/composables/restapi'
import logger from '@/composables/logger'
import { registerStoreReset } from '@/stores/resetRegistry'

/**
 * Rozet (okunmamış sayısı) yoklama aralığı.
 * C1.5 (F-06): eskiden (tasarlanan ama hiç başlatılmayan) 10 sn'lik TAM LİSTE polling'i vardı;
 * artık yalnız `NotificationService/getUnreadCount` (tek `countDocuments`) yoklanır. Aralık 30 sn:
 * rozet "yakın gerçek zamanlı" kalır, sekme başına istek sayısı 3'te 1'e iner; sekme görünür hale
 * geldiğinde ve her okundu/sil eyleminden sonra sayım ANINDA tazelendiği için gecikme yalnız arka
 * planda yeni bildirim üretildiğinde hissedilir. Belge gizliyken (document.hidden) zamanlayıcı DURUR.
 */
export const UNREAD_POLL_MS = 30_000

/** Liste isteği üst sınırı (backend `clampLimit` MAX_PAGE_LIMIT = 200). */
export const NOTIFICATION_LIST_LIMIT = 200

export const useNotificationDrawerStore = defineStore('notificationDrawer', () => {
  const restApi = useRestApi()

  // --- STATE ---
  const drawer = ref(false)
  const notifications = ref<any[]>([])
  const unreadCount = ref(0)
  const isPollingActive = ref(false)
  const loading = ref(false)
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let visibilityBound = false

  // --- GETTERS ---
  const getDrawer = computed(() => drawer.value)
  const getNotifications = computed(() => notifications.value)
  const getUnreadCount = computed(() => unreadCount.value)

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

  function onVisibilityChange() {
    if (!isPollingActive.value) return
    if (document.hidden) {
      clearTimer()
    } else {
      fetchUnreadCount()
      armTimer()
    }
  }

  /**
   * Rozet yoklaması: ilk sayım hemen, sonra `UNREAD_POLL_MS`'de bir; belge gizliyken durur.
   */
  function startPolling() {
    if (isPollingActive.value) return

    isPollingActive.value = true
    if (!visibilityBound) {
      document.addEventListener('visibilitychange', onVisibilityChange)
      visibilityBound = true
    }
    if (!document.hidden) {
      fetchUnreadCount()
      armTimer()
    }
  }

  /**
   * Polling'i durdurur (R9b: çıkışta interval sızmasın; eskiden tutamaç saklanmadığı için durdurulamıyordu).
   */
  function stopPolling() {
    clearTimer()
    if (visibilityBound) {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      visibilityBound = false
    }
    isPollingActive.value = false
  }

  // R9b: çıkış sonrası önceki kullanıcının bildirimleri/sayaçları kalmasın; polling durur.
  registerStoreReset('notificationDrawer', () => {
    stopPolling()
    drawer.value = false
    notifications.value = []
    unreadCount.value = 0
    loading.value = false
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
    getDrawer,
    getNotifications,
    getUnreadCount,
    toggleDrawer,
    startPolling,
    stopPolling,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    deleteNotification
  }
})
