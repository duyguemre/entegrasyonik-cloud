# PLATFORM BASELINE — ortak altyapı çıtası (bağlayıcı)

Amaç: Entegrasyonik'te HER modül/ekran/uç, işlevi kadar aşağıdaki **kesişen konulara** (cross-cutting concerns) da doğru cevap vermelidir. Proje sahibinin talimatı (2026-09-28): *"genel altyapıları tarif etmeme gerek kalmasın; aklıma gelmeyen konular da olabilir, best practice'ler premium seviyede uygulansın."* Bu belge o beklentinin kalıcı karşılığıdır.

## Nasıl kullanılır
1. **Her görev** (yeni özellik, refaktör, ekran, adaptör) başlarken ilgili satırlar için "Uygulanır / Uygulanmaz (neden)" kararı verilir; bu karar ADR'ye veya commit/rapor notuna yazılır.
2. **Kabul kapısı (DoD):** `entegrasyonik-qa-verifier` bir görevi onaylarken bu listeyi (ilgili satırlar) kanıtla kontrol eder. Kanıtsız "var" sayılmaz.
3. **Yeni kesişen konu** aklımıza gelirse buraya eklenir (liste yaşayan bir belgedir); "listede yok" bir konuyu atlamak için gerekçe değildir.
4. **Çakışma kuralı:** Bu belge ADR-0011/0012/0014/0015/0016/0017/0030 ile çelişirse ADR kazanır; çelişki bu belgeye not düşülerek çözülür. Ayrıntılı tasarım ADR'lerdedir, burası **kontrol listesidir**.
5. **Aşırı mühendislik yok:** Çıta "her şeyi en ağır araçla yap" değil, "her konuda bilinçli ve kanıtlı karar ver" demektir. Mevcut hatlar korunur (Express+TS modüler monolit, çok-kiracılı Mongo, IntegrationEngine, Vue3+Vuetify3 token sistemi); ücretli üçüncü parti servis/hesap Protokol 12 kapsamındadır.

## A. Güvenilirlik ve operasyon
| # | Konu | Çıta |
|---|---|---|
| A1 | **Gözlemlenebilirlik** (ADR-0017) | Yapılandırılmış log (seviyeli, PII/sır maskeli), correlation/request id (HTTP→job→adaptör), metrik, sağlık; `console.*` yok (backend+frontend). |
| A2 | **Hata yönetimi** | Tek hata zarfı + hata kodu kataloğu (`IntegrationError` sözleşmesiyle uyumlu); kullanıcıya eyleme dönük mesaj + "destek kodu"; teknik ayrıntı yalnız log'da; sessiz yutma yok. |
| A3 | **Dayanıklılık** | Zaman aşımı, sınırlı yeniden deneme + jitter, devre kesici, idempotency anahtarı, DLQ; yazmada "sonuç belirsiz" durumu ayrı ele alınır. |
| A4 | **Zamanlanmış işler** | Tek soyutlama (son tur/süre/sonuç kaydı, heartbeat), çok-pod kilidi, Redis kapalıyken davranış tanımlı, sessiz ölü job tespiti. |
| A5 | **Yaşam döngüsü** | Graceful shutdown, readiness/liveness, başlangıç fail-fast (env doğrulama), durdurulabilir döngüler. |
| A6 | **Yedekleme / DR** | Yedek + doğrulanmış geri yükleme, RPO/RTO notu, migration'larda geri alma yolu (CLAUDE.md kural 3). |
| A7 | **Kapasite / performans** | Bütçe (bundle, Lighthouse, API p95), sayfalama zorunlu, N+1/tam koleksiyon taraması yok, indeks gerekçesi, önbellek anahtarında tenant (C3 dersi). |
| A8 | **Sürüm / göç** | Şema/veri göçleri dry-run varsayılan + yedek şartı; API/sözleşme değişikliğinde uyumluluk notu ve deprecation. |

