# Entegrasyonik logosu ve adı: özgünlük, telif ve marka ön araştırması (2026-10-01)

> **Hukuki görüş değildir.** Bu belge bir yapay zekâ ajanının yaptığı iç ön araştırmadır. Karar vermeden önce bir marka vekili ya da avukat görmelidir.
> Etiketler: **(arama özeti)** = kaynağın kendisi açılamadı (proxy engeli), yalnız arama sonucundaki özete dayanılıyor. **(model bilgisi)** = kaynakla doğrulanmadı, ajanın genel bilgisi. **DOĞRULANAMADI** = bu oturumda kontrol edilemedi.
> Rakip ve üçüncü taraf adları yalnız bu iç belgede geçer (K-kuralı: sitede rakip adı yok).
> Kapsam: yalnız araştırma. Kod ve logo değiştirilmedi.

## (a) Sade özet

Logo, bir yapay zekâ ajanının bu projede **elle yazdığı özgün bir SVG** gibi görünüyor. Dış şablon, stok görsel ya da ikon kütüphanesi kullanıldığına dair hiçbir iz yok. Beş açık kaynak ikon kütüphanesinden (Lucide, Tabler, Heroicons, Material Design Icons, Bootstrap Icons) toplam **24.324 ikonla** piksel karşılaştırması yapıldı ve yakın kopya çıkmadı (ayrıntı: c). Bu ortamda tersine görsel arama ve marka veritabanı sorgusu yapılamadı. Bu yüzden başka bir şirketin logosuna benzerlik **dışlanamıyor**, bu adımları bir insanın yapması gerekiyor (f).

**Risk düzeyi:**
- **Logonun başkasının hakkını ihlal etme riski: düşük–orta.** Düşük, çünkü köken temiz ve kütüphanelerde benzeri yok. Orta, çünkü insan kontrolü yapılmadı ve "yuvarlak kare içinde E" yaygın bir kalıp.
- **Logo ve adı kendimiz koruyabilme riski: orta–yüksek.** Üç neden var:
  1. Ad, tanımlayıcı "entegrasyon" kelimesine dayanıyor (SMK m.5/1-c).
  2. Logo yalnız yapay zekâ ile üretildiyse FSEK'te eser sayılmayabilir.
  3. Bugüne kadar hiçbir tescil başvurusu yapılmamış görünüyor.
- **En önemli adım:** TÜRKPATENT araştırması, ardından kelime + şekil başvurusu.

## (b) Logonun köken kaydı (git kanıtı)

