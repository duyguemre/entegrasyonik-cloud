# Faz 2 — "ÖNCE" baseline ölçümü (2026-09-27)

Amaç: Faz 1 DoD'sindeki "darboğazlar için önce/sonra ölçüm" maddesinin "önce" tarafı. Düzeltmelerden (ADR-0001/0002/0005/0006) ÖNCE alındı; "sonra" ölçümü aynı yöntemle Faz 2 sonunda tekrarlanır.

## Ortam ve yöntem
- Backend `dist/entegrasyonik.js`, `node -r ./dev-tools/egress-guard.js` ile (loopback dışı tüm çıkış engelli — Protokol 7). `NODE_ENV=development`, 6/6 entegrasyon mock modda, **mock sunucusu çalışmıyor** (C15).
- Local MongoDB (restore edilmiş kopya, `127.0.0.1`), Redis 7 (docker-compose, parolasız, yalnızca `127.0.0.1`).
- Makine: Windows 11, Node v22.12. Tek çalıştırma, ısınma sonrası ~60 sn boşta + polling. Bu bir yük testi DEĞİLDİR.

## Sonuçlar
| Metrik | Değer |
|---|---|
| Başlangıç → API dinliyor (`:5001`) | ~2 sn |
| Başlangıç → engine + worker'lar ayakta | < 12 sn (logdan; `Worker Pod … Single Pod`) |
| Bellek (boşta, polling ile) | 113 MB working set / 139 MB private, 16 thread |
| Yönlendirme yolu gecikmesi (`POST /api/Unknown/op`, 40 istek, loopback) | min 1 ms · p50 2 ms · p95 2 ms · max 115 ms (ilk istek) |
| Sipariş zamanlayıcı | 1 turda 4 iş Redis'e bırakıldı (tenant 1 × trendyol/pazarama/n11/hepsiburada) |
| Katalog boru hattı | `[ExportOrchestrator] No active jobs. Waiting for 300000ms` (5 dk polling) |
| Frontend `vite build` | `main.js` 3.912,51 kB (gzip 1.060 kB), tek bundle, kod bölme yok; 19 sn |

## Gözlemler (darboğaz/risk)
1. **Mock modu güvenli değil (yeni, C19):** N11 adaptörü mock modda olmasına rağmen `https://api.n11.com/rest/delivery/v1/shipmentPackages` (GERÇEK adres) çağırmaya çalıştı — `N11_MOCKABLE_ENDPOINTS` listesinde olmayan endpoint mock'a yönlenmiyor. Bu çağrı egress guard tarafından engellendi; guard olmasaydı gerçek pazaryerine gerçek kimlik bilgisiyle gidecekti.
2. Sipariş çekimi hataları (mock sunucu yok / engellenen çıkış) `Sipariş çekme hatası` olarak loglanıyor ve akış devam ediyor; bu, C7'nin ("hata olsa da senkron ilerliyor") canlı davranışıyla uyumlu.
3. Redis bağlantısı: log'da tekrarlayan `Redis bağlantısı başarılı` satırları — servis başına ayrı bağlantı; tek haneli ölçekte sorun değil, bağlantı sayısı ADR-0005 ölçümüne eklenecek.
4. `RedisService.ts:40` parola satırı yorumda → Redis parolası hiç gönderilmiyor (C12). Local Redis bu yüzden parolasız.
5. **Canlı doğrulama (yalnızca local örnek):** kimliksiz `POST /api/AdminService/getClients` → HTTP 200, tenant kaydı + `dbConfig` (parola alanı dolu) döndü. C1/C2 characterization testleriyle **aynı davranış gerçek sunucuda doğrulandı** (değerler yazdırılmadı).
6. `localhost` → `::1` çözümlemesi ioredis/mongodb sürücüsünde bağlantıyı bozuyor; `.env` `127.0.0.1` kullanmalı (Mongo ve Redis için yapıldı).

## Yapılmadı / sınırlar
Yük testi, throughput, kuyruk gecikmesi (mock sunucu ve gerçek iş yükü yok), gerçek pazaryeri gecikmeleri (Protokol 7), çoklu tenant. Bunlar mock sunucu (C15 kararı) sonrası ADR-0005 ölçüm altyapısıyla (`QueueMetrics`) toplanacak.
