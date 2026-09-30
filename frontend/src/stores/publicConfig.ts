/**
 * frontend/src/stores/publicConfig.ts
 *
 * FE-CFG-1 (ADR-0031 Karar 4) — kamu açılış yapılandırması (`GET /api/public-config`, kimliksiz).
 * Sözleşme: docs/cloud-contracts/API_PUBLIC_CONFIG.md.
 *
 *  - Açılışta (`main.ts`, montajdan önce) bir kez alınır; 3 sn zaman aşımı. Alınamazsa (hata, çevrimdışı,
 *    beklenmeyen gövde) GÜVENLİ VARSAYILANLAR = bugünkü sabitler kullanılır: görsel tabanı
 *    `DEFAULT_PRODUCT_IMAGE_BASE_URL`, yükleme tavanı 2 MB, liste 25, rapor yoklaması 5000 ms, destek/duyuru/bakım boş.
 *    Önceden alınmış iyi değerler bir hatada SİLİNMEZ.
 *  - Tazeleme: 5 dakikada bir (yalnız sekme görünürken) ve sekme yeniden görünür olduğunda / rota değişiminde
 *    değer 5 dakikadan eskiyse. `ETag` okunabiliyorsa `If-None-Match` ile koşullu istek (304 → gövde yok, değer aynı);
 *    okunamıyorsa (çapraz köken, başlık açılmamış) `cache: 'no-cache'` ile tarayıcı kendi ETag doğrulamasını yapar.
 *  - Aynı anda tek istek. İstek `restapi.ts` üzerinden GEÇMEZ: kimliksizdir, çerez taşımaz ve oturum düşünce
 *    giriş ekranına yönlendirme gibi kabuk davranışlarını tetiklememelidir.
 *  - Duyuru kapatma: sekme başına değil, duyuru METNİNİN özetine göre hatırlanır (yerel depo; aynı duyuru
 *    tekrar gösterilmez, metin/seviye değişince yeniden görünür). Depo erişilemezse yalnız bellekte tutulur.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiBaseUrl } from '@/config/env'
import { DEFAULT_PRODUCT_IMAGE_BASE_URL, normalizeImageBaseUrl } from '@/config/imageUrl'
import logger from '@/composables/logger'

export type AnnouncementLevel = 'info' | 'warning' | 'critical'

export interface PublicConfigValues {
  version: number
  productBaseUrl: string
  uploadMaxBytes: number
  supportEmail: string
  supportPhone: string
  announcementEnabled: boolean
  announcementLevel: AnnouncementLevel
  announcementText: string
  maintenanceEnabled: boolean
  maintenanceMessage: string
  listPageSize: number
  reportPollMs: number
}

export const LIST_PAGE_SIZES = [10, 25, 50, 100] as const
export const PUBLIC_CONFIG_REFRESH_MS = 5 * 60 * 1000
export const PUBLIC_CONFIG_TIMEOUT_MS = 3000
export const ANNOUNCEMENT_DISMISS_KEY = 'ek.announcement.dismissed.v1'
const TEXT_MAX = 280

/** Yapılandırma alınamazsa geçerli olan değerler (bugünkü sabitler). */
export const PUBLIC_CONFIG_DEFAULTS: Readonly<PublicConfigValues> = Object.freeze({
  version: 0,
  productBaseUrl: DEFAULT_PRODUCT_IMAGE_BASE_URL,
  uploadMaxBytes: 2_000_000,
  supportEmail: '',
  supportPhone: '',
  announcementEnabled: false,
  announcementLevel: 'info',
  announcementText: '',
  maintenanceEnabled: false,
  maintenanceMessage: '',
  listPageSize: 25,
  reportPollMs: 5000,
})

// ---- Saf yardımcılar (vitest) ----

/** Düz metin: kontrol karakterleri boşluğa, kırpılır, en çok 280 karakter. HTML olarak BASILMAZ. */
function plainText(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX)
}

function email(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value.length <= 120 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value) ? value : ''
}

