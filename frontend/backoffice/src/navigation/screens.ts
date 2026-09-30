/**
 * TEK ekran kaydı (ADR-0026 Karar 5 — DB `menus` YOK). Menü, rota, sayfa başlığı/breadcrumb ve komut paleti
 * YALNIZ buradan beslenir; `router.ts` ve `ShellLayout.vue` ekran eklemek için DEĞİŞMEZ.
 *
 * Yeni ekran eklemek (bo-p2 ve sonrası — ayrıntı: docs/BO_UI_PATTERNS.md §1):
 *   1. İlgili `planned(...)` girdisini bulun (yoksa doğru GRUBA ekleyin).
 *   2. `status: 'ready'` (ya da uçlar taslaksa `'draft'`) yapın, `view: () => import('../views/XView.vue')` verin,
 *      `plan` alanını silin. Yol (path) DEĞİŞMEZ — yer imleri ve komut paleti bozulmaz.
 *   3. Görünüm `BoPageHeader` kullanır; başlık, açıklama ve breadcrumb bu kayıttan otomatik gelir.
 *
 * Bilgi mimarisi: 5 bölüm → 10 grup → ekranlar. Grubun tek ekranı varsa menüde yaprak, birden fazlaysa açılır grup.
 */
export type ScreenStatus = 'ready' | 'draft' | 'planned'

export type SectionKey = 'home' | 'customers' | 'platform' | 'observe' | 'govern'

export type GroupKey =
  | 'overview'
  | 'customers'
  | 'subscriptions'
  | 'engine'
  | 'integrations'
  | 'infra'
  | 'logs'
  | 'audit'
  | 'admins'
  | 'settings'

export interface BoGroup {
  key: GroupKey
  label: string
  icon: string
  section: SectionKey
}

export interface BoScreen {
  key: string
  /** Menü + sayfa başlığı (h1). */
  label: string
  /** Sayfa başlığının altındaki tek cümlelik açıklama (ne işe yarar). */
  lede: string
  icon: string
  group: GroupKey
  status: ScreenStatus
  /** Kalıcı yol: planlı ekran da bu yolda "yakında" durumuyla açılır. */
  path: string
  /** Komut paleti için ek arama sözcükleri. */
  keywords?: string[]
  view?: () => Promise<unknown>
  /** Yalnız `planned`: yakında durumunda gösterilen kapsam. */
  plan?: { items: string[]; endpoints: string }
}

/** Kayıttaki bir ekranın alt sayfası (ör. müşteri detayı): menüde görünmez, breadcrumb'da ebeveyni gösterir. */
export interface BoDetailRoute {
  name: string
  path: string
  parent: string
  title: string
  view: () => Promise<unknown>
}

export const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: 'home', label: '' },
  { key: 'customers', label: 'Müşteri ve gelir' },
  { key: 'platform', label: 'Platform' },
  { key: 'observe', label: 'Gözlem' },
  { key: 'govern', label: 'Yönetişim' },
]

export const GROUPS: BoGroup[] = [
  { key: 'overview', label: 'Genel bakış', icon: 'mdi-view-dashboard-outline', section: 'home' },
  { key: 'customers', label: 'Müşteriler', icon: 'mdi-storefront-outline', section: 'customers' },
  { key: 'subscriptions', label: 'Abonelikler', icon: 'mdi-card-account-details-outline', section: 'customers' },
  { key: 'engine', label: 'Motor ve kuyruklar', icon: 'mdi-cog-transfer-outline', section: 'platform' },
  { key: 'integrations', label: 'Entegrasyonlar', icon: 'mdi-transit-connection-variant', section: 'platform' },
  { key: 'infra', label: 'Altyapı', icon: 'mdi-server-outline', section: 'platform' },
  { key: 'logs', label: 'Loglar ve sorunlar', icon: 'mdi-pulse', section: 'observe' },
  { key: 'audit', label: 'Denetim', icon: 'mdi-shield-search', section: 'observe' },
  { key: 'admins', label: 'Yöneticiler', icon: 'mdi-account-key-outline', section: 'govern' },
  { key: 'settings', label: 'Sistem ayarları', icon: 'mdi-tune-variant', section: 'govern' },
]

type PlannedInput = Omit<BoScreen, 'status' | 'view'> & { plan: NonNullable<BoScreen['plan']> }
const planned = (s: PlannedInput): BoScreen => ({ ...s, status: 'planned' })

