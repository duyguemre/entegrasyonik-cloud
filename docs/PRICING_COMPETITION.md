# Rekabet ve maliyet (PRC-R0 · PRC-CFG · PRC-R1)

Durum: **bulutta yazıldı (2026-10-01, dal `cloud/prc-r1`)**. Göç `0021` ÇALIŞTIRILMADI. Trendyol buybox alanları **yerelde doğrulanacak** (§6). Buybox işi varsayılan **kapalı** (`features.competition`).

Kaynaklar: `docs/research/COMPETITION_PRICING_2026-10.md` (§3, §6, §7), kullanıcı kararları K57 (S1–S5), K20 (ekran = Otopilot), K48 (önyüzde yalnız bariz düzenleme), K43 (site metnine dokunulmadı). ADR-0019 (yetenek kaydı), ADR-0029 (bildirim), ADR-0031 (`_platform` ayarları), ADR-0033 (adaptör sözleşmesi), ADR-0018 (sözleşme bekçisi).

Kapsam dışı (bilinçli): fiyat eşitleme, pazaryerine otomatik fiyat yazma, öneri motoru (PRC-R2/R3), rakip satıcı listesi, kazıma (K57-S2), diğer kanallar (PRC-CH), site metni (K43). Rekabet ayrı bir servis değildir; mevcut zamanlayıcı, yetenek kaydı, bildirim ve ayar motorunun içindedir.

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
