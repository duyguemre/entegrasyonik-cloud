/**
 * Geliştirme vitrini (`/design-system`) — SENTETİK örnek veri. Gerçek
 * müşteri/sipariş verisi DEĞİLDİR (PII yok). Adlar Entegrasyonik alanından
 * (sipariş, ürün, pazaryeri, entegrasyon) türetilmiştir.
 */
import type { EkSearchGroup, EkSideSection, EkWorkspaceTab, EkMenuGroup, EkGridColumn, EkCascadeNode } from '@entegrasyonik/ui/components'
import type { StatusTone } from '@/design/status-map'
import { formatMoney } from '@entegrasyonik/ui/format'

export const sidebarSections: EkSideSection[] = [
  {
    label: 'Genel',
    items: [
      { key: 'dashboard', label: 'Anasayfa', icon: 'mdi-view-dashboard-outline' },
      { key: 'tasks', label: 'Görevlerim', icon: 'mdi-checkbox-marked-circle-outline', badge: 4, badgeTone: 'action' },
    ],
  },
  {
    label: 'Satış',
    items: [
      {
        key: 'orders',
        label: 'Sipariş Yönetimi',
        icon: 'mdi-cart-outline',
        children: [
          { key: 'orders-all', label: 'Tüm Siparişler' },
          { key: 'orders-waiting', label: 'Kargolanmayı Bekleyen Siparişler', badge: 12, badgeTone: 'warning' },
          { key: 'orders-invoice', label: 'Fatura Kesilecek Siparişler' },
        ],
      },
      { key: 'claims', label: 'İade ve Talep Yönetimi', icon: 'mdi-undo-variant', badge: 3, badgeTone: 'error' },
      { key: 'customers', label: 'Müşteriler', icon: 'mdi-account-group-outline' },
    ],
  },
  {
    label: 'Katalog',
    items: [
      {
        key: 'catalog',
        label: 'Ürün Kataloğu',
        icon: 'mdi-tag-outline',
        children: [
          { key: 'products', label: 'Ürün Listesi' },
          { key: 'variants', label: 'Varyant ve Stok Eşleştirme' },
          { key: 'categories', label: 'Pazaryeri Kategori Eşleştirmesi' },
        ],
      },
    ],
  },
  {
    label: 'Entegrasyonlar',
    items: [
      { key: 'marketplaces', label: 'Pazaryeri Entegrasyonları', icon: 'mdi-storefront-outline' },
      { key: 'erp', label: 'ERP ve Muhasebe Bağlantıları', icon: 'mdi-chart-box-outline' },
    ],
  },
]

export const workspaceTabs: EkWorkspaceTab[] = [
  { id: 'home', title: 'Anasayfa', icon: 'mdi-view-dashboard-outline', closable: false },
  { id: 'orders', title: 'Tüm Siparişler', icon: 'mdi-cart-outline' },
  { id: 'order-detail', title: 'Sipariş TY-10234 · Kargo Bekliyor', icon: 'mdi-package-variant-closed', dirty: true },
  { id: 'products', title: 'Ürün Listesi', icon: 'mdi-tag-outline' },
  { id: 'trendyol', title: 'Trendyol Entegrasyon Ayarları', icon: 'mdi-storefront-outline' },
]

export const searchGroups: EkSearchGroup[] = [
  {
    key: 'orders',
    label: 'Siparişler',
    icon: 'mdi-cart-outline',
    items: [
      {
        id: 'o1',
        title: 'TY-102348 · Ayşe K.',
        typeLabel: 'Trendyol',
        tone: 'action',
        icon: 'mdi-cart-outline',
        meta: [
          { label: 'Tutar', value: '₺1.249,90' },
          { label: 'Durum', value: 'Kargo bekliyor' },
        ],
      },
      {
        id: 'o2',
        title: 'HB-102355 · Mert D.',
        typeLabel: 'Hepsiburada',
        tone: 'info',
        icon: 'mdi-cart-outline',
        meta: [
          { label: 'Tutar', value: '₺389,00' },
          { label: 'Durum', value: 'Faturalandı' },
        ],
      },
    ],
  },
  {
    key: 'products',
    label: 'Ürünler',
    icon: 'mdi-tag-outline',
    items: [
      {
        id: 'p1',
        title: 'Pamuklu Oversize Tişört · TY-1023 serisi',
        typeLabel: 'Ürün',
        tone: 'success',
        meta: [
          { label: 'SKU', value: 'TSH-OVS-001' },
          { label: 'Stok', value: '148' },
          { label: 'Barkod', value: '8690000102301' },
        ],
      },
    ],
  },
]