function phone(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return /^\+?[0-9 ()-]{7,20}$/.test(value) ? value : ''
}

function intIn(raw: unknown, min: number, max: number, fallback: number): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= min && raw <= max ? raw : fallback
}

/**
 * Sunucu gövdesini doğrular; her alan bağımsız: geçersiz/eksik alan VARSAYILANA düşer (tek bozuk alan
 * tüm yapılandırmayı düşürmez). Gövde nesne değilse `null` (→ çağıran mevcut değerleri korur).
 */
export function normalizePublicConfig(raw: unknown, defaults: Readonly<PublicConfigValues> = PUBLIC_CONFIG_DEFAULTS): PublicConfigValues | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const body = raw as Record<string, any>
  const images = body.env?.images ?? {}
  const s: Record<string, unknown> = body.settings && typeof body.settings === 'object' ? body.settings : {}
  if (!body.env && !body.settings) return null

  const level = s['announcement.level']
  const pageSize = s['ui.listPageSize']
  return {
    version: intIn(body.version, 0, Number.MAX_SAFE_INTEGER, defaults.version),
    productBaseUrl: normalizeImageBaseUrl(images.productBaseUrl) || defaults.productBaseUrl,
    uploadMaxBytes: intIn(images.uploadMaxBytes, 1, 1024 * 1024 * 1024, defaults.uploadMaxBytes),
    supportEmail: email(s['support.email']),
    supportPhone: phone(s['support.phone']),
    announcementEnabled: s['announcement.enabled'] === true,
    announcementLevel: level === 'warning' || level === 'critical' ? level : 'info',
    announcementText: plainText(s['announcement.text']),
    maintenanceEnabled: s['maintenance.enabled'] === true,
    maintenanceMessage: plainText(s['maintenance.message']),
    listPageSize: (LIST_PAGE_SIZES as readonly number[]).includes(pageSize as number) ? (pageSize as number) : defaults.listPageSize,
    reportPollMs: intIn(s['ui.reportPollMs'], 3000, 60000, defaults.reportPollMs),
  }
}

/** Duyurunun kimliği: seviye + metin özetidir (FNV-1a 32 bit). Metin değişince kapatma geçersizleşir. */
export function announcementHash(level: string, text: string): string {
  let h = 0x811c9dc5
  const input = `${level}\u0000${text}`
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): KeyValueStorage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined
  } catch {
    return undefined
  }
}

export function readDismissedAnnouncement(storage: KeyValueStorage | undefined = defaultStorage()): string {
  try {
    return storage?.getItem(ANNOUNCEMENT_DISMISS_KEY) ?? ''
  } catch {
    return ''
  }
}

export function writeDismissedAnnouncement(hash: string, storage: KeyValueStorage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(ANNOUNCEMENT_DISMISS_KEY, hash)
  } catch {
    /* depo kapalı / dolu: kapatma yalnız bu oturumda geçerli */
  }
}

// ---- Store ----

