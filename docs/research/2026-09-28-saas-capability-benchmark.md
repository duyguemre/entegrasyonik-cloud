# SaaS Yetenek Çıtası (Capability Benchmark) — 2026-09-28

Amaç: Entegrasyonik'in "sistem yetenekleri, çok kiracılı bir pazaryeri/ERP entegrasyon SaaS'ı için ne gerekiyorsa o olmalı; frontend bütün sistem yeteneklerine cevap verebilmeli" hedefi için sektör çıtasını çıkarmak, bugünkü durumu kanıtlı ölçmek ve önceliklendirilmiş bir "Hedef yetenek kataloğu" üretmek.

Kapsam kuralları: kod yazılmadı; BACKLOG.md ve MASTER_STATE.md GÜNCELLENMEDİ; rakip iddiaları kaynaklı, doğrulanamayanlar "doğrulanamadı" işaretli. Bu belge bir araştırma girdisidir; öncelik/kapsam kararları insan onayı gerektirir (Protokol 12).

## 0. Yöntem, kaynak güvenilirliği, okuma kılavuzu

Kaynak güvenilirlik etiketi (her kaynak kaydında):
- **A** = üretici/resmi sayfa, bu çalışmada doğrudan çekildi (WebFetch) ve içerik okundu.
- **B** = üretici/resmi sayfa başlığı arama sonucunda göründü, içerik arama özetinden alındı (sayfa tek tek çekilmedi).
- **C** = üçüncü taraf inceleme/blog; yalnızca destekleyici, tek başına kanıt sayılmaz.

Entegrasyonik durum etiketleri: **VAR** (kodda çalışan yol + kanıt), **YARIM** (kısmen / yalnız backend / yalnız UI / kopuk), **YOK** (kayıt/kod bulunamadı). Kanıt yolları repo köküne göredir; `INTEGRATIONS_REGISTRY.md` (IR), `SAAS_CORE_AUDIT.md` (SCA), `PRODUCT_SURFACES.md` (PS), `BACKLOG.md` (BL), `docs/OPERATION_POLICY.md` (OP) kısaltmaları kullanıldı.

Boyut ölçeği (kaba, insan-gün değil, göreli): **S** ≤ ~3 gün, **M** ~1–2 hafta, **L** > 2 hafta veya dış bağımlılık/karar gerektirir. BE = backend, FE = frontend.

Yaygınlık ölçeği: **ŞART** (incelenen Türkiye entegratörlerinin çoğunda ve/veya küresel ürünlerin çoğunda var), **SIK** (birkaç ürün / üst pakette), **AYIRT** (yalnızca bir–iki ürün, farklılaştırıcı).

Önemli sınırlar (dürüstlük notu):
1. Repo kanıtı, ana çalışma dizinindeki (`D:\ENTEGRASYONIK_FACTORY`) dosyalardan okundu; bu worktree'nin (`worktree-agent-a0294e5b5da21ad9a`) `backend/src/api/index.ts` içeriği ana ağaca göre daha eskidir (`BillingService`, `TenantDataService` yok). Durum tespiti ana ağaçtaki güncel hâle göredir.
2. `SAAS_CORE_AUDIT.md` 2026-09-26 tarihlidir; sonradan kapanan kalemler (ADR-0001/0003/0004/0005/0006/0008) `BACKLOG.md` ve `docs/OPERATION_POLICY.md` ile birlikte okunarak güncellendi. Bu çalışmada canlı sistem, DB veya çalışan uygulama incelenmedi; "VAR" ifadesi "kodda ve karakterizasyon/mock testlerinde vardır" demektir, canlıda doğrulandığı anlamına GELMEZ.
3. Rakip fiyatları/paketleri tarih damgalı web sayfalarından alındı; değişebilir. Pazar payı, müşteri sayısı gibi doğrulanamayan metrikler kullanılmadı.
4. Rakiplerde 2FA/SSO, giden webhook, denetim günlüğü ayrıntıları resmi sayfalardan doğrulanamadı (aşağıda ilgili satırlarda işaretli). Bu yetenekler "SaaS için genel çıta" olarak katalogda yer alır, rakip kaynaklı değildir.

## 1. İncelenen ürünler (13) ve kaynakları

Türkiye pazaryeri/çok kanallı yazılımlar

| # | Ürün | Öne çıkan gerçek özellikler (kaynaktan) | Kaynak (etiket) |
|---|---|---|---|
| T1 | Entegra (Entegra Bilişim) | 21 ana özellik: yapay zeka ile barkoddan ürün ekleme, anlık stok güncelleme, toplu işlem+Excel, tek tuşla e-fatura/kâğıt fatura, rekabet analizi (otomatik fiyat), platform bazlı kâr marjı ("akıllı fiyatlandırma"), set/paket (sanal paket), kampanyaya stok ayırma (platform bazlı satış limiti), pazaryeri muhasebe ve ödeme takibi, mobil depo otomasyonu (barkodlu sipariş doğrulama), 3. parti fulfillment, XML import/export, mesajlaşma, ürün araştırması, esnek Excel raporlama, iOS/Android uygulama, API web servis, haftanın 7 günü destek + ücretsiz eğitim. Paketler: "Sadece Fatura" ₺10.500/yıl ... Paket 5 ₺125.000/yıl; iade yönetimi Paket 2, muhasebe + rekabet analizi Paket 3, uluslararası ihracat Paket 5; e-fatura kontör (token) sistemiyle. Hakediş takibi ayrı modül (₺7.500): komisyon/kargo/ceza/mükerrer kargo kesintisi, eksik ödeme kontrolü (HB, Trendyol, GittiGidiyor, N11). | https://www.entegrabilisim.com/genel-ozellikler (A) · https://www.entegrabilisim.com/paketler (A) · https://www.entegrabilisim.com/pazaryerleri-hakedis-takibi-b-MTE1 (A) |
| T2 | Dopigo | Toplu ürün güncelleme, varyant, set/paket, kanal bazlı fiyat, ortak (tek) stok, kategori eşleme, barkod üretimi, görsel yönetimi; siparişleri dakikalar içinde senkronlar; e-fatura otomatik (Sovos, ICE, SNI); kargo anlaşmaları (Hepsijet, Aras, Yurtiçi, Kolaygelsin, PTT, Sürat); WMS; kullanıcı yetkileri; API; kampanya yönetimi; gelir/gider, komisyon ve maliyet analizi, indirilebilir raporlar; Logo/Mikro/Paraşüt/ETA/DİA muhasebe; Oplog/Amazon FBA/Hepsilojistik; 3 paket (Pazaryeri, E-Ticaret, Muhasebe/ERP), kredi kartsız 14 gün deneme; yüzde/tutar bazlı toplu fiyat-stok artış/azalış ve otomatik stok güncelleme (arama özeti). | https://www.dopigo.com (A) · https://www.dopigo.com/ne-ise-yarar/ (A) · https://www.dopigo.com/urun-yonetimi/ (A) · https://www.dopigo.com/stok-yonetimi/ (B) |
| T3 | Sentos | "Ürünü bir kez tanımla, tüm kanallara gönder", kural bazlı otomatik gönderim, sipariş gelince e-fatura otomatik, kanal/ürün bazlı satış-kâr-iade raporları, Buybox/rekabet robotu (Trendyol+Hepsiburada; alt/üst limit, kademe, mağaza puanı filtresi, fiyat değişim geçmişi; 30 dk döngü iddiası), perakende (POS/cari), kâr analizi (komisyon+kargo+hizmet bedeli), rol tabanlı yetki, iade yönetimi, API. 21 pazaryeri, 10 e-fatura sağlayıcı, 9 e-ticaret platformu, 11 kargo, 17 muhasebe/ERP, 8 yurtdışı kanal, 5 fulfillment. Kargo: toplu etiket tek PDF, otomatik gönderi, takip no'nun siparişe/pazaryerine yazılması, hacimsel desi, desi/bölge/pazaryerine göre otomatik kargo seçimi kuralı, iade kargosu. Raporlar: satış analizi, kâr, kanal karşılaştırma, stok hareketi (kaynağıyla), envanter değeri, cari bakiye; Excel export. 5 kademeli yıllık paket (₺9.500–₺89.000): Premium'da ERP + otomatik fiyat robotu + API, Platinum'da yurtdışı kanallar + finansal mutabakat; 7 gün kredi kartsız deneme. | https://www.sentos.com.tr/ (A) · https://www.sentos.com.tr/pazaryeri-entegrasyonu/ (A) · https://www.sentos.com.tr/fiyatlar/ (A) · https://www.sentos.com.tr/kargo-entegrasyonlari/ (A) · https://www.sentos.com.tr/sentos-raporlar-modulu-2/ (A) · https://www.sentos.com.tr/buybox-pazaryeri-rakip-analizi/ (A) |
| T4 | Ticimax / Sopyo / Entegra-Ticimax ekosistemi | Kanala özel TL/yüzde fiyat kuralı, depo bazlı stok tahsisi (çoklu depo), fiziksel mağaza+depo+online stok senkronu; İdeasoft App Store'da Sopyo (Akakçe, Çiçeksepeti, Hepsiburada, N11, PttAVM, Pazarama, Trendyol) ve Trendyol/Elements gibi pazaryeri uygulamaları. | https://www.ticimax.com/e-ticaret-pazaryeri-entegrasyonlari/ (B) · https://apps.ideasoft.com.tr/sopyo-pazaryeri-entegrasyonu (B) · https://www.entegrabilisim.com/ticimax-entegrasyonu (B) |
| T5 | e-Fatura/e-Arşiv entegratörleri (Nilvera, Uyumsoft, Sovos, Paraşüt) | Sipariş geldiğinde e-fatura/e-arşiv otomatik üretimi, müşteriye iletim; Nilvera KEP/e-imza/e-defter/e-arşiv/e-irsaliye paketi; Paraşüt: sipariş → cari/fatura/tahsilat, "fatura resmileştirme" (e-fatura/e-arşiv), iade kayıtları, stok hareketleri. | https://www.nilvera.com/ (B) · https://www.jetstok.com/sovos-entegrasyonu (B) · https://apps.ideasoft.com.tr/uyumsoft-e-fatura-entegrasyonu (B) · https://www.parasut.com/entegrasyonlar (B) |
| T6 | Kargo entegratörleri (Kargo Entegratör, Kargopi vb.) | Tek API ile çok firma (Yurtiçi, Aras, MNG, PTT, Sürat…), sipariş → gönderi, etiket/barkod, toplu etiket, takip numarasının siparişe ve pazaryerine işlenmesi. | https://kargoentegrator.com/kargo-api/ (B) · https://kargopi.com/ (B) |
| T7 | Hakediş/mutabakat araçları (Prapazar, Melontik, Nitru) | Pazaryeri hakediş raporu ile sipariş/banka tahsilatı eşleştirme, eksik ödeme/fark tespiti, ödeme emri eşleştirme, kargo faturası kontrolü, hakediş gecikmesi uyarısı. | https://prapazar.com/tr/program-ozelligi/pazaryeri-hakedis-mutabakattakibi (B) · https://melontik.com/ (B) |

