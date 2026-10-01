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
 * Bilgi mimarisi: 5 bölüm → 12 grup → ekranlar. Grubun tek ekranı varsa menüde yaprak, birden fazlaysa açılır grup.
 */
export type ScreenStatus = 'ready' | 'draft' | 'planned'

export type SectionKey = 'home' | 'customers' | 'platform' | 'observe' | 'govern'

export type GroupKey =
  | 'overview'
  | 'otopilot'
  | 'customers'
  | 'subscriptions'
  | 'engine'
  | 'integrations'
  | 'infra'
  | 'logs'
  | 'audit'
  | 'admins'
  | 'settings'
  | 'notifications'

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
  { key: 'otopilot', label: 'Otopilot', icon: 'mdi-creation-outline', section: 'home' },
  { key: 'customers', label: 'Müşteriler', icon: 'mdi-storefront-outline', section: 'customers' },
  { key: 'subscriptions', label: 'Abonelikler', icon: 'mdi-card-account-details-outline', section: 'customers' },
  { key: 'engine', label: 'Motor ve kuyruklar', icon: 'mdi-cog-transfer-outline', section: 'platform' },
  { key: 'integrations', label: 'Entegrasyonlar', icon: 'mdi-transit-connection-variant', section: 'platform' },
  { key: 'infra', label: 'Altyapı', icon: 'mdi-server-outline', section: 'platform' },
  { key: 'logs', label: 'Loglar ve sorunlar', icon: 'mdi-pulse', section: 'observe' },
  { key: 'audit', label: 'Denetim', icon: 'mdi-shield-search', section: 'observe' },
  { key: 'admins', label: 'Yöneticiler', icon: 'mdi-account-key-outline', section: 'govern' },
  { key: 'settings', label: 'Sistem ayarları', icon: 'mdi-tune-variant', section: 'govern' },
  { key: 'notifications', label: 'Bildirimler ve duyurular', icon: 'mdi-bullhorn-outline', section: 'govern' },
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

  // Otopilot (K21, CHAT_UI_CONTRACT §7.2): tam sayfa sohbet; yan panel kabukta (chat/OtopilotDock). Salt okuma (v1).
  {
    key: 'otopilot',
    label: 'Otopilot',
    lede: 'Platform durumunu, kuyrukları ve logları doğal dille sorun. Yalnız okur; işlem önermez ve sohbetler kaydedilmez.',
    icon: 'mdi-creation-outline',
    group: 'otopilot',
    path: '/otopilot',
    keywords: ['sohbet', 'chat', 'yapay zekâ', 'ai', 'sor', 'ajan'],
    status: 'ready',
    view: () => import('../views/otopilot/OtopilotView.vue'),
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
    // BO-ELEV IA-5: tek müşterinin yaşam döngüsü müşteri detayında hazır; bu planlı ekran ÇAPRAZ müşteri kuyruğudur.
    label: 'Hesap kuyruğu',
    lede: 'Deneme, askı ve silme bekleyen hesaplar tek listede; tek müşterinin yaşam döngüsü müşteri detayında.',
    icon: 'mdi-timeline-clock-outline',
    group: 'customers',
    path: '/musteriler/yasam-dongusu',
    keywords: ['deneme', 'askı', 'silme', 'yaşam döngüsü'],
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
  {
    key: 'otopilot-settings',
    label: 'Otopilot',
    lede: 'Yönetim uygulamasındaki sohbetin platform yapay zekâ sağlayıcı anahtarı. Müşteri anahtarları burada görünmez.',
    icon: 'mdi-key-chain-variant',
    group: 'settings',
    path: '/sistem/otopilot',
    keywords: ['yapay zekâ anahtarı', 'api anahtarı', 'sağlayıcı', 'byok', 'llm', 'model'],
    status: 'ready',
    view: () => import('../views/otopilot/OtopilotSettingsView.vue'),
  },

  // ---------------------------------------------------------------- Bildirimler ve duyurular (ADR-0029 NB7/NB8)
  {
    key: 'announcements',
    label: 'Duyurular',
    lede: 'Müşterilere bant, uygulama içi bildirim ve e-postayla giden hedefli ve zamanlı duyurular.',
    icon: 'mdi-bullhorn-outline',
    group: 'notifications',
    path: '/sistem/duyurular',
    keywords: ['duyuru', 'bakım', 'olay', 'bant', 'banner', 'announcement', 'e-posta'],
    status: 'ready',
    view: () => import('../views/notifications/AnnouncementsView.vue'),
  },
  {
    key: 'deliveries',
    label: 'Teslim günlüğü',
    lede: 'E-posta teslimlerinin durumu, başarısızlıklar ve elle yeniden deneme ya da atma. Adres ve ileti metni gösterilmez.',
    icon: 'mdi-email-fast-outline',
    group: 'notifications',
    path: '/bildirimler/teslimler',
    keywords: ['teslim', 'e-posta', 'smtp', 'outbox', 'dead', 'delivery'],
    status: 'ready',
    view: () => import('../views/notifications/DeliveriesView.vue'),
  },
  {
    key: 'tenant-notifications',
    label: 'Müşteri bildirim geçmişi',
    lede: 'Bir müşteriye giden bildirimlerin yalnız meta verisi: kod, zaman, alıcı ve teslim sayıları. Son 30 gün.',
    icon: 'mdi-bell-badge-outline',
    group: 'notifications',
    path: '/bildirimler/musteri-gecmisi',
    keywords: ['bildirim geçmişi', 'tenant', 'müşteri bildirimi'],
    status: 'ready',
    view: () => import('../views/notifications/TenantHistoryView.vue'),
  },
  {
    key: 'notification-catalog',
    label: 'Olay kataloğu',
    lede: 'Bildirim kodları, varsayılan kanallar ve şablon önizleme; e-posta ayarını kendinize test iletisiyle doğrulayın.',
    icon: 'mdi-book-open-page-variant-outline',
    group: 'notifications',
    path: '/bildirimler/katalog',
    keywords: ['şablon', 'template', 'katalog', 'test e-postası', 'smtp'],
    status: 'ready',
    view: () => import('../views/notifications/CatalogView.vue'),
  },
  {
    key: 'alerts',
    label: 'Platform uyarıları',
    lede: 'Hata oranı, kimlik hatası, kuyruk birikimi ve teslim sorunları için tetiklenen uyarılar; süreli susturma.',
    icon: 'mdi-alarm-light-outline',
    group: 'notifications',
    path: '/bildirimler/uyarilar',
    keywords: ['alarm', 'uyarı', 'alert', 'sustur', 'mute'],
    status: 'ready',
    view: () => import('../views/notifications/AlertsView.vue'),
  },
]

export const DETAIL_ROUTES: BoDetailRoute[] = [
  { name: 'tenant', path: '/musteriler/:tid(\\d+)', parent: 'tenants', title: 'Müşteri', view: () => import('../views/TenantDetailView.vue') },
  { name: 'subscription', path: '/abonelikler/:tid(\\d+)', parent: 'subscriptions', title: 'Abonelik', view: () => import('../views/billing/SubscriptionDetailView.vue') },
  { name: 'announcement-new', path: '/sistem/duyurular/yeni', parent: 'announcements', title: 'Yeni duyuru', view: () => import('../views/notifications/AnnouncementEditorView.vue') },
  { name: 'announcement', path: '/sistem/duyurular/:id([a-f0-9]{24})', parent: 'announcements', title: 'Duyuru', view: () => import('../views/notifications/AnnouncementDetailView.vue') },
  { name: 'announcement-edit', path: '/sistem/duyurular/:id([a-f0-9]{24})/duzenle', parent: 'announcements', title: 'Duyuruyu düzenle', view: () => import('../views/notifications/AnnouncementEditorView.vue') },
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
