import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import useRestApi from '@/composables/restapi'
import logger from '@/composables/logger'
import { registerStoreReset } from '@/stores/resetRegistry'

export const useNotificationDrawerStore = defineStore('notificationDrawer', () => {
  const restApi = useRestApi()

  // --- STATE ---
  const drawer = ref(false)
  const notifications = ref<any[]>([])
  const unreadCount = ref(0)
  const isPollingActive = ref(false)
  const loading = ref(false)
  let pollTimer: ReturnType<typeof setInterval> | undefined

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
   * Polling Mekanizması (10 saniyede bir çalışır)
   */
  function startPolling() {
    if (isPollingActive.value) return

    isPollingActive.value = true
    fetchNotifications() // İlk yükleme

    pollTimer = setInterval(() => {
      // Kullanıcı sekmeyi arka plana attıysa boşuna istek atma (Performans)
      if (document.visibilityState === 'visible') {
        fetchNotifications()
      }
    }, 10000) // 10 saniye polling süresi
  }

  /**
   * Polling'i durdurur (R9b: çıkışta interval sızmasın; eskiden tutamaç saklanmadığı için durdurulamıyordu).
   */
  function stopPolling() {
    if (pollTimer !== undefined) {
      clearInterval(pollTimer)
      pollTimer = undefined
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

  /**
   * Okundu İşaretleme (Tekil veya Toplu)
   * @param id Gönderilmezse hepsini okundu yapar
   */
  async function markAsRead(id?: string) {
    try {
      const payload = id ? { notificationIds: [id] } : { all: true }
      const response = await restApi.post('NotificationService/markAsRead', payload)

      if (response?.result) {
        await fetchNotifications()
      }
    } catch (error) {
      logger.error('Bildirim okundu işaretlenemedi', { module: 'notificationDrawer', op: 'markAsRead', error })
    }
  }

  /**
   * Bildirim Silme (Tekil veya Toplu)
   * @param id Gönderilmezse hepsini siler
   */
  async function deleteNotification(id?: string) {
    try {
      const payload = id ? { notificationIds: [id] } : { all: true }
      const response = await restApi.post('NotificationService/delete', payload)

      if (response?.result) {
        await fetchNotifications()
      }
    } catch (error) {
      logger.error('Bildirim silinemedi', { module: 'notificationDrawer', op: 'deleteNotification', error })
    }
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
    markAsRead,
    deleteNotification
  }
})