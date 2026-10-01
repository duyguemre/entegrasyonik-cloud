# Önyüz review — 3. tur geri bildirim (kullanıcı, 2026-10-01)

Kaynak: kullanıcının birleşik önizleme (faz3-arayuz @ gece turu) incelemesi. Kullanıcı: "Bunca yazışma ve istek sonrası nasıl bir kimlik istediğim çıkmıştır; bütün uygulamayı buna göre değerlendir." Çıta: premium, seçkin, sakin, naif, kullanıcı dostu, anlaşılır, site ile tutarlı; tek merkezden tasarım (ortak UI paketi), tek merkezden hareket. Karar: USER_DECISIONS K49.

## R3-SHELL — Kabuk ve gezinme
1. Sol menü hâlâ karışık: ana gruplar açık/kapalı fark etmeksizin dağınık görünüyor; zemin rengi ve genel görünüm seçkin değil → menü bilgi mimarisi + görsel dil yeniden (grup başlıkları ile öğeler arasında net ama sakin hiyerarşi, aktif öğe, hover, daraltılmış hâl, zemin).
2. Favori işlemler: menüden favori işaretleniyor ama favoriler NEREDE görünüyor belli değil; favori belirleme etkileşimi de üst seviye tasarım ister (favoriler bölümü/erişim noktası, sıralama, boş durum).
3. Breadcrumb bozulmuş: daha önce kararlaştırılan NÖTR chip gösterimi geri gelmeli; bulunulan sayfanın gösterimi amatör → üst seviye.
4. Ana sekmeler: pasif sekmelerin görünümü üzerinde daha çok çalış; sığmayan sekmeleri gösteren buton ile toplam sekme sayısını gösteren buton BİRLEŞTİRİLSİN.
5. İçerikteki sekmeler (content tabs): site ile uyumlu, üst seviye tasarım.
6. Filtre paneli başlığı çok yüksek → tasarım kurallarına bağlı kalarak kompaktlaştır, yer kazan.
7. Hareket: TÜM geçişler tek kaynaktan (motion token'ları) ve tutarlı hızda; ör. ürün ekle → kategori seçiminde seviyeler açılırken filtre paneli açılma hızıyla aynı olmalı. Dağınık süre/easing değerleri kalmasın (statik koruma testi).

## R3-DATA — Tablolar
8. Tabloların sol başındaki entegrasyon rengi kenarlığı daha üst tasarım seviyesine çekilsin.
9. Tablolarda veriler farklı fontlarda görünüyor → değerlendir, tutarlı tipografi (sayı hizası/tabular-nums dahil) — düzelt.
10. Tarih sütunu olan ama tarih filtresi olmayan tablolar → değerlendir, gerekli yerlere tutarlı tarih aralığı filtresi.

## R3-PRODUCT — Ürün listesi
11. Ürün listesinde "Kanallar" bölümünün satırlardaki gösterimi anlaşılır değil → premium, seçkin, kullanıcı dostu, bir bakışta anlaşılır (kanal başına durum).

## R3-DIALOGS — Detay diyalogları
12. Sipariş, iade, müşteri, fatura detayı diyaloglarında genel sorun: hangi bölüm neyi anlatıyor açık değil → bölüm hiyerarşisi (net başlıklar, kart/kutu ayrımı, hafif farklı zemin ile öne çıkan kutular), tasarım çok daha üst seviye.
13. Destek kayıtları diyaloğu aynı şekilde.

## R3-SETTINGS
14. Uygulama ayarları bölümü yeterli tasarım çalışması görmemiş → üst seviye (gruplama, açıklamalar, kaydetme/değişiklik durumu, arama).

## R3-PRINT — Çıktılar
15. Çıktılar / şablon tasarımcısı: PAZAR ARAŞTIRMASI yap (etiket/fatura/irsaliye şablon tasarımcıları, best practice) ve üst düzey, premium, kullanıcı dostu biçimde YENİDEN TASARLA.

## R3-HOME — Ana sayfa
16. Ana sayfa bilgileri ve kutu formu fena değil ama bir üst seviyeye çıkmalı: AKSİYON ODAKLI — sayfaya bakınca "ilk ne yapmalıyım" görünmeli; sonra bölüm bilgileri, buna göre hiyerarşi.

## R3-PROPOSALS
17. `frontend/docs/PROPOSALS_PENDING.md`'deki öneriler ONAYLANDI → uygula (her birini "KARAR: uygulandı" ile kapat; bir öneri bu turdaki başka bir maddeyle çelişirse bu belge esastır).

## R3-IDENTITY — Bütünsel değerlendirme
18. Kullanıcının bu projede verdiği tüm geri bildirimlerden (FR2, FR3, SR2, SR3, USER_DECISIONS) çıkan kimliği damıt → `frontend/docs/APP_IDENTITY.md` (ilkeler, yap/yapma, örnekler) ve tüm uygulamayı buna göre denetle; bariz olanları uygula, akış/davranış değiştirenleri PROPOSALS_PENDING'e yaz (K48).
