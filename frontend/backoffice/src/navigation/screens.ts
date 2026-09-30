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
  { key: 'subscriptions', label: 'Üyelik ve abonelikler', icon: 'mdi-card-account-details-outline', section: 'Müşteriler', status: 'ready', path: '/abonelikler' },
  { key: 'integrations', label: 'Entegrasyonlar', icon: 'mdi-transit-connection-variant', section: 'Platform', status: 'ready', path: '/entegrasyonlar' },
  { key: 'engine', label: 'Motor ve kuyruklar', icon: 'mdi-cog-transfer-outline', section: 'Platform', status: 'ready', path: '/motor' },
  { key: 'infra', label: 'Redis ve MongoDB', icon: 'mdi-database-outline', section: 'Platform', status: 'ready', path: '/altyapi' },
  { key: 'cache', label: 'Cache', icon: 'mdi-lightning-bolt-outline', section: 'Platform', status: 'ready', path: '/onbellek' },
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
  { key: 'settings', label: 'Sistem ayarları', icon: 'mdi-tune-variant', section: 'Yönetişim', status: 'ready', path: '/sistem-ayarlari' },
  { key: 'admins', label: 'Yöneticiler ve güvenlik', icon: 'mdi-account-key-outline', section: 'Yönetişim', status: 'ready', path: '/yoneticiler' },
]

export const SECTION_ORDER = ['İzleme', 'Müşteriler', 'Platform', 'İletişim', 'Yönetişim']

export function screenByPath(path: string): BoScreen | undefined {
  return SCREENS.find((s) => path === s.path || path.startsWith(`${s.path}/`))
}
