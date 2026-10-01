# Backoffice abonelikler, gelir metrikleri ve tenant yaşam döngüsü — API sözleşmesi (B4a/b/c, B2)

ADR-0008 (billing) + ADR-0026 + `docs/BACKOFFICE_PLAN.md` §2.2 (B2) ve §2.3 (B4). Yüzey: `/admin-api` (yalnız platformAdmin, TOTP tamamlanmış tam oturum). Kaynak: `backend/src/api/services/backoffice-billing-service.ts`, `backoffice-tenant-service.ts` (ince sarmalayıcılar), iş mantığı `backend/src/operations/backoffice/{subscriptionAdmin,revenueMetrics,tenantLifecycle}.ts` (saf), şemalar `backend/src/capabilities/rpc-input/backoffice-billing.ts`, yetenekler `backend/src/capabilities/domains/backoffice-billing.ts` (`platform.subscriptions.*`, `platform.revenue.metrics`, `platform.tenant.lifecycle`, `platform.tenant.deletion.cancel_backoffice`).

## Genel kurallar

- Her uç `POST /admin-api/<Servis>/<operasyon>`, JSON gövde, çerezle oturum (`credentials: 'include'`), yazmada `Origin` zorunlu. Başarı: 200 + JSON (aşağıdaki gövdeler).
- Gövde `strict`: bilinmeyen alan/operatör nesnesi → `400 VALIDATION`. `tid` = tenant numarası (pozitif tam sayı; `Clients.order`/`Subscriptions.clientId`).
- **Step-up + gerekçe:** `extendTrial`, `cancelSubscription`, `changePlan`, `BackofficeTenantService/cancelDeletion` son 5 dk içinde `BackofficeAuthService/reauth` ister (yoksa `401 REAUTH_REQUIRED`) ve gövdede **`reason` (≥10, ≤500 karakter)** zorunludur. Okuma uçları step-up istemez.
- Denetim: her yazma RunOperation'dan `backoffice.write` (`meta.reason`, `surface:'backoffice'`); abonelik değişiklikleri ek olarak `BillingEvents`'e sistem olayı yazar (`provider:'system'`, `payloadRedacted.actor/reason`). `listSubscriptions`/`getSubscription` sayfa/çağrı başına tek `backoffice.sensitive_read`; `getLifecycle` de `sensitive_read` yazar.
- Yanıtlar sınırlı: `limit≤200`, imleç (keyset), sorgular `maxTimeMS=5000`. Tenant iş verisi (ürün/sipariş/kullanıcı) ASLA dönmez; sağlayıcı referansları ve kart verisi dönmez (yalnız maskeli `cardLast4`/`cardBrand` ve `hasProviderRef`).
- Sağlayıcıya giden işlemler (`cancelSubscription`, `changePlan`) yeteneklerde `external:true`: `LIVE_READONLY=1` iken `423 LIVE_READONLY`. Yerelde `PAYMENT_PROVIDER=mock` (süreç-içi; dış çağrı yok). `iyzico` henüz yok (fabrika fail-fast).
- Hata kodları (`docs/ERROR_CODES.md`): `VALIDATION` 400, `REAUTH_REQUIRED` 401, `NOT_FOUND`/`SUBSCRIPTION_NOT_FOUND`/`PLAN_NOT_FOUND` 404, 409 grubu: `SUBSCRIPTION_CHANGED`, `SUBSCRIPTION_EXEMPT`, `SUBSCRIPTION_NOT_CANCELABLE`, `SUBSCRIPTION_NOT_CHANGEABLE`, `TRIAL_NOT_ACTIVE`, `TRIAL_EXTENSION_LIMIT`, `NO_PROVIDER_SUBSCRIPTION`, `PROVIDER_MISMATCH`, `PROVIDER_SUBSCRIPTION_MISSING`, `SAME_PLAN`, `PLAN_REQUIRES_QUOTE`; `PROVIDER_ERROR` 502; `LIVE_READONLY` 423.

## B4a — `BackofficeBillingService/listSubscriptions`
Girdi: `{ status?: "trialing"|"active"|"past_due"|"suspended"|"canceled"|"expired", planCode?: string, cursor?: string, limit?: 1..200 (varsayılan 50) }`. Sıra: yeniden eskiye (`_id` azalan). Yanıt:
```json
{ "items": [ {
    "tid": 7, "tenantName": "Mağaza Adı", "planCode": "growth", "planVersion": 1, "status": "active",
    "trialEndsAt": null, "currentPeriodStart": "2026-09-01T00:00:00.000Z", "currentPeriodEnd": "2026-10-01T00:00:00.000Z",
    "cancelAtPeriodEnd": false, "graceUntil": null, "billingExempt": false, "provider": "mock", "hasProviderRef": true,
    "cardLast4": "4242", "cardBrand": "visa", "createdAt": "…", "updatedAt": "…" } ],
  "nextCursor": "NjRi…" }
```
- Sonraki sayfa: `nextCursor`'ı `cursor` olarak gönder; `null` = son sayfa. Bozuk imleç → `400 VALIDATION`.
- **Boş durum:** `{ "items": [], "nextCursor": null }` (abonelik yok / filtre eşleşmedi) — hata değil.
- `tenantName` tenant kaydı bulunamazsa `null`.

