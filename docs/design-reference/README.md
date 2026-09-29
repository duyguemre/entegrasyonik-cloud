# Uygulama (frontend) yeniden tasarım — kullanıcı brifi ve görsel referans

Kaynak: kullanıcı, 2026-09-29. Bu brif ADR-0015'in görsel yönünü **geçersiz kılar** (ADR-0015'in süreç/test/desen
kataloğu kuralları geçerli kalır). Uygulama çalışıyor ama tasarım kabul edilebilir seviyede değil: amatör görünüyor,
kullanıcı deneyimi zayıf, görsel kimlik yok. Hedef: tutarlı bir tasarım sistemi üzerine kurulu, premium, sade ama
albenili, profesyonel bir **workspace** uygulaması. Hoplayıp zıplayan, gösterişçi animasyon YOK; oturmuş, anlaşılır.

## KESİN KURAL — referanslardan ad/metin kopyalama YASAK

`ref-3010/` ve `ref-3007/` kullanıcının yerelindeki BAŞKA iki uygulamadan alınmış görsel referanslardır. Yalnızca
**yapı, davranış, etkileşim ve kalite çıtası** örnek alınır. Referanslarda görünen HİÇBİR ürün/marka/proje adı, ekran
adı, metin, etiket, örnek veri, CSS sınıf/değişken adı veya animasyon adı Entegrasyonik'in koduna, yorumlarına,
belgelerine, test adlarına ya da commit mesajlarına GEÇMEZ (görüntülerdeki "Ref" ifadesi maskelenmiş bir addır — o da
kullanılmaz). Bileşen/token adlarını Entegrasyonik'in kendi alanından (sipariş, ürün, pazaryeri, entegrasyon…) türet.
Tasarım sistemi tamamlanınca bu klasör kaldırılacak. Profil bilgileri maskeli, liste satır verileri buğuludur.

## Uygulama kimliği — kullanıcının "mutlaka böyle bir kimlik istiyorum" dediği şey

Referansta her ekran aynı ürünün parçası gibi görünüyor; bunu sağlayan (Entegrasyonik kendi renkleriyle aynısını kurmalı):
- **İmza kabuk (chrome):** üst bar ve bağlam panelleri tek bir marka degradesi/tonuyla boyalı; içerik alanı açık ama
  saf beyaz değil (hafif tonlu zemin), kartlar zeminden bir kademe açık ve ince kenarlık + yumuşak gölgeyle ayrışır.
- **Tek vurgu rengi kuralı:** birincil aksiyonlar (Sorgula, Güncelle, Ara gibi) her yerde AYNI vurgu rengiyle; ikincil
  aksiyonlar çerçeveli nötr. Kullanıcı bir ekranda "yapılacak ana iş"i rengiyle hemen bulur.
- **Tekrarlayan motifler:** her kart başlığında aynı biçimde renkli-zemin kare ikon + başlık + sağda yuvarlak aksiyon
  oku; durum rozetleri aynı şekil/boyutta açık-zemin + koyu metin; BÜYÜK HARF küçük mikro etiketler (anahtar-değer
  bloklarında etiket üstte, değer altta kalın); sayı vurguları (KPI) aynı tipografiyle.
- **Tutarlı ikon dili:** tek ikon ailesi, tek çizgi kalınlığı, yazı boyutuyla orantılı; ikonlar hep aynı biçimde
  (yuvarlatılmış kare, açık ton zemin) kapsüllenir.
- **Bağlam çalışma alanları:** üstte iki çalışma alanı anahtarı (genel ↔ seçili kayıt); seçili kayıt açıldığında sol
  bağlam paneli (kimlik kartı, kritik alanlar, hızlı aksiyonlar) + kayda ait sekmeler. Entegrasyonik karşılığı:
  genel çalışma alanı ↔ seçili sipariş/ürün/entegrasyon bağlamı.
- **Klavye her yerde:** arama açılırının altında "↑↓ gezin · Enter aç · Esc kapat" ipucu; menü öğelerinde kısayol.

## Referans görseller — `ref-3010/` (workspace kabuğu)

