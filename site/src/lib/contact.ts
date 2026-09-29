/**
 * İletişim e-posta adresi (ADR-0014 Karar 2: `/iletisim` = `mailto:`; form YOK, backend YOK).
 *
 * Kaynak: `PUBLIC_CONTACT_EMAIL` ortam değişkeni (site `.env` okumaz; kabuktan verilir). Adres insan kararıdır
 * (Açık Soru 4); verilmezse `{{İLETİŞİM_E_POSTA}}` YER TUTUCUSU gösterilir ve `mailto` bağlantısı ÜRETİLMEZ
 * (geçersiz bağlantı yerine dürüst yer tutucu). Biçimsiz değer fail-fast hata verir.
 */
export const CONTACT_EMAIL_PLACEHOLDER = '{{İLETİŞİM_E_POSTA}}'

const EMAIL = /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]+$/

export function resolveContactEmail(env: Record<string, string | undefined>): string | undefined {
  const raw = env.PUBLIC_CONTACT_EMAIL?.trim()
  if (!raw) return undefined
  if (!EMAIL.test(raw)) throw new Error('PUBLIC_CONTACT_EMAIL geçerli bir e-posta adresi olmalı.')
  return raw
}

/** `mailto:adres?subject=...` — konu yalnızca ön doldurmadır; yanıt süresi/taahhüt içermez. */
export function mailtoHref(email: string, subject?: string): string {
  return subject ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : `mailto:${email}`
}

export const contactEmail: string | undefined = resolveContactEmail(process.env)
