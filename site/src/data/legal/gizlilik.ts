import type { LegalDoc } from './types'

export const gizlilik: LegalDoc = {
  slug: 'gizlilik',
  title: 'Gizlilik Politikası',
  description: 'Entegrasyonik’in verilerinizi nasıl koruduğu, kimlerle paylaştığı ve hesap silme sürecinin nasıl işlediği (taslak).',
  version: '0.1.0-taslak',
  updatedAt: '2026-09-28',
  summary:
    'Verilerinizi hangi teknik ve idari önlemlerle koruduğumuzu, kimlerle paylaştığımızı ve hesabınızı kapattığınızda verilerinize ne olduğunu açıklar.',
  sections: [
    {
      id: 'kapsam',
      title: '1. Kapsam',
      blocks: [
        {
          type: 'p',
          text: 'Bu politika, Entegrasyonik tanıtım sitesi ve Entegrasyonik uygulaması için geçerlidir. Kişisel verilerin işlenmesine ilişkin zorunlu bilgiler [KVKK Aydınlatma Metni](/yasal/kvkk-aydinlatma) sayfasındadır; çerezler için [Çerez Politikası](/yasal/cerez) sayfasına bakınız.',
        },
        {
          type: 'p',
          text: 'Veri sorumlusu: {{ŞİRKET_UNVANI}} ([Künye](/yasal/kunye)).',
        },
      ],
    },
    {
      id: 'topladigimiz-veriler',
      title: '2. Neleri topluyoruz, neleri toplamıyoruz?',
      blocks: [
        {
          type: 'ul',
          items: [
            '**Tanıtım sitesi:** Form, çerez, analitik veya reklam aracı yoktur; site sizden kişisel veri istemez.',
            '**Hesap:** Ad, soyad, e-posta adresi ve parola; isteğe bağlı olarak mağaza adı. Parolanız düz metin olarak saklanmaz; geri döndürülemez biçimde özetlenir.',
            '**Uygulama kullanımı sırasında:** Bağladığınız pazaryeri ve entegrasyonlardan ürün, stok, fiyat, sipariş, iade ve mesaj verileri; bu veriler sizin talimatınızla ve yalnızca hizmeti sunmak için işlenir.',
            '**Güvenlik kayıtları:** Kullanıcı ve hesap tanımlayıcısı, IP adresi, işlem türü ve sonucu; e-posta adresi, parola veya istek içeriği bu kayıtlara yazılmaz.',
            '**Abonelik ve fatura:** Fatura bilgileri ve abonelik durumu. **Kart numaranız ve güvenlik kodunuz bize hiç ulaşmaz;** ödeme sağlayıcısının barındırdığı form üzerinden alınır.',
          ],
        },
        {
          type: 'note',
          text: '“Form yok” beyanı sitenin bugünkü hâline (S0) göredir; /iletisim sayfasına form eklenirse metin güncellenmelidir. Abonelik/fatura alanlarının toplanma zamanı (ADR-0008 §5) uygulamayla birlikte doğrulanmalıdır.',
        },
      ],
    },
    {
      id: 'koruma',
      title: '3. Verilerinizi nasıl koruyoruz?',
      blocks: [
        {
          type: 'p',
          text: 'Aşağıdaki önlemler sistemde uygulanmaktadır. Mutlak güvenlik garantisi verilemez; önlemler düzenli olarak gözden geçirilir.',
        },
        {
          type: 'ul',
          items: [
            '**Kiracı izolasyonu:** Her hesabın (kiracının) verisi ayrı bir veritabanında tutulur.',
            '**Şifrelenmiş sırlar:** Pazaryeri ve entegrasyon kimlik bilgileri (API anahtarları, gizli anahtarlar) veritabanında AES-256-GCM ile şifrelenmiş olarak saklanır; uygulama arayüzü ve API yanıtlarında gizli alanlar maskelenir.',
            '**Parola güvenliği:** Parolalar geri döndürülemez biçimde özetlenir; hatalı denemelerde hesap geçici olarak kilitlenir.',
            '**Oturum güvenliği:** Oturum bilgisi JavaScript ile okunamayan (HttpOnly) çerezde tutulur ve süresi sınırlıdır.',
            '**Rol tabanlı erişim:** Hesap içinde işlemler kullanıcı rolüne göre sınırlandırılır; hassas işlemler yönetici yetkisi gerektirir.',
            '**Denetim kaydı:** Güvenlik açısından önemli olaylar, kişisel veri içermeyecek biçimde kayıt altına alınır.',
            '**Ödeme güvenliği:** Kart verisi sistemimizden geçmez ve saklanmaz.',
          ],
        },
        {
          type: 'note',
          text: 'Bu maddedeki her önlem koddan/ADR’lerden doğrulanmıştır (ADR-0001, ADR-0003, ADR-0008). Güvenlik sertifikası, veri merkezi seviyesi, veri konumu ve kesinti oranı gibi doğrulanamayan iddialar bilinçli olarak yazılmamıştır.',
        },
      ],
    },
    {
      id: 'paylasim',
      title: '4. Verilerinizi kimlerle paylaşıyoruz?',
      blocks: [
        {
          type: 'ul',
          items: [
            'Verilerinizi reklam ağlarına satmayız ve reklam amacıyla üçüncü taraflarla paylaşmayız.',
            'Hizmeti sunmak için altyapı sağlayıcılarıyla (barındırma, veritabanı, dosya depolama, e-posta gönderimi) çalışırız: {{ALT_İŞLEYEN_LİSTESİ}}',
            'Abonelik ödemesi için ödeme hizmet sağlayıcısıyla çalışırız: {{ÖDEME_HİZMET_SAĞLAYICISI}}',
            'Verileriniz, yalnızca sizin bağladığınız pazaryeri ve entegrasyon platformlarına, sizin talimatınızla iletilir.',
            'Yasal bir yükümlülük gerektirdiğinde yetkili kamu kurumlarıyla paylaşılabilir.',
          ],
        },
        {
          type: 'p',
          text: 'Yurt dışına aktarım: {{YURT_DIŞI_AKTARIM_DURUMU}}',
        },
        {
          type: 'note',
          text: '“Satmayız/paylaşmayız” ifadesi işletmenin taahhüdüdür; işletme onayı gerekir. Yurt dışı aktarım değerlendirmesi hukuk kararıdır (KVKK md. 9).',
        },
      ],
    },
    {
      id: 'saklama-silme',
      title: '5. Saklama, dışa aktarma ve silme',
      blocks: [
        {
          type: 'p',
          text: 'Saklama süreleri [KVKK Aydınlatma Metni](/yasal/kvkk-aydinlatma) içindeki tabloda yer alır. Hesap sahibi olarak şunları isteyebilirsiniz:',
        },
        {
          type: 'ul',
          items: [
            '**Verilerinizin dışa aktarılması:** Hesabınızdaki verilerin bir kopyası.',
            '**Hesabın silinmesi:** Silme talebi iki aşamalıdır. Talepten sonra 30 günlük bir bekleme süresi başlar; bu sürede talep geri alınabilir. Süre dolduğunda hesabınızın verileri kalıcı olarak silinir ve bu işlem geri alınamaz.',
          ],
        },
        {
          type: 'p',
          text: 'Abonelik iptalinin veri erişimine etkisi için [Abonelik Sözleşmesi](/yasal/abonelik-sozlesmesi) sayfasına bakınız. Talepleriniz için: {{İLETİŞİM_EPOSTA}}',
        },
        {
          type: 'note',
          text: '30 günlük bekleme süresi ve dışa aktarma/silme işlemleri backend’de vardır (ADR-0003, TenantLifecycleService); uygulama arayüzünde bu işlemlerin başlatılabildiği ekran yayından önce doğrulanmalı, yoksa talep kanalı yukarıdaki e-posta olarak kalmalıdır. Abonelik iptalinden sonraki 30 günlük salt-okunur dönemle (ADR-0008) bu süre birbirine nasıl bağlanacak, hukuk/ürün kararıdır.',
        },
      ],
    },
    {
      id: 'ihlal',
      title: '6. Güvenlik ihlali olursa',
      blocks: [
        {
          type: 'p',
          text: 'Verilerinizi etkileyen bir güvenlik ihlali tespit edilirse, mevzuatın öngördüğü usul ve sürelerle ilgili kurumlara ve etkilenen kişilere bildirim yapılır. Abonelere bildirim süresi: {{İHLAL_BİLDİRİM_SÜRESİ}}.',
        },
      ],
    },
    {
      id: 'haklar-iletisim',
      title: '7. Haklarınız ve iletişim',
      blocks: [
        {
          type: 'p',
          text: 'KVKK md. 11 kapsamındaki haklarınız ve başvuru yolları [KVKK Aydınlatma Metni](/yasal/kvkk-aydinlatma) sayfasındadır. Gizlilikle ilgili sorularınız için: {{İLETİŞİM_EPOSTA}}. Yürürlük tarihi: {{YÜRÜRLÜK_TARİHİ}}.',
        },
      ],
    },
  ],
}
