# BE-COM08 raporu (bulut, 2026-10-01)

Dal `cloud/be-com08`, taban `origin/main` 4f09905 (faz3-arayuz @ 487e2869, INT-1001 birleşimi dahil). Commit önekleri `be-com08-cloud:`.
DB/Redis/.env'e bağlanılmadı, backend çalıştırılmadı, göç çalıştırılmadı. `docs/adr/` ve kök dosyalar (BACKLOG.md, MASTER_STATE.md, CLAUDE.md) değiştirilmedi.

## 1. Kalem başına durum

| Kalem | Durum | Özet |
|---|---|---|
| GÖREV 1 — COM-08 komisyon değişim uyarısı | **yapıldı** | Koddan doğrulandı: sapma hesabı/bildirimi yoktu (BACKLOG `nice-to-have`, açık). Aşağıda §2 |
| GÖREV 2 — RET-02 AuditLogs IP maskeleme | **yapıldı** | Koddan doğrulandı: maskeleme yoktu (BACKLOG `açık`). Göç 0024 yazıldı, ÇALIŞTIRILMADI. §3 |
| GÖREV 3 — operation-policy FE envanteri 5 kırmızı | **yalnız analiz** | Düzeltme yapılmadı. §4 |

## 2. COM-08 — tasarım

**Akış:** `getRealizedCommissionByCategory` (COM-03, kategori başına gerçekleşen oran) → kategori başına **referans** = tenant override (COM-04; kategori > kanal varsayılanı) yoksa statik kanal tablosu (`getLocalCategoryCommission`) → saf karar `evaluateDrift`:
- `|gerçekleşen − referans| ≥ eşik` → `drift`; altında `ok`; referans yok → `no_reference`; `sampleCount < 5` → `insufficient_samples` (gürültü kapısı). Gerçek %0 referans korunur (yalnız `null` = referans yok).

**Bildirim (ADR-0029):** yeni katalog kodu `COMMISSION_RATE_DRIFT` (finance, warning, zorunlu değil, inApp + e-posta özeti, `finance:read`, admin yedeği, saklama `long`, rota `/finance`).
- **Tekrar bastırma:** katalog `dedupeKey = integ:categoryId:YYYY-MM`. Aynı kanal + kategori için takvim ayında (Europe/Istanbul) en çok bir bildirim. Defter idempotency'si kullanılır, yeni mekanizma yok.
- **Toplama:** `group` = kanal, 24 sa. Bayat tablo çok kategoriyi birden etkiler; zilde tek kayıtta toplanır.
- **Makinece okunabilir params:** `{integ, categoryId, realizedRate, referenceRate, referenceSource: 'override'|'estimated', deltaPoints, thresholdPoints, sampleCount, window}`. Zod `.strict()` şeması var; PII yok.
- Şablonlar TR/EN eklendi.

**Zamanlayıcı:** `finance.commissionDrift`. Günlük, `runOnStart:'ifDue'`, worker rolü, scheduler lease (dağıtık kilit), 15 dk süre sınırı.
- `NOTIFY_V2_ENABLED=false` iken DB'ye hiç dokunmadan döner (`skipped:'notify_disabled'`).
- Tenant hatası izole edilir (`failedTenants`). Kanal başına tur üst sınırı 20 bildirimdir.
- Kanal listesi `DRIFT_CHANNELS = ['trendyol']`: yalnız Trendyol hakedişi oran taşır. COM-05/06 spike'ları sonrası genişler.
- LIVE_READONLY'de başlamaz (varsayılan liste dışı).

**Ajan-hazırlık (ADR-0018 vizyonu):** sapma olayı iki yerden makinece okunur:
- bildirim defterindeki yapılandırılmış params;
- yeni salt okuma RPC `FinancialService/getCommissionDrift` (yetenek `finance.commission.drift`, member / `finance:read`, `mcp: deferred`, `agent: NO_AGENT`; finans kardeşleriyle aynı). Sabit alan adları ve `status` enum'u taşır; sözleşme `docs/API_TENANT_SURFACE.md §10.1`.

`IntegrationFinding`'e yeni `kind` eklenmedi: bu, ADR-0018 model değişikliği olurdu ve ADR salt okunur (bkz. §6).