- `01-dashboard-tabs.png` — kimlik taşıyan degrade üst bar (ortada arama, sağda bildirim/profil); altında **gerçek sekme
  hissi** veren workspace sekmeleri (aktif sekme içerikle birleşik yüzey, pasifler zemin tonunda, küçük zarif kapatma,
  sekme ikonları, taşan başlıkta tooltip); kart başlığı+ikon+aksiyon dili, durum rozetleri, dağılım çubukları, halka grafik.
- `02-kademeli-menu.png` — **kademeli çok kolonlu (Miller columns) menü**: başlıkta arama, kolon başlıkları, klasör/yaprak
  ikonları, seçili yol vurgusu. Entegrasyonik'te: **ürün kategori ağacı seçimi** ve ekran/modül başlatıcı.
- `10-liste-filtre-sayfalama.png`, `11-liste-master-panel.png` — **filtre + veri + sayfalama standardı**: sekme içinde
  katlanabilir başlıklı filtre paneli (4 kolon grid, floating label, sağda birincil "Sorgula" + ikincil "Temizle"),
  yapışkan başlıklı tablo (küçük büyük-harf başlıklar + sıralama okları, checkbox kolonu, vurgulu kimlik kolonu, durum
  çipleri), sayfanın altına **sabit** sayfalama çubuğu (solda sayfa boyutu + toplam kayıt, ortada sayfa numaraları,
  sağda dışa aktar). `11`'de solda aranabilir, gruplu, sayaçlı master panel (katlanabilir).
- `20-ust-daraltilmis.png` — üst bölümü daraltma (sağ üstteki sekme-kulakçığı düğme): daha fazla içerik alanı.
- `21-menu-dugmesi.png` — menü aç/kapa.
- `22-yardim-merkezi.png`, `23-yardim-kabuk-yetenekleri.png` — uygulama içi yardım merkezi: solda aranabilir içindekiler,
  sağda bölüm kartları, rehberli tur başlatma, istatistik şeridi; ayrıca uygulamanın kendi tasarım sistemi sayfası var
  (fikir: Entegrasyonik de vitrin/yardım içinde kendi tasarım sistemi sayfasını taşımalı).
- `40-arama-odak.png`, `41-arama-ad.png`, `41-arama-numara.png`, `42-arama-klavye.png`, `43-arama-secim-sonrasi.png` —
  **akıllı arama**: header'daki arama odaklanınca genişler; sonuçlar gruplu başlık + sayaç; kayıt satırı = görsel/avatar +
  eşleşen kısmı vurgulu ad + tür rozeti + anahtar alanlar küçük "etiket: değer" çipleri + konum; altta klavye ipuçları;
  Enter ile kayıt bağlamı açılır. Entegrasyonik'te sipariş no / ürün adı-barkod-SKU / müşteri / entegrasyon araması.
- `44-kayit-detay-calisma-alani.png` — seçili kaydın çalışma alanı: sol bağlam paneli, üstte kimlik başlığı + rozetler +
  ilerleme göstergesi + KPI'lar + not kartı, altta yatay alt sekmeler, solda bölüm listesi, sağda anahtar-değer kartları.
- `08-mobil.png` — aynı dilin mobil karşılığı.
- `tokens-extracted.json` — hesaplanmış stil frekansları (renk, font, boyut/ağırlık, radius, gölge). Ham veri; kopyalama.
- **Kısayol kalıpları** (referansta 17 kısayol var): Ctrl+K arama, Ctrl+←/→ sekmeler arası, Ctrl+B menü aç/kapa, Alt+harf
  ile araçlara/çalışma alanlarına atlama; her kısayol menüde ve tooltip'te görünür, yardımda liste halinde.

## Referans görseller — `ref-3007/` (hareket/geçiş)

- `giris-0120ms.png` … `giris-1400ms.png` — ekran açılışının kare kare akışı: öğeler kısa kademeli (stagger) fade+yukarı
  kayma ile gelir, kartların kenarlığı "çizilir", ayraç genişler — hepsi ~0.4–0.55 sn, yavaşlayan eğri
  `cubic-bezier(0.16, 1, 0.3, 1)`; hover/renk geçişleri 0.18–0.25 sn `ease`.
- `ray-hover.png`, `panel-gecis-*ms.png` — sol ikon rayında hover ve panel değişim geçişi.
- `motion-extracted.json` — anonimleştirilmiş geçiş/animasyon süreleri, eğriler ve keyframe'ler.
- İlke: hareket bilgi verir (neyin geldiğini/değiştiğini gösterir), dikkat çekmez; uzun süreli dekoratif döngüler
  (arka plan dalgalanmaları) bizde YOK; `prefers-reduced-motion` desteklenir.

