# Kullanıcı Kararları Kaydı (ürün sahibinin isteklerinden doğan kararlar)

Bu dosya, ürün sahibinin (kullanıcı) isteklerinden şekillenen ürün ve mimari kararların **tek güncel dizinidir**.
Ayrıntı ADR'lerde durur; burada yalnızca "ne istendi → ne karar verildi → hangi belge bağlayıcı" özeti tutulur.

**Kurallar (her oturum, yerel ve bulut):**
1. İşe başlamadan bu dosyayı oku; bir brif/ADR bununla çelişiyorsa bu dosya ve bağlı ADR esastır — çelişkiyi raporla.
2. Kullanıcı yeni bir yön verdiğinde (tasarım, mimari, kapsam, isim, öncelik) aynı iş içinde buraya satır ekle; mimari etkisi varsa ADR yaz ve buraya bağla.
3. Karar değişirse eski satırı silme: durumunu `DEĞİŞTİ → Kxx` yap, yeni satır ekle.
4. Sır, parola, bağlantı dizesi yazılmaz. Rakip/referans uygulama adları yazılmaz (K07).

Durum: `GEÇERLİ` · `UYGULANIYOR` · `DEĞİŞTİ → Kxx` · `KALDIRILDI`

## Ürün kapsamı ve yön

| No | Tarih | İstek (özet) | Karar | Bağlayıcı belge | Durum |
|---|---|---|---|---|---|
| K01 | 2026-09-28 | "Entegrasyon" yalnız pazaryeri değil; API değişimleri yakalanmalı, ileride ajanlar gelecek | Entegrasyon = pazaryeri + e-ticaret + ERP + e-fatura + kargo. Altyapı bugünden ajan-hazır (yetenek manifesti, sözleşme testi, bulgu kaydı); ajanlar ölçek gelince açılır | ADR-0018 | GEÇERLİ |
| K02 | 2026-09-28 | Genel altyapıları tarif etmem gerekmesin, premium best practice | Kesişen konular (log, güvenlik, a11y, CI, KVKK, dayanıklılık) kendiliğinden uygulanır | docs/PLATFORM_BASELINE.md | GEÇERLİ |
| K03 | 2026-09-30 | Overengineering yok, "astarı yüzünü geçmesin" | Her mimari ekleme "neden şimdi / somut risk" gerekçesi ister; ağır çözümler tetikleyiciyle "sonra" sepetine | ADR-0030 | GEÇERLİ |
| K04 | 2026-09-30 | Yeni entegrasyon her seferinde icat edilmesin | Tek ekleme prosedürü + iskelet üretici + conformance kit; ortak altyapı değişikliği playbook'u aynı işte günceller | docs/INTEGRATION_PLAYBOOK.md, ADR-0033 | GEÇERLİ |
| K05 | 2026-09-30 | Mevcut kayıtları düzeltmeye çalışma, mock say | Eski veri için düzeltme göçü yazılmaz; şema/indeks göçleri yedek + onayla sürer | CLAUDE.md kural 3 | GEÇERLİ (canlı veri gelince yeniden sorulur) |
| K06 | 2026-09-30 | MCP'ye başlamadan önce önyüzleri review etmek istiyorum; müşteri bağlantılarıyla yalnız okuma | MCP fazı kullanıcı review'u bitene kadar başlamaz. Gerçek tenant bağlantılarıyla yalnız okuma (LIVE_READONLY); entegrasyonlara her türlü yazma yasak | docs/LIVE_READONLY.md | DEĞİŞTİ → K47 (MCP başladı; salt-okuma kuralı sürüyor) |
| K07 | 2026-09-29 | Referans gösterilen yerel uygulamalar | Yalnız yapı/davranış alınır; ad, metin, CSS adı hiçbir yerde geçmez; referans klasörü DS-v2 sonrası silinir | docs/design-reference/README.md | GEÇERLİ |
| K08 | 2026-09-30 | MCP fazına kadar backend boş kalmasın | Yerel backend hattı sürekli dolu; MCP'ye geçiş kapısı: tam test + ratchet yeşil, göçler uygulanmış, playbook/conformance bağlı, yetenek kaydı eksiksiz, faz4→faz3 birleşik | MASTER_STATE.md | GEÇERLİ |

