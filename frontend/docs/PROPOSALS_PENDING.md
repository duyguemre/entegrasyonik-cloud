# Onay bekleyen öneriler (fe-polish, 2026-10-01)

Kaynak: `cloud/fe-polish` denetimi (r2a+r2b+r2c+r2d+dark birleşik dal; tüm ekranlar light + dark, 1440 + 390).
Özerklik: SINIRLI (kullanıcı, 2026-10-01: "bariz düzenlemeleri yap ama site kadar özgür davranma; uç durumlarda onaylı
gideriz"). Bu dosyadaki maddelerin HİÇBİRİ uygulanmadı — akış/davranış, bilgi mimarisi, alan, varsayılan, veri gösterim
mantığı veya terim kararı içeriyor. Uygulanan bariz düzeltmeler: `docs/fe-polish-review/README.md`.

> **Durum (2026-10-01, fe-r3d):** P01–P16 K49 ile ONAYLANDI ve uygulandı — her maddenin altında "KARAR: uygulandı"
> satırı (commit + varsa sapma). Kalan backend işleri: aşağıdaki "Backend'e iletilecekler (r3d)" bölümü.

Görüntüler `docs/fe-polish-review/once/` altında (`<ekran>-<light|dark>-<1440|390>.png`, uygulama öncesi birleşik hal).
Her madde: **Ekran · Sorun · Öneri · Alternatif · Etki · Risk**. Onay için madde numarasını yazmanız yeterli
(ör. "P03 öneri, P07 alternatif, P10 hayır").

| No | Konu | Önerilen yön | Büyüklük |
|---|---|---|---|
| P01 | Para birimi biçimi iki farklı | `₺1.048,80` tek biçim | Küçük, çok dosya |
| P02 | Filtrelerde "Tümü" varsayılanı tutarsız | Boş alan = tümü | Küçük |
| P03 | Sekmeli ekranlarda arama + yenile gövdede | Başlık çubuğuna taşı | Orta |
| P04 | 1440px'te liste tablosu yatay kayıyor | Kolon önceliği | Orta |
| P05 | Sekme adı ≠ sayfa başlığı ≠ menü adı | Tek ad kaydı | Orta (IA) |
| P06 | Destek: "Destek Kayıtları / Destek Talepleri / Bilet" | "Destek talepleri" + "Yeni talep" | Küçük (IA) |
| P07 | "Şifre" ve "Parola" karışık | Tek terim: "Parola" | Küçük, çok dosya |
| P08 | Kurumsal planda 999 / 999.999 limitleri | "Sınırsız" göster | Küçük (veri gösterimi) |
| P09 | Denetim günlüğünde ham kod / bilinmeyen kullanıcı | Okunur karşılık | Küçük (veri gösterimi) |
| P10 | Mesajlar filtresinde Kanal sonda | Kanal ilk sırada | Küçük |
| P11 | Menüde Ayarlar/Çıktılar "Finans ve raporlar" altında | Grup düzeni | IA (backend menü verisi) |
| P12 | E-Fatura sağlayıcılarının kısa adı yok ("E-", "Gİ") | Kısa ad kaydına ekle | Küçük (K13 kayıt) |
| P13 | Giriş ekranında "Şifremi unuttum" iki kez | Tek giriş noktası | Küçük (akış) |
| P14 | Tur teklifi kartı birincil eylemleri örtüyor (e2e onarımı) | Açık çekmece/diyalog/menüde gizle, z-index düşür, yapışık alt çubuğa yer ayır | Küçük-orta |
| P15 | Açık filtre paneliyle liste alanı ~0 yüksekliğe iniyor (e2e onarımı) | Liste çerçevesine asgari yükseklik | Küçük |
| P16 | Menü 500'de üç ayrı "Bir şeyler ters gitti" bildirimi (e2e onarımı) | Aynı hatayı tek bildirimde topla | Küçük |

---

### P01 — Para birimi biçimi iki farklı
- **Ekran:** Finans (özet şeridi, NET HAKEDİŞ), Abonelik (plan fiyatları) ↔ Panel, Siparişler, İadeler, Ürünler.
- **Sorun:** Finans ve abonelikte `98.765,40 ₺` / `2.490 ₺ / ay` (sembol sonda); diğer tüm ekranlarda `₺1.048,80`
  (sembol başta, `Intl tr-TR`). Aynı uygulamada iki biçim. Görüntü: `once/finance-dark-1440.png`, `once/subscription-dark-1440.png`,
  `once/orders-dark-1440.png`.
- **Öneri:** Tek biçim `₺1.048,80` (ortak `formatMoney`, `@entegrasyonik/ui/format`); finans/abonelik yerel biçimleyicileri kalkar.
- **Alternatif:** Tüm uygulamada `1.048,80 ₺` (Türkçe yazımda sık; site fiyat sayfası ile karşılaştırılıp karar verilir).
- **Etki:** Finans özet şeridi, finans detay diyaloğu, abonelik kartları; görsel tabanlar yenilenir.
- **Risk:** Düşük. Yalnız gösterim; tutarlar değişmez. Site ile tutarlılık kontrol edilmeli (K14 "site ile tutarlı").
- **KARAR: uygulandı (K49, öneri) — tek biçim `₺1.048,80` (`formatMoney`; finans + abonelik). Commit `19705fa8`.**

### P02 — Filtrelerde "Tümü" varsayılanı tutarsız
- **Ekran:** Mesajlar ("Red durumu" = Tümü, etiket yukarıda), Bildirimler ("Okunma durumu" = Tümü çipi) ↔ diğer tüm filtreler boş.
- **Sorun:** Diğer filtrelerde "boş = filtre yok"; bu iki alan dolu başladığı için satır hizası ve görünümü farklı (etiket
  yüzer, biri çip). Görüntü: `once/messages-light-1440.png`, `once/notifications-dark-1440.png`.
- **Öneri:** "Tümü" seçeneği kaldırılır, alan boş başlar (boş = tümü; temizlenebilir). Filtre çipi özetinde görünmez.
- **Alternatif:** "Tümü" kalır ama diğer alanlar gibi düz metin (çip değil) ve tüm ekranlarda aynı.
- **Etki:** `MessageListView`, `NotificationCenterView` filtre varsayılanı ve istek parametresi (boş → gönderilmez).
- **Risk:** Düşük-orta: varsayılan değişikliği; backend'in "parametre yok = tümü" davrandığı doğrulanmalı (mock'larla).
- **KARAR: uygulandı (K49, öneri) — "Tümü" seçeneği kalktı, boş = tümü (Mesajlar, Bildirimler). Commit `30711b98`.**

### P03 — Sekmeli ekranlarda arama + yenile gövdede
- **Ekran:** Finans (İşlemler sekmesi), İşlem kayıtları (Ürün gönderim/çekim sekmeleri).
- **Sorun:** FR2_PATTERNS §5 "yenile yalnız `EkPageBar` en sağında". Sekmeli bu iki ekranda arama alanı + yenile düğmesi
  sekmenin içinde, gövdede (diğer listelerde başlık satırında). Görüntü: `once/finance-dark-1440.png`, `once/logs-dark-1440.png`.
- **Öneri:** Başlık çubuğunda tek yenile (etkin sekmeyi yeniler) + arama başlık satırında (etkin sekmeye bağlı placeholder).
- **Alternatif:** Sekmeli ekranlar için FR2_PATTERNS'a istisna yazılır ("sekme kendi araç satırını taşır"), görünüm aynı kalır.
- **Etki:** `FinancialListView`, `LogListView`, `EkListScreen` (dış başlığa yuva/olay); Alt+R kısayolu.
- **Risk:** Orta: sekme ↔ başlık iletişimi yeni bir sözleşme; liste spec'leri güncellenir.
- **KARAR: uygulandı (K49, öneri) — Finans ve İşlem kayıtlarında etkin sekmenin arama + ek eylemler + yenile'si başlık çubuğunda (`EkPageHeader tools-id` + `EkListScreen tools-target`, Teleport; `listTools.ts`). Araçsız sekme (Finans › Özet) başlıkta araç bırakmaz. Commit `9b31dabe`; e2e `financial.spec` "başlık araçları (P03)".**

