/**
 * Yer tutucu kaydı — `{{ANAHTAR}}` olarak metinde geçen HER anahtar burada tanımlı olmalıdır
 * (tests/legal.test.ts). Sayfa sonundaki "Doldurulması gereken alanlar" listesi bu kayıttan üretilir.
 * Değerleri insan (işletme/hukuk/mali müşavir) verir; ajan uydurma değer YAZMAZ (Protokol 12).
 */
import type { PlaceholderSpec } from './types'
import { company, hasValue } from '../company'

export const placeholders: Record<string, PlaceholderSpec> = {
  // --- Künye / kimlik (ADR-0014 Açık Soru 4) ---
  ŞİRKET_UNVANI: {
    description: 'Ticaret unvanı (hukuki türüyle birlikte, ticaret sicilindeki gibi). Eski metinlerdeki unvan doğrulanmadığı için taşınmadı.',
    owner: 'işletme',
  },
  MERSİS_NO: { description: 'MERSİS numarası (16 haneli).', owner: 'işletme' },
  TİCARET_SİCİL_NO: { description: 'Bağlı olunan ticaret sicil müdürlüğü ve sicil numarası.', owner: 'işletme' },
  VERGİ_DAİRESİ_VE_NO: { description: 'Vergi dairesi ve vergi kimlik numarası.', owner: 'mali müşavir' },
  ADRES: { description: 'Tebligata elverişli açık adres (merkez/iş adresi).', owner: 'işletme' },
  KEP_ADRESİ: { description: 'Kayıtlı elektronik posta (KEP) adresi.', owner: 'işletme' },
  İLETİŞİM_EPOSTA: { description: 'Genel iletişim e-posta adresi.', owner: 'işletme' },
  İLETİŞİM_TELEFON: { description: 'İletişim telefon numarası.', owner: 'işletme' },
  SİTE_ALAN_ADI: { description: 'Sitenin nihai alan adı (ADR-0014 Açık Soru 2 — henüz belirsiz).', owner: 'işletme' },

  // --- KVKK ---
  KVKK_BAŞVURU_EPOSTA: {
    description: 'Veri sahibi başvurularının alınacağı e-posta adresi (eski metindeki adres doğrulanmadığı için taşınmadı).',
    owner: 'hukuk',
  },
  VERBİS_DURUMU: {
    description: 'Veri Sorumluları Sicili (VERBİS) kayıt yükümlülüğü var mı, varsa kayıt bilgisi; yoksa dayanağı (istisna/muafiyet).',
    owner: 'hukuk',
  },
  YURT_DIŞI_AKTARIM_DURUMU: {
    description:
      'Kişisel verilerin yurt dışına aktarılıp aktarılmadığı ve KVKK md. 9 kapsamındaki dayanak (yeterlilik kararı, standart sözleşme, bildirim vb.). Veritabanı, dosya depolama ve barındırma bölgelerine bağlıdır.',
    owner: 'hukuk',
  },
  ALT_İŞLEYEN_LİSTESİ: {
    description:
      'Veri işleyen/alt işleyen sağlayıcılar: ad, hizmet türü (barındırma, veritabanı, dosya depolama, e-posta gönderimi), işleme bölgesi.',
    owner: 'hukuk',
  },
  BARINDIRMA_ERİŞİM_KAYITLARI: {
    description: 'Sitenin barındırıldığı statik host sağlayıcısının tuttuğu erişim kaydı türleri ve süresi (host seçimi henüz yapılmadı).',
    owner: 'işletme',
  },
  ÖDEME_HİZMET_SAĞLAYICISI: {
    description: 'Ödeme hizmet sağlayıcısının adı ve unvanı (canlı üye işyeri hesabı henüz yok; seçim önerisi ADR-0008\'dedir).',
    owner: 'işletme',
  },

  // --- Saklama / imha ---
  SAKLAMA_SÜRESİ_HESAP_VERİSİ: {
    description: 'Hesap ve kimlik verisinin saklama süresi ve başlangıç olayı (ör. hesap kapanışından itibaren).',
    owner: 'hukuk',
  },
  SAKLAMA_SÜRESİ_FATURA_VERİSİ: {
    description: 'Fatura ve ödeme kayıtlarının yasal saklama süresi (vergi/ticaret mevzuatı).',
    owner: 'mali müşavir',
  },
  SAKLAMA_SÜRESİ_GÜNLÜK_KAYITLARI: {
    description:
      'Güvenlik/denetim ve işlem günlüklerinin saklama süresi (mevcut teknik ayar: denetim kaydı 365 gün, işlem günlüğü 90 gün otomatik silinir — hukuki süre kararı insana aittir).',
    owner: 'hukuk',
  },
  İMHA_PERİYODİK_ARALIĞI: {
    description: 'Periyodik imha aralığı (Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik uyarınca imha politikasında belirlenir).',
    owner: 'hukuk',
  },

  // --- Abonelik / ödeme / iade ---
  KDV_GÖSTERİM_ŞEKLİ: {
    description: 'Fiyatların KDV dahil mi hariç mi gösterileceği ve KDV oranı (öneri fixture\'ı KDV hariçtir; nihai karar mali müşavirindir).',
    owner: 'mali müşavir',
  },
  FATURA_DÜZENLEME_ŞEKLİ: {
    description: 'Abonelik ücreti faturasının türü (e-Arşiv/e-Fatura), düzenleme zamanı ve iletim yolu.',
    owner: 'mali müşavir',
  },
  İADE_POLİTİKASI: {
    description:
      'Ücretli abonelikte ücret iadesi yapılıp yapılmayacağı, koşulları ve süresi. Eski metin "iade yapılmaz" diyordu; bu karar ADR-0008\'de verilmemiştir.',
    owner: 'hukuk',
  },
  YILLIK_PLAN_İADE_KARARI: {
    description: 'Yıllık plan dönem ortasında iptal edilirse kalan dönem için (kısmi) iade yapılıp yapılmayacağı.',
    owner: 'ürün/işletme',
  },
  İADE_YÖNTEMİ_VE_SÜRESİ: {
    description: 'İadenin hangi yöntemle (ödeme yapılan karta vb.) ve kaç gün içinde yapılacağı.',
    owner: 'işletme',
  },
  İPTAL_TALEBİ_KANALI: {
    description: 'Aboneliğin nereden iptal edileceği (uygulama içi abonelik ekranı iptal işlevi henüz yok; geçici kanal e-posta olabilir).',
    owner: 'ürün/işletme',
  },
  PLAN_DEĞİŞİKLİĞİ_USULÜ: {
    description: 'Plan yükseltme/düşürme usulü ve dönem içi orantılı (proration) ücretlendirme olup olmadığı (self-servis plan değişikliği henüz yok).',
    owner: 'ürün/işletme',
  },
  FİYAT_DEĞİŞİKLİĞİ_BİLDİRİM_SÜRESİ: {
    description: 'Fiyat değişikliğinin yürürlükten en az kaç gün önce ve hangi kanalla bildirileceği.',
    owner: 'hukuk',
  },
  FİYAT_DEĞİŞİKLİĞİ_UYGULAMA_DÖNEMİ: {
    description: 'Yeni fiyatın hangi dönemden itibaren uygulanacağı (ör. bir sonraki yenileme döneminden).',
    owner: 'hukuk',
  },
  KOŞUL_DEĞİŞİKLİĞİ_BİLDİRİM_SÜRESİ: {
    description: 'Kullanım/abonelik koşulları değiştiğinde bildirim süresi ve kanalı.',
    owner: 'hukuk',
  },
  ASKIYA_ALMA_BİLDİRİM_USULÜ: {
    description: 'Koşul ihlali veya güvenlik tehdidi nedeniyle erişimin kısıtlanmasında bildirim usulü ve itiraz yolu.',
    owner: 'hukuk',
  },
  SORUMLULUK_SINIRI_KARARI: {
    description: 'Hizmet Sağlayıcı\'nın sorumluluk sınırının kapsamı ve tutarı (mevzuatın izin verdiği ölçüde).',
    owner: 'hukuk',
  },
  YETKİLİ_MAHKEME: {
    description: 'Uyuşmazlıkta yetkili mahkeme ve icra daireleri (eski metindeki yer doğrulanmadı).',
    owner: 'hukuk',
  },
  YÜRÜRLÜK_TARİHİ: { description: 'Metnin yürürlüğe gireceği tarih (hukuki onay sonrası).', owner: 'hukuk' },

  // --- Mesafeli satış ---
  MESAFELİ_SÖZLEŞME_UYGULANABİLİRLİĞİ: {
    description:
      'Mesafeli sözleşme mevzuatının (6502 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği) B2B/ticari amaçlı aboneler için uygulanıp uygulanmadığı ve tüketici niteliğindeki alıcılar için nasıl işletileceği.',
    owner: 'hukuk',
  },
  CAYMA_HAKKI_KARARI: {
    description:
      'Bu hizmet için cayma hakkının kullanılıp kullanılamayacağı (elektronik ortamda anında ifa edilen hizmet ve tüketici onayıyla ifaya başlanan hizmet istisnalarının uygulanıp uygulanmadığı) ve cayma bildirim yöntemi.',
    owner: 'hukuk',
  },
  TÜKETİCİ_HAKEM_HEYETİ_PARA_SINIRLARI: {
    description: 'Tüketici hakem heyeti ve tüketici mahkemesi parasal başvuru sınırları (her yıl güncellenir; yayın anındaki değer yazılmalı).',
    owner: 'hukuk',
  },

  // --- Veri işleme ekleri ---
  İHLAL_BİLDİRİM_SÜRESİ: {
    description: 'Veri ihlali fark edildiğinde Aboneye bildirim süresi (sözleşmesel taahhüt; KVKK Kurulu\'na bildirim süreleri ayrıca mevzuattadır).',
    owner: 'hukuk',
  },
}

export const placeholderKeys = Object.keys(placeholders)

/**
 * Çözülmüş yer tutucular (S16) — değeri işletme tarafından VERİLMİŞ anahtarlar. Tek kaynak `src/data/company.ts`.
 * Metinde `{{ANAHTAR}}` olarak kalırlar (kayıt ve yasaklı-ifade denetimi değişmez); görüntülenirken değerle
 * değiştirilir ve "Doldurulması gereken alanlar" listesinden düşer (`pendingPlaceholderKeys`).
 * Yalnızca İLETİŞİM_EPOSTA (kullanıcı kararı, 2026-09-30) ve — girildiğinde — ADRES çözülür; KVKK_BAŞVURU_EPOSTA
 * vb. diğer anahtarlar ayrı insan/hukuk kararıdır ve DOKUNULMAZ.
 */
export const placeholderValues: Readonly<Partial<Record<string, string>>> = {
  İLETİŞİM_EPOSTA: company.email,
  ...(hasValue(company.address) ? { ADRES: company.address.trim() } : {}),
  ...(hasValue(company.legalName) ? { ŞİRKET_UNVANI: company.legalName.trim() } : {}),
  ...(hasValue(company.mersisNo) ? { MERSİS_NO: company.mersisNo.trim() } : {}),
}
