/**
 * "Geliştirme listemizde" katmanı (2026-10-02, kullanıcı kararı — ADR-0014 Açık Soru 5 kısmen açıldı).
 *
 * Kullanıcı: "şu an olmayan ama backlogda olanlardan bahsedebilirsin, backed by proof için". Buradaki HER öğe:
 *   - bugün üründe YOKTUR ve sayfada açıkça öyle etiketlenir (tarih/söz verilmez);
 *   - BACKLOG.md'deki birebir bir satırla kanıtlanır (`proof.path === PATHS.backlog`, `contains` dosyada geçer —
 *     tests/claims.test.ts "(5) geliştirme listesi" doğrular). Backlog'da olmayan bir şey buraya yazılamaz;
 *   - yalnızca `DevelopmentList` bileşeninin `data-roadmap` işaretli bloğunda render edilir. Yol haritası adları
 *     (kargo firmaları, e-fatura, ek pazaryerleri...) bu blok DIŞINDA hâlâ yasaktır (claims/pages testleri).
 *
 * Bilerek ALINMAYANLAR: RA-1 rakip fiyat takibi (pazaryeri ToS doğrulanmadı), RA-9 destek merkezi (site tarafında
 * zaten var), RA-10 (RA-3'e bağımlı), MCP/yerel uygulama (müşteriye dönük kapsamı henüz ADR aşamasında).
 */
import { PATHS, evidence, type EvidenceRef } from './evidence'

export type DevelopmentArea = 'channels' | 'operations'

export interface DevelopmentItem {
  id: string
  area: DevelopmentArea
  title: string
  /** Müşterinin göreceği tek cümle — ne olacağı; tarih/sayı/söz YOK. */
  summary: string
  /** Varsa ad listesi (ör. hedef pazaryerleri) — yalnızca bu blokta görünür. */
  names?: string[]
  icon: 'plug' | 'notice' | 'receipt' | 'database' | 'finance' | 'refresh' | 'layers'
  proof: EvidenceRef
  /** `names` başlık kanıtında geçmiyorsa ayrı BACKLOG kanıtı (adların kendisi birebir geçmeli). */
  namesProof?: EvidenceRef
}

const backlog = (ref: string, contains: string) => evidence(PATHS.backlog, `BACKLOG.md ${ref}`, contains)

export const developmentItems: DevelopmentItem[] = [
  {
    id: 'more-marketplaces',
    area: 'channels',
    title: 'Yeni pazaryerleri',
    summary: 'Satış kanalı listesine yeni pazaryerlerinin eklenmesi.',
    names: ['Amazon', 'Çiçeksepeti', 'idefix', 'PttAVM'],
    icon: 'plug',
    proof: backlog('RA-5', 'RA-5 Ek pazaryerleri: Amazon, Çiçeksepeti, idefix, PttAVM'),
  },
  {
    id: 'carrier-label',
    area: 'channels',
    title: 'Kargo firması bağlantısı ve otomatik etiket',
    summary: 'Kargo gönderisinin kargo firmasıyla doğrudan oluşturulması ve etiketin panelden alınması.',
    names: ['Sürat Kargo', 'Aras Kargo', 'Yurtiçi Kargo'],
    icon: 'notice',
    proof: backlog('RA-3', 'RA-3 Kargo firması API entegrasyonu + otomatik etiket'),
    namesProof: backlog('Yeni entegrasyon adayları (kargo)', 'Sürat Kargo, Aras Kargo, Yurtiçi Kargo'),
  },
  {
    id: 'einvoice-auto',
    area: 'channels',
    title: 'E-fatura sağlayıcısıyla otomatik fatura',
    summary: 'Siparişin faturasının bir e-fatura sağlayıcısı üzerinden otomatik kesilmesi.',
    icon: 'receipt',
    proof: backlog('RA-4', 'RA-4 E-fatura sağlayıcı ile otomatik fatura'),
  },
  {
    id: 'more-erp',
    area: 'channels',
    title: 'Daha fazla muhasebe ve ERP bağlantısı',
    summary: 'Yeni muhasebe sistemleri ve Bizimhesap için yazma yönü.',
    names: ['Logo', 'Mikro', 'Paraşüt', 'Netsis'],
    icon: 'database',
    proof: backlog('RA-6', 'RA-6 Çoklu muhasebe/ERP: Logo, Mikro, Paraşüt, Netsis + Bizimhesap yazma yönü'),
  },
  {
    id: 'payout-check',
    area: 'operations',
    title: 'Hakediş ve kesinti doğrulaması',
    summary: 'Pazaryeri ödemelerinde beklenenden eksik tutarların işaretlenmesi.',
    icon: 'finance',
    proof: backlog('RA-2', 'RA-2 Hakediş/kesinti otomatik doğrulama (eksik ödeme tespiti)'),
  },
  {
    id: 'mismatch-mail',
    area: 'operations',
    title: 'Fiyat ve stok tutarsızlığı bildirimi',
    summary: 'Kanallar arasında fiyat veya stok farkı oluştuğunda günlük e-posta özeti.',
    icon: 'refresh',
    proof: backlog('RA-7', 'RA-7 Günlük fiyat/stok tutarsızlık e-postası'),
  },
  {
    id: 'xml-import',
    area: 'operations',
    title: 'Tedarikçi XML kaynağından ürün aktarımı',
    summary: 'Tedarikçinizin ürün akışından ürünlerin kataloğa alınması.',
    icon: 'layers',
    proof: backlog('RA-8', 'RA-8 XML tedarikçi kaynağından ürün aktarımı'),
  },
]

export type PublicDevelopmentItem = Omit<DevelopmentItem, 'proof'>

/** Sayfaların tek girişi: kanıt alanını atar. */
export function getDevelopmentItems(area?: DevelopmentArea): PublicDevelopmentItem[] {
  return developmentItems
    .filter((i) => !area || i.area === area)
    .map(({ proof: _proof, namesProof: _namesProof, ...rest }) => ({ ...rest, names: rest.names ? [...rest.names] : undefined }))
}

/** Blok üstündeki dürüstlük notu — her gösterimde aynı metin. */
export const DEVELOPMENT_NOTICE =
  'Bu başlıklar bugün üründe yoktur; geliştirme listemizde yer alırlar. Tarih vermiyoruz; kullanıma açıldıkça bu sayfada mevcut özellikler arasına taşınırlar.'
