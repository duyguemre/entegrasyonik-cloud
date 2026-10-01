# Backend bağımlılık taraması — 2026-10-01 (BACKLOG C18)

Yöntem: `npm audit --omit=dev` ve tam `npm audit` (prod ile dev sonucu aynı), lock üzerinden. `backend/node_modules` ana ağaca junction olduğundan `npm install` ÇALIŞTIRILMADI; yalnız `npm audit fix --package-lock-only` ve `npm install --package-lock-only` kullanıldı.

## Önce / sonra
| | critical | high | moderate |
|---|---|---|---|
| Önce | 0 | 3 | 2 |
| Sonra | 0 | 3 | 0 |

## Uygulananlar
- `qs` (moderate, geçişli): `overrides.express.qs = 6.16.0` (express 4.22.1 `~6.14.0` pinliyordu; minor yama, body-parser zaten 6.16.0). Kapandı.
- `uuid` (moderate): kaynakta tek kullanım (`bizimhesap/ProductTransformer.ts`, yalnız v4) `crypto.randomUUID` ile değiştirildi; `uuid` ve `@types/uuid` kaldırıldı. Kapandı. Bizimhesap ProductTransformer characterization testi yeşil.
- `npm audit fix` (majör olmayan): ek düzeltme yok.

## Majör gerektiren / düzeltmesiz (UYGULANMADI)
| Paket | Durum | Etki / risk | Öneri |
|---|---|---|---|
| nodemailer `^8.0.4` (kurulu 8.0.11) | high, fix 10.0.13 (2 majör) | Advisory'ler `raw` seçeneği / allow-list bypass / DNS cache TLS servername (çok kiracılı SMTP kimlik bilgisi sızıntısı) / addressparser DoS. Kullanım tek dosya: `src/services/mail/MailService.ts` (createTransport+sendMail). Kullanıcı girdisiyle `raw`/dosya-URL içeriği verilmediği sürece sömürü yüzeyi dar; ancak çok kiracılı transport'larda DNS-cache maddesi geçerli. | MailService kontrat testi yazılarak 10.x'e çıkılsın (küçük yüzey, düşük risk). Öncelik: orta. |
| sharp `^0.32.3` | high, fix 0.35.5 | libvips/libheif CVE'leri; yalnız `image-operations.ts` (resize/metadata). Kullanıcı yüklemeli görsel işleniyorsa gerçek risk. Prebuilt binary değişimi, Alpine/Docker imajında doğrulanmalı. | Görsel işleme char. testi + Docker build ile 0.35.x'e çık. Öncelik: yüksek (kullanıcı görseli işliyor). |
| xlsx `^0.18.5` | high, düzeltme YOK (npm paketi bakımsız) | Prototype pollution + ReDoS; `product-service.ts` Excel içe/dışa aktarım. Kullanıcı yüklemeli dosya ayrıştırıldığı için sömürülebilir. | SheetJS CDN tarball (0.20.x) veya `exceljs` geçişi — insan kararı (tedarik/lisans). Geçici hafifletme: dosya boyutu/satır sınırı, yalnız kimlikli kullanıcı. |
| express 5 | şu an açık yok (qs override ile giderildi) | Majör; gerek yok. | Ertelendi. |

## Lisans
Yeni paket eklenmedi (yalnız `uuid` çıkarıldı; `qs` BSD-3-Clause, değişmedi). Kopyleft/UNKNOWN yok; önceki tarama (`docs/LICENSE_AUDIT.md`) geçerli.

## Kapı
typecheck, lint, test:all (415 suite / 5762 test), ratchet yeşil. Not: testler ana ağacın node_modules'ü ile koştu (qs orada 6.14.2); override yalnız lock'ta, bir sonraki gerçek `npm ci`/install'da devreye girer.

## C18b — Majör yükseltmeler (2026-10-01, faz4-c18b)
Kullanıcı onayı: xlsx -> exceljs geçişi uygun. Her adım ayrı commit, önce karakterizasyon testi (eski sürümle yeşil), sonra yükseltme (aynı testler yeşil).

