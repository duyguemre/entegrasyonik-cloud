/**
 * Rehber (bilgi merkezi, S20) veri türleri. İçerik kaynağı: `docs/research/ECOMMERCE_MARKET_KB_2026-09-30.md`
 * (origin/main). Sayfalar yalnızca bu türlerdeki kayıtları çizer; olgusal metin markup'a yazılmaz.
 *
 * Satır içi işaretleme (yalnızca iki biçim, `src/lib/kb-render.ts` kaçırarak dönüştürür):
 *   **kalın**  ve  [etiket](/site-ici-yol#capa)
 */
import type { SourceId } from './sources'

export type ClusterId = 'pazaryerleri' | 'mevzuat' | 'operasyon' | 'secim'

export type Block =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  /** Numaralı adımlar; `howTo: true` olan sayfada HowTo şemasına da dönüşür (adım adı + açıklaması görünür). */
  | { type: 'steps'; items: Array<{ name: string; text: string }> }
  | { type: 'table'; caption: string; head: string[]; rows: string[][] }
  /** Kısa not kutusu: `info` (bilgi) / `caution` (değişebilir veya doğrulama gerektiren alan). */
  | { type: 'callout'; tone: 'info' | 'caution'; title: string; text: string }
  /** Yatay akış şeması (sipariş → fatura → ...): yalnızca kavramsal adım adları. */
  | { type: 'flow'; caption: string; items: string[] }

export interface GuideSection {
  id: string
  title: string
  blocks: Block[]
}

export interface GuideFaq {
  id: string
  question: string
  answer: string
}

/** Sayfa sonundaki Entegrasyonik bağlamı: metin `src/data/kb/index.ts` içinde KAYITLARDAN üretilir. */
export type CtaKind = 'stock' | 'channels' | 'invoice' | 'returns' | 'security' | 'connect' | 'catalog' | 'finance'

export interface Guide {
  /** `/rehber/` altındaki yol (ör. `e-fatura/eticarette-e-fatura-zorunlulugu`). */
  slug: string
  /** KB sayfa kimliği (R0–R30). */
  kbId: string
  cluster: ClusterId
  /** Görünür H1. */
  title: string
  /** `<title>` için kısa başlık (marka eki hariç ≤ 44 karakter; S19 başlık sınırı). */
  seoTitle: string
  /** Meta açıklama (70–155 karakter, benzersiz). */
  description: string
  /** Kart ve hero için tek cümlelik özet. */
  summary: string
  /** LLM'lerin alıntılayabileceği 2–3 cümlelik doğrudan yanıt (sayfanın başında "Kısa yanıt" kutusu). */
  answer: string
  /** Yanıt kutusunun altındaki en fazla dört madde. */
  keyPoints: string[]
  sections: GuideSection[]
  faq: GuideFaq[]
  /** Kaynak defteri kimlikleri (görünür kaynak listesi + `citation`). */
  sources: SourceId[]
  /** İlgili rehber slug'ları (iç bağlantı haritası, KB §11). */
  related: string[]
  cta: CtaKind
  /** `connect`/`catalog` için ilgili entegrasyon kodu (yalnızca mevcut entegrasyonlar). */
  ctaChannel?: string
  /** Mevzuat/vergi içeriği: "hukuki/mali tavsiye değildir" notu gösterilir. */
  legal?: boolean
  /** Değişebilen eşik/tarih içerir: "değişebilir" uyarısı gösterilir. */
  volatile?: boolean
  /** `steps` blokları HowTo şemasına dönüştürülür. */
  howTo?: boolean
  datePublished: string
  dateModified: string
  /** Bir sonraki planlı gözden geçirme (KB §11 güncelleme politikası: sık değişen 90, mevzuat en geç 180 gün). */
  reviewBy: string
}

export interface GlossaryTerm {
  id: string
  term: string
  /** Eş/diğer adlar (ör. "overselling"). */
  alternate?: string
  definition: string
  /** Terimi ayrıntılı anlatan rehber (slug). */
  guide?: string
}
