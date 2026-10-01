import type { LegalDoc } from './types'

export const onBilgilendirme: LegalDoc = {
  slug: 'on-bilgilendirme',
  title: 'Ön Bilgilendirme Formu',
  description:
    'Mesafeli hizmet sözleşmesi öncesi ön bilgilendirme: satıcı bilgileri, hizmetin nitelikleri, fiyat, ifa, cayma hakkı ve başvuru yolları (taslak).',
  version: '0.1.0-taslak',
  updatedAt: '2026-09-28',
  summary:
    'Abonelik sözleşmesini kurmadan önce bilmeniz gereken temel bilgileri, tüketici niteliğindeki alıcılar için cayma hakkı ve başvuru yollarıyla birlikte özetler.',
  sections: [
    {
      id: 'uygulanabilirlik',
      title: '1. Bu form kimler için?',
      blocks: [
        {
          type: 'p',
          text: 'Entegrasyonik ağırlıklı olarak ticari faaliyet için kullanılan bir hizmettir. Bu form, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği kapsamında “tüketici” sayılabilecek alıcılara yönelik ön bilgilendirmeyi içerir. Mevzuatın ticari amaçlı aboneler için ve tüketici niteliğindeki alıcılar için nasıl uygulanacağı: {{MESAFELİ_SÖZLEŞME_UYGULANABİLİRLİĞİ}}',
        },
        {
          type: 'note',
          text: 'Mesafeli sözleşme mevzuatının B2B abonelere uygulanıp uygulanmadığı ve bu formun kayıt/ödeme akışında zorunlu onay olup olmayacağı hukuk kararıdır (ADR-0014 Açık Soru 4). Kayıt formundaki onay kutusu bağlantıları uygulama tarafında (S4) ayrı yapılır.',
        },
      ],
    },
    {
      id: 'satici',
      title: '2. Satıcı (hizmet sağlayıcı) bilgileri',
      blocks: [
        {
          type: 'table',
          caption: 'Satıcı bilgileri',
          head: ['Bilgi', 'Değer'],
          rows: [
            ['Unvan', '{{ŞİRKET_UNVANI}}'],
            ['MERSİS numarası', '{{MERSİS_NO}}'],
            ['Adres', '{{ADRES}}'],
            ['Telefon', '{{İLETİŞİM_TELEFON}}'],
            ['E-posta', '{{İLETİŞİM_EPOSTA}}'],
            ['KEP adresi', '{{KEP_ADRESİ}}'],
          ],
        },
      ],
    },
    {
      id: 'hizmet-nitelik',
      title: '3. Hizmetin temel nitelikleri',
      blocks: [
        {
          type: 'ul',
          items: [
            'Hizmet, tarayıcı üzerinden kullanılan bir platform hizmetidir (SaaS); fiziksel bir ürün teslim edilmez.',
            'Plan içerikleri, limitler ve özellikler fiyatlandırma sayfasında ve uygulamadaki abonelik ekranında gösterilir.',
            'Yeni hesaplar 14 günlük ücretsiz denemeyle başlar; deneme için kart bilgisi istenmez ([Abonelik Sözleşmesi](/yasal/abonelik-sozlesmesi)).',
          ],
        },
      ],
    },
    {
      id: 'fiyat-odeme-ifa',
      title: '4. Fiyat, ödeme ve ifa',
      blocks: [
        {
          type: 'ul',
          items: [
            'Fiyat, seçilen plana ve döneme (aylık veya yıllık) göre ödeme adımında ve abonelik ekranında gösterilir. Vergiler dahil toplam fiyat gösterimi: {{KDV_GÖSTERİM_ŞEKLİ}}',
            'Ödeme, ödeme hizmet sağlayıcısının barındırdığı güvenli form üzerinden yapılır: {{ÖDEME_HİZMET_SAĞLAYICISI}}. Kart bilgileriniz Hizmet Sağlayıcı sistemlerinden geçmez.',
            'Ücretli abonelik, iptal edilmediği sürece her dönem sonunda otomatik yenilenir.',
            'İfa: Hizmet, hesap açıldığında elektronik ortamda kullanıma sunulur; ücretli plana geçişte plan limitleri ödemenin başarıyla alınmasından sonra devreye girer.',
          ],
        },
      ],
    },
    {
      id: 'cayma',
      title: '5. Cayma hakkı',
      blocks: [
        {
          type: 'p',
          text: 'Tüketici niteliğindeki alıcılar, mevzuatta öngörülen süre içinde gerekçe göstermeden ve cezai şart ödemeden sözleşmeden cayma hakkına sahip olabilir. Ancak mevzuat, elektronik ortamda anında ifa edilen hizmetler ile cayma süresi dolmadan tüketicinin onayıyla ifasına başlanan hizmetler için cayma hakkını sınırlayabilir. Bu hizmet için cayma hakkının kullanılıp kullanılamayacağı ve cayma bildirim yöntemi: {{CAYMA_HAKKI_KARARI}}',
        },
        {
          type: 'p',
          text: 'Cayma hakkının kullanılabildiği durumlarda bildirim, yukarıdaki satıcı iletişim bilgilerinden birine yazılı olarak yapılır; Mesafeli Sözleşmeler Yönetmeliği’ndeki örnek cayma formu kullanılabilir. Ücret iadesi için [İptal ve İade Koşulları](/yasal/iptal-iade) sayfasına bakınız.',
        },
        {
          type: 'note',
          text: 'Eski metin, “anında ifa” gerekçesiyle iade yapılmadığını söylüyordu. Bu istisnanın bu hizmet için geçerli olup olmadığı, hangi tüketici onayının (ve hangi ekranda) alınacağı hukuk kararıdır; ajan bu konuda hüküm yazmamıştır.',
        },
      ],
    },
    {
      id: 'sikayet',
      title: '6. Şikâyet ve uyuşmazlık çözümü',
      blocks: [
        {
          type: 'p',
          text: 'Şikâyetlerinizi öncelikle yukarıdaki iletişim bilgilerinden bize iletebilirsiniz. Tüketici işlemlerinde uyuşmazlık hâlinde, parasal sınırlara göre tüketici hakem heyetlerine veya tüketici mahkemelerine başvurabilirsiniz. Güncel parasal sınırlar: {{TÜKETİCİ_HAKEM_HEYETİ_PARA_SINIRLARI}}',
        },
      ],
    },
    {
      id: 'kisisel-veri',
      title: '7. Kişisel veriler',
      blocks: [
        {
          type: 'p',
          text: 'Kişisel verilerinizin işlenmesi [KVKK Aydınlatma Metni](/yasal/kvkk-aydinlatma) ve [Gizlilik Politikası](/yasal/gizlilik) sayfalarında açıklanmıştır. Yürürlük tarihi: {{YÜRÜRLÜK_TARİHİ}}.',
        },
      ],
    },
  ],
}
