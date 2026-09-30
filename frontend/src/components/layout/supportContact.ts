/**
 * frontend/src/components/layout/supportContact.ts
 *
 * FE-CFG-2 — yardım menüsündeki "Destek iletişimi" grubu (saf; vitest). Değerler backoffice ayarı
 * `support.email` / `support.phone` (public-config). Boş olan öğe hiç render edilmez; ikisi de boşsa grup yok.
 */
import type { EkMenuGroup } from '@/components/ds/EkMenuPanel.vue'

export function supportContactGroups(email: string, phone: string): EkMenuGroup[] {
  const items = [
    ...(email ? [{ key: 'support-email', label: 'E-posta ile yazın', description: email, icon: 'mdi-email-outline' }] : []),
    ...(phone ? [{ key: 'support-phone', label: 'Telefonla arayın', description: phone, icon: 'mdi-phone-outline' }] : []),
  ]
  return items.length ? [{ label: 'Destek iletişimi', items }] : []
}

/** `mailto:` / `tel:` bağlantısı (tel'de boşluk/parantez/tire atılır). Bilinmeyen anahtar ya da boş değer → `undefined`. */
export function supportContactHref(key: string, email: string, phone: string): string | undefined {
  if (key === 'support-email' && email) return `mailto:${email}`
  if (key === 'support-phone' && phone) return `tel:${phone.replace(/[^\d+]/g, '')}`
  return undefined
}
