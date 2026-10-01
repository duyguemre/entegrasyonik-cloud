# Özellik bayrakları + bakım modu — API sözleşmesi (B11)

`docs/BACKOFFICE_PLAN.md` §2.8 B11, ADR-0031 (`_platform` hedefi), ADR-0020 (yapılandırma motoru). **Yeni servis YOK**: yazma/okuma mevcut `IntegrationConfigService/*` (`/admin-api`, `target:"_platform"`) ile; kamuya açık okuma `GET /api/public-config`.

## Yazma yolu (backoffice)
- `IntegrationConfigService/saveDraft { target:"_platform", patch:{ "maintenance.enabled": true, "maintenance.message":"…" } }` -> `previewPublish` -> `publish { target:"_platform", reason }`.
- `publish`/`rollback` **step-up** (`401 REAUTH_REQUIRED` yoksa, 5 dk) + `reason` (≥10) ister; audit `integration_config.publish` yazılır. `maintenance.enabled` `danger:"caution"` (etki metni `impact` alanında).
- Değer en geç ~15 sn (sunucu yoklaması) içinde tüm podlarda etkinleşir; public-config istemcisine ek ≤30 sn HTTP önbelleği.
- `getCatalog` / `getEffectiveConfig` yeni bayrakları `group:"platform.features"` ile listeler (`scope:"platform"`).

## Özellik bayrakları (`features.<ad>`)
- Kod kataloğu `backend/src/integration/config/catalog/features.ts` (`FEATURE_FLAGS`, başlangıçta **boş**). Bayrak = varsayılanı `false` bool ayar. **Katalogda olmayan bayrak yazılamaz** (`400 VALIDATION`, bilinmeyen anahtar).
- `clientVisible:true` bayraklar `GET /api/public-config` -> `settings["features.<ad>"]` olarak kimliksiz döner; diğerleri yalnız backoffice'ten görünür. Yüzde/kademeli açılım yok.
- `tenantScoped:true` bayrak ek `features.<ad>.tenants` (string[] tenant numarası, ≤500) anahtarı taşır: boşsa herkes, doluysa yalnız listedekiler. Tenant listesi public-config'e ASLA girmez (`clientVisible` ile birlikte kullanılamaz).
- Sunucu tarafı okuma: `isFeatureEnabled(name, { tenantId? })` (`config/featureFlags.ts`; bellekten, DB yok; bilinmeyen bayrak = kapalı).
- FE: bayrak listesi için `getCatalog` (grup `platform.features`) + `getEffectiveConfig({target:"_platform"})`; her bayrak `bool` anahtar (+ isteğe bağlı `.tenants` `stringList`).

## Bakım modu
`maintenance.enabled=true` iken tenant `/api` isteklerinden **yazma** olanlar:
```
503 { "error": "<maintenance.message veya varsayılan ileti>", "code": "MAINTENANCE", "requestId": "…" }   + Retry-After: 60
```
- **Serbest:** `GET/HEAD/OPTIONS`; kayıtlı `read`/`propose` etkili RPC'ler; `SecurityService/login|logout|selectStore|redeemImpersonation|endImpersonation`, şifre sıfırlama/e-posta doğrulama (OPEN_OPERATIONS; `register` HARİÇ), `client-log`; küresel yönetici (`ga`, bakımı kapatabilsin); `/admin-api`, `/health`, `/ready`, webhook'lar, `GET /api/public-config` (hepsi bu ara katmanın dışındadır).
- **Bloklu:** diğer tüm `POST` RPC'ler (yazma/yıkıcı/kayıtsız) ve `PUT/PATCH/DELETE`.
- FE: 503 + `code:"MAINTENANCE"` görülürse `error` alanını bakım iletisi olarak göster (toast değil şerit; yeniden deneme `Retry-After`). Açılışta `public-config.settings["maintenance.enabled"]` ile şerit zaten görünür.
- Ayar okunamazsa ara katman fail-open (trafik kesilmez). Hata kodu `MAINTENANCE` `docs/ERROR_CODES.md`'de.

Testler: `backend/tests/unit/config/featureFlagsMaintenance.test.ts`.
