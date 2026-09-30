/**
 * Rehber kaynak defteri (KB §1, erişim 2026-09-30). YALNIZCA sitede gösterilebilecek kaynaklar buradadır:
 * KB §14'te `[RAKİP-ADI]` işaretli kaynaklar (S9, S10, S11, S12, S31, S33, S34, S38, S42, S48, S49) ve yalnız
 * tanıtım amaçlı S50 bu dosyaya BİLEREK alınmadı; bunlar sitede kaynak olarak da gösterilmez.
 *
 * Güven: `R` resmi (kamu kurumu / platformun kendi sitesi), `İ` ikincil (haber, üçüncü taraf yayın).
 * `summaryOnly`: KB turunda sayfa gövdesi okunamadı, yalnız başlık/arama özeti görüldü (sitede "özet" notu çıkar).
 */
export type SourceId =
  | 'S1'
  | 'S2'
  | 'S3'
  | 'S4'
  | 'S5'
  | 'S6'
  | 'S7'
  | 'S8'
  | 'S13'
  | 'S14'
  | 'S15'
  | 'S16'
  | 'S17'
  | 'S18'
  | 'S19'
  | 'S20'
  | 'S21'
  | 'S22'
  | 'S23'
  | 'S24'
  | 'S25'
  | 'S26'
  | 'S27'
  | 'S28'
  | 'S29'
  | 'S30'
  | 'S32'
  | 'S35'
  | 'S36'
  | 'S39'
  | 'S40'
  | 'S41'
  | 'S46'
  | 'S47'

export type Trust = 'R' | 'İ'

export interface Source {
  id: SourceId
  title: string
  publisher: string
  url: string
  trust: Trust
  summaryOnly?: boolean
  accessed: string
}

const ACCESSED = '2026-09-30'

const s = (id: SourceId, trust: Trust, publisher: string, title: string, url: string, summaryOnly = false): Source => ({
  id,
  trust,
  publisher,
  title,
  url,
  summaryOnly,
  accessed: ACCESSED,
})

