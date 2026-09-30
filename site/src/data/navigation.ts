/**
 * Site gezinme haritası (ADR-0014 Karar 2). `published: false` olan öğeler render EDİLMEZ —
 * sayfa yazıldığında (S2b/S5) yalnızca bayrak çevrilir; böylece S0'da kırık bağlantı üretilmez.
 * Bu dosya iddia içermez (yalnızca yol + etiket).
 */
import { AGENT_BRAND, AGENT_PATH } from './agent-brand'
/**
 * S23 (SR2-NAV): üst bar gruplanmış menüdür — Ürün / Çözümler / Kaynaklar açılır paneldir, Fiyatlandırma doğrudan
 * bağlantıdır. Grup kimliği ve başlığı `navGroups`'ta; her öğe `group` ile bağlanır. `primaryNav` DÜZ liste olarak
 * kalır (yayım bayrağı, kırık bağlantı ve rozet testleri bu listeyi okur); header ve footer grupları buradan türetir.
 */
export type NavGroupId = 'product' | 'solutions' | 'resources'

export interface NavItem {
  label: string
  href: string
  published: boolean
  /** Küçük vurgu rozeti (ör. "Yeni") — yalnızca metin; iddia taşımaz. */
  badge?: string
  /** Menü grubu; verilmezse üst barda doğrudan bağlantıdır (ör. Fiyatlandırma). */
  group?: NavGroupId
  /** Açılır paneldeki tek satırlık açıklama (yalnızca yönlendirme; olgusal iddia yok). */
  description?: string
  /** Paneldeki ikon adı (`components/home/Icon.astro`). */
  icon?: NavIcon
}

export type NavIcon = 'layers' | 'plug' | 'sparkle' | 'shield' | 'book' | 'help' | 'chat' | 'mail' | 'stock' | 'orders' | 'returns'

export interface NavGroup {
  id: NavGroupId
  label: string
  /** Panelin üst satırı (erişilebilir ad değil; görsel başlık). */
  lead: string
}

export const navGroups: NavGroup[] = [
  { id: 'product', label: 'Ürün', lead: 'Platformun yetenekleri ve kanal bağlantıları' },
  { id: 'solutions', label: 'Çözümler', lead: 'İhtiyacınıza ve satış kanalınıza göre' },
  { id: 'resources', label: 'Kaynaklar', lead: 'Rehberler, yanıtlar ve destek' },
]

export const primaryNav: NavItem[] = [
  { label: 'Özellikler', href: '/ozellikler', published: true, group: 'product', icon: 'layers', description: 'Stok, sipariş, iade ve mesajlar tek panelde' }, // S2b
  { label: 'Entegrasyonlar', href: '/entegrasyonlar', published: true, group: 'product', icon: 'plug', description: 'Bağlanabilen kanallar ve kapsamları' }, // S2b
  { label: AGENT_BRAND, href: AGENT_PATH, published: true, badge: 'Yeni', group: 'product', icon: 'sparkle' }, // S18 → S22: etiket ve hedef ad sabitinden (src/data/agent-brand.ts)
  { label: 'Güvenlik', href: '/guvenlik', published: true, group: 'product', icon: 'shield', description: 'Verinizi ve anahtarlarınızı nasıl koruyoruz' }, // S2b
  { label: 'Fiyatlandırma', href: '/fiyatlandirma', published: true }, // S4b — üst barda doğrudan bağlantı
  { label: 'Rehber', href: '/rehber', published: true, group: 'resources', icon: 'book', description: 'Pazaryeri, mevzuat ve operasyon rehberleri' }, // S20 (bilgi merkezi — src/data/kb/**)
  { label: 'SSS', href: '/sss', published: true, group: 'resources', icon: 'help', description: 'Sık sorulan sorular' }, // S2b
  { label: 'Destek', href: '/destek', published: true, group: 'resources', icon: 'chat', description: 'Kurulum ve kanal bağlantı yardımı' }, // S14
  { label: 'İletişim', href: '/iletisim', published: true, group: 'resources', icon: 'mail', description: 'Bize yazın' }, // S2b
]

/** Özellik derin sayfaları (S14): "Çözümler" grubunda (header paneli + footer sütunu). */
export const featureNav: NavItem[] = [
  { label: 'Stok rezervasyonu', href: '/ozellikler/stok-rezervasyonu', published: true, group: 'solutions', icon: 'stock', description: 'Aşırı satış nasıl önlenir' }, // S14
]

/** Grubun yayımlanmış öğeleri (sıra `primaryNav` + `featureNav` sırasıdır). */
export const navItemsOf = (group: NavGroupId): NavItem[] =>
  published([...primaryNav, ...featureNav]).filter((i) => i.group === group)

/** Üst barda doğrudan (grupsuz) bağlantılar. */
export const directNav = (): NavItem[] => published(primaryNav).filter((i) => !i.group)

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