## Yüzeyler ve tasarım

| No | Tarih | İstek (özet) | Karar | Bağlayıcı belge | Durum |
|---|---|---|---|---|---|
| K10 | 2026-09-30 | Backoffice ayrı uygulama, admin ekranları taşınsın, premium log kontrol merkezi | admin.entegrasyonik.com ayrı uygulama; /admin-api, ayrı oturum + TOTP + step-up | ADR-0026, docs/BACKOFFICE_PLAN.md | UYGULANIYOR |
| K11 | 2026-09-30 | Design token ve bileşenler tek merkezde, frontend ve backoffice ortak kullansın | `@entegrasyonik/ui` (frontend/packages/ui) tek kaynak; uygulamaya kopya bileşen açılmaz | ADR-0026, frontend/packages/ui/README.md | GEÇERLİ |
| K12 | 2026-09-30 | Dark mode (frontend + backoffice) | Tema tokenları üzerinden; frontend'de kabuk işinden sonra | ADR-0026, FE_FEEDBACK_R2 madde 10 | UYGULANIYOR |
| K13 | 2026-09-30 | Kanal marka renkleri birebir orijinal hex; rozet = koyu kenarlık + açık zemin | Tek token kaynağı; metin kontrastı otomatik; uygulama ve sitede aynı rozet biçimi; tahmini renk kullanılmaz | FE_FEEDBACK_R2 madde 11-15 | UYGULANIYOR |
| K14 | 2026-09-30 | Önyüz review 2. tur (39 madde) | Premium, naif, kullanıcı dostu, site ile tutarlı çıta | docs/cloud-contracts/FE_FEEDBACK_R2_2026-09-30.md | UYGULANIYOR |
| K15 | 2026-09-30 | Site review 2. tur | Agentic kimlik, gruplanmış üst bar, footer tanımı | docs/cloud-contracts/SITE_FEEDBACK_R2_2026-09-30.md | UYGULANIYOR |
| K16 | 2026-09-30 | Entegrasyonik bir yazılım değil, platformdur | Entegrasyonik kendini tanımladığı her yerde "platform"; genel arama terimi istisna | SITE_FEEDBACK_R2 madde 8 | UYGULANIYOR |
| K17 | 2026-09-30 | "Asistan" adı chatbot kıvamında; agentic, orijinal bir ad | Ad tek sabitten gelir; varsayılan **Otopilot** (kullanıcı başka ad seçene kadar); üçüncü taraf marka adı yok | SITE_FEEDBACK_R2 madde 2 | DEĞİŞTİ → K39 |
| K18 | 2026-10-01 | Backoffice tasarımı ve içeriği premium, UX yüksek | Operasyon konsolu dili; tehlikeli işlem diyaloğu standardı; ortak yükleme ekranı | frontend/backoffice/docs/BO_UI_PATTERNS.md (bulut BO-P1) | UYGULANIYOR |
| K19 | 2026-09-30 | Backoffice gezilebilir olunca haber ver | Kabuk + bir ekran çalışır olunca URL ile bildirim | — | GEÇERLİ |

## Sohbet arayüzü (chat-as-UI), MCP ve ajanlar

