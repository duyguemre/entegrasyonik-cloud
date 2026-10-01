# Veritabanı göçleri — çalıştırma sırası ve onay noktaları

Kaynak: `docs/audits/DATABASE_REVIEW_2026-09-30.md` §10 (DB-10/11/12/14/15), ADR-0021 (Karar 4 çerçeve; D9/D10/D12/D16), ADR-0032.
Çerçeve: `backend/dev-tools/migrate.js` (`status | plan | up --apply | down --apply`). Göç dosyaları `backend/migrations/NNNN-*.js`.
**Bu partideki göçlerin HİÇBİRİ çalıştırılmadı.** Betikler yazıldı ve bellek-içi Mongo'da (`mongodb-memory-server`) kanıtlandı.

## 1. Göç numaraları (faz4 DB partisi)

| No | Kimlik | İş | Kapsam / tür | Ne yapar | Geri alma (`down`) |
|---|---|---|---|---|---|
| 0008 | `0008-variants-stockdirty-partial-tenant` | DB-11 | tenant / index | `Variants` kısmi indeks `stockDirty_true` (`{stockDirty:1}`, partial `{stockDirty:true}`) | indeksi düşürür |
| 0009 | `0009-notifications-metricrollups-indexes-app` | DB-10 (+DB-05) | app / index | `NotificationEvents` (`uniq_idem_key` unique + 2 + `ttl_exp_at`), `NotificationDeliveries` (4), `NotificationPreferences` (`uniq_tid_userId`); `MetricRollups` iki TTL açık adla (`ttl_bucket_5m` 7 g, `ttl_bucket_1h` 90 g), eski `bucketStart_1` düşer | bildirim indeksleri + iki adlı TTL düşer; eski `bucketStart_1` (5m) geri kurulur; unique'e dokunmaz |
| 0010 | `0010-messages-external-id-drift-tenant` | DB-15 / D16 | tenant / **contract** | bileşik unique `integrationCode_1_externalMessageId_1` garanti, sonra tek alanlı unique `externalMessageId_1` düşer | tek alanlı unique'i geri kurar (kanallar arası çakışan kimlik yazıldıysa E11000 ile durur; `--i-understand-irreversible` gerekir) |
| 0011 | `0011-d10-clients-users-unique-app` | DB-15 / D10 | app / index | `Clients` `uniq_order`, `uniq_clientId`, `uniq_dbConfig_dbname`; `Users` `uniq_email` (mükerrer varsa **hiçbirini kurmaz**) | indeksleri düşürür |
| 0001, 0002 | (mevcut) | DB-15 / D9 | app / tenant | `AuditLogs {tid,at}`, `Users {clientId}`; `Orders` 2 bileşik, ESP Dispatcher bileşiği | indeksleri düşürür |
| 0012 | `0012-export-staged-archive-ttl-tenant` | DB-12 | tenant / index | ESP `ttl_archived_at` (`{archivedAt:1}`, partial `{isArchived:true}`), **30 gün** | indeksi düşürür (silinen belgeler yalnız yedekten döner) |
| 0013 | `0013-exportflag-clientid-number-app` | DB-14 / D12 | app / migrate (küçük) | `ExportFlag.clientId` String → Number (koşullu `updateOne`), `clientId_1` düşer | Number → String, `clientId_1` geri kurulur |
| 0014 | `0014-admin-mfa-sub-unique-app` | B12 / ADR-0026 | app / index | `AdminMfa` koleksiyonu + `uniq_sub` UNIQUE `{sub:1}` (`autoIndex:false`; ilk kayıt yarışını DB düzeyinde kapatır); `plan` yinelenen `sub` **grup sayısını** verir | `uniq_sub` düşer (koleksiyon/veri silinmez) |

Numara notu: 0004 hiç kullanılmadı, 0008 boştu (durdurulan iş dosya bırakmadı); 0007 son eski göçtü. `up --all` numara sırasıyla koşar
(0001, 0002, 0003, 0005, ... 0013) ve D16 → D10 → D9 sırasını **bozar**: bu partide `--all` **kullanılmaz**, kimlik tek tek verilir (bkz. §2).

## 2. Çalıştırma sırası ve onay noktaları (tek tablo)

Kullanıcı kararı (2026-09-30): göçler **önce yalnız YEREL MongoDB'de** (`127.0.0.1`, `backend/.env` → `DB_URL`) çalıştırılır. **Atlas'a dokunulmaz;
Atlas adımları "sonra, ayrı onay"dır** (Protokol 12: bakım penceresi + açık insan onayı + `--allow-remote`).
Ön koşul (her aşama): `cd backend && npm run build` (CLI `dist/` okur; bayat derleme yanlış kilit/bağlantı kodu çalıştırır).