export const SCREENS: BoScreen[] = [
  {
    key: 'overview',
    label: 'Genel bakış',
    lede: 'Platformun anlık sağlığı: bağımlılıklar, istek sağlığı, kuyruklar ve dikkat isteyen sorunlar.',
    icon: 'mdi-view-dashboard-outline',
    group: 'overview',
    status: 'ready',
    path: '/genel-bakis',
    keywords: ['sağlık', 'pano', 'dashboard', 'health'],
    view: () => import('../views/OverviewView.vue'),
  },

  // ---------------------------------------------------------------- Müşteri
  {
    key: 'tenants',
    label: 'Müşteri listesi',
    lede: 'Mağaza hesapları ve bağlı kanallar. İş verisi (ürün, sipariş, kişisel veri) burada gösterilmez.',
    icon: 'mdi-storefront-outline',
    group: 'customers',
    status: 'ready',
    path: '/musteriler',
    keywords: ['tenant', 'mağaza', 'hesap'],
    view: () => import('../views/TenantsView.vue'),
  },
  planned({
    key: 'lifecycle',
    label: 'Yaşam döngüsü',
    lede: 'Deneme, askı ve silme bekleyen hesaplar; silmeyi geri alma ve süre uzatma.',
    icon: 'mdi-timeline-clock-outline',
    group: 'customers',
    path: '/musteriler/yasam-dongusu',
    keywords: ['deneme', 'askı', 'silme'],
    plan: {
      items: ['Duruma göre hesap kuyruğu: deneme, ödeme gecikti, askıda, silme bekliyor', 'Silmeyi geri alma ve deneme uzatma (gerekçe + kimlik doğrulama)', 'Kurulum adımları ve takılan hesaplar'],
      endpoints: 'B2 · BackofficeTenantService',
    },
  }),
  planned({
    key: 'support',
    label: 'Destek talepleri',
    lede: 'Müşteri talepleri, yazışma ve müşteri adına talep açma.',
    icon: 'mdi-lifebuoy',
    group: 'customers',
    path: '/musteriler/destek',
    keywords: ['ticket', 'talep', 'destek girişi'],
    plan: {
      items: ['Talep listesi ve yazışma', 'Müşteri adına talep açma', 'Talep okuma hassas okuma olarak denetime yazılır'],
      endpoints: 'AdminService/getTickets · Aşama 3 taşıma',
    },
  }),
  {
    key: 'subscriptions',
    label: 'Abonelikler',
    lede: 'Planlar, abonelik geçmişi ve gelir metrikleri.',
    icon: 'mdi-card-account-details-outline',
    group: 'subscriptions',
    path: '/abonelikler',
    keywords: ['plan', 'fatura', 'mrr', 'gelir', 'billing'],
    status: 'ready',
    view: () => import('../views/billing/SubscriptionsView.vue'),
  },

  // ---------------------------------------------------------------- Platform
  {
    key: 'engine',
    label: 'Motor ve kuyruklar',
    lede: 'Sipariş kuyruğu, başarısız işler, takılı kiralar ve zamanlayıcı koşuları.',
    icon: 'mdi-cog-transfer-outline',
    group: 'engine',
    path: '/motor',
    keywords: ['bullmq', 'queue', 'kuyruk', 'dlq', 'kira', 'lease', 'zamanlayıcı'],
    status: 'ready',
    view: () => import('../views/engine/EngineView.vue'),
  },
  {
    key: 'integrations',
    label: 'Entegrasyonlar',
    lede: 'Platform geneli API sağlığı, pod bazında dayanıklılık (devre kesici, hız bütçesi, alım) ve ayar kataloğu ile etkin değerler.',
    icon: 'mdi-transit-connection-variant',
    group: 'integrations',
    path: '/entegrasyonlar',
    keywords: ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'devre kesici', 'intake'],
    status: 'ready',
    view: () => import('../views/integrations/IntegrationsView.vue'),
  },
  {
    key: 'infra',
    label: 'Redis ve MongoDB',
    lede: 'Salt okuma altyapı durumu. Anahtar adı, değer ve belge içeriği asla gösterilmez.',
    icon: 'mdi-database-outline',
    group: 'infra',
    path: '/altyapi',
    keywords: ['redis', 'mongo', 'veritabanı', 'bellek', 'indeks'],
    status: 'ready',
    view: () => import('../views/infra/InfraView.vue'),
  },
  {
    key: 'cache',
    label: 'Önbellek',
    lede: 'Uygulama önbelleği metrikleri ve aile bazında boşaltma.',
    icon: 'mdi-lightning-bolt-outline',
    group: 'infra',
    path: '/altyapi/onbellek',
    keywords: ['cache', 'boşalt'],
    status: 'ready',
    view: () => import('../views/infra/CacheView.vue'),
  },

  // ---------------------------------------------------------------- Gözlem
  {
    key: 'logs',
    label: 'Log kontrol merkezi',
    lede: 'Olaylar kategoriye ve parmak izine göre gruplu: önce “ne bozuk”, sonra “hangi istekte”.',
    icon: 'mdi-pulse',
    group: 'logs',
    status: 'draft',
    path: '/loglar',
    keywords: ['log', 'hata', 'sorun', 'issue', 'iz', 'trace', 'reqId'],
    view: () => import('../views/LogCenterView.vue'),
  },
  {
    key: 'audit',
    label: 'Denetim kayıtları',
    lede: 'Kim, ne zaman, neyi, hangi gerekçeyle değiştirdi. Kayıtlar değiştirilemez; 365 gün saklanır.',
    icon: 'mdi-shield-search',
    group: 'audit',
    status: 'ready',
    path: '/denetim',
    keywords: ['audit', 'kayıt', 'işlem geçmişi'],
    view: () => import('../views/AuditView.vue'),
  },

  // ---------------------------------------------------------------- Yönetişim
  {
    key: 'admins',
    label: 'Yöneticiler',
    lede: 'Platform yöneticileri, davetler ve iki adımlı doğrulama; her değişiklik gerekçe ve kimlik doğrulaması ister.',
    icon: 'mdi-account-key-outline',
    group: 'admins',
    path: '/yoneticiler',
    keywords: ['yönetici', '2fa', 'totp', 'oturum', 'güvenlik'],
    status: 'ready',
    view: () => import('../views/admins/AdminsView.vue'),
  },
  {
    key: 'flags',
    label: 'Platform ayarları',
    lede: 'Bakım modu, destek ve duyuru ayarları, özellik bayrakları ve salt okunur ortam bilgisi; taslak, gerekçeli yayın ve geri alma.',
    icon: 'mdi-flag-outline',
    group: 'settings',
    path: '/sistem/bayraklar',
    keywords: ['feature flag', 'bayrak', 'bakım', 'maintenance', 'duyuru şeridi', 'destek e-postası', 'ortam'],
    status: 'ready',
    view: () => import('../views/settings/SettingsView.vue'),
  },
  planned({
    key: 'notifications',
    label: 'Bildirimler ve duyurular',
    lede: 'Hedefli ve zamanlı duyurular, teslim günlüğü ve şablon önizleme.',
    icon: 'mdi-bullhorn-outline',
    group: 'settings',
    path: '/sistem/duyurular',
    keywords: ['duyuru', 'e-posta', 'şablon'],
    plan: {
      items: ['Duyurular (hedefli, zamanlı)', 'Teslim günlüğü ve başarısızlıklar', 'Olay kataloğu ve şablon önizleme', 'Müşteri bildirim geçmişi (yalnız meta veri)'],
      endpoints: 'ADR-0029 NB7 · BO-N1..BO-N3',
    },
  }),
]