## B4a — `BackofficeBillingService/getSubscription { tid }`
Yanıt: `{ "subscription": <liste satırı + "plan": { code, name, priceMinor, currency, interval, vatIncluded, limits, features } | null>, "events": [ { "id", "at", "provider", "type", "status", "failureReason", "payload" } ] }`. `events`: en yeni 50 `BillingEvents` (`receivedAt` azalan; `payload` zaten redakte edilmiş küçük alt küme; `provider:'system'` = backoffice/iş kaynaklı, ör. `subscription.trial_extended`, `subscription.admin_canceled`, `subscription.admin_plan_changed`, `subscription.trial_expired`). Abonelik yoksa `404 SUBSCRIPTION_NOT_FOUND`. Olay yoksa `events: []`.

## B4b — yazmalar (step-up + `reason`)
**`extendTrial { tid, days: 1..30, reason }`** → `{ tid, status: "trialing", trialEndsAt, previousTrialEndsAt, extendedDays, totalExtensionDays, remainingExtensionDays, reopened }`. Yeni bitiş = `max(mevcut bitiş, şimdi) + days`. Yalnız `trialing` ya da denemesi bitip askıya alınmış kartsız `suspended` (K40: uzatmayla yeniden `trialing`, `reopened:true`; muaf değil); aksi `409 TRIAL_NOT_ACTIVE`/`SUBSCRIPTION_EXEMPT`. **Toplam uzatma ≤ 60 gün** (tek seferde ≤ 30); aşımda `409 TRIAL_EXTENSION_LIMIT` ve `details: { remainingDays, usedDays, maxTotalDays }`. Sağlayıcıdan bağımsız (kartsız deneme), iyimser kilitli tek yazım; eşzamanlı değişimde `409 SUBSCRIPTION_CHANGED`.

**`cancelSubscription { tid, atPeriodEnd: boolean, reason }`** → `{ tid, status, cancelAtPeriodEnd, currentPeriodEnd }`. Sağlayıcı `cancel(ref, atPeriodEnd)` çağrılır; Subscriptions'a yalnız sağlayıcının kanonik yanıtı yazılır (webhook ile aynı alanlar). `atPeriodEnd:true` → durum değişmez, `cancelAtPeriodEnd:true`; `false` → `canceled`. Sağlayıcı kaydı olmayan abonelik (kartsız deneme/`suspended`, K40) → sağlayıcı çağrılmadan doğrudan YEREL `canceled` (`atPeriodEnd` yok sayılır), yanıtta `external:false`; LIVE_READONLY 423 YALNIZ sağlayıcı çağrılan yolda (`external:true`). Yanıt alanı: `external: boolean`. `canceled/expired` → `409 SUBSCRIPTION_NOT_CANCELABLE`.

**`changePlan { tid, planCode, reason }`** → `{ tid, status, planCode, planVersion }`. Hedef plan `active:true` olmalı (`404 PLAN_NOT_FOUND`), `priceMinor>0` (`409 PLAN_REQUIRES_QUOTE`), mevcut plandan farklı (`409 SAME_PLAN`); abonelik `trialing|active|past_due` ve sağlayıcı kaydı var. Proration/fatura sağlayıcı sorumluluğundadır (mock'ta yok).

## B4c — `BackofficeBillingService/getRevenueMetrics { range?: "7d"|"30d"|"90d" (varsayılan 30d) }`
```json
{ "range": "30d", "from": "…", "to": "…",
  "mrr": { "byCurrency": { "TRY": 300000 }, "byPlan": [ { "planCode": "growth", "subscriptions": 2, "monthlyMinor": 100000, "currency": "TRY", "mrrMinor": 200000 } ],
           "billedSubscriptions": 4, "quoteBasedSubscriptions": 1, "unpricedSubscriptions": 0 },
  "statusDistribution": { "trialing": 4, "active": 3, "past_due": 0, "suspended": 0, "canceled": 1, "expired": 0 },
  "exemptSubscriptions": 10,
  "trialConversion": { "cohort": 8, "converted": 2, "rate": 0.25 },
  "churn": { "count": 1, "mrrLostByCurrency": { "TRY": 100000 }, "rate": 0.2 },
  "paymentEvents": { "succeeded": 5, "failed": 2 } }
```
Tanımlar: tutarlar **kuruş** (`Plans.priceMinor`), para birimi ayrı; MRR = `active`+`past_due` ve `billingExempt` olmayan abonelikler × plan **liste** fiyatı (yıllık `/12`); `priceMinor=0` (özel teklif) `quoteBasedSubscriptions`, plan belgesi bulunamayan `unpricedSubscriptions` olarak sayılır, MRR'a girmez; `statusDistribution` muaf olmayanlar, muaflar `exemptSubscriptions`. `trialConversion`: aralıkta açılan muaf olmayan aboneliklerden sağlayıcı kaydı olup `active|past_due|canceled` olanlar / kohort. `churn`: aralıkta `canceled|expired` durumuna son dokunulan (`updatedAt`) abonelikler (yaklaşık; durum geçiş tarihçesi yoktur); `rate = kayıp / (ödeyen + kayıp)`. Oranlar payda 0 ise `null` (FE "—" göstermeli). `paymentEvents` tutar taşımaz (BillingEvents'te tutar yok). Veri yoksa: boş `byCurrency`, sıfır sayaçlar, `null` oranlar.

