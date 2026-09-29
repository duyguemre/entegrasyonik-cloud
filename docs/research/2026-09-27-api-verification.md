# API Doğrulama Turu — 2026-09-27 (orkestratör, gerçek internet erişimiyle)

Amaç: kod tabanındaki 6 pazaryeri/entegrasyon adaptörünün URL/auth varsayımlarını GÜNCEL resmi kaynaklarla karşılaştırmak. Yalnızca resmi geliştirici portallarından doğrudan çekilen (WebFetch) veya birden fazla arama sonucuyla tutarlı (WebSearch) bilgiler "DOĞRULANDI" sayıldı; tek kaynaklı/erişilemeyen/belirsiz olanlar açıkça "DOĞRULANAMADI" işaretlendi — eski/düşük güvenilirlikli kaynaklarla karıştırılmadı.

## 🔴 Trendyol — CRITICAL, çok kaynaklı doğrulandı

**1) Yanlış host+yol (C11'i "koşullu"dan "doğrulandı"ya yükseltir, sistemik):**
Kod (`backend/src/integration/modules/marketplace/trendyol/**`, tüm connector'lar: Order/Claim/Message/Financial/Shipment/Product) varsayılan olarak `https://api.trendyol.com/sapigw/sellers/<SELLERID>/...` kullanıyor.
Resmi doküman (doğrudan `developers.trendyol.com` sayfalarından çekildi, 2026 içerik):
- Sipariş: `https://apigw.trendyol.com/integration/order/sellers/{sellerId}/v2/orders` ([kaynak](https://developers.trendyol.com/docs/sipari%C5%9F-paketlerini-%C3%A7ekme-getshipmentpackages))
- Stok/fiyat: `https://apigw.trendyol.com/integration/inventory/sellers/{sellerId}/products/price-and-inventory` ([kaynak](https://developers.trendyol.com/docs/stok-ve-fiyat-g%C3%BCncelleme-updatepriceandinventory))
- İade/claim: `https://apigw.trendyol.com/integration/order/sellers/{sellerId}/claims` (arama sonuçlarıyla tutarlı, doğrudan sayfa çekilemedi — orta güven)

Fark yalnızca "sapigw"↔"apigw" değil: **host farklı** (`api.trendyol.com` vs `apigw.trendyol.com`), **yol öneki farklı** (`/sapigw/sellers/` vs `/integration/order/sellers/`), sipariş için ayrıca **`/v2/` eksik**. Gerçek Trendyol'a bu URL'lerle istek atılırsa muhtemelen 404/yanlış host hatası alınır — DB'deki `settings.urls.*` bu varsayılanı override edebiliyor (koddan doğrulandı), yani canlı yapılandırma bilinmeden kesin "kırık" denemez, ama **varsayılan değer artık geçersiz**.

**2) Yanlış `User-Agent` başlığı (YENİ bulgu, C11'den bağımsız, ayrıca ciddi):**
`backend/src/integration/modules/marketplace/trendyol/services/Service.ts:34`:
```
headers: { 'User-Agent': `${this.clientId} - Entegrasyonik` }
```
`this.clientId` = Entegrasyonik'in kendi iç tenant kimliği (örn. "1") — Trendyol'un satıcı ID'si (`SELLERID`) DEĞİL. Oysa kod tabanında `SELLERID` zaten ayrı, doğru bir alan olarak URL'lerde tutarlı kullanılıyor (`requiredSettings = ['SELLERID','APIKEY','APISECRET']`, `index.ts:54`).
Resmi doküman (arama sonuçlarıyla çok kaynaklı doğrulandı): format `"{sellerId} - {EntegratörAdı}"` olmalı (kendi yazılımı için `"{sellerId} - SelfIntegration"`); **User-Agent göndermeyen veya formatı yanlış olan istekler 403 ile reddedilir.**
→ Düzeltme: `${this.clientId}` yerine `${this.params.integrationSettings.settings.SELLERID}` kullanılmalı.

**3) Kimlik doğrulama yöntemi DOĞRU (endişe yok):** Basic Auth (`Authorization: Basic base64(APIKEY:APISECRET)`) resmi dokümanla ([kaynak](https://developers.trendyol.com/docs/2-authorization)) birebir örtüşüyor; kodun `auth:{username:APIKEY,password:APISECRET}` kullanımı doğru.

**Sonuç:** Bu iki bulgu (host/yol + User-Agent) birlikte, gerçek Trendyol kimlik bilgisiyle canlıya çıkıldığında **tüm Trendyol API çağrılarının reddedilme riski** taşıyor — DB'deki `settings.urls`/varsayılan davranışın hangisinin fiilen kullanıldığı doğrulanmadan kesin hüküm verilemez, ama varsayılan değerler artık dokümantasyonla uyuşmuyor. **BACKLOG'a critical olarak eklendi (C21).**

## 🟡 Hepsiburada — kısmen doğrulandı, tek nokta belirsiz

- Listing base URL (`https://listing-external.hepsiburada.com`) kod ile arama sonucu **birebir eşleşiyor** — DOĞRU.
- Sipariş/paket (`packages/merchantid/{merchantId}`) kodda VARSAYILAN `mpop.hepsiburada.com` üzerinden çözülüyor; bir arama sonucu (tek kaynak, doğrudan sayfa 403 verdiği için doğrulanamadı) bu işlemin `oms-external.hepsiburada.com` kullanabileceğini ima ediyor. **Tek kaynaklı ve doğrudan teyit edilemediği için "olası, doğrulanamadı" olarak işaretlendi — C11 gibi kesin bir bulgu DEĞİL.**

## ⚪ N11, Pazarama, Ideasoft, Bizimhesap — doğrulanamadı (dürüst durum)

- **N11:** SOAP API'nin güncel durumu/kapanış tarihi hakkında hiçbir arama sonucu bulunamadı (aramalar alakasız sonuçlar — NetSuite/Microsoft/Adobe SOAP kapanışları — döndürdü). Ne "hâlâ geçerli" ne "kapandı" denebilir.
- **Pazarama:** Resmi doküman (`developer.pazarama.com`) satıcı paneli girişi arkasında; rate limit/batch limiti doğrulanamadı (1f'deki durumla aynı).
- **Ideasoft:** Resmi API dokümanı (`apidoc.ideasoft.dev`) JavaScript ile render ediliyor, WebFetch içeriği çıkaramadı; OAuth endpoint formatı doğrulanamadı.
- **Bizimhesap:** Resmi doküman (`apidocs.bizimhesap.com`, `llms.txt` dahil) base URL/auth yöntemini AÇIKÇA belirtmiyor; endpoint yol adları (`/products.md`, `/inventory.md`) görüldü ama tam URL/host doğrulanamadı.

Bu dördü için kodda mevcut olan varsayımlara (BACKLOG'daki mevcut notlar) dokunulmadı — yeni bir iddia eklenmedi, sadece "hâlâ doğrulanamadı" teyit edildi.

## Yapılmayanlar (bilinçli)
Hiçbir kod değişikliği yapılmadı (Trendyol URL/User-Agent düzeltmesi dahil) — Protokol 13 gereği önce characterization testi yazılmalı, bu ayrı bir görevdir. Gerçek Trendyol/Hepsiburada/... API'sine hiçbir istek atılmadı (yalnızca genel/herkese açık dokümantasyon okundu).
