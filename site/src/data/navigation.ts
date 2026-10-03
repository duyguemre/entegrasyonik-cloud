/**
 * Site gezinme haritası (ADR-0014 Karar 2). `published: false` olan öğeler render EDİLMEZ —
 * sayfa yazıldığında (S2b/S5) yalnızca bayrak çevrilir; böylece S0'da kırık bağlantı üretilmez.
 * Bu dosya iddia içermez (yalnızca yol + etiket).
 */
import { AGENT_BRAND, AGENT_DESCRIPTOR, AGENT_PATH } from './agent-brand'
/**
 * S23 (SR2-NAV): üst bar gruplanmış menüdür — Ürün / Çözümler / Kaynaklar açılır paneldir, Fiyatlar doğrudan
 * bağlantıdır. `primaryNav` DÜZ liste olarak kalır (yayım bayrağı, kırık bağlantı ve rozet testleri bu listeyi okur).
 *
 * S25 (seçkin menü): menünün TÜM içeriği bu dosyadadır — her öğe panelde nerede durduğunu (`slot`) bilir:
 *  - `card`    : ikon + başlık + tek satır fayda (varsayılan)
 *  - `feature` : panelin sağındaki öne çıkan kart (Ürün → ajan ürünü)
 *  - `strip`   : panel tabanındaki alt şerit bağlantısı ("Tüm özellikler" gibi; `cta` metniyle)
 * Çözüm satırları (`solutionNav`) kanal türünü (`channels`) taşır; rozetler entegrasyon kaydından türetilir.
 * Grup başlığı, alt şerit cümlesi ve öne çıkan kartın türü `navGroups`'ta. Olgu/sayı YAZILMAZ: deneme süresi, kanal
 * adları ve rehber başlığı `nav-menu.ts`'te kayıtlardan gelir. Bu metinler tests/claims.test.ts taramasındadır.
 */
export type NavGroupId = 'product' | 'solutions' | 'resources'

export type NavSlot = 'card' | 'feature' | 'strip'

export interface NavItem {
  label: string
  href: string
  published: boolean
  /** Küçük vurgu rozeti (ör. "Yeni") — yalnızca metin; iddia taşımaz. */
  badge?: string
  /** Menü grubu; verilmezse üst barda doğrudan bağlantıdır (ör. Fiyatlar). */
  group?: NavGroupId
  /** Açılır paneldeki tek satırlık fayda açıklaması (reklam dili; olgusal sayı yok). */
  description?: string
  /** Paneldeki ikon adı (`components/home/Icon.astro`). */
  icon?: NavIcon
  /** Paneldeki yeri (verilmezse `card`). */
  slot?: NavSlot
  /** Alt şeritte görünen bağlantı metni (`slot: 'strip'`). */
  cta?: string
  /** Çözüm satırı: bu türdeki mevcut kanalların rozetleri satırda listelenir. */
  channels?: 'marketplace' | 'ecommerce' | 'erp'
}

export type NavIcon = 'layers' | 'plug' | 'sparkle' | 'shield' | 'book' | 'help' | 'chat' | 'mail' | 'stock' | 'orders' | 'returns' | 'finance' | 'receipt' | 'search' | 'link'

/** Öne çıkan kartın türü: ajan ürünü / ücretsiz deneme / öne çıkan rehber. İçerik `nav-menu.ts`'te kayıttan. */
export type NavFeatureKind = 'agent' | 'trial' | 'guide'

export interface NavGroup {
  id: NavGroupId
  label: string
  /** Panel başlığı: grubun tek cümlelik vaadi (görsel başlık; erişilebilir ad düğme metnidir). */
  lead: string
  /** Alt şeridin sol cümlesi (sağında grubun `strip` bağlantıları). */
  strip: string
  feature: NavFeatureKind
}

export const navGroups: NavGroup[] = [
  { id: 'product', label: 'Ürün', lead: 'Tek panelden bütün operasyon', strip: 'Tek stok, tek panel: bütün kanallarınız aynı merkezde.', feature: 'agent' },
  { id: 'solutions', label: 'Çözümler', lead: 'Nerede satıyorsanız, orada', strip: 'Kanallarınızı dakikalar içinde bağlayın, hepsini tek yerden yönetin.', feature: 'trial' },
  { id: 'resources', label: 'Kaynaklar', lead: 'Öğrenin, sorun, hızla ilerleyin', strip: 'Aradığınızı bulamadınız mı? Ekibimiz yardıma hazır.', feature: 'guide' },
]

/**
 * Öne çıkan kartların SABİT kopyası (sayı yok). Değişken kısım (deneme günü, ajan vaadi, rehber başlığı) kayıttan
 * `nav-menu.ts`'te eklenir.
 */
export const navFeatureCopy: Record<NavFeatureKind, { eyebrow: string; title?: string; text?: string; cta: string; points?: string[] }> = {
  agent: { eyebrow: AGENT_DESCRIPTOR, cta: 'Nasıl çalıştığını görün' },
  trial: {
    eyebrow: 'Ücretsiz deneme',
    title: 'Kurulum bugün, fark ilk siparişte',
    text: 'Üç adımda hazırsınız:',
    points: ['Kanallarınızı bağlayın', 'Ürünlerinizi eşleyin', 'Siparişleri tek panelden yönetin'],
    cta: 'Ücretsiz deneyin',
  },
  guide: { eyebrow: 'Öne çıkan rehber', cta: 'Rehberi okuyun' },
}

