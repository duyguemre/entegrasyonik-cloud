# P3B raporu — ADR-0024 Dalga 3: P3-CAT + P3-ADM (bulut, `cloud/be-p3b`)

Taban: `origin/cloud/be-p2move` @ `1f0f430d` (P2-MOVE 4 adımı tamam: codemod, taşımalar, `noMockedShim`, TESTING notu).
Sonda `origin/cloud/be-p3a` @ `95ea51d8` birleştirildi; ortak kapı birleşik hâlde tabanla birebir aynı.
Davranış değişmez: karakterizasyon/snapshot/kontrat testleri değişmedi; tek test değişiklikleri (a) taşınan modüllerin içe
aktarma yolları, (b) silinen ölü `ImageService.getIntegrations/getProduct` metotlarının kendi test blokları (−5 test).

## 1. Alan bazlı özet

### P3-CAT — katalog
- **Taşıma (codemod, `dev-tools/codemods/maps/p3b-1-catalog-reports.json`):** `services/image/image-operations.ts` →
  `operations/catalog/images/image-operations.ts`. `services/index.ts`'teki `ImageOperations` yeniden-dışa-aktarması
  kaldırıldı (services → operations yasak yön); içe aktaranlar doğrudan yeni yolu kullanır.
- **Tenant repository'leri:** `Brand, Category, Choice, Hashtag, AttributeMapping, Product, Variant, Image, Statistics,
  StockMovement, SmartSummary, StockHealth` (`database/repositories/tenant/`), `app/MetricRollupRepository`.
- **İş kuralları:** `operations/catalog/productFilters.ts` (varyant/ürün filtre + eşleşme sorgusu kurucuları),
  `operations/catalog/productExcel.ts` (Excel base64), `operations/catalog/mapping/autoMatch.ts` (`autoMatchAllCategories`).
- **Ölü kod:** `ImageService.getIntegrations`, `ImageService.getProduct` silindi (RPC kaydı, ImageApiManager, `src/**`,
  FE/backoffice aramaları boş). `VariantService.getIntegrations` ve `ProductService.getProduct` dosya içinden çağrıldığı
  için CANLI, korundu. Diğer denetim adayları P1-DEAD'de zaten silinmişti.
- **ConfigurationService:** kardeş servisleri zaten `this.sibling(...)` ile kuruyor; değişiklik yok, karakterizasyonu yeşil.
- **Kapsam dışı bırakılan (brif daraltması):** `integration/modules/provider/PlatformMappingProvider.ts` →
  `operations/catalog/mapping/` taşıması yapılmadı (dosya `integration/**`, P3A alanı; ADR tablosunda P3-CAT'te). Ayrı adım.

### P3-ADM — yönetim, kullanıcı, destek, stok
- **Taşıma:** `operations/client/StatsOperations.ts` → `operations/reports/StatsOperations.ts` (codemod;
  `IntegrationEngineProvider.ts`'te yalnız içe aktarma satırı).
- **App repository'leri:** `Client, ExportSignal, ExportFlag, OperationLog, PlatformImportJobStats, AuditLog, Plan,
  Subscription, User, GlobalRole, Resource, Ticket, Counter, NotificationPreferences, Menu`.
- **Tenant repository'leri:** `TenantFootprint` (admin hedef-tenant sayımları), `TenantUser, Notification, Favorite, Setting`.
- **İş kuralları:** `operations/backoffice/platformSystemHealth.ts`, `operations/backoffice/adminExportDetails.ts`,
  `operations/tenant/resolveAdminOwnerName.ts`.
- **MM-20 (UserService merkezi kayıt önce): KOD UYGULANMADI.** Yazma sırasını (bugün: önce tenant `create`, sonra merkezi;
  merkezi E11000'de tenant kaydı geri alınıp 409) tersine çevirmek hata/geri alma semantiğini ve
  `user-service-email-uniqueness` karakterizasyonunu değiştirir → davranış değişikliği. Sorgular `UserRepository` (merkezi)
  ve `TenantUserRepository` (tenant) altında toplandı; sıra değişikliği ürün/mimari onayıyla ayrı iş.
- **`TicketService.getNextSequenceValue`:** `private` YAPILMADI — `tests/unit/sequence.test.ts:61` public çağırıyor (test
  değiştirilmez kuralı). İçeride `CounterRepository.next` kullanır.
- **Kapsam dışı bırakılan:** `services/statistics/StatisticsTracker.ts` → `operations/reports/` (motor dosyaları içe
  aktarıyor; `integration/**` P3A alanı, brif daraltması). Ayrı adım.

### Ortak desen
Repository kurucusu yalnız tenant/app tutamağını alır (`clientId` yok); model her çağrıda tutamaktan okunur
(`private get model()`); handler'da `private get <ad>() { return new XRepository(this.clientDB) }` getter'ı — testler servisi
kurduktan sonra `svc.clientDB` atadığı için. Sorgu zinciri, argümanlar ve çağrı sırası birebir korundu. Bilgi eklemeyen
`catch (e) { throw e }` blokları silindi; log ekleyen/dönüştüren catch'ler kaldı.

## 2. Satır ve `getXModel` azalması (22 handler)

| | Önce | Sonra |
|---|---|---|
| Toplam satır | 5.351 | 4.021 |
| `getXModel()` | 202 | 1 |
| 400 satır üstü handler | 4 (admin 744, attributeMapping 569, product 531, variant 413) | 0 (en büyük admin 400) |

Kalan tek `getXModel`: `variant-service.getIntegrations` → `applicationDB.getIntegrationModel()` (platform entegrasyon
kataloğu; P3A'nın `app/IntegrationCatalogRepository`'si birleşmeden sonra kullanılabilir — sonraki adım).

## 3. Kapılar (birleşik, `backend/`)
Ortam: `MONGOMS_SYSTEM_BINARY` (conda-forge mongod 8.0.23; mongodb-memory-server indirmesi bulut ağında engelli),
`TZ=Europe/Istanbul` (N11 snapshot saat dilimine bağlı), knip/oxc Linux yerel bağlamaları `npm i --no-save`.
- `typecheck` 0 · `lint` 0 hata · `depcruise` 0 hata / 3 uyarı (no-circular, taban).
- `test:all`: 451 suite / 7.541 test; başarısız = taban 5 suite / 10 test (P2-MOVE tabanında da aynı, kapsam dışı):
  `integrationPlaybook.static`, `NoRawRegex.static` (`api/admin/engineOps.ts:201`), `errorCodes.docs` (`VIEW_LIMIT`),
  `operation-policy` (FE `IntegrationService/retrieveCategories`), `chatFe4.transport`. `emailDispatcher.mongoSemantics`
  tam koşuda yük altında kararsız; tek başına 18/18.
- `ratchet`: tek ihlal `knip exports 20 → 22` (taban; P3 dışı export'lar, ör. `operations/users/userRules.ts::docCan`).
  İyileşmeler baseline'a kilitlendi: `no-useless-catch 87 → 2`, `no-var 29 → 23`, `prefer-const 21 → 19`.
- Site kanıt yolları: `site/src/**` içindeki tüm `backend/src|tests/...` yolları mevcut, ticket/audit/tenant-data kanıt
  metinleri yerinde; güncelleme gerekmedi. (`site` `claims.test.ts` bulutta `INTEGRATIONS_REGISTRY.md` eksikliğinden kırmızı.)

## 4. Birleştirme notları
- `app/ImportJobRepository.ts` add/add çakışması: P3-INT'in tenant kapsamlı (clientId filtreli) sürümü korundu; P3-ADM'nin
  platform geneli metrik sorguları `app/PlatformImportJobStatsRepository.ts`'e ayrıldı.

## 5. Yerelde doğrulanacaklar
1. `npm run test:all` + `npm run ratchet` (knip exports 22 → baseline 20 farkı kararı).
2. Gerçek Mongo smoke: ürün listesi/filtre/Excel dışa aktarma, varyant toplu güncelleme, görsel yükleme/sıralama,
   kategori/seçenek/özellik eşleme + otomatik eşleme, admin müşteri listesi/sistem sağlığı/export detayı, kullanıcı
   davet/rol/silme, bilet aç/yanıtla, bildirim listesi/okundu, menü favorileri, KVKK dışa aktarma/silme talebi, faturalama.
3. MM-20 yazma sırası değişikliği için ürün/mimari kararı.
