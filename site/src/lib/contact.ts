/**
 * İletişim e-posta adresi (ADR-0014 Karar 2: `/iletisim` = `mailto:`; form YOK, backend YOK).
 *
 * Kaynak: `PUBLIC_CONTACT_EMAIL` ortam değişkeni (site `.env` okumaz; kabuktan verilir). Verilmezse (veya boşsa)
 * şirket kaydındaki genel adres (`src/data/company.ts` → `bilgi@entegrasyonik.com.tr`, S16 kullanıcı kararı)
 * kullanılır — böylece `mailto` düğmeleri her derlemede üretilir. Biçimsiz değer fail-fast hata verir.
 *
 * S16 kök neden notu: önceden env boşken adres `undefined` dönüyor ve `/iletisim`'deki "Bize yazın" mailto
 * düğmeleri HİÇ render edilmiyordu (yalnızca yer tutucu görünüyordu).
 */
import { company } from '../data/company'

export const DEFAULT_CONTACT_EMAIL = company.email

const EMAIL = /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]+$/

export function isEmail(value: string): boolean {
  return EMAIL.test(value)
}

export function resolveContactEmail(env: Record<string, string | undefined>): string {
  const raw = env.PUBLIC_CONTACT_EMAIL?.trim() || DEFAULT_CONTACT_EMAIL
  if (!EMAIL.test(raw)) throw new Error('PUBLIC_CONTACT_EMAIL geçerli bir e-posta adresi olmalı.')
  return raw
}

/** `mailto:adres?subject=...` — konu yalnızca ön doldurmadır; yanıt süresi/taahhüt içermez. */
export function mailtoHref(email: string, subject?: string): string {
  return subject ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : `mailto:${email}`
}

export const contactEmail: string = resolveContactEmail(process.env)
