/**
 * Hata kodu → kısa açıklama + ton. Metinler backend `platform/core/errors/codes.ts` (ERROR_CODES.md) iletileridir —
 * önyüz yeni metin uydurmaz; katalogda olmayan kod olduğu gibi gösterilir.
 */
import type { StatusTone } from '@entegrasyonik/ui/components'

export const ERROR_CODE_TEXT: Record<string, { text: string; tone: StatusTone }> = {
  UNAVAILABLE: { text: 'Dış servis geçici olarak kullanılamıyor.', tone: 'warning' },
  RATE_LIMITED: { text: 'Çok fazla istek. Lütfen biraz bekleyin.', tone: 'warning' },
  AUTH: { text: 'Pazaryeri kimlik bilgisi geçersiz.', tone: 'danger' },
  UNKNOWN_OUTCOME: { text: 'İşlemin sonucu doğrulanamadı.', tone: 'danger' },
  VALIDATION: { text: 'Geçersiz istek.', tone: 'info' },
  NOT_FOUND: { text: 'Kayıt bulunamadı.', tone: 'neutral' },
  NOT_SUPPORTED: { text: 'Bu işlem bu entegrasyonda desteklenmiyor.', tone: 'neutral' },
  INTERNAL: { text: 'Beklenmeyen bir hata oluştu.', tone: 'danger' },
  UNKNOWN: { text: 'Kod bildirilmedi.', tone: 'neutral' },
}

export function codeInfo(code: string | null | undefined) {
  if (!code) return { text: 'Kod bildirilmedi.', tone: 'neutral' as StatusTone }
  return ERROR_CODE_TEXT[code] ?? { text: code, tone: 'neutral' as StatusTone }
}
