# Rakip Boşluk Analizi (Backend/Entegrasyon Katmanı) — 2026-09-30

Kapsam: `frontend/docs/PRODUCT_VALUE_PLAN.md` (F-01..F-21, B-00..B-21) ve `docs/CAPABILITIES.md` (160 yetenek) zaten kapsananı TEKRARLAMAZ; üstüne koyar. Rakip adları yalnız bu dosyada geçer (ürün arayüzü/site metnine girmez).

Güvenilirlik etiketleri: [A] üretici sayfasında/dokümanında görüldü · [B] üçüncü taraf/özet arama sonucu · [D-YOK] doğrulanamadı (iddia olarak taşınmaz).
Not: web araması bu turda yüzeysel kaldı (arama özetleri, derin doküman değil); derinlik gereken maddeler "doğrulanamadı" işaretlidir.

## (a) Rakip yetenek matrisi

| Yetenek | Rakip / kanıt | Etiket |
|---|---|---|
| Toplu ürün fiyat/stok/detay güncelleme (tek/toplu) | Dopigo: ürünler tek tek veya toplu yönetilir — https://www.dopigo.com/wp-content/uploads/2023/01/dopigo-sunum-min.pdf | B |
| Excel + toplu işlemler, rekabet analizi, kur/altın kurlu satış, pazaryeri müşteri sorusu yanıtı | Sentos — https://apps.shopify.com/sentos | A (mağaza sayfası) |
| Plan kademeleri: sipariş entegrasyonu -> ürün -> ön muhasebe -> e-ticaret/kargo/fulfillment -> ERP + kullanıcı yetkilendirme (Premium) | Sentos — https://apps.shopify.com/sentos | A |
| E-fatura uçtan uca (kes/gönder/raporla/sakla), lojistik entegrasyonu, WMS/depo yönetimi | Dopigo — https://sovos.com/tr/basari-hikayeleri/kdv/basari-hikayesi-dopigo/ ve sunum PDF | B |
| Anlık stok-fiyat-sipariş senkron, kanal bazlı fiyatlandırma, fiyat rekabet robotu, akıllı sipariş yönetimi (Ideasoft'un kendi çözümü; Entegrasyonik'in Ideasoft konektörüyle aynı ekosistemde rakip) | ideaConnect — https://www.ideasoft.com.tr/ideaconnect/ | B (pazarlama iddiası; "anlık" tanımı D-YOK) |
| Sipariş yönetimi otomasyonu: 32+ pazaryeri, otomatik fatura yükleme, kargo yönetimi, iptal/iade yönetimi, kategori eşleme | BirFatura — https://birfatura.com/pazaryeri-entegrasyonu/ ; https://birfatura.com/trendyol-entegrasyonu/ ("mutabakat") | B |
| Trendyol webhook ile çift yönlü stok senkronu (satıcı panelinde webhook URL) | Brksoft eklentisi — https://wordpress.org/plugins/trendyol-entegrasyonu-brksoft/ | B |
| Periyodik senkron (ör. 60 dk seçeneği) ve kritik stok eşiği ile aşırı satış engeli | Shopify uygulaması "Stok Entegratör" — https://apps.shopify.com/stok-entegrator | B |
| Kural motoru: siparişi kanal/stok/kalemine göre 3PL'e yönlendirme + kargo yöntemi atama | Linnworks — https://linnworks.com/features/order-management/ ; https://www.linnworks.com/?p=2829 | B |
| Çoklu depo stoku, listelemelerin gerçek depo stoğuna senkronu | Linnworks (aynı kaynaklar) | B |
| Otomasyon motoru (toplama/paketleme/gönderim), talep tahmini, tedarikçi/satın alma, muhasebe | Brightpearl — https://www.linnworks.com/blog/linnworks-vs-brightpearl/ | B (rakibin rakip yorumu) |
| Webhook = kaynak durum değişimi için "callback contract"; GET/POST/DELETE ile abonelik yönetimi | Brightpearl — https://api-docs.brightpearl.com/integration/webhook/ | A (olay türü/retry/imza sayfada YOK) |
| Düşük stok eşiği bildirimi; webhook ile stok seviyesi değişimi | Cin7 Core, Sellercloud — https://sellercloud.com/?p=37599 ; https://viasocket.com/integrations/cin7-core/sellbrite | B |
| Hakediş/kesinti/eksik ödeme modülü, akıllı fiyatlandırma, "X dakikada senkron" | Entegra (araştırma belgeleri COMP/BENCH T1 atfıyla; bu turda doğrudan sayfa bulunamadı) | D-YOK |
| Denetim izi, repricing kuralı, giden webhook (TR rakiplerde) | Bu turda kanıt bulunamadı; önceki araştırmada da "doğrulanamadı" | D-YOK |

