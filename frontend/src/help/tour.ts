/**
 * frontend/src/help/tour.ts — isteğe bağlı kısa uygulama turu (ilk girişte TEKLİF edilir, zorlanmaz).
 *
 *  - Tercih yerel depoda (`ek.help.v1.tour`): 'dismissed' (Şimdi değil / kapat) ya da 'done' (tamamlandı) → teklif
 *    bir daha gösterilmez. Tur her zaman üst bardaki Yardım menüsünden ("Uygulama turunu başlat") yeniden başlatılır.
 *  - Adımlar kabuğun kalıcı çapalarına bağlıdır (`#tour-homepage-*`, `data-header-action`); görünmeyen adım (ör. dar
 *    ekranda gizli sol menü) atlanır. Kısayol metinleri kayıt defterinden (`navigation/shortcuts.ts`).
 */
import { shortcutKeys } from '@/navigation/shortcuts'

export const TOUR_KEY = 'ek.help.v1.tour'
export type TourState = 'dismissed' | 'done'

export function readTourState(): TourState | null {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(TOUR_KEY) : null
    return v === 'dismissed' || v === 'done' ? v : null
  } catch {
    // Depo erişilemiyorsa teklif gösterilmez (her yüklemede tekrar sormamak için).
    return 'dismissed'
  }
}

export function writeTourState(state: TourState) {
  try {
    localStorage.setItem(TOUR_KEY, state)
  } catch {
    // depo yoksa tercih yalnız bu oturumda kalır
  }
}

export interface TourStep {
  id: string
  /** CSS seçicileri — ilk GÖRÜNÜR eşleşme hedeflenir. */
  targets: string[]
  title: string
  text: string
  /** Bu genişliğin altında adım atlanır (ör. dar ekranda sol menü kapalı çekmecedir). */
  minWidth?: number
}

const keys = (id: Parameters<typeof shortcutKeys>[0]) => shortcutKeys(id).join('+')

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'menu',
    targets: ['#tour-homepage-menu'],
    minWidth: 1024,
    title: 'Menü',
    text: `Tüm ekranlar bölümlere ayrılmış olarak burada. ${keys('sidebarToggle')} ile menüyü daraltıp genişletin.`,
  },
  {
    id: 'search',
    targets: ['#tour-homepage-smartsearch'],
    title: 'Akıllı arama',
    text: `${keys('search')} ile sipariş numarası, ürün, müşteri, ekran ve yardım makalesi arayın.`,
  },
  {
    id: 'tabs',
    targets: ['#tour-homepage-tabs'],
    title: 'Çalışma alanı sekmeleri',
    text: `Açtığınız her ekran ayrı sekmede kalır ve kaldığınız yerden devam eder. ${keys('tabNext')} / ${keys('tabPrev')} ile gezinin, ${keys('tabClose')} ile kapatın.`,
  },
  {
    id: 'page-about',
    targets: ['.workplace-area .ek-tab-host:not(.ek-tab-host--hidden) .ek-page-bar__info'],
    title: 'Sayfa hakkında',
    text: 'Her sayfa başlığının yanındaki (i) düğmesi o sayfanın amacını, ipuçlarını ve kısayollarını gösterir. Kritik alanlardaki (?) simgesi kısa açıklama verir.',
  },
  {
    id: 'notifications',
    targets: ['[data-header-action=notifications]'],
    title: 'Bildirimler',
    text: 'Entegrasyon ve işlem bildirimleri burada; sayaç okunmamış bildirim sayısını gösterir.',
  },
  {
    id: 'help',
    targets: ['[data-header-action=help]'],
    title: 'Yardım',
    text: `Yardım merkezi, bu tur ve klavye kısayolları (${keys('shortcutHelp')}) bu menüde. Destek talebini de buradan açabilirsiniz.`,
  },
] as const