## B2 — `BackofficeTenantService/getLifecycle { tid }`
```json
{ "tid": 5, "status": "DELETION_PENDING", "name": "Mağaza", "lastSuccessfulOrderSync": "…",
  "trial": { "subscriptionStatus": "trialing", "planCode": "starter", "trialEndsAt": "…", "daysLeft": 3, "billingExempt": false },
  "deletion": { "requestedAt": "…", "requestedBy": "64b…", "scheduledAt": "…", "daysUntilPurge": 5, "canCancel": true, "purgedAt": null, "purgeFailedStep": null },
  "provisioning": { "steps": [ { "step": "client", "state": "done" } ], "startedAt": null, "failedAt": null, "failedStep": null },
  "recentEvents": [ { "at": "…", "event": "tenant.deletion.requested", "result": "ok", "actorType": "user", "surface": "app", "imp": false } ] }
```
- `status`: `Clients.status` (`PROVISIONING|PROVISIONING_FAILED|ACTIVE|DELETION_PENDING|PURGING|PURGE_FAILED|PURGED`). `trial` abonelik yoksa `null`; `daysLeft` yalnız `trialing`. `deletion` silme süreci yoksa `null`; `canCancel` yalnız `DELETION_PENDING`.
- `provisioning.steps` sırası: `client, order-limit, central-user, tenant-seed, tenant-user, subscription, activate`; `state`: `done|failed|pending`. ACTIVE (vb.) tenant'ta hepsi `done`; `PROVISIONING_FAILED`'da `failedStep` öncesi `done`, o adım `failed`, sonrası `pending`; adım bilinmiyorsa (`PROVISIONING`) hepsi `pending`.
- `recentEvents`: en yeni 10 `AuditLogs{tid}` kaydı; **yalnız olay adı/zaman/sonuç** (meta ve aktör kimliği yok). Olay yoksa `[]`.
- Mağaza yoksa `404 NOT_FOUND`. Her çağrı `backoffice.sensitive_read` yazar.

## B2 — `BackofficeTenantService/cancelDeletion { tid, reason }` (step-up)
Mevcut `TenantLifecycleService.cancelDeletion` (ADR-0003 F.20) backoffice yüzeyine bağlanmıştır: `DELETION_PENDING → ACTIVE`. Yanıt `{ "order": 5, "status": "ACTIVE" }`. Silme talebi yoksa `409`, tenant yoksa `404`. Eski `TenantDataService/cancelDeletion` (`targetClientId`) `/admin-api` üzerinden de çağrılabilir; artık o da step-up + `reason` ister.

## Açık insan kararları
1-3. **KAPANDI (K40, 2026-10-01):** süresi dolmuş kartsız deneme uzatmayla yeniden açılır; kartsız abonelikte iptal yerel ve doğrudandır; toplam deneme uzatma ≤ 60 gün.
4. **Gelir metrikleri plan liste fiyatıdır** (indirim/`limitOverrides`/kupon ve vergi dahil-hariç ayrımı yok); faturalanan gerçek tutar iyzico adaptörü ve fatura kaynağı gelince ayrı iş.
5. **`iyzico` adaptörü yok:** `cancel/changePlan` yalnız `mock` sağlayıcıyla çalışır; mock durumu süreç-içidir (yeniden başlatmada ref kaybı → `409 PROVIDER_SUBSCRIPTION_MISSING`).

## Ek (K51 / BO1) — müşteri listesi operasyon özeti ve sağlık özeti
Tam sözleşme `docs/API_BACKOFFICE_ATTENTION.md`: BE-01 `BackofficeTenantService/listTenants` (satır başına `ops`: plan, abonelik durumu, açık sorun, 24 sa başarısız iş, son hata; süzgeç `hasIssues`/`subscriptionStatus`; sıralama `openIssues`/`lastErrorAt`), BE-02 `BackofficeTenantService/getHealthSummary { tid }` ("Şu an" kartı).