| No | Tarih | İstek (özet) | Karar | Bağlayıcı belge | Durum |
|---|---|---|---|---|---|
| K20 | 2026-09-28 | Yerel uygulamada chat-as-UI; MCP sürdürülebilir, önyüze eklenen yetenek MCP'ye de yansısın | Yetenek kaydı tek gerçek kaynak; yeni yetenek = kayıt + UI + MCP kararı + test + belge | ADR-0019, PLATFORM_BASELINE E8 | GEÇERLİ |
| K21 | 2026-10-01 | Chat-as-UI web uygulamasında ve backoffice'te de olsun; önyüz bir kez yazılsın (yerel uygulama dahil) | Tek önyüz paketi `@entegrasyonik/chat` (taşıyıcı soyutlaması: web, backoffice, yerel, mock). Tarayıcı MCP'ye doğrudan bağlanmaz: backend aracı (broker) oturum + RBAC + aynı yetenek kaydı. Yazma = onay kartı + denetim; LIVE_READONLY/bakım geçerli. Backoffice sohbeti izole | ADR-0034 (docs/adr/0034-ortak-sohbet-arayuzu.md), docs/cloud-contracts/CHAT_UI_CONTRACT.md, docs/AGENT_BROKER_PLAN.md | UYGULANIYOR |
| K36 | 2026-10-01 | Ayrı yerel uygulama yerine web'i masaüstünde açmak; bilgisayardaki belgelere erişim (telefonda kamera gibi) değerli → Electron | Ayrı yerel uygulama (Tauri) planı İPTAL. Masaüstü = mevcut Electron kabuğu aynı web derlemesini ve aynı sohbet arayüzünü (K21) gösterir; ayrı önyüz yok. Kabuk yalnız dar bir yerel köprü açar (contextIsolation, nodeIntegration kapalı, izinli klasörler, sohbetin yerel dosya erişimi onay kartıyla): klasör izleme/içe alma, doğrudan yazıcı, sistem bildirimi, izinli belgeleri okuma. Tek seferlik dosya seçimi tarayıcıda zaten var. Dış yapay zekâ araçları için MCP = uzak MCP sunucusu (OAuth). Kod imzalama/otomatik güncelleme maliyeti Protokol 12 | BACKLOG DESK-00..04; ADR-0019 ve sohbet ADR'si bu yönde güncellenir | GEÇERLİ (planlı, sonra) |
| K37 | 2026-10-01 | Chat-as-UI kullanıcının kendi belirlediği model ve abonelikle çalışacak | Entegrasyonik LLM aboneliği satmaz/karşılamaz. İki mod, aynı yetkiler + onay kartı + denetim: (a) uygulama içi sohbet = kullanıcının kendi API anahtarı (BYOK) + kendi seçtiği sağlayıcı/model; anahtar tenant (veya kullanıcı) ayarında AES-GCM şifreli, yanıtlarda maskeli; anahtar yoksa kurulum ekranı; maliyet kullanıcının sağlayıcı hesabında. (b) kendi yapay zekâ uygulaması + tüketici aboneliği = uzak MCP sunucusu (OAuth) üzerinden. Tüketici abonelikleri üçüncü taraf API'ye genelde açılmaz — (b) bunun yoludur | Sohbet ADR'si, docs/AGENT_BROKER_PLAN.md | GEÇERLİ |
| K38 | 2026-10-01 | K37 önerileri onaylandı | BYOK anahtarı TENANT düzeyinde (sahip/admin girer, tüm üyeler kullanır; kullanıcı düzeyi anahtar yok). İlk sağlayıcılar Anthropic + OpenAI + Google. Konuşma kaydı saklanmaz (oturum bellekte; kalıcı geçmiş ileride ayrı karar + KVKK saklama süresiyle) | Sohbet ADR'si | GEÇERLİ |
| K39 | 2026-10-01 | Ajan ürününün adı | **Otopilot** kesinleşti (site, uygulama, backoffice, sohbet; tek sabit) | K17 | GEÇERLİ |
| K40 | 2026-10-01 | Abonelik kuralları | Askıdaki (deneme bitmiş) müşteri deneme uzatılarak yeniden açılabilir; kartsız denemede iptal doğrudan uygulanır; deneme uzatma tek seferde ≤30 gün, toplam ≤60 gün | ADR-0008 (güncellenir), BO-B4 | GEÇERLİ |
| K41 | 2026-10-01 | Destek (impersonation) oturum süresi | 30 dakika, uzatılamaz (60 dk'dan düşürüldü) | ADR-0026 §4.9 (güncellenir) | GEÇERLİ |
| K42 | 2026-10-01 | Yeni tenant DB'lerinin izin listesi | Şimdilik değişmez (7 isim); canlı öncesi ayrıca karar | CLAUDE.md kural 2 | GEÇERLİ (canlı öncesi yeniden sorulacak) |
| K43 | 2026-10-01 | Site bir pazarlama/tanıtım sitesi: Otopilot'u 'erken erişim / geliştiriyoruz' diye değil hazır gibi sun; reklam dili; teknik terim yok | Sitede Otopilot kendinden emin reklam diliyle, şimdiki zamanla sunulur; 'erken erişim', 'geliştirme aşamasında', 'örnek görünüm / temsilî tasarım' etiketleri kalkar. ŞART (yanıltıcı reklam riski): site CANLIYA ALINMADAN önce her Otopilot vaadinin üründe karşılığı doğrulanır (yayın kapısı); CTA 'Demo talep edin / Hemen başlayın' | SITE_FEEDBACK_R3 | GEÇERLİ |
| K44 | 2026-10-01 | Nasıl yaptığımızı anlatma (ör. 'Açık standart: Model Context Protocol'); teknik görsel/açıklama yok | Sitede uygulama sırrı sayılabilecek teknik ayrıntı (protokol adları, mimari, veritabanı yapısı) anlatılmaz; fayda dili kullanılır | SITE_FEEDBACK_R3 | GEÇERLİ |
| K45 | 2026-10-01 | Ziyaretçiye 'müşteri' diye hitap etme; 'her müşteri için ayrı veritabanı' gibi alt seviye anlatım yok | Site ziyaretçiye 'siz / işletmeniz' diye hitap eder; güvenlik üst seviyeden anlatılır (ör. 'Verileriniz yalnızca size ait, izole ve şifreli ortamda') | SITE_FEEDBACK_R3 | GEÇERLİ |
| K46 | 2026-10-01 | Otopilot pakete dahil mi ekstra mı: pazar araştırması yap, sen karar ver | KARAR: Seçenek B — Otopilot her pakette DAHİL, ayrı AI ücreti/kredisi YOK (BYOK: yapay zekâ maliyeti kullanıcının kendi sağlayıcısında). Alt planlarda sınırlı: sohbetle sorgulama, rapor, insan onaylı öneri + günlük düşük eylem kotası; üst planlarda otonom/zamanlanmış ajanlar + yüksek kota. Sitede 'sınırsız/ücretsiz AI', kredi/token dili kullanılmaz. İlk 2-3 ay kullanım/yükseltme verisiyle gözden geçirilir (dönüşüm zayıfsa A: tümüne tam dahil) | docs/research/AGENTIC_PRICING_2026-10-01.md; BACKLOG CHAT-ENT-1 | GEÇERLİ |
| K47 | 2026-10-01 | MCP çalışmasını başlat | MCP fazı başlar (K06'nın 'review sonrası' kapısı kalktı; LIVE_READONLY ve entegrasyona yazma yasağı AYNEN geçerli). MCP = uzak MCP sunucusu (K36), aynı yetenek kaydı + aynı onay/denetim (ADR-0034); plan önce, kod CHAT-BR-2 sonrası | docs/MCP_PLAN.md, ADR-0035 (docs/adr/0035-uzak-mcp-sunucusu.md, Önerildi), docs/cloud-contracts/MCP_UI_CONTRACT.md, ADR-0019, ADR-0034 | UYGULANIYOR |
| K48 | 2026-10-01 | Bulut işleri bitince yeni görevler üret: site pazarlama/tanıtım + Entegrasyonik kimliği seviyesine; backoffice aynı; frontend'de bariz düzenlemeler ama site kadar özgür değil, uç durumlarda onaylı | Özerklik seviyeleri: SİTE ve BACKOFFICE = serbest (kendi planla-uygula-eleştir turları); FRONTEND UYGULAMASI = yalnız bariz düzeltmeler (tutarlılık, hizalama, açık hatalar, token dışı stil); akış/davranış/bilgi mimarisi değiştiren veya uç durum içeren her öneri `frontend/docs/PROPOSALS_PENDING.md`'ye yazılır ve kullanıcı onayı bekler | — | GEÇERLİ |
| K49 | 2026-10-01 | Önyüz review 3. tur; 'bunca yazışmadan sonra nasıl bir kimlik istediğim çıkmıştır, bütün uygulamayı buna göre değerlendir'; PROPOSALS_PENDING önerilerini yap | FR3 (18 madde) bulutta; PROPOSALS_PENDING önerileri onaylandı ve uygulanır; uygulama kimliği `frontend/docs/APP_IDENTITY.md`'de damıtılır ve tüm ekranlar ona göre denetlenir. Hareket tek kaynaktan (motion token), breadcrumb nötr chip | docs/cloud-contracts/FE_FEEDBACK_R3_2026-10-01.md | UYGULANIYOR |
| K50 | 2026-10-01 | Site review 4. tur: hero karşılama ekranı sade (bilgi kutuları hero dışına), Otopilot albenili + operasyon animasyonunda, planlarda Otopilot, güvenlik bilgisi güvenlik bölümünde, menü/fiyat/diğer entegrasyonlar/yetenek kümeleri premium, alt çizgili hover yok; site geneli kimlik denetimi + planlı site işleri | SITE_FEEDBACK_R4 (13 madde) bulutta; hover alt çizgisi site genelinde kaldırılır (tek kural) | docs/cloud-contracts/SITE_FEEDBACK_R4_2026-10-01.md | UYGULANIYOR |

## Operasyon, güvenlik ve bağımlılıklar

| No | Tarih | İstek (özet) | Karar | Bağlayıcı belge | Durum |
|---|---|---|---|---|---|
| K30 | 2026-09-30 | Barındırma: Cloudflare (DNS, R2) + Railway (backend) | entegrasyonik.com = site, app. = frontend, api. = backend, cdn. = R2; Railway otomatik dağıtım kapalı | ADR-0027, docs/DEPLOYMENT.md | GEÇERLİ |
| K31 | 2026-09-30 | Müşteri kullanıcı/yetki yönetimi baştan | Üyelik + rol modeli (operator/admin/owner), izin kataloğu | ADR-0028 | UYGULANIYOR |
| K32 | 2026-09-30 | Bildirim sistemi yeniden (backend + FE + backoffice) | Tek olay kataloğu, notify tek giriş, kanallar, tercihler, SSE | ADR-0029 | UYGULANIYOR |
| K33 | 2026-10-01 | xlsx bakımsız paket → exceljs | Onaylandı; sharp ve nodemailer testlerle yükseltilir | docs/DEPENDENCY_AUDIT_2026-10-01.md | UYGULANIYOR |
| K34 | 2026-09-30 | BACKLOG: backoffice WhatsApp, sosyal medya (Instagram, X, Facebook, YouTube), kampanya modülü | Ayrı kalemler + ortak sosyal kanal adaptörü; hukuk/Meta doğrulaması insan görevi | BACKLOG WA-*, SOC-*, CMP-* | GEÇERLİ (planlı) |
| K35 | 2026-10-01 | Android ve iOS uygulaması; native yazmadan, uygulama içinden web; telefon/tablet foto vb. özellikler olabilir; bakım maliyeti artmasın, 80/20, acelesi yok | Tek web kod tabanı. Önce PWA (kurulabilir, kamera `capture`, web push); mağaza gerekirse aynı derlemeyi saran ince Capacitor kabuğu (tetikleyicili). Native ekran yazılmaz. Öncelik düşük | BACKLOG MOB-00..05 | GEÇERLİ (planlı, sonra) |

## Kullanıcı kararı bekleyenler

| Konu | Öneri | Kaynak |
|---|---|---|
| Yeni tenant DB'lerinin izin listesine eklenmesi | Canlı öncesi karar (K42) | CLAUDE.md kural 2 |
| Sohbet: müşteri verisinin LLM sağlayıcısına gitmesi (KVKK yurt dışı aktarım, aydınlatma/açık rıza metni) | Hukuki görüş; o gelene kadar sohbet ayarında açık bilgilendirme + tenant sahibi onayı (sürümlü metin, onay denetime; metin değişince yeniden onay) | K37, K38, ADR-0034 Karar 9 / H2 |
| Sohbet: backoffice platform LLM anahtarı (hangi sağlayıcı/hesap; ücretli hesap Protokol 12) | Anahtar girilene kadar backoffice sohbeti kurulum ekranında kalır | ADR-0034 H4 |
