# 1f — Web Araştırması Bulguları (2026-09-26)

Kaynak: `entegrasyonik-researcher` alt ajanının raporu; orkestratör tarafından aynen belgelendi. Backlog önerileri: `docs/staging/backlog-1f.md`. **Doğrulanamayan/üçüncü taraf kaynaklı noktalar işaretlidir. Hukuki danışmanlık değildir.**

## En acil: Trendyol V1 kapanışı (koşullu critical)
Kodda V1 ürün ya da eski sipariş endpoint'i kullanılıyorsa sipariş/stok akışı sessizce durabilir.
- Ürün V1 servisleri 15 Eylül 2026'dan beri brownout'ta (changelog 15 Eylül, doküman bannerı 15 Ekim 2026 diyor; erkeni esas al).
- Eski `/orders` 15 Ekim'e kadar günde 3 kez 10 dk 426 dönüyor; yeni `/v2/orders` sorgu başına en çok 10.000 kayıt.
- Kaynak: https://developers.trendyol.com/v2.0/changelog/changelog · https://developers.trendyol.com/docs/ürün-api-endpoint

## 1) Pazaryeri API durumu
**Trendyol** ([limitler](https://developers.trendyol.com/docs/1-servis-limitleri), [auth](https://developers.trendyol.com/docs/2-authorization.md), [stok/fiyat](https://developers.trendyol.com/docs/stok-ve-fiyat-güncelleme-updatepriceandinventory.md))
- Basic Auth + `User-Agent: {sellerId} - SelfIntegration` zorunlu (yoksa 403).
- Stok/fiyat: tek istekte ≤1000 SKU, asenkron (`batchRequestId` ile sorgula). Aynı gövde 15 dk içinde tekrar gönderilirse hata → yalnızca delta gönder. Barkod başına fiyat 30 istek/dk; stok üst sınırı 20.000.
- 14 Eylül 2026'dan itibaren limitler servis grubu bazlı (Inventory & Price Write: 50K ürün paketinde 350 istek/dk, 150K'da 1000/dk).
- Webhook yalnızca sipariş durumu olayları için (13 durum); stok/fiyat webhook'u YOK (bazı bloglar var diyor, resmi doküman çürütüyor). Her 5 dk yeniden dener, başarısızsa otomatik pasife alır (üst sınır 15) → webhook yanında mutabakat polling'i gerekir.

**Hepsiburada** (portal 403 verdi; arama özetlerine dayanır — kısmen doğrulanamadı) ([listing](https://developers.hepsiburada.com/hepsiburada/reference/listeleme-entegrasyonu-onemli-bilgiler))
- Eşzamanlı bekleyen POST ≤5, istek başına ≤4000 SKU → büyük batch tercih. Birleşik fiyat/stok servisi BETA.
- ~240 istek/dk ve 429 bilgisi resmi özetten; bir blog 30 istek/sn diyor (çelişki, teyit gerekir).
- Sipariş webhook modeli var (baseUrl Hepsiburada'ya bildirilir; önce test ortamı).

**N11** ([REST fiyat-stok](https://magazadestek.n11.com/satis-surecleri/restapi-urun-bilgileri-ve-fiyat-stok-guncelleme-servisi-10173))
- appkey/appsecret header, ≤1000 SKU, 1000 istek/dk, taskId + TaskDetail ile sonuç; listPrice ve salePrice birlikte gönderilmeli.
- SOAP için resmi kapanış duyurusu bulunamadı, webhook dokümanı yok. Adaptörün SOAP mu REST mi kullandığı kontrol edilmeli.

**Pazarama:** resmi doküman (PDF/panel) 403. Auth/token ömrü (~1 ay) yalnızca üçüncü taraf kaynaklarla; rate limit ve batch limiti BİLİNMİYOR — canlıdan önce panel dokümanından teyit. Fiyat ve stok ayrı endpoint'ler.

## 2) Zero-oversell (80/20)
Kendi DB tek doğruluk kaynağı; kanallara "stok − rezerve − buffer" yayınla. MongoDB'de koşullu atomik düşüm yeter (`findOneAndUpdate`, `available >= n`). Kanal bazlı buffer (pazaryerinde ~%90). Olaylar at-least-once ve sırasız → idempotency anahtarı + sıra kontrolü. Periyodik mutabakat (aktif SKU'lar 6–12 saatte bir; tek haneli abonede daha seyrek olabilir). Kaynak (satıcı blogu, orta güvenilirlik): https://ecosire.com/blog/real-time-inventory-sync-webhooks-queues

## 3) Rakip özellikleri
Kaynağı doğrulananlar (backlog'da): kârlılık ve otomatik fiyatlandırma/BuyBox robotu (Sentos, Entegra), kampanyaya stok ayırma, kritik stok uyarısı, toplu işlem/Excel, tek tuşla toplu e-fatura ve kargo barkodu, mobil depo. Akıllı kargo seçimi için doğrudan kanıt bulunamadı. ÇokSat/Tsoft güncel özellikleri kaynaklanamadı; ikas için yalnızca paket bilgisi.

## 4) Ödeme sağlayıcısı — öneri: iyzico Abonelik, alternatif PayTR
- **iyzico:** sandbox kaydı KYC'siz ([docs](https://docs.iyzico.com/on-hazirliklar/sandbox)). Abonelik canlıda panelden eklenti (ilk 3 ay ücretsiz, sonra 199 TL/ay — fiyat doğrulanmalı). Resmi Node SDK `iyzipay` abonelik örnekleri içerir; TypeScript tipi yok, bağımlılık zafiyet uyarıları var (issue #115, 2023) → ince HTTP istemcisi düşünülebilir.
- **PayTR:** `test_mode=1`, kart saklama + tekrarlayan ödeme API'si ([docs](https://dev.paytr.com/en/direkt-api/kart-saklama-api/kayitli-kart-tekrarlayan-odeme)); planlamayı kendin yaparsın, resmi Node paketi yok.
- Canlı KYC detayı (TCKN, NFC kimlik) tek bir 2026 makalesinden — doğrulanmalı. **Karar insana aittir (Protokol 12 kapsamı: canlı hesap/para).**

## 5) KVKK (pratik kontrol listesi)
Abone = veri sorumlusu, Entegrasyonik = veri işleyen (kendi abone verisi için sorumlu). Gerekenler: veri işleyen sözleşme maddeleri, aydınlatma metni şablonu, silme/dışa aktarma ve imha politikası. VERBİS muafiyeti: <50 çalışan VE <100 milyon TL bilanço (Kurul kararı 04.09.2025) — muhtemelen muaf ama doğrulanmalı ([duyuru](https://www.kvkk.gov.tr/Icerik/8388/KAMUOYU-DUYURUSU)). İhlalde 72 saat bildirim. Yurt dışı altyapı için standart sözleşme imzadan sonra 5 iş günü içinde Kurum'a bildirilmeli.

## 6) MCP ve Tauri
- MCP spesifikasyonu 2025-11-25 ([authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)): OAuth 2.1 + PKCE S256, RFC 9728 metadata, RFC 8707 `resource` parametresi, token audience doğrulaması; token passthrough yasak; kısa ömürlü token + refresh rotasyonu; kademeli scope. stdio (yerel) MCP'de OAuth kullanılmaz.
- Prompt injection ([OWASP MCP cheatsheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html)): araç çıktısı güvenilmeyen girdi (ürün adı/müşteri notu vektör); araç şemaları hash'lenip sabitlenir; yazma işlemlerinde insan onayı; tüm çağrılar günlüklenir.
- Tauri 2.x stabil, iOS/Android destekli; mobilde PWA 80/20 için yeterli. Sıkı capability/CSP ([güvenlik](https://v2.tauri.app/security/)); updater imzalı olmalı ([updater](https://v2.tauri.app/plugin/updater/)). Windows kod imzalama/SmartScreen kaynaklanamadı.

## 7) E-fatura
Mevcut BizimHesap'ı korumak veya Nilvera (REST, OAuth 2.0, ayrı test/canlı; https://developer.nilvera.com/) yeterli. Diğer: NES, Turkcell e-Şirket, Uyumsoft, Foriba, EDM, Paraşüt. Fiyatlar doğrulanmadı.