| Adım | Ortam | Ne | Komut (kalıp) | Onay noktası |
|---|---|---|---|---|
| 0 | yerel | **Yedek doğrulama**: `backup/` altında güncel dump + `docs/DB_BACKUP_VERIFICATION.md` (Tarih ≤ 24 sa, `Kaynak dump`) — bkz. `backup/README.md` | (yedek yoksa/eskiyse DUR; kullanıcı yeni `mongodump` alır) | **İNSAN**: yedek geçerli mi |
| 1 | yerel | `status` (salt-okuma) | `node dev-tools/migrate.js status` | — |
| 2 | yerel | **plan** (DRY-RUN, salt-okuma) sırayla: 0008, 0009, 0010, 0011, 0001, 0002, 0012, 0013 | `node dev-tools/migrate.js plan <kimlik>` | **İNSAN plan çıktısını inceler**: 0011 `precheckClean:true`, 0012 `wouldExpireNow`, 0013 `skippedCollisions/skippedNonNumeric`, 0009 `drop-legacy` |
| 3 | yerel | **up** aynı sırayla, tek tek | `node dev-tools/migrate.js up <kimlik> --apply --backup-ref backup/...` | **İNSAN**: `--apply` + `--backup-ref`; ayrıca 0012 için süre onayı (30 gün; farklıysa `ESP_ARCHIVE_TTL_DAYS`) |
| 4 | yerel | **Doğrulama**: (a) `plan` tekrar → her satır `noop`/`absent`; (b) `status` → `done`; (c) uygulama `npm run start:local` ile açılır; (d) `explain` `Variants.find({stockDirty:true})` IXSCAN; (e) `up` ikinci kez → no-op | `node dev-tools/migrate.js plan <kimlik>` | İNSAN: sonuç kaydı |
| 5 | yerel (isteğe bağlı) | `down` provası (yalnız gerekiyorsa; 0010 için `--i-understand-irreversible`) sonra yine `up` | `down <kimlik> --apply --backup-ref ...` | İNSAN |
| 6 | **Atlas** | **SONRA, AYRI ONAY**: 1–5 aynen, `--allow-remote` ile; taze Atlas yedeği + doğrulama kaydı şart | ayrı Protokol 12 penceresi | **İNSAN (ayrı onay)** — bu belge onay yerine geçmez |

