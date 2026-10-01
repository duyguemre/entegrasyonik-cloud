/**
 * Adil rekabet ilkesi (PRC-MKT, K58) — sitedeki "fiyatınız sizin kararınız" tutumunun TEK kaydı.
 *
 * Kaynak: hukuk araştırmasının (AUTO_PRICING_LEGAL §a/§c/§f) "yapamayız" noktaları — eşitleme yok, rakip hedefleme yok,
 * işletmeler arası veri yok, dayatılan fiyat yok, kayıt şeffaf — burada ÜST İLKE / marka tutumu olarak anlatılır.
 * Metin seçenekleri ve gerekçeleri: `site/docs/site-fair/COPY.md` (kullanıcı oradan değiştirebilir).
 *
 * Kurallar (tests/fair-play.test.ts korur):
 * - Her cümle BUGÜN doğrudur ve `evidence` atfı taşır (dosya mevcut + atıf metni dosyada geçer). Olmayan özellik
 *   (rakip fiyat görünürlüğü, otomatik fiyatlama) anlatılmaz; "yakında" bile yazılmaz (K43 yayın kapısı).
 * - Hukuki uygunluk GARANTİSİ, kurum/kurul/karar/soruşturma atfı, pazaryeri adı veya aracı, rakip firma adı (K07),
 *   "eşitle / rakibi geç / fiyat savaşı" dili YOK — `FAIR_BANNED` derlenmiş sitenin tamamında taranır.
 * - Teknik mekanizma anlatılmaz (K44); ziyaretçi "siz / işletmeniz" (K45).
 */
import { evidence, PATHS, type EvidenceRef } from './evidence'

export type FairIcon = 'finance' | 'lock' | 'book' | 'shield'

export interface FairPrinciple {
  id: string
  icon: FairIcon
  title: string
  /** Tek cümlelik ilke (yönetici düzeyi, fayda dili). */
  value: string
  /** Görünür DEĞİL: cümlenin bugün doğru olduğunun kanıtı. */
  evidence: EvidenceRef[]
}

/** Bölüm çerçevesi (`/guvenlik#adil-rekabet`). */
export const fairSection = {
  id: 'adil-rekabet',
  eyebrow: 'Adil rekabet',
  title: 'Fiyatınız, sizin kararınız',
  lead: 'Entegrasyonik satışınızı yönetmeniz için çalışır; kimin hangi fiyattan satacağına karar vermez. Bu tutumu dört ilkeyle özetliyoruz.',
}

/** Ana sayfa Güvenlik bölümündeki tek satırlık özet (ayrıntı `/guvenlik#adil-rekabet`). */
export const fairPledge = {
  label: 'Adil rekabet ilkemiz',
  text: 'Fiyatınız sizin kuralınızla belirlenir; verileriniz başka bir işletmenin kararında kullanılmaz.',
  linkLabel: 'İlkelerimizi okuyun',
}

export const fairPrinciples: FairPrinciple[] = [
  {
    id: 'kendi-kurali',
    icon: 'finance',
    title: 'Fiyat sizin kuralınızla belirlenir',
    value: 'Kanallarınıza giden fiyatı siz belirlersiniz. Entegrasyonik sizin yerinize fiyat koymaz, size hazır bir fiyat da dayatmaz.',
    evidence: [
      evidence('backend/src/database/client/models/Variant.ts', 'Fiyat alanları satıcının girdiği değerlerdir (kanal bazlı seçenekli)', 'isPlatformBasedPrice'),
    ],
  },
  {
    id: 'veri-sizin',
    icon: 'lock',
    title: 'Verileriniz yalnızca sizin',
    value: 'Fiyat, maliyet ve satış verileriniz kendi hesabınızda kalır; başka bir işletmenin kararında kullanılmaz, başka işletmelerle paylaşılmaz.',
    evidence: [evidence(PATHS.adr0003, 'ADR-0003 hesap başına ayrı veri alanı', 'entegrasyonikClient_1')],
  },
  {
    id: 'seffaf-kayit',
    icon: 'book',
    title: 'Şeffaf kayıt',
    value: 'Stokunuzda otomatik yapılan değişiklikler nedeniyle birlikte kayda geçer; bir sayının neden değiştiği sonradan izlenebilir.',
    evidence: [
      evidence('backend/src/database/client/models/StockMovement.ts', 'Stok hareket defteri: neden alanı zorunlu', 'reason: { type: String, enum: STOCK_MOVEMENT_REASONS, required: true }'),
      evidence('backend/src/api/services/stock-service.ts', 'Stok hareketlerini listeleme', 'async listMovements()'),
    ],
  },
  {
    id: 'pazara-bakin',
    icon: 'shield',
    title: 'Rakibe değil, işinize odaklanın',
    value: 'Belirli bir satıcıyı hedef alan araç sunmayız. Araçlarımız kendi maliyetinize, stokunuza ve hedeflerinize göre karar vermenize yardım eder.',
    evidence: [evidence('site/tests/fair-play.test.ts', 'Sitede rakip hedefleme dili yasak (statik bekçi)', 'rakip hedefleme')],
  },
]

/**
 * Yasak ifadeler (K58 + K07 + K43): derlenmiş sitenin TAMAMINDA (pazarlama, rehber, yasal, llms metinleri) aranır.
 * Kalıplar küçük harfli, Türkçe-normalize metinde (ı→i, ş→s, ç→c, ğ→g, ö→o, ü→u, â→a) çalışır.
 * `scope: 'marketing'` → rehber/sözlük ve yasal metinler hariç (orada kavram tanımı olarak geçebilir).
 */
