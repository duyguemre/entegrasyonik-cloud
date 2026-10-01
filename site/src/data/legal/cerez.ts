import type { LegalDoc } from './types'

export const cerez: LegalDoc = {
  slug: 'cerez',
  title: 'Çerez Politikası',
  description: 'Entegrasyonik tanıtım sitesi çerez kullanmaz; uygulamada yalnızca oturum için zorunlu çerez kullanılır (taslak).',
  version: '0.1.0-taslak',
  updatedAt: '2026-09-28',
  summary: 'Tanıtım sitesi hiç çerez kullanmaz. Uygulama, giriş yapabilmeniz için yalnızca zorunlu bir oturum çerezi kullanır.',
  sections: [
    {
      id: 'ozet',
      title: '1. Kısaca',
      blocks: [
        {
          type: 'ul',
          items: [
            '**Tanıtım sitesi çerez kullanmaz.** Tarayıcınıza çerez yazmaz; analitik, reklam veya canlı destek aracı yüklemez. Tek istisna, sizin başlattığınız bir tercihtir: sayfa üstündeki “Animasyonları durdur” düğmesini kullanırsanız bu seçim (kişisel veri içermez) yalnızca sizin tarayıcınızın yerel depolamasında (localStorage) saklanır; siteye veya üçüncü kişilere gönderilmez. Bu nedenle sitede çerez onay bandı yoktur.',
            '**Uygulama** (giriş yaptığınız bölüm), oturumunuzu yürütmek için yalnızca zorunlu bir oturum çerezi kullanır.',
          ],
        },
        {
          type: 'p',
          text: 'Veri sorumlusu: {{ŞİRKET_UNVANI}}. Kişisel verilerin işlenmesi için [KVKK Aydınlatma Metni](/yasal/kvkk-aydinlatma) ve [Gizlilik Politikası](/yasal/gizlilik) sayfalarına bakınız.',
        },
      ],
    },
    {
      id: 'site',
      title: '2. Tanıtım sitesi',
      blocks: [
        {
          type: 'p',
          text: 'Site, yazı tipleri dahil tüm kaynaklarını kendi alan adından yükleyecek biçimde tasarlanmıştır; üçüncü taraf betik, yazı tipi, harita, video veya izleme aracı içermez. Dolayısıyla sitede çerez envanteri boştur.',
        },
        {
          type: 'p',
          text: 'Site içindeki “Giriş yap” ve “Ücretsiz deneyin” bağlantılarına tıkladığınızda uygulama sayfasına geçersiniz; uygulamada aşağıdaki bölüm geçerlidir.',
        },
        {
          type: 'note',
          text: 'Bu beyan sitenin bugünkü hâline göredir. İleride ölçüm/analitik veya üçüncü taraf bileşen eklenirse (ADR-0014 Açık Soru 6), bu politika güncellenmeli ve gerekiyorsa çerez onay yönetimi kurulmalıdır.',
        },
      ],
    },
    {
      id: 'uygulama',
      title: '3. Uygulama: çerez ve tarayıcı depolaması envanteri',
      blocks: [
        {
          type: 'table',
          caption: 'Uygulamada kullanılan çerez ve tarayıcı depolaması',
          head: ['Ad / tür', 'Sağlayıcı', 'Amaç', 'Süre', 'Kategori'],
          rows: [
            [
              'Oturum çerezi (HttpOnly; üretimde Secure)',
              'Entegrasyonik (birinci taraf)',
              'Giriş yapmış kullanıcının kimliğini doğrulamak ve oturumu yürütmek',
              'En fazla 8 saat; çıkış yapınca silinir',
              'Zorunlu',
            ],
            [
              'Dil tercihi (tarayıcı yerel depolaması)',
              'Entegrasyonik (birinci taraf)',
              'Seçtiğiniz arayüz dilini hatırlamak',
              'Siz silene kadar',
              'İşlevsel',
            ],
            [
              'Sekme durumu (tarayıcı oturum depolaması)',
              'Entegrasyonik (birinci taraf)',
              'Açık çalışma sekmelerinizi sayfa yenilendiğinde korumak',
              'Tarayıcı sekmesi kapanana kadar',
              'İşlevsel',
            ],
          ],
        },
        {
          type: 'p',
          text: 'Uygulama analitik, reklam veya pazarlama çerezi kullanmaz.',
        },
        {
          type: 'note',
          text: 'Envanter, frontend kaynağındaki gerçek kullanımdan çıkarılmıştır (oturum çerezi: backend Security.ts, 8 saat; localStorage: yalnızca dil anahtarı; sessionStorage: sekme çalışma alanı). Uygulama çevrimdışı önbellek için bir service worker kaydedebilir; bu, çerez değildir ama terminal cihazında depolama sayılıp sayılmayacağı hukuk değerlendirmesidir. “İşlevsel” kategorideki depolamaların açık rıza gerektirip gerektirmediği (elektronik haberleşme mevzuatı) hukuk kararıdır.',
        },
      ],
    },
    {
      id: 'yonetim',
      title: '4. Çerezleri nasıl yönetebilirsiniz?',
      blocks: [
        {
          type: 'p',
          text: 'Tarayıcınızın ayarlarından çerezleri ve site verilerini görebilir, engelleyebilir veya silebilirsiniz. Zorunlu oturum çerezini engellerseniz uygulamaya giriş yapamazsınız. Tanıtım sitesi çerez kullanmadığı için sitede yapmanız gereken bir ayar yoktur.',
        },
      ],
    },
    {
      id: 'haklar',
      title: '5. Haklarınız ve iletişim',
      blocks: [
        {
          type: 'p',
          text: 'KVKK md. 11 kapsamındaki haklarınız ve başvuru yolları [KVKK Aydınlatma Metni](/yasal/kvkk-aydinlatma) sayfasındadır. Sorularınız için: {{İLETİŞİM_EPOSTA}}. Yürürlük tarihi: {{YÜRÜRLÜK_TARİHİ}}.',
        },
      ],
    },
  ],
}