**Yapılandırma ve ADR-0031 karar notu:** eşik `finance.commissionDriftThresholdPoints`. Kanal kapsamlı ADR-0020 ayarıdır (`scope:'integration'`, grup `order.support`, varsayılan `{_: 2}` puan, şema 0,5–50, güvenli aralık 1–10).
- **`_platform` hedefi DEĞİL**, bu yüzden ADR-0031'in `platform.*` tavanlarına (pricing 15/15, alerts ≤15, diğer ≤25) girmez. Mevcut COM-07 `finance.*` kesinti anahtarlarıyla aynı yerde durur.
- Eşik kanala göre farklılaşabilir: Trendyol oranlarının KDV dahil/hariç belirsizliği tek başına ~%20 göreli fark üretir.
- Asgari örnek sayısı (5), pencere (30 gün), ay penceresi ve tur üst sınırı (20) **kod sabiti** bırakıldı. Gerekçe: K03 ve ayar tavanı. Ayara taşımak gerekirse aynı `finance.*` grubuna eklenir.

**Değişen/yeni dosyalar (COM-08):**
- yeni: `src/operations/finance/commissionDrift.ts`, `src/operations/finance/commissionDriftJob.ts`, `tests/characterization/financial-service/CommissionDrift.com08.test.ts`
- `src/operations/notifications/catalog.ts`, `templates/tr.ts`, `templates/en.ts`, `tests/unit/notifications/catalog.test.ts` (36→37 tenant kodu), `notification-catalog-baseline.json`
- `src/integration/config/catalog/finance.ts` (yeni anahtar)
- `src/api/rpc/handlers/financial-service.ts`, `src/capabilities/domains/finance.ts`, `src/capabilities/capability-baseline.json` (+1 toplam/yetim/ertelenmiş/notExposed; PRC partisindeki emsal gibi), `tests/characterization/auth/{operationPolicy.snapshot.ts, operation-policy.test.ts (BACKEND_ONLY listesine), permission-parity.test.ts (207→208 / 311→312)}`
- `src/bootstrap/schedules.ts`, `tests/unit/bootstrap/schedules.characterization.test.ts`
- yeniden üretildi: `docs/CAPABILITIES.md`, `docs/CAPABILITIES_CHANGELOG.md`, `backend/generated/capabilities.manifest.json` (`node dev-tools/capabilities-docs.js`, 300 yetenek)
- belge: `docs/NOTIFICATION_PLAN.md` (katalog satırı), `docs/API_TENANT_SURFACE.md §10.1`

## 3. RET-02 — tasarım

- **İş:** `retention.auditIpMask` (`src/operations/retention/auditIpMask.ts`). Günlük, `ifDue`, worker rolü, scheduler lease (dağıtık kilit), 15 dk süre sınırı.
- **Maskeleme:** `at < şimdi − 90 gün` ve `ip` alanı olan kayıtta `ip` **kaldırılır**, ağ öneki `ipMasked`'a yazılır.
  - IPv4 → `a.b.c.0/24`; IPv6 → `h1:h2:h3::/48`; IPv4-eşlenik IPv6 IPv4 gibi işlenir.
  - Çözülemeyen değer `unknown` olur; ham değer saklanmaz.
- **İdempotent ve toplu:** bekleyen kayıt = `ip` alanı olan kayıt.
  - Tarama `(at, _id)` keyset ile sayfalanır, 500'lük sayfa başına tek `bulkWrite` (`ordered:false`) yapılır.
  - Tur üst sınırı 200 sayfadır (100k kayıt); kalan sonraki turda işlenir (`more:true`).
  - Güncelleme filtresi `{_id, ip: okunan}` olduğundan yarış güvenlidir.
  - Kısmi hata `failed` sayılır, `ip` korunur, sonraki tur yeniden dener.
  - İptal sinyali ve heartbeat desteklenir.
- **365 gün TTL ile uyum:** `at` ve `at_1` TTL indeksine dokunulmaz; kayıt 365. günde aynen silinir.
- **Okuyucu:** backoffice denetim listesi (`BackofficeAuditService/list`) artık `ip: ip ?? ipMasked` ve `ipMasked: boolean` döndürür. `AuditView.vue` önek dizesini olduğu gibi gösterir, FE değişikliği gerekmez.
  - Bu davranış önce karakterizasyon testiyle sabitlendi: ham ip aynen, yoksa `null`.
