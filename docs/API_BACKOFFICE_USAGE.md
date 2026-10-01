# Kullanım izlemede platform ayrımı (MOB-08) — API sözleşmesi

Karar: `USER_DECISIONS` K55 (BACKLOG MOB-08), K51 sayfa deseni. Ortak kurallar `docs/API_BACKOFFICE_ATTENTION.md` (POST `/admin-api/<Servis>/<operasyon>`, `strict` gövde, `maxTimeMS ≤ 5000`, tenant iş verisi/PII dönmez). Bu belge yalnız MOB-08 eklerini tanımlar; alan adları bağlayıcıdır, ek alan eklenebilir (kırıcı değil).

## 1. İstemci platform sınıfı — `X-Client-Platform`

| Değer | Anlam | Ana sınıf |
|---|---|---|
| `desktop_web` | Masaüstü tarayıcı (masaüstüne kurulu PWA dahil) | `desktop` |
| `electron` | Electron masaüstü kabuğu | `desktop` |
| `mobile_web` | Mobil tarayıcı | `mobile` |
| `pwa` | Mobil cihaza kurulu PWA (display-mode standalone/fullscreen/minimal-ui ya da iOS `navigator.standalone`) | `mobile` |
| `android_app` | Android Capacitor kabuğu (UA `EntegrasyonikShell/` işareti + `Capacitor.isNativePlatform()`) | `mobile` |
| `unknown` | Belirlenemedi | `unknown` |

- **Tek kaynak:** önyüz `@entegrasyonik/ui/platform` (`detectClientPlatform`, müşteri uygulaması + backoffice + sohbet taşıyıcıları), backend `src/platform/core/context/clientPlatform.ts`. Değer listesi iki tarafta aynı sırada sabit (iki tarafın testi korur).
- **Algılama sırası (önyüz):** Android kabuğu (MOB-07 köprüsüyle aynı kural: UA `EntegrasyonikShell/…` işareti VE `Capacitor.isNativePlatform()`) → Electron (köprü `window.ekDesktop` ya da UA `Electron/`) → kurulu uygulama + mobil cihaz → mobil cihaz (UA-CH `mobile`, `(pointer: coarse)` + `(hover: none)`, UA işareti) → masaüstü. Dar masaüstü penceresi mobil sayılmaz. Değer oturum boyunca önbelleklenir.
- **Gönderim:** müşteri uygulaması kendi API köküne giden her axios isteğine (request interceptor; dış adreslere eklenmez), backoffice `/admin-api` axios örneğine, iki sohbet SSE taşıyıcısına başlık ekler. Yalnız sınıf değeri gider.
- **Sunucu:** `createRequestIdMiddleware` (tüm rotalardan önce) başlığı izinli listeyle doğrular (büyük/küçük harf ve boşluk duyarsız, ≤ 32 karakter). Geçersiz/eksikse **UA'dan kaba sınıf** (yalnız yedek: Android kabuğunun bilinçli UA işareti `EntegrasyonikShell/… (app|backoffice; fcm=…)` → `android_app`; ardından `electron` / `mobile_web` / `desktop_web` / `unknown`; PWA UA'dan uydurulmaz). Sonuç `res.locals.clientPlatform` ve ALS bağlamına (`RequestContext.clientPlatform`) girer. Ham UA hiçbir yere yazılmaz.
- **CORS:** `/admin-api` `allowedHeaders` listesine `X-Client-Platform` eklendi. Müşteri `/api` CORS'u `allowedHeaders` belirtmez (istek başlıklarını yansıtır) → değişiklik gerekmez.

## 2. Kayıtlar (geriye uyumlu)

### 2.1 `AuditLogs.platform` (yeni, isteğe bağlı)
`AuditLogger.log` kayda istek bağlamındaki sınıfı yazar (açıkça verilen `platform` önceliklidir). Bağlam yoksa (motor/sistem işleri) alan yazılmaz. Giriş (`login`), kayıt, mağaza seçimi ve backoffice olayları dahil tüm denetim kayıtları bu alanı taşır. MOB-08 öncesi kayıtlarda alan yoktur → okumada `unknown`. Yeni indeks gerekmez (`tid_1_at_-1` + `event` süzgeci).

### 2.2 `UsageDaily` (yeni koleksiyon, ApplicationDB)
Minimal günlük toplama: **(gün, tenant, platform) başına tek belge**.
```jsonc
{ "day": "2026-10-01", "tid": 7, "platform": "android_app", "u": ["3f9a…(16 hex)", "…"], "expAt": "2027-03-30T21:00:00.000Z", "updatedAt": "…" }
```
- `day`: Europe/Istanbul takvim günü. `u`: o gün o platformdan en az bir müşteri RPC'si yapan kullanıcıların **takma kimlikleri** (`sha256(sub)` ilk 16 hex; ham sub/UA/IP yok). Aktif kullanıcı = tekil takma kimlik sayısı.
- Yazım: müşteri yüzeyi genel RPC rotası (`POST /api/:service/:operation`) başarılı yanıttan önce, beklemeden (fire-and-forget). Pod başına günlük tekilleştirme (aynı tenant+platform+kullanıcı için günde bir upsert: `$addToSet` + `$setOnInsert expAt`). **Fail-open:** yazma hatası isteği düşürmez; `warn` log + `usage_record_failures_total` sayacı.
- **Sayılmaz:** tenant'sız oturum, platform yöneticisi (`ga`), impersonation/destek oturumu (`imp`), backoffice.
- Saklama 180 gün (`expAt` TTL). İndeksler: `uniq_day_tid_platform` (UNIQUE), `tid_1_day_-1`, `expAt_ttl`. Şema `autoIndex:false`; göç **`backend/migrations/0021-usage-daily-app.js` — ÇALIŞTIRILMADI** (ilk dağıtımdan önce yerelde yedek + onayla `up`).
- Geriye dönük doldurma yok: veri dağıtımdan sonra birikir; öncesi `computable:false`.

