import type { LegalDoc } from './types'

export const kvkkAydinlatma: LegalDoc = {
  slug: 'kvkk-aydinlatma',
  title: 'KVKK Aydınlatma Metni',
  description:
    'Entegrasyonik hesap, deneme ve abonelik süreçlerinde işlenen kişisel veriler, amaçlar, aktarım ve KVKK md. 11 hakları (taslak).',
  version: '0.1.0-taslak',
  updatedAt: '2026-09-28',
  summary:
    '6698 sayılı Kişisel Verilerin Korunması Kanunu md. 10 uyarınca, hangi kişisel verinizi hangi amaçla, hangi hukuki sebeple ve nasıl işlediğimizi anlatır.',
  sections: [
    {
      id: 'kapsam',
      title: '1. Bu metin kimi kapsar?',
      blocks: [
        {
          type: 'p',
          text: 'Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu’nun (“KVKK”) 10. maddesi ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca hazırlanmıştır. İki grubu kapsar:',
        },
        {
          type: 'ul',
          items: [
            '**Site ziyaretçileri:** Entegrasyonik tanıtım sitesini gezen herkes.',
            '**Aday ve aboneler:** Hesap açan, 14 günlük deneme başlatan veya ücretli plana geçen kişiler (hesap sahibi ve o hesaba eklenen kullanıcılar).',
          ],
        },
        {
          type: 'p',
          text: 'Abonenin kendi müşterilerine (pazaryeri siparişlerindeki alıcılara) ait veriler bu metnin konusu değildir; o verilerde Entegrasyonik veri işleyen sıfatıyla hareket eder. Ayrıntı için [Abonelik Sözleşmesi](/yasal/abonelik-sozlesmesi) içindeki veri işleme şartlarına bakınız.',
        },
      ],
    },
    {
      id: 'veri-sorumlusu',
      title: '2. Veri sorumlusu kimdir?',
      blocks: [
        {
          type: 'table',
          caption: 'Veri sorumlusu bilgileri',
          head: ['Bilgi', 'Değer'],
          rows: [
            ['Unvan', '{{ŞİRKET_UNVANI}}'],
            ['MERSİS numarası', '{{MERSİS_NO}}'],
            ['Adres', '{{ADRES}}'],
            ['E-posta', '{{İLETİŞİM_EPOSTA}}'],
            ['KEP adresi', '{{KEP_ADRESİ}}'],
            ['VERBİS durumu', '{{VERBİS_DURUMU}}'],
          ],
        },
        {
          type: 'p',
          text: 'Aynı bilgiler [Künye](/yasal/kunye) sayfasında da yer alır.',
        },
        {
          type: 'note',
          text: 'Şirket unvanı, MERSİS ve VERBİS bilgileri işletmece verilmelidir; doğrulanmamış unvan yazılmamıştır. VERBİS kayıt yükümlülüğünün doğup doğmadığı hukuk değerlendirmesidir.',
        },
      ],
    },
    {
      id: 'islenen-veriler',
      title: '3. Hangi verileriniz, hangi amaçla ve hangi sebeple işlenir?',
      blocks: [
        {
          type: 'p',
          text: 'Aşağıdaki tablo, sistemin gerçekte topladığı veri gruplarını, işleme amacını, hukuki sebebi ve toplama yöntemini gösterir. Listede olmayan bir veri, bu metin kapsamında işlenmez.',
        },
        {
          type: 'table',
          caption: 'Kişisel veri kategorileri, amaçlar, hukuki sebepler ve toplama yöntemi',
          head: ['Veri grubu', 'Veriler', 'Amaç', 'Hukuki sebep (KVKK md. 5/2)', 'Toplama yöntemi'],
          rows: [
            [
              '**Site ziyareti**',
              'Tanıtım sitesi form, çerez, analitik veya reklam aracı kullanmaz; kişisel veri toplamaz. Barındırma altyapısı teknik erişim kaydı tutabilir: {{BARINDIRMA_ERİŞİM_KAYITLARI}}',
              'Sitenin güvenli ve kesintisiz sunulması',
              'Meşru menfaat',
              'Otomatik (sunucu erişim kaydı)',
            ],
            [
              '**Hesap verisi**',
              'Ad, soyad, e-posta adresi, parola (yalnızca geri döndürülemez biçimde özetlenmiş hâliyle), isteğe bağlı mağaza adı',
              'Hesap oluşturma, kimlik doğrulama, hizmetin sunulması',
              'Sözleşmenin kurulması veya ifası',
              'Kayıt formu (sizin beyanınız)',
            ],
            [
              '**Oturum ve güvenlik kayıtları**',
              'Oturum çerezi, başarısız giriş sayacı ve geçici kilit, denetim kaydı (kullanıcı ve hesap tanımlayıcısı, IP adresi, işlem türü ve sonucu)',
              'Hesap ve bilgi güvenliğinin sağlanması, kötüye kullanımın önlenmesi',
              'Meşru menfaat; veri güvenliğine ilişkin hukuki yükümlülük',
              'Otomatik (uygulama kullanımı sırasında)',
            ],
            [
              '**Fatura ve abonelik verisi**',
              'Unvan, vergi kimlik/TCKN, vergi dairesi, fatura adresi, e-fatura mükellefiyeti, plan ve abonelik durumu; ödeme sağlayıcısından dönen maskeli kart bilgisi (kart numarasının son dört hanesi ve kart markası)',
              'Aboneliğin yürütülmesi, faturalandırma, muhasebe ve vergi yükümlülükleri',
              'Sözleşmenin kurulması veya ifası; hukuki yükümlülük',
              'Abonelik ve ödeme adımları (sizin beyanınız; ödeme sağlayıcısı)',
            ],
            [
              '**İletişim kayıtları**',
              'Bize e-posta ile yazdığınızda e-posta adresiniz ve mesaj içeriği',
              'Talep ve sorularınızın yanıtlanması',
              'Meşru menfaat; sözleşmenin ifası',
              'E-posta (sizin gönderiminiz)',
            ],
          ],
        },
        {
          type: 'p',
          text: '**Kart bilgileriniz** Entegrasyonik sistemlerinden geçmez ve saklanmaz; ödeme, ödeme hizmet sağlayıcısının barındırdığı form üzerinden alınır.',
        },
        {
          type: 'p',
          text: '**Pazaryeri ve entegrasyon kimlik bilgileri** (ör. API anahtarları) veritabanında şifrelenmiş olarak saklanır ve yalnızca sizin talimatınızla ilgili pazaryerine bağlanmak için kullanılır. Ayrıntı için [Gizlilik Politikası](/yasal/gizlilik) sayfasına bakınız.',
        },
        {
          type: 'note',
          text: 'Hukuki sebep eşleştirmeleri (md. 5/2 bentleri) ve “meşru menfaat” dengeleme testi hukuk incelemesinde teyit edilmelidir. Fatura verisi toplama adımı ADR-0008 uyarınca planlıdır; abonelik ekranındaki alanlarla birebir uyumu yayından önce doğrulanmalıdır.',
        },
      ],
    },
    {
      id: 'aktarim',
      title: '4. Verileriniz kimlere aktarılır?',
      blocks: [
        {
          type: 'p',
          text: 'Kişisel verileriniz, yukarıdaki amaçlarla sınırlı olarak aşağıdaki alıcı gruplarına aktarılabilir. Verileriniz reklam amacıyla üçüncü taraflara aktarılmaz.',
        },
        {
          type: 'table',
          caption: 'Alıcı grupları ve aktarım amaçları',
          head: ['Alıcı grubu', 'Aktarım amacı', 'Ayrıntı'],
          rows: [
            [
              'Altyapı ve hizmet sağlayıcılar (veri işleyenler)',
              'Barındırma, veritabanı, dosya depolama ve e-posta gönderimi',
              '{{ALT_İŞLEYEN_LİSTESİ}}',
            ],
            [
              'Ödeme hizmet sağlayıcısı',
              'Abonelik ödemesinin alınması ve yenilenmesi',
              '{{ÖDEME_HİZMET_SAĞLAYICISI}}',
            ],
            [
              'Bağladığınız pazaryeri ve entegrasyon platformları',
              'Sizin talimatınızla ürün, stok, fiyat ve sipariş işlemlerinin ilgili platforma iletilmesi',
              'Yalnızca sizin bağladığınız platformlara',
            ],
            [
              'Yetkili kamu kurum ve kuruluşları',
              'Yasal yükümlülüklerin yerine getirilmesi',
              'Mevzuatın öngördüğü ölçüde',
            ],
          ],
        },
        {
          type: 'p',
          text: '**Yurt dışına aktarım:** {{YURT_DIŞI_AKTARIM_DURUMU}}',
        },
        {
          type: 'note',
          text: 'Veritabanı, dosya depolama ve barındırma sağlayıcılarının işleme bölgeleri Türkiye dışında olabilir. Bu durumda KVKK md. 9 kapsamındaki dayanak (ve gerekiyorsa bildirim/standart sözleşme) belirlenmeden metin yayımlanmamalıdır. ADR-0008’deki “yurt dışı aktarım yok” notu yalnızca ödeme sağlayıcısı içindir.',
        },
      ],
    },
    {
      id: 'saklama',
      title: '5. Verileriniz ne kadar saklanır?',
      blocks: [
        {
          type: 'p',
          text: 'Verileriniz, işleme amacının gerektirdiği ve mevzuatın öngördüğü süre boyunca saklanır; süre sonunda silinir, yok edilir veya anonim hâle getirilir.',
        },
        {
          type: 'table',
          caption: 'Saklama süreleri',
          head: ['Veri grubu', 'Saklama süresi'],
          rows: [
            ['Hesap verisi', '{{SAKLAMA_SÜRESİ_HESAP_VERİSİ}}'],
            ['Fatura ve ödeme kayıtları', '{{SAKLAMA_SÜRESİ_FATURA_VERİSİ}}'],
            ['Güvenlik ve işlem günlükleri', '{{SAKLAMA_SÜRESİ_GÜNLÜK_KAYITLARI}}'],
            ['Periyodik imha aralığı', '{{İMHA_PERİYODİK_ARALIĞI}}'],
          ],
        },
        {
          type: 'p',
          text: 'Abonelik sona erdiğinde veya hesap silme talebi verildiğinde verilerin nasıl işleneceği [Abonelik Sözleşmesi](/yasal/abonelik-sozlesmesi) ve [İptal ve İade Koşulları](/yasal/iptal-iade) sayfalarında açıklanmıştır.',
        },
      ],
    },
    {
      id: 'haklariniz',
      title: '6. KVKK md. 11 kapsamındaki haklarınız',
      blocks: [
        { type: 'p', text: 'Veri sahibi olarak, veri sorumlusuna başvurarak aşağıdaki haklarınızı kullanabilirsiniz:' },
        {
          type: 'ul',
          items: [
            'Kişisel verilerinizin işlenip işlenmediğini öğrenme,',
            'İşlenmişse buna ilişkin bilgi talep etme,',
            'İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,',
            'Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme,',
            'Eksik veya yanlış işlenmişse düzeltilmesini isteme,',
            'KVKK md. 7 çerçevesinde silinmesini veya yok edilmesini isteme,',
            'Düzeltme, silme ve yok etme işlemlerinin aktarıldığı üçüncü kişilere bildirilmesini isteme,',
            'İşlenen verilerin münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç çıkmasına itiraz etme,',
            'Kanuna aykırı işlenmesi sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme.',
          ],
        },
        { type: 'h3', text: 'Başvuru yolu' },
        {
          type: 'p',
          text: 'Başvurunuzu, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ’e uygun olarak yazılı veya KEP yoluyla ya da güvenli elektronik imzalı e-posta ile iletebilirsiniz:',
        },
        {
          type: 'ul',
          items: ['Adres: {{ADRES}}', 'KEP: {{KEP_ADRESİ}}', 'E-posta: {{KVKK_BAŞVURU_EPOSTA}}'],
        },
        {
          type: 'p',
          text: 'Başvurunuz, talebin niteliğine göre en geç otuz gün içinde ücretsiz olarak sonuçlandırılır; işlemin ayrıca bir maliyet gerektirmesi hâlinde Kurulca belirlenen tarife uygulanabilir. Cevabı yetersiz bulmanız, başvurunuzun reddedilmesi veya süresinde cevap verilmemesi hâlinde Kişisel Verileri Koruma Kurulu’na şikâyette bulunma hakkınız saklıdır.',
        },
        {
          type: 'note',
          text: 'Süreler (30 gün cevap, Kurula şikâyet süreleri) ve başvuru kanalları hukuk incelemesinde güncel mevzuata göre teyit edilmelidir; Kurul şikâyet süreleri bilinçli olarak metne sayı olarak yazılmamıştır.',
        },
      ],
    },
    {
      id: 'guncelleme',
      title: '7. Bu metin nasıl güncellenir?',
      blocks: [
        {
          type: 'p',
          text: 'Bu metin, işleme faaliyetlerimiz veya mevzuat değiştiğinde güncellenir. Güncel sürüm ve tarih sayfanın başında yer alır. Yürürlük tarihi: {{YÜRÜRLÜK_TARİHİ}}.',
        },
      ],
    },
  ],
}
