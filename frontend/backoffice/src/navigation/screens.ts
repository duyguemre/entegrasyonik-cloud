/**
 * Statik ekran kaydı (ADR-0026 Karar 5 — DB `menus` YOK). Gruplar Karar 5'in 11 alanını + plan §1.2
 * "Bildirimler ve duyurular"ı beş bölümde toplar. `ready`/`draft` ekranlar bu aşamada var; `planned` ekranlar
 * gezilebilir yer tutucudur (içerik ve uç listesi BACKOFFICE_PLAN §1.2/§2'den).
 */
export type ScreenStatus = 'ready' | 'draft' | 'planned'

export interface BoScreen {
  key: string
  label: string
  icon: string
  section: string
  status: ScreenStatus
  path: string
  /** Yer tutucu ekranda gösterilen plan özeti. */
  plan?: { summary: string; items: string[]; endpoints: string }
}

const planned = (key: string, label: string, icon: string, section: string, plan: BoScreen['plan']): BoScreen => ({
  key, label, icon, section, status: 'planned', path: `/plan/${key}`, plan,
})

export const SCREENS: BoScreen[] = [
  { key: 'overview', label: 'Genel bakış', icon: 'mdi-view-dashboard-outline', section: 'İzleme', status: 'ready', path: '/genel-bakis' },
  { key: 'logs', label: 'Log kontrol merkezi', icon: 'mdi-pulse', section: 'İzleme', status: 'draft', path: '/loglar' },
  { key: 'audit', label: 'Denetim kayıtları', icon: 'mdi-shield-search', section: 'İzleme', status: 'ready', path: '/denetim' },
  { key: 'tenants', label: 'Müşteriler', icon: 'mdi-storefront-outline', section: 'Müşteriler', status: 'ready', path: '/musteriler' },
  planned('subscriptions', 'Üyelik ve abonelikler', 'mdi-card-account-details-outline', 'Müşteriler', {
    summary: 'Planlar (salt okuma), abonelik listesi ve detayı, deneme uzatma, plan değiştirme, iptal ve gelir metrikleri.',
    items: ['Abonelik listesi: durum ve plan filtresi', 'Detay: BillingEvents geçmişi', 'Deneme uzat / plan değiştir / iptal (gerekçe + adım-yükseltmesi)', 'MRR, deneme→ücretli dönüşüm, kayıp'],
    endpoints: 'B4a–B4c · BackofficeBillingService',
  }),
  planned('integrations', 'Entegrasyonlar', 'mdi-transit-connection-variant', 'Platform', {
    summary: 'Entegrasyon tanımları ve ayar yönetimi, uyum konsolu, platform geneli API sağlığı ve dayanıklılık durumu.',
    items: ['Tanımlar, ayarlar, motor ayarları, etkin ayar (müşteri uygulamasından taşınır)', 'Uyum konsolu', 'API sağlığı: çağrı, hata oranı, p95, etkilenen müşteri sayısı', 'Devre kesici, hız sınırı bütçesi, alım (intake) durumu'],
    endpoints: 'B5, B6 · Aşama 3 taşıma',
  }),
  planned('engine', 'Motor ve kuyruklar', 'mdi-cog-transfer-outline', 'Platform', {
    summary: 'BullMQ kuyrukları ve ölü mektuplar, durum makinesi işleri, zamanlayıcı koşuları.',
    items: ['Kuyruk sayımları ve 24 saatlik seri', 'Başarısız işler: yeniden dene / at (gerekçe)', 'Takılı kiralar ve sahip pod', 'Zamanlayıcı koşuları (14 gün)'],
    endpoints: 'B7a–B7d · BackofficeEngineService',
  }),
  planned('infra', 'Redis ve MongoDB', 'mdi-database-outline', 'Platform', {
    summary: 'Salt okuma altyapı durumu. Anahtar adı, değer ve belge içeriği asla gösterilmez.',
    items: ['Redis: bellek, istemciler, isabet oranı, önek ailesi başına anahtar sayısı, yavaş komutlar', 'MongoDB: bağlantılar, işlem sayaçları, izinli veritabanları için boyutlar', 'Koleksiyon ve indeks kullanımı', 'Yavaş sorgular (uygulama tarafında ölçülür)'],
    endpoints: 'B8a–B8d · BackofficeInfraService',
  }),
  planned('cache', 'Cache', 'mdi-lightning-bolt-outline', 'Platform', {
    summary: 'Uygulama önbelleği metrikleri ve aile bazında boşaltma.',
    items: ['İsabet/ıskalama ve aile dökümü', 'Aile boşaltma (gerekçe + adım-yükseltmesi)'],
    endpoints: 'B9 · BackofficeInfraService/getCacheMetrics',
  }),
  planned('support', 'Destek', 'mdi-lifebuoy', 'İletişim', {
    summary: 'Destek talepleri, yanıt ve müşteri adına talep açma (müşteri uygulamasından taşınır).',
    items: ['Talep listesi ve yazışma', 'Müşteri adına talep açma', 'Okuma denetime yazılır (hassas okuma)'],
    endpoints: 'AdminService/getTickets · Aşama 3 taşıma',
  }),
  planned('notifications', 'Bildirimler ve duyurular', 'mdi-bullhorn-outline', 'İletişim', {
    summary: 'Hedefli ve zamanlı duyurular, teslim günlüğü, olay kataloğu ve şablon önizleme.',
    items: ['Duyurular (hedefli, zamanlı)', 'Teslim günlüğü ve başarısızlıklar', 'Olay kataloğu + şablon önizleme', 'Müşteri bildirim geçmişi (yalnız meta veri)'],
    endpoints: 'ADR-0029 NB7 · BO-N1..BO-N3',
  }),
  planned('settings', 'Sistem ayarları', 'mdi-tune-variant', 'Yönetişim', {
    summary: 'Özellik bayrakları ve bakım modu — yapılandırma motorunun platform hedefi (taslak, yayın, geri alma).',
    items: ['Özellik bayrakları', 'Bakım modu ve ileti', 'Yayın/geri alma denetime yazılır'],
    endpoints: 'B11 · IntegrationConfigService (platform hedefi)',
  }),
  planned('admins', 'Yöneticiler ve güvenlik', 'mdi-account-key-outline', 'Yönetişim', {
    summary: 'Platform yöneticileri, iki adımlı doğrulama durumu ve oturum kapatma.',
    items: ['Yönetici listesi, davet, devre dışı bırakma', '2FA sıfırlama (gerekçe + adım-yükseltmesi)', 'Tüm oturumları kapat', 'IP izin listesi (salt okuma)'],
    endpoints: 'B12 · BackofficeAdminUserService',
  }),
]

export const SECTION_ORDER = ['İzleme', 'Müşteriler', 'Platform', 'İletişim', 'Yönetişim']

export function screenByPath(path: string): BoScreen | undefined {
  return SCREENS.find((s) => path === s.path || path.startsWith(`${s.path}/`))
}
