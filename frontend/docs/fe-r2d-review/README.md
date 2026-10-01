# fe-r2d — FR2-ORDERS 30–33 · FR2-SCREENS 34–37 · FR2-FIN 38 (önce / sonra)

Araç: `R2D_REVIEW=1 R2D_WIDTH=1440|390 R2D_OUT=docs/fe-r2d-review/<before|after> npx playwright test e2e/specs/fe-r2d-review.spec.ts -c playwright.cloud.config.ts --project=chromium-desktop`
Veri: `e2e/fixtures/r2dReview.ts` (sentetik, `.invalid`; alanlar yalnız `backend/src/interfaces/{order,claim,invoice,customer}`).
`before/` = `origin/main` (+ fe-r2b rozet), `after/` = r2a + r2b birleşik hal üzerinde bu dal. Dosya adları: `<ekran>-<genişlik>[-kaydirN].png`.
Not: destek talepleri 390 görüntüsü yok — mobil çekmecede "Destek" grubu başlığı tıklanamıyor (kabuk/r2a, aşağıda).

## Kararlar

| Madde | Karar |
|---|---|
| 30 Sipariş detayı | Yan sayfa `lg` (960px, `EkDetailSheet size` additive). Üstte kayıt özeti, ardından **Sıradaki adım** kartı (`EkNextStep`, yeni ortak bileşen): "şu an ne oluyor / ne yapmalıyım" sade dille + birincil eylem kartın içinde (başlıktakiyle aynı izin kuralı). Süreç çizgisinde adım adı durumuna göre çekimlenir (tamamlanan "Faturalandı", sıradaki "Kargoya verilecek", gelecek "Teslimat") — eskiden henüz olmamış adım "Kargoya verildi" görünüyordu. İki kolon (≥820px kap): kalemler + tutar dökümü solda; Alıcı · Kargo · Fatura sağda. Kalemler tablo yerine satır kartı (`RecordLineList`): adet kapsülü, stok kodu/barkod, birim fiyat; iptal kalemi kırmızı değil soluk + üstü çizili. |
| 30 Veri doğruluğu | Fatura kartında ham `INTEGRATOR` sızıyordu (eşleme `E_ARCHIVE/E_INVOICE` arıyordu; backend `MARKETPLACE/INTEGRATOR/MANUAL`) → "E-fatura entegratörü"; fatura durumu (`PENDING/SUCCESS/FAILED`) ve gönderim yöntemi eklendi. Kargo kaydı varken "Kargoya verin" denmez: "Paketi kargo firmasına teslim edin" + **Barkod yazdır**. |
| 31 Sipariş durumu listesi | Filtre seçimi iş akışı gruplarıyla (İşlem bekleyen · Pazaryerinde · Yolda · Kapanan), yaşam döngüsü sırası, her durumda tek satır açıklama ("Onaylamanız gerekiyor", "Sizden işlem beklenmiyor"). Listede durum + tutar kolonları kimliğin hemen ardında (1440'ta kaydırmadan görünür; eskiden kesiliyordu), durum çipinin altında aynı sade ipucu; iptalde "Müşteri iptal etti". Tek kaynak: `src/design/status-map.ts` (ORDER/CLAIM_STATUS_GUIDE). "Teslimat Bekleniyor" → "Kargoda". |
| 32 İade durumu + filtreler | Etiket çakışması giderildi: APPROVED/REJECTED/COMPLETED üçü de "Tamamlandı", UNDER_REVIEW/DISPUTED ikisi "İncelemede" idi → Onaylandı · Reddedildi · Tamamlandı · İtirazda · Yeni Talep. REJECTED tonu `success` → `danger`. Gruplu seçim (Karar bekleyen / Sonuçlanan) + açıklama. **Talep türü** filtresi eklendi (backend `claim-service` `filter.types` zaten destekliyordu). Tür kolonu ham `REFUND/REPLACEMENT/CANCEL` yerine "Para iadesi / Değişim / İptal". |
| 33 İade detayı | Sipariş detayıyla aynı iskelet (özet · sıradaki adım · süreç · iki kolon). "İnceleyip karar verin" kartında Reddet/Onayla. Ayrı "İade nedeni" kartı kalktı: neden ve müşteri notu ilgili kalemin altında (tek yerde), bölüm alt satırında nedenlerin özeti. Geçmiş: son durum vurgulu, tarih sağda. Detay `type` eşlemesi backend enum'una düzeltildi (REPLACEMENT → "Değişim talebi"). |
| 34 Müşteri | Kart (A13) zaten premium; liste: kurumsal kayıtta ad "—" yerine `companyName`, birden çok kanal "+n", durum filtresi `EkSelect` (ton + açıklama). KVKK maskeleme korunur (liste her zaman maskeli). |
| 35 Fatura / mesaj / destek | Fatura detayı kayıt özeti dilinde; hatalıysa kaynaktan gelen `statusMessage` olduğu gibi; **TCKN/VKN varsayılan maskeli** (göster anahtarı, eskiden açıktı). Mesaj detayı sohbet görünümü (müşteri balonu → yanıtınız → yanıt alanı); **müşteri telefonu açık gösteriliyordu → kaldırıldı**; "Siparişe git" kabuğun sekme yoluyla (`openTab` + `globalSearch`), olmayan rota yerine. Destek detayı zaten yeni dilde, dokunulmadı. |
| 36 Ayarlar / yetkilendirme | Ayarlar ekranı r2a'da üst seviyeye taşındı ve çalışır (kabuk sahibi) — içerik burada değişmedi. Yetkilendirme: rozet ham `MANAGER` yerine `getRoles` adı ("Yönetici"), "Mağaza sahibi", "Süper yönetici" cümle düzeni; rol filtresi `EkSelect` + rol açıklaması. |
| 37 Çıktılar ve işlemler | Çıktılar: dört aynı "a4/a4/a5/a5" düğmesi → minyatür sayfa + "A4 · Dikey/Yatay" segmenti; **bağlı olmayan "Test Çıktısı/Temizle" artık dürüstçe devre dışı** + "önizlemede" açıklaması (şablon kaydı API'si yok). İşlemler listesi r2a/r2b standardıyla yeterli; değişmedi. |
| 38 Finans | Özet şeridi "para akışı" oldu: **Brüt alacak − Kesintiler = Net hakediş**, oran çubuğu, kesinti oranı, kargo, işlem sayısı. "Komisyon" etiketi yanlıştı (`summary.totalDebt` tüm borç kalemlerinin toplamı) → "Kesintiler · komisyon ve diğer kesintiler". Oran yalnız backend özetinden (debt/credit; brüt 0 ise gösterilmez). Tabloda "Tutar detayı (+/-)" → etiketli "Alacak / Kesinti" (sıfır kalem "—"), net etki işaretli; siparişsiz satır "Manuel" yerine "Siparişe bağlı değil". |

Ortak (packages/ui, additive): `EkNextStep` (yeni), `EkDetailSheet` `size="lg"` + dar ekranda kimlik satırı (eylemler alta sarılır, kimlik gizlenmez) + başlık taşmada `…`, `EkRecordSummary` dar ekranda tutar bloğu iki satır, `EkFilterPanel` "Enter ile sorgula" ipucu `content-subtle` → `content-muted` (axe color-contrast 2.52 → AA; r2a bileşeni, tek token).
Uygulama: `RecordLineList` (sipariş + iade kalemleri), `status-map.ts` durum rehberi (`orderStatusOptions`, `claimStatusOptions`, `claimTypeLabel`).

## İterasyonlar
1. **1. tur (r2b tabanında):** detay yeniden kurgusu + durum rehberi. Eleştiri: sonraki adım "Kargoya verin" diyordu ama kargo kaydı varken SHIP izni yok → çelişkili kart; düzeltildi (barkod adımı). Durum ipuçları etiketi tekrar ediyordu ("Platform Onayı Bekliyor / Pazaryerinin onayı bekleniyor") → bilgi ekleyen metinler. Kanal rozetleri eski token çıktısı yüzünden zeminsizdi → `npm run tokens`.
2. **2. tur (r2a + r2b birleşik):** 390'da iade başlığında kimlik tamamen kayboluyordu (eylemler yer kaplıyor) → başlık sarılır. 1440 listede tutar hâlâ kesiliyordu → durum + tutar öne. Müşteri listesinde çok kanal dikey sarılıp satırı büyütüyordu → tek rozet + "+n". Finans özeti ile kabuğun tur teklifi tablo başlığını örtüyordu (test) → finans spec'inde teklif kapalı sayılır.

## Testler (bulut, chromium)
- `vitest run` **69 dosya / 1413 test geçti**; `vue-tsc --noEmit` 0 hata; `vite build` başarılı; style/pattern/typecheck/no-console mandalları OK.
- Playwright (`--update-snapshots=missing`, linux tabanları git-ignored; görsel onay yerelde): orders, claims, customers, messages **masaüstü tümü geçti** (axe dahil); printouts, invoices, financial (kendi değişikliklerim) geçti.
- **Önceden kırmızı (origin/main'de aynı şekilde başarısız, bu dalın değil):** authorization 3 (owner silme `mdi-delete` seçicisi, ekle/düzenle diyaloğu Kaydet tıklanamıyor), financial 3 (Özet/Ödeme dökümü hata metinleri), settings 4 (Ayarları Kaydet etkileşimleri), support-tickets 2–4 (eski başlık/diyalog metinleri). Ana dalda koşu ile karşılaştırıldı.
- Spec güncellemeleri (bilinçli değişiklik notlu): authorization (rol adı), financial (özet etiketleri, oran, eye seçici), printouts (kâğıt düğme adları, palet kapsamı), invoices (detay metni, eye seçici), orders/claims/customers/messages (A8 `mdi-eye-outline` seçicisi).

## Backend'e iletilecek eksikler
1. **Sipariş kalem görseli** yok (`IOrderItem`'da `imageUrl`); detayda ürün fotoğrafı gösterilemiyor.
2. **İade red gerekçesi** yalnız `claim.meta.rejectReason` (yazan akış belirsiz); `IClaim`'e açık alan + pazaryeri red kodu → metin eşlemesi.
3. **İade listesinde müşteri projeksiyonu** (`claim.customer`) arayüzde tanımsız (`IClaimPackage.customer: any`); sözleşme gerekli.
4. **Finans özetinde kırılım yok:** `totalDebt` tek sayı; komisyon / kargo / iade / diğer ayrımı (`$sum commissionAmount` vb.) gelirse akış kartı ayrıntılanır. `totalCargo`'nun `totalDebt` içinde olup olmadığı belgelenmeli.
5. **Çıktı şablonu API'si yok** (kaydet / listele / test çıktısı); ekran tasarımcı önizlemesi olarak kalıyor.
6. **Mesaj detayı:** müşteri telefonu yanıtta açık geliyor; liste/detay için maskeli projeksiyon (`isPhoneMasked`) önerilir.
7. **Fatura alıcısı:** `customer.identities[].tcknOrVkn` açık geliyor; maskeli + izinli açma.

## Açık konular (diğer işler)
- Mobil çekmecede grup başlığı ("Destek") tıklaması örtülüyor → r2a (kabuk).
- Kabuğun "uygulama turu" teklifi sağ altta tablo başlıklarını örtebiliyor (e2e'de tıklamayı kesiyor) → yardım/kabuk.
