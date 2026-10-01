# S24 inceleme — pazarlama dili, Otopilot, hero şeridi, üst bar

Dal: `cloud/site-s24` (taban `origin/cloud/site-s23`). Görüntüler 1440 / 1280 / 390 px; `*-once.png` = S23 tabanı,
`*-sonra.png` = bu tur. Görseller bulutta (Linux Chromium) üretildi; görsel onay yerelde (CLAUDE.md kural 7).

| Konu | Önce | Sonra |
|---|---|---|
| Anasayfa hero + şerit | `anasayfa-hero-serit-<w>-once.png` | `anasayfa-hero-serit-<w>-sonra.png` |
| Anasayfa Otopilot bölümü | `anasayfa-otopilot-<w>-once.png` | `anasayfa-otopilot-<w>-sonra.png` |
| Otopilot sayfası hero | `otopilot-hero-<w>-once.png` | `otopilot-hero-<w>-sonra.png` |
| Üst bar kapalı | `ustbar-kapali-<w>-once.png` | `ustbar-kapali-<w>-sonra.png` |
| Üst bar açık (Ürün paneli / mobil çekmece) | `ustbar-acik-<w>-once.png` | `ustbar-acik-<w>-sonra.png` |

## Kararlar (kullanıcı geri bildirimi 3. tur, K43–K46)

> `docs/adr/USER_DECISIONS.md` bulut kopyasında yok ve `docs/adr/` bulutta salt-okunur (kural 7) → K43–K46 satırlarının
> yerelde eklenmesi gerekiyor. Aşağıdaki özet o satırlar için kaynak olarak kullanılabilir.

1. **Otopilot hazır özellik gibi, şimdiki zamanla** (madde 1). Aşama rozetleri (`Erken erişim`, `Geliştirme aşamasında`,
   `Planlanan`), "yakında/geliştiriyoruz" dili, durum notu ve "Erken erişim listesine katılın" kaldırıldı → **"Demo talep
   edin"** (mailto, form yok, konu `Otopilot demo talebi`) + **"Hemen başlayın"** (kayıt). `StageBadge.astro` silindi.
2. **Tek vaat kaydı: `src/data/agent-claims.ts`** — 44 vaat; her biri `text` + iç `readiness`
   (`live`/`building`/`planned` + not + dayanak). `assistant.ts` metni `claim(id)` ile alır; kayıt sayfaya/llms'e sızmaz.
   `tests/upcoming.test.ts` → **`tests/agent-claims.test.ts`** (aşağıda).
3. **"Örnek" etiketleri kaldırıldı** (madde 2): konsol "Örnek görünüm" + "Temsilî tasarım; canlı ürün ekranı değildir",
   sohbet sahnesi "Örnek senaryo" + alt notu, anasayfa sipariş hikâyesindeki "Aşağıdaki sahneler örnek görünümdür."
   Sohbet sahnesi dekoratif figür olarak kalır (erişilebilir adı "Sohbet ekranı"); kurgusal rakamlar yalnızca orada.
4. **Teknik anlatım yok** (madde 3): "Açık standart: Model Context Protocol" kutusu, MCP diyagramı ve "Yerel uygulama"
   bölümü tamamen kalktı; "Temeli bugün kodda / Kodda: Yetenek kaydı / Sözleşme bekçisi / Kiracı izolasyonu" gibi teknik
   güven etiketleri fayda diline çevrildi ("Kontrol sizde" bölümü). claims.test'teki Otopilot'a özel **MCP istisnası
   kaldırıldı** (artık her sayfada yasak — daha sıkı). llms.txt/llms-full.txt ve SEO açıklamasındaki
   "upcoming / geliştirme aşamasında" notu ve `SeoEntry.upcoming` alanı kaldırıldı.
5. **Ziyaretçiye "müşteri" denmez** (madde 4): tüm site tarandı (aşağıdaki liste). "Her müşteri için ayrı veritabanı" →
   **"Verileriniz yalnızca size ait"** / "izole bir alanda tutulur". Not: kullanıcının örnek cümlesindeki "şifreli ortam"
   ifadesi yalnızca **anahtarlar** için kullanıldı — kodda şifrelenen şey entegrasyon sırlarıdır (FieldCrypto); tüm
   verinin şifreli olduğu repo içinde kanıtlanamıyor. "Son müşterileriniz" (satıcının alıcıları) ve "Müşteri soruları"
   (ürün özelliği) korunur. Güvenlik sayfası ve yasal metinlerde AES-256-GCM adı kaldı (değerlendirme yapanlar için ayrıntı).