| # | Kanıt | Kaynak | Çıkarım |
|---|---|---|---|
| 1 | Bulut deposu "geçmişsiz önyüz kopyası". Tüm geçmiş 3 commit'ten ibaret: `5586efd` (baseline, 2026-09-29), `e2bb7a2` (sync @ f40f700, 2026-09-29), `d9160ff` (sync @ 52bb6bdb, 2026-10-01). Committer adı "Emre", her commit yerel `faz3-arayuz` dalının senkronu | `git log --follow site/src/components/Logo.astro` ve `frontend/packages/ui/src/brand/logo-mark.svg` | Bu commit'ler gerçek yazarı göstermiyor. Asıl geçmiş yerel depoda (`faz3-arayuz`) |
| 2 | `e2bb7a2` diff'i: eski işaret "**basit geometrik işaret YER TUTUCUSU**" idi (kare + merkez daire + üçgen dizilişli 3 düğüm, rx=8). Yerine bugünkü "E" monogramı geldi: rx=9, halo, `path`, 2 düğüm. Yorum başlığı: "**Logo (S15) — özgün Entegrasyonik işareti**" | `git show e2bb7a2 -- site/src/components/Logo.astro` | İşaret, site sprinti **S15** içinde üretildi |
| 3 | ADR-0014 (2026-09-28): "Site, onay gelene kadar metinsel logotip + basit geometrik işaret yer tutucusu kullanır; **nihai logo ve renk uyumu insan kararıdır** (Açık Soru 3)". Ayrıca "marka logosu/görsel varlıkların ticari lisansı … insan onayı bekliyor" | `docs/adr/0014-*.md` satır 4, 104, 165 | Logo kodla, ajan iş akışında üretildi. İnsan onayı ADR'de açık soru olarak duruyor |
| 4 | ADR-0015 Karar 1.4: uygulama sitenin işaretini kullanır. Drift testi geometriyi kilitler: "nihai logo geldiğinde iki dosya birlikte değişir (Açık Soru 1)" | `docs/adr/0015-*.md:160-169`, `frontend/tests/theme/logo-drift.test.ts` | Proje belgelerine göre işaret hâlâ **geçici/nihai olmayan** statüde |
| 5 | `USER_DECISIONS.md` içinde logo/kimlik kararı yok. Yalnız K13 (kanal rengi) ve K17/K39 (Otopilot adı) var | `docs/adr/USER_DECISIONS.md` | Ürün sahibinin logoyu onayladığına dair kayıt **yok** |
| 6 | Geometri 32×32 ızgarada, yarım piksel koordinatlarla (9.5 / 13 / 22.5) ve 2.4 çizgi kalınlığıyla elle yazılmış tek bir `path` + 3 `circle` + 1 `rect`. Kütüphane imzası yok: Lucide/Tabler 24×24 ızgara ve 2 px çizgi kullanır, Heroicons 24/20/16, MDI 24 dolu path. Lisans/atıf yorumu da yok | `logo-mark.svg`, `Logo.astro`, `EkBrandLogo.vue`, `site/src/lib/brand-images.ts` (favicon/PNG/OG aynı geometriden derleme zamanında üretilir) | Dış kaynaktan kopyalanmış izlenimi vermiyor |
| 7 | Proje, yapay zekâ ajanlarıyla yürüyen bir "fabrika": `CLAUDE.md`, `.claude/agents`, site sprint incelemeleri `site/docs/s16…s26-review`. Marka kimliği kılavuzu `site/docs/elev/BRAND.md` logonun çizimini tarif etmiyor | depo | |

**Sonuç (çıkarım, kesin değil):** İşaret büyük olasılıkla **S15 site sprintinde bir yapay zekâ ajanı tarafından doğrudan SVG kodu olarak yazıldı**. İnsanın katkısı görünüşe göre sprint brifini vermek ve sonucu kabul etmekle sınırlı. Ajanın aldığı brif metni ve insanın taslağı değiştirip değiştirmediği bu kopyada **yok**.

**İnsan adımı:** Yerel depoda şunu çalıştırın: `git log --follow -p site/src/components/Logo.astro`. Ayrıca S15 brif dosyasını ve o turun ajan konuşmasını bulun. İnsanın verdiği yönlendirmeleri (ör. "E harfi olsun, kanalların buluştuğu merkez") ve yaptığı düzeltmeleri tarihli olarak saklayın. Bu kayıt FSEK'teki "insan katkısı" tartışması için kanıt olur.

## (c) Benzerlik bulguları

### c.1 İkon kütüphaneleri: piksel karşılaştırması (yerelde yapıldı, 2026-10-01)

**Yöntem:**
- npm paketleri indirildi: `lucide-static@1.49.0`, `@tabler/icons@3.48.0`, `heroicons@2.2.0`, `@mdi/svg@7.4.47`, `bootstrap-icons@1.13.1`. Toplam 24.324 SVG.
- Bizim işaretimiz karo olmadan, yalnız E çizgisi ve düğümlerle alındı. Her ikon da aynı biçimde rasterleştirildi, sınır kutusuna kırpıldı ve 40×40'a normalize edildi.
- İki skor hesaplandı:
  - **IoU:** iki şeklin piksel olarak örtüşme oranı.
  - **F1tol:** ±1 piksel toleranslı kontur uyumu.
- **Kalibrasyon:** Bizim işaretin düğümleri hafifçe oynatılmış hâli (yakın kopya) **F1tol 0,99 / IoU 0,85** aldı. Aynı E çizgisinin düğümsüz hâli 0,84 / 0,55 aldı.