export const DETAIL_ROUTES: BoDetailRoute[] = [
  { name: 'tenant', path: '/musteriler/:tid(\\d+)', parent: 'tenants', title: 'Müşteri', view: () => import('../views/TenantDetailView.vue') },
  { name: 'subscription', path: '/abonelikler/:tid(\\d+)', parent: 'subscriptions', title: 'Abonelik', view: () => import('../views/billing/SubscriptionDetailView.vue') },
]

export const DEFAULT_PATH = '/genel-bakis'

export function groupOf(screen: BoScreen): BoGroup {
  return GROUPS.find((g) => g.key === screen.group)!
}

export function screensOf(group: GroupKey): BoScreen[] {
  return SCREENS.filter((s) => s.group === group)
}

export function screenByKey(key: string): BoScreen | undefined {
  return SCREENS.find((s) => s.key === key)
}

/** En uzun eşleşen yol kazanır (`/altyapi/onbellek` → önbellek, `/musteriler/102` → müşteri listesi). */
export function screenByPath(path: string): BoScreen | undefined {
  return SCREENS.filter((s) => path === s.path || path.startsWith(`${s.path}/`)).sort((a, b) => b.path.length - a.path.length)[0]
}

export interface Crumb {
  label: string
  to?: string
}

/** Breadcrumb: grup (birden çok ekranı varsa) → ekran → isteğe bağlı ek düzeyler (ör. müşteri adı). */
export function crumbsFor(screen: BoScreen | undefined, extra: Crumb[] = []): Crumb[] {
  if (!screen) return extra
  const group = groupOf(screen)
  const trail: Crumb[] = []
  const siblings = screensOf(group.key)
  if (siblings.length > 1) trail.push({ label: group.label, to: siblings.find((s) => s.status !== 'planned')?.path ?? siblings[0].path })
  trail.push({ label: screen.label, to: extra.length ? screen.path : undefined })
  return [...trail, ...extra]
}

/** Ekran durumu rozeti (menü, başlık, komut paleti aynı metin). */
export const STATUS_BADGE: Record<ScreenStatus, { text: string; tone: 'info' | 'neutral' } | null> = {
  ready: null,
  draft: { text: 'Taslak', tone: 'info' },
  planned: { text: 'Yakında', tone: 'neutral' },
}
