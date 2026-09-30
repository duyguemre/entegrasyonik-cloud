/**
 * frontend/src/help/types.ts
 *
 * Yardım merkezi + bağlamsal yardım — içerik ŞEMASI. SAF TS (vue/vuetify/`@/` bileşen import'u YOK; screens.ts ile
 * aynı disiplin) → içerik kayıtları vitest'te doğrudan doğrulanır (her ekranın içeriği var, "Buraya git" hedefleri
 * geçerli ekran, ilgili makaleler mevcut).
 *
 * İÇERİK KURALI: yalnız uygulamada GERÇEKTEN var olan özellik anlatılır (kanıt: kod + backend/src/capabilities/**).
 * Olmayan özellik, rakip adı, uydurma sayı yok. Kanal adımları site/src/data/connect.ts ile tutarlı (test korur).
 */

export type HelpLocale = 'tr' | 'en'

export type HelpCategoryId =
  | 'getting-started'
  | 'using-the-app'
  | 'catalog'
  | 'stock'
  | 'orders'
  | 'integrations'
  | 'finance'
  | 'account'
  | 'troubleshooting'
  | 'faq'
  | 'support'

/** Makale gövdesi blokları. Metin DÜZ metindir (HTML yok); `**kalın**` işaretlemesi desteklenir. */
export type HelpBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'list'; items: string[] }
  | { type: 'note'; tone: 'info' | 'warning' | 'success'; text: string }
  | { type: 'table'; head: string[]; rows: string[][] }
  /** Kısayol tablosu — `navigation/shortcuts.ts` kayıt defterinden OTOMATİK üretilir (elle yazılmaz). */
  | { type: 'shortcuts' }
  /** Entegrasyon hata paneli eşlemesi — `composables/useIntegrationError.ts` metinlerinden OTOMATİK üretilir. */
  | { type: 'integrationErrors' }
  /** Kanal bağlantı rehberi tablosu — `help/channels.ts`'ten (site `connect.ts` ile eş) OTOMATİK üretilir. */
  | { type: 'channelGuides' }
  /** SSS: soru-cevap listesi. */
  | { type: 'faq'; items: Array<{ q: string; a: string }> }

/** "Buraya git": ilgili ekranı çalışma alanı sekmesi olarak açar. `screen` = `stores/site/menu.ts` `views` anahtarı. */
export interface HelpGoTo {
  screen: string
  label: string
}

export interface HelpArticle {
  /** Kararlı kebab-case kimlik (URL `?article=` ve bağlantılarda). */
  id: string
  category: HelpCategoryId
  title: string
  /** Tek cümle özet (liste kartında ve arama sonucunda). */
  summary: string
  /** Aramaya katkı veren ek sözcükler (eş anlamlılar). */
  keywords?: string[]
  body: HelpBlock[]
  goTo?: HelpGoTo[]
  /** İlgili makale kimlikleri (var olmalı — test korur). */
  related?: string[]
  /** Kategori içinde sıra (küçük önce). */
  order?: number
}

/** EN gibi kısmi dillerde: yalnız başlık/özet (gövde yoksa TR gövdesi + "yalnız Türkçe" notu gösterilir). */
export interface HelpArticleTranslation {
  title: string
  summary: string
  body?: HelpBlock[]
  goToLabels?: string[]
}

export interface HelpCategory {
  id: HelpCategoryId
  icon: string
  title: Record<HelpLocale, string>
  description: Record<HelpLocale, string>
  order: number
}

/** Bağlamsal yardım — "Sayfa hakkında" (i) paneli içeriği. Anahtar: `stores/site/menu.ts` `views` anahtarı. */
export interface PageHelp {
  /** Sayfanın amacı (1-2 cümle). */
  purpose: string
  /** 3-5 kısa ipucu (yalnız bu ekranda gerçekten yapılabilenler). */
  tips: string[]
  /** İlgili kısayollar (`navigation/shortcuts.ts` kimlikleri); boşsa genel sayfa kısayolları. */
  shortcuts?: string[]
  /** "Yardım merkezinde oku" hedefi (makale kimliği). */
  article: string
}
