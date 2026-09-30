# 0022 — Giden HTTP: Yönlendirme Takip Edilmez, Gövde Boyut Tavanı, OAuth Sırları Yalnız Gövdede

## Durum
Kabul edildi (2026-09-30)

## Bağlam
`docs/audits/BACKEND_INTEGRATION_AUDIT_2026-09-30.md` F-03 (P1): `ResilientHttpClient` axios varsayılanlarıyla çalışıyordu (5 yönlendirme otomatik takip, gövde tavanı yok). K7 giden-host allowlist'i (`outboundHosts.ts`) yalnız İLK URL'yi denetler; izinli bir host `Location:` ile içeri/dışarı yönlendirirse `Authorization`/`appkey`/`appsecret`/`key`/`token` başlıkları izinsiz host'a taşınabilir (SSRF / kimlik sızması, OWASP A10/A02). Sınırsız gövde ise bellek tüketimi (DoS) riskidir. F-04: Ideasoft `client_secret`/`refresh_token` GET URL sorgusundaydı (log/proxy/metrik `operation` alanına sızma).

## Değerlendirilen Alternatifler
1. **Her hop'ta allowlist denetimi + cross-host'ta kimlik başlıklarını düşürme (`beforeRedirect`).** Artı: meşru yönlendirmeler çalışır. Eksi: karmaşık; hangi başlığın "kimlik" olduğu adaptöre göre değişir, liste eksik kalırsa sızıntı; POST 307/308 gövdesi de taşınır; başlık düşürülmüş istek anlamsız 401 üretir.
2. **`maxRedirects: 0` (hiç takip etme).** Artı: en küçük saldırı yüzeyi, sıfır konfigürasyon, denetlenebilir. Eksi: yönlendirme yapan bir API'de çağrı hata verir (bilinen 6 platform API'sinden hiçbirinde yönlendirme beklenmiyor; ihtiyaç doğarsa hedef URL'yi düzeltmek doğru çözüm).
3. Hiçbir şey yapma. Reddedildi (bulgu P1).

## Karar
`ResilientHttpClient` tüm REST çağrılarında `maxRedirects: 0` kullanır; 3xx yanıtı `IntegrationError('VALIDATION', httpStatus=3xx)` olur (yalnız `Location` HOST'u mesaja girer, sorgu/sır girmez; retry ve circuit breaker sayımı YOK). `maxContentLength`/`maxBodyLength` varsayılan 20 MB (`DEFAULT_MAX_CONTENT_BYTES`), adaptör başına `ResilientPolicyConfig.maxContentBytes` ile ayarlanır; aşım `IntegrationError('VALIDATION')`, retry/breaker sayımı yok. Kimlik bilgisi taşımayan `SourceMonitor` (genel doküman sayfaları) ham axios yerine `safeGetText` kullanır: otomatik yönlendirme kapalı, en çok 3 hop elle izlenir ve HER hop'ta host, izlenen hedeflerin host kümesine (descriptor `api.docs`) ait olmalıdır (IP literal, userinfo, http/https dışı şema reddedilir), 2 MB tavan; robots.txt yönlendirme takip etmez. OAuth token uçları (Ideasoft) sırları yalnız `application/x-www-form-urlencoded` POST gövdesinde taşır; URL'de sır bulundurulmaz (eski GET biçimi yalnız `IDEASOFT_TOKEN_LEGACY_GET=true` ile, bilinçli geri dönüş anahtarı).

## Gerekçe
Seçenek 2 en az kod ve en güçlü garanti verir; tek haneli abone ölçeğinde yönlendirme desteği için karmaşık başlık-düşürme mantığı bakım borcudur. SourceMonitor'da yönlendirme (http->https, taşınmış sayfa) meşrudur ve kimlik başlığı yoktur, bu yüzden allowlist'li elle izleme seçildi.

## Maliyet/Ölçek Notu
Ek bağımlılık/servis yok. Yeniden değerlendirme eşiği: bir platform API'sinin kalıcı olarak yönlendirme döndürdüğü (VALIDATION 3xx) tek bir gerçek olay, ya da meşru yanıtların 20 MB'ı aşması (tavan adaptör başına yükseltilir). DNS rebinding riski (allowlist host adı üzerindedir) bu ADR kapsamı dışındadır (`outboundHosts.ts` notu).

## Etki Alanı
`backend/src/integration/modules/common/http/ResilientHttpClient.ts` (tüm adaptörler), `backend/src/integration/compliance/SourceMonitor.ts`, `backend/src/integration/modules/ecommerce/ideasoft/services/{SecurityService,Service,paging}.ts`. Testler: `tests/characterization/common/ResilientHttpClient.redirectAndSize.test.ts`, `tests/unit/compliance/SourceMonitor.test.ts`, `tests/characterization/stubs/Ideasoft.oauthAndPaging.test.ts`.