Küresel çok kanallı ürünler

| # | Ürün | Öne çıkan gerçek özellikler | Kaynak (etiket) |
|---|---|---|---|
| G1 | Linnworks | 100+ kanal iki yönlü senkron, 70+ kargo firması (canlı fiyat/etiket/takip), kural motoru (yönlendirme, kargo atama, etiketleme, sıralama), talep tahmini + satın alma emri, kanal/SKU bazlı raporlama, ilan yönetimi (ücretli eklenti), 40 gün ortalama go-live ile onboarding/veri taşıma hizmeti; kural ile düşük stok bildirimi; REST API; herkese açık durum sayfası. | https://www.linnworks.com/features/ (A) · https://docs.linnworks.com/articles/#!documentation/low-stock-notification-macro (B) · https://status.linnworks.com/ (B) |
| G2 | Brightpearl | Automation Engine (koşul→eylem: depo yönlendirme, kısmi sevk/backorder, dropship, faturalama), çok lokasyonlu envanter + WMS, tahmin/satın alma önerisi, muhasebe entegrasyonları (Xero, QuickBooks, Sage Intacct), KPI/analitik, derin API, OAuth, kullanıcı rol/izinleri. | https://www.brightpearl.com/features (A) · https://help.brightpearl.com/s/article/213285743 (B) · https://help.brightpearl.com/hc/en-us/articles/360027461332-User-permissions (B) |
| G3 | Sellercloud | PIM + çok kanallı ilan, envanter senkronu, WMS, Order Rule Engine, satın alma emirleri, kargo, raporlama, muhasebe, REST API (Bearer), çalışan rolleri ve "security template" izinleri. | https://www.sellercloud.com/features/ (A) · https://help.sellercloud.com/omnichannel-ecommerce/order-rule-engine/ (B) · https://help.sellercloud.com/omnichannel-ecommerce/user-roles (B) |
| G4 | Cin7 | Çok lokasyon/raf/parti/seri takibi, yeniden sipariş noktası + otomatik satın alma emri, AI talep tahmini, 700+ entegrasyon, Xero/QuickBooks çift yönlü senkron (maliyet+vergi), kanal/ürün/lokasyon bazlı kâr marjı raporu, B2B portal ve EDI. | https://www.cin7.com/features/inventory/inventory-management/ (A) · https://www.cin7.com/blog/multichannel-order-management-system/ (B) |
| G5 | Feedonomics | 300+ kanal için besleme (feed) yönetimi, IF/THEN kural dili, kanal bazlı filtreleme, hata izleme/uyarı, siparişi en uygun depo/3PL'e yönlendirme. (Özellik sayfası çekildiğinde içerik boş döndü; bilgi arama özetinden.) | https://feedonomics.com/features-and-benefits/ (B) |
| G6 | ChannelAdvisor / Rithum (CommerceHub) | 100–300+ kanal; yerleşik repricer (kural/parametre bazlı öner veya uygula), katalog/envanter/sipariş/iade yönetimi, reklam. | https://en.wikipedia.org/wiki/Rithum (C) · https://www.gartner.com/reviews/market/channel-integration-software/vendor/commercehub/product/channeladvisor-platform (C) |
| G7 | Ecomdash | Yakın gerçek zamanlı stok senkronu, çoklu depo, kit/bundle, ürün/depo bazlı düşük stok uyarısı ve yeniden sipariş kuralı, otomasyon botları. | https://thedigitalmerchant.com/ecomdash-review/ (C) |

Genel SaaS / mevzuat referansları (rakip değil)
- Trendyol webhook ile sipariş olayı bildirimi (5 dk aralıkla yeniden deneme, `x-api-key`): https://developers.trendyol.com/en/docs/trendyol-marketplace/webhook/webhook-create (B; ayrıca 2026-09-27 doğrulama turunda resmi sayfalar çekilmişti: `docs/research/2026-09-27-api-verification.md`).
- e-İrsaliye (GİB): https://ebelge.gib.gov.tr/eirsaliyehakkinda.html (B) — sevk sonrası 15 dk içinde düzenleme kuralı arama özetinde geçiyor; hangi satıcı sınıfının pazaryeri satışında zorunlu olduğu doğrulanamadı.
- KVKK / VERBİS: https://verbis.kvkk.gov.tr/ (B) — kayıt yükümlülüğü eşikleri ve veri sahibi hakları; hukuki yorum bu belgenin kapsamı dışındadır.

## 2. Yetenek matrisi

