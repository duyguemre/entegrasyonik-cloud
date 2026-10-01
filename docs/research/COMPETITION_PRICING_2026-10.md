# Rekabet Motoru ve Ürün Fiyat Araştırması — 2026-10-01

> İÇ KULLANIM. Rakip adları yalnız bu raporda geçer; site metnine, uygulama arayüzüne ve kullanıcı kararları kaydına taşınmaz (K07).
> Kod yazılmadı. Bu belge araştırma ve öneridir; bağlayıcı karar değildir.
>
> **Güvenilirlik notu (önemli):** Bu oturumda doğrudan sayfa okuma (WebFetch) çıkış vekilinde engellendi. Web bulguları **arama sonucu özetlerine** dayanır. Satır satır doğrulanmış birincil kaynak azdır. Etiketler:
> - **[A]** resmi kaynak (pazaryeri dokümanı, Rekabet Kurumu duyurusu, mevzuat) — özetten görüldü, sayfa açılamadıysa "özet" diye not edildi
> - **[B]** ikincil kaynak (entegratör/üretici blogu, haber, inceleme sitesi; taraflı olabilir)
> - **[Ö]** önceki iç araştırmamızda doğrudan sayfadan alınmış (tarih belirtildi)
> - **[T]** bizim çıkarımımız / tahminimiz
> - **doğrulanamadı / ölçülmedi** = kanıt bulunamadı; varlığı ya da yokluğu iddia edilmez
>
> Tüm web kaynakları için erişim tarihi 2026-10-01'dir (aksi yazılmadıkça).

---

## 0. Yönetici özeti (1 sayfa)

**Bugün ne var.** Entegrasyonik; Trendyol, Hepsiburada, N11, Pazarama (pazaryeri), Ideasoft (e-ticaret) ve Bizimhesap (ön muhasebe/ERP) ile ürün, stok, fiyat ve sipariş akışını yürütür. Katalog hattı Mongo durum makinesi (Stager → Validator → Publisher …), sipariş hattı BullMQ'dur. Kanala fiyat **yazılabiliyor** (`variants.update`). Komisyon modeli var: statik tablo, gerçekleşen oran (Trendyol hakediş eşlemesi) ve tenant override (COM-01..04, `finance.commission.*` yetenekleri). Otopilot (sohbet + uzak MCP) aynı yetenek kaydını kullanır. Yazma işlemleri `PendingAction` onay kartıyla yürür. Plan katmanı `limited/full`, günlük eylem kotası `agentEntitlement.ts`'te tanımlı. **Rakip fiyat, buybox verisi, maliyet alanı ve fiyat kuralı yok.** Ön yüzde `costPrice` alanı var ama arka uç modelinde karşılığı yok (B-13 açık). Kanal fiyat kuralı B-10, kural motoru B-15 olarak planlı ve açık.

**Pazar.** Türkiye'deki büyük entegratörlerde "buybox / rekabet / fiyat robotu" artık beklenen bir özellik. Genelde orta-üst pakette veriliyor [Ö: Sentos Premium, Entegra Paket 3 — `2026-09-28-saas-capability-benchmark.md`]. Global repricer'larda temel set aynı: buybox ya da en düşük fiyata göre "altında/üstünde kal", zorunlu min fiyat, isteğe bağlı max, uyarılar, geçmiş. Fark yaratan konular kâr korumalı tabanlar ve fiyat savaşından kaçınma.

**Veri kaynağı, asıl darboğaz.** Resmi yoldan alınabilen tek rakip sinyali **Trendyol buybox ucu**: `POST …/products/buybox-information`, istek başına ≤10 barkod, ~1000 istek/dk [A, özet]. Bu uç **buybox fiyatını, sıranızı ve çok-satıcı bayrağını** döndürür. Satıcı bazında rakip fiyat listesi **vermez**. Hepsiburada, N11 ve Pazarama'da buybox ya da rakip fiyat ucu **bulunamadı** (doğrulanamadı). Amazon SP-API'de resmi repricing desteği var: Product Pricing v2022-05-01 ve `ANY_OFFER_CHANGED` bildirimi [A]. Ama Amazon TR bugün entegrasyonumuz değil. Kazıma (scraping) yasal, sözleşmesel ve operasyonel açıdan riskli. **Önerilmez.**

**Hukuki çerçeve, tasarımı belirliyor.** Rekabet Kurulu 03.10.2024 tarihli kararla Trendyol ve Hepsiburada'nın otomatik fiyatlandırma soruşturmalarını **taahhütle** kapattı [A]. Taahhütlere göre "Buybox fiyatına **eşitle**" seçeneği kalkıyor. Yalnız "altında kal / üstünde kal" kalıyor ve **%0 / 0 TL fark girilemiyor**. Kullanım zorunlu tutulmuyor. Belirli bir satıcıyı hedefleyen kural yok. Bizim motorumuz da **en az bu çizgide** olmalı.

