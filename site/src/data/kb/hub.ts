/**
 * /rehber hub metinleri (KB §8.1 R0). Rakamlar yalnızca `facts.ts` belirteçleridir (tests/rehber.test.ts).
 */
import type { SourceId } from './sources'

export const HUB = {
  title: 'E-ticaret ve pazaryeri entegrasyon rehberi',
  seoTitle: 'E-ticaret ve pazaryeri rehberi',
  description:
    'Pazaryerinde satıcı olma, API erişimi, e-Fatura, cayma hakkı, iade kargo, KVKK ve tek stok yönetimi üzerine kaynaklı ve tarihli rehberler.',
  lead: 'Pazaryerlerinde satış, mevzuat ve stok operasyonu üzerine kaynaklı, tarihli ve sade rehberler. Her sayfa kısa bir yanıtla başlar, kaynaklarını ve son güncelleme tarihini gösterir.',
  answer:
    'Bu rehber, Türkiye’de pazaryerlerinde ve kendi sitesinde satış yapan işletmeler için hazırlanmış bir bilgi merkezidir. İçerik resmi kaynaklara (kamu kurumları ve platformların kendi sayfaları) ya da birbiriyle tutarlı ikincil kaynaklara dayanır; doğrulanamayan oran, tutar ve tarihleri yayımlamaz, bunun yerine güncel bilginin nerede bulunacağını söyler.',
  datePublished: '2026-09-30',
  dateModified: '2026-09-30',
}

/** Rehberin yazım ilkeleri (hub'da görünür). */
export const PRINCIPLES = [
  {
    icon: 'book',
    title: 'Kaynaklı',
    text: 'Her sayfanın sonunda kaynak listesi ve erişim tarihi bulunur; resmi kaynaklar ayrıca işaretlenir.',
  },
  {
    icon: 'clock',
    title: 'Tarihli',
    text: 'Her sayfa son güncelleme ve bir sonraki gözden geçirme tarihini taşır; değişebilen bilgiler ayrıca belirtilir.',
  },
  {
    icon: 'shield',
    title: 'Doğrulanmayanı yazmaz',
    text: 'Komisyon oranı, ödeme günü gibi doğrulanamayan bilgiler yerine güncel bilginin nerede olduğunu gösterir.',
  },
] as const

/** Öne çıkan resmi veri (R30, Ticaret Bakanlığı). */
export const MARKET_HIGHLIGHT = {
  title: 'Türkiye e-ticaret pazarı, 2025',
  source: 'S1' as SourceId,
  guide: 'pazar-verisi/turkiye-eticaret-2025',
  stats: [
    { value: '4,57 trilyon TL', label: 'E-ticaret hacmi' },
    { value: '%52,2', label: 'Bir önceki yıla göre artış' },
    { value: '5,94 milyar', label: 'İşlem sayısı' },
    { value: '634.611', label: 'E-ticaret yapan işletme' },
  ],
}

export const HUB_FAQ = [
  {
    id: 'sss-dayanak',
    question: 'Rehber neye dayanır?',
    answer:
      'Her sayfa, sonundaki kaynak listesinde yer alan resmi kaynaklara ya da birbiriyle tutarlı ikincil kaynaklara dayanır. Doğrulanamayan oran, tutar ve tarihler yayımlanmaz.',
  },
  {
    id: 'sss-guncelleme',
    question: 'Sayfalar ne sıklıkla güncellenir?',
    answer:
      'Sık değişen bilgiler (eşik, oran, takvim) üç ayda bir, mevzuat sayfaları resmi bir değişiklik olduğunda ve en geç altı ayda bir, pazar verisi yeni rapor yayımlandığında gözden geçirilir.',
  },
  {
    id: 'sss-tavsiye',
    question: 'Mevzuat sayfaları hukuki veya mali tavsiye midir?',
    answer:
      'Hayır. Mevzuat ve vergi sayfaları genel bilgilendirme amaçlıdır; kendi durumunuz için bir hukukçuya veya mali müşavirinize danışın.',
  },
  {
    id: 'sss-rakip',
    question: 'Rehberde ürün karşılaştırması var mı?',
    answer:
      'Rehber belirli ürünleri karşılaştırmaz ve başka firmaların adını vermez. Seçim rehberi, herhangi bir yazılıma sorabileceğiniz tarafsız ölçütleri listeler.',
  },
]

/** Hub sözlük bandında gösterilen terimler (sözlük kimlikleri). */
export const GLOSSARY_PREVIEW = ['tek-stok', 'asiri-satis', 'stok-rezervasyonu', 'hakedis', 'buybox', 'rate-limit', 'webhook', 'e-arsiv', 'ozel-entegrator', 'verbis', 'iys', 'etbis']
