# Onay bekleyen öneriler (fe-polish, 2026-10-01)

Kaynak: `cloud/fe-polish` denetimi (r2a+r2b+r2c+r2d+dark birleşik dal; tüm ekranlar light + dark, 1440 + 390).
Özerklik: SINIRLI (kullanıcı, 2026-10-01: "bariz düzenlemeleri yap ama site kadar özgür davranma; uç durumlarda onaylı
gideriz"). Bu dosyadaki maddelerin HİÇBİRİ uygulanmadı — akış/davranış, bilgi mimarisi, alan, varsayılan, veri gösterim
mantığı veya terim kararı içeriyor. Uygulanan bariz düzeltmeler: `docs/fe-polish-review/README.md`.

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

### P02 — Filtrelerde "Tümü" varsayılanı tutarsız
- **Ekran:** Mesajlar ("Red durumu" = Tümü, etiket yukarıda), Bildirimler ("Okunma durumu" = Tümü çipi) ↔ diğer tüm filtreler boş.
- **Sorun:** Diğer filtrelerde "boş = filtre yok"; bu iki alan dolu başladığı için satır hizası ve görünümü farklı (etiket
  yüzer, biri çip). Görüntü: `once/messages-light-1440.png`, `once/notifications-dark-1440.png`.
- **Öneri:** "Tümü" seçeneği kaldırılır, alan boş başlar (boş = tümü; temizlenebilir). Filtre çipi özetinde görünmez.
- **Alternatif:** "Tümü" kalır ama diğer alanlar gibi düz metin (çip değil) ve tüm ekranlarda aynı.
- **Etki:** `MessageListView`, `NotificationCenterView` filtre varsayılanı ve istek parametresi (boş → gönderilmez).
- **Risk:** Düşük-orta: varsayılan değişikliği; backend'in "parametre yok = tümü" davrandığı doğrulanmalı (mock'larla).

### P03 — Sekmeli ekranlarda arama + yenile gövdede
- **Ekran:** Finans (İşlemler sekmesi), İşlem kayıtları (Ürün gönderim/çekim sekmeleri).
- **Sorun:** FR2_PATTERNS §5 "yenile yalnız `EkPageBar` en sağında". Sekmeli bu iki ekranda arama alanı + yenile düğmesi
  sekmenin içinde, gövdede (diğer listelerde başlık satırında). Görüntü: `once/finance-dark-1440.png`, `once/logs-dark-1440.png`.
- **Öneri:** Başlık çubuğunda tek yenile (etkin sekmeyi yeniler) + arama başlık satırında (etkin sekmeye bağlı placeholder).
- **Alternatif:** Sekmeli ekranlar için FR2_PATTERNS'a istisna yazılır ("sekme kendi araç satırını taşır"), görünüm aynı kalır.
- **Etki:** `FinancialListView`, `LogListView`, `EkListScreen` (dış başlığa yuva/olay); Alt+R kısayolu.
- **Risk:** Orta: sekme ↔ başlık iletişimi yeni bir sözleşme; liste spec'leri güncellenir.

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

### P06 — Destek adlandırması üç farklı
- **Ekran:** Destek. Menü grubu "Destek Kayıtları" › yaprak "Destek Kayıtları", başlık "Destek Talepleri", düğme
  "Yeni Bilet Aç". Görüntü: `once/menu-ticket-light-1440.png`.
- **Öneri:** "Destek talepleri" (grup tek yapraklıysa grup kalkar, yaprak üst seviyeye), düğme "Yeni talep".
- **Alternatif:** Yalnız düğme metni "Yeni talep", menü olduğu gibi.
- **Etki:** `TicketListView`, `menu.support_ticket_list`, yardım makaleleri ("Yeni Bilet Aç" geçen yerler), spec'ler.
- **Risk:** Düşük (metin + menü kaydı).

### P07 — "Şifre" ve "Parola" karışık
- **Ekran:** Giriş/kayıt ("Şifre", "Şifremi unuttum", "Şifrenizi mi unuttunuz?") ↔ Hesabım ve güvenlik ("Mevcut parola",
  "Parolayı değiştir"). Görüntü: `once/giris-dark-1440.png`, `once/account-security-light-1440.png`.
- **Öneri:** Tek terim "Parola" (güvenlik metinlerinde yerleşik terim; hesap ekranları zaten böyle).
- **Alternatif:** Tek terim "Şifre" (kullanıcı dilinde daha yaygın; giriş ekranları zaten böyle).
- **Etki:** `tr.json` giriş/kayıt/sıfırlama anahtarları, e-posta şablonu metinleri (backend — ayrı iş), yardım içeriği, spec'ler.
- **Risk:** Düşük; e-posta şablonları backend'de olduğundan iki taraf birlikte değişmeli.