export const usePublicConfigStore = defineStore('publicConfig', () => {
  const values = ref<PublicConfigValues>({ ...PUBLIC_CONFIG_DEFAULTS })
  /** Son başarılı (200/304) yanıt zamanı; 0 = hiç alınamadı (varsayılanlar geçerli). */
  const fetchedAt = ref(0)
  const etag = ref('')
  const dismissedHash = ref(readDismissedAnnouncement())
  let inflight: Promise<void> | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let stopListeners: (() => void) | undefined

  const productBaseUrl = computed(() => values.value.productBaseUrl)
  const uploadMaxBytes = computed(() => values.value.uploadMaxBytes)
  const listPageSize = computed(() => values.value.listPageSize)
  const reportPollMs = computed(() => values.value.reportPollMs)
  const supportEmail = computed(() => values.value.supportEmail)
  const supportPhone = computed(() => values.value.supportPhone)
  const hasSupportContact = computed(() => !!(values.value.supportEmail || values.value.supportPhone))

  const currentAnnouncementHash = computed(() => announcementHash(values.value.announcementLevel, values.value.announcementText))
  const announcement = computed(() => {
    const v = values.value
    if (!v.announcementEnabled || !v.announcementText) return null
    return { level: v.announcementLevel, text: v.announcementText, hash: currentAnnouncementHash.value }
  })
  const announcementVisible = computed(() => !!announcement.value && announcement.value.hash !== dismissedHash.value)
  const maintenance = computed(() => (values.value.maintenanceEnabled ? { message: values.value.maintenanceMessage } : null))

  function dismissAnnouncement() {
    if (!announcement.value) return
    dismissedHash.value = announcement.value.hash
    writeDismissedAnnouncement(dismissedHash.value)
  }

  async function load(): Promise<void> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
    const timeout = setTimeout(() => controller?.abort(), PUBLIC_CONFIG_TIMEOUT_MS)
    try {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (etag.value) headers['If-None-Match'] = etag.value
      const res = await fetch(`${apiBaseUrl}public-config`, {
        method: 'GET',
        headers,
        credentials: 'omit',
        cache: 'no-cache',
        signal: controller?.signal,
      })
      if (res.status === 304) {
        fetchedAt.value = Date.now()
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const next = normalizePublicConfig(await res.json())
      if (!next) throw new Error('Beklenmeyen gövde')
      values.value = next
      etag.value = res.headers.get('ETag') ?? ''
      fetchedAt.value = Date.now()
    } catch (error) {
      logger.warn('Açılış yapılandırması alınamadı (mevcut/varsayılan değerler geçerli)', {
        module: 'publicConfig',
        op: 'load',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  function refresh(): Promise<void> {
    if (!inflight) inflight = load().finally(() => { inflight = undefined })
    return inflight
  }

  /** Değer 5 dakikadan eskiyse (ya da hiç alınamadıysa) yeniden alır. */
  function ensureFresh(now = Date.now()): Promise<void> {
    return now - fetchedAt.value >= PUBLIC_CONFIG_REFRESH_MS ? refresh() : Promise.resolve()
  }

  const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

  /** 5 dk'lık yoklama (yalnız görünürken) + sekme görünür olunca tazelik denetimi + diğer sekmedeki kapatma. */
  function startAutoRefresh() {
    stopAutoRefresh()
    timer = setInterval(() => { if (isVisible()) void refresh() }, PUBLIC_CONFIG_REFRESH_MS)
    if (typeof document === 'undefined' || typeof window === 'undefined') return
    const onVisible = () => { if (isVisible()) void ensureFresh() }
    const onStorage = (e: StorageEvent) => {
      if (e.key === ANNOUNCEMENT_DISMISS_KEY) dismissedHash.value = e.newValue ?? ''
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('storage', onStorage)
    stopListeners = () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('storage', onStorage)
    }
  }

  function stopAutoRefresh() {
    if (timer) clearInterval(timer)
    timer = undefined
    stopListeners?.()
    stopListeners = undefined
  }

  return {
    values,
    fetchedAt,
    etag,
    dismissedHash,
    productBaseUrl,
    uploadMaxBytes,
    listPageSize,
    reportPollMs,
    supportEmail,
    supportPhone,
    hasSupportContact,
    announcement,
    announcementVisible,
    maintenance,
    dismissAnnouncement,
    refresh,
    ensureFresh,
    startAutoRefresh,
    stopAutoRefresh,
  }
})

/**
 * Pinia dışı okuma (bileşen kurulumu öncesi `reactive({...})` başlangıç değerleri, composable'lar):
 * store etkinse onun değeri, değilse varsayılan. Değer ÇAĞRI anındaki değerdir (açılışta alındığı için
 * ilk ekran açılırken güncel yapılandırmadır).
 */
export function currentPublicConfig(): PublicConfigValues {
  try {
    return usePublicConfigStore().values
  } catch {
    return { ...PUBLIC_CONFIG_DEFAULTS }
  }
}
