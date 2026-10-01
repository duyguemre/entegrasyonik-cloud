import type { LegalDoc } from './types'

export const kullanimKosullari: LegalDoc = {
  slug: 'kullanim-kosullari',
  title: 'Kullanım Koşulları',
  description: 'Entegrasyonik hizmetinin ve tanıtım sitesinin kullanım kuralları, sorumluluklar ve uyuşmazlık çözümü (taslak).',
  version: '0.1.0-taslak',
  updatedAt: '2026-09-28',
  summary: 'Entegrasyonik’i kullanırken hem sizin hem bizim sorumluluklarımızı, kabul edilebilir kullanım kurallarını ve hizmetin sınırlarını açıklar.',
  sections: [
    {
      id: 'taraflar',
      title: '1. Taraflar ve kapsam',
      blocks: [
        {
          type: 'p',
          text: 'Bu koşullar, {{ŞİRKET_UNVANI}} (“Hizmet Sağlayıcı”, [Künye](/yasal/kunye)) tarafından sunulan Entegrasyonik tanıtım sitesi ve uygulamasının (“Hizmet”) kullanımını düzenler. Hizmeti kullanan veya hesap açan kişi (“Kullanıcı”) bu koşulları kabul etmiş olur.',
        },
        {
          type: 'p',
          text: 'Ücretli veya ücretsiz deneme aboneliğine ilişkin koşullar [Abonelik Sözleşmesi](/yasal/abonelik-sozlesmesi) sayfasında, ödeme ve iade konuları [İptal ve İade Koşulları](/yasal/iptal-iade) sayfasında düzenlenmiştir. Bu belgeler birlikte okunmalıdır.',
        },
      ],
    },
    {
      id: 'hizmet',
      title: '2. Hizmet nedir?',
      blocks: [
        {
          type: 'p',
          text: 'Entegrasyonik, e-ticaret satıcılarının pazaryeri, e-ticaret platformu ve muhasebe/ERP sistemlerindeki ürün, stok, fiyat, sipariş ve benzeri işlemlerini tek bir yönetim panelinden yürütmesine yardımcı olan, tarayıcı üzerinden kullanılan bir platform hizmetidir (SaaS). Desteklenen entegrasyonların ve her birinin kapsamının güncel hâli sitede ve uygulamada yer alır; kapsam zaman içinde değişebilir.',
        },
      ],
    },
    {
      id: 'hesap',
      title: '3. Hesap ve güvenlik',
      blocks: [
        {
          type: 'ul',
          items: [
            'Kayıt sırasında verdiğiniz bilgilerin doğru ve güncel olması sizin sorumluluğunuzdadır.',
            'Parolanızı gizli tutmalı, başkalarıyla paylaşmamalısınız. Hesabınız altında yapılan işlemlerden, yetkisiz kullanımı bize bildirene kadar siz sorumlusunuz.',
            'Hesabınıza eklediğiniz kullanıcıların yetkilerini yönetmek ve bu kullanıcıların bu koşullara uymasını sağlamak sizin sorumluluğunuzdadır.',
            'Yetkisiz kullanım veya güvenlik ihlali şüphesini gecikmeden {{İLETİŞİM_EPOSTA}} adresine bildirmelisiniz.',
          ],
        },
      ],
    },
    {
      id: 'kullanim-kurallari',
      title: '4. Kabul edilebilir kullanım',
      blocks: [
        { type: 'p', text: 'Hizmeti kullanırken aşağıdakileri yapmamayı kabul edersiniz:' },
        {
          type: 'ul',
          items: [
            'Yazılımı tersine mühendislikle çözmek, kopyalamak veya kaynak koduna erişmeye çalışmak,',
            'Hizmete izinsiz otomatik erişim sağlamak (bot, tarayıcı program vb.), Hizmeti aşırı yükleyecek kullanım yapmak,',
            'Hizmeti hukuka aykırı ürünlerin satışı, yanıltıcı işlemler veya üçüncü kişilerin haklarını ihlal eden faaliyetler için kullanmak,',
            'Hizmetin güvenlik önlemlerini aşmaya veya başka bir kiracının verisine erişmeye çalışmak.',
          ],
        },
      ],
    },
    {
      id: 'ucuncu-taraf',
      title: '5. Pazaryerleri ve üçüncü taraf hizmetler',
      blocks: [
        {
          type: 'ul',
          items: [
            'Pazaryeri, e-ticaret ve ERP hesaplarınız size aittir. Entegrasyonik’e verdiğiniz kimlik bilgilerinin (API anahtarı vb.) geçerli olması ve ilgili platformun kullanım koşullarına uymanız sizin sorumluluğunuzdadır.',
            'Bu platformların hizmet kesintileri, API değişiklikleri, hız sınırları veya erişimi kısıtlaması Hizmet Sağlayıcı’nın kontrolü dışındadır; bu durumlar senkronizasyonun gecikmesine veya durmasına yol açabilir.',
            'Bu platformların marka ve logoları ilgili sahiplerine aittir; Entegrasyonik ile bu platformlar arasında, yazılı olarak belirtilmedikçe bir ortaklık veya onay ilişkisi bulunduğu iddia edilmez.',
          ],
        },
      ],
    },
    {
      id: 'veri',
      title: '6. Sizin verileriniz',
      blocks: [
        {
          type: 'p',
          text: 'Hizmete yüklediğiniz veya pazaryerlerinizden Hizmete aktarılan verilerin (ürün, stok, fiyat, sipariş vb.) sahibi sizsiniz. Bu verileri yalnızca Hizmeti sunmak için işleriz. Ürün, fiyat ve stok bilgilerinin doğruluğu sizin sorumluluğunuzdadır. Kişisel verilerin işlenmesi için [KVKK Aydınlatma Metni](/yasal/kvkk-aydinlatma) ve [Gizlilik Politikası](/yasal/gizlilik) geçerlidir.',
        },
      ],
    },
    {
      id: 'fikri-mulkiyet',
      title: '7. Fikri mülkiyet',
      blocks: [
        {
          type: 'p',
          text: 'Hizmetin yazılımı, tasarımı, arayüzü, marka ve logoları üzerindeki haklar {{ŞİRKET_UNVANI}}’na veya lisans verenlerine aittir. Bu koşullar, size Hizmeti abonelik süresince kendi ticari faaliyetiniz için kullanma hakkı dışında bir hak devretmez.',
        },
      ],
    },
    {
      id: 'sorumluluk',
      title: '8. Hizmet seviyesi ve sorumluluk sınırları',
      blocks: [
        {
          type: 'p',
          text: 'Hizmet, stok ve fiyat işlemlerinde aşırı satış riskini azaltmak üzere tasarlanmıştır; ancak hiçbir yazılım hizmeti, pazaryerleri ve internet altyapısı gibi dış etkenlerden bağımsız olarak kesintisiz çalışmayı veya belirli bir sonucu garanti edemez. Hizmet Sağlayıcı’nın sorumluluk sınırı: {{SORUMLULUK_SINIRI_KARARI}}',
        },
        {
          type: 'note',
          text: 'Bu maddede hiçbir kesintisizlik yüzdesi, destek süresi veya yanıt süresi taahhüdü YAZILMAMIŞTIR (doğrulanamayan iddia). Sorumluluk sınırlamasının kapsamı ve geçerliliği (özellikle tüketici niteliğindeki alıcılar için) hukuk kararıdır.',
        },
      ],
    },
    {
      id: 'askiya-alma',
      title: '9. Erişimin kısıtlanması ve sona erme',
      blocks: [
        {
          type: 'p',
          text: 'Bu koşulların ihlali, güvenlik tehdidi veya yasal zorunluluk hâllerinde Hizmet Sağlayıcı hesabınıza erişimi kısıtlayabilir. Bildirim usulü ve itiraz yolu: {{ASKIYA_ALMA_BİLDİRİM_USULÜ}}. Ödeme kaynaklı askı ve iptal süreçleri [Abonelik Sözleşmesi](/yasal/abonelik-sozlesmesi) sayfasında açıklanmıştır.',
        },
      ],
    },
    {
      id: 'degisiklik',
      title: '10. Değişiklikler',
      blocks: [
        {
          type: 'p',
          text: 'Bu koşullar değiştirilebilir. Değişiklikler, {{KOŞUL_DEĞİŞİKLİĞİ_BİLDİRİM_SÜRESİ}} kuralına göre bildirilir. Güncel sürüm ve tarih sayfanın başında yer alır.',
        },
      ],
    },
    {
      id: 'hukuk-yetki',
      title: '11. Uygulanacak hukuk ve yetki',
      blocks: [
        {
          type: 'p',
          text: 'Bu koşullara Türk hukuku uygulanır. Uyuşmazlıklarda yetkili mahkeme ve icra daireleri: {{YETKİLİ_MAHKEME}}. Tüketici niteliğindeki alıcılar için emredici tüketici mevzuatı saklıdır ([Ön Bilgilendirme Formu](/yasal/on-bilgilendirme)). Yürürlük tarihi: {{YÜRÜRLÜK_TARİHİ}}.',
        },
      ],
    },
  ],
}