### P08 — Kurumsal planda 999 / 999.999 limitleri sayı olarak görünüyor
- **Ekran:** Abonelik ve Planlar, "Kurumsal" kartı: "999 Kanal", "999.999 Varyant", "999 Kullanıcı". Görüntü: `once/subscription-dark-1440.png`.
- **Sorun:** Sınırsız anlamındaki tavan değeri ham sayı olarak gösteriliyor.
- **Öneri:** Tavan değer (≥ 999 / 999.999) "Sınırsız" olarak yazılır; plan verisi değişmez.
- **Alternatif:** Plan kaydına açık `unlimited` bayrağı (backend sözleşmesi — ayrı iş).
- **Etki:** `SubscriptionView` plan özellik satırları.
- **Risk:** Düşük; yalnız gösterim. Tavan eşiğinin backend plan kaydıyla teyidi gerekir (uydurma eşik olmasın).

### P09 — Denetim günlüğünde ham kod ve "Bilinmeyen kullanıcı"
- **Ekran:** Denetim günlüğü. "Neden: wrong_current", "Bilinmeyen kullanıcı …-owner". Görüntü: `once/settings-audit-log-dark-1440.png`.
- **Öneri:** Neden kodları için okunur karşılık tablosu ("Mevcut parola hatalı"); kullanıcı çözülemezse "Silinmiş kullanıcı"
  ya da e-postanın maskeli hâli.
- **Alternatif:** Ham kodu ikincil (monospace) satırda bırakıp üstte okunur metin.
- **Etki:** `AuditLogView` ayrıntı sütunu; karşılık tablosu backend hata kataloğundan gelmeli (premium-ui-standards: FE metin uydurmaz).
- **Risk:** Düşük-orta: karşılıklar backend kaynağından alınmalı.

### P10 — Mesajlar filtresinde "Kanal" sonda
- **Ekran:** Mesajlar filtre paneli: Mesaj durumu · Mesaj tipi · Red durumu · **Kanal**. Diğer listelerde Kanal ilk alan.
  Görüntü: `once/messages-light-1440.png`.
- **Öneri:** Kanal ilk sıraya. **Alternatif:** Tüm listelerde filtre sırası standardı FR2_PATTERNS'a yazılır (Kanal → Durum → Tür → Tarih).
- **Etki/Risk:** `MessageListView` filtre sırası; düşük.

### P11 — Menü grubu düzeni
- **Ekran:** Menü (destek/yönetim menüsü olan hesaplar): "Finans ve raporlar" altında Finansal İşlemler + Çıktılar + **Ayarlar**;
  "Yetkilendirme" ayrı tek öğeli grup. Görüntü: `once/menu-setting-dark-1440.png`.
- **Not:** Bu düzen backend menü kaydından (`MenuService`) geliyor; grup başlıklarının çevirisi ("MANAGEMENT", "SUPPORTS"
  İngilizce görünüyordu) bariz olarak düzeltildi → "Kullanıcı Yönetimi", "Destek".
- **Öneri:** Ayarlar + Yetkilendirme + Çıktılar "Ayarlar" grubunda; Finans grubu yalnız finans.
- **Alternatif:** FE'de bölüm eşlemesi (`SECTIONS`) ile menü verisinden bağımsız gruplama.
- **Risk:** Orta (IA + backend menü verisi; yerel oturum işi).

### P12 — E-Fatura sağlayıcılarının kısa adı yok
- **Ekran:** E-Fatura sağlayıcı şeridi: "TE" (iki ayrı sağlayıcı aynı kısa ad), "E-" (e-Logo), "Gİ" (GİB). Görüntü: `once/integrations-einvoice-dark-1440.png`.
- **Öneri:** K13 kısa/uzun ad kaydına e-fatura sağlayıcıları eklenir (ör. TEF, TCL, ELG, GİB); renkleri yalnız orijinal
  marka hex'i doğrulanınca (K13: tahmini renk yok), o zamana kadar nötr.
- **Etki/Risk:** `CHANNEL_SHORT` kaydı; düşük. Marka adları/kısaltmaları ürün sahibince onaylanmalı.

### P13 — Giriş ekranında "Şifremi unuttum" iki kez
- **Ekran:** Giriş: üst sekme "Şifremi unuttum" + alan altı "Şifrenizi mi unuttunuz?" bağlantısı. Görüntü: `once/giris-light-390.png`.
- **Öneri:** Üç sekme → iki sekme (Giriş · Kayıt); sıfırlama yalnız alan altındaki bağlantıdan.
- **Alternatif:** Sekme kalır, bağlantı kalkar.
- **Etki/Risk:** `AuthShell`/giriş akışı; login spec'leri. Düşük-orta (akış değişikliği).

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

