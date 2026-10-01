# Operasyon politika kaydı (OPERATION_POLICY)

**Bu belge ADR-0019 Aşama A ile `docs/CAPABILITIES.md`'ye devredildi.** Asıl kayıt artık
`backend/src/capabilities/` (Yetenek Kaydı, zod-şemalı TypeScript) — `backend/src/api/rpc/operationPolicy.ts` bu kayıttan
`derivePolicy()` ile bellekte türetilir (dışa açık API: `getRequiredTier`, `OPERATION_POLICY`, `OPEN_OPERATIONS`
DEĞİŞMEDİ — bkz. `docs/adr/0019-yetenek-kaydi-ve-mcp-chat-ui-esitligi.md` §2).

→ Operasyon/yetenek tablosu, gerekçeler, "Belirsiz" (insan incelemesi bekleyen) kademe kararları ve otomatik
değişiklik günlüğü için: **`docs/CAPABILITIES.md`** (üretilmiş; `cd backend && npm run capabilities:docs` ile
yeniden üretilir, elle düzenlenmez) ve **`docs/CAPABILITIES_CHANGELOG.md`**.

## Kanonik sayı (mekanik, 2026-09-28, ADR-0019 Aşama A içe aktarımı ile çözüldü)

Önceki sürümlerde bu belgede "156", "158", "159" ve "172" gibi tutarsız sayılar geçiyordu (farklı tarihlerdeki
anlık görüntüler + bir belge hatası — BillingService'in "Tam tablo" bölümünde hiç listelenmemiş olması). Kanonik,
mekanik olarak doğrulanmış sayı: **174** `(servis, operasyon)` çifti (`ImageApi` sözde-servisi dahil, `OPEN_OPERATIONS`
hariç; member 137, admin 19, owner 2, platformAdmin 16). Bu 174 operasyon, ADR-0019 içe aktarımıyla **149 iş-odaklı
yeteneğe** bağlandı (tekli+toplu RPC varyantları tek yetenekte birleşti). Ayrıntı ve tam çözümleme: `docs/CAPABILITIES.md`
"Özet" bölümü.

## Model (değişmedi; ADR-0001 Karar 7-9)

- Kademeler: `member` < `admin` < `owner`; ayrı dikey `platformAdmin` (doğrulanmış token'da `ga === true`).
- Aktörün kademesi sunucuda DB'den kurulan bağlamdan gelir (token'daki `role` claim'i kullanılmaz).
- **Varsayılan ret:** kayıtta olmayan her servis/operasyon 403. Kimlik yoksa kayıtlı operasyon için 401.
- Açık rotalar (`OPEN_OPERATIONS`) kayıt dışıdır, değişmedi.
- `ImageApi`: `ImageApiManager` rotaları için sözde-servis; jenerik RPC ile çağrılamaz.

Testler: `backend/tests/characterization/auth/operation-policy.test.ts` (DEĞİŞTİRİLMEDİ, ADR-0019 Aşama A çıkış kapısı)
+ `backend/tests/characterization/auth/capability-parity.test.ts` (yeni, parite kapısı v1).
