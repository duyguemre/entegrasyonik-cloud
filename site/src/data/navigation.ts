/**
 * Site gezinme haritası (ADR-0014 Karar 2). `published: false` olan öğeler render EDİLMEZ —
 * sayfa yazıldığında (S2b/S5) yalnızca bayrak çevrilir; böylece S0'da kırık bağlantı üretilmez.
 * Bu dosya iddia içermez (yalnızca yol + etiket).
 */
export interface NavItem {
  label: string
  href: string
  published: boolean
  /** Küçük vurgu rozeti (ör. "Yeni") — yalnızca metin; iddia taşımaz. */
  badge?: string
}

export const primaryNav: NavItem[] = [
  { label: 'Özellikler', href: '/ozellikler', published: true }, // S2b
  { label: 'Entegrasyonlar', href: '/entegrasyonlar', published: true }, // S2b
  { label: 'Asistan', href: '/asistan', published: true, badge: 'Yeni' }, // S18 (UPCOMING yüzeyi — src/data/assistant.ts)
  { label: 'Fiyatlandırma', href: '/fiyatlandirma', published: true }, // S4b
  { label: 'Güvenlik', href: '/guvenlik', published: true }, // S2b
  { label: 'SSS', href: '/sss', published: true }, // S2b
  { label: 'Destek', href: '/destek', published: true }, // S14
  { label: 'İletişim', href: '/iletisim', published: true }, // S2b
]

/** Özellik derin sayfaları (S14): footer "Ürün" sütununa eklenir; ana gezinmede yer almaz. */
export const featureNav: NavItem[] = [
  { label: 'Stok rezervasyonu', href: '/ozellikler/stok-rezervasyonu', published: true }, // S14
]

/** Yasal sayfalar (Karar 5) — S5: 8 sayfa yazıldı (TASLAK, hukuki inceleme bekliyor; içerik src/data/legal/*). */
export const legalNav: NavItem[] = [
  { label: 'KVKK Aydınlatma Metni', href: '/yasal/kvkk-aydinlatma', published: true },
  { label: 'Gizlilik Politikası', href: '/yasal/gizlilik', published: true },
  { label: 'Çerez Politikası', href: '/yasal/cerez', published: true },
  { label: 'Kullanım Koşulları', href: '/yasal/kullanim-kosullari', published: true },
  { label: 'Abonelik Sözleşmesi', href: '/yasal/abonelik-sozlesmesi', published: true },
  { label: 'Ön Bilgilendirme Formu', href: '/yasal/on-bilgilendirme', published: true },
  { label: 'İptal ve İade Koşulları', href: '/yasal/iptal-iade', published: true },
  { label: 'Künye', href: '/yasal/kunye', published: true },
]

export const published = (items: NavItem[]): NavItem[] => items.filter((i) => i.published)
