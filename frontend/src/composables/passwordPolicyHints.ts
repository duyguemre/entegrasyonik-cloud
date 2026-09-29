/**
 * frontend/src/composables/passwordPolicyHints.ts
 *
 * ADR-0015 B4-P0 (N1) — yeni parola alanının altındaki canlı ipucu listesi. Kurallar
 * `docs/API_ACCOUNT_LIFECYCLE.md` "Parola politikası" bölümünün YALNIZCA istemcide güvenle
 * denetlenebilen kısmıdır (uzunluk, karakter sınıfı, 72 bayt). Kara liste, tekrar/ardışık ve
 * "ad/e-posta içeremez" kuralları sunucudadır; nihai karar HER ZAMAN sunucunun `WEAK_PASSWORD`
 * yanıtıdır (mesajı olduğu gibi gösterilir). Bu dosya sunucu politikasının YERİNE GEÇMEZ.
 */

export interface PasswordHint {
  id: 'length' | 'classes' | 'bytes'
  /** i18n anahtarı (`accountSecurity.password.hints.<id>`). */
  labelKey: string
  met: boolean
}

/** Küçük/büyük harf, rakam, sembol — kaç farklı sınıf kullanılmış. */
export function countCharacterClasses(value: string): number {
  let n = 0
  if (/\p{Ll}/u.test(value)) n++
  if (/\p{Lu}/u.test(value)) n++
  if (/\p{Nd}/u.test(value)) n++
  if (/[^\p{L}\p{Nd}\s]/u.test(value)) n++
  return n
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

export function passwordHints(value: string): PasswordHint[] {
  const length = [...value].length
  return [
    { id: 'length', labelKey: 'accountSecurity.password.hints.length', met: length >= 10 },
    {
      id: 'classes',
      labelKey: 'accountSecurity.password.hints.classes',
      met: length >= 16 || countCharacterClasses(value) >= 3,
    },
    { id: 'bytes', labelKey: 'accountSecurity.password.hints.bytes', met: value.length > 0 && utf8ByteLength(value) <= 72 },
  ]
}

/** Tüm istemci ipuçları sağlanıyor mu (gönder düğmesini etkinleştirmek için DEĞİL, erken uyarı için). */
export function passwordHintsMet(value: string): boolean {
  return passwordHints(value).every((h) => h.met)
}
