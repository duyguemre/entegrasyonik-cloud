/**
 * frontend/src/components/settings/settingsValidation.ts
 *
 * FE R4 C1 (K61) — uygulama ayarları alan doğrulaması (SAF; `tests/fe-r4c-settings-validation.test.ts`).
 * Yalnız BİÇİM denetlenir; boş alan her zaman geçerlidir (API'de zorunlu alan yok — boşta platform varsayılanı geçerli).
 * Mesaj biçimi premium-ui-standards: "<ne oldu> — <ne yapmalı>". Kayıt gövdesi DEĞİŞMEZ; geçersiz alan varken
 * kaydetme isteği gönderilmez, ilk hatalı alana gidilir.
 */

export type SettingsLike = Record<string, any>

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/** T.C. Kimlik No: 11 hane, ilk hane 0 değil, iki denetim hanesi tutarlı. */
export function isValidTckn(value: unknown): boolean {
  const s = String(value ?? '').trim()
  if (!/^[1-9]\d{10}$/.test(s)) return false
  const d = s.split('').map(Number)
  const odd = d[0] + d[2] + d[4] + d[6] + d[8]
  const even = d[1] + d[3] + d[5] + d[7]
  const d10 = (((odd * 7 - even) % 10) + 10) % 10
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10
  return d[9] === d10 && d[10] === d11
}

export const isValidEmail = (v: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v ?? '').trim())

/** Telefon: yalnız rakam, boşluk, +, (, ), - ; 10–13 rakam. */
export const isValidPhone = (v: unknown) => {
  const s = String(v ?? '').trim()
  return /^[\d\s+()-]+$/.test(s) && digits(s).length >= 10 && digits(s).length <= 13
}

export const isValidHexColor = (v: unknown) => /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(v ?? '').trim())
export const isValidHttpUrl = (v: unknown) => /^https?:\/\/[^\s]+\.[^\s]+/i.test(String(v ?? '').trim())

const asNumber = (v: unknown) => (typeof v === 'number' ? v : Number(String(v).replace(',', '.')))

function nonNegative(v: unknown, opts: { integer?: boolean; max?: number; unit: string }): string | null {
  const n = asNumber(v)
  if (!Number.isFinite(n) || n < 0) return `Geçersiz değer — 0 veya daha büyük bir ${opts.unit} girin.`
  if (opts.integer && !Number.isInteger(n)) return `Küsuratlı değer kabul edilmez — tam sayı girin.`
  if (opts.max !== undefined && n > opts.max) return `Değer çok yüksek — en fazla ${opts.max} girin.`
  return null
}

export interface ValidationContext {
  /** Logo bağlantı (URL) modunda mı? Yüklenen logonun adresi doğrulanmaz. */
  useLogoUrl?: boolean
}

/** Ayar anahtarı (SettingListView `ROWS`) → doğrulayıcı. `null` = geçerli. */
const RULES: Record<string, (s: SettingsLike, ctx: ValidationContext) => string | null> = {
  brandColor: (s) => (isBlank(s.brandColor) || isValidHexColor(s.brandColor) ? null : 'Renk kodu tanınmadı — #RRGGBB biçiminde girin (ör. #2E55D4).'),
  logo: (s, ctx) => (!ctx.useLogoUrl || isBlank(s.logo) || isValidHttpUrl(s.logo) ? null : 'Bağlantı geçerli değil — https:// ile başlayan bir görsel adresi yapıştırın.'),
  tckn: (s) => (isBlank(s.invoice?.tckn) || isValidTckn(s.invoice?.tckn) ? null : 'T.C. Kimlik No geçerli değil — 11 haneli numarayı kontrol edin.'),
  invoicePhone: (s) => (isBlank(s.invoice?.phone) || isValidPhone(s.invoice?.phone) ? null : 'Telefon numarası eksik ya da hatalı — alan koduyla 10–13 rakam girin.'),
  taxNumber: (s) => {
    if (s.invoice?.type !== 1 || isBlank(s.invoice?.taxNumber)) return null
    return /^\d{10,11}$/.test(String(s.invoice.taxNumber).trim()) ? null : 'Vergi numarası 10 haneli olmalı (şahıs şirketinde 11 haneli T.C. Kimlik No) — yalnız rakam girin.'
  },
  mersisNo: (s) => {
    if (s.invoice?.type !== 1 || isBlank(s.mersisNo)) return null
    return /^\d{16}$/.test(String(s.mersisNo).trim()) ? null : 'MERSIS numarası 16 haneli olmalı — yalnız rakam girin.'
  },
  shippingDuration: (s) => (isBlank(s.shippingDuration) ? null : nonNegative(s.shippingDuration, { integer: true, max: 365, unit: 'gün' })),
  desi: (s) => (isBlank(s.desi) ? null : nonNegative(s.desi, { unit: 'desi' })),
  warranty: (s) => (isBlank(s.warranty) ? null : nonNegative(s.warranty, { integer: true, max: 600, unit: 'ay' })),
  maxPurchaseQuantity: (s) => (isBlank(s.maxPurchaseQuantity) ? null : nonNegative(s.maxPurchaseQuantity, { integer: true, unit: 'adet' })),
  workingDays: (s) => (Array.isArray(s.workingDays) && s.workingDays.length === 0 ? 'Hiç çalışma günü seçilmedi — en az bir gün işaretleyin.' : null),
  alertEmail: (s) => (isBlank(s.alertEmail) || isValidEmail(s.alertEmail) ? null : 'E-posta adresi geçerli değil — ad@alanadi.com biçiminde girin.'),
  supportPhone: (s) => (isBlank(s.supportPhone) || isValidPhone(s.supportPhone) ? null : 'Telefon numarası eksik ya da hatalı — alan koduyla 10–13 rakam girin.'),
}

/** Tüm hatalar: anahtar → mesaj (yalnız hatalı alanlar). */
export function validateSettings(settings: SettingsLike | null | undefined, ctx: ValidationContext = {}): Record<string, string> {
  const out: Record<string, string> = {}
  if (!settings) return out
  for (const [key, rule] of Object.entries(RULES)) {
    const msg = rule(settings, ctx)
    if (msg) out[key] = msg
  }
  return out
}