- **Göç 0024** `0024-audit-ip-mask-pending-app` (app / index, **ÇALIŞTIRILMADI**). `AuditLogs` kısmi indeksi `ret02_ip_pending` = `{at:1,_id:1}`, partial `{ip:{$exists:true}}`.
  - Maskelenen kayıt indeksten düşer; iş her turda yalnız bekleyenleri tarar.
  - İndeks yokken iş yine çalışır (`at_1` ile, daha çok tarama).
  - `down` yalnız indeksi düşürür; maskeleme bilerek geri alınamaz.
  - Kanonik beyan `models/AuditLog.ts`'te. Manifest yeniden üretildi (`node dev-tools/generate-index-manifest.js`). `docs/MIGRATIONS.md`'ye satır eklendi.
  - Not: `AuditLogs` şeması `autoIndex:false` değil; `config.db.autoIndex` açık bir ortamda indeks uygulama açılışında kurulur (`tid_1_at_-1` ile aynı mevcut durum).

**Değişen/yeni dosyalar (RET-02):**
- yeni: `src/operations/retention/auditIpMask.ts`, `migrations/0024-audit-ip-mask-pending-app.js`, `tests/unit/retention/auditIpMask.test.ts`
- `src/database/application/models/AuditLog.ts`, `migrations/index-manifest.json`, `src/api/rpc/handlers/backoffice-audit-service.ts`, `tests/unit/api/admin/backofficeLogsAudit.test.ts`, `src/bootstrap/schedules.ts`, `tests/unit/bootstrap/schedules.characterization.test.ts`, `docs/MIGRATIONS.md`

## 4. GÖREV 3 — `operation-policy` FE envanteri: 5 kırmızının analizi (düzeltme YOK)

Not: 2. ve 4. testler döngüde **ilk** uyumsuz öğede durur. Tam liste aşağıdaki düz metin taramasıyla çıkarıldı. Bu tarama yaklaşıktır: testin AST tarayıcısı sarmalayıcı (`post(rpc,…)`) çağrılarını "dinamik" sayabilir. Bu dalda eklenen `getCommissionDrift` bu kırmızılara **yeni öğe eklemedi**; sayı 5'te kaldı.