## B. Güvenlik ve uyum
| # | Konu | Çıta |
|---|---|---|
| B1 | **Kimlik/yetki** | Sunucuda RBAC (`OPERATION_POLICY` varsayılan ret), FE yalnız yansıtır; IDOR testi her tenant-yüzlü uçta. |
| B2 | **Tenant izolasyonu** | `clientId` filtresi zorunlu, çapraz-tenant testi, önbellek/kuyruk/dosya anahtarlarında tenant. |
| B3 | **Girdi doğrulama** | Şema-tabanlı doğrulama (tip, uzunluk, izinli değerler), mass-assignment yok, dosya yükleme sınırları/tür doğrulama. |
| B4 | **Gizli yönetimi** | Sırlar yalnız env/şifreli alan; kaynakta/loglarda/API yanıtında yok (`'sensitive'` sözleşmesi); rotasyon yolu. |
| B5 | **Web güvenliği** | Güvenlik başlıkları/CSP, CORS izinli liste, çerez bayrakları, Origin/Referer doğrulama, XSS (`v-html` yasağı/temizleme), açık yönlendirme yok. |
| B6 | **Kötüye kullanım** | Rate limit (IP+hesap), kaba kuvvet koruması, kayıt/parola sıfırlama numaralandırma yok, kota. |
| B7 | **Denetim izi** | Güvenlik ve veri değiştiren eylemler `AuditLogs`'a (kim/ne/ne zaman/tenant), PII'siz; okunabilir ekran. Kapsam ve önce/sonra kuralı: F7. |
| B8 | **KVKK / veri yaşam döngüsü** | Veri envanteri, dışa aktarma/silme/anonimleştirme, saklama süreleri (TTL), rıza kaydı, aydınlatma metinleri; canlı müşteri verisi maskeli (C13). |
| B8a | **İstemci platformu / kullanım ölçümü** (MOB-08, K55) | Platform sınıfı yalnız `X-Client-Platform` (tek kaynak `@entegrasyonik/ui/platform` ↔ `platform/core/context/clientPlatform.ts`), UA yalnız sunucuda kaba yedek ve **saklanmaz**; kayıtlara yalnız sınıf (`desktop_web/electron/mobile_web/pwa/android_app/unknown`) girer. Aktif kullanım `UsageDaily` (gün+tenant+platform, takma kimlik `sha256(sub)`[:16], 180 gün TTL); IP/UA/ham kimlik yok; impersonation ve platform yöneticisi sayılmaz. Yeni kullanım boyutu bu kalıba uyar (`docs/API_BACKOFFICE_USAGE.md`). |
| B9 | **Bağımlılık/lisans** | `npm audit` eşiği, lisans taraması (GPL/AGPL yasak; CKEditor kararı bekliyor), kullanılmayan bağımlılık temizliği. |
| B10 | **Oturum/hesap** | Parola politikası, `tokenVersion` ile oturum iptali, 2FA yolu (P1), e-posta doğrulama. |

## C. Ürün kalitesi ve deneyim
| # | Konu | Çıta |
|---|---|---|
| C1 | **Tasarım sistemi** (ADR-0015) | Yalnız token; "tek iş = tek desen" şablonları; şablon dışı kullanım gerekçeli; desen mandalı. |
| C2 | **Durumlar** | Her ekran: yükleniyor (skeleton), boş (eyleme dönük), hata (yeniden dene + destek kodu), yetkisiz, salt-okunur, kısmi başarı. |
| C3 | **Erişilebilirlik** | WCAG 2.1 AA, klavye, odak yönetimi, ekran okuyucu etiketleri, `prefers-reduced-motion`, kontrast hesaplı. |
| C4 | **Hareket** | 150–250 ms geri bildirim, zıplama/overshoot yok; site/pazarlama yüzeyinde daha zengin ama durdurulabilir. |
| C5 | **i18n / yerelleştirme** | Tüm metinler i18n anahtarı (TR birincil, EN); tek tarih/para/sayı biçimlendirici (`format.ts`: TRY, `tr-TR`, saat dilimi Europe/Istanbul, KDV ayrımı); çoğul/Türkçe büyük-küçük harf (İ/ı) tuzakları. |
| C6 | **Duyarlılık** | 375/800/1280 doğrulanır; yatay taşma yok; dokunma hedefleri. |
| C7 | **Mikro-kopya** | Sade Türkçe, eylem odaklı; hata mesajı suçlamaz; doğrulanmamış iddia yok (dürüstlük ilkesi, `claims` testi). |
| C8 | **Onboarding / yardım** | Boş durumdan ilk değere giden rehber, bağlamsal yardım, destek kanalı, değişiklik duyuruları. |
| C9 | **Toplu işlem / verimlilik** | Filtre, kayıtlı görünüm, toplu eylem, klavye kısayolu, dışa aktarma; geri alma/onay (yıkıcı eylemde). |
| C10 | **Bildirim** | Uygulama içi + e-posta; tercih, gruplama, bastırma; kritik olaylar (aşırı satış, entegrasyon kopması, ödeme). |

