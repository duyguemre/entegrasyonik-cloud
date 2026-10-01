# fe-r3b — FR3 madde 11–14 ve 16 (önce / sonra)

Kaynak: `docs/cloud-contracts/FE_FEEDBACK_R3_2026-10-01.md` (K49). Dal: `cloud/fe-r3b` (taban `origin/main`, sonda
`origin/main` + `cloud/fe-r3a` birleştirildi — kabuk/desen r3a, ekranlar r3b önceliğiyle; çakışma çıkmadı).

Araç: `R3B_REVIEW=1 R3B_WIDTH=1440|390 [R3B_THEMES=light,dark] [R3B_SCROLL=1] R3B_OUT=docs/fe-r3b-review/<once|sonra> npx playwright test e2e/specs/fe-r3b-review.spec.ts -c playwright.cloud.config.ts --project=chromium-desktop`
Veri: `e2e/fixtures/r2dReview.ts` + `e2e/fixtures/r3bReview.ts` (sentetik, `.invalid`; alanlar yalnız backend arayüzlerinden).
`once/` = `origin/main` (ayrı worktree), `sonra/` = bu dal (r3a birleşik). Dosya adı: `<ekran>-<light|dark>-<1440|390>[-kaydirN].png`;
`axe/` altında her görüntünün WCAG 2.1 AA sonucu. `once/`'da `ayarlar-degisiklik/arama` yok (özellik ana dalda yok);
`destek-detay-*-390` iki tarafta da yok (mobil çekmecede "Destek" grubu tıklanamıyor — kabuk, r2d'den beri açık).

## Kararlar

| Madde | Karar |
|---|---|
| 12 Ortak detay deseni | Yeni `EkRecordSheet` + `EkDetailPanel` (packages/ui, ADDITIVE; `EkDetailSheet` korunur). **Gövde zemini sayfa tuvali** (`app-bg`), bölümler beyaz kart (kenarlık + kart gölgesi) → kutular öne çıkar. Üst çubuk: tür etiketi + kimlik + durum + sessiz başlık eylemleri. **Özet her zaman üstte** (`#summary`: kayıt özeti + sıradaki adım). Gövdede çıplak bölüm kalmadı: her bölüm ikon + başlık + aynı satırda kısa açıklama/sayaç. **İş akışı eylemleri sabit alt çubukta** (yıkıcı solda, tek birincil en sağda); "sıradaki adım" kartı eylemi tekrarlamaz. Tutar dökümü/toplam kartın altında hafif tonlu bant. Liste kartta çerçevesiz (`RecordLineList plain`) — kart içinde kart yok. |
| 12 Uygulama | Sipariş (İptal et solda; Onayla/Fatura/Kargo ya da Barkod yazdır sağda), İade (Reddet / Onayla — yalnız izinliyse), Müşteri (Düzenle + ⋯ başlıkta; düzenlerken Vazgeç/Kaydet alt çubukta; son sipariş/iade tabloları başlıklı kartta), Fatura (PDF yoksa alt çubuk nedenini söyler). Stok tahsisi kartın içinde, tek erişilebilir bölge. |
| 13 Destek talebi | Ortalanmış diyalogdan aynı yan sayfa desenine: özet kartı (kanalsız kayıt → `EkRecordSummary icon`, additive), "Yazışma" kartı, **yanıt alanı sabit alt çubuk** (`#footer`). Gövde kaydırılır, yeni mesajda gövde sona kayar. |
| 11 Kanal hücresi | Önce: kısa rozetlerin köşesine binen 10px işaretler — anlamı yalnız ipucunda. Sonra iki satır: (1) **durum cümlesi** en kritik önce, durum tonunda ("1 kanalda hata", "1 kanalda onay bekliyor", "Tüm kanallarda yayında", "Gönderime hazır", "Henüz gönderilmedi"); (2) yalnız ürünün bulunduğu kanalların K13 kısa rozeti + **yanında** durum glifi; gönderilmemişler tek "+n". İpucu kanal başına satır; panel çipleri aynı ikonlar. Kolon 232px. `channelStatusSummary` saf + testli. |
| 14 Ayarlar | Sekmeli tek form → **solda arama + dikey bölüm listesi** (kısa açıklama, değişen bölümde nokta, aramada eşleşme sayısı), sağda bölüm başlığı + açıklaması, **başlıklı kartlarda "etiket + tek cümle açıklama ↔ alan" satırları** (`SettingRow`; etiket `<label for>` = alanın adı). Kurumsal alanlar ayrı "Şirket bilgileri" kartı. **Değişiklik durumu**: satırda "Değişti", bölümde nokta, alt yapışkan çubukta "Kaydedilmemiş değişiklik var · <bölümler>" + Vazgeç (kayıtlı değere döner) + Kaydet; temizken sakin "Kaydedilmemiş değişiklik yok" / "Tüm değişiklikler kaydedildi · saat". Arama kayıt defterinde (etiket/açıklama/anahtar kelime; kurumsal alanlar yalnız kurumsal tipte). Önizleme yapışkan yan kart. API sözleşmesi aynı. |
| 14 Dürüst metin | Backend taraması: hata e-postası, çalışma günleri, zaman dilimi, destek telefonu, kargo süresi, maks. adet **yalnız saklanıyor** (kullanan kod yok; desi/garanti bazı dönüştürücülerde). Eski açıklamalar olmayan otomasyonu vaat ediyordu ("bu adrese gönderilecektir", "bir sonraki iş gününe kaydırılacaktır", "bu zaman dilimine göre senkronize") → alanın ne olduğunu söyleyen cümleler; bilgi kutusu Entegrasyon sağlığı ekranına yönlendirir. |
| 16 Ana sayfa | En üstte **"Bugün sırada"**: kişisel selamlama ("Günaydın, Deniz. Sizi bekleyen 7 iş var."), **sıradaki iş öne çıkan kutuda** (tonlu sol şerit, açıklama, tek birincil eylem), "Sonra" listesi (en fazla 5; satır = ekranı açan düğme; öncelik etiketi Acil / Bugün / Fırsat buldukça), "Bekleyen yok: …" satırı; hiç iş yoksa yeşil "Bekleyen işiniz yok". Kaynak yalnız backend: sipariş bekleyenleri, stok uyarıları (aşırı satış, eşleşmeyen, kanala iletilmeyi bekleyen stok), entegrasyon sağlığı (erişilemiyor / sorunlu / kurulum eksik). Menüde olmayan ekranın eylemi çizilmez. Ardından bölüm başlıklarıyla: İşletme performansı → Sipariş ve kanal durumu → Stok ve katalog (kart başlıkları H3). Eski "Bekleyen aksiyonlar" kartı bu bölüme taşındı (silindi). |
| Hareket | r3a rolleri: yeni kod yalnız `--ek-transition-colors`; dokunulan dosyalarda ham ölçek token'ı rollere geçti (kanal paneli `feedback`, ürün listesi diyalog `overlay` + ok `reveal`) → ratchet'ten `SettingListView`, `ProductListView`, `ProductChannelStatus` çıktı. |

## İterasyonlar (önce/sonra + kendi eleştirim)

1. **Detay — 1. tur:** desen kuruldu, eylemler alta indi. Eleştiri: "Ürünler" kartında satır listesi kendi çerçevesiyle kart içinde kart; "Barkod yazdır" hem kartta hem (diğer durumlarda) çubukta → iki birincil; alt çubukta yalnız "İptal et" kalıyordu. Düzeltme: `RecordLineList plain` + tutar bandı; tüm eylemler tek yerde (çubuk), kart yalnız dış bağlantı.
2. **Detay — 2. tur:** müşteri/fatura/destek aynı desene. Eleştiri: destek diyaloğu ayrı kaydırıcı + ayrı yanıt alanı çift kaydırma veriyordu → gövde tek kaydırıcı, yanıt alanı alt çubuk; e2e'de "Stok tahsisi" iki bölge (kart + iç bölüm) → gömülü bileşen bölge açmaz.
3. **Kanal hücresi:** 1. turda 4 kanallı satırda rozetler iki satıra sarıyordu (satır yüksekliği değişken) → kolon 232px. İkon standardı testi dolgu glifleri yakaladı → çizgi glifler (durum çipleriyle aynı ikonlar — tutarlılık arttı).
4. **Ana sayfa:** 1. turda öne çıkan kutuda üç kırmızı (şerit + ikon + "Acil" çipi) — "tek parlayan öğe" ihlali → çip kalktı, düz mikro etiket; kutu "Sonra" listesi boyunca uzuyordu → içerik yüksekliği. Öncelik etiketi "Düzen" anlaşılmıyordu → "Fırsat buldukça". Bağlantı başlıkları Entegrasyon sağlığı kartıyla aynı dil ("erişilemiyor", "sorunlu").
5. **Ayarlar:** aramada eşleşmeyen bölümleri soluklaştırmak (opacity) axe kontrast ihlali verdi (3.3:1) → soluklaştırma kalktı, yalnız eşleşme sayısı; her görünen satır zaten eşleşme olduğundan satır vurgusu da kaldırıldı. Temiz durumda alt çubuk gölgesi kalktı (yalnız değişiklikte yükselir). Dar ekranda çubuk tek satır.

## Testler (bulut, chromium)

Bkz. rapor bölümü (aşağıda, son koşu).

## Backend'e iletilecek eksikler

1. **Mağaza ayarlarının çoğu kullanılmıyor:** `alertEmail` (hata bildirimi gönderen kod yok), `workingDays` (kargo süresi kaydırma yok), `timezone` (sipariş tarihleri sabit `PLATFORM_TIME_ZONE`), `supportPhone`, `shippingDuration`, `maxPurchaseQuantity`. Ya backend davranışı yazılmalı ya da alanlar sadeleşmeli (ürün kararı → PROPOSALS_PENDING P-R3B-1).
2. **Ana sayfa "Bugün sırada" için tek uç önerisi:** şu an üç ayrı yanıttan (insights + stock overview + integration health) türetiliyor; entegrasyon sağlığı yalnız admin kademesinde (üyede bağlantı uyarıları görünmez). Öneri `DashboardService/getNextActions` (kademe filtreli, sayılar + hedef filtre parametreleri).
3. **"Faturası kesilecek" filtresi yok:** sipariş listesinde `isInvoiceGenerated=false` filtresi olmadığı için fatura işi "Onaylandı" listesini açıyor (eski kartla aynı sınırlama).
4. **Aşırı satış / eşleşmeyen kalem → doğrudan kayıt:** stok sağlığı ekranı açılıyor; satır bazlı derin bağlantı için kalem kimliğiyle filtre parametresi.
5. **Destek talebi:** `lastMessageAt` dışında okunma / yanıt bekleyen taraf bilgisi yok ("sizden yanıt bekleniyor" gösterilemiyor).
6. (r2d'den sürüyor) Sipariş kalem görseli, iade red gerekçesi alanı, müşteri projeksiyonu sözleşmesi.