| | critical | high | moderate |
|---|---|---|---|
| Önce (C18 turu sonu) | 0 | 3 | 0 |
| Sonra (`npm audit --omit=dev`) | 0 | 0 | 0 |

- **xlsx -> exceljs 4.4.0 (MIT).** Kaynakta yalnız YAZMA (`ProductService.exportExcel`) vardı; Excel İÇE aktarım/ayrıştırma kodu yok (ayrıştırma saldırı yüzeyi yok; zip-bomb/ReDoS/prototype-pollution yolu kaynakta kalmadı). Mevcut satır tavanı `EXPORT_EXCEL_MAX_ROWS` (varsayılan 20000) korunur; değerler düz veri, formül nesnesi üretilmez (`=...` metin kalır, testle sabit). Davranış: sayfa adı `Ürünler`, başlıklar ilk satırda (anahtar birleşimi), boş hücre boş, sayı sayı, barkod metin; yanıt sözleşmesi aynı. Fark: dosya içi metadata/stil (ör. sütun genişliği yok — eskisi de yoktu) ve bayt düzeyi çıktı farklıdır. exceljs 4.4.0 `uuid@^8` çeker (moderate advisory) -> `overrides.exceljs.uuid=^11.1.1` (yalnız v4 kullanılıyor; uyumlu).
- **sharp 0.32.3 -> 0.35.5.** `image-operations` (resize genişlik 300, metadata, bozuk girdide `{result:false,error}`) gerçek sharp + sentetik görselle sabitlendi; 0.35.5'te aynı testler yeşil. Node >=20.9 gerekir (Dockerfile `node:20-alpine` uyumlu); `@img/sharp-linuxmusl-x64/arm64` prebuilt ikilileri var. `docker build` bu oturumda DOĞRULANMADI (Docker çalıştırılmadı) — sonraki CI/dağıtımda doğrulanmalı. Lisans notu: 0.33+ libvips'i `@img/sharp-libvips-*` (LGPL-3.0-or-later, dinamik/yerel kütüphane) paketleri olarak sunar; license-checker bunları artık ayrı kalem olarak görür (önceki sürümde libvips gömülüydü). Dinamik bağlı, değiştirilmeden dağıtılan yerel kütüphane; hukuki değerlendirme LICENSE_AUDIT'e not düşülmeli.
- **nodemailer 8.0.11 -> 10.0.13.** `MailService.sendMessage/send` + `classifyMailError` kontratı gerçek nodemailer (jsonTransport, yerel kapalı port, yerel sahte SMTP 550) ile sabitlendi; 10.x'te aynı testler yeşil. Changelog kırıcıları: 9.0 — uzaktan içerik/OAuth/proxy HTTPS TLS doğrulaması varsayılan açık (biz yalnız düz SMTP kullanıyoruz; ek/OAuth/proxy yok -> etkisiz); 10.0 — Node >=20. Hata kodları (ECONNECTION/EENVELOPE/responseCode) değişmedi.
- **Lisans:** exceljs MIT; yeni geçişli paketlerde kopyleft/UNKNOWN yok (jszip `MIT OR GPL-3.0-or-later` -> MIT seçilir; `buffers/busboy/streamsearch` eski `licenses[]` alanı, MIT). Tek kopyleft kalemi yukarıdaki sharp-libvips LGPL notu.
- **Kapı:** typecheck, lint (0 hata), test:all (yük altında 6-7 süreli/mongo-semantics testi zaman aşımına düşebiliyor; izole koşuda tümü yeşil), ratchet OK. Not: `backend/node_modules` artık worktree'de GERÇEK (`npm ci`); ana ağaç değişmedi, ana ağacın eski paketleri (xlsx/sharp 0.32/nodemailer 8) bir sonraki orada `npm ci`'ye kadar durur.