Sütunlar: **Pazar** = yaygınlık + kaynak numarası (§1); **Entegrasyonik** = bugünkü durum + kanıt; **BE/FE** = kalan iş büyüklüğü; **Değer** = iş değeri (Yüksek/Orta/Düşük).

### A. Katalog / ürün yönetimi

| Yetenek | Pazar | Entegrasyonik bugün (kanıt) | BE/FE | Değer |
|---|---|---|---|---|
| A1 Toplu içe/dışa aktarma (Excel, XML) | ŞART: T1 (Excel, XML import/export), T2 | YARIM: dışa aktarma `ProductService.exportExcel` VAR (OP); pazaryerinden çekme `IntegrationService.requestFetchFromPlatform` + ImportOrchestrator VAR; Bizimhesap ürün kaynağı (`streamProducts`, IR §4.1) VAR. Excel/XML içe aktarma operasyonu kayıtlı değil (OP tam tablo) = YOK | BE M / FE M | Yüksek |
| A2 Toplu düzenleme (fiyat/stok/durum) | ŞART: T1, T2 | YARIM: `VariantService.batchProcessUpdate/updateVariants` VAR (OP); OP notu: FE'nin çağırdığı `ProductService/batchProcessUpdate` backend'de yok (403). Yüzde/tutar bazlı toplu artış-azalış: YOK | BE S / FE M | Yüksek |
| A3 Varyant/seçenek yönetimi | ŞART: T1, T2, G3, G4 | VAR: `VariantService` (17 op), `ChoiceService`, `ProductVariantsComponent` (PS §2.2) | — | — |
| A4 Kategori/özellik/marka eşleme | ŞART: T2, T3 | VAR: `AttributeMappingService` (`autoMatchAllCategories`, kategori/özellik/değer eşleme), kategori/nitelik/marka çekme (OP, IR) | — | — |
| A5 Kanal bazlı fiyat kuralı (yüzde/TL) | SIK: T2, T4 | YOK (kural motoru kaydı yok). Variants `platforms.<code>` yapısı var (BL C8) fakat kanal başına fiyat alanı/kuralı bu çalışmada doğrulanamadı | BE M / FE M | Yüksek |
| A6 Rakip fiyat takibi + otomatik fiyat (repricing/Buybox) | AYIRT/SIK: T3 (Premium), T1 (Paket 3), G6; yalnız Trendyol+Hepsiburada | YOK | BE L / FE M | Orta-Yüksek |
| A7 Görsel yönetimi | ŞART: T2 | YARIM: `ImageService` + `ImageApiManager` + R2 VAR; OP notu: FE `restApi.postImageUpload` (5 yer) `restapi.ts`'ten dışa verilmiyor, "görsel yükleme FE'de zaten çalışmıyor olabilir" (doğrulanamadı) | BE S / FE S-M | Yüksek |
| A8 Çok kanallı listeleme/yayın hattı | ŞART: T2, T3, G1 | VAR: Stager→Importer→Dispatcher→Validator→Publisher→Sentinel→Sync (mongo durum makinesi, CLAUDE.md); 4 pazaryeri + Ideasoft (IR). Kural bazlı otomatik gönderim (T3): YOK | BE M (kural) / FE S | Orta |
| A9 Set/paket (bundle/kit) ürün | SIK: T1, T2, G7 | YOK / doğrulanamadı (servis kaydı yok) | BE M / FE M | Orta |
| A10 Etiket/hashtag, marka, kategori ağacı | SIK | VAR: `HashtagService`, `BrandService`, `CategoryService` (OP) | — | — |
| A11 Barkoddan AI ile ürün bilgisi doldurma | AYIRT: T1 | YOK (nice-to-have) | BE M / FE S | Düşük |

### B. Stok

| Yetenek | Pazar | Entegrasyonik bugün (kanıt) | BE/FE | Değer |
|---|---|---|---|---|
| B1 Tek stok + tüm kanallara yayın | ŞART: T1, T2, T3, G1, G7 | VAR: `StockPublishTrigger` (30 sn debounce, mevcut export hattına `UPDATE_STOCK`), `Validator` `targetPublishQty` (BL C8, ADR-0004 Aşama C) | — | — |
| B2 Rezervasyon / aşırı satış koruması | SIK (T3 "çift satış riski ortadan kalkar" iddiası; teknik derinlik doğrulanamadı) | VAR (BE): `StockAllocator` reserve/commit/release/restock atomik+idempotent, `OversellCompensationJob` (grace + pazaryerinde otomatik iptal; N11 hariç), mutabakat işleri; gerçek local Mongo'da eşzamanlılık kanıtı (BL C8). FE görünürlüğü doğrulanamadı | BE — / FE M | Yüksek |
| B3 Güvenlik stoğu / tampon (birim/yüzde, kanal tavanı) | SIK | VAR (BE): `ClientIntegrations.stockPolicy`, `bufferUnits/bufferPercent`, kanal `kanalMax` (BL C8). FE ekranı bu çalışmada bulunamadı (`views/secure/integrations/*` yalnız kimlik bilgisi formları) = YOK | BE S / FE M | Yüksek |
| B4 Düşük stok uyarısı (eşik) | SIK: G1 (makro), G7, T2 (kritik stok) | YARIM: `STOCK_ALERT` bildirimi yalnız UNMAPPED/OVERSOLD olayında (BL C8); eşik tabanlı düşük stok YOK | BE S / FE S | Orta |
| B5 Çok depo | SIK: T4, T2 (WMS), G2, G4, G7 | YOK (tek stok alanı; depo adresi yalnız kargo çıkış adresi için, IR §2.1) | BE L / FE L | Orta |
| B6 Kampanyaya stok ayırma / kanal satış limiti | SIK (TR): T1 | YARIM: kanal başına tavan+tampon var (B3); kampanya/zaman aralıklı ayırma YOK | BE M / FE M | Orta |
| B7 Stok mutabakatı (iç + kanal) | AYIRT | VAR: `InternalReconciliationJob` (saatlik), `ExternalReconciliationJob` (günlük) (BL C8) | — | — |
| B8 Seri/lot/raf/bin | nadir TR; SIK global (G4) | YOK | — | Düşük (önerilmez, §4) |

### C. Sipariş / iade / soru-cevap / finans

| Yetenek | Pazar | Entegrasyonik bugün (kanıt) | BE/FE | Değer |
|---|---|---|---|---|
| C1 Sipariş çekme + yönetim (onay/iptal/toplu) | ŞART: hepsi | VAR: `OrderService` (getOrders, approve/cancel, bulk), OrderWorker (BullMQ, imleç bütünlüğü BL C7); 4 pazaryeri + Ideasoft (IR). Kalan doğruluk borcu: N11 durum eşlemesi her zaman APPROVED (BL C8), HB `sendOrderShipping` takip kodu taşımıyor (IR §2.2) | BE M / FE S | Yüksek |
| C2 Gerçek zamanlıya yakın alım (webhook) | SIK: Trendyol resmi webhook | YARIM: yalnız Trendyol alıcısı `/hooks/trendyol/:hookToken` + 5 dk mutabakat (BL "Faz 2 planned"/ADR-0005); diğer kanallar polling | BE M / FE S (webhook token UI yok, `generateWebhookToken` BE-only, OP) | Orta |
| C3 İade/claim yönetimi | ŞART: T1 (Paket 2), T3 | VAR: `ClaimService` approve/reject/bulk (OP). İade→stok geri alma bağlantısı (`StockAllocator.restock` mevcut) iade akışına bağlı mı doğrulanamadı; iade kargo YOK | BE M / FE S | Yüksek |
| C4 Soru-cevap / müşteri mesajı | ŞART: T1 | VAR: `MessageService` (liste, yanıt, okundu, toplu silme) (OP). Hazır yanıt şablonu/SLA doğrulanamadı | BE S / FE S | Orta |
| C5 Finansal işlem listesi | SIK | YARIM: `FinancialService.getTransactionData` + `FinancialListView`; HB `retrieveCargoInvoices`/`settlementsByPaymentId` boş, N11 marka/kargo faturası/ödeme emri boş (IR §2.2-2.3) | BE M / FE S | Orta |
| C6 Hakediş mutabakatı / eksik ödeme tespiti | SIK/AYIRT: T1 (ayrı modül), T3 (Platinum), T7 | YOK (sipariş↔ödeme emri eşleştirme, kesinti tipi analizi yok) | BE L / FE M | Yüksek |
| C7 Müşteri kaydı + KVKK anonimleştirme | ŞART | VAR (BE): `CustomerService` + `anonymizeCustomer` (admin); FE anonimleştirme ekranı yok (OP: BACKEND_ONLY) | BE — / FE S | Orta |
| C8 Yazdırma (fatura/etiket/sipariş) | ŞART | YARIM: `PrintoutListView` var; kapsamı bu çalışmada doğrulanamadı | ? | Orta |

