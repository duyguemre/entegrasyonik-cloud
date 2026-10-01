# P4 raporu — ADR-0024 Dalga 4 P4-GATE + ADR-0029 NB8 kalanları + `src/api/**` console temizliği (bulut, `cloud/be-p4`)

Taban: `origin/cloud/be-p3b` @ `a6ad421b` (P3B_REPORT, `cloud/be-p3a` dahil). NB8 ve console işleri tabandaki P3B tamamlanmadan
başlatıldı; sonunda be-p3b birleştirildi (`1baefd42`), çakışan 15 handler'da be-p3b sürümü alınıp console dönüşümü yeniden
uygulandı ve tüm kapılar birleşik hâlde yeniden koşuldu. DB/göç/Redis çalıştırılmadı.

## 1. P4-GATE — kilitlenen kurallar

**`.dependency-cruiser.cjs` → `error` (0 ihlal):**

| Kural | Önce | Sonra |
|---|---|---|
| `lower-layers-not-to-api` | warn | **error** |
| `adapters-not-to-operations` | warn | **error** |
| `database-not-to-upper-layers` | warn | **error** |
| `leaf-layers-not-to-upper` | warn | **error** |
| `platform-not-to-api`, `services-not-to-operations`, `operations-not-to-engine`, `bootstrap-only-from-entrypoint` | error | error (değişmedi) |

**Sıfıra inmeyen (warn kalan):** `no-circular` — 3 ihlal (`interfaces/index.ts ↔ interfaces/platforms/index.ts` iki barrel
döngüsü, `platform/runtime/metrics/errorEvents.ts ↔ prodDeps.ts`). Baseline'da mandallı; sıfırlanınca `error`.

**`quality/check-ratchets.js` yeni `handlers` ölçümü** (baseline P3B son değeriyle kilitlendi):
- `src/api/rpc/handlers/**` dosya başına satır, yalnız 400'ü aşanlar: **2 dosya** (yeni handler 400'ü aşamaz, aşan büyüyemez).
  P3 öncesi 8 dosyaydı.
- Dosya başına `getXModel()` çağrısı: **52** (P3 öncesi 346). Artamaz; depo katmanına taşındıkça `ratchet:update` ile düşer.
- Depcruise kural başına sayı zaten mandallıydı (değişmedi).

**Ratchet sonucu:** tek ihlal `knip exports 20 → 22` — TABAN (be-p3b'de de aynı, P3B_REPORT §3; P4 değişikliklerinden değil:
`operations/users/userRules.ts::docCan`, `operations/stock/markStockDirty.ts::findStockChangedVariantIds` vb.). Karar bekliyor.

## 2. NB8 — eklenenler (ADR-0017 Karar 4, ADR-0029 NB8, ADR-0031)

Mevcut `AlertEvaluator`/`alertRules` deseni; yeni koleksiyon/indeks/göç YOK. Cooldown (kritik 4 sa / uyarı 24 sa), histerezis
(2 temiz tur), susturma, bakım, gölge mod (`ALERT_SHADOW_UNTIL` → tenant `notify` `shadow:true`, yalnız defter), fırtına özeti aynen.

| Kural | Tenant kodu | Kaynak | Not |
|---|---|---|---|
| R2 tenant devresi | `INTEGRATION_CIRCUIT_OPEN` | `IntegrationCallMetrics.circuitState` (breaker tenant×entegrasyon başına) | pencere = devre açık süresi; `open` var ve `closed` yok |
| R3 sipariş gecikmesi | `ORDER_SYNC_LAGGING` (uyarı/kritik) | ApplicationDB `Clients.integrations[].lastSuccessfulOrderSync` (motorun gerçek imleci) | yalnız `status:true` marketplace/ecommerce; kill-switch (ADR-0030 X6) drain/off ve abonelik kapısı (bayrak açıkken) kapalı olan hariç; imleç yoksa atlanır |
| R8 çözülmemiş OVERSOLD | `STOCK_OVERSOLD_UNRESOLVED` | tenant `Orders.items` `allocationState:'OVERSOLD'` + `oversoldEscalatedAt` ≤ şimdi−eşik | ACTIVE tenant'lar (≤500), tenant başına bir `countDocuments`, sonuç **10 dk önbellek** (değerlendirici dakikalık) |
| ADR-0018 triage sonrası | `INTEGRATION_CHANGE_NOTICE` | `FindingService.transition('accept')` → `setChangeNoticeHook` | yalnız severity high/critical ve `affectedTenants`; critical→warning, high→info; içerik/kanıt bildirime girmez |

**Eşikler platform ayarına taşındı:** `integration/config/catalog/alerts.ts` — 11 `alerts.*` anahtarı (`platform.alerts` grubu,
`advanced`, `exposure` YOK → yöneticiye özel, public-config dışı). `alertThresholds.readAlertThresholds(getPlatformSetting)`
her turda okur (yayın sonrası yeniden başlatma gerekmez). Varsayılanlar `DEFAULT_THRESHOLDS` ile birebir (testli). Kritik <
uyarı girilirse uyarı eşiği esas (yanlış kritik yok). Pencereler (R1/R2 15 dk, R7 60 dk), cooldown ve fırtına sınırı kodda.
`_platform` anahtar sayısı 22 (ADR-0031 gözden geçirme eşiği 25; test korur). `CATALOG_VERSION` → `2026-10-01.b5`.

