# fe-r2c — Ürün formu (FR2-PFORM 23–29) inceleme notu

Dal: `cloud/fe-r2c` (taban `origin/main`, sonda `cloud/fe-r2b` birleştirildi; r2b zaten `cloud/fe-r2a`'yı içeriyor).
Kaynak: `docs/cloud-contracts/FE_FEEDBACK_R2_2026-09-30.md` madde 23–29. Görüntüler bu klasörde: `<durum>-{before|after}-{1440|390}.png`
(`e2e/specs/fe-r2c-review.spec.ts`, `R2C_REVIEW=before|after`; sentetik veri `e2e/fixtures/productFormR2c.ts`).
"after" görüntüleri birleştirilmiş (r2a kabuk + r2b rozet) hâlden alındı.

## Kararlar

| Madde | Sorun (kök neden) | Karar |
|---|---|---|
| 23 combobox "yeni ekle" | Ekleme kutusu `v-autocomplete` menüsündeydi; Vuetify menüde basılan her yazdırılabilir tuşu arama kutusuna geri yönlendirir (`VAutocomplete onListKeydown`) → kutuya **yazılamıyordu**. Ayrıca istek beklenmiyor, yeni kayıt seçilmiyor, hata yutuluyordu. Seçili kayıt önceden süzülen listeden düşünce kutuda ham kimlik (`brand-e2e-1`) görünüyordu | Menüde metin kutusu yok: listenin altında öneri satırı (**"“Kuzey Tekstil” adıyla yeni marka ekle"**), Enter (eşleşme yoksa) ya da tıklama → kısa form diyaloğu (`QuickCreateDialog`, `EkFormDialog`). Ad arama metniyle dolu, yineleme denetimi (tr harf duyarsız, "Onu seç"), istek beklenir, liste yenilenir, yeni kayıt **seçili gelir**, tost. Hata diyalogda kalır ("Marka eklenemedi — bağlantınızı kontrol edip tekrar deneyin", 403 → yetki). Kategoride üst kategori seçimi; ürün formunun kademeli seçicisine "“X” altına kategori ekle" (açık klasör) + boş ağaçta "Kategori ekle". Filtre Vuetify'a bırakıldı (`custom-filter`, tr), odakta mevcut ad seçili gelir (yazılan ada eklenmez) |
| 24/29 varyant görselleri + tablo | 36px küçük resim, seçenek çipleri sarıyor, stok kodu kırpılıyordu | Satır 56 → 72px, küçük resim **56px** (galeriyle aynı `GalleryThumb`, `contain`), görselsiz varyant "Ekle" kutusu; "Seçenekler" sütunu kaldırıldı → stok kodunun altında tek satır ("Beden: M · …"), 1440'ta tablo yatay kaymadan sığar. Başlık/hücre dili uygulama tablolarıyla aynı (micro büyük harf başlık, kalem + kırmızı çöp eylemleri). Galeri "Varyantlar" sekmesinde küçük resimler 44 → 60px (alt satır 32 → 44) |
| 25 kanal fiyatı | Her kanal katlanır kutu; "Toplu Fiyat Atama" açılır menülü; fiyatı olmayan kanal "Fiyat yok" deniyordu — oysa backend (`trendyol/ProductTransformer`: `platforms[kod]?.prices \|\| variant.prices`) o kanala **ana fiyatı** gönderir | Yeni yapı: **Ana fiyat** kartı (düzenlenebilir, indirim %) → **Kanal tablosu** (rozet · Özel fiyat/Ana fiyat · satış · piyasa · indirim · ana fiyata göre fark; "Özel fiyat" ana fiyattan kopyalar, "Ana fiyata dön") → **Toplu değişiklik** (satış/piyasa · ata / % artır-azalt / tutar ekle-düş · önizleme cümlesi "3 kanalda satış fiyatı %10 artar (ör. Trendyol: ₺369,90 → ₺406,89). 1 kanal ana fiyattan özel fiyata geçer."). Kurallar satırda: satış > 0 (hata), satış ≤ piyasa (uyarı). Tekil ürün formunda kanal başına etkin fiyat özeti; ızgaradaki aralık ana fiyatlı kanalları da sayar. Model aynı; mantık `variants/channelPriceModel.ts` |
| 26 inline edit | Hücre içinde ikinci bir çerçeveli kutu, hata yalnız ikon | Hücre = düzenleme alanı (kutu içinde kutu yok): 2px aksiyon halkası + hafif gölge, çerçevesiz giriş, hata metni hücrede (`role=alert`), üzerine gelince düzenlenebilir ipucu (ton + metin imleci). Klavye/yapıştır/geri al davranışı aynı |
| 27 galeri | 148px kutular, hangi görsel olduğu belirsiz, sıralama tutamağı yalnız üzerine gelince | Kutular 184px; her kutuda altyazı: **sıra ("Kapak" / "3. görsel") · dosya adı** (kapakta çözünürlük); tutamak her zaman görünür; başlık "6 görsel · ürün sayfasında ve kanallarda bu sırayla gösterilir; 1. görsel kapaktır", ipucu "Sırayı değiştirmek için görseli sürükleyin ya da ⋯ menüsünden taşıyın". Formdaki galeri kutusu: kapak + sıradaki 3 görsel + "+N" + "Galeriyi düzenle". Sıralama düzenleme ekranında (`ProductUpdateView`) sürükle-bırak + klavye + menüyle çalışır (`sortImages`, e2e ile doğrulandı) |
| 28 sürükleme hayaleti | SortableJS `forceFallback` kopyası kapta `position:fixed`; diyalog kabının `transform`'u kapsayıcı bloğu değiştirdiği için kopya imleçten diyalog ofseti kadar uzakta çiziliyordu (`gallery-drag-before-1440.png`) | `fallbackOnBody: true` — kopya body'de, imlecin altında (`gallery-drag-after-1440.png`); e2e imlecin kopyanın içinde kaldığını ölçer |

Ortak standartlar (`frontend/docs/FR2_PATTERNS.md`): yeni alanlara yükseklik/yoğunluk verilmedi, yükseklik `--ek-control-h-field`;
kanal rozeti r2b'nin `EkPlatformMark` → `EkChannelBadge` kısa formu üzerinden gelir; r2b'nin liste dosyalarına dokunulmadı.
Yeni ortak paket bileşeni gerekmedi (QuickCreate* uygulamaya özgü: store/i18n bağımlı → `src/components/common`).

## İterasyonlar

1. **Önce** görüntüler (1440+390) → sorunlar yukarıdaki "kök neden" sütunu.
2. **Uygula 1** → eleştiri: combobox'ta seçili adın sonuna yazılıyordu ("E2E Marka BirYeni Marka") → odakta ad seçili gelir (mouseup
   korumalı). Varyant ızgarasında "Seçenekler" sütunu 1440'ta ~0px'e eziliyordu → sütun kaldırılıp kodun altına alındı. Galeri
   altyazısında çözünürlük adı kırpıyordu → yalnız kapakta. Kanal tablosunda tekrar eden kayan etiketler ve boş etiket boşluğu →
   sütun başlığı + `aria-label`; satırlar hizasızdı → boş altyazı yer tutucu.
