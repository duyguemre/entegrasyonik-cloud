# Resmi API Referans Kaynakları — Entegrasyonlar

Kayıt: 2026-09-27, kullanıcı tarafından sağlandı. Amaç: her entegrasyonun resmi/güncel dokümantasyon kaynağını tek bir yerde sabitlemek — hem manuel doğrulama turlarında (bkz. `2026-09-27-api-verification.md`) hem de ileride kurulacak **otomatik doküman-sürüklenme (drift) tespit sistemi** için başlangıç noktası olarak kullanılacak.

**Bu dosya yalnızca kayıttır — otomatik tespit sistemi bu geliştirmenin kapsamında DEĞİL, ayrı bir Faz'da (muhtemelen Faz 3/4, bkz. BACKLOG "PLANNED") ele alınacak.**

| Entegrasyon | Resmi kaynak | Not |
|---|---|---|
| Trendyol | https://developers.trendyol.com/ | 2026-09-27 doğrulama turunda doğrudan bu domain kullanıldı (`developers.trendyol.com/docs/...`) — bkz. `2026-09-27-api-verification.md`, C11. |
| Hepsiburada | https://developers.hepsiburada.com/tr/ | Kısmen doğrulandı; `oms-external` vs `mpop` belirsizliği bu kaynaktan tam teyit edilemedi (tek kaynaklı arama sonucu, sayfa erişimi kısıtlı). |
| N11 | https://developer.n11.com/ | Henüz doğrulanamadı (2026-09-27 turunda arama sonuçları alakasızdı) — SOAP API'nin güncel durumu bu kaynaktan kontrol edilmeli. |
| Ideasoft | https://apidoc.ideasoft.dev/ | JS ile render ediliyor, WebFetch içerik çıkaramadı (2026-09-27) — tarayıcı tabanlı erişim (Claude in Chrome) ile tekrar denenebilir. |
| Pazarama | https://isortagim.pazarama.com/auth/integration | Önceki turda denenen `developer.pazarama.com` satıcı girişi arkasındaydı; bu yeni URL farklı/daha erişilebilir olabilir — doğrulanmadı, sonraki turda önce bu adres denenmeli. |
| Bizimhesap | https://apidocs.bizimhesap.com/ | Base URL/auth yöntemi sayfada açıkça belirtilmiyor (2026-09-27) — endpoint yolları (`/products.md` vb.) görüldü, host doğrulanamadı. |
| PTT Kargo | https://github.com/ahmeti/ptt-kargo-api | **Resmi değil** — üçüncü taraf/topluluk kütüphanesi/referans implementasyonu. Kod tabanında PTT/kargo entegrasyonu şu an yalnızca UI formu olarak var, backend implementasyonu yok (bkz. `INTEGRATIONS_REGISTRY.md`, BACKLOG "Ürün kararları (insan): PTT/kargo entegrasyonu gerçekten yapılacak mı"). Bu karar insan onayı gerektiriyor; onaylanırsa bu repo ilk teknik referans noktası olarak kullanılabilir ama resmi PTT dokümantasyonu değil, doğruluğu ayrıca teyit edilmeli.

## Gelecek geliştirme fikri (kapsam dışı, sadece kayıt)

Kullanıcı isteği: bu kaynakları periyodik kontrol edip kod tabanındaki varsayımlarla (URL, header, auth yöntemi, zorunlu alanlar) karşılaştıran, bir sürüklenme (drift) tespit edildiğinde bildirim üreten veya otomatik bir düzeltme taslağı açan bir sistem kurulacak. Bu, mevcut Faz 2 çalışmasının kapsamında değil — ilgili BACKLOG.md "PLANNED / NICE-TO-HAVE" bölümüne referans olarak eklendi, ileride bir ADR ile tasarlanmalı (kontrol sıklığı, hangi alanların izleneceği, false-positive riski, insan onay akışı).