## D. Mühendislik disiplini
| # | Konu | Çıta |
|---|---|---|
| D1 | **Test piramidi** | Karakterizasyon (Protokol 13) → birim → sözleşme → e2e; kritik iş kuralı için kanıtlı test; flaky test tolere edilmez; gerçek DB/ağ gerektiren testler ayrı işaretli. |
| D2 | **Kalite kapıları/CI** | tsc, lint/format, mandallar (tip hatası, stil, desen, console), test, audit, build boyutu; yerel `npm run verify` benzeri tek komut. |
| D3 | **Modülerlik** | Alan-bazlı klasörleme, katman yönü (api→service→operations→database), circular import yok, dev sınıf/bileşen bölünür, ortak mantık composable/servis. |
| D4 | **Yapılandırma** | Tek doğrulanmış config modülü/şeması; hardcoded URL/ID/sihirli sayı yok; ortam ayrımı (local/staging/prod). |
| D5 | **API sözleşmesi** | Tutarlı istek/yanıt/hata biçimi, sayfalama/filtre standardı, sürümleme, OpenAPI/`docs/API_*.md`. |
| D6 | **Belgeleme** | ADR (karar), `MASTER_STATE`/`BACKLOG` (durum), API sözleşmesi, runbook (operasyon), değişiklik günlüğü; commit formatı `ai-native-docs-format`. |
| D7 | **Temizlik** | Ölü kod/dosya/bağımlılık silinir (kanıtlı, referanssız); yorumlu kod bırakılmaz; kopya bileşen birleştirilir. |
| D8 | **Geliştirici deneyimi** | Tek komutla kurulum/çalıştırma, `.env.example` güncel, mock modu fail-closed (C19), seed/test verisi, egress guard. |
| D9 | **Git hijyeni** | Yol yol `git add`, sır/`.env`/`backup/` asla; küçük geri alınabilir commit'ler; yeniden-iş yaratmayan sıra. |

## E. Ürün/iş kesişenleri
| # | Konu | Çıta |
|---|---|---|
| E1 | **Plan / kota / yetkilendirme** | Özellik ve limit `EntitlementService` üzerinden; guard'lar API+Engine'e bağlı; durum makinesi (trial→askı) görünür. |
| E2 | **Faturalama & muhasebe** | Vergi (KDV) doğru gösterim, fatura/makbuz geçmişi, dunning bildirimi; gerçek para Protokol 12. |
| E3 | **Entegrasyon dürüstlüğü** | Kapsam sınırı UI'da görünür; "sahte başarı" yok (C9 dersi); mock/gerçek mod açıkça ayrı. |
| E4 | **Ürün analitiği** | Yalnız rıza + çerezsiz/PII'siz ilkeyle (site "çerezsiz" beyanı korunur); ücretli araç Protokol 12. |
| E5 | **Destek/operasyon araçları** | Tenant destek görünümü (yetkili, denetimli), sistem durumu, yeniden deneme/DLQ araçları. |
| E6 | **Genişleme noktaları** | Genel API/API anahtarı, giden webhook, otomasyon kuralları — imzalı, idempotent, sürümlü, rate limit'li. |
| E7 | **Yasal/marka** | Yasal metinler insan onayı (Protokol 12), marka/logo tutarlılığı (site↔uygulama drift testi), üçüncü taraf marka kullanımı izni. |
| E8 | **Yetenek eşitliği (UI ↔ MCP/chat)** | Yeni yetenek = **yetenek kaydı + UI + MCP kararı (`exposed`/`notExposed(gerekçe)`) + test + belge**; aksi halde kabul edilmez. Yetenek tek kayıttan tanımlanır (ADR-0019); parite kapısı (mandal) yetim/unutulmuş yeteneği yakalar; ajan yüzeyi (ADR-0018) aynı kaydın izin boyutudur. |

