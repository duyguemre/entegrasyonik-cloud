# Rekabet ve maliyet (PRC-R0 · PRC-CFG · PRC-R1 · PRC-R2)

Durum: **bulutta yazıldı (2026-10-01, dal `cloud/prc-r1`)**. Göç `0021` ÇALIŞTIRILMADI. Trendyol buybox alanları **yerelde doğrulanacak** (§6). Buybox işi varsayılan **kapalı** (`features.competition`).

Kaynaklar: `docs/research/COMPETITION_PRICING_2026-10.md` (§3, §6, §7), kullanıcı kararları K57 (S1–S5), K20 (ekran = Otopilot), K48 (önyüzde yalnız bariz düzenleme), K43 (site metnine dokunulmadı). ADR-0019 (yetenek kaydı), ADR-0029 (bildirim), ADR-0031 (`_platform` ayarları), ADR-0033 (adaptör sözleşmesi), ADR-0018 (sözleşme bekçisi).

Kapsam dışı (bilinçli; R1 için): fiyat eşitleme, pazaryerine otomatik fiyat yazma, öneri motoru (PRC-R2 → §R2; PRC-R3 yok), rakip satıcı listesi, kazıma (K57-S2), diğer kanallar (PRC-CH), site metni (K43). Rekabet ayrı bir servis değildir; mevcut zamanlayıcı, yetenek kaydı, bildirim ve ayar motorunun içindedir.

---

## 1. Veri akışı

```
features.competition (kill-switch, tenant listesi = pilot)
        │
pricing.buyboxRefresh (worker, dakikada bir, JobRunRegistry) ──► Trendyol intake kapısı (ADR-0020) ──► kanal bütçesi (dk başına istek)
        │
        ├─ tenant başına: abonelik planı + tenant istisnası ──► etkin ayar (SKU tavanı, tazeleme, tazelik, öncelik)
        │      └─ aday: Trendyol'da yayında (platforms.trendyol.upload.TRANSFER.status = COMPLETED) + barkodlu varyant
        │      └─ izlenen küme = öncelik sırasının ilk `skuCap`'i; vadeli = hiç okunmamış ya da `refreshMin`'den eski
        ├─ bütçe tenant'lar arasında round-robin (her tenant'a sırayla 1 istek = ≤10 barkod; başlangıç her turda kayar)
        │      └─ bütçeye sığmayan barkodlar ERTELENİR (sonraki tur; ekranda "gecikmeli")
        ├─ Trendyol `readBuybox` (POST, salt okuma, product_read grubu, ResilientHttpClient, sözleşme bekçisi)
        ├─ Variants.competition.trendyol  ← güncel durum (status/sıra/buybox fiyatı/çok satıcı/bizim fiyat/zamanlar)
        ├─ BuyboxSnapshots (tenant DB)     ← geçmiş: değişince ya da 6 saatte bir; TTL 90 gün
        └─ winning → losing: BUYBOX_LOST bildirimi (gölge mod varsayılan AÇIK, barkod başına soğuma)

Ekran / Otopilot (aynı yetenekler):
  pricing.cost.list / pricing.cost.set   (PRC-R0 maliyet + kapsam)
  pricing.buybox.list                     (rozet, filtre, özet, ayar özeti, kanal destek tablosu, 30 gün geçmiş)
  pricing.margin.preview                  (mevcut fiyatta ve buybox fiyatında net kâr, başa baş fiyat, buybox'a fark)
```

Tenant verisi kendi ClientDB'sinde kalır; buybox/rakip verisi tenant'lar arasında birleştirilmez (araştırma §3, E18).

## 2. PRC-R0 — maliyet

- Alan: `Variants.costPrice` (birim alış maliyeti, **TL, KDV hariç**) + `Variants.costUpdatedAt`. İsteğe bağlı; mevcut belgeler değişmez ("maliyet girilmemiş" = alan yok).
- **Tek yazma noktası:** `PricingService/setVariantCosts` (`pricing.cost.set`). Genel varyant/ürün kaydı (`updateVariants`, `addVariant(s)`, ürün kaydı) `costPrice/costUpdatedAt/competition` alanlarını gövdeden **süzer** (bayat form maliyeti ezmesin, tarih atlanmasın).
- Kurallar: 0–10.000.000, en çok 2 ondalık; `null` siler; değeri değişmeyen kalem yazılmaz (tarih korunur); bilinmeyen varyant `notFound`'a düşer.
- Kapsam göstergesi: `{ total, withCost, percent, stale }` (`stale` = 90 günden eski maliyet; yalnız uyarı).
- Maliyetsiz üründe kâr hesaplanmaz; `pricing.margin.preview` → `rulesEligible:false`, `ineligibleReasons:['cost_missing', …]`. PRC-R2 kural/öneri motoru bu alanı okuyacak (bugün motor yok; ekran uyarı gösterir).

