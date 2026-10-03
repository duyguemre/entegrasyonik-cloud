# DURUM — devir dosyası (her commit'te güncellenir)

Son güncelleme: 2026-10-03 (WP0+WP1 bitti; sıradaki WP2) · Dal: `feature/eslesme-fiyat-yeniden-yapilandirma` · Son commit: bkz. `git log -1`.

## Bütçe ve çalışma kuralları (kullanıcı kararı 2026-10-03)
- Bulut kredisi sınırı **120 USD** (sayaç kullanıcıda; "dur" dendiğinde o adım kapatılır, commit + push + bu dosya güncellenir).
- Sıra: **WP0 → WP1 → WP2 → WP3 (Hepsiburada P0)**; kalan WP'ler (WP4–WP9) yerelde (20x Max, Salı'dan itibaren) devam eder.
- **Testler:** kod değişikliğiyle birlikte YAZILIR; **koşturma kısıtlı**: paket içinde yalnız değişen dosyaya dokunan 1–3 test (`npx jest <dosya>`), paket sonunda bir kez ilgili modül, tam koşu (`npm test`, `npm run verify`, Playwright) yalnız WP9'da ve yerelde. `tsc --noEmit` her commit öncesi (ucuz).
- Alt-ajan kullanımı az; büyük rapor dosyaları baştan sona okunmaz, `grep` ile ilgili bölüm.
- WP'ler arasında onay beklenmez; her WP sonunda commit + push + 5 satırlık özet.
- Canlıya yazma yok; DB/Redis yok; göçler yalnız yazılır.

## Girdi belgeleri (yeni oturum önce bunları okur, sırayla, yalnız gereken bölümleri)
1. `docs/eslesme-fiyat/PLAN.md` §1–§3 (ilke, kararlar §2a, hedef yapı) ve §6 (iş paketleri).
2. `docs/eslesme-fiyat/03-uyumluluk-analizi.md` §2.1, §6 (D-* kimlikleri).
3. İlgili WP için: WP1 → `01-ekler/C-frontend.md` §B, §D; `01-ekler/A-eslesme-backend.md` §E; WP2 → aynıları + `A` §B–§D; WP3 → `API_HEPSIBURADA.md` §10.
4. `CLAUDE.md` kural 7 (bulut kapsamı: backend/docs/frontend değişebilir; docs/adr ve CLAUDE.md salt-okunur).

## WP durumu