export interface FairBan {
  id: string
  pattern: RegExp
  why: string
  scope?: 'all' | 'marketing'
}

export const FAIR_BANNED: FairBan[] = [
  // --- hukuki garanti / uygunluk iddiası
  { id: 'yuzde-yuz-uygun', pattern: /(%\s?100|yuzde\s?yuz)[^.]{0,30}(yasal|uygun|hukuk|mevzuat)/, why: 'hukuki uygunluk garantisi' },
  // Olumsuz/çekince kullanımı ("garanti edemez", "garantisi değildir") serbesttir; olumlu vaat biçimleri yakalanır.
  {
    id: 'yasalara-uygun-garanti',
    pattern: /(yasa|kanun|mevzuat|hukuk)[^.]{0,40}(tam(amen)?\s+uygun|garanti(li|lidir|leriz|liyoruz|\s+eder\b|\s+ederiz|\s+ediyoruz|siyle|si\s+veri|si\s+sun))/,
    why: 'hukuki uygunluk garantisi',
  },
  { id: 'uygunluk-garantili', pattern: /uygunlu(k|gu)\s+garanti(li|lidir|\s+eder|siyle|si\s+veri|si\s+sun)/, why: 'uygunluk garantisi' },
  { id: 'hukuken-garanti', pattern: /hukuk(en|i (olarak|acidan))\s+(garanti|guvence|guvenli|onayli|sorunsuz)/, why: 'hukuki garanti' },
  { id: 'yasal-guvence', pattern: /yasal\s+(guvence|garanti)/, why: 'hukuki garanti' },
  // --- kurum/kurul/karar/soruşturma atfı
  { id: 'kurum-onayli', pattern: /rekabet\s+kurum(u|unca|undan)?\s+(onay|tescil|izin)/, why: 'kurum onayı iddiası' },
  { id: 'rekabet-kurulu', pattern: /rekabet\s+kurul(u|unun|una)?/, why: 'Kurul/karar atfı' },
  { id: 'rekabet-kurumu', pattern: /rekabet\s+kurum/, why: 'Kurum atfı' },
  { id: 'sorusturma', pattern: /sorusturma/, why: 'soruşturma atfı' },
  { id: 'taahhut-karari', pattern: /taahhut\s+karar/, why: 'karar atfı' },
  { id: '4054', pattern: /4054\s+sayili/, why: 'kanun maddesine dayalı uygunluk iddiası' },
  // --- eşitleme / rakibi geç-yen / fiyat savaşı dili
  { id: 'buybox-esitle', pattern: /buybox[^.]{0,30}esitle/, why: 'eşitleme dili' },
  { id: 'fiyat-esitle', pattern: /fiyat(i|ini|lari|larini|inizi|larinizi)?\s+(rakip[^.\s]*\s+)?(fiyat[^.\s]*\s+)?esitle/, why: 'fiyat eşitleme dili' },
  { id: 'rakibe-esitle', pattern: /rakib?[^.\s]*\s+(fiyat[^.\s]*\s+)?esitle/, why: 'rakibe eşitleme dili' },
  { id: 'rakibi-gec', pattern: /(rakib|rakip)(i|ini|leri|lerini|lerinizi|inizi)\s+(otomatik(\s+olarak)?\s+)?(gec|yen|alt et|ezin|ez\b|sollay)/, why: 'rakibi geç/yen dili' },
  { id: 'fiyat-savasi', pattern: /fiyat\s+savas/, why: 'fiyat savaşı dili' },
  { id: 'buybox-kazan', pattern: /buybox[^.]{0,30}(kazan|garanti|sahibi ol)/, why: 'buybox kazanma vaadi' },
  { id: 'rakip-fiyat-takip', pattern: /rakip[^.\s]*\s+fiyat[^.\s]*\s+(takip|takib|izle|analiz)/, why: 'yayında olmayan rakip fiyat izleme vaadi' },
  // --- yayında olmayan özellik vaadi (K43 yayın kapısı)
  { id: 'otomatik-fiyatlama', pattern: /otomatik\s+fiyat(lama|landirma|\s+guncelle)/, why: 'yayında olmayan otomatik fiyatlama', scope: 'marketing' },
  { id: 'buybox-pazarlama', pattern: /buybox/, why: 'yayında olmayan buybox görünürlüğü', scope: 'marketing' },
  { id: 'akilli-fiyat', pattern: /(akilli|dinamik|yapay zeka(li)?)\s+fiyat(lama|landirma)/, why: 'yayında olmayan fiyatlama vaadi', scope: 'marketing' },
]

/** Pazaryeri adı + otomatik fiyat aracı birlikteliği (bir pazaryerinin aracına atıf). */
export const MARKETPLACE_NAMES = ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'amazon', 'ciceksepeti', 'idefix', 'koctas']
export const marketplaceToolPattern = new RegExp(
  `(${MARKETPLACE_NAMES.join('|')})[^.]{0,60}(fiyatlandirma araci|otomatik fiyat|fiyat robotu|buybox araci)|(fiyatlandirma araci|otomatik fiyat|fiyat robotu|buybox araci)[^.]{0,60}(${MARKETPLACE_NAMES.join('|')})`,
)

/** Kalıpların çalıştığı normalize metin: küçük harf + Türkçe aksan sadeleştirme. */
export function normalizeTr(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/[’']/g, '')
}