## 3. PRC-CFG — ayarlar

### 3.1 Plan varsayılanları (`_platform` kataloğu, `integration/config/catalog/pricing.ts`)

**ADR-0031 eşiği:** bu anahtarlarla `_platform` 25 anahtar gözden geçirme eşiğini aşar. ADR'nin öngördüğü değerlendirme yapıldı: ayrı grup (`platform.pricing`) + ayrı backoffice ekranı; ayrı hedef gerekmedi (yayın sıklığı düşük). Eşik testi bu grubu ayrı sayar (≤15). ADR-0031'e not düşülmesi insan onayındadır (docs/adr salt-okunur).

Değişiklik backoffice "Sistem ayarları"ndaki mevcut taslak → yayın akışıyla yapılır (`IntegrationConfigService`, `target:'_platform'`): gerekçe, geçmiş, geri alma ve denetim ADR-0031'den gelir. Yayın ≤15 sn'de tüm pod'lara yayılır; **yeniden başlatma gerekmez**.

| Anahtar | Başlangıç (S5/S7) | Sınır |
|---|---|---|
| `pricing.buybox.plan.starter.skuCap` | 100 | 0–50.000 (0 = izleme kapalı) |
| `pricing.buybox.plan.starter.refreshMin` | 360 (günde 4) | 15–1440 dk |
| `pricing.buybox.plan.growth.skuCap` / `.enterprise.skuCap` | 1000 / 5000 | 0–50.000 |
| `pricing.buybox.plan.growth.refreshMin` / `.enterprise.refreshMin` | 30 / 30 | 15–1440 dk |
| `pricing.buybox.plan.<plan>.freshnessMin` | 30 | 5–1440 dk |
| `pricing.buybox.plan.<plan>.priority` | `changed_first` | `changed_first` · `stocked_only` · `oldest_first` |
| `pricing.buybox.budget.trendyol.perMin` | **60** (güvenli düşük; Trendyol ~1000/dk ve satıcı hesabının diğer çağrılarıyla paylaşılır) | 1–1000 |
| `pricing.buybox.notify.shadow` | `true` (yalnız defter) | bool |
| `features.competition` (+ `.tenants`) | `false` | bool + tenant listesi (pilot) |
| `pricing.suggestions.bulkApplyQuota` (PRC-R2, **PRC-OPEN S6 açık karar**) | `per_approval` (toplu onay = 1 eylem) | `per_approval` · `per_item` |
| `features.pricingRules` (PRC-R2 platform kill-switch, K19) | `false` | bool |

Öncelik politikası: `changed_first` = son 24 saatte buybox'ı değişen → stoklu → en eski gözlem; `stocked_only` = yalnız stoklu SKU (en eski önce); `oldest_first` = yalnız en eski gözlem.

Katalogda olmayan plan kodu `starter`, faturalamadan muaf (legacy) tenant `growth` varsayılanını alır.

### 3.2 Tenant istisnası

`Subscriptions.limitOverrides.competition = { skuCap?, refreshMin?, freshnessMin?, priority?, note?, updatedBy, updatedAt }` (ADR-0008 `limitOverrides` deseni; iç içe isteğe bağlı alan, göç yok). Alan bazında plan değerini geçer; plan ile **aynı sınırlarla** doğrulanır.

Backoffice RPC'leri (`/admin-api`, platformAdmin, MCP'ye kapalı):

| RPC | Yetenek | Not |
|---|---|---|
| `BackofficeBillingService/getCompetitionSettings {}` | `platform.competition.settings` | `{ plans[{plan, skuCap, refreshMin, freshnessMin, priority, keys{…}}], budgets[{channel, perMin, key}], notify{shadow, cooldownHours}, overrides[{tid, tenantName, planCode, override, effective, updatedAt, note}], limits, priorities }` |
| `BackofficeBillingService/getTenantCompetition {tid}` | aynı | `{ tid, planCode, billingExempt, override, effective{…, sources} }` |
| `BackofficeBillingService/setCompetitionOverride {tid, override: {…}|null, note?, reason}` | `platform.competition.override.set` | gerekçe ≥10 karakter; `null`/`{}` kaldırır. Yanıt `{ tid, cleared, before, after, effective }`. Denetim: `backoffice.write` (otomatik) + `BillingEvents.subscription.competition_override` (önce/sonra). |

Etki: buybox işi her turda aboneliği yeniden okur; müşteri ekranı istek başına okur → **yeniden başlatmasız**.

### 3.3 Sistem yük koruması