| WP | Durum | Yapılan | Kalan / sıradaki adım |
|---|---|---|---|
| WP0 Hazırlık | **TAMAM (bulut)** | Göç `0020`→`0025-users-google-sub-app`; (a) `ERROR_CODES.md` yeniden üretildi (`VIEW_LIMIT`); (b) `operation-policy` FE envanteri faz3 senkronuna göre (4 dinamik dosya çözüldü; FE'nin artık çağırdığı 22 uç `BACKEND_ONLY`'den çıktı; FE'nin bıraktığı 9 eski uç — `getCategoryMapping`, `saveOrUpdateIntegrationBrand`, `assignImages`, `VariantService/*`×6 — gerekçeyle girdi; liste testleri tüm uyumsuzlukları tek seferde raporlar), 46/46; (c) HB testConnection fikstürü `OMSBASEURL` (test gerçek oms-external'a gidiyordu), 9/9; (d) N11 SOAP `parseDate` UTC+3 sabit (kod hatasıydı, snapshot doğruydu), UTC+İstanbul TZ yeşil. | Yerelde: (e) `integrationPlaybook.static` ratchet (`INTEGRATIONS_REGISTRY.md` bulutta yok); (f) `USER_DECISIONS_EKLER.md` satırlarını `docs/adr/USER_DECISIONS.md`'ye kopyala. 9 eski ucun backend'den silinmesi/yeniden bağlanması kararı WP2'de. |
| WP1 Hata sözleşmesi + preflight (BE) | **TAMAM (bulut)** | `platform/core/errors/integrationIssues.ts` (katalog + `IssueError` + maskeleme); `modules/common/errors/{errorMap,registry}.ts` + TY/HB/N11/PZ/IS `errorMap.ts` iskeleti; `integration/catalog/preflight/readiness.ts` (D-VAL-1/2, saf, tek kaynak); Validator/Publisher/Sentinel `issues[]` (staging + `upload.<MODE>.issues`), ImportJobReport `issues[]` (okumada); RPC `preflightExport` + `explainChannelProduct` (yetenek kaydı, `catalog:read`, zod); `ADR-0038-taslak.md`. Paket sonu: 25 suite / 414 test yeşil; tsc + depcruise temiz (3 eski döngü uyarısı). | Yerelde: ADR taslağını `docs/adr/`'ye kopyala; `ExportStagedProducts` şemasında `errorMessage/errorType` yok → Mongoose strict `bulkWrite`'ta atıyor olabilir, gerçek DB'de doğrula. errorMap kuralları WP3/WP4'te fikstürle genişler. FE tüketimi WP2/WP8. |
| WP2 Eşleme tek kaynak (BE+FE) | bekliyor | — | autoMatch düzeltmesi + öneri modu (Ek A P0-3, P1-4); `AttributeMappings` yeni alanlar (`allowCustom, isMultiple, updatedBy, stale`) + göç `0026-attribute-mappings-indexes-tenant` (yalnız yazılır); audit `mapping.*`; `PlatformCatalog` + `catalog.platformRefresh` + `catalog.mappingStaleness` (göç 0030); `brandMapping` yeteneği descriptor'larda (K-C); FE: `categoriesStore` tek kaynak (Ek C P0-1), HB `lazyValues` (P0-2), `AttrValueField` dört durum + bağlantı + i18n (P1-1..3), kapsam = kategori+özellik+değer (P1-9), `hasBrandMapping` yetenekten (P1-10), "üst kategoriden kopyala". |
| WP3 Hepsiburada P0 | bekliyor | — | D-HB-1 (import: katalog `all-products-of-merchant` + listing birleşimi; Stager'a ham kayıt), D-HB-2 (kategori id `AttributeMappings`'ten; 3 kova + `mandatory`; değer ucu tekil `attribute`; `Marka` = `Brands.title`; zorunlu denetim), D-HB-5 (host listesi: `mpfinance-external`, `api-asktoseller-merchant`, `shipping-external` + `-sit`; `accounting-external` kalkar), merchantId tek kaynak (K-13). Yazma uçları (fatura/iptal/kargo) ve finans/soru yeniden yazımı bütçe kalırsa, yoksa yerele. |
| WP4–WP9 | yerelde | — | PLAN §6. |

## Yeni oturum için prompt (claude.ai/code → entegrasyonik-cloud → yeni oturum; dal: feature/eslesme-fiyat-yeniden-yapilandirma)

```
Dal: feature/eslesme-fiyat-yeniden-yapilandirma (origin'den çek; başka dala geçme, merge/rebase yok).
Önce docs/eslesme-fiyat/DURUM.md'yi oku ve oradaki "WP durumu" tablosundan devam et (şu an WP0 yarım).
Kurallar DURUM.md "Bütçe ve çalışma kuralları" bölümünde: 120 USD sınırı, sıra WP0→WP1→WP2→WP3, testler yazılır ama
koşturma kısıtlı (tam koşu yok), tsc her commit öncesi, canlıya yazma yok, DB/Redis yok, göçler yalnız yazılır,
git add -A yok, *-linux.png commit'lenmez, docs/adr ve CLAUDE.md salt-okunur (USER_DECISIONS satırları
docs/eslesme-fiyat/USER_DECISIONS_EKLER.md'ye). Her anlamlı adımda commit + push ve DURUM.md güncelle.
"Dur" dediğimde o adımı kapat, commit + push, DURUM.md'yi güncelle ve 5 satırlık özet ver.
```
