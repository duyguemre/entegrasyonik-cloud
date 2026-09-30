/**
 * frontend/src/stores/notificationPreferences.ts
 *
 * C2b (ADR-0029 Karar 4-5, NOTIFICATION_PLAN §2.3 + F-N2) — kişisel bildirim tercihleri: kategori × kanal
 * (uygulama içi açık/kapalı, e-posta kapalı/anında/özet), özet zamanı, sessiz saatler, e-posta dili.
 *
 * SÖZLEŞME NOTU: NB4 `getPreferences` / `updatePreferences` RPC'lerinin gövde şekli sözleşme kopyasında
 * (docs/cloud-contracts) YAZILI DEĞİL. Aşağıdaki biçim plan §2.3 + NB5 kabul listesinden (özet, sessiz saat)
 * türetildi ve savunmacı okunur: bilinmeyen alan yok sayılır, eksik alan varsayılana düşer. Backend kesinleşince
 * yalnız `normalizePreferences` / `preferencesBody` güncellenir.
 *
 *   getPreferences    {}  → { result, data: { categories: { <cat>: { inApp, email } }, digest: { frequency, hour },
 *                                           quietHours: { enabled, start, end }, locale } }
 *   updatePreferences { categories, digest, quietHours, locale }  (kilitli — tümü zorunlu — kategoriler GÖNDERİLMEZ)
 */
import useRestApi from '@/composables/restapi'
import logger from '@/composables/logger'
import { apiCode, isApiError } from '@/composables/apiErrors'
import { EMAIL_MODES, NOTIFICATION_CATEGORIES, type EmailMode, type NotificationCategory } from '@/types/NotificationTypes'
import { CATEGORY_DEFAULTS, type CategoryMeta } from '@/stores/notificationCatalog'

export interface CategoryPreference {
  inApp: boolean
  email: EmailMode
}

export type DigestFrequency = 'daily' | 'hourly'

export interface NotificationPreferences {
  categories: Record<NotificationCategory, CategoryPreference>
  digest: { frequency: DigestFrequency; hour: number }
  quietHours: { enabled: boolean; start: string; end: string }
  locale: 'tr' | 'en'
}

/** Plan §2.3: özet günlük 09:00 (Europe/Istanbul); kullanıcı saatlik seçebilir. */
export const DEFAULT_DIGEST = { frequency: 'daily' as DigestFrequency, hour: 9 }
export const DEFAULT_QUIET_HOURS = { enabled: false, start: '22:00', end: '08:00' }

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && HHMM.test(value)
}

export function defaultPreferences(categories?: readonly CategoryMeta[]): NotificationPreferences {
  const byKey = new Map((categories ?? []).map((c) => [c.key, c]))
  const cats = {} as Record<NotificationCategory, CategoryPreference>
  for (const key of NOTIFICATION_CATEGORIES) {
    const d = byKey.get(key)?.defaults ?? CATEGORY_DEFAULTS[key]
    cats[key] = { inApp: d.inApp, email: d.email }
  }
  return { categories: cats, digest: { ...DEFAULT_DIGEST }, quietHours: { ...DEFAULT_QUIET_HOURS }, locale: 'tr' }
}

/**
 * Sunucu yanıtı → tercih (varsayılanların üstüne). Tümü zorunlu (kilitli) kategoriler sunucu ne derse desin
 * varsayılanında kalır (kapatılamaz). Geçersiz değerler yok sayılır.
 */
export function normalizePreferences(raw: any, categories?: readonly CategoryMeta[]): NotificationPreferences {
  const out = defaultPreferences(categories)
  const data = raw?.data ?? raw
  if (!data || typeof data !== 'object') return out
  const locked = new Set((categories ?? []).filter((c) => c.locked).map((c) => c.key))
  const src = data.categories && typeof data.categories === 'object' ? data.categories : {}
  for (const key of NOTIFICATION_CATEGORIES) {
    if (locked.has(key)) continue
    const row = src[key]
    if (!row || typeof row !== 'object') continue
    if (typeof row.inApp === 'boolean') out.categories[key].inApp = row.inApp
    if ((EMAIL_MODES as readonly string[]).includes(row.email)) out.categories[key].email = row.email
  }
  const digest = data.digest
  if (digest && typeof digest === 'object') {
    if (digest.frequency === 'daily' || digest.frequency === 'hourly') out.digest.frequency = digest.frequency
    if (Number.isInteger(digest.hour) && digest.hour >= 0 && digest.hour <= 23) out.digest.hour = digest.hour
  }
  const quiet = data.quietHours
  if (quiet && typeof quiet === 'object') {
    out.quietHours.enabled = quiet.enabled === true
    if (isValidTime(quiet.start)) out.quietHours.start = quiet.start
    if (isValidTime(quiet.end)) out.quietHours.end = quiet.end
  }
  if (data.locale === 'en' || data.locale === 'tr') out.locale = data.locale
  return out
}

