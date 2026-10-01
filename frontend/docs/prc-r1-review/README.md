# prc-r1 — maliyet (PRC-R0) ve Trendyol buybox görünürlüğü (PRC-R1), müşteri uygulaması

Dal `cloud/prc-r1`. Sözleşme tek kaynağı: `docs/PRICING_COMPETITION.md` (§5 API). Yalnız `frontend/src` (+ e2e/test/dok); backend ve
`frontend/backoffice` değişmedi. Pazaryerine HİÇBİR yazma yok (salt okuma). K48: akış/IA değiştiren öneriler → `docs/PROPOSALS_PENDING.md`
(P-PRC-1..8). Metinler `pricing.*` anahtarlarıyla TR (birincil) + EN (`tests/prc-r1-pricing.test.ts` iki dilin anahtar eşitliğini korur).

## Ne yapıldı

| Alan | Yapılan | Dosya |
|---|---|---|
| Maliyet alanı (varyantlı) | Varyant ızgarasına "Maliyet (KDV hariç)" sütunu (sonda; klavye sırası = görsel sıra). Boş = maliyet yok (`null`, 0 değil); toplu düzenlemede "Temizle" boşaltır, boş maliyette yüzde/tutar uygulanmaz | `variants/grid/variantSheet.ts` (yeni hücre türü `moneyOpt`), `VariantGrid.vue`, `VariantBulkEditor.vue` |
| Maliyet alanı (tekil ürün) | "Fiyat" bölümünde boş-olabilen para alanı + ipucu | `ProductSingleVariantComponent.vue` |
| Maliyet kaydı | Genel varyant kaydı SONRASI ayrı çağrı `PricingService/setVariantCosts` (yalnız DEĞİŞENLER; ≤500'lük parçalar). Sonuç ayrı bildirilir: başarı / kısmi / "Ürün kaydedildi, ancak maliyetler kaydedilemedi" (yetkisiz için ayrı metin). Başarısızlıkta girilen maliyet formda KALIR (sunucu yanıtı formu ezse de geri uygulanır), yeniden Güncelle'de tekrar gönderilir | `useCostSave.ts`, `usePricingApi.ts` (saf: `changedCosts`, `applyCostEdits`, `saveCostEdits`), `ProductUpdateView.vue`, `ProductDefinitionView.vue` |
| Ürün oluşturma | Yeni varyantın kimliği yok → kayıttan sonra **barkodla** (`items[{barcode,costPrice}]`) yazılır; barkodsuz varyantın maliyeti için uyarı. Oluşturma sonrası form sıfırlanır: maliyet hatasında kullanıcıya "ürünü düzenleyerek yeniden girin" denir | aynı |
| Maliyet kapsamı | Liste başlığı altında sakin satır "Maliyet kapsamı %X" (`listCosts {limit:1}`); %100 değilse yanında görünür ipucu "Maliyeti girilmemiş ürünlerde kâr hesaplanmaz." Yükleniyor = iskelet, hata = sakin metin + "Yeniden dene", yetkisiz/veri yok = gizli | `CostCoverageChip.vue`, `ProductListView.vue` (`#summary`), `EkListScreen.vue` (boş `summary` yuvası gizlenir) |
| Buybox rozeti | Sayfadaki ürünler için TEK `listBuybox {productIds, limit:200}`; ürün başına özet: herhangi bir varyant `losing` → "Buybox kaybedildi" (uyarı), hepsi `winning` → "Buybox sizde"; `not_found`/`unchecked`/karışık → rozet yok; `settings.enabled=false` → rozet ve filtre yok. İkon + metin (renge bağlı değil), çoklu varyantta sr-only "n varyantın m tanesinde" | `BuyboxBadge.vue`, `summarizeBuybox` |
| Buybox filtresi + URL | Filtre panelinde "Buybox (Trendyol)": Kazanılan / Kaybedilen / Bulunamadı / Okunmadı → `getProducts.searchProductForm.data.buyboxStatus`; aktif filtre çipi. `/products?buybox=losing&barcode=…` (bildirim eylemi) filtreyi açar; bilinmeyen değer yok sayılır; `barcode` yalnız `buybox` ile birlikte süzgeç | `ProductListView.vue`, `navigation/screens.ts` (`urlParams`), `buyboxFilterFromParams` |
| Rekabet ve kâr | Ürün düzenleme → Varyantlar adımının altında bölüm (yalnız kayıtlı üründe): varyant seçici (≤50; kaybedilen varsayılan), buybox durumu + sıra, buybox fiyatı, fiyatım, fark (TL ve %), mevcut fiyatta kâr, buybox fiyatında kâr, başa baş fiyat, komisyon (oran + sözleşme/gerçekleşen/tahmini/bilinmiyor), eksik bileşenler, "Buybox'a ulaşmak başa baş fiyatın altında" uyarısı, "Öneri ve kurallar kapalı" uyarısı + "Maliyet girin" (varyant tablosuna götürür), "Son güncelleme", "Bir sonraki tazeleme" (kapalı / henüz okunmadı / yoğunluk nedeniyle gecikti), bayat veri etiketi, 30 gün SVG çizgi grafiği (buybox kesikli, fiyatım düz; kütüphane YOK), kanal desteği (Hepsiburada/N11/Pazarama "Desteklenmiyor") | `CompetitionPanel.vue`, `BuyboxSparkline.vue`, `marginView`, `refreshInfo`, `sparkModel` |

## Kararlar

| Karar | Gerekçe |
|---|---|
| Maliyet sütunu ızgaranın SONUNDA | Hücre dizini = klavye sırası; ortaya eklemek `[3,4,5,6,8,9]` aria-colindex eşlemesini ve tüm indeksleri kaydırırdı. Bedel: 1280'de yatay kaydırma (P-PRC-3) |
| `moneyOpt` hücre türü (null ≠ 0) | Bilinmeyen maliyet 0 gösterilmez/yazılmaz; "Temizle" = maliyeti siler |
| Değişen-alan hesabı açılış taban çizgisine göre (`costBaseline`) | Değişmeyen kalem gönderilmez (backend `costUpdatedAt` tarihini korur); `0` ile "yok" ayrı |
| Rozet ürün özeti "hepsi winning" | Brif: karışık/okunmamış nötr; kaybedilen tek varyant bile uyarı |
| Panel `previewMargin` + `listBuybox` + `getBuyboxHistory` ayrı çağrılar | `previewMargin` zaman/tazeleme alanı taşımıyor; `listBuybox` başarısız olsa da kâr gösterilir (zamanlar "—"/kapalı) |
| Tazeleme `enabled && !checkedAt` → "Henüz okunmadı" | `nextRefreshAt=null` iki anlama gelir (kapalı / hiç okunmadı); ikisi ayrılır — yanlış "tazeleme kapalı" iddiası yok |
| "Rekabet ve kâr" yalnız `_id`'li üründe, kayıt sonrası yenilenir | Oluşturma ekranında varyant kimliği yok; panel `previewMargin` varyant kimliğiyle çalışır |
| Kâr/başa baş `null` → "—" | Bilinmeyen değer 0 yazılmaz; maliyet yoksa "Maliyet girin" |
| Yüzde işareti Türkçede önde (%60), İngilizcede sonda | `vue-i18n` `%{…}` yazımı `%` işaretini yer; yüzde metni kodla hazırlanır |
| Grafik renkle + çizgi stiliyle ayrışır | WCAG 1.4.1; sr-only özet metni |

## Testler

| Komut | Sonuç |
|---|---|
| `npx vitest run tests/prc-r1-pricing.test.ts` | 38 test geçti (rozet özeti, filtre/URL eşlemesi, değişen maliyet, kayıt sonucu, ızgara `moneyOpt`, kâr paneli durumları, tazeleme, sparkline, i18n eşitliği, kaynak sözleşmeleri) |
| `npx vitest run` (tam) | 1687 test (baz tabanı + 38); `tokens` üretildikten sonra tümü geçer |
| `npm run typecheck` (vue-tsc) | 0 hata (typescript 5.4.5 ile; ortamda hoisted 5.9.3 vue-tsc 1.8'i çalıştırmıyor — yalnız `node_modules`, repo değişmedi) |
| `npm run build` | geçti |
| mandallar (style / pattern / no-console / contract-paths) | OK |
| e2e `e2e/specs/prc-r1-pricing.spec.ts` (20 test; sahte API, `--update-snapshots=missing`) | masaüstü 1280 ve mobil 390: 20/20 geçti; axe (wcag2a/aa/21a/21aa) liste + Rekabet bölümü: critical/serious 0 |
| backend `operation-policy.test.ts` karşılaştırması | taban ve bu iş: AYNI 5 test kırık; bu iş yeni kırılma eklemedi, taban listesindeki 5 `PricingService/*` "kayıtta ama FE çağırmıyor" satırı kapandı (FE artık çağırıyor) |

Yeniden üretme (görüntüler): `PRC_REVIEW=1 PRC_WIDTH=1280 PRC_OUT=docs/prc-r1-review/1280 npx playwright test e2e/specs/prc-r1-pricing.spec.ts -c playwright.cloud.config.ts --project=chromium-desktop` ve `PRC_WIDTH=390 … --project=chromium-mobile` (`PRC_OUT=docs/prc-r1-review/390`).

## Ekran görüntüleri (`1280/`, `390/`; açık tema)

| Dosya | Ne gösteriyor |
|---|---|
| `urun-listesi-rozet-kapsam.png` | Liste: "Maliyet kapsamı %60" + ipucu; satırlarda "Buybox kaybedildi" / "Buybox sizde"; okunmamış ürün rozetsiz |
| `urun-listesi-buybox-filtre.png` | Filtre paneli "Buybox (Trendyol)" = Kaybedilen, aktif filtre çipi |
| `urun-duzenle-maliyet-kaydedildi.png` | Varyant ızgarasında maliyet sütunu; kayıttan sonra "Maliyetler kaydedildi" |
| `urun-duzenle-maliyet-hatasi.png` | Ürün kaydedildi ama maliyet kaydı 5xx: ayrı, açık hata; girilen maliyet formda duruyor (üstteki "Bir şeyler ters gitti" uygulama geneli bildirimdir → P-PRC-8) |
| `rekabet-ve-kar-hazir.png` | Rekabet ve kâr: durum, fiyatlar, fark, kâr, başa baş, komisyon kaynağı, zamanlar, grafik, kanal desteği |
| `rekabet-ve-kar-taban-alti.png` | "Buybox'a ulaşmak başa baş fiyatın altında" uyarısı |
| `rekabet-ve-kar-maliyet-yok.png` | Maliyetsiz varyant: kâr alanları "—", "Öneri ve kurallar kapalı" + "Maliyet girin" |
| `rekabet-ve-kar-grafik-bos.png` | Geçmiş yok: boş durum metni |
| `rekabet-ve-kar-hata.png` | Panel hatası: "Rekabet bilgisi yüklenemedi" + Tekrar dene (ham hata yok) |
| `rekabet-ve-kar-yetkisiz.png` | 403: "Bu bölümü görme yetkiniz yok" |

## Bilinen sınırlar

- `listBuybox` tek çağrı + `limit:200`: sayfadaki ürünlerin toplam varyantı 200'ü aşarsa bazı varyantlar rozete girmez; `productIds` ≤100 (sayfa boyutu >100 ise fazlası rozetsiz). Ürün başına özet için backend önerisi: P-PRC-6.
- Panel varyant seçicisi ilk 50 varyantı gösterir (`previewMargin` ≤50); fazlası için not düşülür.
- Izgara/toplu düzenleyici metinleri (yeni sütun dışında) hâlâ kod içinde Türkçe (P-PRC-7).
- 1280 px'te maliyet sütunu yatay kaydırmayla görünür (P-PRC-3).
- `sameValue` (geri al/yinele ve hücre vurgusu) `null` ile `0`'ı eşit sayar: boş maliyete "0" yazmak hücre vurgusunda/geri alma geçmişinde görünmez; kaydetme hesabı (`changedCosts`) bunu doğru ayırır ve gönderir.
- Rekabet bölümü kaydedilmemiş (formdaki) maliyeti değil sunucudaki maliyeti kullanır; kayıttan sonra yenilenir.
- Buybox alanları Trendyol'da yerelde doğrulanmadı (`docs/PRICING_COMPETITION.md` §6); bu ekran yalnız backend sözleşmesini gösterir.
- Mobil (390): ızgara, tablo olarak yatay kayar (mevcut davranış); Rekabet bölümü tek sütuna iner.
