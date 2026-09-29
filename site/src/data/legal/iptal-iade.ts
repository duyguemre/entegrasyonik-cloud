import type { LegalDoc } from './types'

export const iptalIade: LegalDoc = {
  slug: 'iptal-iade',
  title: 'İptal ve İade Koşulları',
  description: 'Entegrasyonik aboneliğinin nasıl iptal edildiği, iptalden sonra erişimin ne olacağı ve ücret iadesi koşulları (taslak).',
  version: '0.1.0-taslak',
  updatedAt: '2026-09-28',
  summary: 'Denemeyi ve ücretli aboneliği nasıl sonlandırabileceğinizi, iptalden sonra verilerinize erişimin nasıl süreceğini ve iade koşullarını açıklar.',
  sections: [
    {
      id: 'deneme',
      title: '1. Ücretsiz deneme',
      blocks: [
        {
          type: 'p',
          text: '14 günlük deneme için kart bilgisi alınmaz ve ücret tahsil edilmez; bu nedenle deneme süresi içinde iade konusu doğmaz. Denemeyi ücretli plana geçmeden bırakırsanız hesabınız [Abonelik Sözleşmesi](/yasal/abonelik-sozlesmesi) sayfasındaki askı kurallarına göre işlem görür.',
        },
      ],
    },
    {
      id: 'iptal',
      title: '2. Ücretli aboneliğin iptali',
      blocks: [
        {
          type: 'ul',
          items: [
            'Aboneliğinizi istediğiniz zaman iptal edebilirsiniz. İptal talebinin iletilmesi: {{İPTAL_TALEBİ_KANALI}}',
            'İptal, içinde bulunduğunuz dönemin sonunda geçerli olur; o zamana kadar hizmet tam olarak devam eder ve sonraki dönem için ücret alınmaz.',
            'Dönem bittikten sonra 30 gün boyunca hesabınız salt-okunur kalır; verilerinizi görüntüleyebilir ve dışa aktarabilirsiniz. Bu süre sonunda verileriniz silinir ve silme geri alınamaz.',
          ],
        },
        {
          type: 'note',
          text: 'Uygulama içi iptal ekranı henüz yoktur (ADR-0008: iptal/plan değiştirme sonraki iş). İptal kanalı ürün kararı bekler. Salt-okunur dönemde aboneliğin yeniden başlatılıp başlatılamayacağı bu taslakta bilinçli olarak belirtilmemiştir (ürün kararı).',
        },
      ],
    },
    {
      id: 'iade',
      title: '3. Ücret iadesi',
      blocks: [
        {
          type: 'p',
          text: 'Ücretli abonelikte ücret iadesi politikası: {{İADE_POLİTİKASI}}',
        },
        {
          type: 'ul',
          items: [
            'Yıllık plan dönem ortasında iptal edilirse kalan dönem için iade: {{YILLIK_PLAN_İADE_KARARI}}',
            'İadenin yöntemi ve süresi: {{İADE_YÖNTEMİ_VE_SÜRESİ}}',
            'Mevzuattan doğan haklarınız (ör. tüketici niteliğindeki alıcının cayma hakkı, hatalı veya mükerrer tahsilat) saklıdır; ayrıntı [Ön Bilgilendirme Formu](/yasal/on-bilgilendirme) sayfasındadır.',
          ],
        },
        {
          type: 'note',
          text: 'İade politikası bilinçli olarak boş bırakılmıştır: eski metindeki “iade yapılmaz” hükmü kaynak alınmamış, ADR-0008 iade konusunda karar vermemiştir. Bu bir ticari ve hukuki karardır.',
        },
      ],
    },
    {
      id: 'ucret-anlasmazligi',
      title: '4. Ödeme ve fatura itirazları',
      blocks: [
        {
          type: 'p',
          text: 'Faturanızda veya tahsilatta bir hata olduğunu düşünüyorsanız {{İLETİŞİM_EPOSTA}} adresine yazın. Şikâyet ve uyuşmazlık yolları için [Ön Bilgilendirme Formu](/yasal/on-bilgilendirme) ve [Kullanım Koşulları](/yasal/kullanim-kosullari) sayfalarına bakınız. Yürürlük tarihi: {{YÜRÜRLÜK_TARİHİ}}.',
        },
      ],
    },
  ],
}