/** Kayıt gövdesi: kilitli kategoriler çıkarılır (sunucu zaten reddeder); derin kopya. */
export function preferencesBody(prefs: NotificationPreferences, categories?: readonly CategoryMeta[]) {
  const locked = new Set((categories ?? []).filter((c) => c.locked).map((c) => c.key))
  const cats: Partial<Record<NotificationCategory, CategoryPreference>> = {}
  for (const key of NOTIFICATION_CATEGORIES) {
    if (locked.has(key)) continue
    cats[key] = { inApp: prefs.categories[key].inApp, email: prefs.categories[key].email }
  }
  return {
    categories: cats,
    digest: { frequency: prefs.digest.frequency, hour: prefs.digest.hour },
    quietHours: { ...prefs.quietHours },
    locale: prefs.locale,
  }
}

export function samePreferences(a: NotificationPreferences, b: NotificationPreferences): boolean {
  return JSON.stringify(preferencesBody(a)) === JSON.stringify(preferencesBody(b))
}

/** Doğrulama: sessiz saat açıkken başlangıç/bitiş geçerli ve farklı olmalı. Hata iletisi ya da `null`. */
export function validatePreferences(prefs: NotificationPreferences): string | null {
  const q = prefs.quietHours
  if (q.enabled) {
    if (!isValidTime(q.start) || !isValidTime(q.end)) return 'Sessiz saatler SS:DD biçiminde olmalı.'
    if (q.start === q.end) return 'Sessiz saatlerin başlangıcı ve bitişi aynı olamaz.'
  }
  return null
}

/** Özet gönderiminde e-postası olan kategori var mı (özet ayarı yalnız o zaman anlamlı). */
export const usesDigest = (prefs: NotificationPreferences) => NOTIFICATION_CATEGORIES.some((k) => prefs.categories[k].email === 'dig')

export type SaveResult = { ok: true } | { ok: false; message: string }

const SAVE_ERRORS: Record<string, string> = {
  IMPERSONATION_READ_ONLY: 'Destek görünümünde tercihler değiştirilemez.',
  VALIDATION: 'Tercihler geçersiz — alanları kontrol edin.',
  FORBIDDEN: 'Bu tercihleri değiştirme yetkiniz yok.',
  RATE_LIMITED: 'Çok fazla istek — biraz sonra tekrar deneyin.',
}

export function useNotificationPreferencesApi() {
  const restApi = useRestApi()

  async function load(categories?: readonly CategoryMeta[]): Promise<NotificationPreferences | null> {
    try {
      const res: any = await restApi.post('NotificationService/getPreferences', {})
      if (isApiError(res) || !res?.result) return null
      return normalizePreferences(res, categories)
    } catch (error) {
      logger.error('Bildirim tercihleri alınamadı', { module: 'notificationPreferences', op: 'load', error })
      return null
    }
  }

  async function save(prefs: NotificationPreferences, categories?: readonly CategoryMeta[]): Promise<SaveResult> {
    try {
      const res: any = await restApi.post('NotificationService/updatePreferences', preferencesBody(prefs, categories))
      if (!isApiError(res) && res?.result) return { ok: true }
      const code = apiCode(res)
      return { ok: false, message: (code && SAVE_ERRORS[code]) || 'Tercihler kaydedilemedi — tekrar deneyin.' }
    } catch (error) {
      logger.error('Bildirim tercihleri kaydedilemedi', { module: 'notificationPreferences', op: 'save', error })
      return { ok: false, message: 'Tercihler kaydedilemedi — tekrar deneyin.' }
    }
  }

  return { load, save }
}