### P04 — 1440px'te liste tablosu yatay kayıyor (son kolon yapışık eylem kolonunun altında)
- **Ekran:** Siparişler (Tarih), İadeler (Tarih), Müşteriler (İade oranı) — sol menü açıkken 1440 genişlikte.
- **Sorun:** Tablo içerik alanından 30–60px geniş; son veri kolonu sağa yapışık "İşlemler" kolonunun altında yarım
  görünüyor ("20.09.202…"). Bariz kısmı uygulandı (ürün adı 160px + ipucu), kalan taşma kolon sayısından. Görüntü:
  `once/orders-dark-1440.png`, `once/claims-light-1440.png`, `once/customers-dark-1440.png`.
- **Öneri:** Kolon önceliği: <1600px'te "İçerik" ve "Stok" tek kolonda birleşir (siparişler), müşterilerde "Telefon" ile
  "E-posta" tek "İletişim" kolonu. Tarih yalnız gün (saat ipucunda).
- **Alternatif:** Kullanıcının kolon gizleyebildiği "Kolonlar" menüsü (Görünümler ile birlikte saklanır).
- **Etki:** `OrderListView`, `ClaimListView`, `CustomerListView` kolon tanımları; görsel tabanlar.
- **Risk:** Orta: veri gösterim düzeni değişir; kaydedilmiş görünümlerle etkileşim kontrol edilmeli.
- **KARAR: uygulandı (K49, öneri — kısmen) — tarih kolonu yalnız gün, saat ipucunda (`<time title>`; Siparişler, İadeler); Müşterilerde Telefon + E-posta tek "İletişim" kolonu. Ölçüm 1440×900: taşma Siparişler +29px, İadeler +41px, Müşteriler +62px → 0. "İçerik + Stok" birleştirmesi GEREKMEDİ (tarih kısalınca sığdı; uygulanmadı). Commit `9fe84410`.**

### P05 — Sekme adı ≠ sayfa başlığı ≠ menü adı
- **Ekran:** Birden çok: "Sipariş Yönetimi" (menü/sekme) ↔ "Siparişler" (başlık); "İade Yönetimi" ↔ "İade talepleri";
  "Abonelik İşlemleri" ↔ "Abonelik ve Planlar"; "Finansal İşlemler" ↔ "Finans"; "İşlemler" ↔ "İşlem kayıtları";
  "Ayarlar" ↔ "Mağaza Ayarları". Görüntü: `once/orders-dark-1440.png`, `once/subscription-dark-1440.png`, `once/menu-setting-dark-1440.png`.
- **Sorun:** Kullanıcı menüden tıkladığı adı başlıkta göremiyor; sekme şeridi ve breadcrumb farklı dil konuşuyor.
- **Öneri:** Tek ad kaydı (ekran başına kısa ad = menü/sekme, uzun ad = başlık; ikisi de aynı kök kelime): Siparişler,
  İadeler, Müşteriler, Faturalar, Mesajlar, Finans, Abonelik, İşlem kayıtları, Mağaza ayarları.
- **Alternatif:** Yalnız sekme adı = başlık (menü backend verisinden gelir, dokunulmaz).
- **Etki:** `tr.json` `menu.*`, ekran başlıkları, yardım içeriği ve e2e seçicileri (ada göre seçenler).
- **Risk:** Orta: menü başlıkları kısmen backend menü kaydından (`MenuService`) gelir; i18n anahtarı ile çözülenler değişir.
- **KARAR: uygulandı (K49, öneri) — tek ad kaydı: menü/sekme kısa adı = başlık kökü (Siparişler, İadeler, Abonelik, Finans, İşlem kayıtları, Mağaza ayarları…). Commit `db65f7d1`.**

### P06 — Destek adlandırması üç farklı
- **Ekran:** Destek. Menü grubu "Destek Kayıtları" › yaprak "Destek Kayıtları", başlık "Destek Talepleri", düğme
  "Yeni Bilet Aç". Görüntü: `once/menu-ticket-light-1440.png`.
- **Öneri:** "Destek talepleri" (grup tek yapraklıysa grup kalkar, yaprak üst seviyeye), düğme "Yeni talep".
- **Alternatif:** Yalnız düğme metni "Yeni talep", menü olduğu gibi.
- **Etki:** `TicketListView`, `menu.support_ticket_list`, yardım makaleleri ("Yeni Bilet Aç" geçen yerler), spec'ler.
- **Risk:** Düşük (metin + menü kaydı).
- **KARAR: uygulandı (K49, öneri) — "Destek talepleri" + "Yeni talep"; tek yapraklı destek grubu düzleşir. Commit `db65f7d1`.**

### P07 — "Şifre" ve "Parola" karışık
- **Ekran:** Giriş/kayıt ("Şifre", "Şifremi unuttum", "Şifrenizi mi unuttunuz?") ↔ Hesabım ve güvenlik ("Mevcut parola",
  "Parolayı değiştir"). Görüntü: `once/giris-dark-1440.png`, `once/account-security-light-1440.png`.
- **Öneri:** Tek terim "Parola" (güvenlik metinlerinde yerleşik terim; hesap ekranları zaten böyle).
- **Alternatif:** Tek terim "Şifre" (kullanıcı dilinde daha yaygın; giriş ekranları zaten böyle).
- **Etki:** `tr.json` giriş/kayıt/sıfırlama anahtarları, e-posta şablonu metinleri (backend — ayrı iş), yardım içeriği, spec'ler.
- **Risk:** Düşük; e-posta şablonları backend'de olduğundan iki taraf birlikte değişmeli.
- **KARAR: uygulandı (K49, öneri) — tek terim "Parola" (giriş/kayıt/sıfırlama/kullanıcı formları, yardım). E-posta şablonları backend'de (ayrı iş, aşağıda). Commit `e453c483`.**

### P08 — Kurumsal planda 999 / 999.999 limitleri sayı olarak görünüyor
- **Ekran:** Abonelik ve Planlar, "Kurumsal" kartı: "999 Kanal", "999.999 Varyant", "999 Kullanıcı". Görüntü: `once/subscription-dark-1440.png`.
- **Sorun:** Sınırsız anlamındaki tavan değeri ham sayı olarak gösteriliyor.
- **Öneri:** Tavan değer (≥ 999 / 999.999) "Sınırsız" olarak yazılır; plan verisi değişmez.
- **Alternatif:** Plan kaydına açık `unlimited` bayrağı (backend sözleşmesi — ayrı iş).
- **Etki:** `SubscriptionView` plan özellik satırları.
- **Risk:** Düşük; yalnız gösterim. Tavan eşiğinin backend plan kaydıyla teyidi gerekir (uydurma eşik olmasın).
- **KARAR: uygulandı (K49, öneri) — tavan değerler (999 kanal/kullanıcı, 999.999 varyant/çağrı) "Sınırsız". Plan kaydında açık `unlimited` bayrağı backend isteği olarak kalır. Commit `19705fa8`.**

### P09 — Denetim günlüğünde ham kod ve "Bilinmeyen kullanıcı"
- **Ekran:** Denetim günlüğü. "Neden: wrong_current", "Bilinmeyen kullanıcı …-owner". Görüntü: `once/settings-audit-log-dark-1440.png`.
- **Öneri:** Neden kodları için okunur karşılık tablosu ("Mevcut parola hatalı"); kullanıcı çözülemezse "Silinmiş kullanıcı"
  ya da e-postanın maskeli hâli.