| Kütüphane (lisans) | En yakın ikon | F1tol / IoU | Değerlendirme |
|---|---|---|---|
| Heroicons (MIT) | `20/solid/server-stack` | 0,876 / 0,560 | İlgisiz şekil, dolu blok örtüşmesi. Benzerlik **yok** |
| MDI (Apache-2.0) | `receipt-text`, `image-off` | 0,86 / 0,56–0,58 | İlgisiz. **Yok** |
| Tabler (MIT) | `brand-craft`; E'li olan `filled/square-rounded-letter-e` | 0,853 / 0,519; 0,831 / 0,518 | "Yuvarlak kare içinde E" genel kalıbı. Düğüm/merkez yok. **Düşük** |
| Lucide (ISC) | `calendar-sync`, `globe` | 0,825 / 0,46 | **Yok**. Lucide'de E monogramı yok |
| Bootstrap Icons (MIT) | `database-fill-lock` | 0,848 / 0,475 | **Yok** |
| `git-commit` / `workflow` / `network` / `share` ikonları | Tabler/MDI `network*` | ≤0,82 / ≤0,50 | Aynı stil klişesi (yuvarlak uçlu çizgi + daire düğüm) ama kompozisyon farklı. **Düşük** |

- Hiçbir ikon kalibrasyondaki yakın kopya eşiğine (≈0,95+ / 0,8+) yaklaşmadı. **Bu kütüphanelerden türetildiğine dair kanıt yok.**
- Font Awesome, Phosphor ve Material Symbols taranmadı (**DOĞRULANAMADI**). Aynı betik bu paketlere de uygulanabilir. Betik bu belgede değil, oturumun geçici dizinindeydi. Yöntem yukarıda.

### c.2 Marka/logo benzerliği (web)

Arama motoru logo görseli ya da tarifi döndürmedi. Rakip sitelerine (WebFetch) ve lucide.dev'e erişim proxy tarafından engellendi. Görmeden şekil uydurulmadı.

| Benzer marka/logo | Sahibi | Alan / olası Nice sınıfı | Benzerlik derecesi | Gerekçe | Kaynak (erişim 2026-10-01) |
|---|---|---|---|---|---|
| **Entegra** | Entegra Bilişim (TR) | Pazaryeri/e-ticaret entegrasyonu; 9/35/42 | **Ad: orta–yüksek (önce bunu kontrol edin)**. Logo: DOĞRULANAMADI | Aynı sektör. "Entegra-" öneki ad olarak ortak. Logo görülmedi | https://kobitime.com/pazaryeri-entegrasyon-firmalari-karsilastirmasi-2026/ (arama özeti) |
| **Entegroni** | DOĞRULANAMADI | Pazaryeri entegrasyonu | **Ad: orta**. Logo: DOĞRULANAMADI | Aynı sektör, "Entegr-" + ek yapısı | Aynı kaynak (arama özeti) |
| Tam Entegre, Full Entegre | DOĞRULANAMADI | Pazaryeri entegrasyonu | Ad: düşük–orta | "Entegre" tanımlayıcı ortak kök | Aynı kaynak (arama özeti) |
| Sentos | DOĞRULANAMADI | Pazaryeri/ERP paneli | Ad: düşük. Logo: DOĞRULANAMADI | Ad farklı | https://apps.shopify.com/sentos (arama özeti) |
| Dopigo, StockMount, Sopyo, JetStok, Yengeç, Platin360, HamurLabs, Prapazar, BiFatura, ikas, Ticimax, T-Soft | Çeşitli (TR) | Pazaryeri/e-ticaret yazılımı | Ad: düşük. Logo: DOĞRULANAMADI | Ad yapısı farklı | kobitime.com (arama özeti); StockMount: https://kampus.metu.edu.tr/en/campus3/500-thousand-investment-stockmount-odtu-teknokent-company (arama özeti) |
| Entegra Coach | Karavan üreticisi (ABD) | Taşıt, farklı sınıf | Ad: düşük (farklı sınıf) | Yalnız isim çakışması | https://www.rvnews.com/entegra-coach-unveils-new-branding/ (arama özeti) |
| Global "E" monogramlı yazılım markaları (ör. Elastic, Ecwid, Envoy) | — | 9/42 | DOĞRULANAMADI | Kontrol edilemedi. Derece verilmedi | — |