## F. Yatay kesen platform yetenekleri (ADR-0030; boşluk analizi `docs/audits/CROSS_CUTTING_GAP_2026-09-30.md`)
İlke: **astar yüzü geçmez.** Bugünkü ölçek (tek haneli tenant, tek replika, tek bölge) için orantılı. Büyük altyapı yalnız ADR-0030'daki sayısal tetikleyiciyle gelir.
| # | Konu | Çıta |
|---|---|---|
| F1 | **Kiracı çözümleme** | Tenant yalnız doğrulanmış principal'dan (istek) veya kuyruk verisinden (iş) gelir. İş, ALS'e `tenantId` ile girer (`runWithJobContext`). Yeni kuyruk/iş türü, tüketimde tenant durumunu (ACTIVE) doğrular (X7 tetikleyicisi). Önbellek/kuyruk/dosya anahtarında tenant bulunur (B2). |
| F2 | **Giden kota** | Dış API çağrısı yalnız `ResilientHttpClient` üzerinden yapılır. Sağlayıcının belgelediği grup limitleri varsa çağrı bir `group`'a eşlenir (Trendyol: ürün okuma/yazma, stok-fiyat, sipariş…). Stok/fiyat yazımı içerik/okuma ile aynı kovayı paylaşmaz. 429'da `Retry-After` beklenir, yalnız ilgili grup yavaşlar. Yeni adaptörde limit bilinmiyorsa "0 = sınırsız" açıkça gerekçelendirilir. |
| F3 | **Gelen kota** | Kimlik anahtarlı genel limit + hassas uçlarda ayrı kova (bugün süreç içi). Genel API anahtarı/MCP/2. replika gelince Redis token bucket + plan kotası (X9). |
| F4 | **Tek hata zarfı her yolda** | Tüm `/api` ve `/admin-api` yanıtları `{error, code?, requestId, fields?}` biçimindedir. Ham `res.status().send` yazılmaz. Express son hata işleyicisi ve 404 de JSON döner. Yeni hata kodu `codes.ts` kataloğuna eklenir, silinmez. |
| F5 | **Stok değişikliği = yayın olayı** | Bir varyantın satılabilir miktarını (`stock`) değiştiren HER yazma yolu tek yardımcıdan geçer ve `stockDirty/stockDirtyAt` yazar (outbox bayrağı). Motor alanları (`reserved/allocations/stockVersion/stockDirty`) istemci gövdesinden yazılmaz. Zero-oversell'de Mongo transaction kullanılmaz: tek belge koşullu atomik + idempotent anahtar + mutabakat (ADR-0004). |
| F6 | **Idempotency** | Dış etkili (`external:true`) ve `effect!=='read'` yazma RPC'leri `Idempotency-Key` kabul eder (tid+sub kapsamlı, 24 sa). Olay/bildirim/webhook tüketicileri doğal anahtarla tekilleştirir. Motor içi geçişler idempotent anahtar taşır. |
| F7 | **Denetim kapsamı** | `effect!=='read'` her yazma yetenek kaydından otomatik denetlenir (app + backoffice). Önce/sonra yalnız dar alan listesinde tutulur (stok, fiyat, stok politikası). Sır/kimlik bilgisinde yalnız `'changed'`. Gövde/PII yazılmaz. Toplu işlem tek kayıt + sayı. Audit hatası isteği düşürmez. |
| F8 | **Girdi şeması** | Yeni yazma RPC'si şemasız eklenemez (`rpc-input-baseline.json` yalnız azalır). Üst düzey `.strict()`, iç içe allow-list. Dış etkili yazmalar önceliklidir. Yanıt şeması sözleşme testiyle doğrulanır (çalışma anında değil). |
| F9 | **İz ve SLO** | correlationId HTTP→kuyruk→adaptör→ajan zincirinde korunur ve pazaryerine gönderilmez. Kritik iş akışları bir gecikme metriği taşır (`stock_publish_lag_ms`, sipariş çekme gecikmesi). SLO: stok yayını p95 ≤ 2 dk, sipariş çekme p95 ≤ 3 dk. Alarm ADR-0017 Aşama C'dedir. OTel/Prometheus yalnız ADR-0017 eşiğinde. |
| F10 | **Durdurma anahtarı** | Dış sisteme iş üreten her motor bileşeni entegrasyon `intake` durumuna (on/drain/off, ADR-0020) uyar. Okunmayan kill-switch "var" sayılmaz. |
| F11 | **Bozulma davranışı** | Her bağımlılık (Redis, Mongo, pazaryeri) için "yoksa ne olur" tanımlı ve testlidir. Güvenlik/para yolları fail-closed, gözlem yolları fail-open çalışır ve loglanır. |
| F12 | **Tetikleyici disiplini** | Dağıtık limiter, pub/sub invalidation, outbox, transaction, OTel, API sürümü, bakım modu ancak ADR-0030'daki sayısal tetikleyici gerçekleşince kurulur. Tetikleyici gelince ilgili X paketleri birlikte açılır. |

## Görev başına mini kontrol (kopyala-yapıştır)
```
Baseline kontrolü: A(güvenilirlik) [ ] B(güvenlik/uyum) [ ] C(deneyim) [ ] D(disiplin) [ ] E(ürün) [ ] F(yatay kesen, ADR-0030)
Uygulanmayan satırlar + gerekçe: ...
Kanıt (test/komut/ekran görüntüsü): ...
```
