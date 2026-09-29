/**
 * Yasal sayfa içerik modeli (ADR-0014 Karar 5, S5). İçerik markup'a değil bu veri dosyalarına yazılır:
 * iç-bağlantı, yer tutucu ve yasaklı ifade denetimleri statik testle (tests/legal.test.ts) yapılır.
 *
 * Satır içi söz dizimi (yalnızca bunlar; geri kalanı HTML'e kaçırılır — src/lib/legal-render.ts):
 *   **kalın**   [etiket](/yasal/slug)   {{YER_TUTUCU}}
 */

export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'h3'; text: string }
  | { type: 'table'; caption: string; head: string[]; rows: string[][] }
  /** İnsan/hukuk kararı notu — yalnızca SITE_DRAFT=true iken görünür; yayında gösterilmez. */
  | { type: 'note'; text: string }

export interface LegalSection {
  /** Sayfa içi bağlantı (içindekiler) — kebab-case, sayfa içinde benzersiz. */
  id: string
  title: string
  blocks: LegalBlock[]
}

export interface LegalDoc {
  /** `/yasal/<slug>` — navigation.ts legalNav ile birebir. */
  slug: string
  title: string
  description: string
  /** Abonelik Sözleşmesi'nde `termsVersion` ile eşleşir (ADR-0008 §2). */
  version: string
  /** ISO tarih (YYYY-MM-DD). */
  updatedAt: string
  /** Sayfa başlığı altındaki tek cümlelik özet. */
  summary: string
  sections: LegalSection[]
}

export type PlaceholderOwner = 'işletme' | 'hukuk' | 'mali müşavir' | 'ürün/işletme'

export interface PlaceholderSpec {
  /** İnsan-okunur açıklama: ne girilecek. */
  description: string
  /** Değeri kim verir / onaylar. */
  owner: PlaceholderOwner
}