| # | Test | Fark | Kök neden | Seçenekler (öneri **kalın**) |
|---|---|---|---|---|
| 1 | FE'nin çağırdığı her operasyon kayıtta | `IntegrationService/retrieveCategories` | **Yanlış pozitif.** Gerçek çağrı yok. `views/dev/design-system/DsFeedback.vue:19` tasarım sistemi demosunda örnek hata ayrıntısı olarak düz metin geçiyor. Backend metodu `retrieveCategoriesFromIntegration` (kayıtlı) | (a) **FE'den kaldır**: demo metnini kayıtlı bir adla (`IntegrationService/retrieveCategoriesFromIntegration`) ya da RPC biçiminde olmayan bir örnekle değiştir; (b) tarayıcıdan `views/dev/**` hariç tut; (c) bilinen listeye al (önerilmez: gerçek olmayan çağrıyı kalıcı kılar) |
| 2 | "backend karşılığı olmayan" liste güncel | `SecurityService/getCaptcha` artık FE'de yok. Aynı durumda `ImageApi/getImage`, `ImageApi/downloadImage` (düz metin taramasında FE'de geçmiyor; test ImageApi'yi ayrıca ele alıyor olabilir, yerelde doğrula) | FE temizliği yapıldı (WP-A5 notu: "FE temizliği bulut görevi" tamamlanmış) | **Listeden çıkar** (`FE_CALLS_WITHOUT_BACKEND`): FE'den silinen çağrı listeden düşmeli; test tasarımı tam bunu istiyor |
| 3 | Kayıtta FE'nin çağırmadığı operasyon yok | `VariantService/{addVariant, addVariants, batchProcessUpdate, batchProcessDelete, updateVariants}` | d9160ff senkronunda varyant düzenleyicisi yeniden tasarlandı (grid/`VariantBulkEditor`); eski 5 çağrı FE'den kalktı, yalnız `getVariants(List)` ve `deleteVariant` kaldı | Önce **ürün kararı/doğrulama**: varyant ekleme/toplu güncelleme artık başka yoldan mı (ör. ürün kaydıyla) gidiyor? (a) Evet → **kayıttan kaldır** (yetenek `catalog.ts:121/126/132` bağları + `rpc-input/catalog.ts` şemaları; saldırı yüzeyi daralır); (b) FE ileride kullanacak → `BACKEND_ONLY_NOT_YET_IN_FE` listesine gerekçeyle al; (c) gerileme ise → FE'ye geri bağla (en düşük olasılık; varyant düzenleme yerelde denenmeli) |
| 4 | `BACKEND_ONLY_NOT_YET_IN_FE` güncel | İlk öğe `UserService/inviteUser`. Düz metin taramasına göre FE artık şunları da çağırıyor: `UserService/{resendInvitation, revokeInvitation, listInvitations, suspendUser, reactivateUser, initiateOwnershipTransfer, cancelOwnershipTransfer, acceptOwnershipTransfer}`, `AccountService/reauthenticate`, `CustomerService/anonymizeCustomer`, `IntegrationService/{generateWebhookToken, getIntegrationHealth, getCatalog}`, `StockService/getStockOverview`, `AuditService/getAuditLogs`, `FinancialService/{getFinancialSummary, getCargoInvoices, getPayoutDetails}`, `NotificationService/{getUnreadCount, getCatalog, getPreferences, updatePreferences}` | Bulut FE işleri (ekip, bildirim merkezi, panolar) bu uçları bağladı; liste geride kaldı | **Listeden çıkar** (FE bağlandı = artık backend-only değil). Yetenek kayıtlarında `ui: noUi(NEVER_CALLED)` olanlar `onScreens(...)` yapılmalı; bu P6 yetim sayacını düşürür. Liste, testin AST çıktısıyla yerelde kesinleştirilmeli |
| 5 | Dinamik ilk argümanlı çağrılar yalnız çözülmüş dosyalarda | `components/dashboard/useDashboardResource.ts`, `composables/useIntegrationError.ts`, `composables/useTeamApi.ts` | Yeni sarmalayıcılar `restApi.post(rpc, …)` değişkenli çağrı yapıyor. `useTeamApi` tüm RPC'leri dosya içinde düz sabitle veriyor. `useDashboardResource` RPC'yi çağıranın sabitinden alıyor. `useIntegrationError` yalnız yorumda `restApi.post` geçiyor (gerçek çağrı yok olabilir) | **Listeye al** (`DYNAMIC_CALL_FILES_RESOLVED`): her dosya için çağrı sitelerindeki sabitler elle doğrulanıp yorumla eklenir (mevcut desen). `useIntegrationError` için önce tarayıcının yorum satırını yakalayıp yakalamadığına bakılmalı; yakalıyorsa yorumu yeniden ifade etmek (FE) daha temiz |

## 5. Test sonuçları (bulut, TZ=Europe/Istanbul)

| Kontrol | Sonuç |
|---|---|
| `npm run build` | ✅ |
| `npm run typecheck` | ✅ 0 hata |
| `npm run lint` | ✅ 0 hata (180 uyarı, tabanda da var); değişen/yeni dosyalarda 0 uyarı |
| `npm run depcruise` | ✅ 0 hata, 3 uyarı (mevcut `interfaces` döngüsü; değişmedi) |
| `npm run ratchet` | ❌ yalnız `knip exports 20 → 22`. **Tabanda da 22** (INT_1001_REPORT §8). 22 öğenin hiçbiri bu dalda eklenmedi (liste kontrol edildi: `kidOf`, `getActiveKid`, `LOG_TTL_DAYS`…). Bulutta knip'in linux yerel bağı eksikti; `npm i --no-save --no-package-lock @oxc-parser/binding-linux-x64-gnu@0.150.0` ile yalnız `node_modules`'a kuruldu, lockfile değişmedi |
| `node dev-tools/capabilities-docs.js` | ✅ 300 yetenek; docs + manifest yeniden üretildi |
| Yeni/ilgili modüller | retention 9/9, financial-service 94/94 (COM-08 15 yeni), bootstrap 25/25, notifications + config 400/400, backofficeLogsAudit 10/10, capabilities + auth parite (capability-parity, permission-parity) yeşil |
| **Tam jest** | 473 suite: 450 geçti, 23 kaldı. 7842 test: 7533 geçti, 309 kaldı. **Taban (değişiklik öncesi main): 471 suite / 23 kaldı, 7816 test / 309 kaldı.** +2 suite / +26 test, hepsi yeşil; yeni kırmızı yok |