## (b) Entegrasyonik'te eksik olanlar (mevcut plan DIŞINDA yeni bulgular; plan içindekiler "PVP" ile atıflıdır)

Zaten planda (tekrar edilmedi): toplu işlem/önizleme/geri al (PVP F-08/B-09), kanal fiyat kuralı (F-09/B-10), kural motoru (F-12/B-15), giden webhook/API (F-20), hakediş mutabakatı (F-11/B-14), kâr/rapor (F-10/B-13), hata kutusu (F-07/B-06), bildirim tercihleri + düşük stok (F-06/B-07), kargo/e-fatura adaptörleri (F-21, Protokol 12).

Yeni boşluklar:
1. Düşük stok LİSTESİ ucu yok: CAPABILITIES `stock.overview` notu "stok_low_list için backend RPC eksik" (eşik altı SKU listesi dönmüyor). Rakiplerde standart (Cin7/Sellercloud).
2. Kanal başına güvenlik stoğu/tampon (safety stock) ve kanal payı: stok politikası var (`stock.policy.*`), ancak "kanala pay/ayrılmış stok" ve SKU bazında override kanıtı bu turda doğrulanmadı (yerel doğrula). Rakip iddiası: eşik altında yayını sıfırlama (Stok Entegratör tarzı).
3. Stok hareket defteri (StockMovements) ile kullanıcıya dönük "neden bu stok" izi (PVP yalnız önerdi, B-item yok): denetlenebilir stok = mottoyu kanıtlar.
4. Sipariş yönlendirme/çoklu depo: hiçbir kayıtta yok; PVP "bilinçli önerilmeyen" listesinde. Rakipler (Linnworks/Brightpearl/Dopigo WMS) sunuyor.
5. Senkron gerçek zamanlılığı ölçüsü: yayın gecikmesi (order -> kanala stok yayını) SLO'su ve "son yayın/yayın bekleyen" metriği yok (PVP C1.1 yalnız `publishPending` gösterir). Pazarlama "anlık" iddiaları (ideaConnect) doğrulanamadı; biz ölçülebilir SLO ile ayrışabiliriz.
6. Pazaryeri hız sınırı-farkında yayın kuyruğu (Trendyol 30/dk/barkod fiyat limiti: PVP F-09 bağımlılığı olarak anıldı) — genel "kanal başına token-bucket + öncelik (stok > fiyat > içerik)" tasarımı ayrı B-item değil.
7. Zamanlanmış toplu iş (ör. kampanya bitişinde fiyatı geri al) — rakip kanıtı yok [D-YOK]; hipotez.
8. Geliştirici erişimi: API anahtarı + Idempotency-Key + tenant-kapsamlı okuma API'si (PVP F-20 "sonraki dalga"); MCP ile birlikte tek yetenek kaydı (ADR-0019) sayesinde ucuz.
9. Ideasoft'un kendi entegratörü (ideaConnect) ile doğrudan rekabet/çakışma: Ideasoft konektörünün yetenek seviyesi (iade/mesaj/finans stub) rakibe kıyasla zayıf; Ideasoft'a stok yayınının kapsamı doğrulanmalı.

## (c) Öneriler

Efor: S ≤ 3 gün, M ~1-2 hafta, L > 2 hafta. Motto uyumu: ●●● doğrudan zero-oversell/tek stok, ●● dolaylı, ● alakasız.

### Hemen backend'de yapılabilir (dış karar/ön koşul gerektirmez)

