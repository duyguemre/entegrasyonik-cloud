# `GET /api/public-config` — kamu açılış yapılandırması (FE sözleşmesi)

Kaynak: ADR-0031 (Karar 4). Uygulama: `backend/src/api/http/publicConfig.ts`. Tüketici: FE `stores/publicConfig.ts` (FE-CFG-1).
Yönetim (yazma) tarafı bu belgenin konusu DEĞİLDİR: backoffice `IntegrationConfigService` işlemlerini `target:'_platform'` ile kullanır (BO-CFG-1).

## Uç

- `GET /api/public-config` (bağlam yolu `SERVER_CONTEXT`, varsayılan `/api`). **Kimliksiz** (çerez gerekmez; giriş ekranında da çağrılır). Yalnız GET.
- Genel hız sınırına tabidir. CORS müşteri `CORS_ORIGINS` listesine göre uygulanır (diğer `/api` uçlarıyla aynı).
- İstek başına DB okuması YOKTUR: yanıt bellekten (`_platform` yayınlanmış ayarları, 15 sn'lik yoklama + katalog varsayılanı) üretilir.
- MCP yeteneği değildir (ADR-0019/E8): kamuya açık salt okunur açılış verisi.

## Yanıt (200)

```json
{
  "version": 3,
  "env": {
    "images": { "productBaseUrl": "https://cdn.entegrasyonik.com/products/", "uploadMaxBytes": 10485760 }
  },
  "settings": {
    "support.email": "bilgi@entegrasyonik.com.tr",
    "support.phone": "",
    "announcement.enabled": false,
    "announcement.level": "info",
    "announcement.text": "",
    "maintenance.enabled": false,
    "maintenance.message": "",
    "ui.listPageSize": 25,
    "ui.reportPollMs": 5000
  }
}
```

| Alan | Tip | Açıklama |
|---|---|---|
| `version` | int | `_platform` yayın sürümü; hiç yayın yoksa `0`. |
| `env.images.productBaseUrl` | string | Sonda `/` ile biten ürün görseli tabanı (`R2_PUBLIC_URL_IMAGE` + `IMAGE_FILES_PATH`; env yoksa eski `images.` kökü). FE görsel URL'ini bundan kurar; URL biçimi (`temp/` vb.) FE'de kalır. **Salt okunur ortam değeri.** |
| `env.images.uploadMaxBytes` | int | Görsel yükleme bayt tavanı (`IMAGE_UPLOAD_MAX_BYTES`, varsayılan 10485760). **Salt okunur.** |
| `settings["support.email"]` | string (e-posta, ≤120) | Destek e-postası. Varsayılan `bilgi@entegrasyonik.com.tr`. `mailto:` ile gösterilir. |
| `settings["support.phone"]` | string | `^\+?[0-9 ()-]{7,20}$` ya da `''`. **Boşsa hiçbir şey render edilmez.** `tel:` ile gösterilir. |
| `settings["announcement.enabled"]` | bool | Duyuru şeridi açık mı. |
| `settings["announcement.level"]` | `"info" \| "warning"` | Şerit seviyesi. |
| `settings["announcement.text"]` | string (düz metin, ≤280) | HTML/kontrol karakteri yok. **Düz metin olarak basılır (`v-html` YOK).** Boşsa şerit gösterilmez. |
| `settings["maintenance.enabled"]` | bool | Bakım modu açık mı: şerit gösterilir ve tenant yazma istekleri `503 MAINTENANCE` döner (bkz. `API_BACKOFFICE_FLAGS_MAINTENANCE.md`). |
| `settings["maintenance.message"]` | string (düz metin, ≤280) | Bakım iletisi. |
| `settings["ui.listPageSize"]` | `10 \| 25 \| 50 \| 100` | Liste sayfa boyutu varsayılanı. |
| `settings["ui.reportPollMs"]` | int 3000–60000 | Rapor yoklama aralığı (ms). |

`env` bloğu açık bir izin listesidir (yalnız yukarıdaki iki alan); `settings` yalnız katalogda `exposure:'public'` olan anahtarları taşır. Yeni alan eklenirse bu belge, backend testi (`tests/unit/api/publicConfig.test.ts`) ve FE tipi birlikte güncellenir. Sır, CORS, bağlantı dizesi, `APP_ENV` yanıtta YOKTUR.

## Önbellek ve yayılım

- `Cache-Control: public, max-age=30`; `ETag: W/"<version>-<gövde özeti>"`. Aynı ETag ile `If-None-Match` -> `304` (gövdesiz).
- Yayından sonra değer en geç ~45 sn içinde ulaşır (15 sn sunucu yoklaması + 30 sn HTTP önbelleği).
- FE: açılışta (`main.ts`, montajdan önce) 3 sn zaman aşımıyla bir kez alır; 5 dakikadan eskiyse rota değişiminde yeniden alır. Zamanlayıcı/SSE yok.

## Hata / geri düşme

- Beklenmeyen hata: `500 { "error", "code": "INTERNAL", "requestId" }` (ADR-0030 X5 zarfı). Hız sınırı: `429`.
- FE'nin yerleşik geri düşmesi: alınamazsa `listPageSize 25`, `reportPollMs 5000`, destek/duyuru/bakım boş; `productBaseUrl` boşsa yer tutucu görsel.
- Sunucu tarafı: `_platform` yayını hiç okunamamışsa (DB erişilemez) katalog varsayılanları döner (fail-open, ADR-0020 Karar 3.6).

## Örnek

```
GET /api/public-config
-> 200
Cache-Control: public, max-age=30
ETag: W/"0-9f2c1a7be3d0"
{"version":0,"env":{"images":{"productBaseUrl":"https://images.entegrasyonik.com/products/","uploadMaxBytes":10485760}},"settings":{"support.email":"bilgi@entegrasyonik.com.tr","support.phone":"","announcement.enabled":false,"announcement.level":"info","announcement.text":"","maintenance.enabled":false,"maintenance.message":"","ui.listPageSize":25,"ui.reportPollMs":5000}}

GET /api/public-config   (If-None-Match: W/"0-9f2c1a7be3d0")
-> 304
```

## Bilinen yan bulgu (görsel URL biçimi)

Backend görsel URL'lerini `productBaseUrl + <clientId>/<productId>/<imageId>.<uzantı>` biçiminde DB'ye yazar (`products/<clientId>/...`); FE `ProductImageComponent.vue:41` ise `base + productId + '/' + _id + '_t.' + ext` kuruyor (clientId yok). FE-CFG-1 URL biçimini DEĞİŞTİRMEZ; tercih edilen yön: FE DB'deki `image.url`'i kullanır, yoksa tabandan kurar (ayrı iş).