### D. Kargo

| Yetenek | Pazar | Entegrasyonik bugün (kanıt) | BE/FE | Değer |
|---|---|---|---|---|
| D1 Kargo firması API entegrasyonu (gönderi oluşturma, etiket/barkod, takip) | ŞART: T2 (6 firma), T3 (11 firma), G1 (70+), T6 | YOK: backend'de hiçbir kargo modülü yok; `hasShipmentIntegration = false` sabit (`shipment-service.ts:80`); UI formları (PTT, Aras, Yurtiçi, MNG, Hepsijet, Sürat, Sendeo, Oplog, UPS) yalnız ayar kaydeder (IR §5.1) | BE L / FE M | Yüksek |
| D2 Toplu gönderi/toplu etiket | ŞART: T3, T6 | YARIM: `ShipmentService.bulkCreateShipment` yalnız kullanıcının elle girdiği takip bilgisini pazaryerine iletir (OP, IR §5.1); etiket/PDF YOK | BE M / FE S | Yüksek |
| D3 Kural ile otomatik kargo seçimi (desi/bölge/pazaryeri), hacimsel desi | SIK: T3 | YOK | BE M / FE M | Orta |
| D4 Pazaryeri kargo faturası/ücret kontrolü | SIK | YARIM: Trendyol/Pazarama var, HB/N11 boş (IR) | BE M / FE S | Orta |
| D5 İade kargosu | SIK: T3 | YOK | BE M / FE S | Orta |

### E. E-fatura / e-arşiv / e-irsaliye

| Yetenek | Pazar | Entegrasyonik bugün (kanıt) | BE/FE | Değer |
|---|---|---|---|---|
| E1 e-fatura/e-arşiv sağlayıcı entegrasyonu (otomatik kesim) | ŞART: T1, T2 (Sovos/ICE/SNI), T3 (10 sağlayıcı), T5 | YOK: `hasIntegratedProvider = false` (`invoice-service.ts:190`); ETTN sistemce ObjectId ile üretiliyor; UI formları kayıt bile etmiyor (`EInvoiceView.onUpdate` yalnız `console.log`) (IR §5.2) | BE L / FE M | Yüksek (yasal) |
| E2 Faturanın pazaryerine iletimi (link/PDF) | ŞART | VAR: Trendyol/Pazarama/HB fatura linki bildirimi; Ideasoft `NOT_SUPPORTED` (BL C9, IR) | — | — |
| E3 Manuel fatura + toplu/yeniden düzenleme | ŞART (yedek yol) | VAR: `InvoiceService.createManualInvoice/bulkCreateInvoice/resolveAndReissueInvoice` (OP) | — | — |
| E4 e-irsaliye | SIK: T5 (Nilvera) + GİB | YOK | BE M-L / FE M | Orta (kapsamı doğrulanamadı) |

### F. ERP / muhasebe / e-ticaret platformu / pazaryeri kapsamı

| Yetenek | Pazar | Entegrasyonik bugün (kanıt) | BE/FE | Değer |
|---|---|---|---|---|
| F1 Muhasebe/ERP senkronu (sipariş, fatura, cari, tahsilat → ERP) | SIK: T2 (Logo/Mikro/Paraşüt/ETA/DİA), T3 (17), T5, G2/G4 (Xero/QB) | YARIM: yalnız Bizimhesap, yalnız OKUMA (ürün kaynağı + sipariş okuma), ERP sipariş polling'ine dahil değil, gerçek API uyumu doğrulanamadı (IR §4.1). Diğer ERP'ler UI şablonu | BE L / FE M | Yüksek |
| F2 E-ticaret platformu (Shopify, WooCommerce, Ticimax, İdeasoft, T-Soft…) | SIK: T2, T3 (9 platform) | YARIM: yalnız Ideasoft ve gerçek modda token akışı KOPUK (BL C10); diğerleri yalnız UI formu (IR §3) | BE L (platform başı) / FE S | Yüksek |
| F3 Pazaryeri kapsamı | ŞART: T2 (Trendyol, HB, Amazon, N11, Çiçeksepeti), T3 (21), T4 (+ PttAVM, Akakçe) | YARIM: 4 pazaryeri (Trendyol, HB, N11, Pazarama); Amazon/Çiçeksepeti/PttAVM YOK (BL "yeni entegrasyon adayları" kaydı) | BE L (her biri) / FE S | Yüksek |
| F4 Yurtdışı/uluslararası kanallar | AYIRT: T3 (Platinum), T1 (Paket 5) | YOK | — | Düşük (önerilmez, §4) |
| F5 Fulfillment/3PL | SIK: T1, T2 (Oplog, FBA, Hepsilojistik), T3 (5) | YOK | BE L | Düşük-Orta |

### G. Fiyatlandırma / kâr / raporlama / dashboard

| Yetenek | Pazar | Entegrasyonik bugün (kanıt) | BE/FE | Değer |
|---|---|---|---|---|
| G1 Komisyon hesaplama | SIK: T2, T3 | YARIM: kategori komisyonu çekme `retrieveCommisionForCategoryFromIntegration` (Pazarama `commissions.json`, IR §2.4); hesaplama/uyarı arayüzü YOK | BE M / FE M | Yüksek |
| G2 Kâr analizi (alış fiyatı + komisyon + kargo + hizmet bedeli) | SIK/AYIRT: T3, T1, G4 | YOK (alış/maliyet alanı bu çalışmada doğrulanamadı) | BE L / FE M | Yüksek |
| G3 Dashboard | ŞART | VAR: `OrderService.getOrderDashboardInsights`, `StatisticsComponent`, `NavigationLinks*`, `MarketplaceLinksComponent` (BL T4b) | — | — |
| G4 Rapor modülü (satış, kâr, kanal karşılaştırma, stok hareketi, envanter değeri, Excel) | SIK: T3, T1, G1, G4 | YOK: `ReportsView.vue` dosyası yok (PS §2.2); yalnız ihracat/içe aktarma log raporları (`LogListView`) VAR | BE L / FE L | Yüksek |
| G5 Küresel arama | AYIRT | VAR: `SmartService.unifiedSearch` | — | — |

### H. Otomasyon / bildirim / entegrasyon yüzeyi