### P15 — Açık filtre paneliyle liste alanı ~0 yüksekliğe iniyor
- **Ekran:** Denetim günlüğü (uyarı bandıyla), Bildirim merkezi — 1280×800'de filtre paneli açıkken (masaüstü varsayılanı).
- **Sorun:** `EkListFrame` tablo alanı ~0–100px'e iniyor; satırlar sayfalamanın altında kalıyor, tıklanamıyor. (Bildirim merkezinin hata
  kartı için bariz kısmı düzeltildi: kart kaydırılabilir oldu — commit `5759633c`.)
- **Öneri:** `.ek-list-frame__scroll` için asgari yükseklik (ör. 240px); sığmazsa sayfa kayar.
- **Alternatif:** Dar yükseklikte filtre paneli varsayılan kapalı açılır.
- **Etki:** Ortak `EkListFrame` (tüm liste ekranları); görsel tabanlar.
- **Risk:** Düşük-orta (ortak bileşen düzeni).

### P16 — Menü 500'de üç ayrı "Bir şeyler ters gitti" bildirimi
- **Ekran:** Kabuk açılışı, `MenuService` 500 döndüğünde.
- **Sorun:** Aynı kök hata için üç ayrı "Bir şeyler ters gitti. Destek kodu: c-…" bildirimi yığılıyor (eski davranış sessizdi).
  Ayrıca rastgele destek kodu "500"/"401" gibi rakam dizileri içerebildiği için tüm sayfada `not.toContainText('500')` arayan testler nadiren kırılabilir (shell spec'inde kelime sınırıyla düzeltildi).
- **Öneri:** Aynı istekten doğan hataları kısa pencerede tek bildirimde topla (tek destek kodu).
- **Alternatif:** Menü hatasında bildirim yerine kenar menüde satır içi hata durumu + Tekrar dene.
- **Etki:** `reportUnexpectedError` / bildirim kuyruğu.
- **Risk:** Düşük.

## MCP önyüzü (cloud/mcp-fe) önerileri


Akış / davranış / bilgi mimarisi değiştiren veya uç durum içeren öneriler. Kullanıcı onayı gelene kadar uygulanmaz;
karar verilince `docs/adr/USER_DECISIONS.md`'ye satır eklenir ve buradaki madde "KARAR: …" ile kapatılır.

| # | Tarih | Kaynak | Öneri | Neden onay gerekiyor | Durum |
|---|---|---|---|---|---|
| P-MCP-1 | 2026-10-01 | cloud/mcp-fe (MCP-6) | **Ekran adları.** Bulut brifi S3/S4 için "Bağlı uygulamalar / **Otopilot bağlantıları** (ad ürün sabitinden)" diyor; `MCP_UI_CONTRACT.md` §1 ise S3 = "Bağlı uygulamalar", S4 = "**Yapay zekâ bağlantısı**". Uygulanan: sözleşme adları (kanonik). Öneri: adları sözleşmedeki gibi bırakmak — MCP bağlantısı kullanıcının **kendi** yapay zekâ uygulamasıdır (K37b), Otopilot ise uygulama içi ajandır (K39); "Otopilot bağlantıları" iki ürünü karıştırır. Otopilot adı istenirse tek değişiklik `src/components/mcp/mcpMessages.ts` (`menu.*`, `mcp.connections.title`, `mcp.settings.title`) + `CHAT_PRODUCT` sabiti (yalnız `cloud/chat-fe` dalında; ana dalda yok). | Bilgi mimarisi / ürün adlandırması; brif ile sözleşme çelişiyor (CLAUDE.md kural 8 — raporlandı) | BEKLİYOR |
| P-MCP-2 | 2026-10-01 | cloud/mcp-fe (MCP-6) | **Ortak onay kartı.** `@entegrasyonik/chat` (`PartConfirm`) bu dalın tabanında yok (`cloud/chat-fe` birleşmedi). İşlem onayı önizlemesi (`src/components/mcp/McpActionPreview.vue`) sözleşmeye göre, sohbet onay kartıyla aynı görsel ritimde (ikon karosu + başlık + işlem çipi, pazaryeri notu, etkilenen kayıtlar) yazıldı. Öneri: sohbet paketi ana dala girince önizleme gövdesi pakete taşınsın; sohbet kartı ve S2 aynı bileşeni kullansın. | Paketler arası bileşen taşıma (iki bulut işini etkiler) | BEKLİYOR |