## Kullanıcının maddeleri (aynen)

1. **Tasarım sistemi (her şeyin temeli):** net palet (primary, secondary, nötr gri skalası, yüzey/arka plan katmanları);
   her birinin kullanım amacı olan semantik renkler (aksiyon/primary button, success, warning, error, info) her yerde aynı
   anlamda; eski tasarımdan kalan tutarsız renkleri tamamen temizle; ağırlıklı beyazı azalt — yüzey, kart ve bölümler arasında
   ayırt edilebilir ton farkı ve derinlik; tipografi ölçeği, spacing ölçeği, radius, gölge ve ikon boyutu token'ları (ikon ve
   yazı boyutları orantılı); tüm bileşenler (buton, input, tablo, kart, dialog, context menu, tab, badge, tooltip) token'lardan beslenir.
2. **Sol menü (sidebar):** renk geçişleri/tonlama kötü → uyumlu, kimlik taşıyan sidebar; alt menüler kesiliyor ve okunmuyor →
   metinler kesilmeden okunabilir (gerekirse tooltip/genişleyebilen yapı); aktif/hover/seçili durumları net.
3. **Üst bar ve akıllı arama:** üst bar bembeyaz ve kimliksiz → görsel kimlik taşıyan header; akıllı arama ve üst bar
   menüleri: sonuç gruplama, klavyeyle gezinme, net görsel hiyerarşi.
4. **Workspace sekmeleri:** sekme olduğu anlaşılmıyor → aktif/pasif net, gerçek sekme hissi; en soldaki anlamsız boşluğu kaldır;
   okunaklı font/boyut; kapatma butonu küçük, zarif, hover'da belirginleşen.
5. **Dashboard:** çok basit → anlamlı KPI kartları, grafikler, özet bölümleri; kart hiyerarşisi net (başlık, ikon, değer, açıklama).
6. **Veri listeleme / tablolar (tek standart):** sipariş ve ürün listesi tabloları farklı görünüyor → TÜM liste ekranları tek tablo
   bileşeni ve tek standart; sayfalama sayfanın altına sabit; tablo başlığı ve sayfalama sabit, yalnızca satırlar kayar; satır hover,
   seçim, sıralama, boş durum, yükleniyor (skeleton) durumları.
7. **Filtreleme:** filtre tüm sayfayı kaplayan popup gibi açılıyor; bu bir multitask workspace — bir sekmenin filtresi yalnızca o
   sekmeyi etkiler → sayfa içinde açılır/kapanır filtre paneli; aktif filtreler chip olarak görünür, tek tıkla temizlenir.
8. **Context menüler ve dialoglar:** menüler ikonlu, gruplanmış, ayraçlı, klavye kısayollarını gösteren modern yapı; dialoglar
   eski renkleri taşıyor → başlık/içerik/aksiyon alanı olan tutarlı modal; tehlikeli aksiyonlar error rengiyle ayrışır.
9. **Formlar ve input alanları:** bazı ekranlarda (ör. **Trendyol pazaryeri entegrasyonu** ve başka yerlerde) textfield'lar iç içe
   giriyor/üst üste biniyor → tüm formları gözden geçir; tutarlı grid, label, spacing, hata mesajı ve yardım metni standardı.
10. **Layout, navigasyon, geçişler:** bölümleme sorunlarını düzelt, kart/panel/bölümler net ayrışsın, hiyerarşi otursun;
    navigasyon ve pencere yapıları anlaşılır; sayfa geçişleri kısa, sade fade/slide — abartı yok.

**Beklenen sonuç:** oturmuş tasarım sistemi + ona bağlı yeniden kullanılabilir bileşenler; tüm ekranlarda tutarlı, anlaşılır
UX; kimliği olan, premium, estetik, profesyonel görünüm.

**Sıra (kullanıcı):** ÖNCE tasarım sistemi (token'lar + renk paleti) oluşturulup kullanıcıya GÖSTERİLİR; onaydan sonra bileşenler
ve ekranlar bu sisteme göre sırayla güncellenir.
