import type { LegalDoc } from './types'

export const kunye: LegalDoc = {
  slug: 'kunye',
  title: 'Künye',
  description: 'Entegrasyonik hizmet sağlayıcısının ticari unvanı, adresi ve iletişim bilgileri (taslak — değerler işletmece doldurulacak).',
  version: '0.1.0-taslak',
  updatedAt: '2026-09-28',
  summary: 'Hizmet sağlayıcının unvanı, sicil ve vergi bilgileri, adresi ve iletişim kanalları.',
  sections: [
    {
      id: 'hizmet-saglayici',
      title: '1. Hizmet sağlayıcı bilgileri',
      blocks: [
        {
          type: 'p',
          text: 'Elektronik ticaret mevzuatı uyarınca hizmet sağlayıcının tanıtıcı bilgileri ziyaretçilerin kolayca erişebileceği biçimde yayımlanır.',
        },
        {
          type: 'table',
          caption: 'Hizmet sağlayıcı bilgileri',
          head: ['Bilgi', 'Değer'],
          rows: [
            ['Ticaret unvanı', '{{ŞİRKET_UNVANI}}'],
            ['MERSİS numarası', '{{MERSİS_NO}}'],
            ['Ticaret sicil bilgisi', '{{TİCARET_SİCİL_NO}}'],
            ['Vergi dairesi ve numarası', '{{VERGİ_DAİRESİ_VE_NO}}'],
            ['Adres', '{{ADRES}}'],
            ['Telefon', '{{İLETİŞİM_TELEFON}}'],
            ['E-posta', '{{İLETİŞİM_EPOSTA}}'],
            ['KEP adresi', '{{KEP_ADRESİ}}'],
            ['Web sitesi', '{{SİTE_ALAN_ADI}}'],
          ],
        },
        {
          type: 'note',
          text: 'Dayanak olarak 6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun’un bilgi verme yükümlülüğü esas alınmıştır (madde numarası ve zorunlu alan listesi hukukla teyit edilmelidir). Bu sayfadaki tüm değerler işletmece verilir; ajan unvan veya sicil bilgisi UYDURMAMIŞTIR. Sitenin altbilgisindeki künye satırı da aynı değerlerle güncellenmelidir.',
        },
      ],
    },
    {
      id: 'kisisel-veri-iletisim',
      title: '2. Kişisel veri başvuruları',
      blocks: [
        {
          type: 'p',
          text: 'Kişisel verilere ilişkin başvurular için: {{KVKK_BAŞVURU_EPOSTA}}. VERBİS durumu: {{VERBİS_DURUMU}}. Ayrıntılar [KVKK Aydınlatma Metni](/yasal/kvkk-aydinlatma) sayfasındadır.',
        },
      ],
    },
    {
      id: 'diger-belgeler',
      title: '3. Diğer yasal belgeler',
      blocks: [
        {
          type: 'ul',
          items: [
            '[Gizlilik Politikası](/yasal/gizlilik)',
            '[Çerez Politikası](/yasal/cerez)',
            '[Kullanım Koşulları](/yasal/kullanim-kosullari)',
            '[Abonelik Sözleşmesi](/yasal/abonelik-sozlesmesi)',
            '[Ön Bilgilendirme Formu](/yasal/on-bilgilendirme)',
            '[İptal ve İade Koşulları](/yasal/iptal-iade)',
          ],
        },
      ],
    },
  ],
}
