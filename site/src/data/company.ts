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
 * - `legalName` / `mersisNo`: ticari unvan ve MERSİS numarası — HENÜZ VERİLMEDİ (yasal metinlerde
 *   `{{ŞİRKET_UNVANI}}` / `{{MERSİS_NO}}` yer tutucuları ayrıca durur).
 */
export interface Company {
  email: string
  address: string
  phone: string
  legalName: string
  mersisNo: string
}

export const company: Company = {
  email: 'bilgi@entegrasyonik.com.tr',
  address: 'Levent Mah. Entegrasyon Sk. No:1, 34330 Beşiktaş / İstanbul',
  phone: '+90 (850) 000 00 00',
  legalName: 'Entegrasyonik Yazılım Teknolojileri',
  mersisNo: '0123456789000017',
}

/**
 * ÖRNEK (MOCK) DEĞERLER — 2026-09-30 kullanıcı kararı: sayfalar boş görünmesin diye adres, telefon, unvan ve
 * MERSİS örnek değerlerle dolduruldu. YAYIN ÖNCESİ işletmenin gerçek değerleriyle değiştirilip bu bayrak
 * `false` yapılmalıdır (e-posta gerçek değerdir).
 */
export const COMPANY_SAMPLE_VALUES = true

/** Değer girilmiş mi (boşluklar yok sayılır). */
export const hasValue = (v: string | undefined): v is string => !!v && v.trim().length > 0