export const sources: Record<SourceId, Source> = {
  S1: s('S1', 'R', 'T.C. Ticaret Bakanlığı', "Türkiye'de E-Ticaretin Görünümü raporu yayımlandı (duyuru)", 'https://ticaret.gov.tr/duyurular/turkiyede-e-ticaretin-gorunumu-raporu-yayinlandi-12-05-2026'),
  S2: s('S2', 'R', 'ETBİS (Ticaret Bakanlığı)', "Türkiye'de E-Ticaretin Görünümü raporunun İngilizce sürümü", 'https://etbis.ticaret.gov.tr/tr/Post/postturkiyede-e-ticaretin-gorunumu-raporunun-ingilizce-versiyonu-yayimlandi', true),
  S3: s('S3', 'İ', 'Alo Maliye', "Türkiye'de e-ticaret hacmi 2025 yılı haberi", 'https://www.alomaliye.com/2026/05/12/turkiyede-e-ticaret-hacmi-2025te-4-6-trilyon-liraya-ulasti/'),
  S4: s('S4', 'İ', 'Dünya Gazetesi', 'E-ticaret hacmi haberi', 'https://www.dunya.com/ekonomik-veriler/e-ticarette-dev-buyume-hacim-45-trilyon-lirayi-gecti-haberi-840243', true),
  S5: s('S5', 'R', 'Resmî Gazete', "509 Sıra No'lu Vergi Usul Kanunu Genel Tebliği değişikliği", 'https://www.resmigazete.gov.tr/eskiler/2021/02/20210209-5.htm', true),
  S6: s('S6', 'R', 'Gelir İdaresi Başkanlığı', "509 Sıra No'lu VUK Genel Tebliği (güncel metin, PDF)", 'https://cdn.gib.gov.tr/api/gibportal-file/file/getFile?objectKey=MEVZUAT_TEBLIGLER%2FUNIVERSAL%2F2026%2FMEVZUAT_TEBLIGLER_2026_VukTeb509_Guncel.pdf', true),
  S7: s('S7', 'R', 'Gelir İdaresi Başkanlığı', 'e-Fatura bilgilendirme infografiği (PDF)', 'https://cdn.gib.gov.tr/api/gibportal-file/file/getFileResources?objectKey=arsiv%2Fyardim-kaynaklar%2Finfografikler%2Fpdfs%2F2025_e_fatura.pdf', true),
  S8: s('S8', 'R', 'Gelir İdaresi Başkanlığı (e-Belge)', 'e-İrsaliye hakkında', 'https://ebelge.gib.gov.tr/eirsaliyehakkinda.html'),
  S13: s('S13', 'R', 'Mevzuat Bilgi Sistemi', '6502 sayılı Tüketicinin Korunması Hakkında Kanun', 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6502&MevzuatTur=1&MevzuatTertip=5', true),
  S14: s('S14', 'R', 'T.C. Ticaret Bakanlığı', '6502 sayılı Kanun ve ikincil mevzuat derlemesi (PDF)', 'https://tuketici.ticaret.gov.tr/data/5e81982d13b876a1b04c7a42/Tuketicinin_Korunmasi_Hakkinda_Kanun_6502_Ocak_2021.pdf', true),
  S15: s('S15', 'R', 'T.C. Ticaret Bakanlığı', 'Mesafeli sözleşmeler hakkında tüketici bilgilendirmesi', 'https://tuketici.ticaret.gov.tr/yayinlar/tuketici-bilgi-rehberi/mesafeli-sozlesmeler-hakkinda-bilgilendirme', true),
  S16: s('S16', 'İ', 'Alo Maliye', 'Mesafeli Sözleşmeler Yönetmeliğinde değişiklik', 'https://www.alomaliye.com/2025/05/24/mesafeli-sozlesmeler-yonetmeliginde-degisiklik-24-05-2025/'),
  S17: s('S17', 'İ', 'CNN Türk', 'E-alışverişte yeni dönem: değişiklik Resmî Gazete’de', 'https://www.cnnturk.com/ekonomi/e-alisveriste-yeni-donem-resmi-gazetede-yayimlandi-1829195'),
  S18: s('S18', 'R', 'T.C. Ticaret Bakanlığı', 'İnternet alışverişlerinde cayma hakkının kaldırıldığı haberlerine ilişkin açıklama', 'https://ticaret.gov.tr/haberler/ticaret-bakanligi-internet-alisverislerinde-cayma-hakkinin-kaldirildigina-yonelik-haberleri-yalanladi', true),
  S19: s('S19', 'R', 'Kişisel Verileri Koruma Kurumu', 'VERBİS kayıt istisnası: Kurul kararının uygulama esasları (kamuoyu duyurusu)', 'https://www.kvkk.gov.tr/Icerik/8577/kisisel-verileri-koruma-kurulunun-04-09-2025-tarihli-ve-2025-1572-sayili-kararinin-uygulama-esaslarina-iliskin-kamuoyu-duyurusu'),
  S20: s('S20', 'R', 'Kişisel Verileri Koruma Kurumu', 'VERBİS kayıt süresi hakkında kamuoyu duyurusu', 'https://www.kvkk.gov.tr/Icerik/8752/2025-yili-mali-bilanco-toplami-bakimindan-sicile-kayit-yukumlulugu-dogan-kurumlar-vergisi-mukellefi-tuzel-kisi-veri-sorumlularinin-verbis-kayit-suresi-hakkinda-kamuoyu-duyurusu'),
  S21: s('S21', 'R', 'Kişisel Verileri Koruma Kurumu', 'Sicile kayıt istisnaları', 'https://www.kvkk.gov.tr/Icerik/5273/Istisna', true),
  S22: s('S22', 'R', 'Kişisel Verileri Koruma Kurumu', 'Veri Sorumluları Sicil Bilgi Sistemi kılavuzu (PDF)', 'https://verbis.kvkk.gov.tr/sharedFolder/veri-sorumlulari-sicil-bilgi-sistemi-kilavuzu.pdf?ts=20251006', true),
  S23: s('S23', 'R', 'İleti Yönetim Sistemi', 'İYS nedir?', 'https://iys.org.tr/iys/nedir', true),
  S24: s('S24', 'R', 'T.C. Ticaret Bakanlığı', 'Ticari Elektronik İleti Yönetim Sistemi (İYS)', 'https://ticaret.gov.tr/ic-ticaret/bilgi-sistemleri/ticari-elektronik-ileti-yonetim-sistemi-iys', true),
  S25: s('S25', 'R', 'İleti Yönetim Sistemi', 'Sıkça sorulan sorular', 'https://iys.org.tr/iys/sss', true),
  S26: s('S26', 'R', 'İleti Yönetim Sistemi', 'İlgili mevzuat', 'https://iys.org.tr/iys/kanun', true),
  S27: s('S27', 'İ', 'Lexpera', 'Elektronik Ticarette Hizmet Sağlayıcı ve Aracı Hizmet Sağlayıcılar Hakkında Yönetmelik', 'https://www.lexpera.com.tr/resmi-gazete/metin/elektronik-ticarette-hizmet-saglayici-ve-araci-hizmet-saglayicilar-hakkinda-yonetmelik-29457'),
  S28: s('S28', 'İ', 'Alo Maliye', 'Elektronik ticarette hizmet sağlayıcı', 'https://alomaliye.com/2015/08/26/elektronik-ticarette-hizmet-saglayici/'),
  S29: s('S29', 'İ', 'Cottgroup', 'İleti Yönetim Sistemi ve yeni uygulamalar', 'https://www.cottgroup.com/tr/mevzuat/item/ileti-yonetim-sistemi-ve-yeni-uygulamalar'),
  S30: s('S30', 'R', 'Trendyol Developers', 'Trendyol Marketplace API: başlarken', 'https://developers.trendyol.com/docs/getting-started'),
  S32: s('S32', 'İ', 'Tamindir', 'Trendyol satıcı olma işlemleri', 'https://www.tamindir.com/blog/trendyol-satici-olma-islemleri_90568/'),
  S35: s('S35', 'İ', 'Haber Gazetesi', 'Hepsiburada entegrasyonu için izlenecek adımlar', 'https://www.habergazetesi.com.tr/hepsiburada-entegrasyon-icin-hangi-adimlari-izlemeliyim'),
  S36: s('S36', 'R', 'Hepsiburada', 'Hepsiburada geliştirici portalı', 'https://developers.hepsiburada.com', true),
  S39: s('S39', 'R', 'Türkiye İş Bankası', 'Pazaryeri çözümleri', 'https://www.isbank.com.tr/is-ticari/pazaryeri-cozumleri', true),
  S40: s('S40', 'R', 'Amazon', 'Selling Partner API (Türkiye) geliştirici sayfası', 'https://developer.amazonservices.com/tr'),
  S41: s('S41', 'R', 'Amazon', 'Üçüncü taraf SP-API geliştirici ücretlerinin iptali duyurusu', 'https://developer.amazonservices.com/tr/amazon-ucuncu-taraf-sp-api-gelistirici-ucretlerini-iptal-etti'),
  S46: s('S46', 'R', 'Ideasoft', 'Yardım: API kullanımı', 'https://www.ideasoft.com.tr/yardim/api-kullanimi/'),
  S47: s('S47', 'R', 'Ideasoft', 'Muhasebe entegrasyonları', 'https://www.ideasoft.com.tr/eticaret-cozum-merkezi/muhasebe-entegrasyonlari/'),
}

export const TRUST_LABEL: Record<Trust, string> = { R: 'Resmi kaynak', İ: 'İkincil kaynak' }