| # | Öneri | Değer | Efor | Motto | Bağımlılık |
|---|---|---|---|---|---|
| 1 | Düşük stok / eşik altı SKU listesi ucu (`stock.overview` genişletme veya `stock.low.list`) + tenant eşik ayarı | Rakip standardı; bildirim ve pano için kaynak | S | ●●● | Yeni yetenek kaydı (ADR-0019); B-07 ile birleşebilir |
| 2 | Stok hareket defteri (StockMovements): her reserve/commit/release/restock/delta için değişmez satır + `getStockMovements` (SKU+tarih) | Denetlenebilir stok; iade/mutabakat/rapor tabanı | M | ●●● | ADR-0004 tek yazar ilkesi (StockAllocator); PVP §0.4 ölü yol bulgusu (B-00b) önce |
| 3 | Yayın gecikmesi ölçümü: order/stock değişimi -> kanala başarılı yayın süresi (p50/p95), kanal başına; `getIntegrationHealth`'e ekleme | "Anlık" iddiasını ölçülebilir kılar; farklılaşma | S | ●●● | B-00a (zamanlayıcıların gerçekten başladığının doğrulanması) |
| 4 | Kanal başına yayın kuyruğu: hız sınırı-farkında token-bucket, öncelik sırası stok > fiyat > içerik | Rate limit yüzünden gecikmiş stok = aşırı satış riski | M | ●●● | B-01 (Trendyol V2 hız sınırı) ile aynı kod yolu |
| 5 | Kanal başına güvenlik stoğu/tampon + kritik eşikte yayını sıfırlama (politikaya alan ekle) | Yaygın aşırı satış önleyici; mevcut stok politikası üstüne | S-M | ●●● | Önce mevcut `stock.policy` alanlarını doğrula (b-2) |
| 6 | Ürün/sipariş/stok için tenant-kapsamlı API anahtarı + `Idempotency-Key` (okuma-ağırlıklı v1) | Geliştirici erişimi; MCP ile ortak yetenek kaydı | L | ●● | PVP F-20/Y-14; plan kapısı fiyatı Protokol 12 |

### Ön koşullu

| # | Öneri | Değer | Efor | Motto | Ön koşul |
|---|---|---|---|---|---|
| 7 | Sipariş yönlendirme + çoklu depo (depo başına stok, kural: kanal/bölge/stok -> depo) | Linnworks/Brightpearl/Dopigo WMS eşdeğeri; ölçeklenen satıcı | L | ●●● (stok modeli değişir) | ADR gerekir: rezervasyon modeli depo boyutu kazanır (ADR-0004 revizyonu); PVP bunu bilinçli dışarıda bırakmış, insan kararı |
| 8 | Zamanlanmış toplu iş (kampanya fiyatı -> bitişte geri al) | Günlük operasyon rahatlığı [hipotez] | M | ● | F-08/B-09 önizleme/geri al altyapısı |
| 9 | Ideasoft konektörü: iade/mesaj/finans stub'larını tamamlama, stok yayını kapsam denetimi | ideaConnect ile aynı müşteri tabanında eşitlik | M-L | ●● | Ideasoft resmi API kapsamı doğrulaması; `docs/research/...` DEAD taraması |
| 10 | Giden webhook (thin olay + Standard Webhooks başlıkları) + teslimat günlüğü | Brightpearl "callback contract" eşdeğeri; entegrasyon ekosistemi | L | ●● | Öneri 6 ile birlikte; olay kataloğu (ADR-0018 manifesto) |

## Doğrulanamayanlar (rapora iddia olarak alınmamalı)
- Entegra/Sentos'un stok senkron aralığı ("dakikada"), Entegra "akıllı fiyatlandırma" ve hakediş modülü ayrıntısı: bu turda doğrudan üretici sayfası okunamadı (eski COMP/BENCH atıflarına bağlı).
- ideaConnect "anlık" senkron tanımı; fiyat rekabet robotunun yasal veri kaynağı.
- Linnworks kural motoru ayrıntıları (eski doküman adresi yönlendirildi); Brightpearl webhook retry/imza sayfada yok.
- Tüm TR rakiplerde denetim izi, giden webhook, repricing kuralı: kanıt bulunamadı.