**Testler:** `tests/unit/alerts/alertNb8Remaining.test.ts` (kurallar, R3 kaynak seçimi + kill-switch + abonelik, katalog
tutarlılığı, ayar değişikliğinin değerlendirmeye yansıması, gölge mod/cooldown, change-notice). Güncellenen:
`tests/unit/api/publicConfig.test.ts`, `tests/mongo-semantics/platformTarget.mongoSemantics.test.ts`.

**Hâlâ açık (NB8):** R5/R6/R9-R11 kural kaynakları; backoffice ayar panelinde `platform.alerts` grubu
(`frontend/backoffice/src/views/settings/PlatformSettingsPanel.vue` grup listesi + mock) — FE işi.

## 3. `src/api/**` console temizliği (F-06)

- 23 dosya, 69 çağrı → `eventLog(source, module)` (`api` / `webhook` / `auth`): SCREAMING_SNAKE kod + mesaj şablonu + alanlar;
  maskeleme logger `mergeArgs`'ta zorunlu. Önceden yalnız `e?.message` loglanan yerlerde (billing, auth, export indirme, KVKK
  dışa aktarma) yine yalnız mesaj. Ham sorgu dökümleri (`FinancialService` filtre JSON'u, BatchCreator sorgusu) debug
  seviyesine ve yalnız anahtar/sayıya indirildi. Handler'lara enjekte edilen `logError` kancaları (invoice/shipment) da logger'a.
- Mandal: `eslint.config.mjs` → `src/api/**/*.ts` için `no-console: 'error'` (sayı 0, geri dönüş lint'te kırılır);
  `quality/baseline.json`'dan `src/api/**` no-console girdileri silindi. Toplam src no-console: 107 (api dışı, mandallı).
- Testler bilinçli ters çevrildi: 9 characterization dosyası console casusundan `captureLogs()`'a (kod alanıyla doğrulama).

## 4. Kapılar (birleşik, `backend/`)

Ortam: `MONGOMS_SYSTEM_BINARY` (conda-forge mongod 8.0.23, scratchpad'e çıkarıldı; mongodb-memory-server indirmesi bulut
ağında 403), `TZ=Europe/Istanbul`, knip/oxc Linux bağlamaları `npm i --no-save`.
- `typecheck` 0 · `lint` 0 hata · `depcruise` 0 hata / 3 uyarı (no-circular).
- `test:all`: 452 suite / 7.556 test; başarısız = **taban 5 suite / 10 test** (be-p3b'de aynı, P3B_REPORT §3):
  `integrationPlaybook.static`, `NoRawRegex.static` (`api/admin/engineOps.ts:201`), `errorCodes.docs`, `operation-policy`
  (FE envanteri), `chatFe4.transport`. P4'ün kırdığı `platformTarget.mongoSemantics` düzeltildi ve yeşil.
- `ratchet`: tek ihlal knip exports 20 → 22 (taban, §1).

## 5. Commit'ler (`cloud/be-p4`)

| Commit | Özet |
|---|---|
| `2aa08162` | NB8 kalanları + eşikler platform ayarından |
| `4b4a6a02` | public-config testi: `alerts.*` yöneticiye özel |
| `d1d5a3df` | `src/api/**` console → eventLog, no-console error |
| `76ac5ec2` | P4-GATE: depcruise error + handler mandalları |
| `330132f8` | TESTING.md kalite kapısı + NOTIFICATION_PLAN NB8 durumu |
| `5e09e7b9` | servis characterization testleri → captureLogs |
| `1baefd42` | be-p3b birleştirme (console dönüşümü yeniden, mandallar kilit) |
| `daef3383` | platformTarget mongoSemantics: `alerts.*` |
| (bu) | P4_REPORT |

## 6. Yerelde doğrulanacaklar

1. `npm run verify` + `npm run test:all` (gerçek ortamda); knip exports 22 → 20 baseline farkı kararı (taban).
2. Alarm değerlendiricisi gerçek Mongo ile (gölge modda, `ALERT_EVALUATOR_ENABLED=true`, `ALERT_SHADOW_UNTIL` ileri tarih):
   R3 kaynağı `Clients` taraması, R2 tenant devresi aggregate'i (`IntegrationCallMetrics` `{integrationCode,clientId,at}` indeksi
   yalnız `at` aralığıyla kullanılmıyor — `at` TTL indeksi kullanılır; süre gözlenmeli), R8 tenant taraması süresi
   (tenant sayısıyla doğrusal; 10 dk önbellek). `NotificationEvents` defterinde `suppressed:shadow` satırları.
3. Backoffice'te `alerts.*` yayın → bir sonraki turda eşik değişimi (config-head-poll 15 sn).
4. FindingService `accept` (backoffice uyum ekranı) → etkilenen tenant'ta `INTEGRATION_CHANGE_NOTICE` (NOTIFY_V2 açıkken).
5. Log çıktısı: `src/api` hata yollarında JSON satırlarında `code` ve maskeleme (ör. billing webhook, KVKK dışa aktarma).
6. BACKLOG.md (kök, bulutta yazılamaz) NB8 ve F-06 satırlarının güncellenmesi; CLAUDE.md Architecture bölümüne P4-GATE notu
   (orkestratör/insan; CLAUDE.md bulutta salt-okunur).
