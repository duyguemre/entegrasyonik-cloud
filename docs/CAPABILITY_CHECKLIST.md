# Yeni/Değişen Yetenek PR Kontrol Listesi (ADR-0019, E8)

Bu depoda **her yeni ya da değişen kullanıcı yeteneği** bu listeyi geçmeden birleştirilmez
(`docs/PLATFORM_BASELINE.md` D10). Bir "yetenek" bir ya da daha fazla RPC operasyonuna karşılık gelen, kullanıcı için
anlamlı bir iştir (`backend/src/capabilities/domains/<alan>.ts`).

```
Yetenek değişikliği:
[ ] Kayıt girdisi eklendi/güncellendi (id, version, domain, summary, effect, minTier, scope, idempotency,
    external, pii, undo, executor, bindings[])  — backend/src/capabilities/domains/<alan>.ts
[ ] Her yeni/değişen RPC operasyonu TAM OLARAK bu yeteneğin `bindings[]` listesinde (tekli+toplu varyant birleşti)
[ ] `minTier` mevcut `operationPolicy.ts` davranışıyla TUTARLI türetildi (kademe/varsayılan-ret DEĞİŞMEDİ)
[ ] UI eşlemesi: `ui: onScreens(...)` (screens.ts key'i GERÇEKTEN var) YA DA gerekçeli `ui: noUi('...')`
[ ] MCP kararı: `mcp: nx('<reason>', '<not ≥20 karakter>')` / `deferred('<stage>', '...')` YA DA (Aşama C+) `exposed{...}`
    — `exposed` yalnız `capability-parity.test.ts` içindeki DONDURULMUŞ listeye bilinçli eklenerek açılır (ADR-0034 BR-2; `project`/çıktı şeması/PII + `present/specs.ts` sunum eşlemesi + onay şablonu (yazma) zorunlu)
[ ] Ajan kararı: `agent: NO_AGENT` (Aşama A) ya da ADR-0018 sonrası gerekçeli `{allowed:true, maxEffect}`
[ ] Testler yeşil: `npx tsc --noEmit`; `npx jest tests/characterization/auth/operation-policy.test.ts
    tests/characterization/auth/capability-parity.test.ts` (P1/P3 hata modunda, sıfır regresyon)
[ ] `cd backend && npm run capabilities:docs` çalıştırıldı; `docs/CAPABILITIES.md` ve
    `docs/CAPABILITIES_CHANGELOG.md` güncellendi (bu iki dosya ELLE DÜZENLENMEZ, PR'a üretilmiş haliyle girer)
[ ] Kademe (`minTier`) değiştiyse: bu PR'ın açıklamasında AÇIKÇA belirtildi (güvenlik incelemesi gerektirir)
[ ] `exposed` açılıyorsa (Aşama C+): `llm.description` (EN, 120-900 karakter) + ≥2 `llm.examples` (çoğu TR) +
    strict girdi şeması + `output ≠ 'legacy'` + `pii ≠ 'raw'` + liste araçlarında `limit ≤ 100` + `cursor`
```

## Sık yapılan hatalar

- **Ölü RPC'ye bağ açmak:** `bindings[].rpc` gerçek bir servis metoduna karşılık gelmiyorsa (`FE_CALLS_WITHOUT_BACKEND`
  listesindeyse) yetenek TANIMLANMAZ — o operasyon zaten çalışmıyor, "ölü kayıt" kuralı yetenek kaydı için de geçerlidir.
- **Aynı RPC'yi iki yeteneğe bağlamak:** her `Servis/operasyon` TAM OLARAK bir yeteneğin bağıdır
  (`findRegistryInvariantViolations` bunu derleme/test zamanında yakalar).
- **`exposed` ile başlamak:** yeni yetenek her zaman `notExposed` ile başlar; açmak ayrı, bilinçli bir karardır (ADR §1).
- **`minTier`'ı serbestçe değiştirmek:** Aşama A'da kademe davranışı SABİTTİR — türetilen tablo eski anlık görüntüyle
  birebir eşleşmelidir (`operationPolicy.snapshot.ts`). Kademe değişikliği ayrı bir güvenlik kararıdır, sessizce yapılmaz.