3. **Uygula 2** (390) → kanal tablosu satırı sıkışıyordu (kanal adı kırpık, satış/piyasa ayırt edilemiyordu) → mobilde alan
   düzeni (kanal+eylem / satış·piyasa etiketli / indirim). Galeri varyant sekmesi görselleri büyütüldü.
4. **Birleşik** (r2a+r2b) → rozet `data-channel` ile satır özniteliği çakıştı (e2e) → satır `data-cpe-row`; tüm "after" yeniden alındı.

## Testler (son koşu, birleşik hâl)

| Kontrol | Sonuç |
|---|---|
| `npm test` (vitest tam) | 71 dosya / 1430 test geçti (yeni: `r2c-quick-create`, `r2c-channel-price-model`) |
| `vue-tsc` (typecheck ratchet) | 0 hata |
| style / pattern / no-console ratchet | OK |
| `npm run build` | başarılı |
| Playwright `product-form-r2c` (desktop 1280 + mobile 375) | 7/7 + 7/7: yeni marka (akış, yineleme, 500 hatası), kategori (kademeli seçici, üst kategori gövdesi), galeri sürükleme hayaleti + `sortImages` gövdesi, varyant küçük resmi ≥ 48px, kanal fiyatı (özel/ana/toplu + **kayıt gövdesi**) |
| axe (WCAG 2.1 AA, critical/serious = 0) | yeni marka diyaloğu, kanal fiyatları diyaloğu, galeri, varyant ızgarası |
| `product-definition-parts` | geçti (galeri tıklaması `data-pf-field` ile; linux tabanı `--update-snapshots=missing` ile yazıldı, commit'lenmedi) |

**Bilinen (bu işten önce de kırmızı, `origin/main` üzerinde aynı koşuyla doğrulandı):** `product-variants.spec.ts` ve
`product-variant-dialogs.spec.ts` A6a ızgara yeniden yazımından önceki DOM'u bekliyor ("Grup" başlığı, `thead` içinde
`.mdi-menu` işlem menüsü, satır içi Stok Kodu/Barkod formu) → 16 test zaman aşımı/bulunamadı; `product-definitions.spec.ts`
smoke da tabanda kırmızı. Bu dosyalar A6a sonrası güncellenmeli (bu işte yalnız diyalog başlığı metni güncellendi).
Görsel tabanlar (`*-win32.png`) yerelde yenilenmeli: `product-variant-dialogs` (kanal fiyatı), `product-definition-parts`
(galeri, tekil ürün), `product-variants`.