**Öneri (80/20, üç aşama):**
1. **R1 — Görünürlük (salt okuma, M):** Trendyol buybox durumu + fiyat farkı + net kâr önizlemesi ve "buybox kaybedildi" bildirimi. Ön koşulu maliyet alanı (B-13'ün maliyet kısmı). Otopilot'ta okuma yeteneği olarak açılır.
2. **R2 — Kural tabanlı öneri ve onaylı uygulama (M-L):** B-10 kanal fiyat kuralını "rekabet kuralı"yla genişletir. Kural tipleri altında/üstünde kal (eşitleme yok), zorunlu taban (maliyet + komisyon + kargo + KDV + hedef marj) ve tavan. Çıktı `effect:'propose'` bir öneridir. Uygulama `PendingAction` onay kartıyla, ekranda ve Otopilot'ta aynı akıştan geçer. Bağımsız fiyat sigortası (sanity guard) zorunludur.
3. **R3 — Otomatik/ajan (eşikli, sonra):** Onaylı kurallar için zamanlanmış otomatik uygulama, `full` planda. İnsan "otomatiğe al" der, ajan yalnız öneri metni ve özet üretir. ADR-0018 Karar 3 eşikleri ve gölge mod geçerlidir.

**Paket etkisi:** R1 tüm planlarda (dar kotayla) bir satış argümanıdır. R2'nin otomatik uygulaması ve R3 üst planda (`growth/enterprise`) olur. K46 ile uyumludur: ayrı AI ücreti yok, yapay zekâ maliyeti BYOK.

**En kritik karar soruları** (§8): (1) Hepsiburada, N11 ve Pazarama'da resmi veri yoksa R1 yalnız Trendyol ile mi çıksın? (2) Kazıma kesin olarak reddedilsin mi? (3) Rekabet kuralları hukuk görüşü alınana kadar "öneri + onay" ile mi sınırlı kalsın? (4) Maliyet alanı zorunlu mu olsun (maliyet yoksa otomatik kural kapalı)?

---

## 1. Entegrasyonik bugün (kısa envanter; iç belgelerden)

| Alan | Durum | Kaynak |
|---|---|---|
| Kanallar | Trendyol, Hepsiburada, N11, Pazarama, Ideasoft, Bizimhesap (gerçek). Kargo, e-fatura, Shopify vb. yalnız arayüz formu | CLAUDE.md, INTEGRATIONS_REGISTRY |
| Ürün/stok/fiyat | Katalog hattı: Stager → Importer → Dispatcher → Validator → Publisher → Sentinel. Fiyat, varyant güncellemesiyle kanala gider (`variants.update`, MCP'de `deferred`, "prices.update ayrıştırılacak") | `backend/src/capabilities/domains/catalog.ts:125-128` |
| Stok | Zero-oversell rezervasyonu (ADR-0004), eşzamanlılık testli | ADR-0004 |
| Komisyon | Statik tablo + gerçekleşen (Trendyol hakediş) + tenant override; `finance.commission.*` okuma yetenekleri | BACKLOG COM-01..04, `capabilities/domains/finance.ts` |
| Maliyet / kâr | `costPrice` yalnız ön yüz formunda, arka uç modelinde yok. Kâr raporu B-13 açık | `frontend/.../ProductDefinitionView.vue:526`, PRODUCT_VALUE_PLAN B-13 |
| Fiyat kuralı | Kanal fiyat kuralı B-10 (yüzde/TL, yuvarlama, min/max, önizleme) planlı, açık | PRODUCT_VALUE_PLAN F-09/B-10 |
| Kural motoru / öneri kuyruğu | B-15 (kapalı katalog, kuru çalıştırma), B-17 ActionProposals (eşikli) | PRODUCT_VALUE_PLAN W5 |
| Kampanya | İç kampanya motoru CMP-02 (bitişte geri alma), pazaryeri kampanya API'si yok | BACKLOG CMP-*, WHATSAPP_SOCIAL_CAMPAIGN |
| Otopilot | Sohbet (BYOK) + uzak MCP; tek yetenek kaydı; `Effect = read/propose/write/destructive`; yazma = `PendingAction` (5 dk, tek kullanımlık) + denetim; plan `limited/full` + günlük eylem kotası; `autonomousAllowed` bayrağı var, zamanlayıcı yok | ADR-0019/0034/0035, `operations/agent/PendingActions.ts`, `agentEntitlement.ts` |
| Ajan altyapısı | `AgentTask/AgentRun`, `LlmPort` + `NullLlm` (her görevin LLM'siz yolu zorunlu), gölge mod, eşikler | ADR-0018 Karar 3-4 |
| Canlı veri | LIVE_READONLY: gerçek tenant bağlantılarıyla yalnız okuma, yazma ağ katmanında bloklu | docs/LIVE_READONLY.md, K06/K47 |
| Rakip fiyat / buybox | **Yok.** Kodda `buybox` geçmiyor | grep 2026-10-01 |

---

## 2. Rakipler ve emsal ürünler

### 2.1 Türkiye

| Oyuncu | Rekabet/fiyat özelliği | Fiyat modeli | Veri kaynağı | Sınırlar / not | Kaynak |
|---|---|---|---|---|---|
| Trendyol (pazaryeri içi) | "Otomatik Fiyatlandırma": buybox fiyatının altında/üstünde kal. 2024 taahhüdüyle "eşitle" kalktı, %0/0 TL fark yok, belirli satıcı hedeflenemez, zorunlu değil, kullanımı buybox kriteri sayılmaz | Ücretsiz (panel) | Pazaryerinin kendi verisi | API'ye açık olduğuna dair kanıt yok (doğrulanamadı) | [A] https://webrazzi.com/2024/11/28/rekabet-kurulu-trendyol-un-verdigi-taahhut-sonucunda-sorusturmayi-sonlandirdi/ (28.11.2024); https://rekabet.gov.tr/Dosya/trendyol-duyurusu-20241128134225533.pdf (özet) |
| Hepsiburada (pazaryeri içi) | Aynı mekanizma (Haziran 2023'te açıldı), aynı taahhüt | Ücretsiz (panel) | Kendi verisi | API kanıtı yok | [A] https://www.bloomberght.com/rekabet-kurulu-hepsiburada-sorusturmasini-sonlandirdi-3736183 ; https://rekabet.gov.tr/Dosya/hb-internet-duyurusu-20241204141258702.pdf (Aralık 2024, özet) |
| Sentos | Buybox/rekabet robotu (Trendyol + Hepsiburada): alt/üst limit, kademe, mağaza puanı filtresi, fiyat değişim geçmişi, "30 dk döngü" iddiası; kâr analizi (komisyon + kargo + hizmet bedeli); kur/altın kuruna bağlı fiyat | Yıllık paket ₺9.500–₺89.000; robot Premium'da [Ö 2026-09-28]. Shopify mağazasında $140–$820/yıl [B, güncelliği doğrulanamadı] | **doğrulanamadı** (resmi API mi kazıma mı belirtilmiyor) | Sentos genelinde stok senkron şikâyetleri var (robota özgü değil) [B: https://www.sikayetvar.com/sentos , tarih doğrulanamadı] | [Ö] https://www.sentos.com.tr/buybox-pazaryeri-rakip-analizi/ ; https://www.sentos.com.tr/fiyatlar/ |
| Entegra | "Rekabet analizi — otomatik fiyatlandırma" (Paket 3), "akıllı fiyatlandırma" (maliyet değişince marja göre fiyat), hakediş doğrulama ayrı modül | Yıllık paket ₺10.500–₺150.000 [Ö] | doğrulanamadı | — | [Ö] https://www.entegrabilisim.com/paketler ; https://www.entegrabilisim.com/genel-ozellikler |
| ideaConnect (Ideasoft) | Kanal bazlı fiyatlandırma, "fiyat rekabet robotu" | doğrulanamadı | doğrulanamadı | Ideasoft konektörümüzle aynı ekosistemde | [Ö] https://www.ideasoft.com.tr/ideaconnect/ |
| MixAPI | "Mix AI" fiyat önerisi, günlük rapor | Starter 1.490 TL/ay, ücretli planlara dahil [Ö] | doğrulanamadı | — | [Ö] https://mixapi.store/ |
| Pazarus | Trendyol + Hepsiburada buybox takibi | doğrulanamadı | doğrulanamadı | — | [B] https://pazarus.io/pazarus-ozellikleri/trendyol-hepsiburada-buybox-takibi |
| Sopyo, Dopigo, Stockmount, Ticimax, Akinon, Tam Entegre, Yengeç vb. | Rekabet/fiyat robotu: **doğrulanamadı**. Ticimax'ta site fiyatı/kampanyanın pazaryerine otomatik aktarımı [B] | Pazar genelinde aylık ~200–2.000+ TL [B] | — | — | [B] https://kobitime.com/pazaryeri-entegrasyon-firmalari-karsilastirmasi-2026/ |
| Özel TR repricer'ları (ör. "buyboxer", "rakipfiyat") | Bulunamadı | — | — | — | — |

### 2.2 Global

| Oyuncu | Öne çıkan | Fiyat modeli | Veri kaynağı / eşleştirme | Sınır / not | Kaynak |
|---|---|---|---|---|---|
| Amazon Automate Pricing | Kural: Competitive Buy Box (altında/eşit/üstünde), en düşük fiyat, dış fiyat. Min zorunlu, max opsiyonel. Olay tetiklemeli | Ücretsiz | Amazon'un kendi verisi | Min/max yanlış girilirse kayıp [B] | [B] https://myamazonguy.com/seller-central/how-to-setup-automated-pricing/ |
| Informed.co | ML repricing, buybox/kâr analitiği (SKU/strateji/kategori), 14+ Amazon pazarı + Walmart | $99/ay'dan, sabit ücret (gelir yüzdesi değil) | SP-API | — | [B] https://www.capterra.com/p/199787/Informed-co/ |
| Aura | "Oyun teorisi" algoritması, ~10 sn güncelleme iddiası | ~$27–100/ay (kaynaklar tutarsız) | SP-API | Pazarlama iddiaları doğrulanamadı | [B] https://www.repricer.com/blog/best-amazon-repricer-tools/ (taraflı) |
| BQool | 8 AI + 5 kural stratejisi; stok yaşı/satış hızına göre koşullu | $25/ay'dan | SP-API | "Yavaş döngü" iddiası rakip blogunda (taraflı) | [B] aynı |
| Seller Snap | Oyun teorisi AI; Amazon + Walmart | $100/ay'dan | SP-API | — | [B] https://sellersnap.io/amazon-repricers/ |
| Seller Assistant Repricer | Koşullu kurallar, yeniden kullanılabilir strateji, maliyet/kâr koruması | doğrulanamadı | SP-API | — | [B] https://www.sellerassistant.app/tr/blog/seller-assistant-repricer-full-guide/ (Ağu 2026) |
| Prisync | URL tabanlı rakip fiyat takibi, uyarılar, repricing kuralları | $99 (100 ürün) / $199 (1.000) / $399 (5.000) aylık; API +%20 | Web taraması (URL) | Yorumlarda "brand match / kurallar çalışmıyor, veri elle toplanıyor" [B] | [B] https://prisync.com/compare-plans ; https://www.capterra.com/reviews/153451/Prisync |
| Price2Spy | URL başına; MAP takibi (ekran görüntülü kanıt), varyasyon, geçmiş; repricing ayrı eklenti | $39,95 (500 URL) – $157,95 (2.000 URL) aylık; Premium özel | Web taraması | Günde ≤8 kontrol (Premium) | [B] https://www.trustradius.com/products/price2spy |
| Pricefy | AI ürün eşleştirme; Amazon/eBay/Google Shopping | Ücretsiz; $49/$99/$189 aylık | Tarama + AI eşleştirme | TR pazaryeri desteği doğrulanamadı | [B] https://www.pricefy.io/pricing |
| Omnia Retail | Kural + AI hibrit strateji; GTIN/UPC tabanlı eşleştirme | Kurumsal (doğrulanamadı) | Pazar yeri ve fiyat karşılaştırma verisi | Üretici karşılaştırması (taraflı) | [B] https://www.omniaretail.com/omnia-retail-vs-competera-how-omnia-retail-is-outperforming-competera |
| Competera, Intelligence Node, DataWeave, Minderest | Talep esnekliği / AI optimizasyon, "%99 eşleşme" vb. iddialar | Kurumsal | Tarama + AI | İddialar doğrulanamadı | [B] https://dupple.com/learn/best-ai-price-optimization-tools |
| Rithum (ChannelAdvisor), Linnworks, Feedvisor | Yerleşik repricer (Rithum) | doğrulanamadı | — | — | [Ö] benchmark G6 |

### 2.3 Sentez: temel set ve fark yaratanlar

- **Temel set (olmazsa olmaz):** buybox/en düşük fiyata göre "altında/üstünde kal", zorunlu min ve isteğe bağlı max, değişim geçmişi, buybox kaybı uyarısı, SKU/kategori bazlı kural.
- **Ortak güvenlik ağı:** alt/üst limit, kademe (adım), mağaza puanı ya da kargo süresine göre rakip filtresi.
- **Fark yaratanlar:** (a) **net kârla korunan taban** (komisyon + kargo + KDV + maliyet), (b) fiyat savaşından kaçınma (sürekli düşürmek yerine buybox'ı kazanınca yeniden yükseltme), (c) stok ve satış hızına göre koşullu strateji, (d) kanal arası tutarlılık.
- **Entegrasyonik'in doğal avantajı [T]:** komisyon modeli (gerçekleşen + override), zero-oversell stok, onay kartı + denetim altyapısı ve sohbet/MCP eşitliği zaten var. Rakiplerde "öneriyi sohbetle açıklayan, onayla uygulayan" akış görülmedi [Ö: AGENTIC_PRICING §2.1]. Eksik olan tek şey veri kaynağı ve maliyet alanı.
- **Fiyatlama örüntüsü:** TR entegratörleri robotu üst pakete gömüyor. Global araçlar SKU/URL kademeli aylık ücret alıyor.

---

## 3. Pazaryeri resmi yolları (API olanakları)

| Kanal | Buybox durumu | Rakip fiyatları | Kategori fiyat aralığı | Fiyat önerisi | Kampanya ucu | Fiyat güncelleme ucu ve sınır | Kaynak |
|---|---|---|---|---|---|---|---|
| **Trendyol** | **VAR**: `POST …/products/buybox-information`, gövdede barkod dizisi (≤10/istek), `storeFrontCode` başlığı, ~1000 istek/dk. Yanıt: buybox sırası, buybox fiyatı, çok-satıcı bayrağı (alan adları doğrulanamadı, kodlamadan önce dokümandan teyit) | **Yok** (yalnız buybox fiyatı; satıcı bazında liste yok) | doğrulanamadı | API'de doğrulanamadı. Panelde kampanya fiyat önerisi "son 30 günün en düşük fiyatı" ölçütüyle [Ö] | **Bulunamadı** (panelden) [Ö] | Var. Limit **çelişkili**: resmi "Service Limitations" sayfası özetinde stok-fiyat "sınırsız" [A özet]; ikincil kaynakta 100 istek/dk × 1000 SKU [B]; iç notumuzda ~30/dk/barkod [Ö]. **ölçülmedi** | [A] https://developers.trendyol.com/v3.0/docs/12-product-buybox-check ; https://developers.trendyol.com/v3.0/docs/6-service-limitations ; [Ö] `2026-09-28-trendyol-v2-migration-spec.md` |
| **Hepsiburada** | doğrulanamadı (panelde buybox sıralaması var; API'de bulunamadı) | doğrulanamadı | doğrulanamadı | doğrulanamadı | doğrulanamadı | `listing-external` üzerinden listing fiyat/stok güncelleme (listingId). Limit doğrulanamadı | [B] https://www.zunapro.com/turkey/tr/blog/hepsiburada-entegrasyon-api-rehberi-satici-kilavuzu |
| **N11** | doğrulanamadı | doğrulanamadı (yalnız 3. taraf kazıyıcılar) | doğrulanamadı | doğrulanamadı | doğrulanamadı | SOAP `UpdateProductPriceBySellerCode` / REST. Limit doğrulanamadı | [B] https://www.zunapro.com/turkey/tr/pazaryeri/n11 ; iç: LIVE_READONLY yazma listesi |
| **Pazarama** | doğrulanamadı | doğrulanamadı | doğrulanamadı | doğrulanamadı | doğrulanamadı | Var; "~30 istek/dk" iç notu teyit edilemedi | [Ö] WHATSAPP_SOCIAL_CAMPAIGN §191 |
| **Amazon TR** (entegrasyon yok) | **VAR**: Product Pricing v2022-05-01 `getFeaturedOfferExpectedPriceBatch`, `getCompetitiveSummary`. Hız ~0,033 istek/sn, burst 1 (hesaba göre dinamik) | **VAR** (ilk 20 teklif; `ANY_OFFER_CHANGED` bildirimi SQS/EventBridge) | — | "Featured offer expected price" = buybox'ı kazanmak için beklenen fiyat | — | Listings/Feeds | [A] https://developer-docs.amazon.com/sp-api/docs/product-pricing-api-rate-limits ; https://developer-docs.amazon.com/sp-api/docs/price-adjustment-automation-workflows-guide |

**Kullanım koşulları:**
- **Amazon:** Data Protection Policy ve Acceptable Use Policy 25.11.2025'te güncellendi [A: https://developer-docs.amazon.com/sp-api/lang-it_IT/changelog/updates-to-the-data-protection-policy-and-acceptable-use-policy]. Genel ilke şudur: veri yalnız yetkili satıcıya hizmet için kullanılır, tenant'lar arasında havuzlanamaz ya da satılamaz. Bu ilke bilgi tabanımızdan gelir; ilgili madde **doğrulanamadı**.
- **Trendyol ve diğerleri:** API kullanım sözleşmesindeki veri kullanım kısıtları **doğrulanamadı**. Sözleşme metni insan tarafından okunmalı.
- **Çok kiracılı risk [T]:** A tenant'ının buybox verisinden B tenant'ına içgörü üretmek (havuzlama), hem sözleşme hem rekabet hukuku (bilgi değişimi) açısından risklidir. **Tasarım kuralı:** rakip/buybox verisi yalnız onu çeken tenant'ın ClientDB'sinde tutulur, tenant'lar arası birleştirme yapılmaz.

**Kazıma (scraping) riski. Önerimiz: yapılmasın.**

| Risk | Dayanak | Kesinlik |
|---|---|---|
| Bilişim suçu | TCK 243 (sisteme girme), 244 (engelleme/bozma) — özellikle bot engellerini aşma | [B] çerçeve; kazımaya özgü TR içtihadı **bulunamadı** |
| Veri tabanı hakkı | FSEK ek md. 8 (veri tabanı yapımcısının sui generis hakkı) | [B] https://law.ungovr.org/ai/tr (güvenilirliği düşük) |
| Haksız rekabet | TTK md. 54 vd. | [B] https://www.erdem-erdem.av.tr/bilgi-bankasi/yeni-turk-ticaret-kanununda-haksiz-rekabet-hukumleri |
| Sözleşme | Pazaryeri üyelik ve satıcı sözleşmelerindeki otomatik erişim yasağı. **Satıcı hesabı kapatma riski müşterimize düşer** | doğrulanamadı (metin okunmalı) |
| KVKK | Şahıs şirketi satıcı adı kişisel veri olabilir. Toplanırsa minimizasyon ve aydınlatma gerekir | [T] |
| Operasyonel | Bot engelleri, IP blokları, sayfa yapısı değişince sessiz bozulma. ADR-0018 drift izlemesi kazımayı kapsamaz | [T] |

---

## 4. Rekabet hukuku ve fiyat mevzuatı

- **Trendyol ve Hepsiburada otomatik fiyatlandırma kararı** (Rekabet Kurulu, 03.10.2024, 4054 md. 4 kapsamında, md. 43 taahhüdü) [A]: "eşitle" seçeneği kalktı, %0/0 TL fark girilemiyor, kullanım zorunlu değil, teşvikle zorunlu hale getirilmiyor, kullanımı buybox kriteri sayılmıyor, belirli satıcı hedeflenemiyor.
  - Trendyol duyurusu: https://rekabet.gov.tr/en/Guncel/investigation-concerning-dsm-grup-danism-cfebfc2175adef1193d70050568585c9
  - Hepsiburada duyurusu: https://rekabet.gov.tr/en/Guncel/investigation-conducted-about-d-market-e-13f9b46f30b2ef1193d70050568585c9 (soruşturma 19.10.2023'te açıldı)
- **Trendyol'a 61.342.847,73 TL idari para cezası** (26.07.2023): algoritmaya müdahale ve üçüncü taraf satıcı verisini kendi perakendesi için kullanma [A/B] https://medyascope.tv/2023/07/27/rekabet-kurumundan-trendyola-idari-para-cezasi/ . Bu karar, satıcı verisinin amacı dışında kullanılmasının ciddiye alındığını gösteriyor. Bizim tenant'lar arası veri yasağımızı destekliyor.
- **E-Pazaryeri Platformları Sektör İncelemesi Nihai Raporu** (14.04.2022) [B] https://www.alomaliye.com/2022/04/17/e-pazaryeri-platformlari-sektor-incelemesi-nihai-raporu/ . 2024-2025 dönemine ait yeni sektör incelemesi ve parite ("en düşük fiyat") maddesi kararları **doğrulanamadı**.
- **Bizim için çıkarımlar [T, hukuk teyidi gerekli]:**
  - Motorda "eşitle / 0 fark" kuralı ve isimle belirli rakibi hedefleme **olmamalı**.
  - Aynı tenant'ın birden fazla mağazasına ya da birden fazla tenant'a aynı SKU için koordineli fiyat kuralı uygulanmamalı (hub-and-spoke algısı).
  - Varsayılan kural sunulmamalı. Kullanıcı kuralı kendisi açar, çünkü otomatik fiyat bir "öneri aracı"dır.
- **İndirim ve referans fiyat mevzuatı:** Ticari reklam ve haksız ticari uygulamalar mevzuatında indirim duyurusunda referans fiyatın son 30 günün en düşük fiyatı olması yönündeki kural, Trendyol panelindeki "son 30 gün en düşük" ölçütüyle uyumlu. Mevzuat maddesi bu turda **doğrulanamadı**. Kampanya ve fiyat geçmişini en az 30 gün saklamak hem bu kural hem buybox analizi için gerekli [T].

---

## 5. Kullanıcı istekleri ve acı noktaları

> Kaynakların çoğu arama özeti düzeyinde; şikâyet sitesi ve forum içerikleri açılamadı. Satıcı tarafı birincil ses sınırlı. **Gerçek kullanıcı görüşmesiyle doğrulanmalı** (bkz. §8 S9).

**Acı noktaları**

| # | Acı noktası | Kaynak |
|---|---|---|
| P1 | Fiyat kırma yarışı, marj erimesi, zararına satış | [B] https://birfatura.com/trendyol-buybox-nedir-nasil-girilir/ ; https://www.repricer.com/blog/amazon-repricing-keeps-lowering-price/ (iki robot "0,01 altı" kuralıyla tabana iner; min fiyat başabaşın altındaysa her satış zarar) |
| P2 | Buybox fiyat dışı etkenlere de bağlı (satıcı puanı, kargo süresi, ücretsiz kargo, stok, iade oranı, kampanya katılımı). Satıcı neden kaybettiğini bilmiyor | [B] https://www.ticimax.com/blog/buybox-nedir ; https://www.sentos.com.tr/trendyol-buybox-nedir-nasil-kazanilir/ ; https://birfatura.com/hepsiburada-satici-puani/ |
| P3 | Başka satıcı düşük fiyatla listelemeye bağlanıp markayı/görseli kullanıyor, kalitesiz ürün gönderiyor | [B] https://www.sikayetvar.com/trendyol/trendyolda-saticilarin-buybox-sorunu (tarih doğrulanamadı) |
| P4 | Stok senkron hatası → satıcı puanı düşer → buybox kaybı; "stokta yok cezası" | [B] https://www.sikayetvar.com/sentos ; https://www.paradergi.com.tr/teknoloji/2024/01/30/stokta-yok-cezasina-dikkat (Ocak 2024; pazaryeri ve tutar doğrulanamadı) |
| P5 | Kampanya baskısı (flaş kampanyalarda %25-40 indirim iddiası, doğrulanamadı); kampanya limitiyle iptaller | [B] https://www.sikayetvar.com/trendyol/trendyol-kampanyali-siparislerim-sistem-tarafindan-iptal-edildi-indirim-hakkim-alinamadi (Mayıs 2026, tüketici şikâyeti) |
| P6 | Net kârı bilmemek (komisyon + kargo + KDV + hizmet bedeli). 2026 Trendyol kategori komisyonları kabaca %5-25 | [B] https://www.faturaport.com/blog/on-muhasebe/2026-trendyol-kar-hesaplama-komisyon-kargo-kdv-ve-net-kazanc-rehberi ; https://www.ideasoft.com.tr/trendyol-komisyon-oranlari/ |
| P7 | Otomatik fiyat aracında min/max yanlış ya da boş → büyük kayıp | [B] Amazon Automate Pricing rehberleri (yukarıda) |
| P8 | Fiyat artırınca buybox kaybı (Amazon Fair Pricing, 2025 tarife zamları). TR'de kur/enflasyon kaynaklı zamlarla benzer çatışma [T] | [B] https://fortune.com/article/amazon-sellers-losing-buy-box-price-increases-tariffs-trump-china (Mayıs 2025) |
| P9 | Fiyat izleme araçlarında eşleştirme hatası, verinin elle toplanması | [B] Prisync yorumları (Capterra/G2; tarih doğrulanamadı) |

**Açıkça istenen ya da önerilen özellikler** (çoğu satıcı yazılımı kaynaklı, yani taraflı)
1. Maliyet tabanlı otomatik taban fiyat (başabaş + hedef marj), maliyet değişince tabanın kendiliğinden güncellenmesi
2. Hiçbir koşulda delinmeyen SKU/kategori min-max korkulukları
3. Buybox kaybı ve önemli rakip fiyat değişimi için anlık bildirim
4. Trendyol + Hepsiburada buybox takibi
5. Düşük puanlı ya da "dip fiyat" satıcıları hariç tutan filtre
6. Site ve kampanya fiyatının pazaryerine tutarlı aktarımı; kampanya bitince fiyatın geri alınması

**Dikkat çeken olay:** RepricerExpress "1 peni" hatası, 12.12.2014. Yanlış fiyat itildi, bir satıcı ~£100.000 zarar etti, Amazon komisyonu yine de aldı [B] https://fortune.com/2014/12/15/businesses-livid-as-software-glitch-causes-their-stock-to-sell-for-a-penny-on-amazon . **Ders:** kuraldan **bağımsız** bir fiyat sigortası ve toplu fiyat gönderiminde devre kesici şart.

---

## 6. Uç durumlar (edge case) listesi

| # | Uç durum | Risk | Önerilen davranış |
|---|---|---|---|
| E1 | **Eşleştirme:** aynı ürünün farklı listelemesi | Yanlış rakip fiyatına göre fiyatlama | R1/R2'de **yalnız pazaryerinin kendi eşlemesi**: buybox ucu sizin barkodunuz için pazaryerinin eşlediği ürün sayfasını döner. Kendi eşleştirmemizi (fuzzy/AI) yapmayız |
| E2 | Barkod/GTIN yok veya yanlış | Buybox sorgulanamaz ya da yanlış ürüne bağlanır | "Sorgulanamadı (barkod yok)" diye etiketlenir, kural uygulanmaz. Eşleme sağlığı ekranına (B-16) bağlanır |
| E3 | **Varyantlar** (beden/renk ayrı barkod) | Varyantlar arasında farklı buybox | Varyant (barkod) düzeyinde ölçüm ve kural. Ürün düzeyinde yalnız özet |
| E4 | **Net kâr:** komisyon + kargo (desi) + hizmet/platform bedeli + KDV (satış KDV'si ile komisyon faturası KDV'si ayrı) + maliyet | Görünürde kârlı, gerçekte zararlı fiyat | Taban = f(maliyet, komisyon oranı **kaynağıyla**, kargo tahmini, sabit bedeller, hedef marj). Herhangi bir bileşen "eksik" ise otomatik kural **kapalı**, yalnız öneri ve uyarı |
| E5 | Minimum fiyat koruması | Taban delinmesi | Taban zorunlu. Hesaplanan fiyat < taban ise tabanda dur ve "buybox'a ulaşılamıyor" bildirimi. Asla tabanın altına inme |
| E6 | **Fiyat savaşı döngüsü** (iki robot birbirini tetikler) | Tabana hızlı iniş, salınım | Adım ve frekans sınırı (ör. SKU başına günde ≤N değişiklik), soğuma süresi; buybox kazanılınca "yukarı yokla" (tavana doğru kademeli artış); döngü tespitinde kural askıya alınır ve bildirim gider |
| E7 | **Pazaryeri içi otomatik fiyat + bizim kural** aynı SKU'da | Çakışma, birinin yazdığını diğeri ezer | Kullanıcıya uyarı: "Pazaryeri panelinde otomatik fiyatlandırma açıksa kapatın". Tespit API'yle mümkün değil (doğrulanamadı); fiyat bizden habersiz değişirse "dış değişiklik" uyarısı |
| E8 | Eşitleme ve 0 fark | Rekabet hukuku | Kural tipi olarak yok. Fark ≥ 0,01 TL ya da %0,1 olmak zorunda; altında **ve** üstünde kalma ayrı seçenekler |
| E9 | **MAP / marka kuralları** (marka "en düşük satış fiyatı" belirler) | Marka sözleşmesi ihlali | Ürün ya da marka düzeyinde "marka tabanı" alanı; taban = max(kâr tabanı, marka tabanı). Not: üreticinin satış fiyatını **belirlemesi** 4054 md. 4 açısından ayrı risk; biz yalnız kullanıcının girdiği tabana uyarız |
| E10 | **Kampanya dönemleri** | Kural kampanya fiyatını ezer, kampanya fiyatı bitişte geri dönmez | Kampanyadaki SKU'da (CMP-02) rekabet kuralı **duraklatılır**; kampanya bitince kural yeniden devreye girer. Öncelik: elle fiyat (`isPlatformBasedPrice`) > kampanya > rekabet kuralı > kanal kuralı |
| E11 | **Stok yokken** | Stoksuz üründe fiyat oynatmak anlamsız ya da zararlı; düşük stokta fiyatı düşürmek gereksiz | Stok 0 → kural çalışmaz. Düşük stok eşiğinde isteğe bağlı "düşürme yok, yalnız yükselt" |
| E12 | **Çoklu kanal tutarlılığı** | Kanallar arası büyük fark, müşteri algısı ve kendi kanalını yamyamlaştırma | Kanal başına kural; isteğe bağlı "kanallar arası en fazla %X fark" uyarısı (zorlama değil) |
| E13 | **Veri tazeliği** | Bayat buybox verisiyle fiyatlama | Her ölçüm `observedAt` taşır. Öneri ve uygulama yalnız ≤T dakikalık veriyle yapılır (öneri: 30 dk). Bayat veride ekranda "x dk önce" etiketi gösterilir ve yürütme reddedilir |
| E14 | **Toplu yanlış fiyat** (1 peni olayı) | Büyük finansal kayıp | Bağımsız fiyat sigortası: (a) tabanın altı, (b) önceki fiyata göre ±%X'ten büyük sapma, (c) bir koşuda N'den fazla SKU değişimi → koşu durur, onay ister. Kanal yazımında mevcut `UNKNOWN_OUTCOME` sözleşmesiyle tekrar yazma yok |
| E15 | Fiyat güncelleme hız sınırı | Gecikme, kısmi uygulama | Kanal başına kuyruk ve öncelik (stok > fiyat > içerik; COMPETITOR_GAP #4). Kısmi uygulamada rapor |
| E16 | Pazaryeri fiyatı reddeder (kampanya kilidi, fiyat aralığı dışı vb.) | Sessiz başarısızlık | Hata kodu bulgu kutusuna yazılır (hata kutusu F-07). Sahte başarı yok (C9 dersi) |
| E17 | Rekabet ve fiyat koşulları (Rekabet Kurumu, haksız ticari uygulama) | Hukuki | §4 kuralları, varsayılan kapalı, denetim kaydı (kim, hangi kural, ne zaman) |
| E18 | Tenant'lar arası veri | Sözleşme ve rekabet | Rakip/buybox verisi tenant ClientDB'sinde kalır; platform düzeyinde birleştirme ve kıyaslama yok |
| E19 | LIVE_READONLY / yerel | Gerçek fiyat yazımı | R1 tamamen okuma: buybox POST'u okuma niteliğinde ama **POST** olduğu için live-readonly izin listesine açıkça eklenmesi gerekir (insan kararı). R2 yazmaları LIVE_READONLY'de bloklu kalır |
| E20 | Kur ve enflasyon | Maliyet hızla eskir, taban bayatlar | Maliyet alanında `updatedAt`. N günden eski maliyette uyarı. İsteğe bağlı döviz bazlı maliyet (sonra) |

---

## 7. Entegrasyonik için önerilen yol haritası

### 7.1 İlkeler
- **Resmi API öncelikli.** Kazıma yok (§3). Veri yoksa yetenek o kanalda "desteklenmiyor" der (dürüstlük, C7/E3).
- **Karar deterministik, LLM yalnız açıklar** (ADR-0018 Karar 3e). Fiyat hesabı ve sigorta kodda yaşar. Otopilot "neden bu fiyat"ı anlatır.
- **Ekran ve Otopilot eşitliği** (ADR-0019, K20): her yetenek tek kayıtta; okuma `read`, öneri `propose`, uygulama `write` + `PendingAction`.
- **Overengineering yok** (K03): rekabet motoru, ayrı servis değil, B-10 fiyat kuralının bir **kural tipi**dir.

### 7.2 Aşamalar

| Aşama | Kapsam | Mimariye oturuşu | Ön koşul | Büyüklük [T] | Plan |
|---|---|---|---|---|---|
| **R0 — Ön koşul** | (a) `Variants.costPrice` arka uç alanı + `updatedAt` (B-13'ün maliyet kısmı). (b) Trendyol buybox ucu alan adlarını dokümandan **elle teyit** (C11 dersi). (c) Hepsiburada/N11/Pazarama satıcı desteğine veya hesap yöneticisine "buybox/rakip fiyat API'si var mı" sorusu (insan görevi) | Şema göçü (yedek + onay, CLAUDE.md kural 3) | — | S-M | — |
| **R1 — Görünürlük (salt okuma)** | Trendyol: barkod başına buybox sırası/fiyatı/çok-satıcı; "buybox'a fark" (TL/%) + **net kâr önizlemesi** (bu fiyatta ve buybox fiyatında kâr ne olur, komisyon kaynağı etiketli). "Buybox kaybedildi" ve "buybox'a ulaşmak tabanın altında" bildirimleri. Ürün listesinde rozet + filtre. Fiyat geçmişi ≥30 gün | Adaptöre `CapabilityKey: 'pricing.buybox.read'` (manifesto; diğer kanallar `unsupported`). Zamanlanmış okuma işi `JobRunRegistry` altında (sadece değişen/aktif SKU, 10'lu partiler). Tenant ClientDB `BuyboxSnapshots` (TTL ~90 g). Yetenekler `pricing.buybox.list` / `pricing.margin.preview` (`effect:'read'`, MCP `exposed`). Bildirim ADR-0029 olay kataloğu. Drift: ADR-0018 sözleşme bekçisi bu uca da bağlanır | R0 | BE M · FE M | Tüm planlar (limited'da SKU sayısı ve sıklık düşük) |
| **R2 — Kural tabanlı öneri + onaylı uygulama** | B-10'a "rekabet" kural tipi: `{ mode: 'below'|'above', delta (≥0,01 TL veya ≥%0,1), floor: 'margin'|'fixed'|'brand', targetMarginPct, ceiling, step, maxChangesPerDay, cooldownMin, excludeIfOutOfStock }`. Motor kuru çalışır ve **öneri** listesi üretir (önce/sonra fiyat, kâr, gerekçe). Kullanıcı tek tek ya da toplu onaylar → `PendingAction` → mevcut fiyat yayın hattı. Fiyat sigortası (E14) yürütmede de çalışır | `pricing.rules.*` (`write`, admin), `pricing.suggestions.list` (`read`), `pricing.suggestions.apply` (`write`, PendingAction, risk `high`, toplu ise önizlemeli). Otopilot: "Buybox'ı kaybettiğim ürünler ve önerilerin" → tablo + onay kartı. B-15 kural motoru ve B-17 ActionProposals ile aynı kuyruk (çift kuyruk yok). Günlük eylem kotası `agentEntitlement` (toplu onay = 1 eylem mi N mi, karar S6) | R1, B-10 | BE M-L · FE M | limited: öneri + elle onay; full: aynısı + yüksek kota |
| **R3 — Otomatik / ajan** | Kullanıcının "otomatiğe al" dediği kurallar insan onayı olmadan zamanlanmış koşar (yalnız `full` plan, `autonomousAllowed`). Ajan: günlük özet, "fiyat savaşı tespit edildi, kuralı askıya aldım", strateji önerisi (metin). Otomatik koşuda sigorta ihlali → koşu durur, PendingAction'a döner | ADR-0018 Karar 3 (AgentTask, bütçe, kill-switch, gölge mod 14 gün, onay oranı ≥%50 eşiği). `source:'rule'` denetimi. LLM'siz yedek yol zorunlu | R2 + ≥4 hafta R2 kullanım verisi + hukuk görüşü | BE M · FE S | full |
| **R4 — Kanal genişletme (koşullu)** | Hepsiburada/N11/Pazarama resmi uç bulunursa R1-R2 aynı yetenek anahtarlarıyla genişler. Amazon TR entegrasyonu gelirse SP-API `getFeaturedOfferExpectedPrice` + `ANY_OFFER_CHANGED` en zengin kaynak olur | Adaptör manifestosu (ADR-0033 playbook) | Resmi uç kanıtı | kanal başına S-M | — |

**Bilinçli olarak yapılmayanlar (sonra sepeti, K03):** kendi ürün eşleştirmemiz (fuzzy/AI), web kazıma, Google Shopping/fiyat karşılaştırma sitesi verisi (ücretli veri sağlayıcı gerekir, Protokol 12), talep esnekliği/ML optimizasyonu, "oyun teorisi" ajanı.

### 7.3 Veri kaynağı seçenekleri ve maliyet

| Seçenek | Kapsam | Maliyet [T] | Risk | Öneri |
|---|---|---|---|---|
| Pazaryeri resmi API (Trendyol buybox) | Yalnız buybox fiyatı ve sırası, yalnız Trendyol | Ek ücret yok; çağrı kotası ~1000/dk paylaşımlı | Düşük (alan adları teyit, V1→V2 geçişi 15.10.2026) | **Evet (R1)** |
| Satıcının kendi girdisi (rakip URL'si + elle fiyat) | Her kanal; elle | Yok | Bayat veri | R1'de "elle rakip fiyat notu" olarak isteğe bağlı (S) — karar S2 |
| Ücretli fiyat istihbaratı sağlayıcısı (TR pazaryeri kapsayan) | Rakip listesi, geçmiş | Ölçülmedi; global örnekler $40–$400/ay/hesap (URL/SKU kademeli) | Sağlayıcının kendi kazıma riski bize taşınır; sözleşme incelemesi | Şimdi hayır; talep gelirse değerlendirilir (Protokol 12) |
| Kendi kazıyıcımız | Geniş | Altyapı + bakım + IP | Yüksek (§3) | **Hayır** |
| Amazon SP-API | Zengin (teklifler, beklenen buybox fiyatı) | Ek ücret yok | Kota düşük (0,033/sn); politika | Amazon TR entegrasyonuyla birlikte |

### 7.4 Paket ve fiyatlamaya etkisi
- K46 ile uyumlu: ayrı AI ücreti yok. Rekabet modülü bir **ürün özelliği**dir, kullanım bazlı kredi yoktur.
- Öneri:
  - **R1 (görünürlük):** tüm planlarda. Starter'da SKU tavanı (ör. 100 SKU, günde 4 tazeleme). Bu bir dönüşüm kancası olur.
  - **R2 (öneri + onay):** growth ve üstünde tam; starter'da yalnız "öneriyi gör".
  - **R3 (otomatik):** growth/enterprise, `autonomousAllowed`.
- Pazar karşılaştırması: TR'de robot orta-üst pakette [Ö], global giriş $25–100/ay. Ayrı eklenti olarak satmak yerine üst pakete itme gerekçesi olarak kullanmak tutarlıdır [T]. Fiyat değerleri Protokol 12, insan kararıdır.
- **Site:** R1 canlıda ve doğrulanmış olmadan "rekabet analizi / fiyat robotu" vaadi yapılmaz (K43 yayın kapısı, COMPETITORS_2026-09 §6). Sitede "eşitleme", "rakibi otomatik geç" gibi dil kullanılmaz.

### 7.5 Riskler

| Risk | Etki | Azaltma |
|---|---|---|
| Hukuki (rekabet hukuku, fiyat mevzuatı) | Yüksek | Eşitleme yok, varsayılan kapalı, tenant'lar arası veri yok, denetim kaydı; R3 öncesi hukuk görüşü |
| Yanlış fiyatla finansal kayıp | Yüksek | Taban zorunlu, bağımsız sigorta, devre kesici, onay kartı, R3'te gölge mod |
| Veri kapsamı dar (yalnız Trendyol) | Orta (satış argümanı zayıflar) | Dürüst kanal desteği tablosu; R0(c) ile diğer kanalları araştır |
| API değişimi (Trendyol V1→V2, alan adları) | Orta | ADR-0018 sözleşme bekçisi + manifesto `lastVerifiedAt` |
| Maliyet verisi eksik → kâr hesabı yanlış | Orta | Eksikse otomatik kural kapalı; "kapsam" göstergesi (B-13 `coverage`) |
| Pazaryeri içi otomatik fiyatla çakışma | Orta | Uyarı + dış değişiklik tespiti |
| Kota/hız sınırı | Düşük-Orta | Değişen/aktif SKU önceliği, kanal kuyruğu |

---

## 8. Kullanıcıya sorulacak karar soruları

| # | Soru | Önerimiz |
|---|---|---|
| S1 | Resmi veri yalnız Trendyol'da doğrulandı. R1 **yalnız Trendyol** ile mi çıksın, yoksa diğer kanallar için resmi kanal araştırması (R0c, satıcı desteğine soru) bitene kadar mı beklensin? | Yalnız Trendyol ile çıksın; diğer kanallar "yakında" değil "desteklenmiyor" diye gösterilsin |
| S2 | Rakip verisi için **kazıma** (kendi ya da üçüncü taraf) kesin olarak reddedilsin mi? Kullanıcının elle girdiği rakip fiyatı/URL notu kabul edilsin mi? | Kazıma: hayır. Elle not: evet, ama düşük öncelik |
| S3 | R2'deki otomatik uygulama ve R3 için **hukuk görüşü** alınsın mı (rekabet hukuku + pazaryeri API sözleşmesi)? O gelene kadar yalnız "öneri + onay" mı kalsın? | Evet; R1-R2 hukuk görüşü beklemeden, R3 bekleyerek |
| S4 | **Maliyet alanı** zorunlu mu olsun (maliyet yoksa otomatik kural kapalı, yalnız uyarı)? B-13'ün maliyet kısmı öne çekilsin mi? | Evet ve evet (R0) |
| S5 | Paketleme: R1 tüm planlarda sınırlı, R2 tam hali growth+, R3 growth/enterprise. Uygun mu? Starter SKU tavanı? | Evet; tavan 100 SKU, günde 4 tazeleme (fiyatlar Protokol 12) |
| S6 | Toplu onay (ör. 40 ürünün fiyat önerisi tek kartta) günlük Otopilot eylem kotasından **1** mi düşsün, **N** mi? | 1 eylem (kota kötüye kullanım koruması, ürün sayısı ayrıca tavanlı) |
| S7 | Tazeleme sıklığı ve veri tazelik eşiği: buybox kaç dakikada bir okunsun, kaç dakikadan eski veriyle öneri uygulanmasın? | Aktif SKU'da 30 dk, eşik 30 dk (kota ölçülmedi; R1'de ölçülecek) |
| S8 | LIVE_READONLY'de buybox ucu (`POST`) okuma izin listesine eklensin mi (yerelde gerçek veriyle R1 doğrulaması için)? | Evet, yalnız bu uç ve yalnız gövdede barkod listesiyle |
| S9 | 3-5 mevcut ya da aday satıcıyla 20 dakikalık görüşme yapılsın mı (acı noktaları web'den yalnız ikincil kaynakla geldi)? | Evet, R2 kural alanlarını kesinleştirmeden önce |
| S10 | Sitede bu özellik ne zaman ve hangi dille anılsın? | R1 canlı ve doğrulanmış olunca; "buybox görünürlüğü ve kâr korumalı fiyat önerisi" çizgisinde; eşitleme/rakip yenme dili yok |

---

## 9. Açık doğrulamalar (bir sonraki erişimli turda)
- Trendyol buybox ucunun yanıt alan adları, V2 yolu ve hız sınırı; fiyat/stok güncelleme limiti (üç kaynak çelişkili)
- Hepsiburada / N11 / Pazarama: buybox, rakip, fiyat önerisi ya da kampanya ucu var mı (resmi doküman + satıcı desteği)
- Pazaryeri API kullanım sözleşmelerinde veri kullanım kısıtları
- Sentos ve Entegra robotlarının veri kaynağı (API mi kazıma mı)
- 2024-2026 Rekabet Kurumu e-ticaret sektör incelemesi ve parite kararları; indirim ve referans fiyat mevzuat maddesi
- Amazon TR marketplace ID ve AUP fiyat verisi maddesi

## Kaynaklar (seçme; erişim 2026-10-01)
- https://developers.trendyol.com/v3.0/docs/12-product-buybox-check
- https://developers.trendyol.com/v3.0/docs/6-service-limitations
- https://developer-docs.amazon.com/sp-api/docs/product-pricing-api-rate-limits
- https://developer-docs.amazon.com/sp-api/docs/price-adjustment-automation-workflows-guide
- https://developer-docs.amazon.com/sp-api/lang-it_IT/changelog/updates-to-the-data-protection-policy-and-acceptable-use-policy
- https://rekabet.gov.tr/en/Guncel/investigation-concerning-dsm-grup-danism-cfebfc2175adef1193d70050568585c9
- https://rekabet.gov.tr/en/Guncel/investigation-conducted-about-d-market-e-13f9b46f30b2ef1193d70050568585c9
- https://webrazzi.com/2024/11/28/rekabet-kurulu-trendyol-un-verdigi-taahhut-sonucunda-sorusturmayi-sonlandirdi/
- https://www.bloomberght.com/rekabet-kurulu-hepsiburada-sorusturmasini-sonlandirdi-3736183
- https://medyascope.tv/2023/07/27/rekabet-kurumundan-trendyola-idari-para-cezasi/
- https://www.alomaliye.com/2022/04/17/e-pazaryeri-platformlari-sektor-incelemesi-nihai-raporu/
- https://prisync.com/compare-plans · https://www.trustradius.com/products/price2spy · https://www.pricefy.io/pricing · https://www.capterra.com/p/199787/Informed-co/
- https://fortune.com/2014/12/15/businesses-livid-as-software-glitch-causes-their-stock-to-sell-for-a-penny-on-amazon
- https://birfatura.com/trendyol-buybox-nedir-nasil-girilir/ · https://www.ticimax.com/blog/buybox-nedir · https://pazarus.io/pazarus-ozellikleri/trendyol-hepsiburada-buybox-takibi
- İç: `docs/research/2026-09-28-saas-capability-benchmark.md`, `COMPETITORS_2026-09.md`, `COMPETITOR_GAP_2026-09-30.md`, `AGENTIC_PRICING_2026-10-01.md`, `WHATSAPP_SOCIAL_CAMPAIGN_2026-09-30.md`, `2026-09-28-trendyol-v2-migration-spec.md`, `frontend/docs/PRODUCT_VALUE_PLAN.md` (B-10, B-13, B-15, B-17), ADR-0018/0019/0034/0035