Kalan 23 kırmızı suite'in hepsi taban kaynaklı:
- **mongo-semantics, 20 suite / 302 test:** `mongodb-memory-server` ikilisi indirilemiyor (fastdl.mongodb.org 403, ağ politikası). **Bu ortamda koşmadı.** Göç 0024'ün gerçek Mongo kanıtı (kısmi indeks + `$exists` planı) yerelde `npm run test:integration:mocked` ile alınmalı.
- **`operation-policy` (5):** §4.
- **`integrationPlaybook.static` (1):** kökteki `INTEGRATIONS_REGISTRY.md` bulut kopyasında yok.
- **`MockCheckoutApiManager` (1, kararsız):** tam koşuda bir kez kırmızı, tek başına 26/26 yeşil (iki kez), taban commit'inde de tek başına yeşil. Bu dalın dokunmadığı modül; yük altında zamanlama kaynaklı görünüyor. Yerelde gözlenmeli.

## 6. Kullanıcı/ADR kararı bekleyenler

1. **COM-08 eşik değeri:** varsayılan 2 puan ölçülmedi. İlk ay bildirimleri gözlenip ayarlanmalı (yeniden başlatmasız ayar, backoffice motor ayarları).
2. **COM-08 ve ADR-0018 `IntegrationFinding`:** komisyon tablosu bayatlığı platform düzeyinde bir drift'tir; birden çok tenant'ta aynı kategori sapıyorsa tek bir platform bulgusu anlamlı olur.
   - Bunun için ADR-0018 bulgu modeline yeni bir `kind` gerekir (ör. `'data'`/`'commission'`). Bu bir ADR değişikliği olduğundan yapılmadı.
   - Öneri: ≥2 tenant aynı kategori sapmasını gösterene kadar ertelensin (K03).
3. **`getCommissionDrift` ajan/MCP açılışı:** finans araç seti kademe kararıyla birlikte verilmeli (mevcut `NOTE`).
4. **RET-02:** maskeleme biçimi (/24 ve /48) ve 90 günlük eşik için RET-03 hukukçu teyidi. Göç 0024 yedek + onayla uygulanmalı (önce yerel, Atlas ayrı onay).
5. **FE (K48 sınırında, bu dalda yapılmadı):**
   - `frontend/src/stores/notificationCatalog.ts` aynası `COMMISSION_RATE_DRIFT` (ve önceki `BUYBOX_LOST`/`PRICE_RULE_PAUSED`) etiketlerini taşımıyor.
   - `/finance` ekranında sapma rozeti için §10.1 sözleşmesi hazır.

## 7. Kök dosya değişiklik istekleri (uygulanmadı — yerel orkestratör için)

- **BACKLOG.md COM-08:** durum `kapalı (kod)`. Kapanış notu: `COMMISSION_RATE_DRIFT` + `finance.commissionDrift` (günlük) + `FinancialService/getCommissionDrift` + eşik `finance.commissionDriftThresholdPoints` (2 puan). Açık kalanlar: FE rozeti, `IntegrationFinding` kind kararı, HB/N11/Pazarama (COM-05/06 sonrası `DRIFT_CHANNELS`).
- **BACKLOG.md RET-02:** durum `kod hazır (2026-10-01, be-com08)`. Not: `retention.auditIpMask` + göç `0024-audit-ip-mask-pending-app` (ÇALIŞTIRILMADI, yedek + onay bekliyor).
- **BACKLOG.md göç notları satırı (≈529):** 0024'ün uygulanma durumu eklenmeli.
- **MASTER_STATE.md:** iki yeni zamanlayıcı işi (`finance.commissionDrift`, `retention.auditIpMask`) ve göç 0024 (çalıştırılmadı).
- **CLAUDE.md:** değişiklik isteği yok.