## Backend'e iletilecek eksikler

1. **Aynı adlı marka/kategori:** `BrandService/addBrand` ve `CategoryService/addCategory` yineleme denetimi yapmıyor (şemada
   `unique` yok); önyüz tr-harf-duyarsız denetliyor ama eşzamanlı iki istemcide çift kayıt açılabilir. Öneri: tenant içi
   `title` (katlanmış) için tekil indeks + 409 `DUPLICATE_TITLE` (önyüz 409'u zaten "Bu adla bir … zaten var" diye gösteriyor).
2. **`addBrand`/`addCategory` yanıtı yalnız `{ _id }`**: önyüz yeni kaydı görmek için tüm listeyi yeniden çekiyor. Öneri: oluşan
   belgeyi (`_id, title, parentId`) döndürmek.
3. **`CategoryService.get` şekli:** ana kökü çocuksuz ilk öğe + ana seviye kategorileri kardeş olarak döndürüyor (e2e fixture'ı
   ise ana kökün `children`'ı olarak kurguluyor). Önyüz iki şekli de karşılıyor; sözleşme tek şekle indirilmeli ve belgelenmeli.
4. **Ürün eklenmiş yaprağın altına kategori eklemek** o yaprağı klasöre çevirir (ürünler klasörde kalır). Backend uyarı/engel yok;
   önyüz şimdilik yalnız "… altına eklenir" ipucu veriyor. Karar gerekirse: `addCategory` üst kategoride ürün varsa 409 ya da uyarı alanı.
5. **Kanal fiyatı kuralları:** "satış ≤ piyasa" ve "satış > 0" önyüzde uyarı olarak gösteriliyor; kanal başına kesin kural (ör.
   Trendyol) backend hata kodu → mesaj eşlemesinden gelmeli (premium-ui-standards "hata eşleme tablosu backend'den").
6. **Görsel adı:** adsız yüklemede `confirmUpload` `originalname` yerine `uploadId` yazıyor; galeri bunu gizleyip "Görsel n"
   gösteriyor. Öneri: yükleme biletinde istemci dosya adını zorunlu göndermek ya da `originalname` boş kalmak.