- **Alternatif:** Ham kodu ikincil (monospace) satırda bırakıp üstte okunur metin.
- **Etki:** `AuditLogView` ayrıntı sütunu; karşılık tablosu backend hata kataloğundan gelmeli (premium-ui-standards: FE metin uydurmaz).
- **Risk:** Düşük-orta: karşılıklar backend kaynağından alınmalı.
- **KARAR: uygulandı (K49, öneri + alternatif birlikte) — neden kodları okunur karşılıkla (`REASON_LABELS`: backend AuditLogger çağrılarındaki 9 kodun tamamı, tarama 2026-10-01); ham kod yalnız ayrıntı panelinde ikincil satırda; kayıtta olmayan kod ham kalır. Çözülemeyen kullanıcı: kullanıcı dizini eksiksizse "Silinmiş kullanıcı", değilse "Bilinmeyen kullanıcı"; listede ham kimlik yok (maskeli e-posta denetim DTO'sunda olmadığı için kullanılamadı). Backend'de hata kataloğu gelince `REASON_LABELS` oradan beslenmeli. Commit `40facc8b`.**

### P10 — Mesajlar filtresinde "Kanal" sonda
- **Ekran:** Mesajlar filtre paneli: Mesaj durumu · Mesaj tipi · Red durumu · **Kanal**. Diğer listelerde Kanal ilk alan.
  Görüntü: `once/messages-light-1440.png`.
- **Öneri:** Kanal ilk sıraya. **Alternatif:** Tüm listelerde filtre sırası standardı FR2_PATTERNS'a yazılır (Kanal → Durum → Tür → Tarih).
- **Etki/Risk:** `MessageListView` filtre sırası; düşük.
- **KARAR: uygulandı (K49, öneri) — Mesajlar filtresinde Kanal ilk sırada. Commit `30711b98`.**

### P11 — Menü grubu düzeni
- **Ekran:** Menü (destek/yönetim menüsü olan hesaplar): "Finans ve raporlar" altında Finansal İşlemler + Çıktılar + **Ayarlar**;
  "Yetkilendirme" ayrı tek öğeli grup. Görüntü: `once/menu-setting-dark-1440.png`.
- **Not:** Bu düzen backend menü kaydından (`MenuService`) geliyor; grup başlıklarının çevirisi ("MANAGEMENT", "SUPPORTS"
  İngilizce görünüyordu) bariz olarak düzeltildi → "Kullanıcı Yönetimi", "Destek".
- **Öneri:** Ayarlar + Yetkilendirme + Çıktılar "Ayarlar" grubunda; Finans grubu yalnız finans.
- **Alternatif:** FE'de bölüm eşlemesi (`SECTIONS`) ile menü verisinden bağımsız gruplama.
- **Risk:** Orta (IA + backend menü verisi; yerel oturum işi).
- **KARAR: uygulandı (K49, alternatif — FE bölüm eşlemesi) — Mağaza ayarları + Çıktılar + Yetkilendirme "Ayarlar" bölümünde (`menuShape.regroupMenu`); kalıcı grup düzeni backend menü verisinde ayrıca yapılmalı. Commit `db65f7d1`.**

### P12 — E-Fatura sağlayıcılarının kısa adı yok
- **Ekran:** E-Fatura sağlayıcı şeridi: "TE" (iki ayrı sağlayıcı aynı kısa ad), "E-" (e-Logo), "Gİ" (GİB). Görüntü: `once/integrations-einvoice-dark-1440.png`.
- **Öneri:** K13 kısa/uzun ad kaydına e-fatura sağlayıcıları eklenir (ör. TEF, TCL, ELG, GİB); renkleri yalnız orijinal
  marka hex'i doğrulanınca (K13: tahmini renk yok), o zamana kadar nötr.
- **Etki/Risk:** `CHANNEL_SHORT` kaydı; düşük. Marka adları/kısaltmaları ürün sahibince onaylanmalı.
- **KARAR: uygulandı (K49, öneri) — e-fatura kısa/uzun ad kaydı (TEF, TCL, ELG, GİB); renk doğrulanana kadar nötr. Kısaltmalar ürün sahibince teyit edilmeli. Commit `3edac58e`.**

### P13 — Giriş ekranında "Şifremi unuttum" iki kez
- **Ekran:** Giriş: üst sekme "Şifremi unuttum" + alan altı "Şifrenizi mi unuttunuz?" bağlantısı. Görüntü: `once/giris-light-390.png`.
- **Öneri:** Üç sekme → iki sekme (Giriş · Kayıt); sıfırlama yalnız alan altındaki bağlantıdan.
- **Alternatif:** Sekme kalır, bağlantı kalkar.
- **Etki/Risk:** `AuthShell`/giriş akışı; login spec'leri. Düşük-orta (akış değişikliği).
- **KARAR: uygulandı (K49, öneri) — giriş iki sekme (Giriş · Kayıt); sıfırlama yalnız alan altındaki bağlantıdan. Commit `e453c483`.**

---

## e2e onarımı (cloud/e2e-repair, 2026-10-01) — testlerin bulduğu, onay gerektiren maddeler
Bu maddeler için test GEVŞETİLMEDİ; testler yalnız ilgili ekranda kartı bastırarak (`e2e/fixtures/appDialog.ts`
`suppressTourOffer`) veya paneli kapatarak asıl davranışı doğrular.

### P14 — Tur teklifi kartı birincil eylemleri örtüyor
- **Ekran:** Kabuk geneli, ilk ziyaretteki "Uygulamayı tanıyın" kartı (`HelpTour`, `.ek-tour-offer`; sağ alt sabit, mobilde tam genişlik, z-toast).
- **Sorun:** Kart açık menü/seçim listelerinin ve şunların üstünde kalıp tıklamayı engelliyor: Mağaza Ayarları'nın yapışık "Ayarları Kaydet" çubuğu,
  bildirim çekmecesindeki "Tümünü gör", mobil gezinme çekmecesinin alt öğeleri (Destek Kayıtları), mobilde ürün listesi toplu işlem
  menüsünün alt öğeleri, varyant satır eylemleri, sayfalama ve onay kutuları. `--ek-tour-offer-space` dolgusu yapışık çubuk ve çekmecede işe yaramıyor.
- **Öneri:** Gezinme çekmecesi, diyalog veya menü açıkken kartı gizle; z-index'i çekmece/menü katmanının altına indir; yapışık alt çubuklu ekranlarda kartı çubuğun üstüne konumla.
- **Alternatif:** Kartı sağ alttan üst bar altındaki ince bir bilgi şeridine taşı.
- **Etki:** `HelpTour` + kabuk katman tokenları; tur teklifi spec'leri ve görsel tabanlar.
- **Risk:** Düşük (yalnız konum/katman). Kullanıcının ilk ziyaret deneyimini değiştirdiği için onaylı.
- **KARAR: uygulandı (K49, öneri) — tur kartı açık çekmece/diyalog/menüde gizlenir, katmanı çekmecenin altında, yapışık alt çubuklu ekranda çubuğun üstüne kalkar. Commit `3377f130`.**

### P15 — Açık filtre paneliyle liste alanı ~0 yüksekliğe iniyor
- **Ekran:** Denetim günlüğü (uyarı bandıyla), Bildirim merkezi — 1280×800'de filtre paneli açıkken (masaüstü varsayılanı).
- **Sorun:** `EkListFrame` tablo alanı ~0–100px'e iniyor; satırlar sayfalamanın altında kalıyor, tıklanamıyor. (Bildirim merkezinin hata
  kartı için bariz kısmı düzeltildi: kart kaydırılabilir oldu — commit `5759633c`.)