| Yetenek | Pazar | Entegrasyonik bugün (kanıt) | BE/FE | Değer |
|---|---|---|---|---|
| H1 Otomasyon kuralları / iş akışı motoru | SIK global: G1, G2, G3 (Order Rule Engine); TR: T3 (kural bazlı gönderim, kargo seçim kuralı) | YOK (kural tanımı/çalıştırıcı yok; yalnız sabit `stockPolicy`) | BE L / FE L | Yüksek |
| H2 Bildirim (uygulama içi + e-posta) | ŞART | YARIM: uygulama içi VAR (`NotificationService`, EventBus, STOCK_ALERT); e-posta: `MailService` var ama üretim yolunda çağrılmıyor (BL bağımlılık notu, SCA §7); push/SMS YOK | BE M / FE S | Yüksek |
| H3 Genel API + API anahtarı yönetimi | SIK: T1 ("API web servis"), T3 (Premium), G1/G3/G2 (REST/OAuth) | YOK: yalnız RPC `/api/:service/:operation` + tarayıcı çerezi (SCA §9); OpenAPI/sürüm öneki yok. MCP yüzeyi başka ADR kapsamında (durumu bu çalışmada okunmadı, doğrulanamadı) | BE L / FE M | Yüksek |
| H4 Giden webhook (tenant sistemine olay bildirimi) | Rakip TR ürünlerde doğrulanamadı; Trendyol gelen webhook kullanır | YOK (gelen Trendyol alıcısı VAR) | BE M / FE M | Orta |
| H5 Entegrasyon sağlığı / hata izleme (tenant görünümü) | AYIRT: G5 (hata izleme/uyarı), G1 (durum sayfası) | YARIM: `IntegrationCallMetrics`, circuit breaker, ADR-0006 sözleşmesi BE'de VAR; yalnız platformAdmin `AdminSystemManagementView` sağlığı gösterir; tenant görünümü YOK; ayrıca ekranda hata=sıfır ayırt edilemiyor (BL T4h madde 1) | BE S-M / FE M | Yüksek |

### I. Platform / SaaS çekirdeği