**Görsel tersine arama bu ortamda yapılamadı.** İnsan adımları (f.2) bölümünde.

## (d) İsim: marka durumu ve ayırt edicilik riski

**Kayıt durumu:** "Entegrasyonik" için TÜRKPATENT, WIPO Global Brand Database ve EUIPO TMview kaydı **DOĞRULANAMADI**. Bunlar dinamik arayüzlü siteler ve bu ortamdan sorgulanamadı. Proje belgelerinde de bir başvuru/tescil kaydı yok.

**Alan adı ve sosyal hesaplar:**
- `entegrasyonik.com`: erişim proxy tarafından engellendi. WHOIS **DOĞRULANAMADI**.
- Proje belgeleri `app.entegrasyonik.com` ve `entegrasyonik.onrender.com` adreslerini anıyor (CLAUDE.md). Ama ADR-0014 "domain/hosting insan onayı bekliyor" diyor.
- `.com.tr` adresi ile Instagram/LinkedIn/X hesapları: aramada bulunamadı. Bu, hesapların boş olduğu anlamına gelmez.

**Ayırt edicilik (6769 SMK; 556 sayılı KHK'nın yerini 10.01.2017'de aldı):**

- **m.5/1-(b) ve (c), mutlak ret:**
  - (b) ayırt edici niteliği olmayan işaretleri, (c) malın/hizmetin türünü, niteliğini, amacını vb. belirten tanımlayıcı işaretleri reddettirir (arama özeti: https://www.erdem-erdem.av.tr/bilgi-bankasi/marka-tescilinde-mutlak-red-nedenleri).
  - "Entegrasyon" sözcüğü 9/35/42. sınıflardaki entegrasyon yazılımı için doğrudan tanımlayıcı.
  - Türkçe "-ik" eki ("elektronik", "otomatik" gibi) sözcüğü sıfatlaştırıyor. Bu, tanımlayıcılığı ortadan kaldırmayabilir. Bu bir değerlendirmedir, emsal bulunamadı (**DOĞRULANAMADI**).
  - "Entegrasyonik" sözlükte geçen bir kelime değil. Bu kurgusal yan lehimize.
  - **Tahmin:** Kelime markası olarak tescil edilebilir ama **zayıf** kalır. Başkalarının "entegrasyon" kökünü kullanmasını engelleyemeyiz. Ayırt edicilik yükünü şekil öğesi taşır.
- **m.5/2, kullanım yoluyla ayırt edicilik:** Başvuru tarihinden önce yoğun kullanım sonucu ayırt edici hale gelen işaret (b)/(c) gerekçesiyle reddedilmez (arama özeti: https://www.hukukihaber.net/markanin-mutlak-ve-nisbi-red-nedenleri). Bu yüzden ilk kullanım tarihlerini, faturaları ve reklam kanıtlarını saklamak gerekir.
- **m.6/1, nispi ret:** Önceki marka sahibi (ör. "Entegra") itiraz ederse işaret benzerliği + mal/hizmet benzerliği + karıştırılma ihtimali birlikte değerlendirilir.
  - "Entegra" ile "Entegrasyonik" arasındaki baş kısım ortaklığı işitsel benzerlik argümanı olabilir.
  - Karşı argüman: ortak kısım tanımlayıcı "entegr-" kökü. Tanımlayıcı ortak öğeler benzerlik değerlendirmesinde genelde zayıf ağırlık taşır (model bilgisi). Asıl soruyu avukata sorun (g).
- **m.6/3:** Ticarette önceden kullanılan tescilsiz bir işaretin sahibi itiraz edebilir (arama özeti: aynı kaynak; https://acikbilim.yok.gov.tr/handle/20.500.12812/139407). Bu iki yönlü çalışır. Biz de tescilsiz kullanımımıza dayanabiliriz, eski kullanıcılar da bize karşı dayanabilir.

## (e) Hukuki çerçeve özeti (Türkiye)

**FSEK (5846), logo telif koruması:**
- m.1/B eseri "sahibinin hususiyetini taşıyan … fikir ve sanat ürünü" diye tanımlar (arama özeti: https://www.hukukihaber.net/yargitay-11-hukuk-dairesinin-20042772-e-200412672-k-sayili-karari).
- Logolar m.4 kapsamında güzel sanat eseri (grafik) sayılabilir (model bilgisi).
- Koruma tescile bağlı değildir. Ama **hususiyet** eşiği vardır. Çok basit geometrik ya da harf temelli işaretler bu eşiği genellikle geçemez (arama özeti; somut Yargıtay kararı **DOĞRULANAMADI**). Bizim işaret "kare + E + 3 daire" sadeliğinde olduğundan FSEK koruması **belirsiz**.

**Yapay zekâ ile üretilmiş tasarım:**
- Türk doktrininde eser sahibi yalnız gerçek kişidir. Yapay zekâ eser sahibi olamaz. İnsanın belirleyici yaratıcı katkısı varsa o kişi eser sahibi olabilir (arama özeti: https://caa.cankaya.edu.tr/items/fb179196-bb15-4176-8e78-e54d797e97e6, https://hukukcularevi.com/danismanlik/yapay-zeka-ve-telif-hakki/).
- Karşılaştırma için ABD:
  - *Thaler v. Perlmutter* (D.C. Cir., 18.03.2025) insan yazarlığını şart saydı (https://www.skadden.com/insights/publications/2025/03/appellate-court-affirms-human-authorship, arama özeti).
  - US Copyright Office, Part 2 raporu (29.01.2025): salt prompt yetmez. Korunan, insanın belirlediği ifade unsurlarıdır (https://copyright.gov/newsnet/2025/1060.html, arama özeti).
  - AB'deki "yazarın kendi entelektüel yaratımı" ölçütü (Infopaq) bu oturumda kaynakla doğrulanmadı.
- **Sonuç:** Logo yalnız ajan üretimiyse **telif korumasına güvenilmemeli**. Asıl koruma yolu **marka tescili (SMK)**. Telif yalnız ek bir dayanak olur.

**SMK, şekil markası:**
- Marka tescili, eser niteliği aramaz. Ayırt edicilik arar (m.5/1-b).
- "Yuvarlak kare içinde tek harf" tek başına zayıf sayılabilir. "E + iki düğüm + teal merkez" kompozisyonu ve kelime işaretiyle birlikte kullanım, ayırt ediciliği artırır (değerlendirme, emsal **DOĞRULANAMADI**).
- **Tescilsiz kullanımın korunması:** SMK m.6/3 itiraz hakkı ve TTK m.54-55 haksız rekabet (iltibas) yolu vardır (model bilgisi, madde metni **DOĞRULANAMADI**). Ancak ispat yükü ağırdır: önceki kullanım ve tanınmışlık ispatlanmalıdır. Tescil, hakkı başvuru tarihinden itibaren belgeli ve ülke çapında kılar. Ayrıca SMK m.7 (marka hakkının kapsamı) ve m.29 (tecavüz) yolunu açar (model bilgisi).

**Başkasının logosuna benzerlik (ihlal ölçütü):**
- Yargıtay "çifte benzerlik" arar: işaret benzerliği + mal/hizmet benzerliği.
- Değerlendirme **ortalama tüketicinin genel izlenimine** göre yapılır. Görsel, işitsel ve kavramsal benzerlik ile ürünün fiyatı ve satın alma dikkati birlikte tartılır (arama özeti: https://www.erdem-erdem.av.tr/bilgi-bankasi/markalarin-karistirilma-tehlikesi-ve-iltibas).
- Örnek kararlar: HGK E.2017/73 K.2017/1048 (https://www.lexpera.com.tr/ictihat/yargitay/hukuk-genel-kurulu-e-2017-73-k-2017-1048-t-31-5-2017). İçerik açılmadı.
- **Bizim için:** Aynı sınıflarda (9/35/42), aynı sektörde (TR pazaryeri entegratörleri) benzer bir "E" işareti çıkarsa risk anlamlı olur. Farklı sınıftaki benzerlik (ör. karavan) düşük risktir. Tanınmış markalar istisnadır (m.6/5, model bilgisi).

## (f) Öneriler

### f.1 Tescil başvurusu (TÜRKPATENT)
- **Sınıflar:**
  - **9:** indirilebilir yazılım, masaüstü/mobil uygulama.
  - **35:** çevrim içi pazaryeri/e-ticaret yönetimi için iş yönetimi hizmetleri, reklam.
  - **42:** SaaS, bulut yazılım, yazılım geliştirme.
  - Mal/hizmet listesini bugünkü ürüne ve 2–3 yıllık plana göre bir vekil netleştirsin (değerlendirme).
- **Kelime ve şekil ayrı mı, birlikte mi?** Önerilen sıra:
  1. **Birleşik başvuru (şekil + "Entegrasyonik" kelime işareti)** önce. En yüksek tescil şansı budur, çünkü ayırt ediciliği şekil taşır.
  2. Bütçe varsa ek olarak **yalnız kelime ("Entegrasyonik")** başvurusu. Tanımlayıcılık itirazı riski var ama kabul edilirse en geniş koruma budur.
  3. İşaret kesinleştikten sonra **yalnız şekil** başvurusu. Bu, isteğe bağlı.
  - Not: Nihai logo "Açık Soru" statüsünde (ADR-0014/0015). **Logo kesinleşmeden şekil başvurusu yapmayın.** Kelime başvurusu bekletilmeden yapılabilir.
- **Tahmini harç (2026), DOĞRULANMADI:**
  - 1. sınıf ≈ 2.820 TL, 2. sınıf ≈ 2.820 TL, 3. ve sonraki her sınıf ≈ 3.150 TL, tescil ücreti ≈ 7.010 TL. KDV ve Harçlar Kanunu harçları hariç.
  - Kaynak: "TÜRKPATENT 2026 Yılında Uygulanacak Ücret Tarifesine İlişkin Tebliğ", RG 31.12.2025 (arama özeti: https://www.alomaliye.com/2025/12/31/turk-patent-ve-marka-kurumunca-2026-yilinda-uygulanacak-ucret-tarifesi/). Hangi tutarın hangi kaleme ait olduğu özette net değil.
  - Kaba toplam: tek başvuru, 3 sınıf ≈ 15–16 bin TL + vekil ücreti. **Kesin tutarı turkpatent.gov.tr'deki ücret sayfasından teyit edin.**

### f.2 İnsanın yapması gereken kontroller
1. **Görselleri hazırlayın** (512 px PNG):
   - (a) beyaz zeminde karolu işaret,
   - (b) lacivert zeminde ters işaret,
   - (c) karosuz, yalnız E çizgisi + düğümler,
   - (d) işaret + "Entegrasyonik" tam logo.

   Kaynak: sitenin derlediği `/favicon.svg` veya `apple-touch` PNG. Ya da `logo-mark.svg` dosyasını tarayıcıda açıp ekran görüntüsü alın.
2. **Tersine görsel arama:** Google Lens (images.google.com → kamera), TinEye (tineye.com), Bing Visual Search. Her birine (a) ve (c) görsellerini yükleyin. İlk 50 sonuçta yuvarlak kare içinde E/düğüm içeren yazılım logolarını not edin.
3. **WIPO Global Brand Database** (branddb.wipo.int):
   - "Image" sekmesine (c) görselini yükleyin.
   - Ofis olarak TR + WO (Madrid) + EM seçin, Nice 9/35/42 ile filtreleyin.
   - Ardından Vienna kodlarıyla arayın. Aday kodlar (arama özeti, Vienna 8 baskısından teyit edin, https://www.wipo.int/classification-vienna/):
     - 27.05 (harfler; tek harf/monogram alt kodları),
     - 26.04 (dörtgenler; içinde harf 26.04.18, içinde daire 26.04.10 adayları),
     - 26.01 (daireler).
4. **TÜRKPATENT** (online.turkpatent.gov.tr, e-Devlet ile giriş, arayüz adları değişebilir):
   1. "Marka Araştırma" bölümüne girin. "Entegrasyonik" yazıp birebir arama yapın.
   2. Benzer arama yapın: `Entegra`, `Entegre`, `Entegrasyon`, `Entegroni`, `Entegrasyonum`, `Entekas`, `Entegro`.
   3. Sınıf filtresine 9, 35, 42 girin. Durum olarak tescilli, başvuru ve yayında olanlara bakın.
   4. Şekil araştırması için yukarıdaki Vienna kodlarını kullanın.
   5. Her bulgu için sahibi, sınıfı, mal/hizmet listesini ve tarihi bir tabloya yazın.
5. **EUIPO TMview** (tmdn.org/tmview): aynı terimlerle TR ve EM ofislerinde arayın.
6. **Alan adı ve hesaplar:**
   - `entegrasyonik.com` ve `.com.tr` için WHOIS'e bakın. Kimin adına kayıtlı?
   - `instagram.com/entegrasyonik`, `linkedin.com/company/entegrasyonik`, `x.com/entegrasyonik` adlarını kontrol edin ve boşsa rezerve edin.
7. **Rakip logolarını gözle karşılaştırın:** Entegra ve Entegroni'nin sitesindeki logoyu açın. Şekil ya da teal/lacivert "E" benzerliği var mı, bakın.
8. **Köken kaydı:** (b) bölümündeki yerel git geçmişini ve S15 brifini/oturumunu dışa aktarıp saklayın.

### f.3 Logo değişikliği gerekirse
- Şu an değişiklik önermiyoruz. Ancak:
  - f.2'deki aramalar 9/35/42 sınıflarında yuvarlak kare içinde benzer bir E işareti bulursa,
  - ya da avukat "basit, zayıf" derse,

  işareti **bir insan tasarımcının** yeniden çizmesi ve ayırt ediciliğin artırılması önerilir. Bu iki sorunu birden çözer: insan eser sahipliği (FSEK) ve ayırt edicilik (SMK).
- Ayırt ediciliği artırma seçenekleri:
  - karodan çıkmak ya da özgün bir kontur kullanmak,
  - düğüm sayısını veya yerleşimini karakteristik yapmak,
  - kelime işaretinde özel harf biçimi kullanmak (Inter yerine özelleştirilmiş harfler).
- Değişiklik, drift testi gereği `logo-mark.svg`, `Logo.astro`, `EkBrandLogo.vue`, `favicon.svg` ve `brand-images.ts` dosyalarında birlikte yapılır (ADR-0015 Açık Soru 1). Kararı `USER_DECISIONS.md`'ye yazın.

## (g) Marka avukatına sorulacak sorular
1. "Entegrasyonik" 9/35/42'de SMK m.5/1-(c) tanımlayıcılık itirazıyla karşılaşır mı? "-ik" eki ve uydurma kelime oluşu yeterli mi?
2. Kelime ve şekil için ayrı başvuru mu, birleşik başvuru mu? Bütçe kısıtında hangisi önce?
3. "Entegra" (Entegra Bilişim) ve "Entegroni" gibi önceki markalar karşısında itiraz/ret riski nedir? Ortak "entegr-" kökü tanımlayıcı sayılıp değerlendirme dışında kalır mı?
4. Mal/hizmet listesini nasıl yazmalıyız? 35. sınıf yerine/yanında 42 yeterli mi? Otopilot (yapay zekâ ajanı) hizmetleri için ek sınıf ya da madde gerekir mi?
5. Logo bir yapay zekâ ajanının kod olarak ürettiği SVG ise FSEK koruması var mı? Hangi insan katkısı belgesi işe yarar? Şirket adına hak zinciri için ne yapmalıyız?
6. Tescil gelene kadar tescilsiz kullanımımızı (m.6/3, TTK haksız rekabet) korumak için hangi kanıtları biriktirelim?
7. Logo kesinleşmeden önce kelime başvurusu yapmak, sonra şekli ayrıca başvurmak doğru mu? Başvurudan sonra logoda küçük değişiklik başvuruyu etkiler mi?
8. Yurt dışı (Madrid/EUIPO) başvurusu gerekli mi, ne zaman?
9. Alan adı veya sosyal hesap adı başkasına aitse (ör. `entegrasyonik.com`) ne yapabiliriz?

---
*Kaynak erişim tarihi tümü için 2026-10-01. Yerel kanıtlar: depo commit'leri `5586efd`, `e2bb7a2`, `d9160ff`. İkon paket sürümleri c.1'de.*