6. **Hero + şerit** (madde 5): Hero ve fayda şeridi artık tek koyu sahne (`index.astro` → `.stage-top` ortak zemini);
   dört büyük cam kart → **tek ince cam ray** (4 hücre, saç çizgisi ayraçlı), kayan şerit daha küçük çiplerle. Hero'daki
   yinelenen fayda listesi kaldırıldı. Kesit çizgisinin kök nedeni (mock'un zemin ışıması kendi kutusunun dışına taşıp
   `overflow:hidden` ile kesiliyordu) giderildi. 1440’ta header dahil hero+şerit 1209 px → 1009 px; 390’da 2065 px → 1594 px. Mobilde ray 2×2, yalnız başlık.
7. **Anasayfa Otopilot bölümü premium** (madde 6): derin lacivert vitrin, aurora ışığı + sönük ızgara, degrade ince
   çerçeve, ürün adı vurgulu başlık, iki eylem (Ajanları keşfedin / Demo talep edin), sağda ajan paneli (2 ajan + onay
   kartı), altta ince ayraçlı üç adım (Gözler / Önerir / Onayınızla uygular). Hareket yok.
8. **Otopilot hero sade** (madde 7): çip (ad) + tek başlık + tek cümle + tek CTA ("Demo talep edin"); konsol sağda.
   Fiyat/paket vaadi yok (eski "Ücretli olacak mı?" SSS'si kaldırıldı; test fiyat sözcüklerini yasaklar).
9. **Üst bar** (madde 8) — S23 eleştirisi: grup sayısı zaten 3+1'di; kalabalık hissini ayraç çizgisi, kutulu "Giriş yap",
   etiketli "Hareket" hapı ve büyük (lg) bağlantı yazısı yaratıyordu. Şimdi: logo | **ortada** Ürün · Çözümler ·
   Kaynaklar · **Fiyatlar** | metin bağlantısı **"Giriş"** (erişilebilir ad "Giriş yap") + tek CTA "Ücretsiz dene";
   hareket kontrolü yalnızca simge (ad "Hareketi durdur" korunur). Ürün paneli: ikonlu/açıklamalı bağlantılar + koyu
   **Otopilot öne çıkan kartı**. Klavye (↓/↑/←/→/Home/End/Esc), odak tuzağı yok, axe 0 ihlal — e2e korunur.

## Kaldırılan / değişen metinler

**Otopilot (sayfa, anasayfa, hero girişi, Özellikler köprüsü, SEO, llms)**
- Kalktı: "Erken erişim" rozetleri ×(hero, bant, CTA), "Yakında", "Geliştirme aşamasında: ajanlar, sohbetle yönetim ve
  yerel uygulama platformun bugünkü sürümünde yoktur.", "Örnek görünüm", "Temsilî tasarım; canlı ürün ekranı değildir.",
  "Örnek senaryo", "İlk hedefimiz", "Temeli bugün kodda", "Bugün kodda / Kodda: …", "Ajanlarla birlikte gelecek",
  tüm "Açık standart: Model Context Protocol" bölümü, tüm "Yerel uygulama" bölümü, SSS "Ajanlar ne zaman kullanıma
  açılacak?" ve "Otopilot ücretli olacak mı?", "Sırada: Entegrasyonik Otopilot", llms "upcoming" notları.
- Değişti: hero "Operasyonunuzu izleyecek, onayınızla çalışacak ajanlar." → "Operasyonunuzu izleyen, onayınızla çalışan
  ajanlar."; tüm kart/döngü/SSS metinleri gelecek kipinden şimdiki zamana; "Sınırlar" + "Güven" → "Kontrol sizde — Hız
  ajanlardan, karar sizden"; CTA "Erken erişim listesine katılın" → "Otopilot ajanlarını iş başında görün" + "Demo talep
  edin"; SEO açıklaması "…Geliştirme aşamasında." → "…yalnızca onayınızla uygulayan operasyon ajanları."; OG etiketi
  "Geliştirme aşamasında" → "Operasyon ajanları"; hero girişi rozeti "Erken erişim" → "Yeni".

**"Müşteri" / veritabanı dili (site geneli)**
- `capabilities.ts` tenant-database: "Her müşteri için ayrı veritabanı / Her müşteri hesabı için ayrı bir veritabanı
  kullanılır." → "Verileriniz yalnızca size ait / Ürün, stok ve sipariş verileriniz izole bir alanda tutulur; başka bir
  işletmenin verisiyle karışmaz."; secrets özeti "veritabanında AES-256-GCM…" → "API anahtarlarınız AES-256-GCM ile…";
  güvenlik sütunu "Her hesap kendi veritabanında…" + "Hesaba özel veritabanı / AES-256-GCM ile şifreleme" → "Verileriniz
  yalnızca size ait, izole bir alanda…" + "İzole veri alanı / Şifreli anahtar saklama".
- `faq.ts` veri-ayrimi ve secim-kriterleri: veritabanı yapısı anlatımı → izole alan / size ait mesajı.
- `security-principles.ts`: izolasyon değeri → "Verileriniz yalnızca size aittir…"; süreklilik "Veritabanını değiştiren…"
  → "Verilerinizi etkileyen…".
- Anasayfa: ProblemSolution "her müşterinin verisi kendi veritabanında…" → "verileriniz yalnızca size ait, izole bir
  alanda korunur"; ClosingCta "Ayrı müşteri veritabanı" → "Verileriniz yalnızca size ait"; PricingSummary "Her müşteri
  hesabına ayrı veritabanı" → "Verileriniz izole bir alanda"; SecuritySummary "Çok kiracılı mimari" → "Veri izolasyonu",
  "RBAC" → "Ekip yetkileri", "Hesaba özel veritabanı" → "Yalnızca size ait / İzole veri alanı"; Capabilities görseli
  "Veritabanında saklanan" → "Saklanan", "Hesap / Ayrı veritabanı / Ortak platform: yalnızca hesap ve yapılandırma
  kayıtları" → "İşletme / İzole alan / Her işletmenin verisi yalnızca kendisine ait".
- İletişim/Destek: "Mevcut müşteri(ler)" → "Hesabınız varsa / Hesap sahipleri"; "Zaten müşteri misiniz?" → "Zaten
  Entegrasyonik kullanıyor musunuz?"; SEO iletişim açıklaması "mevcut müşteri destek talepleri" → "hesap destek talepleri".
- Rehber (mevzuat): "Her müşterinin verisi diğerlerinden nasıl ayrılıyor?" → "Verilerim diğer işletmelerin verilerinden
  nasıl ayrılıyor?".
- Üst bar/footer: "Fiyatlandırma" → "Fiyatlar" (sayfa başlığı değişmedi); "Giriş yap" düğmesi → "Giriş" metin bağlantısı.

## Otopilot vaat kaydı — yayın öncesi ürün kontrol listesi

Kaynak: `src/data/agent-claims.ts` (bu tablo oradan üretildi). **44 vaat: 5 kodda (live), 16 geliştirmede, 23 planlı.**
Sitede hiçbir durum etiketi görünmez; bu liste **yayına almadan önce** ürün ekibinin kontrol etmesi içindir — "Planlı"
ve "Geliştirmede" satırları, özellik gerçekten çalışana kadar yayındaki bir sitede kullanıcıya verilmiş bir söz olur.

| Kimlik | Vaat metni (sitede) | Durum | Yayın öncesi not |
|---|---|---|---|
| `core-title` | Operasyonunuzu izleyen, onayınızla çalışan ajanlar. | Planlı | Ajan çalışma zamanı henüz yok; yayından önce en az bir ajanın uçtan uca (izle → öner → onay → uygula) çalıştığı doğrulanmalı. |
| `core-lead` | Stok, sipariş ve katalogdaki sorunları fark eder, çözümü hazırlar ve onayınızla uygular. | Planlı | Stok farkı, sipariş takibi ve katalog sağlığı ajanlarının üçü de yayında olmalı; biri eksikse cümle daraltılmalı. |
| `core-short` | Operasyonunuzu izleyen, hazır öneriler getiren ve yalnızca onayınızla uygulayan ajanlar. | Planlı | core-title ile aynı koşul. |
| `bridge-text` | Stok, sipariş ve katalog takibini operasyon ajanlarına bırakın: ajanlar sorunu fark eder, çözümü hazırlar ve onayınızla uygular. | Planlı | core-lead ile aynı koşul. |
| `loop-lead` | Her ajan aynı beş adımlı döngüyle çalışır. Dört adımı ajan üstlenir; karar adımı yalnızca sizindir. | Geliştirmede | Döngü ADR-0018 Karar 3c ile tasarlandı; onay adımı ve kaynaklı kayıt kodda doğrulanmalı. |
| `loop-watch` | Kanallar arası stok farkını, geciken siparişi ve reddedilen ürünü izler. | Planlı | Üç sinyalin her biri için tespit kuralı ve eşik tanımı gerekli. |
| `loop-propose` | Bulduğunu sade bir özetle ve değişikliğin önizlemesiyle önünüze getirir. | Planlı | Önizleme kartı (değişiklik öncesi/sonrası) arayüzde olmalı. |
| `loop-approve` | Öneriyi inceler, onaylar ya da reddedersiniz; karar sizindir. | Geliştirmede | Onay kanalı modelden ayrı olmalı (ADR-0018 Karar 3c). |
| `loop-apply` | Onaylanan işlem sizin yetkinizle, paneldeki kurallarla birebir aynı şekilde uygulanır. | Geliştirmede | Uygulama, onaylayanın kimliğiyle ve mevcut yetki denetimiyle çalışmalı. |
| `loop-report` | Sonuç size özetlenir; her adım kayıt altına alınır. | Geliştirmede | Ajan çağrıları denetim kaydına kaynağıyla (source:'agent') yazılmalı. |
| `loop-principle` | Tespitler tanımlı kurallarla yapılır; yapay zekâ size anlaşılır bir özet ve öneri sunar. | Planlı | Kural katmanı ile özet katmanının ayrımı uygulamada korunmalı. |
| `agents-lead` | Tekrar eden takip işlerini ajanlar üstlenir; ekibiniz satışa odaklanır. | Planlı | Dört ajanın yayında olması gerekir. |
| `agent-monitor` | Pazaryeri tarafındaki değişiklikleri izler ve etkisini özetler; olası bir aksaklık size ulaşmadan ele alınır. | Geliştirmede | Pasif sözleşme bekçisi kodda; üzerine kurulan izleme ajanı henüz yok. |
| `agent-monitor-watches` | Kanal bağlantılarındaki değişiklikler | Geliştirmede | agent-monitor ile aynı. |
| `agent-monitor-brings` | Etki özeti ve çözüm önerisi | Geliştirmede | agent-monitor ile aynı. |
| `agent-orders` | Geciken ya da bir adımda takılan siparişleri fark eder ve öncelik sırasına dizilmiş bir eylem listesi sunar. | Planlı | Sipariş takip ajanı henüz yok. |
| `agent-orders-watches` | Geciken ve takılı kalan siparişler | Planlı | agent-orders ile aynı. |
| `agent-orders-brings` | Önceliklendirilmiş eylem listesi | Planlı | agent-orders ile aynı. |
| `agent-catalog` | Reddedilen ya da eksik bilgili ürünleri bulur ve düzeltme için hazır bir taslak getirir. | Planlı | Katalog sağlığı ajanı henüz yok. |
| `agent-catalog-watches` | Reddedilen ve eksik bilgili ürünler | Planlı | agent-catalog ile aynı. |
| `agent-catalog-brings` | Düzeltme taslağı | Planlı | agent-catalog ile aynı. |
| `agent-stock` | Kanallar arasındaki stok farklarının nedenini sade bir dille açıklar ve düzeltici adımı onayınıza sunar. | Planlı | Stok farkı ajanı henüz yok. |
| `agent-stock-watches` | Kanallar arası stok farkları | Planlı | agent-stock ile aynı. |
| `agent-stock-brings` | Neden açıklaması ve düzeltici adım | Planlı | agent-stock ile aynı. |
| `control-lead` | Ajanlar hızlıdır ama başıboş değildir: her öneri onayınızdan geçer, her adım kayda girer. | Geliştirmede | Onay kapısı ve kaynaklı kayıt birlikte yayında olmalı. |
| `control-gate` | Fiyat, stok ya da sipariş durumunu değiştiren her öneri, ayrı bir onay adımından geçer. | Geliştirmede | Onay adımı yapay zekânın erişemeyeceği ayrı kanal olmalı. |
| `control-readonly` | Ajanlar veriyi okuyup öneri hazırlar; değişiklik yalnızca sizin onayladığınız adımda uygulanır. | Kodda (live) | Bugün hiçbir yetenek ajanlara açık değil (varsayılan kapalı); açılırken salt-okuma varsayılanı korunmalı. |
| `control-audit` | Kim neyi, ne zaman onayladı sorusunun yanıtı her an hazırdır. | Geliştirmede | Denetim kaydı kodda; ajan adımlarının kaynağıyla yazılması gerekiyor. |
| `trust-data` | Verileriniz yalnızca size aittir ve izole bir alanda korunur; ajanlar yalnızca sizin hesabınızın verisiyle çalışır. | Kodda (live) | Hesap başına ayrı veri alanı ve şifreli anahtarlar kodda; ajan erişiminin oturumdaki hesapla sınırlı kaldığı doğrulanmalı. |
| `trust-role` | Her işlem rolünüzün izinleriyle denetlenir; yetkinizin yetmediği bir işlemi ajan da yapamaz. | Kodda (live) | Sunucu tarafı yetki denetimi (varsayılan red) kodda; ajan çağrılarının aynı yoldan geçtiği doğrulanmalı. |
| `chat-lead` | Sorunuzu günlük dille yazın; sohbet, paneldeki işlemlerin aynısını aynı kurallarla çalıştırır. | Geliştirmede | Sohbet ekranlarla aynı yetenek kaydından beslenmeli (ADR-0019). |
| `chat-natural` | Menü aramadan, konuşur gibi yazın; ihtiyacınız olan ekran ve filtre sizin için bulunur. | Planlı | Doğal dil → ekran/filtre eşlemesi henüz yok. |
| `chat-same-rules` | Sohbetten yapılan her işlem, paneldeki izin ve kurallarla birebir aynı şekilde çalışır. | Geliştirmede | Yetki tablosu yetenek kaydından türetiliyor; sohbet aynı denetimden geçmeli. |
| `chat-cards` | Yanıtlar kart ve tablo olarak gelir; tek dokunuşla ilgili ekrana geçip kaldığınız yerden devam edersiniz. | Planlı | Sohbet yanıtlarında uygulama bileşenleri (kart/tablo) henüz yok. |
| `chat-preview` | Değişiklik isteyen her mesaj önce bir önizleme kartına dönüşür; siz onaylayınca uygulanır. | Geliştirmede | Önizleme + onay akışı ADR-0018 Karar 3c ile tasarlandı. |
| `faq-approval` | Hayır. Ajanlar öneri hazırlar; fiyat, stok ya da sipariş durumunu değiştiren her adım onayınızı bekler. | Geliştirmede | control-gate ile aynı. |
| `faq-access` | Ajanlar yalnızca sizin hesabınızla ve rolünüzün izinleriyle çalışır. Rolünüzün yetmediği bir işlemi ajanlar da yapamaz. | Kodda (live) | trust-role ile aynı. |
| `faq-privacy` | Verileriniz yalnızca size aittir ve izole bir alanda korunur; entegrasyon anahtarlarınız şifreli saklanır. Öneri hazırlanırken son müşterilerinizin kişisel bilgileri varsayılan olarak maskelenir. | Planlı | Kişisel veri maskeleme henüz yok; yayından önce uygulanmalı ya da ikinci cümle kaldırılmalı. |
| `faq-start` | Demo talep edin; Otopilot ajanlarını işletmenizin akışı üzerinde birlikte inceleyelim. | Planlı | Demo süreci (kim, hangi ortamda gösterir) satış ekibiyle netleşmeli. |
| `cta-text` | Kısa bir demoda ajanların kanallarınızda neyi izlediğini ve size nasıl öneri getirdiğini gösterelim. | Planlı | Demo ortamı gerekli. |
| `llms-short` | Stok, sipariş ve katalog takibini izleyen, öneri hazırlayan ve yalnızca kullanıcı onayıyla uygulayan operasyon ajanları; sohbetle yönetim. | Planlı | core-lead ile aynı koşul. |
| `llms-loop` | Ajan döngüsü: gözle, öner, onayla, uygula, raporla. Değişiklikler kullanıcı onayıyla, kullanıcının yetkisiyle uygulanır ve kayda geçer. | Geliştirmede | loop-* ile aynı. |
| `llms-chat` | Sohbetle yönetim: panelle aynı işlemler ve aynı yetki kuralları; değişiklikler önizleme ve kullanıcı onayıyla uygulanır. | Geliştirmede | chat-* ile aynı. |
| `llms-trust` | Güven: veriler yalnızca işletmeye aittir ve izole bir alanda korunur; entegrasyon anahtarları şifreli saklanır; her işlem kullanıcının rol izinleriyle denetlenir. | Kodda (live) | trust-data + trust-role ile aynı. |

## Testler

- **vitest (tam):** 777 testin 775'i geçti. Kalan 2 başarısızlık bu turdan bağımsız ve tabanda da var:
  `claims.test.ts` → `INTEGRATIONS_REGISTRY.md` bulut kopyasında yok (evidence dosyası bulunamıyor; 92 atıf + N11
  allowlist kanıtı). Yerelde dosya mevcut olduğundan geçmesi beklenir.
- **Yeni `tests/agent-claims.test.ts`** (upcoming.test.ts yerine): (1) sayfa verisindeki her vaat alanı kayıttaki bir
  metne birebir eşit, ölü vaat yok, kaydı yalnızca `assistant.ts` okur, derlenmiş sayfalarda metinler birebir görünür;
  (2) `readiness` sayfa verisine, hiçbir derlenmiş HTML'e ve llms metinlerine sızmaz, `live` vaatlerin kod dayanağı
  doğrulanır (dosya + atıf metni), "bugün hiçbir yetenek ajanlara açık değil" yetenek kaydına karşı canlı doğrulanır;
  (3) aşama/örnek etiketi, teknik terim (MCP/protokol/veritabanı/API/yetenek kaydı/yerel uygulama), claims.test yasak
  listeleri (istisnasız), mutlak/garanti, tarih, müşteri/referans, abartı ve **fiyat/paket** sözcükleri yasak; rakam
  yalnızca sohbet sahnesinde; tüm derlenmiş sitede (yasal/rehber hariç) aşama/örnek etiketi ve MCP yok; hero tek cümle +
  tek CTA; (4) form yok, mailto "Otopilot demo talebi", CSP (satır içi style yok). Mutasyon denetimi: `assistant.ts`'e
  kayıt dışı serbest bir vaat yazıldığında test kırıldı.
- **claims.test.ts GEVŞETİLMEDİ:** Otopilot'a özel MCP dist istisnası kaldırıldı (daha sıkı); yalnızca `secim-kriterleri`
  SSS'inin beklenen sözcüğü `veritabani` → `izole` (K46 metin değişikliği; ölçüt ve evidence aynı).
- seo.test / pages.test / home.test / scenes.test: S18 "upcoming" istisnaları kaldırıldı, beklenen metinler güncellendi.
- **Playwright (tüm spec'ler, 3 proje, `--update-snapshots=missing`):** 437 geçti, 37 atlandı, 0 başarısız (nav klavye/
  axe, a11y, home-premium, inner-pages, pricing, legal, site). `*-linux.png` tabanları git-ignored, commit'lenmedi.
- **`npm run build`:** başarılı (50 sayfa).
- **Lighthouse (mobil, 3 koşu medyanı, ana sayfa):** yayın derlemesi performans 98 · erişilebilirlik 100 · en iyi
  uygulamalar 100 · **SEO 100** · LCP ≈ 2,25 sn · CLS 0.

## Commit'ler (`cloud/site-s24`)

- `29ee4e0` inceleme önce görüntüleri
- `8062603` Otopilot pazarlama dili + agent-claims vaat kaydı; aşama/örnek etiketleri, MCP/yerel bölümü kalktı;
  müşteri/veritabanı dili üst seviye güven mesajına
- `1711ac4` + `76584e3` upcoming.test → agent-claims.test; S18 istisnaları kaldırıldı
- `e5811c2` hero + fayda rayı tek koyu sahne; üst bar sadeleşti; Ürün panelinde Otopilot kartı
- `083d4ed` hero–ray geçişi kesitsiz, mobil ray, Ürün panel başlığı, ajan e2e
- (bu README + sonra görüntüleri: son commit)

## Açık noktalar

- K43–K46 satırlarını `docs/adr/USER_DECISIONS.md`'ye yerelde ekleyin (bulutta dosya yok / salt-okunur).
- Vaat kaydındaki 39 "planlı/geliştirmede" satırı yayından önce ürünle eşleştirilmeli; özellikle `faq-privacy`
  (kişisel veri maskeleme henüz yok) ve dört ajan kartı.
- Bulut ortamı: `scripts/cloud-setup.sh` Playwright tarayıcı indirmesinde (cdn.playwright.dev engelli) durdu ve
  `frontend` kurulumuna ulaşmadı; site derlemesi için `frontend` `npm ci` + `npm run tokens` elle çalıştırıldı
  (Linux rollup ikilisi `--no-save` ile). Playwright önceden kurulu Chromium ile geçici bir yapılandırmayla koştu.
