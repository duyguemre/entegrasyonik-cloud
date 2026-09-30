/**
 * Şirket / künye bilgileri — TEK KAYNAK (S16). İletişim sayfası, Footer ve yasal metinlerdeki çözülmüş yer
 * tutucular (`src/data/legal/placeholders.ts` → `placeholderValues`) bu dosyadan okur.
 *
 * Kural: yalnızca işletmenin VERDİĞİ değer yazılır (Protokol 12). Boş dize = "henüz verilmedi": ilgili satır
 * zarifçe GİZLENİR (ham `{{…}}` görünmez); değer girildiğinde iletişim + künye + footer'da kendiliğinden görünür.
 *
 * - `email`: genel iletişim adresi (kullanıcı kararı, 2026-09-30). `PUBLIC_CONTACT_EMAIL` env'i verilirse o
 *   kullanılır (src/lib/contact.ts), verilmezse bu varsayılan.
 * - `address`: tebligata elverişli açık adres — HENÜZ VERİLMEDİ. Doldurmak için yalnızca bu alanı düzenleyin.
 * - `phone`: iletişim telefonu — HENÜZ VERİLMEDİ.
 */
export interface Company {
  email: string
  address: string
  phone: string
}

export const company: Company = {
  email: 'bilgi@entegrasyonik.com.tr',
  address: '',
  phone: '',
}

/** Değer girilmiş mi (boşluklar yok sayılır). */
export const hasValue = (v: string | undefined): v is string => !!v && v.trim().length > 0
