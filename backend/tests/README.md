# backend/tests

Çalıştırma: `npm test` (jest, ts-jest) · kapsama: `npm run test:cov`. **Katman/modül bazlı komutlar ve hangi durumda hangisi: `docs/TESTING.md`** (`test:unit|characterization|contract|integration:mocked|module|changed|related`). Testler `*.test.ts`; `src/` ve `tests/` altında aranır.
Path alias'ları (`@utils/*`, `@database/*` ...) `jest.config.js > moduleNameMapper` ile `tsconfig.json > paths` ile birebir eşlidir; birini değiştirirsen ötekini de güncelle.
Test dosyalarında `describe/it/expect` için `import { ... } from '@jest/globals'` kullan (tsconfig `types` yalnızca `node` içerir, global jest tipleri `tsc --noEmit`'te görünmez).

## Test türleri
- Birim/characterization: saf fonksiyonlar, bağımlılıklar mock'lu. DB/Redis/ağ YOK. Varsayılan tercih budur.
- Katmanlar: `unit/` (+`static/`,`dev/`), `characterization/` (mevcut davranış sabitleme), `contract/` (+`*.contract.test.ts`), `mongo-semantics/` (bellek-içi Mongo), `integration/` (GERÇEK yerel Mongo; varsayılan koşuda YOK). Yol→modül eşlemesi `tests/tools/run-tests.js`.
- DB gerektiren testler: `tests/integration/` (yalnız `npm run test:integration`); kurallar aşağıda.

## DB kuralları (CLAUDE.md kural 2, 5)
- Yalnızca local Mongo: `mongodb://127.0.0.1` (`localhost` DEĞİL — IPv6'ya çözülür). Bağlantı `backend/.env` `DB_*` değerlerinden; Atlas'a (`ATLAS_DB_*`) asla bağlanma.
- Yalnızca izinli 7 DB: `entegrasyonik`, `entegrasyonik_client`, `entegrasyonik_client_2`, `entegrasyonik_client_24`, `entegrasyonik_client_25`, `entegrasyonikClient_1`, `entegrasyonikDB`. Başka ad yasak; testler için yeni DB oluşturma.
- Testte üretilen veriyi kendin temizle (yalnızca kendi oluşturduğun kayıtlar, ayırt edici prefix ile); toplu silme/drop yok.
- Pazaryeri/harici API: gerçek endpoint'e istek atma; sandbox veya local mock server/nock benzeri mock kullan.
- Ortak yardımcılar gerektiğinde `tests/helpers/` altına eklenip buraya kısaca belgelenir (`tests/helpers/`: `realMongoTestDb`, `localHttpServer`, Trendyol fixture'ları, `fakeSchedulerModels`).

## ADR-0003 aşama 3b (sır saklama) testleri
- `tests/characterization/secrets/`: `field-crypto` (AES-256-GCM), `integration-secrets-crypto` (şifreli yazma/çözme/maskeleme), `integration-factory-decrypt`, `ideasoft-token-crypto`, `storage-env` (R2 env), `no-hardcoded-secrets.static` (kaynakta sabit sır yok), `migration-scripts` (dry-run/apply/idempotency/rotate).
- `tests/setup/jwt-env.js` her jest sürecinde RASTGELE `FIELD_ENCRYPTION_KEYS/ACTIVE_KID` ve sentetik `R2_*` üretir (hiçbir yere yazılmaz).
- Göç betikleri `dev-tools/migrate-*.js` `dist/src/...`'i kullanır (önce `npm run build`); testler mock'lu koleksiyonla çalışır (Mongo yok).
