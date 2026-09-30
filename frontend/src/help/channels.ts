/**
 * frontend/src/help/channels.ts — kanal bağlantı rehberi (yardım merkezi "Kanal bağlantı adımları" tablosu ve
 * kimlik bilgisi (?) ipuçları).
 *
 * TEK GERÇEK KAYNAK tanıtım sitesindeki `site/src/data/connect.ts`'tir (kanıt: backend adaptörlerinin
 * `requiredSettings` listesi). Uygulama o pakete bağlanamadığı için değerler burada AYNEN tekrarlanır ve
 * `tests/help-content.test.ts` iki dosyanın kanal/etiket/adım metinlerinin EŞ olduğunu doğrular (sapma = kırmızı test).
 * Sır, örnek değer veya kanala özgü panel menü yolu YAZILMAZ.
 */

export type HelpChannelKind = 'marketplace' | 'ecommerce' | 'erp'

export interface HelpChannelGuide {
  code: string
  name: string
  kind: HelpChannelKind
  /** Kullanıcının kanal panelinden edineceği kimlik bilgisi TÜRLERİ (connect.ts `credentials`). */
  credentials: string[]
  /** Kanıtlı sınır notu (connect.ts `note`). */
  note?: string
}

export const HELP_CHANNELS: readonly HelpChannelGuide[] = [
  { code: 'trendyol', name: 'Trendyol', kind: 'marketplace', credentials: ['Satıcı kimliği', 'API anahtarı', 'API gizli anahtarı'] },
  { code: 'hepsiburada', name: 'Hepsiburada', kind: 'marketplace', credentials: ['Satıcı (mağaza) kimliği', 'API anahtarı', 'API gizli anahtarı'] },
  { code: 'n11', name: 'N11', kind: 'marketplace', credentials: ['API anahtarı', 'API gizli anahtarı'] },
  { code: 'pazarama', name: 'Pazarama', kind: 'marketplace', credentials: ['API anahtarı', 'API gizli anahtarı'] },
  {
    code: 'ideasoft', name: 'Ideasoft', kind: 'ecommerce', credentials: ['Mağaza adı', 'Anahtar (key)', 'Gizli anahtar (secret)'],
    note: 'Gerçek mağaza bağlantısında yetkilendirme (OAuth) adımı bu sürümde tamamlanmamıştır; entegrasyon şu an test ortamında çalışır.',
  },
  { code: 'bizimhesap', name: 'Bizimhesap', kind: 'erp', credentials: ['Anahtar (key)', 'Gizli anahtar (secret)'] },
] as const

/** Kimlik bilgilerinin nereden edinileceği (connect.ts `WHERE`, tür bazında genel ifade). */
export const HELP_CHANNEL_WHERE: Record<HelpChannelKind, string> = {
  marketplace: 'İlgili pazaryerinin satıcı panelinden API kimlik bilgilerinizi edinin.',
  ecommerce: 'Mağaza panelinizden entegrasyon kimlik bilgilerinizi edinin.',
  erp: 'ERP hesabınızdan entegrasyon kimlik bilgilerinizi edinin.',
}

/** connect.ts `COMMON_STEPS`. */
export const HELP_CHANNEL_COMMON_STEPS: readonly string[] = [
  "Entegrasyonik'te ilgili entegrasyonun ayar ekranını açın ve bilgileri girin.",
  'Kaydedin. Eksik bir alan olduğunda ekran hangi bilginin gerektiğini belirtir.',
]

/** Entegrasyon türü → ayar ekranı (`stores/site/menu.ts` views anahtarı). */
export const HELP_CHANNEL_SCREEN: Record<HelpChannelKind, string> = {
  marketplace: 'integrations/MarketplaceView',
  ecommerce: 'integrations/ECommerceView',
  erp: 'integrations/ErpView',
}

export function channelSteps(kind: HelpChannelKind): string[] {
  return [HELP_CHANNEL_WHERE[kind], ...HELP_CHANNEL_COMMON_STEPS]
}
