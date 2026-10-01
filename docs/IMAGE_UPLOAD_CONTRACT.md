# Ürün Görseli Doğrudan Yükleme — FE Uç Sözleşmesi (ADR-0027 §7)

Backend hazır (dal `faz4-integration`); FE uygulaması bulut görevidir (`frontend/`). Eski multipart yolu (`POST /api/upload`, multipart)
çalışmaya devam eder; FE yeni akışa geçene kadar ikisi birlikte yaşar. Yetenek kaydı: `images.upload` (member, yazma, MCP'ye kapalı —
`binary_file`). Gövde şemaları: `backend/src/capabilities/rpc-input/media.ts` (bilinmeyen alan → 400 `VALIDATION` + `fields`).

## Akış (dosya başına)
```
1. POST {API}/ImageService/createUploadUrl   { tempProductId, contentType, size }        → bilet
2. PUT  bilet.url  (gövde = dosyanın kendisi, başlık = bilet.headers, ÇEREZSİZ)             → 200 (R2)
3. POST {API}/ImageService/confirmUpload     { tempProductId, uploadId, originalname }    → { image, deduped }
```
`{API}` = `VITE_API_BASE_URL` (üretim `https://api.entegrasyonik.com/api/`). 1 ve 3 mevcut `restApi` ile (oturum çerezi, `withCredentials`).

### 1. `ImageService/createUploadUrl`
İstek:
| Alan | Tip | Kural |
|---|---|---|
| `tempProductId` | string | Ürünün görsel başvurusu (bugün `getImages`/`upload`'da kullanılan `tempId`); `^[A-Za-z0-9_-]{1,64}$` |
| `contentType` | string | `image/jpeg` \| `image/png` \| `image/webp` \| `image/avif` (SVG/GIF/HEIC YOK) |
| `size` | integer | Bayt, `1..maxBytes` (varsayılan tavan 10 MB = 10485760) |

Yanıt `200`:
```json
{ "uploadId": "<32 hex>", "method": "PUT", "url": "https://<hesap>.r2.cloudflarestorage.com/<kova>/uploads/<clientId>/<uploadId>?X-Amz-…",
  "headers": { "Content-Type": "image/webp" }, "expiresAt": "2026-09-30T12:39:56.000Z", "maxBytes": 10485760 }
```
Hatalar: `413 IMAGE_TOO_LARGE` (tavan aşımı; ileti tavanı içerir), `415 IMAGE_TYPE_NOT_ALLOWED`, `400 VALIDATION`.
Bilet **300 sn** geçerlidir (`expiresAt`); süresi dolarsa yeni bilet al.

### 2. PUT (tarayıcı → R2)
- `fetch(bilet.url, { method: 'PUT', body: file, headers: bilet.headers, credentials: 'omit' })`.
  **Axios kullanılırsa `withCredentials: false` ZORUNLU** — `restapi.ts`'te `axios.defaults.withCredentials = true` global; R2 CORS kimlik
  bilgili isteği kabul etmez ve istek CORS hatası verir. Oturum çerezi R2'ye zaten gönderilmemeli.
- `Content-Type` birebir `bilet.headers['Content-Type']` olmalı; gövde boyutu birebir `size` olmalı (tarayıcı `Content-Length`'i gövdeden
  kendisi koyar). Farklıysa R2 `403 SignatureDoesNotMatch` döner.
- Başarı `200`. İlerleme çubuğu gerekirse `XMLHttpRequest.upload.onprogress` (fetch'te yükleme ilerlemesi yok).
- CSP: `connect-src` R2 S3 uç noktasını içermeli (ADR-0027 §6; `frontend/public/_headers`).

### 3. `ImageService/confirmUpload`
İstek: `{ tempProductId, uploadId, originalname? }` (`originalname` ≤ 255, görünen ad; anahtar değil).
Yanıt `200`:
```json
{ "deduped": false,
  "image": { "_id": "…", "url": "https://cdn.entegrasyonik.com/products/<clientId>/<tempProductId>/<sha256-32>.webp",
             "thumbUrl": "https://cdn.entegrasyonik.com/cdn-cgi/image/width=300,format=auto/products/…",
             "key": "products/<clientId>/<tempProductId>/<sha256-32>.webp", "contentType": "image/webp",
             "sha256": "<64 hex>", "size": 12345, "width": 1200, "height": 1800, "order": 3,
             "originalname": "kapak.webp", "extension": "webp", "isTempImage": false } }
```
- `deduped: true` → aynı içerik bu üründe zaten vardı; mevcut görsel döner, listeye ikinci kez eklenmez.
- `thumbUrl`: liste/ızgara için; Image Transformations kapalıysa `url` ile aynıdır. FE URL'i kendisi kurmaz, yanıttakini kullanır.
- Hatalar: `404 UPLOAD_NOT_FOUND` (PUT yapılmadı/süre doldu — baştan başla), `413 IMAGE_TOO_LARGE`, `415 IMAGE_TYPE_NOT_ALLOWED`
  (içerik gerçek görsel değil; uzantı/tür sahte), `415 IMAGE_INVALID` (çözümlenemedi ya da > 50 MP), `400 VALIDATION`.

## Diğer işlemler (değişmedi)
- Listeleme `ImageApi/getImages` (`POST /api/getImages`): yeni görseller `key`/`thumbUrl` alanlarıyla birlikte `images[]`'te
  (sıralama `order`). Eski görsellerde `key` yoktur; eski küçük resim deseni (`<id>_t.<uzantı>`) yalnız eskilerde geçerlidir.
- Silme `ImageApi/deleteImage` / `deleteImageSelected`, sıralama `ImageApi/sortImages`: aynı gövde; backend `key`'li görseli tam anahtarla siler.
- Yeniden adlandırma: nesne adı değişmez (içerik-adresli); görünen ad `originalname` (ayrı bir uç gerekirse ileride eklenir).

## Kabul ölçütleri (FE görevi)
- Seçilen dosya türü/boyutu istemcide ön-denetlenir (aynı izin listesi/tavan) ama sunucu yanıtı esastır.
- Aynı anda en fazla 4 paralel yükleme; biri hata verirse diğerleri sürer, hatalı olanın iletisi gösterilir.
- 404 `UPLOAD_NOT_FOUND` alındığında tek sefer otomatik yeniden deneme (yeni bilet).
- Playwright: R2 PUT ve iki RPC ağ düzeyinde taklit edilir (gerçek R2'ye istek YOK).
