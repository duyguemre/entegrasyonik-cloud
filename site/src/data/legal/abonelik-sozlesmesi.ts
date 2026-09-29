import type { LegalDoc } from './types'

/**
 * Abonelik Sözleşmesi + Ek-1 Veri İşleme Şartları. Durum makinesi ADR-0008 §3 ile tutarlıdır
 * (trialing → active → past_due 7 gün → suspended → canceled → 30 gün salt-okunur → silme).
 * `version` alanı, backend `Subscriptions.termsVersion` ile eşleşecek değerdir (ADR-0008 §2).
 */
export const abonelikSozlesmesi: LegalDoc = {
  slug: 'abonelik-sozlesmesi',
  title: 'Abonelik Sözleşmesi',
  description:
    'Entegrasyonik aboneliğinin şartları: 14 günlük deneme, ücretli plana geçiş, yenileme, ödeme başarısızlığı, askı, iptal, fiyat değişikliği ve veri işleme şartları (taslak).',
  version: '0.1.0-taslak',
  updatedAt: '2026-09-28',
  summary:
    'Denemenin nasıl başladığını ve bittiğini, ücretli planın nasıl yenilendiğini, ödeme sorunlarında ne olduğunu, aboneliğin nasıl sona erdiğini ve verilerinize ne olduğunu açıklar.',
  sections: [
    {
      id: 'taraflar',
      title: '1. Taraflar ve tanımlar',
      blocks: [
        {
          type: 'ul',
          items: [
            '**Hizmet Sağlayıcı:** {{ŞİRKET_UNVANI}} ([Künye](/yasal/kunye)).',
            '**Abone:** Hesabı açan ve abonelik planını seçen gerçek veya tüzel kişi.',
            '**Hizmet:** Entegrasyonik uygulaması ([Kullanım Koşulları](/yasal/kullanim-kosullari)).',
            '**Plan:** Fiyatı, dönemi (aylık veya yıllık) ve limitlerini (kanal, ürün, kullanıcı sayısı vb.) belirleyen abonelik paketi.',
            '**Dönem:** Planın ücretlendirildiği aylık veya yıllık süre.',
          ],
        },
        {
          type: 'p',
          text: 'Abone, hesap açarken veya ücretli plana geçerken bu sözleşmenin ve Ek-1’in güncel sürümünü kabul eder; kabul edilen sürüm ve kabul zamanı kayıt altına alınır.',
        },
      ],
    },
    {
      id: 'plan-fiyat',
      title: '2. Plan, limitler ve fiyat',
      blocks: [
        {
          type: 'ul',
          items: [
            'Planlar, limitleri ve güncel fiyatlar fiyatlandırma sayfasında ve uygulamadaki abonelik ekranında gösterilir. Kurumsal plan için fiyat ve limitler özel teklifle belirlenir.',
            'Fiyatlar Türk lirası cinsindendir. KDV gösterimi: {{KDV_GÖSTERİM_ŞEKLİ}}',
            'Planınızın limitini aştığınızda mevcut verileriniz silinmez veya kapatılmaz; yalnızca yeni kayıt (ör. yeni kanal, ürün veya kullanıcı) oluşturma engellenir ve size hangi limitin aşıldığını ve nasıl plan yükseltebileceğinizi anlatan bir mesaj gösterilir.',
          ],
        },
        {
          type: 'note',
          text: 'Nihai fiyatlar ve plan içerikleri henüz insan kararına bağlıdır (ADR-0014 Açık Soru 1); bu metinde bilinçli olarak fiyat veya limit rakamı yazılmamıştır.',
        },
      ],
    },
    {
      id: 'deneme',
      title: '3. Ücretsiz deneme ve ücretli plana geçiş',
      blocks: [
        {
          type: 'ul',
          items: [
            'Yeni hesaplar **14 günlük ücretsiz denemeyle** başlar. Deneme için kart bilgisi istenmez ve deneme süresi boyunca ücret alınmaz.',
            'Deneme süresince Başlangıç planının limitleri geçerlidir.',
            'Denemenin ücretli aboneliğe dönüşmesi **otomatik değildir**: kart bilgisi vermediğiniz sürece ücretlendirilmezsiniz. Ücretli plana geçmek için bir plan seçip ödeme adımını tamamlamanız gerekir.',
            'Deneme süresi bitip ücretli plana geçilmezse hesap, aşağıdaki “Askıya alma” maddesindeki duruma girer (verileriniz görüntülenebilir ve dışa aktarılabilir; düzenleme ve senkronizasyon durur).',
          ],
        },
        {
          type: 'note',
          text: 'Bu madde ADR-0008 §3 durum makinesine göre yazılmıştır. Deneme kaydı (trialing) ve askı davranışının uygulamada tam devreye alınması BACKLOG C16 kalanındadır; yayından önce metin, uygulamanın gerçek davranışıyla karşılaştırılmalıdır.',
        },
      ],
    },
    {
      id: 'odeme-yenileme',
      title: '4. Ödeme, yenileme ve fatura',
      blocks: [
        {
          type: 'ul',
          items: [
            'Ödeme, ödeme hizmet sağlayıcısının barındırdığı güvenli form üzerinden alınır: {{ÖDEME_HİZMET_SAĞLAYICISI}}. **Kart numaranız ve güvenlik kodunuz Hizmet Sağlayıcı sistemlerinden geçmez ve saklanmaz;** yalnızca ödeme sağlayıcısının döndürdüğü maskeli bilgi (kart markası ve son dört hane) tutulur.',
            'Ücretli abonelik, iptal etmediğiniz sürece her dönem sonunda seçtiğiniz plan ve dönemle **otomatik yenilenir** ve ödeme yöntemine ücret yansıtılır.',
            'Fatura için unvan, vergi kimlik numarası veya TCKN, vergi dairesi, adres ve e-fatura mükellefi olup olmadığınız bilgisi istenir; doğru ve güncel olması Abone’nin sorumluluğundadır. Fatura düzenleme şekli: {{FATURA_DÜZENLEME_ŞEKLİ}}',
          ],
        },
      ],
    },
    {
      id: 'odeme-basarisiz',
      title: '5. Yenileme ödemesi başarısız olursa',
      blocks: [
        {
          type: 'ol',
          items: [
            'Yenileme ödemesi alınamazsa aboneliğiniz “ödeme gecikmiş” durumuna geçer. **7 günlük ek süre** boyunca hizmet tam olarak çalışmaya devam eder; uygulamada kalıcı bir uyarı gösterilir ve kartınızı güncellemeniz için bağlantı sunulur. Bu sürede ödeme sağlayıcısı tahsilatı yeniden dener.',
            'Ödeme bu sürede başarılı olursa abonelik hemen aktif duruma döner.',
            'Ek süre dolarsa abonelik askıya alınır (madde 6).',
          ],
        },
      ],
    },
    {
      id: 'askiya-alma',
      title: '6. Askıya alma',
      blocks: [
        {
          type: 'p',
          text: 'Ek süre dolduğunda veya deneme bitip ücretli plana geçilmediğinde abonelik askıya alınır:',
        },
        {
          type: 'ul',
          items: [
            'Verilerinizi **görüntüleyebilir ve dışa aktarabilirsiniz**.',
            'Ürün, fiyat ve stok düzenleme gibi **yazma işlemleri kapanır**.',
            '**Entegrasyon motoru durur:** pazaryerlerine stok ve fiyat gönderilmez, siparişler çekilmez. Bu nedenle pazaryerlerindeki stok bilgisi güncel kalmayabilir ve **aşırı satış riski doğabilir; bu risk Abone’dedir.**',
            'Başarılı ödeme yapıldığında abonelik anında aktif olur, entegrasyon motoru yeniden başlar ve ilk senkronizasyonda stok ve fiyat mutabakatı yapılır.',
          ],
        },
        {
          type: 'p',
          text: 'Hizmet Sağlayıcı, askı kararını sessizce uygulamaz: askıya almadan **en az 3 gün önce** ve askı anında e-posta ve uygulama içi bildirimle, stok senkronizasyonunun duracağını açıkça bildirir.',
        },
        {
          type: 'note',
          text: 'Bildirim e-postaları (deneme sonu, ödeme hatası, askı uyarısı) ADR-0008’de planlıdır; MailService entegrasyonu ve EntitlementService guard’larının API/IntegrationEngine’e bağlanması henüz tamamlanmamıştır. “3 gün önce bildirim” sözü, bu bileşenler devreye girmeden sözleşmede taahhüt edilmemelidir — ürün/hukuk kararı.',
        },
      ],
    },
    {
      id: 'iptal',
      title: '7. İptal',
      blocks: [
        {
          type: 'ul',
          items: [
            'Abone aboneliğini istediği zaman iptal edebilir. Yıllık veya aylık, içinde bulunulan dönemin sonuna kadar hizmet **tam olarak** devam eder; ardından yeni dönem ücretlendirilmez.',
            'Dönem sonundan sonra **30 gün boyunca hesap salt-okunur** kalır: verilerinizi görüntüleyebilir ve dışa aktarabilirsiniz; entegrasyon motoru durur.',
            'Bu 30 günün sonunda verileriniz, imha politikasına göre silinir. Kalıcı silme geri alınamaz.',
            'İptal talebinin nasıl iletileceği: {{İPTAL_TALEBİ_KANALI}}',
          ],
        },
        {
          type: 'p',
          text: 'Ücret iadesine ilişkin ayrıntılar [İptal ve İade Koşulları](/yasal/iptal-iade) sayfasındadır.',
        },
        {
          type: 'note',
          text: 'Kalıcı silme, hukuken geri dönüşsüz bir işlemdir; ADR-0008 uyarınca imha politikasına ve insan onayına bağlıdır. Hesap silme talebinin 30 günlük bekleme süresiyle (Gizlilik Politikası) bu 30 günlük salt-okunur dönemin birleştirilmesi hukuk/ürün kararıdır.',
        },
      ],
    },
    {
      id: 'degisiklik',
      title: '8. Plan ve fiyat değişikliği',
      blocks: [
        {
          type: 'ul',
          items: [
            'Plan yükseltme veya düşürme usulü: {{PLAN_DEĞİŞİKLİĞİ_USULÜ}}',
            'Hizmet Sağlayıcı fiyatları değiştirebilir. Fiyat değişikliği yürürlüğe girmeden {{FİYAT_DEĞİŞİKLİĞİ_BİLDİRİM_SÜRESİ}} önce Abone’ye bildirilir. Değişikliğin uygulanacağı dönem: {{FİYAT_DEĞİŞİKLİĞİ_UYGULAMA_DÖNEMİ}}',
            'Abone yeni fiyatı kabul etmiyorsa, yeni fiyat uygulanmadan önce aboneliğini iptal edebilir (madde 7).',
          ],
        },
      ],
    },
    {
      id: 'ek-1-veri-isleme',
      title: '9. Ek-1: Veri İşleme Şartları',
      blocks: [
        {
          type: 'p',
          text: 'Bu ek, Abone’nin Hizmet’e aktardığı **kendi müşterilerine ait kişisel veriler** (ör. pazaryeri siparişlerindeki alıcıların adı, adresi, telefonu, e-posta adresi ve vergi numarası) için geçerlidir. Bu veriler bakımından **Abone veri sorumlusu, Hizmet Sağlayıcı veri işleyendir.** Abonenin ve kullanıcılarının kendi hesap verileri için Hizmet Sağlayıcı veri sorumlusudur ([KVKK Aydınlatma Metni](/yasal/kvkk-aydinlatma)).',
        },
        { type: 'h3', text: 'İşleme konusu, amacı ve süresi' },
        {
          type: 'ul',
          items: [
            '**Amaç:** Hizmet’in sunulması (pazaryeri ve entegrasyon platformlarıyla sipariş, ürün ve stok işlemlerinin yürütülmesi).',
            '**Süre:** Abonelik süresi ve sonrasındaki salt-okunur ve silme süreçleri (madde 7).',
          ],
        },
        { type: 'h3', text: 'Hizmet Sağlayıcı’nın yükümlülükleri' },
        {
          type: 'ul',
          items: [
            'Verileri yalnızca Abone’nin talimatları doğrultusunda ve Hizmet’i sunmak amacıyla işler; başka amaçla kullanmaz.',
            'Verilere erişen personel ve alt işleyenler gizlilik yükümlülüğü altındadır.',
            'KVKK md. 12 kapsamında uygun teknik ve idari tedbirleri alır: kiracı başına ayrı veritabanı, kimlik bilgilerinin AES-256-GCM ile şifrelenmesi, rol tabanlı erişim ve kişisel veri içermeyen denetim kaydı.',
            'Abone’nin, ilgili kişilerin (müşterilerinin) haklarına ilişkin başvurularını yanıtlamasına makul ölçüde yardımcı olur.',
            'Verilere ilişkin bir ihlali fark ettiğinde Abone’ye {{İHLAL_BİLDİRİM_SÜRESİ}} içinde bildirir.',
            'Abone’nin makul talebi üzerine, yükümlülüklerini yerine getirdiğini gösteren bilgileri paylaşır.',
            'Abonelik sona erdiğinde verileri, Abone’nin dışa aktarabilmesi için gereken süre tanındıktan sonra siler veya anonim hâle getirir (madde 7); yasal saklama yükümlülükleri saklıdır.',
          ],
        },
        { type: 'h3', text: 'Alt işleyenler ve yurt dışı aktarım' },
        {
          type: 'ul',
          items: [
            'Alt işleyenler: {{ALT_İŞLEYEN_LİSTESİ}}',
            'Yurt dışına aktarım: {{YURT_DIŞI_AKTARIM_DURUMU}}',
          ],
        },
        { type: 'h3', text: 'Abone’nin yükümlülükleri' },
        {
          type: 'ul',
          items: [
            'Verileri hukuka uygun biçimde toplamış olmak ve ilgili kişileri KVKK md. 10 uyarınca aydınlatmış olmak.',
            'Hizmet’e yalnızca aktarma hakkına sahip olduğu verileri yüklemek ve talimatlarını hukuka uygun vermek.',
          ],
        },
        {
          type: 'note',
          text: 'Veri işleyen sözleşme maddeleri ADR-0008 §6 ve ADR-0003’teki (kiracı silme, dışa aktarma) davranışa dayanır; alt işleyen listesi, yurt dışı aktarım, bildirim süresi ve denetim hakkı kapsamı hukuk kararıdır. Sözleşmenin “ek” olarak ayrı belge mi yoksa bu sayfanın parçası mı olacağı da hukuk kararıdır.',
        },
      ],
    },
    {
      id: 'onay-hukuk',
      title: '10. Sözleşmenin kabulü, sürüm ve uygulanacak hukuk',
      blocks: [
        {
          type: 'p',
          text: 'Sözleşmenin sürümü sayfanın başında yer alır; kabul ettiğiniz sürüm ve kabul zamanı hesabınızla ilişkilendirilerek saklanır. Değişiklikler [Kullanım Koşulları](/yasal/kullanim-kosullari) içindeki değişiklik kuralına tabidir. Türk hukuku uygulanır; yetkili mahkeme: {{YETKİLİ_MAHKEME}}. Yürürlük tarihi: {{YÜRÜRLÜK_TARİHİ}}.',
        },
      ],
    },
  ],
}
