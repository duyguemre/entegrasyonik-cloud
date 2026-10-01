/**
 * frontend/src/stores/notificationPreferences.ts
 *
 * C2b (ADR-0029 Karar 4-5, NOTIFICATION_PLAN §2.3 + F-N2) — kişisel bildirim tercihleri: kategori × kanal
 * (uygulama içi açık/kapalı, e-posta kapalı/anında/özet), özet zamanı, sessiz saatler, e-posta dili.
 *
 * SÖZLEŞME (backend `NotificationService`, ADR-0029 NB4; rpc-input `strict` — bilinmeyen alan 400):
 *   getPreferences    {}  → { result, data: { locale, matrix: { <cat>: { inApp?, email?: 'off'|'instant'|'digest', push? } },
 *                                           digest: { cadence: 'daily'|'hourly', hourLocal } | null,
 *                                           quietHours: { start, end, tz } | null },
 *                             tenantDefaults: { …aynı şekil }, locks: [{ category, locked, catalogDefault: { inApp, email, push } }] }
 *   updatePreferences { matrix, digest, quietHours (null = kapalı), locale }
 * E-posta modu sınırda eşlenir (`instant/digest` ↔ `inst/dig`). Kilitli (tümü zorunlu) kategoride yalnız `push` gönderilir
 * (uygulama içi/e-posta kapatılamaz; push tamamlayıcı kanaldır — MOB-04). Eski biçim (`categories`, `frequency/hour`,
 * `quietHours.enabled`) savunmacı olarak okunmaya devam eder.
 */
import useRestApi from '@/composables/restapi'
import logger from '@/composables/logger'
import { apiCode, isApiError } from '@/composables/apiErrors'
import { EMAIL_MODES, NOTIFICATION_CATEGORIES, type EmailMode, type NotificationCategory } from '@/types/NotificationTypes'
import { CATEGORY_DEFAULTS, fromWireEmail, toWireEmail, type CategoryMeta } from '@/stores/notificationCatalog'

export interface CategoryPreference {
  inApp: boolean
  email: EmailMode
  /** MOB-04: bu kategoride telefon/tarayıcı anlık bildirimi (cihaz aboneliği ayrıca gerekir). */
  push: boolean
}

/** Sessiz saatlerin saat dilimi (ürün Türkiye odaklı; özet saati ile aynı). */
export const PREFS_TZ = 'Europe/Istanbul'

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
    cats[key] = { inApp: d.inApp, email: d.email, push: d.push }
  }
  return { categories: cats, digest: { ...DEFAULT_DIGEST }, quietHours: { ...DEFAULT_QUIET_HOURS }, locale: 'tr' }
}

/**
 * Sunucu yanıtı → tercih: varsayılan ← kategori kilit tablosu (`locks[].catalogDefault`) ← mağaza varsayılanı
 * (`tenantDefaults`) ← kendi tercihim. Tümü zorunlu (kilitli) kategoride uygulama içi/e-posta varsayılanında kalır.
 */
export function normalizePreferences(raw: any, categories?: readonly CategoryMeta[]): NotificationPreferences {
  const out = defaultPreferences(categories)
  const data = raw?.data ?? raw
  if (!data || typeof data !== 'object') return out
  const locked = new Set((categories ?? []).filter((c) => c.locked).map((c) => c.key))
  for (const lock of Array.isArray(raw?.locks) ? raw.locks : []) {
    if (lock && (NOTIFICATION_CATEGORIES as readonly string[]).includes(lock.category) && typeof lock.catalogDefault?.push === 'boolean') {
      out.categories[lock.category as NotificationCategory].push = lock.catalogDefault.push
    }
  }
  const apply = (src: any) => {
    const matrix = src?.matrix && typeof src.matrix === 'object' ? src.matrix : src?.categories && typeof src.categories === 'object' ? src.categories : {}
    for (const key of NOTIFICATION_CATEGORIES) {
      const row = matrix[key]
      if (!row || typeof row !== 'object') continue
      if (typeof row.push === 'boolean') out.categories[key].push = row.push
      if (locked.has(key)) continue
      if (typeof row.inApp === 'boolean') out.categories[key].inApp = row.inApp
      const email = fromWireEmail(row.email) ?? ((EMAIL_MODES as readonly string[]).includes(row.email) ? (row.email as EmailMode) : undefined)
      if (email) out.categories[key].email = email
    }
    const digest = src?.digest
    if (digest && typeof digest === 'object') {
      const cadence = digest.cadence ?? digest.frequency
      const hour = digest.hourLocal ?? digest.hour
      if (cadence === 'daily' || cadence === 'hourly') out.digest.frequency = cadence
      if (Number.isInteger(hour) && hour >= 0 && hour <= 23) out.digest.hour = hour
    }
    const quiet = src?.quietHours
    if (quiet === null) out.quietHours.enabled = false
    else if (quiet && typeof quiet === 'object') {
      out.quietHours.enabled = quiet.enabled === undefined ? true : quiet.enabled === true
      if (isValidTime(quiet.start)) out.quietHours.start = quiet.start
      if (isValidTime(quiet.end)) out.quietHours.end = quiet.end
    }
    if (src?.locale === 'en' || src?.locale === 'tr') out.locale = src.locale
  }
  if (raw?.tenantDefaults && typeof raw.tenantDefaults === 'object') apply(raw.tenantDefaults)
  apply(data)
  return out
}

/** Kayıt gövdesi (backend şekli): kilitli kategoride yalnız `push`; e-posta modu backend adıyla. */
export function preferencesBody(prefs: NotificationPreferences, categories?: readonly CategoryMeta[]) {
  const locked = new Set((categories ?? []).filter((c) => c.locked).map((c) => c.key))
  const matrix: Partial<Record<NotificationCategory, { inApp?: boolean; email?: 'off' | 'instant' | 'digest'; push: boolean }>> = {}
  for (const key of NOTIFICATION_CATEGORIES) {
    const c = prefs.categories[key]
    matrix[key] = locked.has(key) ? { push: c.push } : { inApp: c.inApp, email: toWireEmail(c.email), push: c.push }
  }
  const q = prefs.quietHours
  return {
    matrix,
    digest: { cadence: prefs.digest.frequency, hourLocal: prefs.digest.hour },
    quietHours: q.enabled ? { start: q.start, end: q.end, tz: PREFS_TZ } : null,
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