- Kanal başına **global dakikalık istek bütçesi**; bütçe dolunca tazeleme ertelenir (hata değil).
- Adil sıra: tenant'lar arasında round-robin; bütçe B, tenant T ise her tenant en az ⌊B/T⌋ istek alır; başlangıç tenant'ı her turda kayar.
- Bir tenant'ta okuma hatası (429/kimlik vb.) o tenant'ı o tur için durdurur, bütçe yakmaz, diğerleri sürer.
- Trendyol `intake` (ADR-0020 kill-switch) `on` değilse iş hiç çağrı yapmaz. `features.competition=false` iken DB'ye bile dokunmaz.
- İş tek worker lease'i altında (`pricing.buyboxRefresh`, `maxDurationMs` 50 sn) koşar; LIVE_READONLY kipinde **başlamaz**.
- Gözden geçirme eşiği: aday taraması tenant başına her tur tam tarama yapar (`maxTimeMS` 10 sn, ≤50.000 aday). Tenant sayısı ×10 ya da tur süresi sürekli >30 sn olursa aday listesi önbelleğe alınır / tur aralığı büyütülür.

### 3.4 Müşteriye dürüst gösterim

`pricing.buybox.list` her satırda `checkedAt` ("son güncelleme"), `nextRefreshAt` ("bir sonraki tazeleme"; tazeleme kapalıysa `null`), `overdue` (vadesi geçti → "yoğunluk nedeniyle gecikti"), `fresh` (tazelik eşiği) döner. Üst bilgi: `settings{enabled, plan, skuCap, refreshMin, freshnessMin, priority, eligible, tracked}`. Tavan aşılıyorsa `eligible > tracked`.

## 4. PRC-R1 — buybox görünürlüğü (yalnız Trendyol, salt okuma)

### 4.1 Kanal destek tablosu (manifesto `pricing.buybox.read`)

| Kanal | Düzey | Not |
|---|---|---|
| Trendyol | `limited` | Sıra, buybox fiyatı, çok-satıcı. ≤10 barkod/istek. Alanlar yerelde doğrulanacak (`lastVerifiedAt` boş). |
| Hepsiburada | desteklenmiyor | Resmi uç bulunamadı (PRC-CH) |
| N11 | desteklenmiyor | Resmi uç bulunamadı (PRC-CH) |
| Pazarama | desteklenmiyor | Resmi uç bulunamadı (PRC-CH) |

Önyüz bu tabloyu `pricing.buybox.list → channels[]`'tan okur; Trendyol dışındaki kanallar "desteklenmiyor" gösterilir ("yakında" değil; K57-S1).

### 4.2 Adaptör

- `IPlatform.readBuybox?(barcodes)` (isteğe bağlı) → `IBuyboxObservation { barcode, found, buyboxOrder, buyboxPrice, hasMultipleSeller }`.
- Trendyol: `api/BuyboxConnector.ts` — **tek eşleme noktası** (`BUYBOX_DEFAULT_PATH`, `BUYBOX_STOREFRONT_DEFAULT`, `mapBuyboxResponse`). Platform `Integrations.urls.buyboxUrl` ve tenant ayarı `STOREFRONTCODE` varsa onlar kullanılır.
- Sözleşme `trendyol.products.buybox@v1` (`contracts/products.buybox.ts`, `.passthrough()`); uyuşmazlık `API_SCHEMA_DRIFT` yazar.
- Fikstür: `backend/tests/fixtures/trendyol/buybox-information.json` (`_source` + not). Mock sunucu rotası yerelde eklenecek (§6).

### 4.3 Kâr önizlemesi

`kâr = net (brüt − komisyon − komisyon KDV'si − hizmet bedeli − kargo katkısı − stopaj) − satış KDV'si − maliyet`

- Kesinti modeli COM-07 `computeNetRevenue`; komisyon kaynağı etiketli (`override` · `actual` · `estimated` · `unknown`).
- Bilinmeyen bileşen **0 sayılmaz**: maliyet / KDV oranı / komisyon yoksa kâr `null`; diğer kesintiler eksikse `confidence:'partial'` ve `missing[]`.
- Komisyona ödenen KDV'nin indirilebilirliği hesaba katılmaz (muhafazakâr).
- Başa baş (taban) fiyat: kâr = 0 olan KDV dahil fiyat (doğrusal model, kuruşa yukarı).
- `buyboxBelowFloor`: buybox bizde değil **ve** buybox fiyatı başa baş fiyatın altında ("buybox'a ulaşmak tabanın altında").

### 4.4 Bildirim