/** Kaynaklar panelinde öne çıkan rehberin adresi (bilgi merkezi kaydında yoksa ilk rehber kullanılır). */
export const FEATURED_GUIDE_SLUG = 'karsilastirma/tek-stokla-cok-kanal-yonetimi'

export const primaryNav: NavItem[] = [
  { label: 'Özellikler', href: '/ozellikler', published: true, group: 'product', slot: 'strip', cta: 'Tüm özellikler', icon: 'layers', description: 'Stok, sipariş, iade ve mesajlar tek panelde' }, // S2b
  { label: 'Entegrasyonlar', href: '/entegrasyonlar', published: true, group: 'solutions', slot: 'strip', cta: 'Tüm entegrasyonlar', icon: 'plug', description: 'Bağlanabilen kanallar ve kapsamları' }, // S2b → S25 Çözümler şeridi
  { label: AGENT_BRAND, href: AGENT_PATH, published: true, badge: 'Yeni', group: 'product', slot: 'feature', icon: 'sparkle' }, // S18 → S22: etiket ve hedef ad sabitinden (src/data/agent-brand.ts); S25 öne çıkan kart
  { label: 'Güvenlik', href: '/guvenlik', published: true, group: 'product', icon: 'shield', description: 'Verileriniz şifreli, erişim rol rol sizin elinizde' }, // S2b
  { label: 'Mobil uygulama', href: '/mobil-uygulama', published: true, group: 'product', slot: 'strip', cta: 'Android uygulaması' }, // APK-DL: Ürün şeridi + footer + mobil çekmece
  { label: 'Fiyatlar', href: '/fiyatlandirma', published: true }, // S4b — üst barda doğrudan bağlantı (S24: kısa etiket "Fiyatlar")
  { label: 'Rehber', href: '/rehber', published: true, group: 'resources', icon: 'book', description: 'Pazaryeri, mevzuat ve operasyon rehberleri' }, // S20 (bilgi merkezi — src/data/kb/**)
  { label: 'SSS', href: '/sss', published: true, group: 'resources', icon: 'help', description: 'Merak edilenlere net yanıtlar' }, // S2b
  { label: 'Destek', href: '/destek', published: true, group: 'resources', icon: 'chat', description: 'Kurulumdan kanal bağlantısına yardım' }, // S14
  { label: 'Sözlük', href: '/rehber/sozluk', published: true, group: 'resources', slot: 'strip', cta: 'Terimler sözlüğü' }, // S20 sözlük → S25 Kaynaklar şeridi
  { label: 'İletişim', href: '/iletisim', published: true, group: 'resources', icon: 'mail', description: 'Ekibimize yazın, size dönelim' }, // S2b
]

/**
 * Ürün paneli yetenek kartları (S14 derin sayfa + S25 /ozellikler çapaları). Ürün grubunda Güvenlik'ten önce gelir.
 */
export const featureNav: NavItem[] = [
  { label: 'Katalog yönetimi', href: '/ozellikler#multi-channel-products', published: true, group: 'product', icon: 'layers', description: 'Ürün, fiyat ve stoğu bir kez girin, her kanala yayın' }, // S25
  { label: 'Stok senkronu', href: '/ozellikler/stok-rezervasyonu', published: true, group: 'product', icon: 'stock', description: 'Eşzamanlı siparişte stok ayrılır, aşırı satış durur' }, // S14 → S25 Ürün
  { label: 'Sipariş ve iade', href: '/ozellikler#unified-orders', published: true, group: 'product', icon: 'orders', description: 'Bütün kanalların siparişi ve iadesi tek akışta' }, // S25
]

/** Çözümler paneli: satış kanalı türüne göre satırlar (her satırda o türün kanal rozetleri). */
export const solutionNav: NavItem[] = [
  { label: 'Pazaryerleri', href: '/entegrasyonlar?tur=marketplace#katalog', published: true, group: 'solutions', icon: 'plug', channels: 'marketplace', description: 'Bütün mağazalarınız tek stokla, tek ekranda' }, // S25
  { label: 'E-ticaret siteniz', href: '/entegrasyonlar?tur=ecommerce#katalog', published: true, group: 'solutions', icon: 'link', channels: 'ecommerce', description: 'Kendi sitenizi pazaryerleriyle aynı panelde yönetin' }, // S25
  { label: 'ERP ve muhasebe', href: '/entegrasyonlar?tur=erp#katalog', published: true, group: 'solutions', icon: 'receipt', channels: 'erp', description: 'Muhasebenizdeki ürün ve siparişleri panele taşıyın' }, // S25
]

const ORDER: NavItem[] = [...featureNav, ...solutionNav]

/** Grubun yayımlanmış öğeleri (sıra: yetenek/çözüm kartları, sonra `primaryNav` sırası). */
export const navItemsOf = (group: NavGroupId): NavItem[] =>
  published([...ORDER, ...primaryNav]).filter((i) => i.group === group)

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