## 3. Okuma uçları

### 3.1 `BackofficeOverviewService/getPulse { platform? }` — `activeUsers` bloğu (ek)
Girdi: `{ platform?: 'desktop' | 'mobile' | 'desktop_web' | 'electron' | 'mobile_web' | 'pwa' | 'android_app' | 'unknown' }`. Süzgeç **yalnız** `activeUsers` bloğuna uygulanır (diğer bloklar platform boyutu taşımaz). Blok 2 sn zaman aşımıyla; okunamazsa `{status:'degraded', error}`.
```jsonc
"activeUsers": { "status": "ok", "computable": true, "platform": null,
  "today":   { "users": 31, "tenants": 12 },          // tekil kullanıcı (tenant|takma) + aktif müşteri
  "last7d":  { "users": 88, "tenants": 30 },
  "last30d": { "users": 140, "tenants": 39 },
  "byClass":    { "desktop": 61, "mobile": 37, "unknown": 2 },     // son 7 gün; bir kullanıcı iki sınıfta da sayılabilir (toplamda bir kez)
  "byPlatform": { "desktop_web": 55, "electron": 8, "mobile_web": 20, "pwa": 9, "android_app": 12, "unknown": 2 },
  "mobileShare": 0.378,                                // son 7 gün: en az bir kez mobilden gelen / sınıfı bilinen kullanıcı; payda 0 → null
  "daily": [ { "day": "2026-09-18", "desktop": 40, "mobile": 21, "unknown": 0 } ],   // son 14 gün, eskiden yeniye
  "truncated": false }                                 // > 20.000 belge okunacaksa true (sayılar alt sınır)
```
Veri yoksa: `{ "computable": false, "platform": …, "today": null, "last7d": null, "last30d": null, "byClass": null, "byPlatform": null, "mobileShare": null, "daily": [], "truncated": false, "note": "hesaplanamadı" }`.

### 3.2 `BackofficeTenantService/getUsage { tid, days?, platform? }` (yeni)
Girdi: `tid` pozitif tam sayı (tenant order — kullanım kaydı oturumdaki `tid` ile yazılır), `days ∈ {7, 30, 90}` (varsayılan 30), `platform?` (3.1 ile aynı süzgeç; girişlere de uygulanır, `unknown` alanı olmayan eski kayıtları kapsar). Yalnız sayaç döner; takma kimlik/UA/IP dönmez; denetim yazılmaz (getHealthSummary gibi).
```jsonc
{ "tid": 7, "days": 30, "platform": null, "generatedAt": "…", "from": "2026-09-02", "to": "2026-10-01",
  "activeUsers": { "computable": true, "users": 9,
                   "byClass": { "desktop": 6, "mobile": 5, "unknown": 0 },
                   "byPlatform": { "desktop_web": 6, "electron": 0, "mobile_web": 1, "pwa": 1, "android_app": 3, "unknown": 0 },
                   "mobileShare": 0.556, "lastActiveDay": "2026-10-01",
                   "daily": [ { "day": "2026-09-02", "desktop": 3, "mobile": 1, "unknown": 0 } ],   // aralığın her günü
                   "truncated": false },
  "logins": { "computable": true, "total": 41,
              "byClass": { "desktop": 25, "mobile": 12, "unknown": 4 },
              "byPlatform": { "desktop_web": 25, "electron": 0, "mobile_web": 3, "pwa": 2, "android_app": 7, "unknown": 4 } } }
```
- `activeUsers` verisi yoksa 3.1'deki `computable:false` biçimi (`users:null`, `daily:[]`, `lastActiveDay:null`).
- `logins`: `AuditLogs` `event:'login', result:'ok', tid` (aralık başı Europe/Istanbul gün başlangıcı). Platformsuz eski kayıt → `unknown`.
- Hatalar: `400 VALIDATION` (geçersiz `tid`/`days`/`platform` ya da bilinmeyen alan).

### 3.3 Yetenekler (ADR-0019 tek kayıt)

| Yetenek | RPC | Etki | MCP / ajan |
|---|---|---|---|
| `platform.overview.pulse` (güncellendi: `platform` parametresi) | `BackofficeOverviewService/getPulse` | read | `notExposed(platform_admin)` / `NO_AGENT` (değişmedi) |
| `platform.tenants.usage` (yeni) | `BackofficeTenantService/getUsage` | read | `notExposed(platform_admin)` / `NO_AGENT` |

MCP/sohbet eşitliği: kullanım sorgusu yapan yetenek bugün MCP'ye ve backoffice sohbetine (`adminChat`) açık değildir; açıldığında aynı `platform` parametresi kayıttaki girdi şemasından gelir (ek iş yok). Müşteri tarafında kullanım sorgusu yeteneği yoktur.

## 4. Otopilot ve diğer kullanım kaynakları (kapsam kararı)
- Otopilot sağlayıcı kullanımı (`agent:usage:{tid}:{gün}` istek/jeton sayaçları, Redis) tenant toplamıdır; platform boyutu **eklenmedi** (sohbet SSE istekleri başlığı taşır ve denetim kayıtlarına yansır; jeton sayaçlarını platforma bölmek ayrı karar).
- Abonelik kotaları (`EntitlementService.checkQuota`) ve MCP günlük kotası kullanım ölçmez, sınır uygular → kapsam dışı.
- HTTP RED metrikleri (`http_requests`) bilinçli olarak tenant/kullanıcı etiketsizdir (ADR-0017 Karar 2.3); platform etiketi eklenmedi (kardinalite).