Sıra gerekçesi: 0008 (risksiz, en yüksek getiri) → 0009 (`NOTIFY_V2_ENABLED=true` için önkoşul) → **D16 (0010)** ve **D10 (0011)** → **D9 (0001/0002)** → 0012 (veri silen TTL; süre onaylı) → 0013 (tip dönüşümü; kodla birlikte).
Tenant-kapsamlı göçler (0008, 0010, 0012, 0001'in tenant eşi 0002) `Clients`'tan çözülen tenant listesi ∩ izinli 7 DB üzerinde koşar; `entegrasyonikClient_1` dışındaki
provizyon adları (`entegrasyonikClient_<n>`) izinli listede olmadığından atlanır (CLAUDE.md kural 2/5).

## 3. Göç başına dikkat ve kod bağımlılıkları

- **0009**: `NOTIFY_V2_ENABLED=true` açılmadan önce `done` olmalı (bildirim tekilleştirmesi `uniq_idem_key` E11000'üne dayanır). `MetricRollups` şemasının `autoIndex`'i açık kalır; adlar şemada da sabitlendi (`ttl_bucket_5m/1h`), yani göç ile şema aynı adları üretir.
- **0010**: tek alanlı unique düşünce farklı kanallarda aynı `externalMessageId` artık kaydedilir (drift kaynaklı sessiz kayıp biter). D16'nın diğer kalemleri (`Orders.orderDate_1`, `Invoices.orderId_1_type_1`, önek-örtüşen tekiller) `$indexStats` kanıtı gerektirir; bu partide **yok**.
- **0011**: `plan` mükerrer **grup sayısını** verir (değer yok). `precheckClean:false` ise `up` reddeder; mükerrerler insan kararıyla çözülür (`dev-tools/precheck-tenant-duplicates.js` aynı kontrolü yapar).
- **0012**: TTL veri siler. `plan.wouldExpireNow` = indeks kurulur kurulmaz (≈60 sn içinde) silinecek arşivli belge sayısı. Süre **insan kararı: 30 gün** (2026-09-30); değiştirmek için `ESP_ARCHIVE_TTL_DAYS` (1..365) — aynı adlı indeks farklı süreyle varsa `collMod` ile güncellenir. İndeks bilerek `Export.ts` şemasına bağlanmadı (ESP `autoIndex` açık; bağlansaydı uygulama açılışında onaysız kurulurdu). Manifest bu yüzden 0012'yi içermez.
- **0014**: bağımsız ve düşük riskli (koleksiyon bugün fiilen boş). Sırada diğerlerinden bağımsızdır (0008-0013 ile çakışmaz); `plan` `duplicateSubGroups:0` olmalı (aksi halde `up` E11000 ile durur, önce yinelenen `AdminMfa` kayıtları elle giderilir). Kod önceden hazırdır (`setPending` upsert'i göç olmadan da çalışır); göç yalnız tekilliği DB'ye taşır. Yerel uygulama ajanı çalıştırır: `node dev-tools/migrate.js plan 0014-admin-mfa-sub-unique-app` → `up ... --apply --backup-ref backup/...`.
- **0013**: **kodla birlikte** yayınlanır: `application/models/Export.ts` `ExportFlag.clientId` artık `Number` (Mongoose, `String(order)` filtrelerini cast eder). Göç sonrası eski kod String yazmaya çalışırsa Mongoose Number'a çevirir; göç öncesi yeni kod String belgeleri eşlemez → aynı pencerede uygulanır, Dispatcher kısa süre duraklatılır. Çakışan/sayısal olmayan belgeler atlanır ve raporlanır (bayraklar türetilmiş durumdur; Dispatcher sayacı yeniden eşitler).
- **Manifest dışı ama göç-sahipli indeksler** `backend/dev-tools/_migrationOwnedIndexes.js` `OWNED_INDEXES`'e `{collection, name, ownerMigration}` olarak yazılır (örn. 0012 `ttl_archived_at`: bilerek şemaya bağlanmadı). `diffIndexes()` kullanan "manifeste eşitle" göçleri (0001/0002/0003/0005/0006) bu adları `toDrop` olarak raporlar; uygulanmış göç dosyaları değiştirilemediğinden koruma runner'dadır (`planMigration` bunları `toDrop`'tan çıkarıp `toDropProtected`'a taşır). `tests/static/migrationOwnedIndexes.static.test.ts`: göçün kurduğu adlı indeks ne manifestte ne kayıtta ise düşer. Şemaya bağlı (manifestli) indeksler kayda yazılmaz.
- Uygulanmış göç dosyası değiştirilmez (checksum mandalı); düzeltme yeni göçtür. Ortak yardımcı: `backend/dev-tools/_migrationIndexes.js` (checksum kapsamı dışı; yalnız ekleme yapılır).

## 4. Bu işin DIŞINDA (ayrı insan kararı)

**DB-13 (mock veri sıfırlama)**: Customers'taki kimliksiz/referanssız kopyalar ve ESP kayıtlarının silinmesi/yeniden içe aktarımı bu partide **yoktur**. Veri silen tek adımdır
(0012'nin TTL etkisi ayrıca `wouldExpireNow` ile görünür kılınır); kapsamı, zamanı ve yedeği ayrı insan kararıdır (DATABASE_REVIEW §12, madde 2).
Diğerleri kapsam dışı: D8 `DB_AUTO_INDEX` (DB-08), D16'nın kalan kalemleri, D13/D19 veri kırpma/dönüşümleri (mock kararı), DB-22/24/26.

## 5. Kanıt (yerel, DB'siz/bellek-içi)

- `backend/tests/mongo-semantics/faz4DbMigrationBatch.mongoSemantics.test.ts`: her göç için plan → up → up(no-op) → down → up; 0009'da iki TTL'in ayrı adlarla birlikte kurulması ve bildirim `uniq_idem_key` E11000 tekilleştirmesi; 0010'da kanallar arası kimlik; 0011'de kirli precheck'te hiçbir indeks kurulmaması; 0012'de süre değişince `collMod`; 0013'te çakışma/sayısal olmayan atlama ve down.
- `backend/tests/unit/migrateFaz4DbBatch.test.ts`: numara sırası, biçim, göç tanımları ile manifest eşleşmesi, izinsiz DB kapısı, DB-12 süre parametresi.
- `backend/tests/static/indexManifest.static.test.ts`: manifest artık kaynak TS'ten (`dev-tools/_indexManifestSource.js`, `dist/` gerekmez) üretilir ve `*_INDEXES` sabitlerini (bildirim defteri) ve MetricRollups iki TTL'ini kapsar; `node dev-tools/generate-index-manifest.js [--check]`.

## 6. Rekabet ve fiyat kuralı göçleri (bulutta yazıldı, ÇALIŞTIRILMADI)

Ayrıntı: `docs/PRICING_COMPETITION.md` §6 (0021) ve §R2.6 (0022). İkisi de yalnız indeks ekler (veri dönüşümü yok), tenant kapsamlıdır,
idempotenttir; `down` yalnız kendi indekslerini düşürür. Önce yedek (CLAUDE.md kural 3), önce yerel `plan` → `up`, Atlas ayrı onay.

| No | Kimlik | İş | Kapsam / tür | Ne yapar | Geri alma (`down`) |
|---|---|---|---|---|---|
| 0021 | `0021-pricing-competition-tenant` | PRC-R0/R1 | tenant / index | `Variants` `costPrice_number`, `competition_trendyol_status` (kısmi); `BuyboxSnapshots` geçmiş + TTL 90 g | indeksleri düşürür |
| 0022 | `0022-pricing-rules-tenant` | PRC-R2 | tenant / index | `PriceRules` `type_integ_enabled`; `PriceSuggestions` `ruleId_variantId_current` (UNIQUE, kısmi `current:true`), `status_updatedAt`, `ttl_createdAt_90d`; `PriceHistory` `integ_variant_at`, `ttl_at_90d` | indeksleri düşürür (koleksiyon/veri silinmez) |

Sıra: 0021 → 0022 (0022, 0021'e bağlı değildir ama PRC-R2 PRC-R1 verisini okur). `PriceSuggestions` tekillik indeksi kurulmadan
`features.pricingRules` açılmamalıdır (aynı (kural, varyant) için çift güncel kayıt riski).