- **Öneri:** `.ek-list-frame__scroll` için asgari yükseklik (ör. 240px); sığmazsa sayfa kayar.
- **Alternatif:** Dar yükseklikte filtre paneli varsayılan kapalı açılır.
- **Etki:** Ortak `EkListFrame` (tüm liste ekranları); görsel tabanlar.
- **Risk:** Düşük-orta (ortak bileşen düzeni).
- **KARAR: uygulandı (K49, öneri) — liste kartı asgari 340px; sığmazsa ekran kendi içinde kayar (`EkListScreen`; EkListFrame'i doğrudan kullanan Denetim günlüğü ve Finans kökleri de). Commit `3377f130`, `5a0e13b1`.**

### P16 — Menü 500'de üç ayrı "Bir şeyler ters gitti" bildirimi
- **Ekran:** Kabuk açılışı, `MenuService` 500 döndüğünde.
- **Sorun:** Aynı kök hata için üç ayrı "Bir şeyler ters gitti. Destek kodu: c-…" bildirimi yığılıyor (eski davranış sessizdi).
  Ayrıca rastgele destek kodu "500"/"401" gibi rakam dizileri içerebildiği için tüm sayfada `not.toContainText('500')` arayan testler nadiren kırılabilir (shell spec'inde kelime sınırıyla düzeltildi).
- **Öneri:** Aynı istekten doğan hataları kısa pencerede tek bildirimde topla (tek destek kodu).
- **Alternatif:** Menü hatasında bildirim yerine kenar menüde satır içi hata durumu + Tekrar dene.
- **Etki:** `reportUnexpectedError` / bildirim kuyruğu.
- **Risk:** Düşük.
- **KARAR: uygulandı (K49, öneri) — aynı kökten 4 sn içindeki beklenmeyen hatalar tek bildirim + tek Destek kodu (teknik log her biri için; çağıranın kendi iletisi toplanmaz). Commit `d05584a7`.**

## MCP önyüzü (cloud/mcp-fe) önerileri


Akış / davranış / bilgi mimarisi değiştiren veya uç durum içeren öneriler. Kullanıcı onayı gelene kadar uygulanmaz;
karar verilince `docs/adr/USER_DECISIONS.md`'ye satır eklenir ve buradaki madde "KARAR: …" ile kapatılır.

| # | Tarih | Kaynak | Öneri | Neden onay gerekiyor | Durum |
|---|---|---|---|---|---|
| P-MCP-1 | 2026-10-01 | cloud/mcp-fe (MCP-6) | **Ekran adları.** Bulut brifi S3/S4 için "Bağlı uygulamalar / **Otopilot bağlantıları** (ad ürün sabitinden)" diyor; `MCP_UI_CONTRACT.md` §1 ise S3 = "Bağlı uygulamalar", S4 = "**Yapay zekâ bağlantısı**". Uygulanan: sözleşme adları (kanonik). Öneri: adları sözleşmedeki gibi bırakmak — MCP bağlantısı kullanıcının **kendi** yapay zekâ uygulamasıdır (K37b), Otopilot ise uygulama içi ajandır (K39); "Otopilot bağlantıları" iki ürünü karıştırır. Otopilot adı istenirse tek değişiklik `src/components/mcp/mcpMessages.ts` (`menu.*`, `mcp.connections.title`, `mcp.settings.title`) + `CHAT_PRODUCT` sabiti (yalnız `cloud/chat-fe` dalında; ana dalda yok). | Bilgi mimarisi / ürün adlandırması; brif ile sözleşme çelişiyor (CLAUDE.md kural 8 — raporlandı) | KARAR: öneri uygulandı (K49) — sözleşme adları korunur ("Bağlı uygulamalar" / "Yapay zekâ bağlantısı"); değişiklik gerekmedi |
| P-MCP-2 | 2026-10-01 | cloud/mcp-fe (MCP-6) | **Ortak onay kartı.** `@entegrasyonik/chat` (`PartConfirm`) bu dalın tabanında yok (`cloud/chat-fe` birleşmedi). İşlem onayı önizlemesi (`src/components/mcp/McpActionPreview.vue`) sözleşmeye göre, sohbet onay kartıyla aynı görsel ritimde (ikon karosu + başlık + işlem çipi, pazaryeri notu, etkilenen kayıtlar) yazıldı. Öneri: sohbet paketi ana dala girince önizleme gövdesi pakete taşınsın; sohbet kartı ve S2 aynı bileşeni kullansın. | Paketler arası bileşen taşıma (iki bulut işini etkiler) | KARAR: uygulandı (K49) — gövde ortak bileşen `@entegrasyonik/chat/confirm` (`ConfirmBody`), sohbet `PartConfirm` ve `McpActionPreview` kullanır; başlık/eylemler yüzeyde kalır (odak sözleşmeleri farklı). Commit `1e8f4c97` |

## FR3 kabuk / tablo (cloud/fe-r3a) önerileri

FR3 madde 10 (tarih aralığı filtresi) değerlendirmesi: backend'i `startDate/endDate` kabul eden 7 liste ortak
`EkDateRange`'e geçti (Siparişler, İadeler, Faturalar — üçü yeni; Mesajlar, Finans (4 sekme), Gönderim kayıtları, Destek
talepleri — iki alandan tek bileşene). Aşağıdakiler backend parametresi istediği veya davranış değiştirdiği için onay bekler
(istemci tarafı süzme, sayfalı/imleçli listelerde yalnız yüklü sayfayı süzeceği için yanıltıcı olur — uygulanmadı).

| # | Tarih | Kaynak | Öneri | Neden onay gerekiyor | Durum |
|---|---|---|---|---|---|
| P-R3A-1 | 2026-10-01 | cloud/fe-r3a | **Ürün çekim kayıtları tarih aralığı.** Tabloda Başlangıç/Bitiş sütunu var, filtre yalnız iş kimliğiyle. `IntegrationService/getImportJobs`'a `startDate/endDate` (→ `startedAt`, gönderim kayıtlarındaki gibi) eklenip `ImportLogList` filtresine `EkDateRange`. | Backend parametresi (yeni sorgu alanı + indeks kontrolü) | BEKLİYOR |
| P-R3A-2 | 2026-10-01 | cloud/fe-r3a | **Bildirim merkezi tarih aralığı.** Zaman sütunu var; liste imleçli (`cursor`) — `NotificationService/get`'e `from/to` (→ `createdAt`). Alternatif: yalnız "Son 7 gün / 30 gün" hazır seçimi. | Backend parametresi + imleçli sayfalama ile etkileşim | BEKLİYOR |
| P-R3A-3 | 2026-10-01 | cloud/fe-r3a | **Yönetim → destek talepleri tarih aralığı.** Son mesaj sütunu var; `AdminService/getTickets` tarih almıyor. `startDate/endDate` (→ `lastMessageAt`) + `EkDateRange`. | Backend parametresi (yönetim yüzeyi) | BEKLİYOR |
| P-R3A-4 | 2026-10-01 | cloud/fe-r3a | **Denetim günlüğü tarih alanları.** Kendi metin alanları (`from/to`, GG.AA.YYYY) + hazır düğmeler kullanıyor; varsayılan son 30 gün, en çok 366 gün. Öneri: `EkDateRange` (takvim + aynı hazır aralıklar) + 366 gün sınırı bileşen dışında doğrulama. | Varsayılan aralık ve doğrulama davranışı değişir | BEKLİYOR |
| P-R3A-5 | 2026-10-01 | cloud/fe-r3a | **Tek alt öğeli menü grubu.** "Ürün Kataloğu" grubu (Satış bölümünde) tek alt öğe taşıyınca açılır grup gereksiz bir tık ekliyor; ayrıca ayrı "Katalog" bölümü var. Öneri: tek alt öğeli grup düz öğe gösterilsin (ad = alt öğe, ikon = grup) ve katalog öğeleri tek bölümde toplansın (P11 grup düzeniyle birlikte). | Bilgi mimarisi (menü verisi backend'de; e2e menü gezinmesi etkilenir) | BEKLİYOR |

## FR3 ekranlar (cloud/fe-r3b) önerileri

| # | Tarih | Kaynak | Öneri | Neden onay gerekiyor | Durum |
|---|---|---|---|---|---|
| P-R3B-1 | 2026-10-01 | cloud/fe-r3b | **Kullanılmayan mağaza ayarları.** Hata bildirim e-postası, çalışma günleri, zaman dilimi, destek telefonu, kargo süresi ve maks. satış adedi backend'de yalnız saklanıyor (tarama 2026-10-01). Açıklamalar dürüstleştirildi (olmayan otomasyon vaat edilmiyor). Öneri: ya davranış backend'de yazılsın (ör. hata e-postası bildirimi, iş günü kaydırması) ya da kullanılmayan alanlar "Yakında" demeden gizlensin. | Ürün kararı + backend işi | BEKLİYOR |
| P-R3B-2 | 2026-10-01 | cloud/fe-r3b | **Ana sayfa KPI'larında tekrar.** "Kargo bekleyen" KPI kartı artık "Bugün sırada" listesindeki kargo işiyle aynı sayıyı tekrar ediyor. Öneri: KPI satırında yerine "Bekleyen iade tutarı" ya da "Son 7 gün iade oranı" (insights `totals.returnAmount/returnCount` mevcut). Alternatif: olduğu gibi kalsın. | Ana sayfa bilgi düzeni | BEKLİYOR |

## Çıktılar / şablon tasarımcısı (cloud/fe-r3c, 2026-10-01) — FR3 madde 15

Yeniden tasarım K49 ile onaylı ve uygulandı (bkz. `docs/fe-r3c-review/README.md`). Aşağıdakiler mevcut backend
sözleşmesinin DIŞINA çıkan ya da akış değiştiren maddelerdir; HİÇBİRİ uygulanmadı. Numaralar paralel görevlerle
çakışmasın diye `C` önekli.

### Backend istekleri

| No | İstek | Neden | Önyüz hazırlığı |
|---|---|---|---|
| C01 | **Şablon kaydı API'si**: `PrintTemplateService` — `list`, `get`, `save` (oluştur/güncelle, `version` ile iyimser kilit), `delete`, `setDefault(kind)`. Kiracı (mağaza) kapsamlı; gövde = `TemplateDoc` JSON (`frontend/src/components/printouts/templateModel.ts`), boyut sınırı ~64 KB, şablon sayısı ≤ 50 | Bugün şablonlar yalnız bu tarayıcıda (`ek.printTemplates.v1.<kullanıcı>.<mağaza>`): ekip arkadaşı göremez, cihaz değişince kaybolur | `templateStore.ts` tek okuma/yazma noktası; API gelince yalnız bu dosya değişir. Yerel şablonları bir kez sunucuya taşıma düğmesi önerilir |
| C02 | **Sürüm geçmişi** (son 20 kayıt, kim/ne zaman) + taslak/yayın ayrımı | Araştırma 9.2–9.5: yarım şablonla toplu basımı önler | Düzenleyicide "Kaydedildi/Kaydedilmedi" durumu var; "Yayınla" düğmesi API ile eklenir |
| C03 | **Yazdırıldı kaydı**: `OrderService` üzerinde sipariş başına "etiket/fiş basıldı" damgası (tarih, şablon kimliği) | Araştırma 13: çift etiket/çift gönderi riski; sipariş listesinde "basılmadı" süzgeci | Önizleme `printed` olayını yayıyor; API gelince bağlanır |
| C04 | **Pazaryeri/kargo etiketi PDF'i** (`IFulfillment.labelUrl`) önizlemede olduğu gibi basma | Araştırma 11.1–11.2: kargo firmasının kendi barkodu yeniden üretilmemeli | `labelUrl` alanı arayüzde var; önizlemede "Pazaryeri etiketi" sekmesi olarak eklenebilir (bağımsız, küçük) |
| C05 | **Mağaza bilgileri alanları** (mağaza adı, logo, iade adresi) yazdırma verisine | Fiş/irsaliyede gönderici bilgisi; bugün yalnız "Sabit not" alanı var | Alan kataloğuna `store.*` grubu eklenir (ayarlar ekranındaki mağaza kimliğinden) |

### Akış önerileri (onay bekler)

- **C06 — Sipariş listesinden yazdırma varsayılan şablonla:** Sipariş satırındaki "Kargo etiketi yazdır" ve toplu
  yazdırma bugün sabit 100×100 etiketi (`BarcodePrintComponent`) kullanıyor ve DEĞİŞTİRİLMEDİ. Öneri: tür başına
  varsayılan şablon (galeride "Varsayılan" rozeti) kullanılsın; şablon yoksa bugünkü etiket. **Risk:** kullanıcının
  alıştığı çıktı değişir → C01 (sunucu kaydı) ile birlikte açılması önerilir.
- **C07 — Çok sayfalı belgeler:** A4'te kalem tablosu sayfaya sığmazsa bugün "+N kalem daha" basılır ve denetim uyarır.
  Öneri: başlık tekrarlı otomatik sayfa bölme (araştırma 8.3). Orta büyüklük; render motorunda sayfa bölme gerekir.
- **C08 — Menü yeri:** Çıktılar "Finans ve raporlar" altında; işlevi siparişe yakın. Öneri: "Satış" grubuna taşımak
  (menü verisi backend'de — P11 ile birlikte değerlendirilir).
- **C09 — Doğrudan termal yazdırma (ZPL) ve 203/300 dpi barkod modül yuvarlama:** bugün tarayıcı yazdırma + vektör
  SVG barkod (ölçekte bulanıklık yok). Termal yazıcı dağılımı netleşince (araştırma Q2) değerlendirilir.

## fe-r3d (2026-10-01) — FR3 madde 17–18 sonrası

**Onay kapsamı notu:** FR3 madde 17 / K49 onayı, belge o tarihte içerdiği maddeler içindir (P01–P16, P-MCP-1/2) — hepsi
yukarıda "KARAR" ile kapatıldı. P-R3A-*, P-R3B-*, C01–C09 FR3 turunda K49'DAN SONRA yazıldı; BEKLİYOR durumlarını korur
(ayrı onay gerekir).

### Backend'e iletilecekler (r3d)

| No | İstek | Kaynak | Önyüz hazırlığı |
|---|---|---|---|
| B-R3D-1 | Plan kaydında açık `unlimited` bayrağı (999 / 999.999 tavan değer yerine) | P08 | `SubscriptionView` `UNLIMITED_AT` eşiği; bayrak gelince yalnız `formatLimit` değişir |
| B-R3D-2 | Denetim günlüğü neden kodu kataloğu (kod → okunur metin) API'den | P09 | `REASON_LABELS` (`useAuditLogApi.ts`) 9 kodu taşır; katalog gelince oradan beslenir |
| B-R3D-3 | Menü verisinde kalıcı grup düzeni (Ayarlar bölümü: Mağaza ayarları, Çıktılar, Yetkilendirme; Finans grubu yalnız finans) | P11 | FE eşlemesi `menuShape.regroupMenu`; backend düzeni gelince eşleme no-op olur |
| B-R3D-4 | E-posta şablonlarında "şifre" → "parola" | P07 | Uygulama metinleri tamam |
| B-R3D-5 | Denetim DTO'sunda silinmiş kullanıcı için ad/maskeli e-posta anlık görüntüsü (`actorLabel`) | P09 | Bugün dizinden çözülüyor; dizin eksikse "Bilinmeyen kullanıcı" |

### Kimlik denetimi (FR3 madde 18) — onay bekleyen öneriler

Kaynak: `docs/fe-r3d-review/README.md` §3 (43 ekran × light/dark × 1440/390; axe 0 ihlal, yatay taşma 0). Bariz olanlar
uygulandı; aşağıdakiler davranış, düzen veya ortak bileşen kararı içerdiği için onay bekler.

| # | Ekran | Öneri | Neden onay gerekiyor | Durum |
|---|---|---|---|---|
| P-R3D-1 | Finans › işlem detayı | Ortalanmış diyalog → r3b'nin ortak kayıt detayı deseni (`EkRecordSheet` + `EkDetailPanel`; özet kartı, başlıklı kartlar). Etiketler cümle düzeni ("İŞLEM REFERANSI" → "İşlem no"), eksi işareti tabloyla tek (`−`) | FR3-12 listesinde yoktu; diyalogdan yan sayfaya geçiş akış değişikliği | BEKLİYOR |
| P-R3D-2 | Tüm listeler | Satır eylemleri tek desen: görüntüle (göz) + `⋯` taşma; sil taşma menüsünde. Bugün: sipariş/iade/fatura göz + ⋯, müşteri/kayıtlar göz + kırmızı çöp, ürün kalem + çöp, mesaj ilk satırda yanıt glifi; eylemi olmayan satırda göz ⋯ yuvasına kayıyor (hizasız) | Silme erişimini bir tık derine iter (davranış) | BEKLİYOR |
| P-R3D-3 | Liste ekranları | Tek birincil eylem (§1): sayfanın "Yeni …" eylemi (Yeni ürün, Yeni fatura, Yeni mağaza, Yeni talep, Yeni personel) dolgu birincil; filtre panelindeki "Sorgula" ikincil (Enter ile sorgulama zaten var) | Ortak `EkFilterPanel` görünümü tüm listelerde değişir | BEKLİYOR |
| P-R3D-4 | Faturalar, Mesajlar, İşlem kayıtları, Finans | P04'ün devamı: liste tarih kolonunda yalnız gün, saat ipucunda (Siparişler/İadeler gibi). İşlem kayıtlarında Başlangıç/Bitiş için saat önemli → orada "Bitiş" yalnız saat (aynı gün) önerilir | Mesaj/işlem kayıtlarında saat iş bilgisi olabilir | BEKLİYOR |
| P-R3D-5 | Ana sayfa, Bildirimler | Dekoratif renkli ikon karoları (KPI: mavi/yeşil/teal/turuncu; bildirim kategorileri) nötr; renk yalnız durum taşıyan karoda (§2) | Ana sayfa görsel dili (r3b kararı) değişir | BEKLİYOR |
| P-R3D-6 | 390 liste kart görünümü | Kart düzeninde masaüstü kolon/sıralama başlık satırı sağdan kırpılıyor (siparişler, iadeler, faturalar, destek, yetkilendirme, yönetim listeleri) → kart modunda başlık satırı gizlenir, sıralama "Sırala" menüsüne taşınır | Ortak `EkDataGrid` mobil etkileşimi | BEKLİYOR |
| P-R3D-7 | Entegrasyon sağlığı | Ham kod/uç nokta ("UNAVAILABLE", "RATE_LIMITED", "GET /orders") okunur metinle aynı satırda → P09 deseni: okunur metin üstte, kod + uç nokta ikincil satır veya "Teknik ayrıntı" | Destek ekibinin kullandığı bilgi görünürlüğü | BEKLİYOR |
| P-R3D-8 | Entegrasyon formları | Alan adları İngilizce/başlık düzeni ("API Key (Merchant ID)", "API Secret", "Client ID", "Satıcı ID") → "API anahtarı", "API gizli anahtarı", "İstemci kimliği", "Satıcı no"; pazaryerinin kendi terimi yardım metninde | Kullanıcı pazaryeri panelindeki adı birebir arıyor olabilir | BEKLİYOR |
| P-R3D-9 | Abonelik | Plan kartlarında iki dolgu "Bu plana geç" → mevcut plandan üste "Yükselt" (birincil), alta "Plana geç" (ikincil); "MCP çağrısı / gün" → "Yapay zekâ bağlantısı çağrısı / gün" | Satış akışı ve plan dili | BEKLİYOR |
| P-R3D-10 | Kabuk | Üst bar altındaki "—" tutamağı (`ShellChromeHandle`) tüm ekranlarda kırpık bir sekme gibi görünüyor (3 bağımsız inceleme aynı bulgu) → tam düğme biçimi (radius + kenarlık) ya da sekme şeridinin sağ ucunda satır içi düğme | FR2 kabuk kararı (üst barı gizle / odak modu) | BEKLİYOR |
| P-R3D-11 | Sekme şeridi | Pasif sekmede yer varken başlık soluyor ("Anasayf…"; ~220px sekmede) → solma yalnız başlık sığmadığında | r3a sekme ölçü kuralı | BEKLİYOR |
| P-R3D-12 | Yardım merkezi | Hero kartında gradyan dolgu, koyu temada parlak mavi kenarlık → düz `surface-raised` + standart kenarlık (§1) | Yardım merkezinin görsel kimliği | BEKLİYOR |
| P-R3D-13 | Otopilot | Boş durum "Otopilot şu an kapalı" sonraki adım vermiyor → ikincil "Otopilot ayarları" düğmesi; başlık ortalanmış kapta, diğer sayfalar gibi sayfa boşluğuna hizalı | Sohbet paketi yerleşimi (chat-fe) | BEKLİYOR |
| P-R3D-14 | Yönetim ekranları (backoffice yüzeyi web içinde) | Motor ayarları salt-okunur alanlar boş görünüyor (değer yardım satırında), süre birimleri tutarsız (45000 ms ↔ 45 sn), "Kaynak" boş hücre, KPI'da aralıklı yazı, sistem ekranında iki yarım 4px kayık, renkli başlık ikonları | Yönetim yüzeyi (K48: backoffice serbest — ayrı tur) | BEKLİYOR |
## Mobil + PWA + masaüstü kabuğu (cloud/fe-mobdesk, 2026-10-01) — MOB-00, MOB-01, DESK-00

Uygulanan bariz düzeltmeler ve ölçümler: `docs/fe-mobdesk-review/README.md`. Aşağıdakiler akış, bilgi mimarisi veya
dağıtım kararı içerdiği için UYGULANMADI.

| # | Tarih | Kaynak | Öneri | Neden onay gerekiyor | Durum |
|---|---|---|---|---|---|
| P-MD-1 | 2026-10-01 | cloud/fe-mobdesk | **Kart görünümünde sıralama.** 360–430 px'te liste satırları karta dönüşüyor ama kolon başlığı satırı (SİPARİŞ NO · KANAL · DURUM …) yerinde kalıyor ve sağda kırpılıyor (ızgaranın kendi içinde kayıyor; sayfa kaymıyor). Öneri: kart görünümünde başlık satırı yerine tek "Sırala" seçimi (alan + yön) ve "Tümünü seç" onay kutusu. | Sıralama etkileşimi değişir (EkDataGrid, tüm listeler) | BEKLİYOR |
| P-MD-2 | 2026-10-01 | cloud/fe-mobdesk | **Telefonda sekme şeridi ve tutamak.** Dokunmatikte tutamak (üst bölümü daralt / odak modu) hep açık; çakışma giderildi ama şerit ~100 px daralıyor ve 360 px'te 1,5 sekme görünüyor. Öneri: <600 px'te sekme şeridi yerine tek "Açık sekmeler (n)" seçici; daralt/odak modu hesap menüsüne. | Bilgi mimarisi (kabuk) | BEKLİYOR |
| P-MD-3 | 2026-10-01 | cloud/fe-mobdesk | **Kurulum kartının zamanı.** Kart mobilde (Android istemi varsa / iOS Safari) ilk ziyarette altta çıkıyor, kapatılınca bir daha çıkmıyor. Öneri: yalnız oturum açıkken ve ikinci ziyaretten sonra göster (kullanıcı ürünü tanımadan istem yok). | Davranış/zamanlama tercihi | BEKLİYOR |
| P-MD-4 | 2026-10-01 | cloud/fe-mobdesk | **Manifest ekran görüntüleri ve kısayolları.** Android'in zengin kurulum penceresi için `screenshots` (dar + geniş) ve uzun basış kısayolları (Siparişler, Ürünler, Otopilot). Eski görüntü (eski giriş ekranı) kaldırıldı; yenisi onaylı görsellerden üretilmeli. | İçerik/görsel onayı | BEKLİYOR |
| P-MD-5 | 2026-10-01 | cloud/fe-mobdesk | **Masaüstü kabuğunun hedef adresi.** Paketli uygulama yalnız `https://app.entegrasyonik.com`'u açıyor (geliştirmede `localhost:3020`). Staging için çalışma zamanı değişkeni bilerek YOK (kabuk yabancı bir origin'e yönlendirilemesin). Öneri: gerekiyorsa derleme kanalı (prod/staging) paketlemede sabitlenir. | Dağıtım kararı (DESK-05 ile) | BEKLİYOR |
| P-MD-6 | 2026-10-01 | cloud/fe-mobdesk | **Çevrimdışı bant.** Çevrimdışı ekranı yalnız sayfa yüklenirken (gezinme) çıkıyor; uygulama açıkken bağlantı koparsa istekler tek tek "bağlantı" hatası veriyor. Öneri: kabukta `offline` olayıyla sakin üst bant ("Bağlantı yok — değişiklikler kaydedilmez") ve yazma düğmelerinin geçici devre dışı kalması. | Kabuk davranışı | BEKLİYOR |
| P-MD-7 | 2026-10-01 | cloud/fe-mobdesk | **Masaüstünde tek örnek ve pencere durumu.** İkinci kez açılınca yeni pencere açılıyor; pencere boyutu/konumu hatırlanmıyor. Öneri: `requestSingleInstanceLock` + son pencere durumunu saklama. | Masaüstü davranışı | BEKLİYOR |

## Kamera fotoğrafı + barkodla bulma (cloud/fe-mob2, 2026-10-01) — MOB-02, MOB-03

Uygulananlar ve testler: `docs/fe-mob2-review/README.md`. Aşağıdakiler akış/davranış değiştirdiği, birden çok ekranı
etkilediği ya da brif ile kod tabanı arasında çelişki içerdiği için UYGULANMADI (K48).

| # | Tarih | Kaynak | Öneri | Neden onay gerekiyor | Durum |
|---|---|---|---|---|---|
| P-MOB2-1 | 2026-10-01 | cloud/fe-mob2 | **Telefonda galeriden seçilen fotoğraflar da hazırlansın.** "Fotoğraf çek" çıktısı küçültülüp EXIF/konum temizleniyor; ama telefonda "Görsel ekle" ile galeriden seçilen JPEG'ler de GPS taşıyabilir ve 5–12 MB olabilir. Öneri: dokunmatik cihazda seçilen JPEG/HEIC dosyaları da aynı `preparePhoto` hattından geçsin (PNG/WebP olduğu gibi). Alternatif: tüm cihazlarda yalnız meta veri silinsin (yeniden kodlamasız silme EXIF yönünü de sileceği için tek başına önerilmez). | Mevcut yükleme davranışı (dosya baytları) değişir; masaüstü yüklemeleri etkilenmesin diye ayrı karar | BEKLİYOR |
| P-MOB2-2 | 2026-10-01 | cloud/fe-mob2 | **Görsel yüklemesini imzalı PUT akışına taşıma (ADR-0027 §7).** Brif "mevcut imzalı yükleme akışını kullan" diyor; ama önyüz bugün hâlâ multipart `ImageApi/upload` kullanıyor (`createUploadUrl`/`confirmUpload` çağrısı yok). Kamera fotoğrafı bu yüzden mevcut multipart kuyruğuna verildi (backend değişmedi). Geçiş için: `useImageUploads` → bilet + `fetch(PUT, credentials:'omit')` + onay, 404'te tek yeniden deneme; Electron CSP `connect-src`'ye R2 S3 uç noktası (bugün yalnız `*.entegrasyonik.com` → masaüstünde yükleme kırılır) ve web `_headers`'a aynı ekleme. Hazırlanan fotoğraf zaten sözleşmeye uygun (`image/jpeg`, ≤ 10 MB). | Tüm görsel yüklemelerinin taşıma katmanı + iki CSP (web, Electron) değişir; R2 CORS/env üretimde doğrulanmalı | BEKLİYOR |
| P-MOB2-3 | 2026-10-01 | cloud/fe-mob2 | **Varyant görsel panelinde de "Fotoğraf çek".** Ana galeriye eklendi; `ProductVariantImagesComponent` ve eski toplu varyant bileşenleri dosya seçimiyle kaldı. | Varyant akışı (görsel doğrudan varyanta bağlanır) ayrı ekran | BEKLİYOR |
| P-MOB2-4 | 2026-10-01 | cloud/fe-mob2 | **Tek eşleşmede otomatik açma (sipariş).** BACKLOG MOB-03 kabulü "barkod → ürün detayı": ürün listesinde okunan kod tek ürünle eşleşirse ürün sekmesi açılıyor. Tutarlılık için siparişte de tek eşleşmede detay açılıyor. Alternatif: siparişte her zaman filtreli liste (kullanıcı satırı seçer). | Sipariş tarafı kabulde açıkça yoktu | BEKLİYOR (uygulandı, geri alınabilir) |
| P-MOB2-5 | 2026-10-01 | cloud/fe-mob2 | **Uzun kenar sınırı.** Sözleşmede piksel sınırı yok (yalnız 10 MB / 50 MP); 2400 px seçildi (önerilen kısa kenar 1200 px 2:1'e kadar korunur; 4000×3000 telefon fotoğrafı ~2400×1800, ≈0,4–1 MB). Pazaryerlerinin önerdiği 1200×1800 dikey için de yeterli. Farklı bir değer (ör. 2048 ya da 3000) istenirse tek sabit: `PHOTO_PREP.maxLongEdge`. | Ürün/pazaryeri görsel kalitesi tercihi | BEKLİYOR (2400 uygulandı) |
| P-MOB2-6 | 2026-10-01 | cloud/fe-mob2 | **Ürün barkoduyla sipariş bulma.** Sipariş araması (`globalSearch`) sipariş no, pazaryeri no, müşteri adı/telefonu ve kargo takip no'da arıyor; kalemdeki ürün barkodunda aramıyor. Ürün etiketini okutup "bu ürünün siparişleri"ni bulmak için backend'de kalem barkodu alanı aramaya eklenmeli (yalnız okuma). Önyüz hazır: aynı düğme, metin "Sipariş no, kargo takip no ya da ürün barkodu" olur. | Backend değişikliği (bu iş backend'e dokunmadı) | BEKLİYOR |

## Maliyet + Trendyol buybox görünürlüğü (cloud/prc-r1, 2026-10-01) — PRC-R0, PRC-R1

Uygulananlar ve testler: `docs/prc-r1-review/README.md`. Aşağıdakiler akış / bilgi mimarisi / davranış içerdiği ya da backend
değişikliği gerektirdiği için UYGULANMADI (K48).

| # | Tarih | Kaynak | Öneri | Neden onay gerekiyor | Durum |
|---|---|---|---|---|---|
| P-PRC-1 | 2026-10-01 | cloud/prc-r1 | **Maliyeti eksik ürünleri bulma.** Liste başlığındaki "Maliyet kapsamı %X" yalnız bilgi verir; "maliyeti girilmemiş" ürünleri süzmek için ürün listesine "Maliyet: eksik / girilmiş" filtresi ve göstergeden tek tıkla o filtreye geçiş. Backend `listCosts { missingOnly }` hazır; `ProductService/getProducts` filtresi yok. | Yeni filtre + gösterge etkileşimi; backend `searchProductForm` alanı | BEKLİYOR |
| P-PRC-2 | 2026-10-01 | cloud/prc-r1 | **Maliyetin toplu girişi.** Yüzlerce varyantta maliyet tek tek girilmez: Excel/CSV'den içe aktarma (barkod → maliyet, `setVariantCosts` ≤500) ya da mevcut Excel dışa/içe aktarmaya "Maliyet" sütunu. Bugün yalnız varyant ızgarası ve "Toplu düzenle" var (ürün başına). | Yeni akış (içe aktarma) ve sütun sözleşmesi | BEKLİYOR |
| P-PRC-3 | 2026-10-01 | cloud/prc-r1 | **Maliyet sütununun görünürlüğü.** Varyant ızgarası 1280 px'te (kenar çubuğu açıkken) Stok/Raf/Maliyet için yatay kaydırma gerektiriyor (sütun sondadır: klavye sırası = görsel sıra). Öneri: sütun seçici ("Görünen sütunlar") ya da kanal fiyatı onay kutusu sütununu daraltma. | Izgara yerleşimi/bilgi yoğunluğu (tüm ürün formları) | BEKLİYOR |
| P-PRC-4 | 2026-10-01 | cloud/prc-r1 | **"Rekabet ve kâr" ayrı adım/sekme ve liste derin bağlantısı.** Şimdi Varyantlar adımının altında bir bölüm (yalnız kayıtlı üründe). Alternatif: sihirbaza 5. adım "Rekabet" ya da listedeki rozetten doğrudan açılan yan panel; ürün düzenleme için `productId` derin bağlantısı (ADR-0012 Açık Soru 2) ile bildirim → doğrudan ürünün rekabet bölümü. | Bilgi mimarisi (sihirbaz adımları, derin bağlantı) | BEKLİYOR |
| P-PRC-5 | 2026-10-01 | cloud/prc-r1 | **Filtre ↔ URL yansıması (ters yön).** `?buybox=…&barcode=…` filtreyi açar; kullanıcı filtreyi panelden değiştirince URL güncellenmiyor (diğer liste ekranlarıyla aynı davranış; ADR-0012). Ayrıca bildirimden gelen tek barkod eşleşmesinde ürünü doğrudan açmak (MOB-03'teki gibi) önerilebilir. | Gezinme davranışı | BEKLİYOR |
| P-PRC-6 | 2026-10-01 | cloud/prc-r1 | **Backend: ürün başına buybox özeti.** `listBuybox` varyant satırı döner (limit ≤200, `productIds` ≤100); çok varyantlı ürünlerde satır kırpılırsa rozet eksik varyantları görmez. İstek: `listBuybox { groupBy: 'product' }` → `{ productId, losing, winning, total }`. Ayrıca `previewMargin` yanıtına `nextRefreshAt/overdue/settings.enabled` eklenirse panel ikinci çağrıdan kurtulur. | Backend sözleşmesi (bu iş backend'e dokunmadı) | BEKLİYOR |
| P-PRC-7 | 2026-10-01 | cloud/prc-r1 | **Varyant ızgarası metinleri i18n dışı.** Izgara/toplu düzenleyici başlıkları ve doğrulama mesajları (Stok kodu, Satış fiyatı, "Negatif olamaz"…) kod içinde Türkçe sabit; bu iş yalnız yeni "Maliyet (KDV hariç)" başlığını/etiketini i18n'ledi. Tüm ızgarayı `t()`'ye taşımak ayrı bir iş. | Çok dosyalı metin göçü | BEKLİYOR |
| P-PRC-8 | 2026-10-01 | cloud/prc-r1 | **Maliyet kaydı hatasında çift bildirim.** `setVariantCosts` 5xx döndüğünde uygulama geneli "Bir şeyler ters gitti. Destek kodu…" bildirimi ile bu ekranın özel bildirimi ("Ürün kaydedildi, ancak maliyetler kaydedilemedi…") birlikte görünür (P16 ile aynı aile). Öneri: çağrı başına genel bildirimi bastırma seçeneği (`PostOptions`). | `restapi.ts` genel hata davranışı | BEKLİYOR |

## Fiyat kuralları — onaylı öneri (cloud/prc-r2, 2026-10-01) — PRC-R2

Uygulananlar ve testler: `docs/prc-r2-review/README.md`. Aşağıdakiler akış / bilgi mimarisi / davranış içerdiği ya da ürün kararı gerektirdiği
için uygulanmadı (K48); kullanıcı onayı bekler. Hukuk sınırları (AUTO_PRICING_LEGAL K1–K20, K58) hiçbir öneride gevşetilmez; otomatik (onaysız)
uygulama PRC-R3'tür ve avukat yanıtını bekler.

| # | Tarih | Kaynak | Öneri | Neden onay gerekir | Durum |
|---|---|---|---|---|---|
| P-PRC-9 | 2026-10-01 | cloud/prc-r2 | **Menü yeri.** "Fiyat kuralları" ekranı şimdilik Katalog bölümünde ayrı ekran (`catalog/pricing-rules`); gerçek menü kaydı (ApplicationDB `menus`, kod `pricing/PricingRulesView`) yerel iştir. Alternatif: "Ürün kataloğu" grubunun altında ya da ürün listesindeki "Buybox kaybedildi" rozetinden doğrudan öneriye geçiş. | Bilgi mimarisi (menü ağacı) | BEKLİYOR |
| P-PRC-10 | 2026-10-01 | cloud/prc-r2 | **Ürün ekranından öneri.** "Rekabet ve kâr" bölümüne (PRC-R1) o varyantın açık önerisi + "Onayla" düğmesi; kâr önizlemesinde "kural bu fiyatı önerirdi" satırı. | Ürün düzenleme akışına yeni eylem | BEKLİYOR |
| P-PRC-11 | 2026-10-01 | cloud/prc-r2 | **Kural kapsamı seçici.** Kural kapsamı bugün "tüm uygun Trendyol ürünleri" ya da elle barkod listesi. Ürün/kategori/marka seçici (ve backend `scope.productIds` zaten var) daha kullanışlı olur. | Yeni seçim akışı + backend kategori/marka kapsamı | BEKLİYOR |
| P-PRC-12 | 2026-10-01 | cloud/prc-r2 | **Kural değerleri için "kendi geçmişimden öner".** K4 izin verir: değerler yalnız satıcının KENDİ geçmişinden türetilebilir (ör. son 30 gün ortalama marjı). Şimdi form tamamen boş başlar. | Ürün kararı; hukuk K4 sınırı | BEKLİYOR |
| P-PRC-13 | 2026-10-01 | cloud/prc-r2 | **Öneri bildirimi.** Yeni açık öneri oluştuğunda (günlük özet) bildirim; bugün yalnız kural duraklayınca `PRICE_RULE_PAUSED` var. | Bildirim kataloğu + tercih | BEKLİYOR |
| P-PRC-14 | 2026-10-01 | cloud/prc-r2 | **Kampanya ekranında "yasal önceki fiyat".** K10 yardımcısı (`lowestPrice10d`) bugün yalnız öneri tablosunda. Kampanya modülü (CMP-02) geldiğinde indirim kurulurken "son 10 gün en düşük" otomatik gösterilsin. | CMP-02'ye bağlı | BEKLİYOR |
| P-PRC-15 | 2026-10-01 | cloud/prc-r2 | **Rol ayrımı.** Öneri listesi üyeye (operator) açık, onay/kural yöneticiye (`pricing:manage`). Operatörün "onaya gönder" (yöneticiye öneri) akışı istenebilir. | Yetki modeli/akış | BEKLİYOR |

## Açılış yapılandırması kalanı + sistem ayarları (cloud/fe-cfg2, 2026-10-01) — FE-CFG-1/2/3, BO-CFG-1, INT-1001 §8

Uygulananlar: `docs/FE_CFG2_REPORT.md`. Aşağıdakiler davranış/bilgi mimarisi değiştirdiği ya da ürün kararı gerektirdiği için uygulanmadı (K48).

| # | Tarih | Kaynak | Öneri | Neden onay gerekir | Durum |
|---|---|---|---|---|---|
| P-CFG-1 | 2026-10-01 | cloud/fe-cfg2 | **Eski tanım ekranlarını tamamen silmek.** 7 tanım görünümü (Brand/Hashtag/Option/Customer/Invoice/Order/Return) artık yalnız başlık + boş durum gösteriyor; menüde yoklar (yalnız `menu.ts` `views` haritasında kayıtlı). `CategoryDefinitionView` ise `CategoryListView`'in birebir kopyası. Öneri: 8 dosya + `menu.ts` kayıtları + kullanılmayan `customers.customer.*`/`definitions.*` i18n anahtarları silinsin, e2e `legacy-definition-placeholders.spec.ts` kalksın. | Ekran/menü kaydı silme (ADR-0015 Aşama 0 insan onayı) | BEKLİYOR |
| P-CFG-2 | 2026-10-01 | cloud/fe-cfg2 | **Yükleme tavanının yerleşik yedeği.** public-config alınamazsa FE yedeği 2 MB (eski sabit); backend varsayılanı 10 MB. Çevrimdışı/hatalı açılışta 2–10 MB arası görseller FE'de reddedilir. Öneri: yedek = sözleşme varsayılanı 10 MB (`IMAGE_UPLOAD_CONTRACT`). | Davranış değişikliği (ADR-0031 "yedek = bugünkü sabit" kuralı) | BEKLİYOR |
| P-CFG-3 | 2026-10-01 | cloud/fe-cfg2 | **Duyuru seviyesi "kritik".** FE şeridi `critical` seviyesini (hata tonu) destekliyor; backend kataloğu `announcement.level` için yalnız `info \| warning` kabul ediyor, backoffice formu da öyle. Öneri: kesinti duyuruları için `critical` eklensin (backend zod + backoffice seçenek + API_PUBLIC_CONFIG). | Katalog/sözleşme değişikliği | BEKLİYOR |
| P-CFG-4 | 2026-10-01 | cloud/fe-cfg2 | **Müşteri detayı "Kullanım" sekmesi hükmü.** Kullanım ekranı ortak `PageVerdict`'e taşındı; müşteri detayındaki sekme hâlâ `UsageVerdictBlock` (sayfanın kendi PageVerdict'i üstte olduğundan ikinci bir tam Durum başlığı tekrar olur). Öneri: sekmeler için kompakt PageVerdict varyantı (BoAttentionList + eylem satırı, Durum başlığı yok) ve ardından `UsageVerdictBlock`'un silinmesi. | Ortak bileşen API'si (bo-r1b) | BEKLİYOR |
| P-CFG-5 | 2026-10-01 | cloud/fe-cfg2 | **Kullanımda sakin bilgi maddesinin nedeni.** Ortak desende dikkat listesi yalnız acil madde varken açılır; sakin sayfada "Kullanıcıların çoğu mobilden geliyor" yalnız Durum çipi olur, eski bloktaki neden cümlesi ("mobil hata ve geri bildirimleri önce ele alın") görünmez. Öneri: çipe ipucu (title/tooltip) ya da PageVerdict'e "bilgi maddesinin nedenini göster" seçeneği. | Ortak bileşen davranışı (tüm sayfalar) | BEKLİYOR |