export const rowMenu: EkMenuGroup[] = [
  {
    label: 'Sipariş',
    items: [
      { key: 'open', label: 'Detayı aç', icon: 'mdi-open-in-new', shortcut: 'Enter' },
      { key: 'new-tab', label: 'Yeni sekmede aç', icon: 'mdi-tab-plus', shortcut: ['Ctrl', 'Enter'] },
      { key: 'copy', label: 'Sipariş numarasını kopyala', icon: 'mdi-content-copy', shortcut: ['Ctrl', 'C'] },
    ],
  },
  {
    label: 'İşlemler',
    items: [
      { key: 'invoice', label: 'Fatura oluştur', icon: 'mdi-receipt-text-outline', description: 'E-fatura taslağı hazırlanır' },
      { key: 'label', label: 'Kargo etiketi yazdır', icon: 'mdi-printer-outline', shortcut: ['Ctrl', 'P'] },
      { key: 'sync', label: 'Pazaryerinden yeniden çek', icon: 'mdi-sync', disabled: true },
    ],
  },
  {
    items: [{ key: 'cancel', label: 'Siparişi iptal et', icon: 'mdi-close-octagon-outline', danger: true, shortcut: 'Del' }],
  },
]

export interface DemoOrder {
  id: string
  channel: string
  customer: string
  date: string
  amount: string
  status: { tone: StatusTone; label: string }
}

export const orderColumns: EkGridColumn[] = [
  { key: 'id', label: 'Sipariş no', type: 'id', sortable: true },
  { key: 'channel', label: 'Kanal', sortable: true },
  { key: 'customer', label: 'Müşteri', type: 'muted' },
  { key: 'date', label: 'Tarih', type: 'num', align: 'start', sortable: true },
  { key: 'amount', label: 'Tutar', type: 'num', sortable: true },
  { key: 'status', label: 'Durum' },
  { key: 'actions', label: 'İşlem', align: 'end' },
]

const CHANNELS = ['Trendyol', 'Hepsiburada', 'N11', 'Pazarama', 'Ideasoft']
const CUSTOMERS = ['Ayşe K.', 'Mert D.', 'Zeynep A.', 'Can Y.', 'Elif Ş.', 'Burak T.', 'Selin Ö.', 'Emre B.']
const STATUSES: Array<{ tone: StatusTone; label: string }> = [
  { tone: 'warning', label: 'Kargo bekliyor' },
  { tone: 'info', label: 'Hazırlanıyor' },
  { tone: 'success', label: 'Teslim edildi' },
  { tone: 'neutral', label: 'Yeni' },
  { tone: 'danger', label: 'İptal talebi' },
]
const PREFIX: Record<string, string> = { Trendyol: 'TY', Hepsiburada: 'HB', N11: 'N11', Pazarama: 'PZ', Ideasoft: 'IS' }

export const demoOrders: DemoOrder[] = Array.from({ length: 18 }, (_, i) => {
  const channel = CHANNELS[i % CHANNELS.length]
  const amount = 189 + ((i * 7919) % 2400) + 0.9
  return {
    id: `${PREFIX[channel]}-${102340 + i}`,
    channel,
    customer: CUSTOMERS[i % CUSTOMERS.length],
    date: `29.09.2026 ${String(23 - (i % 12)).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}`,
    amount: formatMoney(amount),
    status: STATUSES[i % STATUSES.length],
  }
})

export const categoryTree: EkCascadeNode[] = [
  {
    id: 'moda',
    label: 'Moda',
    count: 1240,
    children: [
      {
        id: 'kadin',
        label: 'Kadın',
        count: 640,
        children: [
          {
            id: 'giyim',
            label: 'Giyim',
            count: 410,
            children: [
              { id: 'tisort', label: 'Tişört', count: 128 },
              { id: 'elbise', label: 'Elbise', count: 96 },
              { id: 'gomlek', label: 'Gömlek', count: 74 },
              { id: 'pantolon', label: 'Pantolon', count: 112 },
            ],
          },
          { id: 'ayakkabi', label: 'Ayakkabı', count: 150, children: [{ id: 'sneaker', label: 'Sneaker', count: 60 }, { id: 'topuklu', label: 'Topuklu Ayakkabı', count: 90 }] },
          { id: 'aksesuar', label: 'Aksesuar', count: 80, children: [{ id: 'canta', label: 'Çanta', count: 80 }] },
        ],
      },
      { id: 'erkek', label: 'Erkek', count: 480, children: [{ id: 'erkek-giyim', label: 'Giyim', count: 480, children: [{ id: 'erkek-tisort', label: 'Tişört', count: 210 }] }] },
      { id: 'cocuk', label: 'Çocuk', count: 120, children: [{ id: 'bebek', label: 'Bebek Giyim', count: 120 }] },
    ],
  },
  { id: 'elektronik', label: 'Elektronik', count: 860, children: [{ id: 'telefon', label: 'Cep Telefonu Aksesuarları', count: 860, children: [{ id: 'kilif', label: 'Kılıf', count: 540 }, { id: 'sarj', label: 'Şarj Cihazı', count: 320 }] }] },
  { id: 'ev', label: 'Ev ve Yaşam', count: 530, children: [{ id: 'mutfak', label: 'Mutfak', count: 530, children: [{ id: 'saklama', label: 'Saklama Kabı', count: 530 }] }] },
  { id: 'kozmetik', label: 'Kozmetik ve Kişisel Bakım', count: 310, children: [{ id: 'cilt', label: 'Cilt Bakımı', count: 310 }] },
  { id: 'spor', label: 'Spor ve Outdoor', count: 205, children: [{ id: 'kamp', label: 'Kamp Malzemeleri', count: 205 }] },
]