| Yetenek | Pazar | Entegrasyonik bugün (kanıt) | BE/FE | Değer |
|---|---|---|---|---|
| I1 Çok kullanıcılı ekip + roller | ŞART: T2, T3, G2, G3 | YARIM: BE kademe modeli (member/admin/owner/platformAdmin), varsayılan-ret politika (156 kayıt) VAR (OP); `AuthorizationListView` VAR; FE'de kademeye göre düğme gizleme YOK, hedef-rol kontrolü yok (`roleCode` serbest atanabilir, OP "Bilinen boşluklar") | BE S / FE M | Yüksek |
| I2 Denetim günlüğü | SIK (kurumsal) — rakiplerde doğrulanamadı | YARIM: `AuditLogs` (TTL 365 gün) yazılıyor (BL C1 adım 6+7); okuma ucu/UI YOK (BL "ADR-0001 adım 6/7 kayıt" madde 5) | BE S / FE M | Orta |
| I3 Plan / kota / faturalama | ŞART (SaaS); TR rakipler yıllık kademeli lisans, 7–14 gün kartsız deneme | YARIM: `Plans/Subscriptions/BillingEvents`, `EntitlementService`, mock ödeme sağlayıcı, webhook, `BillingService` + `SubscriptionView`, kayıtta 14 gün trial (BL C16, S4a); guard'ların API/Engine'e bağlanması, trial bitişi/suspended job, legacy migration, iyzico, gerçek checkout, yönetim ekranı AÇIK | BE L / FE M | Yüksek |
| I4 Onboarding / kurulum sihirbazı | SIK: G1 (onboarding hizmeti), T1 (eğitim) | YARIM: kendi kendine kayıt + `driver.js` bağımlılığı (PS §2.1); adım adım "entegrasyon bağla → ilk içe aktarma → ilk yayın" sihirbazı YOK; kimlik bilgisi girildiğinde bağlantı testi YOK (`IPlatform.init()` üretim yolundan çağrılmıyor, IR §1) | BE S / FE M | Yüksek |
| I5 Destek / yardım | ŞART: T1 (7 gün destek + ücretsiz eğitim) | YARIM: `TicketService` + `TicketListView` VAR (destek talebi); yardım merkezi/bilgi bankası YOK | BE S / FE M | Orta |
| I6 Hesap güvenliği: şifre sıfırlama, e-posta doğrulama, 2FA, SSO | SaaS genel çıta (rakip 2FA/SSO durumu doğrulanamadı) | YARIM/YOK: imza doğrulama, oturum ≤7 gün, tokenVersion, rate limit (login/register 10/dk/IP) VAR (BL C1); şifre sıfırlama, e-posta doğrulama, 2FA, SSO YOK (SCA §2.3; sonraki kapanış BL'de bulunamadı = doğrulanamadı); captcha hâlâ sahte (BL T1b madde 1) | BE M / FE S-M | Yüksek |
| I7 KVKK/gizlilik self-servis | Yasal (KVKK) | YARIM: `TenantDataService` (silme talebi, dışa aktarma), `anonymizeCustomer` BE VAR; FE ekranı YOK; site yasal taslakları VAR (BL S5), rıza kaydı saklama doğrulanamadı | BE S / FE M | Yüksek (yasal) |
| I8 Mobil / masaüstü | AYIRT: T1 (iOS/Android) | YARIM: PWA iskeleti (SW `addAll` hatası düzeltme notu BL T3), Electron 29 iskeleti, Tauri ADR'de; responsive kırılım borcu (PS §2.8, BL T4e) | FE L | Orta-Düşük |
| I9 Herkese açık durum sayfası | SIK global: G1 (status.linnworks.com) | YARIM: `/health`,`/ready` iç uçları VAR (BL C14); herkese açık durum sayfası YOK | BE S / FE S | Düşük-Orta |
| I10 Dil (TR/EN) | TR pazar için TR şart | YARIM: TR 808 anahtar, EN 26 (PS §2.4) | FE M | Düşük |

## 3. Hedef yetenek kataloğu

Öncelik tanımı: **P0** = bu sektörde SaaS satılabilmesi/güvenle işletilmesi için olmazsa olmaz (yasal/doğruluk/temel çekirdek dahil); **P1** = rekabetçi paket için gerekli, sık beklenen; **P2** = farklılaştırıcı veya sonraya bırakılabilir. Sıralama P0 içinde önem sırasıdır. Her kalemde: kabul kriteri (özet), dokunulan modül/ekran, boyut. Tüm işler mevcut kural setine tabidir (characterization-önce, migration'da yedek şartı, canlı hesap/fiyat/e-fatura entegratörü kararı insan onayı).

### P0 — sektör için olmazsa olmaz

**Y-01 Kargo entegratör katmanı** (D1–D3)
- Kabul: (a) `IShipmentProvider` benzeri port + mock modlu ilk adaptör(ler); en az iki firma (örn. seçilecek anlaşmalı firmalar; öncelik insan kararı) için gönderi oluşturma, etiket/barkod PDF, takip numarası alma ve pazaryerine yazma; (b) toplu etiket tek PDF; (c) `hasShipmentIntegration` sabiti kalkar, sağlayıcı yoksa mevcut manuel akış bozulmaz; (d) firma hataları `IntegrationError` sözleşmesiyle (ADR-0006), sessiz başarı yok.
- Modül/ekran: `IntegrationFactory` (shipment dizisi aranmıyor, IR §1), `api/services/shipment-service.ts`, `integrations/ShippingView.vue`, `OrderListView`/`OrderDetailComponent` (etiket/takip).
- Boyut: BE L, FE M. Değer: Yüksek (T2/T3/T6 hepsinde çekirdek).

**Y-02 E-fatura/e-arşiv sağlayıcı entegrasyonu** (E1)
- Kabul: (a) en az bir özel entegratör (öneri adayları BL'de: Nilvera; T3 10 sağlayıcı sunuyor — seçim insan kararı) için sipariş → e-fatura/e-arşiv üretimi, ETTN'in sağlayıcıdan alınması, PDF/link'in pazaryerine iletimi (mevcut `syncInvoiceToPlatform`); (b) `hasIntegratedProvider` sabiti kalkar; manuel yol yedek kalır; (c) kimlik bilgisi tenant ayarı, şifreli (`FieldCrypto`); (d) fatura silme yetkisi kararı (OP belirsiz madde) verilir.
- Modül/ekran: `invoice-service.ts`, yeni `modules/einvoice/*`, `EInvoiceView.vue` (kaydetme gerçek olmalı; bugün `console.log`), `InvoiceListView`.
- Boyut: BE L, FE M. Değer: Yüksek (yasal). Not: e-irsaliye ayrı kalem (Y-23).

**Y-03 Gerçek-mod adaptör doğruluğu + kimlik bilgisi bağlantı testi**
- Kabul: (a) Trendyol URL/User-Agent düzeltmesinin canlı test hesabıyla doğrulanması (BL C11 kalanı); (b) HB `sendOrderShipping` takip kodu/firma taşır; (c) N11 `OrderMapper` ham durumları işler (BL C8 bulgusu); (d) Ideasoft token akışı (BL C10) kurulur veya "bağlı değil" açıkça gösterilir; (e) ayar kaydedilirken "Bağlantıyı test et" (init/ping) sonucu kullanıcıya sağlanır.
- Modül/ekran: `integration/modules/*`, `IntegrationFactory`, `IntegrationService.save*Settings`, `integrations/*View.vue` bileşenleri.
- Boyut: BE M-L, FE S. Değer: Yüksek (çekirdek ürün sözü; canlı doğrulama insan/Faz 3).

**Y-04 Plan/kota uygulaması + faturalama tamamlama** (I3)
- Kabul: (a) `EntitlementService.checkAccess/checkQuota` API kapısına, IntegrationEngine'e ve kayıt akışına bağlı (yalnız okuma/yazma durumuna göre 402/403); (b) trial bitişi → `suspended` geçiş işi; (c) legacy tenant'lar `billingExempt`; (d) plan başına kanal/kullanıcı/ürün kotası ve paket özelliği kapıları (Sentos/Entegra gibi kademeli özellik açma: ERP, otomatik fiyat, API üst pakette); (e) yönetim ekranında iptal/plan değiştirme; (f) fiyat/limit kararı ve gerçek sağlayıcı (iyzico) sonradan, insan onayıyla.
- Modül/ekran: `services/billing/*`, `api/ApiManager`/`RunOperation` guard, `SubscriptionView.vue`, `AdminClientDetailComponent`.
- Boyut: BE L, FE M. Değer: Yüksek (gelir modeli).

**Y-05 Hesap kurtarma ve transactional e-posta** (I6, H2)
- Kabul: (a) şifre sıfırlama (tek kullanımlık, süreli token, tokenVersion artışı), (b) e-posta doğrulama, (c) hoş geldin/davet e-postası, (d) `MailService` gerçekten çağrılır, hata görünür; nodemailer sürüm kararı BL C18 ile birlikte; (e) captcha ya gerçek doğrulanır ya kaldırılır (BL ADR-0001 K10).
- Modül/ekran: `SecurityService`, `MailService`, `ForgottenPasswordComponent.vue`, `ChangePasswordView.vue` (BE karşılığı doğrulama).
- Boyut: BE M, FE S. Değer: Yüksek.

**Y-06 Entegrasyon sağlığı + uyarı merkezi** (H5, B4, H2)
- Kabul: (a) tenant ekranında entegrasyon başına durum (bağlı/yetki hatası/devre kesici açık/son başarılı senkron), hata ile "veri yok" ayrı gösterilir; (b) düşük stok eşiği (ürün/varyant) + OVERSOLD/UNMAPPED/kimlik bilgisi hatası bildirimleri uygulama içi + e-posta; (c) `IntegrationCallMetrics` verisi kullanılır.
- Modül/ekran: `NotificationService`, `IntegrationCallMetrics`, `MarketplaceLinksComponent`/`integrations/*View`, `notificationDrawer`.
- Boyut: BE M, FE M. Değer: Yüksek (sessiz hata disiplininin kullanıcıya yansıması).

**Y-07 Toplu ürün işlemleri + Excel/XML içe aktarma** (A1, A2)
- Kabul: (a) şablonlu Excel içe aktarma (doğrulama, satır bazlı hata raporu, önizleme, geri alınabilir toplu işlem), (b) XML/tedarikçi feed içe aktarma (T1 XML import/export; tedarikçi formatı insan kararı), (c) yüzde/tutar bazlı toplu fiyat-stok artış-azalış, (d) FE'nin çağırıp backend'de karşılığı olmayan `ProductService/batchProcessUpdate` çağrısı düzeltilir (OP notu).
- Modül/ekran: `ProductService`, `VariantService.batchProcessUpdate`, `ProductListView`, `ImportLogList` (iş izleme), xlsx bağımlılığı kararı (BL C18: fix'siz `xlsx`).
- Boyut: BE M-L, FE M-L. Değer: Yüksek.

**Y-08 Rol/yetki FE yansıması** (I1)
- Kabul: (a) kademeye göre düğme/ekran gizleme (OP "FE'yi bozabilecek davranış"), (b) hedef-rol kontrolü (admin owner atayamaz), (c) yıkıcı silmeler için kademe kararı (OP'deki 15 belirsizden), (d) 403 durumunda anlaşılır ekran.
- Modül/ekran: `AuthorizationListView`, `operationPolicy.ts`, `user-service.ts`, `composables/user.ts`, router guard.
- Boyut: BE S, FE M. Değer: Yüksek (güvenlik).

**Y-09 Stok politikası ve aşırı satış görünürlüğü ekranı** (B2, B3)
- Kabul: (a) tenant ve kanal düzeyinde `stockPolicy` (birincil kanal, tampon birim/yüzde, kanal tavanı, grace, otomatik iptal) düzenlenebilir; (b) OVERSOLD/UNMAPPED satırlar için kuyruk ekranı (manuel çözüm), (c) varyantta `available/reserved` gösterimi.
- Modül/ekran: `ClientIntegrations.stockPolicy` yazan yeni operasyon (OP'ye kayıt), `ProductVariantsComponent`, `OrderDetailComponent`, `integrations/*View`.
- Boyut: BE S, FE M. Değer: Yüksek (ADR-0004 yatırımını ürüne çevirir).

**Y-10 Ürün görseli yükleme yolunun doğrulanması/onarımı** (A7)
- Kabul: FE `postImageUpload` çağrı yerleri çalışır veya kaldırılır; Playwright ile yükle→sırala→sil akışı; R2 yolu `products/<clientId>/<id>` ile tutarlı (BL ADR-0013 B3).
- Modül/ekran: `restapi.ts`, `ImageApiManager`, ürün düzenleme ekranları.
- Boyut: BE S, FE S. Değer: Yüksek (bug-check niteliği; OP notu "çalışmıyor olabilir" doğrulanamadı).

### P1 — rekabetçi paket için gerekli

**Y-11 Kâr/komisyon analizi + rapor modülü** (G1, G2, G4)
- Kabul: ürün/varyant için alış maliyeti alanı; kanal komisyonu + kargo + hizmet bedeli ile sipariş/ürün/kanal bazlı net kâr; en az şu raporlar: satış analizi, kâr, kanal karşılaştırma, stok hareketi (kaynağıyla), envanter değeri; tarih/kanal filtresi; Excel dışa aktarma. Veri yoksa "hesaplanamadı" (uydurma değer yok).
- Modül/ekran: yeni `ReportService`, `FinancialService`, `VariantService` (maliyet alanı), yeni `ReportsView` (rota/menü + `screens.ts`).
- Boyut: BE L, FE L. Değer: Yüksek (T3/T1/G4 ortak).

**Y-12 Hakediş mutabakatı** (C6)
- Kabul: sipariş↔ödeme emri/settlement eşleştirme, kesinti türleri (komisyon, kargo, ceza) ve beklenen/gerçek fark listesi, gecikmiş hakediş uyarısı, Excel dışa aktarma; HB/N11 boş alanlar doldurulmadan "desteklenmiyor" gösterilir.
- Modül/ekran: `FinancialService`, `FinancialConnector`'lar (IR), `FinancialListView`.
- Boyut: BE L, FE M. Değer: Yüksek (T1 ayrı ücretli modül, T3 Platinum).

**Y-13 Pazaryeri ve e-ticaret platformu kapsamı** (F2, F3)
- Kabul: öncelik sırası insan kararıyla; her yeni adaptör için IR-tarzı envanter girdisi + resmi API doğrulaması + `ResilientHttpClient` + mock + characterization testi. Aday sırası kanıtlı gerekçe: Çiçeksepeti (T2 ana listede), PttAVM (T4), Amazon TR (T2, T3), Shopify/WooCommerce/Ticimax (T2). Var olan UI-only formlar backend gelene dek "yakında" olarak işaretlenir (site iddia kuralıyla tutarlı).
- Modül/ekran: `integration/modules/*`, `IntegrationFactory`, `integrations/*View`.
- Boyut: BE L (adaptör başı), FE S. Değer: Yüksek (satış argümanı: T3 21 pazaryeri).

**Y-14 Genel API + API anahtarı + giden webhook** (H3, H4)
- Kabul: tenant başına anahtar üret/iptal/rotasyon (yalnız hash saklanır), kapsam (okuma/yazma), oran sınırı, sürümlü `/api/v1/...` OpenAPI tanımı; en az sipariş/ürün/stok kaynakları; giden webhook (imzalı, yeniden deneme, olay listesi). Plan kapısı: üst pakette (T3 Premium örneği).
- Modül/ekran: yeni API katmanı (RPC'den ayrı), `SettingListView` içinde anahtar ekranı, `EntitlementService`.
- Boyut: BE L, FE M. Değer: Yüksek (ölçeklenme/ortaklık).

**Y-15 Otomasyon kural motoru v1** (H1, D3, A8 kural bazlı gönderim)
- Kabul: koşul→eylem kuralları (tetik: sipariş oluştu/durum değişti/stok eşiği; eylem: etiketle, kargo firması ata, otomatik onayla, bildirim gönder); kuru çalıştırma (dry-run) + çalışma günlüğü; yıkıcı eylemlerde onay; kural sayısı plan kotasına bağlı.
- Modül/ekran: yeni `AutomationService` + worker, `OrderWorker`/`PostOrderOperations` kancası, yeni kural ekranı.
- Boyut: BE L, FE L. Değer: Yüksek (G1/G2/G3 çekirdek, T3 kısmen).

**Y-16 Kanal bazlı fiyat kuralı** (A5)
- Kabul: kanal başına yüzde/TL artış, yuvarlama, alt/üst sınır; yayında kural sonucu önizlenir; Validator'a yalnız hedef fiyat alanı olarak taşınır (stok için yapılan `targetPublishQty` deseni).
- Modül/ekran: `Variants.platforms.<code>`, `Validator`, `ProductVariantsComponent`, entegrasyon ayar ekranı.
- Boyut: BE M, FE M. Değer: Yüksek.

**Y-17 Muhasebe/ERP yazma yönü** (F1)
- Kabul: en az bir ERP/muhasebe (Bizimhesap yazma uçları veya Paraşüt; seçim insan kararı) için sipariş/fatura/cari gönderimi, hatalı kayıtlar için yeniden deneme kuyruğu; ERP tipinin sipariş polling'ine dahil edilmesi (IR §4.1).
- Modül/ekran: `modules/erp/*`, `OrderQueueProducer`, `ErpView.vue`.
- Boyut: BE L, FE M. Değer: Yüksek.

**Y-18 Set/paket (bundle) ürün** (A9)
- Kabul: bileşenlerden türetilen stok (`available = min(bileşen/adet)`); paket satışında bileşen rezervasyonu `StockAllocator` ile; kanal yayını paket SKU'su için.
- Modül/ekran: `StockAllocator`, `VariantService`, ürün ekranları.
- Boyut: BE M, FE M. Değer: Orta.

**Y-19 İade→stok geri alma ve iade kargosu** (C3, D5)
- Kabul: iade onayı/teslimi sonrası `restock` yalnız kullanıcı onayıyla (hasarlı ürün seçeneği), iade kargo gönderisi (Y-01'e bağlı).
- Modül/ekran: `ClaimService`, `StockAllocator.restock`, `ClaimDetailComponent`.
- Boyut: BE M, FE S. Değer: Orta-Yüksek.

**Y-20 2FA (TOTP) + denetim günlüğü arayüzü** (I6, I2)
- Kabul: owner/admin için isteğe bağlı sonra zorunlu 2FA, kurtarma kodları; `AuditLogs` okuma ucu (yalnız owner/admin) + filtreli liste ekranı; SSO bu kalemde YOK (P2).
- Modül/ekran: `SecurityService`, `AuditLogs`, yeni `AuditLogView`.
- Boyut: BE M, FE M. Değer: Orta-Yüksek.

**Y-21 KVKK self-servis ekranları** (I7, C7)
- Kabul: owner için "verilerimi indir" ve "hesabı sil (30 gün bekleme, geri al)" ekranları; admin için müşteri anonimleştirme; kayıt sırasında rıza/onay sürümü ve zaman damgası saklanır (`termsVersion`).
- Modül/ekran: `TenantDataService`, `CustomerService.anonymizeCustomer` (OP: BACKEND_ONLY), `SettingListView`, `CustomerListView`. Hukuki metin/VERBİS kararları insan/hukuk.
- Boyut: BE S, FE M. Değer: Yüksek (yasal).

**Y-22 Onboarding sihirbazı** (I4)
- Kabul: kayıt sonrası 5 adım (mağaza bilgisi → pazaryeri bağla + test → kategori eşle → ilk içe aktarma → ilk yayın/stok politikası) ilerleme durumuyla, atlanabilir; sağlık ekranı ile bağlantılı.
- Modül/ekran: yeni `OnboardingService` (durum), `DashboardView`, `driver.js` (varsa).
- Boyut: BE S, FE M. Değer: Yüksek (aktivasyon/deneme dönüşümü).

**Y-23 e-irsaliye** (E4) — Kabul: hangi tenant sınıflarına gerektiği hukuki/teknik olarak doğrulanır (doğrulanamadı); seçilen e-fatura sağlayıcısının e-irsaliye ucu Y-02 altyapısından genişletilir. BE M-L, FE M. Değer: Orta.

### P2 — farklılaştırıcı / sonraya bırakılabilir

| # | Yetenek | Gerekçe / not | BE/FE |
|---|---|---|---|
| Y-24 | Rakip fiyat takibi + Buybox robotu (A6) | T3 Premium, T1 Paket 3, G6; yalnız Trendyol+HB; rakip verisinin yasal ve teknik kaynağı doğrulanamadı; alt/üst limit, kademe, puan filtresi, değişim geçmişi zorunlu güvenlik ağı | L / M |
| Y-25 | Çok depo (B5) | T4/G2/G4; TR'de tek depo çoğunlukta olabilir (doğrulanamadı) — talep gelene kadar tek stok modeli yeterli | L / L |
| Y-26 | Kampanya stok ayırma (B6) | T1; mevcut kanal tavanının zaman aralıklı genişletmesi | M / M |
| Y-27 | SSO (SAML/OIDC) | Kurumsal plan; rakiplerde doğrulanamadı | M / S |
| Y-28 | Herkese açık durum sayfası (I9) | G1 örneği; `/health` verisinden | S / S |
| Y-29 | Mobil: PWA sertleştirme + responsive kabuk (I8) | T1 mobil uygulama; native uygulama önerilmez (§4) | — / L |
| Y-30 | Fulfillment/3PL adaptörü (F5) | T1/T2/T3; ilk aşamada değil | L / S |
| Y-31 | Hazır yanıt şablonları/SLA, mesaj sınıflandırma (C4) | Verimlilik | S / S |
| Y-32 | Yardım merkezi/bilgi bankası + EN i18n (I5, I10) | T1 eğitim/destek; içerik işi | S / M |
| Y-33 | AI barkoddan ürün doldurma (A11) | T1 farklılaştırıcı | M / S |

## 4. Bilinçli olarak YAPILMAMASI önerilenler (kapsam koruma)

1. **Yurtdışı/ihracat pazaryerleri** (Amazon Global, Etsy, Zalando; T3 Platinum, T1 Paket 5): ayrı vergi/gümrük/dil kapsamı; yerel pazaryerleri ve kargo/fatura olmadan anlamsız.
2. **Kendi e-fatura/e-arşiv "entegratörü" olmak**: mevcut özel entegratörlerle (Nilvera, Uyumsoft, Sovos, Paraşüt gibi) entegrasyon yeterli; kendi yetkilendirme/lisans süreci yükü hukuki teyit gerektirir (doğrulanamadı — yalnız öneri).
3. **Kargo anlaşması aracılığı / kargo ücreti komisyonculuğu** (T2 "kargo anlaşmasına gerek kalmadan"): finansal/sözleşmesel yük; T3 modeli (tenant kendi anlaşmasını getirir, ek ücret yok) izlenmeli.
4. **Tam WMS: raf/bin/parti/seri, satın alma emri, talep tahmini, B2B portal/EDI** (G2, G3, G4, G1): ERP alanı; Entegrasyonik ERP'yi kaynak/hedef olarak bağlar, yerine geçmez. Çok depo (Y-25) talep kanıtı gelene kadar ertelenir.
5. **Perakende/POS ve cari/ön muhasebe modülü** (T3 perakende, cari bakiye): ERP/muhasebe entegrasyonu ile karşılanır (Y-17).
6. **Feed optimizasyonu / 300 kanal / reklam yönetimi** (G5, G6): farklı pazar (küresel feed/ads).
7. **Kendi native mobil uygulaması**: PWA + responsive yeterli (Y-29); Electron/Tauri kararı ADR'de.
8. **Ürün araştırması / pazar analizi** (T1): veri kaynağı ve hukuki risk; çekirdek dışı.
9. **Yeni pazaryeri yalnız arayüz formu olarak eklemek**: "yalnız UI formu" durumu (Shopify/WooCommerce/PTT/Aras vb.) satış iddiasında "yakında" dışında görünmemeli (BL 3b iddia kuralı); backend olmadan form eklenmemeli.

## 5. Doğrulanamayanlar ve risk notları

- Rakiplerde 2FA/SSO, denetim günlüğü, giden webhook: resmi sayfalarda doğrulanamadı; bu yetenekler genel SaaS çıtasıdır.
- Feedonomics özellik sayfası fetch'te boş döndü (B etiketi); Ecomdash/Rithum yalnız üçüncü taraf (C).
- Dopigo fiyat sayfası fetch'te içeriksiz döndü; paket kırılımı doğrulanamadı (yalnız 3 paket türü ve deneme süresi başka sayfalardan).
- Sentos `ozellikler` sayfası (www.sentos.com.tr/ozellikler/) çekilemedi (DNS hatası); diğer Sentos sayfaları çekildi.
- e-irsaliyenin pazaryeri satıcıları için zorunluluk kapsamı ve e-fatura brüt hasılat eşikleri güncel hâliyle doğrulanamadı.
- Entegrasyonik'te: kanal başına fiyat alanı, maliyet (alış fiyatı) alanı, set/paket, Excel içe aktarma, `PrintoutListView` kapsamı, iade→restock bağlantısı, kayıt sırasında rıza kaydı, şifre sıfırlamanın sonraki durumu bu çalışmada koddan doğrulanamadı (dosya listeleme/arama aracı olmadan yalnız belge ve bilinen dosyalar okundu). İlgili kalemler yürütülmeden önce kısa bir kod keşfi gerekir.
- Bu belge canlı sistem bulgusu içermez; SCA'daki kritik bulgular (C1 vb.) BL'deki güncel durumla okunmalıdır.

## 6. Öneri: uygulama sırası (ön öneri, karar insan)

1. Güvence + görünürlük (küçük, hızlı): Y-10, Y-08, Y-09, Y-03(e), Y-05.
2. Yasal + çekirdek işlev: Y-02 (e-fatura), Y-01 (kargo) — dış sağlayıcı seçimi ve mock modlu adaptör; Y-06 ile birlikte.
3. Gelir modeli: Y-04 (guard bağlama → trial bitişi → sonra iyzico) + Y-22 onboarding.
4. Değer katmanı: Y-07, Y-16, Y-11, Y-12, Y-14; ardından Y-13/Y-17/Y-15.
5. Plan kademelendirme, rakip kalıbıyla uyumlu olarak: temel paket = pazaryeri + sipariş + e-fatura + kargo; orta = e-ticaret platformu + otomasyon + iade; üst = ERP + otomatik fiyat + API + mutabakat (T3 ve T1 paket yapıları; fiyatlar insan kararı).

## 7. Kaynak listesi (URL)

- https://www.entegrabilisim.com/genel-ozellikler
- https://www.entegrabilisim.com/paketler
- https://www.entegrabilisim.com/pazaryerleri-hakedis-takibi-b-MTE1
- https://www.entegrabilisim.com/ticimax-entegrasyonu
- https://www.dopigo.com
- https://www.dopigo.com/ne-ise-yarar/
- https://www.dopigo.com/urun-yonetimi/
- https://www.dopigo.com/stok-yonetimi/
- https://www.sentos.com.tr/
- https://www.sentos.com.tr/pazaryeri-entegrasyonu/
- https://www.sentos.com.tr/fiyatlar/
- https://www.sentos.com.tr/kargo-entegrasyonlari/
- https://www.sentos.com.tr/sentos-raporlar-modulu-2/
- https://www.sentos.com.tr/buybox-pazaryeri-rakip-analizi/
- https://www.ticimax.com/e-ticaret-pazaryeri-entegrasyonlari/
- https://apps.ideasoft.com.tr/sopyo-pazaryeri-entegrasyonu
- https://apps.ideasoft.com.tr/uyumsoft-e-fatura-entegrasyonu
- https://www.nilvera.com/
- https://www.jetstok.com/sovos-entegrasyonu
- https://www.parasut.com/entegrasyonlar
- https://kargoentegrator.com/kargo-api/
- https://kargopi.com/
- https://prapazar.com/tr/program-ozelligi/pazaryeri-hakedis-mutabakattakibi
- https://melontik.com/
- https://www.linnworks.com/features/
- https://docs.linnworks.com/articles/#!documentation/low-stock-notification-macro
- https://status.linnworks.com/
- https://www.brightpearl.com/features
- https://help.brightpearl.com/s/article/213285743
- https://help.brightpearl.com/hc/en-us/articles/360027461332-User-permissions
- https://www.sellercloud.com/features/
- https://help.sellercloud.com/omnichannel-ecommerce/order-rule-engine/
- https://help.sellercloud.com/omnichannel-ecommerce/user-roles
- https://www.cin7.com/features/inventory/inventory-management/
- https://www.cin7.com/blog/multichannel-order-management-system/
- https://feedonomics.com/features-and-benefits/
- https://en.wikipedia.org/wiki/Rithum
- https://thedigitalmerchant.com/ecomdash-review/
- https://developers.trendyol.com/en/docs/trendyol-marketplace/webhook/webhook-create
- https://ebelge.gib.gov.tr/eirsaliyehakkinda.html
- https://verbis.kvkk.gov.tr/

Repo kanıt dosyaları (ana çalışma dizini): `INTEGRATIONS_REGISTRY.md`, `SAAS_CORE_AUDIT.md`, `PRODUCT_SURFACES.md`, `BACKLOG.md`, `docs/OPERATION_POLICY.md`, `docs/research/2026-09-27-api-verification.md`, `backend/src/api/index.ts`, `frontend/src/stores/site/menu.ts`.