`BUYBOX_LOST` (ADR-0029 kataloğu; kategori `catalog`, uyarı, zorunlu değil, uygulama içi + e-posta özeti). Parametreler: `integ, barcode, buyboxOrder, buyboxPrice, day`. Eylem: `/products?buybox=losing&barcode=…`. Soğuma barkod başına 24 saat (kodda sabit `BUYBOX_LOST_COOLDOWN_HOURS`; ADR-0031 anahtar eşiği nedeniyle ayar yapılmadı) + gün içi dedupe; **gölge mod varsayılan açık** (yalnız defter; gerçek veriyle doğrulanınca backoffice'ten kapatılır).

## 5. API (müşteri uygulaması, `/api`, `RunOperation`)

| RPC | Yetenek (MCP) | Girdi | Çıktı (özet) |
|---|---|---|---|
| `PricingService/listCosts` | `pricing.cost.list` (exposed, catalog) | `{ variantIds?, barcodes?, productId?, missingOnly?, limit? ≤200, cursor? }` | `{ items[{variantId, productId, sku, barcode, costPrice, costUpdatedAt, stale}], nextCursor, coverage{total, withCost, percent, stale}, staleAfterDays }` |
| `PricingService/setVariantCosts` | `pricing.cost.set` (exposed, onay kartı) | `{ items[{variantId? XOR barcode?, costPrice: number|null}] ≤500 }` | `{ updated, unchanged, notFound[], changes[{variantId, before, after}], coverage }` |
| `PricingService/listBuybox` | `pricing.buybox.list` (exposed) | `{ status?: winning|losing|not_found|unchecked, productIds? ≤100, barcodes? ≤100, limit? ≤200, cursor? }` | `{ channel, channels[{code, displayName, level, verified}], settings{…}, summary{winning, losing, not_found, unchecked}, items[{variantId, productId, barcode, sku, status, buyboxOrder, buyboxPrice, hasMultipleSeller, ownPrice, gapAmount, gapPercent, checkedAt, nextRefreshAt, overdue, fresh, lostAt}], nextCursor }` |
| `PricingService/getBuyboxHistory` | `pricing.buybox.list` | `{ barcode, days? 1–90 (30) }` | `{ channel, barcode, days, points[{at, status, buyboxOrder, buyboxPrice, ownPrice}] }` |
| `PricingService/previewMargin` | `pricing.margin.preview` (exposed, `finance:read`) | `{ items[{variantId? XOR barcode?, price?}] ≤50 }` | `{ channel, freshnessMin, items[{…, ownPrice, priceSource, buybox{status, order, price, observedAt, ageMinutes, fresh, hasMultipleSeller}, gap{amount, percent}, current{price, net, salesVat, profit, marginPercent, confidence, missing}, atBuybox{…}, breakEvenPrice, buyboxBelowFloor, commission{rate, source}, cost{price, updatedAt}, vatRate, rulesEligible, ineligibleReasons[]}] }` |

Ürün listesi filtresi: `ProductService/getProducts` → `searchProductForm.data.buyboxStatus` (`winning|losing|not_found|unchecked`).

Yetki: okuma `catalog:read` (kâr önizlemesi `finance:read`), maliyet yazımı `catalog:write`; MCP'de `can()` filtreli. Hiçbir yetenek pazaryerine yazmaz.

## 6. Yerel doğrulama (insan + yerel oturum)

1. **Yedek** (CLAUDE.md kural 3) → göç `0021-pricing-competition-tenant` (önce `plan`, sonra `up`): Variants `costPrice_number`, `competition_trendyol_status` (kısmi), BuyboxSnapshots `integ_barcode_observedAt` + `ttl_observedAt_90d`. Veri dönüşümü yok.
2. **Trendyol alanlarını doğrula** (resmi sayfa: https://developers.trendyol.com/v3.0/docs/12-product-buybox-check — bulutta erişim engelliydi; alanlar yalnız arama dizini özetinden):
   - uç yolu (`product/sellers/{sellerId}/products/buybox-information` varsayımı), yöntem POST, gövde `{ "barcodes": [...] }`;
   - `storeFrontCode` başlığının değeri (varsayılan `TR` varsayımı);
   - yanıt `buyboxInfo[].barcode | buyboxOrder | buyboxPrice | hasMultipleSeller`; hız sınırı (özet: 1000 istek/dk, ≤10 barkod).
   Fark varsa yalnız `BuyboxConnector.ts` + `contracts/products.buybox.ts` + fikstür değişir; ardından descriptor `capabilities['pricing.buybox.read'].lastVerifiedAt` doldurulur ve düzey gözden geçirilir.
3. **LIVE_READONLY'de buybox ucu — AÇIK KARAR (K57-S8):** uç POST olduğundan canlı salt-okuma izin listesinde değildir ve iş LIVE_READONLY'de başlamaz. Gerçek veriyle doğrulama için insan kararı gerekir (öneri: yalnız bu uç, yalnız barkod gövdesiyle). Karar gelene kadar doğrulama mock/sandbox ile yapılır.
4. **Mock sunucu**: `mockserver/backend/src/platforms/trendyol/` altına `POST .../products/buybox-information` rotası (fikstürdeki şekil; barkod yoksa listeden düşür) + `TY_MOCKABLE_ENDPOINTS`'e yol.
5. Pilot: `features.competition=true` + `features.competition.tenants=[<tid>]`, bütçe 60/dk; `JobState pricing.buyboxRefresh` notunda `calls/deferred/lost` izlenir. Bildirim gölge modda defterde görülür; doğrulanınca `pricing.buybox.notify.shadow=false`.

## 7. Testler

- `backend/tests/unit/pricing/` — kuyruk/adil sıra/bütçe (`buyboxQueue`), ayar çözümü (`competitionSettings`), durum geçişi + kâr (`buyboxStateAndMargin`), Trendyol bağlayıcı + manifesto (`buyboxConnector`), zamanlanmış iş (`BuyboxRefreshJob`), maliyet yazımı + backoffice istisnası (`variantCostAndAdmin`), yetenek/parite + göç (`pricingCapabilities`).
- Yetenek kaydı/parite, bildirim kataloğu, zamanlayıcı kaydı, indeks manifesti mevcut kapı testleriyle.


---

# R2 — Rekabet fiyat kuralı, KURU öneri, İNSAN ONAYLI uygulama (PRC-R2)

Durum: **bulutta yazıldı (2026-10-01, dal `cloud/prc-r2`)**. Göç `0022` ÇALIŞTIRILMADI. Platform anahtarı `features.pricingRules` varsayılan **kapalı**.
Kaynaklar: `docs/research/AUTO_PRICING_LEGAL_2026-10.md` (§c K1–K20, §f metin önerisi), K58 (R2 şimdi, R3 avukat yanıtına kadar YOK), K57-S6 (PRC-OPEN), K20 (ekran = Otopilot/MCP, tek kayıt), K48 (önyüz: bariz yerleşim; akış önerileri `frontend/docs/PROPOSALS_PENDING.md`).

**Değişmez:** OTOMATİK (insan onaysız) UYGULAMA YOLU YOKTUR. Fiyat yalnız `PricingService/applySuggestions` ile değişir; o da yalnız onay adımından (ekran onay penceresi / Otopilot-MCP PendingAction kartı) çağrılır. Zamanlanmış iş yalnız öneri yazar ve yayıncısı her zaman reddeder (`NO_PUBLISH`); statik test (`no-auto-apply`) bunu kilitler.

## R2.1 Model — B-10 fiyat kuralının `competition` TİPİ (ayrı servis değil)

`PriceRules` (tenant DB) tek koleksiyondur; `type` alanı bugün yalnız `competition`. B-10 kanal fiyat kuralı (`channel` tipi) aynı koleksiyona/servise eklenir.

```
{ type:'competition', name, enabled, version, integrationCode:'trendyol', scope:{ productIds?, barcodes? },
  competition:{ mode:'below'|'above', deltaAmount?, deltaPercent?, floorMarginPercent, ceiling, step,
                maxChangesPerDay, cooldownMin, maxIncreasePercentPerDay, excludeIfOutOfStock },
  pausedReason?: 'external_change'|'oscillation', pausedAt?, created/updated(At|By) }
```

- **K1:** fark = max(TL, %·buybox); ≥0,01 TL ya da ≥%0,1 (yuvarlandıktan sonra) — 0 ya da 0'a yuvarlanan değer sunucuda **reddedilir** (zod + tel şeması). Hedef buybox'a eşit çıkarsa bir adım daha; sigorta eşitliği ayrıca reddeder.
- **K4:** şemada **varsayılan yok**; form alanları boş gelir.
- **K6:** rakip/mağaza/satıcı alanı yok; tüm gövdeler `.strict()` (bilinmeyen alan 400).
- **K7:** taban = başa baş (maliyet + komisyon + komisyon KDV'si + hizmet bedeli + kargo + stopaj + satış KDV'si) + hedef marj (% brüt). Maliyet/KDV/komisyon yoksa kural o üründe **çalışmaz** (öneri "engellendi: cost_missing"). Tavan zorunlu.
- **K8:** yukarı yönlü hedef; son 24 saatin en düşük fiyatına göre satıcı sınırı (≤ platform %10/gün) ve son 30 günün en düşüğüne göre %25 ile kırpılır; sigorta platform günlük sınırını ayrıca uygular.
- **K12:** SKU başına günlük değişiklik (≤24) + soğuma (≥15 dk); 24 saatte yön iki kez dönerse (salınım) kural **duraklar** + `PRICE_RULE_PAUSED`.
- **K13:** buybox gözlemi `freshnessMin`'den (PRC-CFG) eskiyse öneri yok; uygulamada yeniden denetlenir.
- **K17:** buybox bizdeyken görünen fiyat kayıtlı kanal fiyatından farklıysa (yayın payı 30 dk sonrası) fiyat dışarıda değişmiştir → kural **duraklar**, açık öneriler kapanır, dış değişiklik `PriceHistory`'ye yazılır. Kural açılırken çift motor uyarısı onaylanır.
- **K20:** kural tenant DB'sindedir; aynı tenant'ın mağazaları ortak kural kullanır; tenant'lar arası paylaşım/şablon yok.
- Platform sabitleri (`PLATFORM_LIMITS`, kodda): %10/gün, %25/30 gün, 24 değişiklik/gün, soğuma ≥15 dk, tek değişiklikte ≤%50 düşüş (sigorta). `platform.pricing` grubu ADR-0031 ≤15 anahtar eşiğinde olduğu için ayar yapılmadı.

## R2.2 Motor (KURU) ve sigorta

- `operations/pricing/ruleEngine.ts` — SAF: `evaluate()` → `suggest | skip(reason) | pause_rule`. Tüm tutarlar kuruş (tam sayı). Fiyatı KOD hesaplar (**K15**); Otopilot yalnız açıklar (araç açıklamaları "fiyatı yeniden hesaplama/değiştirme" der).
- Öneri: önce/sonra fiyat, kâr önce/sonra, taban/tavan, liste fiyatı, buybox fiyatı + gözlem zamanı, gerekçe kodları, uyarılar, **kural sürümü**.
- Engel nedenleri (ekranda "engellendi" olarak görünür): `cost_missing, vat_missing, commission_unknown, floor_unreachable, below_floor, above_ceiling, above_list_price, discount_display_active, increase_limit, equalize_forbidden`. Diğer atlamalar (bayat veri, soğuma, buybox bizde…) güncel kaydı kapatır.
- `fuseCheck()` — BAĞIMSIZ sigorta: >0, ≥taban, ≤tavan, ≠buybox ve doğru tarafta, ≤liste fiyatı, ≤ platform günlük artış, ≤%50 düşüş.
- Üretim: buybox işi (`pricing.buyboxRefresh`) taze gözlem alan tenant için `generateSuggestions` çağırır (anahtarlar içeride); kural kaydedilince de koşar. Kural başına koşu başına ≤500 varyant; en özel kural (barkod > ürün > tümü) önce, bir varyant tek kurala düşer; (kural, varyant) başına tek güncel kayıt (`current:true`).

## R2.3 İnsan onaylı uygulama (`pricing.suggestions.apply`)

Her öneri için uygulamadan hemen önce: anahtarlar (**K19**) + güncel metin kabulü (**K3**) → kural açık, duraklatılmamış, **sürümü aynı** → kanal fiyatı öneri anındakiyle aynı → motor **taze veriyle aynı fiyatı** üretiyor → `fuseCheck` geçiyor. Geçmeyen öneri uygulanmaz, nedeniyle raporlanır (`rejected[]`).

- **K9:** yalnız Trendyol **satış** fiyatı yazılır (`platforms.trendyol.prices.salePrice`); liste/üstü çizili fiyat değişmez/yükselmez. Ortak fiyatlı varyant kanal bazlı fiyata geçer, diğer kanallar aynı değerle sabitlenir (etkin fiyatları değişmez). Üstü çizili fiyat gösterilen üründe yukarı öneri engelli, aşağı öneri uyarılı.
- Yayın: mevcut hat (`ExportBatchService`, `UPDATE_PRICE`, yalnız Trendyol) — yayıncı yalnız RPC kabuğunda (api katmanı) verilir.
- **K10:** `PriceHistory` (tenant; kanal bazında gerçekleşen satış fiyatı, liste fiyatı, kaynak `suggestion|external`; TTL 90 gün ≥ 30 gün). Öneri listesinde `lowestPrice10d` ("son 10 gün en düşük" yardımcısı; garanti değil).
- **K11:** metinler "fiyat güncellendi"; "indirim" dili üretilmez (statik test). K9 uyarı kodu `discount_display_active` ekranda "üstü çizili fiyat gösteriliyor" olarak yazılır.
- **K18:** `AuditLogs` `pricing.suggestion.applied` meta: barcode, channel, before, after, buyboxPrice, buyboxAt, ruleId, ruleVersion, source=`rule_approved`, fuse=`pass` (+ tenant/aktör/IP üst alanlarda). Kural oluştur/güncelle/sil/duraklat, ayar aç/kapa (metin sürümü + taslak bayrağı) da denetlenir.
- Tek onayda ≤50 öneri (toplu, önizlemeli). Ret: `dismissSuggestions`.

## R2.4 Anahtarlar ve sorumluluk metni (K3, K19)

| Düzey | Anahtar | Varsayılan | Nereden |
|---|---|---|---|
| Platform | `features.pricingRules` | kapalı | Backoffice → Sistem ayarları taslak/yayın (ADR-0031); Backoffice "Fiyat kuralları" kartı durum + kısayol |
| Tenant | `PricingSettings.enabled` (+ `consent.version/acceptedAt/acceptedBy`, `dualEngineAcknowledgedAt`) | kapalı | Ekran (admin, `pricing.rules.settings`, yalnız ekranda — MCP'ye kapalı) |
| Kural | `PriceRules.enabled` (+ `pausedReason`) | kullanıcı seçer | Ekran (`pricing.rules.save`) |

Sorumluluk metni `PRICING_CONSENT` (`2026-10-01-draft`, **taslak** — avukat gözden geçirene kadar ekranda "Taslak" etiketiyle). AUTO_PRICING_LEGAL §f "özelliği açarken" metninden R2'ye uyarlandı (fiyat yalnız onayla değişir). Sürüm değişince yeniden kabul gerekir.

## R2.5 Yetenekler (ekran = Otopilot/MCP, tek kayıt)

| Yetenek | Etki / kademe / izin | MCP | RPC |
|---|---|---|---|
| `pricing.rules.list` | read / member / `catalog:read` | exposed (tablo) | `PricingService/getRules` |
| `pricing.rules.save` | write / admin / `pricing:manage` | **deferred** (K4: değerleri satıcı ekranda girer) | `saveRule`, `deleteRule` |
| `pricing.rules.settings` | write / admin / `pricing:manage` | **kapalı** (`irreversible`: K3 hukuki kabul ekranda) | `setPricingSettings` |
| `pricing.suggestions.list` | read / member / `catalog:read` | exposed (tablo) | `listSuggestions`, `getPriceHistory` |
| `pricing.suggestions.apply` | write / admin / `pricing:manage`, dış etkili, `audit:'always'` | exposed, **PendingAction onay kartı, risk `high`**, sunucu önizlemesi (önce → sonra, buybox) | `applySuggestions`, `dismissSuggestions` |
| `platform.pricing_rules.overview` | read / platformAdmin | kapalı | `BackofficeBillingService/getPricingRulesOverview` |

- Yeni izin `pricing:manage` (admin rolü). Otopilot örneği: "Buybox'ı kaybettiğim ürünler ve öneriler" → `pricing.suggestions.list {buyboxLostOnly:true}` tablo + `pricing.suggestions.apply` onay kartı.
- Onay kartı önizlemesi sunucudan (`CHANGE_PREVIEWS`, `previewChanges`) gelir; model metni girmez. Kimlik doğrulayıcı yalnız bu tenant'ta **açık** önerilere kart açar.
- **PRC-OPEN S6 (AÇIK KARAR):** toplu onayın günlük eylem kotası sayımı ayarı `pricing.suggestions.bulkApplyQuota` (`platform.pricing`, PRC-CFG): `per_approval` (varsayılan; toplu onay = 1 eylem) | `per_item`. Sohbet ve MCP aynı sayaç.

## R2.6 Göç ve koleksiyonlar

Göç `0022-pricing-rules-tenant` (yalnız indeks, ÇALIŞTIRILMADI; bkz. `docs/MIGRATIONS.md` §6): `PriceRules.type_integ_enabled`, `PriceSuggestions.ruleId_variantId_current` (UNIQUE, kısmi `current:true`) + `status_updatedAt` + TTL 90 g, `PriceHistory.integ_variant_at` + TTL 90 g. `PricingSettings` tek belge (`_id:'pricing'`). Yerelde: yedek → `plan` → `up`; tekillik indeksi kurulmadan `features.pricingRules` açılmaz.

Backoffice özeti (`getPricingRulesOverview`) aktif tenant DB'lerini sırayla okuyup **yalnız toplam sayaç** döner (tenant kimliği/fiyat/SKU yok; motora girmez). Tenant sayısı büyürse (≥1000) `truncated:true`; o eşikte önbellekli sayaç düşünülür.

## R2.7 K-kural → test eşlemesi

| Kural | Uygulama | Test (adı kurala bağlı) |
|---|---|---|
| K1 eşitleme yok, fark > 0 | `priceRule.competitionParams` + tel şeması + motor ek adım + `fuseCheck` | `tests/unit/pricing/legalRules.test.ts` › `legal-K1-no-equalize` (5) |
| K2 tenant'lar arası veri yok | motor yalnız verilen ClientDB; DB yöneticisi içe aktarılmaz; backoffice yalnız toplam | `priceRulesOps.test.ts` › `legal-K2-tenant-isolation`; `tests/static/pricingLegal.static.test.ts` › `legal-K2-tenant-isolation` (3); `pricingR2Wiring.test.ts` (backoffice) |
| K3 varsayılan kapalı + sorumluluk metni | `PricingSettings`, `setPricingSettings`, `PRICING_CONSENT` (taslak) | `priceRulesOps.test.ts` › `legal-K3-default-off` (2) |
| K4 değer dayatılmaz | şemada varsayılan yok; MCP'den kural yazımı yok; form boş | `legalRules.test.ts` › `legal-K4-seller-values`; frontend `prc-r2-pricing.test.ts` (boş form) |
| K5 niyet dışarı çıkmaz | tenant yanıtında benchmark/ortalama yok | `pricingLegal.static.test.ts` › `legal-K5-no-cross-tenant-output` |
| K6 rakip hedefleme yok | kural şemasında alan yok, strict | `legalRules.test.ts` › `legal-K6-no-competitor-field` |
| K7 zorunlu taban/tavan; maliyet yoksa çalışmaz | `floorPrice`, `evaluate`, `fuseCheck` | `legalRules.test.ts` › `legal-K7-floor-required` (3) |
| K8 artış sınırı | `evaluate` (24 sa / 30 g), `fuseCheck` platform sınırı | `legalRules.test.ts` › `legal-K8-increase-cap` (4) |
| K9 liste fiyatı korunur; üstü çizili üründe engel/uyarı | `evaluate`, `fuseCheck`, `priceWrite` | `legalRules.test.ts` › `legal-K9-list-price` (2); `priceRulesOps.test.ts` (uygulama yazımı) |
| K10 ≥30 gün fiyat geçmişi | `PriceHistory` (TTL 90 g), `lowestPrice10d` | `priceRulesOps.test.ts` › `legal-K10-price-history + legal-K18-audit` |
| K11 "indirim" dili yok | bildirim/onay kartı/sonuç metinleri | `pricingLegal.static.test.ts` › `legal-K11-no-discount-language` (2); frontend metin testi |
| K12 sıklık/soğuma/salınım | `evaluate`, `isOscillating`, kural duraklatma | `legalRules.test.ts` › `legal-K12-frequency` (4); `priceRulesOps.test.ts` (uygulamada) |
| K13 bayat veriyle öneri yok | `evaluate` (+ uygulamada yeniden) | `legalRules.test.ts` › `legal-K13-stale-data`; `priceRulesOps.test.ts` › `legal-K13-stale-data (uygulamada)` |
| K14 yalnız resmi API | PRC-R1 adaptörü (değişmedi) | PRC-R1 `buyboxConnector.test.ts` |
| K15 fiyatı kod hesaplar | motor SAF; Otopilot açıklaması | `legalRules.test.ts` (temel öneri), `pricingLegal.static.test.ts` (saf motor içe aktarımı) |
| K16 rakip kimliği saklanmaz | şemalar | `pricingLegal.static.test.ts` › `legal-K16-minimization` (4) |
| K17 çift motor | `evaluate` dış değişiklik → duraklat; açarken uyarı onayı | `legalRules.test.ts` › `legal-K17-dual-engine` (2); `priceRulesOps.test.ts` › `legal-K17-dual-engine` |
| K18 denetim kaydı | `env.audit` alanları | `priceRulesOps.test.ts` › `legal-K10-price-history + legal-K18-audit`, kural denetimi |
| K19 kill-switch | platform/tenant/kural | `priceRulesOps.test.ts` › `legal-K19-kill-switch`, "K19: ... öneri yok" |
| K20 ekonomik bütünlük | kural tenant DB'sinde | `priceRulesOps.test.ts` › `legal-K2-tenant-isolation` (B, A'nın kuralını görmez) |
| — otomatik uygulama yok (K58/PRC-R3) | `NO_PUBLISH`, yayıncı yalnız RPC | `pricingLegal.static.test.ts` › `no-auto-apply` (3); `pricingR2Wiring.test.ts` |
| — sigorta | `fuseCheck` + yeniden değerlendirme | `legalRules.test.ts` (K1/K7/K8/K9 sigorta satırları); `priceRulesOps.test.ts` › "sigorta: ..." (3) |

## R2.8 Yerel doğrulama (insan + yerel oturum)

1. Yedek → `0022` `plan` → `up` (yerel). 2. `features.pricingRules=true` (pilot) + PRC-R1 pilotu açık. 3. Tenant ekranında aç (metin + çift motor onayı) → kural → buybox turu sonrası öneri; tek/toplu onay; Trendyol'da yalnız satış fiyatının değiştiğini, liste fiyatının değişmediğini doğrula (K9; araştırma "insan doğrulamaları" maddesi: hangi alan üstü çizili gösterime gider). 4. Pazaryeri panelindeki otomatik fiyatlandırma ile çakışmada kuralın durduğunu gözle (K17).
