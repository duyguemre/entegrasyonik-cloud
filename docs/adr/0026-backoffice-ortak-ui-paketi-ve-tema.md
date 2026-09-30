# 0026 — Backoffice uygulaması, ortak UI paketi ve tema (dark mode)

## Durum
Kabul edildi (2026-09-30). Uygulama planı ve bulut görev brifleri: `docs/BACKOFFICE_PLAN.md`.

**Değiştirdiği kararlar:**
- ADR-0007 "Repo yapısı". Paylaşılan paket kökteki `packages/ui-kit` yerine `frontend/packages/ui` olur. Workspace kökü repo kökü değil, `frontend/` olur. Tauri kabuğu başlarsa kökteki `desktop/` yerine `frontend/desktop/` altına kurulur. Gerekçe: Karar 1.
- ADR-0011 "Konum". `tokens/` Faz 4'te `frontend/packages/ui/src/tokens/` altına taşınır.
- ADR-0011 Karar 3 ve ADR-0015 Karar 5.5 (dark mode kapısı). Kapı ve ölçütü aynen geçerlidir. Değişen tek şey sıralamadır: kullanıcı dark mode'u açıkça istedi. Bu yüzden kapının sağlanması artık bekleyen bir ölçüm değil, planlı bir iştir (Aşama 1).
- ADR-0012 (sekmeli çalışma alanı). Model aynen kalır. Sekme mantığı `createWorkspaceStore` fabrikası olarak paylaşılan pakete çıkarılır (Aşama 2).

**Numara notu:** Barındırma/R2 ADR'si paralel yazılıyor. 0025 numarası o ADR'ye bırakıldı. Bu ADR'de `admin.entegrasyonik.com` için gereken barındırma notları, o ADR'ye girdi olarak yazılmıştır (Karar 4.1).

## Bağlam
- **Yönetim ekranları müşteri uygulamasının içinde.** `frontend/src/views/secure/adminPanel/**` altında 9 view dosyası, `frontend/src/components/adminPanel/**` altında 14 bileşen/composable var (envanter: `docs/BACKOFFICE_PLAN.md` §1). Hepsi `platformAdmin` kademesinde. Yetki backend'de `principal.ga === true` ile zorlanıyor (`backend/src/api/operationPolicy.ts:97-116`). Ancak ekranlar müşteri paketinde, müşteri origin'inde ve müşteri oturum çerezi (`JWT_TOKEN`) ile çalışıyor.
- **Oturum müşteriyle aynı.** Çerez host-only, `Path=/`, 8 saat, üretimde `SameSite=None` (`backend/src/api/Security.ts:115-123`). Süper yönetici aynı çerezle giriş yapıyor. `SecurityService/selectStore` aynı çerezi `imp:true` ile yeniden basıyor (impersonation). Kısa oturum, yeniden kimlik doğrulama ve 2FA yok.
- **Menü ve menü kaydı.** Admin menüsü ApplicationDB `menus` koleksiyonundan geliyor (`frontend/src/navigation/screens.ts:110-146`). ADR-0020 C ekranlarının menü kaydı hâlâ açık iş.
- **Tasarım sistemi hazır.** DS-v2 (`frontend/src/components/ds/**`: 61 bileşen + 6 şablon) ve token katmanı (`frontend/src/design/tokens/**`) büyük ölçüde uygulamadan bağımsız. DS bileşenlerinin `@/` importları yalnızca `design/*` ve `composables/{format,useToast,useSavedViews,usePageAbout}` ile sınırlı. Tek istisna `status-map.ts`: alan tiplerini import ediyor.
- **Dark mode token katmanında tam, canlıda eksik.** Token katmanı dark değerleri tam tanımlıyor ve `vuetify-theme.ts` tüm semantik anahtarları dark'a kablıyor. Ama 43 legacy anahtarın 31'i dark'ta tanımsız (`DARK_WIRED_LEGACY_KEYS`). `stores/theme.ts` içindeki `toggleTheme` işlevsiz. Tema tercihi, ilk boyama betiği ve dark görsel taban yok.
- **Bulut akışı sınırı.** Bulut yalnızca `site/` ve `frontend/` yollarına yazabilir (`CLAUDE.md` kural 7). `scripts/cloud-sync.sh` içinde `WRITABLE_PATHS=(site frontend)`. Pull, `git apply --3way` ile yama uyguluyor. Bu yüzden, yolu taşınmış dosyalara karşı yazılmış açık bir bulut dalı temiz uygulanamaz. Şu an bulutta `cloud/ds-v2-a6b` açık (A5/A6a'yı içeriyor).
- **Loglar dağınık ve okunamıyor.** Loglar pino ile yalnızca stdout'a gidiyor, kalıcı ve sorgulanabilir log deposu yok (`backend/src/platform/core/logger/logger.ts:60-61`). Hata grupları `ErrorEvents` koleksiyonunda tutuluyor: parmak izi `source::module::code::şablon`, 30 gün TTL, yalnızca son `tenantId` saklanıyor (`platform/runtime/metrics/errorEvents.ts`, `database/application/models/ErrorEvent.ts`). Metrik kovaları `MetricRollups`, çağrı metrikleri `IntegrationCallMetrics` (corrId yok), denetim kayıtları `AuditLogs` (365 gün). Bu dört kaynak için platform düzeyinde okuma RPC'si yok. Entegrasyon katmanında yapılandırılmış logger yerine 151 `console.*` çağrısı var (F-06).

## Değerlendirilen Alternatifler

### 1. Depo ve klasör düzeni
| | Düzen | Artı | Eksi |
|---|---|---|---|
| **(a)** | Kökte `packages/ui` + `frontend/` + `backoffice/`, kök npm workspaces (ADR-0007'nin orijinal hâli) | Simetrik ve "doğru" monorepo görünümü. ADR-0007 ile birebir. | `cloud-sync.sh` WRITABLE/EXPORT yolları, kural 7, `cloud-setup.sh` ve kök `package.json`/lock'un buluta yazılabilir olması gerekir. Frontend lock'u köke taşınır; ADR-0011'in "bağımlılık ağacını riske atma" uyarısı burada gerçekleşir. `site/` token yolu, backend FE envanter testi ve Electron/Docker bağlamı değişir. |
| **(b)** | `frontend/apps/app` + `frontend/apps/backoffice` + `frontend/packages/ui` | Bulut kuralları değişmez. Düzen simetrik kalır. | Müşteri uygulamasının 900'ü aşkın dosyası yer değiştirir: 187 `*-win32.png` tabanının yolları, ratchet tabanlarının anahtarları, `forge.config.js`/`main.js`/Dockerfile/nginx, `site/` importu ve `operation-policy.test.ts` `FE_SRC`. **Açık bulut dalı `cloud/ds-v2-a6b`'nin yaması taşınmış yollara uygulanamaz.** Bu, kaçınılması gereken bir büyük patlama olur. |
| **(c) SEÇİLEN** | `frontend/` müşteri uygulaması **yerinde kalır** ve workspace kökü olur. Yeni: `frontend/packages/ui/` (`@entegrasyonik/ui`) + `frontend/backoffice/` (`@entegrasyonik/backoffice`). | Mevcut dosyaların yolu değişmez. `cloud-sync.sh`, kural 7 ve `cloud-setup.sh` değişmez. Tek lockfile kalır (`frontend/package-lock.json`). Vue/Vuetify sürümleri iki uygulamada zorunlu olarak aynıdır. Açık bulut dalları temiz uygulanır. | Asimetrik: kök hem uygulama hem workspace kökü. Kökteki `vitest`/`eslint`/`tsconfig`/ratchet kapsamları açıkça `src/` ile sınırlanmalı, `packages/` ve `backoffice/` ayrıca taranmalı. Electron `forge.config.js` bu iki klasörü paket dışında tutmalı. |
| (d) | Ayrı repo `entegrasyonik-backoffice` + yayımlanmış npm paketi | Tam izolasyon. | Sürümleme, yayımlama ve iki repo senkronu gerekir. Tek haneli abone ve 1-2 yönetici ölçeğinde gereksiz operasyon yükü (ADR-0007 eşiği tetiklenmedi). |

### 2. Backoffice API yüzeyi ve oturum
| | Seçenek | Artı | Eksi |
|---|---|---|---|
| A | Mevcut `/api` + aynı `JWT_TOKEN` çerezi; yalnızca origin ayrı | Sıfır backend işi. | Müşteri ve yönetici oturumu karışır: aynı tarayıcıda iki sekme tek çerezi paylaşır. Yönetici çerezi 8 saatlik müşteri çerezidir. Admin origin'i müşteri CORS listesine girer. |
| **B SEÇİLEN** | **Aynı backend sürecinde ayrı bağlama noktası `/admin-api`** (aynı RPC motoru, `ApiManager` deseni). Ayrı çerez `EK_ADMIN` (`Path=/admin-api`, `SameSite=Strict`), ayrı `aud` claim'i, ayrı CORS listesi. | Yeni servis ya da maliyet yok. Oturumlar kriptografik olarak ayrılır (`aud`). Çerez yol kapsamıyla birbirine hiç gönderilmez. Yetki tek yetenek kaydında kalır (ADR-0019). | Kimlik doğrulama ara katmanı iki kipte çalışmalı (kod: `authenticate.ts`, `Security.ts`). |
| C | Ayrı backend servisi (`admin-api` Railway servisi) | Ağ izolasyonu. | İkinci deploy, ikinci Redis/Mongo bağlantı havuzu ve bakım yükü. Bu ölçekte değer katmaz. |

### 3. Log deposu (Log Kontrol Merkezi)
| | Seçenek | Artı | Eksi |
|---|---|---|---|
| A | Harici log SaaS (Better Stack / Axiom / Grafana Loki Cloud) | Hazır arama ve canlı akış. | Yeni alt işleyen (KVKK veri işleyen sözleşmesi), yurt dışı aktarım, yeni sır, aylık maliyet. Tenant kategorisini bizim şemamızla eşlemek yine iş gerektirir. |
| **B SEÇİLEN** | **ApplicationDB içinde `LogEvents` (TTL) + `ErrorEvents` genişletmesi + `MetricRollups` sayaçları.** Yalnızca `warn` ve üstü ile seçili `info` kategorileri kalıcılaştırılır. | Ek servis yok. Mevcut redaksiyon, parmak izi ve taşkın denetimi yeniden kullanılır. Sorgular platformAdmin RPC'leri olarak yetenek kaydına girer. | Sorgu gücü ve hacim sınırlı (eşik aşağıda). Yazma yolu olay döngüsünü asla bloklamamalı (tamponlu, düşürmeli yazım). |
| C | Yalnızca `ErrorEvents` üzerine pano; ham log barındırıcının stdout görüntüleyicisinde | En ucuz. | "Kategorize, izlenebilir, korelasyonlu" gereksinimini karşılamaz. |

## Karar
**Müşteri uygulaması `frontend/` içinde yerinde kalır ve npm workspaces kökü olur. Ortak tasarım sistemi `frontend/packages/ui` (`@entegrasyonik/ui`) paketine çekilir. Ayrı backoffice uygulaması `frontend/backoffice` altında aynı DS-v2 kabuğuyla kurulur ve `admin.entegrasyonik.com`'dan yayınlanır. Backoffice, aynı backend sürecindeki `/admin-api` bağlama noktasını kullanır; bu noktanın ayrı çerezi, `aud` claim'i, zorunlu TOTP 2FA'sı, kısa oturumu, adım-yükseltmesi (step-up), denetimi ve tek kullanımlık impersonation bileti vardır. Dark mode, token katmanında light/dark semantik setlerle ve ilk boyamadan önce çalışan bir tema betiğiyle iki uygulamada da açılır. Log Kontrol Merkezi ApplicationDB'de (`LogEvents` + genişletilmiş `ErrorEvents`) kurulur. Geçiş 5 aşamada yapılır (0–4); tek seferlik büyük geçiş yapılmaz.**

### Karar 1 — Klasör düzeni (seçenek c)
```
frontend/                      müşteri uygulaması (DEĞİŞMEZ yollar) + workspace kökü
  package.json                 "workspaces": ["packages/*", "backoffice"]   (tek lock)
  src/ e2e/ tests/ main.js forge.config.js Dockerfile nginx*.conf ...
  packages/ui/                 @entegrasyonik/ui — derleme adımı YOK, kaynak (TS/SFC) olarak tüketilir
    package.json               "exports": { "./tokens": ..., "./theme": ..., "./components/*": ..., "./composables/*": ..., "./rpc": ..., "./shell": ..., "./locales/*": ... }
    src/tokens/                (ADR-0011 SAF TS + dist/tokens.{app,static}.css — commit'li, drift testi pakette)
    src/theme/                 vuetify-theme, vuetify-defaults, overrides CSS, echarts-theme, channels, themePreference, theme-boot
    src/components/            Ek* (DS-v2) + templates/
    src/shell/                 createWorkspaceStore fabrikası, EkSidebarNav/EkWorkspaceTabs/EkAppHeader kompozisyonları (Aşama 2)
    src/composables/           format, useToast, useSavedViews(ad alanlı), usePageAbout, useShellBreakpoints
    src/rpc/                   createRpcClient (Aşama 2)
    src/locales/{tr,en}/ds.json
    scripts/build-tokens.ts    (`npm run tokens -w @entegrasyonik/ui`)
    tests/                     token-drift, token-unit, kontrast (light+dark), "uygulamaya bağımlılık yok" statik testi
  backoffice/                  @entegrasyonik/backoffice — Vite + Vue 3 + Vuetify 3 (Electron YOK)
    package.json vite.config.mts tsconfig.json playwright.config.ts vitest.config.ts index.html public/theme-boot.js
    src/ e2e/ tests/
```
- **Bağımlılık yönü:** `packages/ui` ne `frontend/src`'i (`@/`) ne de `backoffice/src`'i import edebilir. Bu, statik bir test ve eslint `no-restricted-imports` kuralıyla zorlanır. Alan tiplerine bağlı parçalar (ör. `status-map.ts` içindeki sipariş/fatura eşlemeleri) uygulamada kalır. Pakete genel API taşınır: `defineStatusMap()` ve 5 ton.
- **Vue/Vuetify tek kopya:** Workspace hoisting sayesinde tek `node_modules` vardır. İki Vite yapılandırmasında `resolve.dedupe: ['vue','vuetify','pinia','vue-router','vue-i18n']` bulunur.
- **`site/`** kendi `package.json`'ıyla workspace dışında kalır. Yalnızca token CSS import yolu `frontend/packages/ui/src/tokens/dist/tokens.static.css` olarak güncellenir. `site/` yazılabilir bir yol olduğu için bu güncelleme aynı bulut görevinde yapılır.
- **Mandallar (ratchet):** `style/pattern/no-console/typecheck` betiklerine kök parametresi eklenir ve üç kök taranır: `src/`, `packages/ui/src/`, `backoffice/src/`. Taban anahtarları kök önekli olur. Aşama 0'da taşınan dosyaların taban girdileri **aynı sayılarla yeniden anahtarlanır**; tek seferlik bir göç haritası `git mv` listesinden üretilir. Taşınan bir dosya "yeni dosya → 0" kuralına takılmaz. Sayılar azalabilir, artamaz.
- **Görsel tabanlar:** Bileşen taşıması render çıktısını değiştirmez, bu yüzden `*-win32.png` yeniden üretilmez. Aşama 0'ın kabul ölçütü **0 görsel fark**tır.
- **Electron:** `forge.config.js` `packagerConfig.ignore` listesine `^/packages($|/)`, `^/backoffice($|/)` ve `^/e2e($|/)` eklenir. Kabul ölçütü: `npm run package` çıktısında bu klasörler bulunmaz.
- **Neden (b) değil:** (b)'nin tek artısı simetri. Maliyeti ise açık bulut dalının uygulanamaması ve 187 görsel tabanla tüm mandal anahtarlarının aynı anda oynaması. Tek haneli ölçekte bu takas haklı değil. `apps/` düzenine geçiş, aşağıdaki eşik tetiklenirse, açık bulut dalı yokken tek bir yeniden adlandırma commit'iyle yapılabilir.

**Bulut akışı etkisi:** `scripts/cloud-sync.sh` ve `CLAUDE.md` kural 7 metin olarak **değişmek zorunda değil** (`frontend/**` zaten yazılabilir). Yalnızca açıklık için kural 7'nin ilk maddesine şu cümlenin eklenmesi önerilir (uygulama orkestratörde):
> "`frontend/` bir npm workspaces köküdür: müşteri uygulaması (`frontend/src`), ortak UI paketi (`frontend/packages/ui`) ve backoffice (`frontend/backoffice`) buradadır; üçü de yazılabilir. `backend/` salt-okunur kalır — backoffice'in ihtiyaç duyduğu uçlar yerelde yazılır."

`docs/CLOUD_BRIEFS.md` akış tablosuna backoffice doğrulama komutları eklenir (plan §5). CI (`.github/workflows/ci.yml`) bugün yalnızca backend'i kapsıyor. Frontend CI kapsamı bu ADR'nin konusu değil; eklenirse iş akışı `working-directory: frontend` ile `npm ci`, `npm run test --workspaces --if-present` ve üç typecheck'i çalıştırır.

### Karar 2 — Paylaşılan paketin sınırı
| Parça | Paylaşılır mı | Not |
|---|---|---|
| Token kaynağı + `dist/*.css` | EVET (`/tokens`) | ADR-0011 commit politikası aynen geçerli. `dist/` pakette commit'li kalır. Kök `.gitignore` negation'ı yeni yola taşınır (T4c dersi). Drift testi pakette çalışır. |
| Vuetify adaptörü, defaults, overrides, ECharts teması, kanal renkleri | EVET (`/theme`) | `createEkVuetify({ locale, defaultsOverride? })` fabrikası. İki uygulama aynı temayı kurar. |
| DS-v2 `Ek*` bileşenleri + şablonlar | EVET (`/components`) | Alan tipine bağımlı olanlar hariç (Karar 1). |
| Kabuk: `EkSidebarNav`, `EkWorkspaceTabs`, `EkAppHeader` + `createWorkspaceStore` | EVET (`/shell`, Aşama 2) | Fabrika şunları enjekte alır: `resolveScreen(key)`, `canOpen(screen)`, `notify`, `storageScope()` (kullanıcı/tenant kapsamlı sessionStorage anahtarı). Müşteri uygulaması kendi menü store'unu adaptörle bağlar. Backoffice kod içi statik ekran kaydı kullanır (DB `menus` YOK). |
| RPC istemcisi (`restapi`) | EVET, **fabrika olarak** (`/rpc`, Aşama 2) | `createRpcClient({ baseUrl, onUnauthorized, onReauthRequired?, loading? })`. Her uygulama kendi axios örneğini kurar. Global `axios.defaults` ve global interceptor kullanılmaz (bugünkü `restapi.ts` global kuruyor; müşteri uygulamasında davranış korunur). `X-Request-Id` bağlama ve güvenli hata loglama ortaktır. |
| Kimlik doğrulama (`user.ts`, `context` store) | HAYIR | Oturum modelleri farklıdır: müşteri tarafında tenant ve rol, backoffice tarafında 2FA, step-up ve kısa oturum. Yalnızca profil DTO tipleri paylaşılır. |
| i18n | Mekanizma ve DS metinleri EVET (`/locales/{tr,en}/ds.json`) | Her uygulama kendi mesajlarını birleştirir. Backoffice ilk sürümde yalnızca TR ile çıkar. Tüm metinler yine vue-i18n'den geçer, EN sonradan eklenebilir. |

### Karar 3 — Dark mode
1. **Token katmanı:** Semantik light/dark setleri zaten `Record<SemanticColorKey,string>` tipiyle eşitlenmiş durumda. Aşama 1'de **legacy anahtarların dark karşılıkları** tamamlanır. Seçilen yol, legacy anahtar tüketimini ekran başında semantik anahtara göç ettirmektir. Göçü bitmeyen legacy anahtarlar semantik dark değerinden türetilir (`legacy.ts` eşlemesi zaten var). `DARK_WIRED_LEGACY_KEYS` sınırlaması kaldırılır ve T1a tema anlık görüntüsü bilinçli olarak yeniden tabanlanır.
2. **Kanal ve grafik renkleri:** `channels.ts` her kanal için `{ light, dark }` değeri taşır. Dark değer koyu yüzeyde ≥3:1 kontrast sağlar (grafik/ikon, WCAG 1.4.11). Kanal markası metin rengi olarak kullanılmaz. ECharts teması `buildEchartsTheme(mode)` ile iki ayrı tema olarak kaydedilir. `vue-echarts` bileşenine `:theme` tepkisel verilir, tema değişince grafik yeniden oluşturulur. Kategorik palet dark için ayrıca üretilir ve komşu dilimler arasında ≥3:1 aranır.
3. **Tercih:** `themePreference: 'system' | 'light' | 'dark'` (varsayılan `system`). Tercih `localStorage['ek-theme']` altında kalıcıdır. Anahtar uygulamaya göre ad alanlıdır: `ek-theme` ve `ek-bo-theme`, çünkü origin'ler zaten ayrı. `system` seçiliyken `matchMedia('(prefers-color-scheme: dark)')` değişimi dinlenir. Sunucu tarafında cihazlar arası senkron **yapılmaz**. Tetikleyici: bunu isteyen ≥2 ödeyen müşteri. O zaman profile `uiPrefs.theme` eklenir.
4. **Titreme yok:** `public/theme-boot.js` **eşzamanlı** ve modül olmayan bir betiktir; her iki `index.html`'in `<head>`'inde, CSS'ten önce yüklenir. Satır içi betik kullanılmaz, çünkü CSP'de hash bakımı istemez. Betik tercihi çözer; `<html>` öğesine `data-theme="dark|light"`, `class="ek-dark"` ve `style.colorScheme` yazar. `<meta name="theme-color">` değerini günceller. `app.css` vücut arka planını `tokens.static.css`'in `[data-theme]` değerleriyle boyar, böylece Vuetify bağlanmadan önceki kare de doğru renkte olur. `createEkVuetify` `defaultTheme` değerini aynı `resolveTheme()` fonksiyonundan alır. Geçiş sırasında bir karelik `html.ek-theme-switching *{transition:none!important}` uygulanır; kademeli renk animasyonu olmaz.
5. **Kontrol:** Kullanıcı menüsünde 3 seçenekli bir segment kontrol bulunur. ADR-0015'te gizlenen `ApplicationBar` anahtarı bununla değiştirilir. Anahtar **yalnızca Aşama 1b kapısı sağlandığında** görünür. Öncesinde geliştirici ve test için `?theme=dark` kullanılır (ADR-0011 Karar 3).
6. **Kontrast:** Token birim testleri dark için de çalışır: `content-{strong,default,muted}` değerleri `background` ve `surface` üzerinde ≥4,5; `*-subtle` üzerinde durum metni ≥4,5; `border-input` ≥3; kanal/grafik ≥3. axe dark taraması **P1+P2 ekranlarında** ve **tüm backoffice ekranlarında** yapılır. Kabul ölçütü: 0 ihlal.
7. **Görsel tabanlar:** Playwright'a `chromium-desktop-dark` projesi eklenir (`colorScheme:'dark'` + `ek-theme=dark`). Dark tabanlar yalnızca P1 ekranları, DS vitrini ve tüm backoffice ekranları için masaüstü görünümde üretilir (`*-chromium-desktop-dark-win32.png`). Dark için mobil ve tablet tabanı **üretilmez**; maliyet ile 187 tabanın ikiye katlanmasından kaçınılır. Tetikleyici: dark'a özgü bir görsel regresyon kullanıcıya iki kez ulaşırsa, dark tabanlar P2 ve tablet görünümüne genişletilir.
8. **Açma kapısı (ADR-0011 Karar 3 aynen):** P1+P2 literal renk sayısı 0 ve dark axe ihlali 0. Backoffice ilk gününden bu kapıyla doğar: literal renk yasak, mandal 0'dan başlar.

### Karar 4 — Backoffice güvenliği
1. **Origin ve barındırma** (barındırma ADR'sine girdi): `admin.entegrasyonik.com` statik SPA olarak `frontend/backoffice/dist` çıktısını sunar. Başlıklar: `X-Robots-Tag: noindex, nofollow`; `frame-ancestors 'none'`; `connect-src https://api.entegrasyonik.com` ile sıkı CSP; `Referrer-Policy: no-referrer`. Service worker ve PWA manifest'i yoktur. Arama motoru ve site haritasında yer almaz.
2. **Sunucuda zorunlu yetki:** `/admin-api/*` bağlama noktası şu koşulları sağlamayan her isteği 401/403 ile reddeder:
   - `EK_ADMIN` çerezi var,
   - JWT `aud === 'backoffice'`,
   - `ga === true` ve DB'den taze okunan `Users.isGlobalAdmin === true` (`authenticate.ts` bunu zaten DB'den kuruyor),
   - `mfa === true`,
   - Origin `ADMIN_CORS_ORIGINS` içinde.

   `/admin-api` üzerinden yalnızca `minTier: 'platformAdmin'` yetenekleri ve backoffice oturum operasyonları çağrılabilir. **Aşama 3 sonunda `/api` artık `platformAdmin` yeteneklerini kabul etmez.** İstisnalar: `redeemImpersonation` ve `endImpersonation`. Kontrol, yetenek kaydında yeni bir `surface: 'app' | 'backoffice' | 'both'` alanı ile yapılır; `derivePolicy` bağlama noktasına göre süzer (ADR-0019 tek kayıt ilkesi). Frontend'de gizleme tek başına güvence sayılmaz.
3. **Çerez ayrımı:**
   - `EK_ADMIN`: `HttpOnly; Secure; SameSite=Strict; Path=/admin-api`; `Domain` yok (yalnızca api host'u). `admin.` ile `api.` aynı site olduğu için `Strict` çalışır.
   - Müşteri çerezi `JWT_TOKEN` `/admin-api`'de **hiç okunmaz**. `EK_ADMIN` çerezi `Path` nedeniyle `/api`'ye hiç gönderilmez.
   - `aud` doğrulaması token takasını da engeller.
   - `ADMIN_CORS_ORIGINS` ile `CORS_ORIGINS` kesişmez; kesişirse süreç başlangıçta hata verir (config zod).
   - Müşteri çerezinde `SameSite=None` yerine `Lax`'e geçiş barındırma ADR'sinin konusudur. Bu ADR yalnızca bir öneri olarak not düşer.
4. **Oturum süresi:** Kayan boşta kalma süresi 30 dakikadır; token her başarılı istekte yeniden basılır (mevcut `isExtending` deseni). Mutlak üst sınır 8 saattir (`auth_time`). Çıkış yapınca `tokenVersion` artmaz, çıkış yalnızca o oturumu kapatır. "Tüm yönetici oturumlarını kapat" işlemi `tokenVersion++` ile yapılır.
5. **2FA zorunlu:** TOTP (RFC 6238, 30 sn, ±1 adım) tüm platform yöneticileri için zorunludur. İlk girişte kayıt yapılmadan hiçbir `/admin-api` operasyonu çalışmaz. Sır `FIELD_ENCRYPTION_KEYS` ile AES-256-GCM şifrelenir (`enc:v1:`). 10 kurtarma kodu üretilir, bcrypt özetiyle saklanır ve tek kullanımlıktır. Başarısız TOTP girişimleri mevcut hız sınırlayıcıya bağlanır. TOTP, `node:crypto` HMAC ile yaklaşık 60 satırla uygulanır (ek bağımlılık yok). WebAuthn ertelenir; tetikleyici: 5'ten fazla platform yöneticisi ya da bir güvenlik olayı.
6. **Adım-yükseltmesi (step-up):** `effect: 'destructive'` olan her yetenek ile `requiresReauth: true` işaretli yazma işlemleri son 5 dakika içinde parola + TOTP ile yeniden doğrulama ister. Bu yazma işlemleri: ADR-0020 `publish`/`rollback` (dangerous), `setIntake`, impersonation başlatma, abonelik ve plan değişiklikleri, yönetici yönetimi, cache ailesi boşaltma. Yeniden doğrulama `reauth_at` claim'i ile izlenir. Yoksa yanıt `401 REAUTH_REQUIRED` olur ve UI yeniden doğrulama diyaloğunu açıp isteği yeniler. Yıkıcı işlemler ayrıca bir **gerekçe metni** (≥10 karakter) ister. Gerekçe audit `meta.reason` alanına yazılır.
7. **IP allowlist (isteğe bağlı):** `ADMIN_IP_ALLOWLIST` (CIDR listesi). Boşsa kapalıdır (varsayılan). IP, mevcut `clientIp.ts` ile güvenilir proxy zincirinden çözülür. Railway'in `trust proxy` ayarı barındırma ADR'sinde doğrulanır. Tetikleyici: yöneticilerin sabit bir çıkış IP'si ya da VPN'i varsa açılır.
8. **Denetim:**
   - `/admin-api` üzerindeki **tüm** `write`, `destructive` ve `propose` operasyonları `AuditLogger` ile yazılır. Kayıtta `event: 'backoffice.write'`, `surface`, `reqId`, `reason` ve hedef `tid` bulunur.
   - **Bulgu:** Bugünkü `executeAudited` (`backend/src/api/RunOperation.ts:115-130`) yalnızca `AdminService` üzerindeki ve adı `get`/`retrieve` ile başlamayan operasyonları yazıyor. Audit kararı servis adı regex'i yerine yetenek kaydındaki `effect` alanından türetilir. `IntegrationConfigService` ve `IntegrationComplianceService` kendi audit çağrılarını yapıyor; bu çağrılar korunur ve çift kayıt tekilleştirilir.
   - Tenant PII'sine dokunan okumalar da `backoffice.sensitive_read` olarak yazılır (müşteri detayı, impersonation, destek yazışması). Yetenek bayrağı: `pii: 'full'`.
   - Denetim kaydını silen ya da değiştiren bir RPC **yoktur**. Mevcut 365 günlük TTL korunur.
9. **Impersonation (backoffice'ten):**
   1. Yönetici backoffice'te "Mağaza olarak aç" der. İşlem step-up ve gerekçe ister.
   2. `BackofficeTenantService/startImpersonation {tid, reason}` çağrılır. Sunucu 32 baytlık rastgele bir bilet üretir ve Redis'e koyar: `SET imp:<sha256> NX EX 60` (tek kullanımlık, 60 saniye). Denetime `impersonation.start` yazılır.
   3. Backoffice yeni sekmede `https://app.entegrasyonik.com/impersonate#t=<bilet>` adresini açar. Bilet fragment'ta taşındığı için sunucu logları ve Referer başlığı onu görmez.
   4. Müşteri uygulaması `SecurityService/redeemImpersonation {ticket}` çağırır (açık operasyon; tek geçerli kimlik bilettir; `GETDEL`).
   5. Sunucu `JWT_TOKEN` çerezini `{sub: yönetici, tid, ga:true, imp:true, impBy, aud:'app'}` ile basar. **Süre 30 dakikadır (K41 ile 60 dk'dan düşürüldü) ve uzatılmaz.**
   6. Müşteri uygulaması sürekli bir "Yönetici olarak görüntülüyorsunuz: <mağaza> — Çık" bandı gösterir.
   7. Impersonation sırasında `effect: 'destructive'` ve `external: true` yetenekleri reddedilir: tenant silme, ödeme/checkout, kullanıcı yönetimi. Gerekirse yönetici bunları backoffice'teki karşılık ekranlarından yapar.
   8. Impersonation içindeki tüm yazmalar denetime `imp:true` ile yazılır (mevcut).

   Aşama 3 sonunda `/api` üzerinde `SecurityService/login` `ga` kullanıcıyı reddeder ("Yönetim girişi admin.entegrasyonik.com'dan yapılır"). Doğrudan `selectStore` da kapatılır; impersonation yalnızca bilet ile yapılır.
10. **Yönetici yönetimi:** Platform yöneticisi ekleme ve kaldırma step-up ister ve audit'e yazılır. Son aktif yönetici kaldırılamaz ve devre dışı bırakılamaz. Yönetici hesabı müşteri tenant'ına bağlı değildir.

### Karar 5 — Bilgi mimarisi (backoffice menüsü)
Menü kod içi statik ekran kaydıdır (`backoffice/src/navigation/screens.ts`). DB kaydı yoktur. Sekmeli çalışma alanı müşteri uygulamasıyla aynıdır (ADR-0012 deseni).
1. **Genel bakış:** Sağlık panosu. Bağımlılıklar, podlar, RED metrikleri, kuyruk birikimi, açık sorun grupları, kill-switch durumları, bugünkü gelir özeti.
2. **Müşteriler:** Tenant listesi ve detayı. Yaşam döngüsü: deneme, aktif, askıda, silme bekliyor. Silmeyi geri alma. Impersonation. Kullanım istatistikleri.
3. **Üyelik ve abonelikler:** Planlar (salt okuma, kod kaynaklı), abonelik listesi ve detayı (BillingEvents geçmişi), deneme uzatma, plan değiştirme, iptal, gelir metrikleri (MRR, dönüşüm, kayıp).
4. **Entegrasyonlar:** Tanımlar ve ayar yönetimi (ADR-0020: liste, ayarlar, motor ayarları, etkin ayar), uyum konsolu (ADR-0018), API sağlığı (platform geneli çağrı metrikleri), dayanıklılık durumu (devre kesici, hız sınırı bütçesi, kill-switch).
5. **Motor ve kuyruklar:** BullMQ kuyrukları (sayımlar, başarısız/ölü mektup, yeniden dene/at), Mongo durum makinesi işleri (ExportSignals/ImportJobs durum dağılımı, takılı kiralar), zamanlayıcı koşuları (JobRunRegistry).
6. **Altyapı (salt okuma):** Redis ve MongoDB.
7. **Cache:** `getCacheMetrics`, aile dökümü, aile boşaltma (step-up).
8. **Log Kontrol Merkezi ve denetim:** Panolar, sorunlar, log gezgini ve canlı akış, iz (correlation), denetim kaydı.
9. **Destek:** Ticket listesi, yanıt, tenant adına açma.
10. **Sistem ayarları:** Özellik bayrakları ve bakım modu. ADR-0020 yapılandırma motorunda yeni `platform` hedefi olarak kurulur (taslak, yayın, geri alma, audit hazır). Yeni bir bayrak altyapısı kurulmaz.
11. **Yöneticiler ve güvenlik:** Platform yöneticileri, 2FA durumu, oturumu kapatma, IP allowlist'in salt okunur görünümü.

### Karar 6 — Backend tasarım kuralları (yeni uçlar)
Uç listesi `docs/BACKOFFICE_PLAN.md` §2'dedir. Tüm yeni uçlar şu kurallara uyar:
- Yetenek kaydında `minTier: 'platformAdmin'`, `surface: 'backoffice'`, `mcp: notExposed{platform_admin}` bulunur. Girdi zod şemasıyla doğrulanır (ADR-0023 deseni, `rpc-input/`). Yanıtlar sınırlıdır: `limit ≤ 200`, imleç sayfalama, `maxTimeMS ≤ 5000`.
- **Redis durumu:** Yalnızca `INFO` alanlarının izinli listesi okunur. Anahtar sayımı `SCAN` örneklemesiyle yapılır ve **yalnızca önek ailesi bazında** döner. Örnekleme en fazla 10.000 anahtar, `COUNT 500` ve 200 ms bütçe ile sınırlıdır. Anahtar adı ve değer asla dönmez. `SLOWLOG` kayıtlarından yalnızca komut adı ve süre alınır, argümanlar atılır. `KEYS`, `MONITOR`, `CONFIG`, `FLUSH*` asla çağrılmaz.
- **MongoDB durumu:** Yalnızca okuma komutları kullanılır: `serverStatus` alt kümesi, `dbStats`/`collStats`, `listIndexes`, `$indexStats`. **`listDatabases` çağrılmaz.** DB adları uygulama DB'sinden ve `Clients.dbConfig.dbname` kaydından gelir, ayrıca `CLAUDE.md` kural 2'deki izinli listeyle kesiştirilir. Böylece paylaşılan Atlas cluster'daki başka projelerin DB'leri hiçbir koşulda sorgulanmaz ya da listelenmez. Tenant DB'leri yanıtta tenant numarasıyla görünür. Belge içeriği dönmez. Yavaş sorgular Mongo profiler ile değil, uygulama tarafında ölçülür: >200 ms süren sorgular bir mongoose eklentisiyle `MetricRollups` içine `db.slow_query{db:app|tenant, collection, op}` olarak yazılır. Sorgu değerleri yazılmaz.
- **Kuyruk ve iş işlemleri:** Yük (payload) dönmez. Yalnızca kimlik, tenant, operasyon, hata kodu ve deneme sayısı döner. Yeniden deneme ve atma işlemleri gerekçe ister ve audit'e yazılır.
- **Tenant verisi:** Backoffice uçları tenant iş verisini (ürün, sipariş, müşteri kişisel verisi) **döndürmez**. Onları görmenin tek yolu impersonation'dır (denetimli ve süreli).

### Karar 7 — Log Kontrol Merkezi (seçenek 3B)
1. **Yapılandırılmış log şeması** (pino alan sözleşmesinin, ADR-0017 Karar 1.2'nin genişlemesi):
   - `src ∈ {api, engine, adapter, worker, webhook, auth, scheduler, client, legacy-console}` (zorunlu, `logger.child` bağında verilir),
   - `integ` (entegrasyon kodu), `op` (`Service/op` ya da işçi operasyonu),
   - `errClass`: `AppError.code` (`docs/ERROR_CODES.md`) ya da `IntegrationError.code` (`AUTH | RATE_LIMITED | VALIDATION | UNAVAILABLE | UNKNOWN_OUTCOME | NOT_FOUND | NOT_SUPPORTED | INTERNAL`),
   - mevcut `reqId`, `tenantId`, `pod`, `ver`, `module`, `fp`.

   `consoleBridge` üzerinden gelen kayıtlar `src:'legacy-console'` olarak etiketlenir. **F-06 (entegrasyon katmanındaki 151 `console.*`) göçü bu şemaya bağlanır:** her adaptör `logger.child({ module, src:'adapter', integ })` kullanır. `legacy-console` oranı panoda görünür ve no-console mandalı düşmeye devam eder.
2. **Depolama:**
   - `LogEvents` (ApplicationDB): `warn`, `error` ve `fatal` seviyeleri **ve** `info` seviyesinde yalnızca `src ∈ {auth, webhook}` ile `backoffice.*` olayları yazılır. `debug`/`trace` asla yazılmaz.
   - Yazım bir pino ek hedefidir (multistream). Kayıtlar süreç içi tamponda biriktirilir ve 2 saniyede bir ya da 200 belgede bir `insertMany({ordered:false})` ile yazılır. Tampon 5.000 belgeyi aşarsa en eski `info` kayıtları düşürülür ve düşürülen sayısı sayaçta tutulur. Yazım olay döngüsünü asla beklemez (C19 dersi).
   - Günlük sert tavan 200.000 belgedir; aşılırsa `warn` seviyesi 1/10 örneklenir.
   - `expAt` alanına göre TTL: warn/error/fatal için 14 gün, info için 3 gün.
   - `ctx` alanı redakte edilir ve 2 KB ile sınırlanır.
3. **Hata gruplama:** `ErrorEvents` genişletilir. Yeni alanlar: `src`, `errClass`, `op`, `level`, `tenantIds` (`$addToSet` + `$slice` ile en fazla 50), `tenantCount`, `daily` (`YYYYMMDD → sayı`, 30 günde budanır; trend buradan okunur).
   - "Yeni sorun" = `firstSeen` pencere içinde olan grup.
   - Durumlar değişmez: `open`, `acknowledged`, `resolved`, `muted`.
   - Parmak izi kuralı değişmez (rakamlar `#` yapılır). İleride UUID/ObjectId/e-posta şablonlaştırması eklenebilir; bu, parmak izi sürümünü `fpv:2` yapar.
4. **Panolar:** `MetricRollups` içine `log.events{src,level}` sayacı eklenir; tüm loglar sayılır, kalıcılaştırılmayanlar da dahil. Hata oranı bu sayacın mevcut RED `http.requests` metriğine bölümüyle hesaplanır. En gürültülü kaynaklar ve yeni sorunlar `ErrorEvents` üzerinden gelir.
5. **Canlı akış:** 3 saniyelik aralıkla imleç tabanlı sorgu (polling) kullanılır. WebSocket ve SSE kullanılmaz; tek haneli yönetici ölçeğinde gereksiz. Kayıtlı görünümler istemcide tutulur (`useSavedViews`, localStorage), backend gerektirmez. Tetikleyici: ≥3 yönetici görünüm paylaşmak isterse sunucu tarafına alınır.
6. **Korelasyon:** Log ya da sorun satırından `reqId` → `LogCenterService/getTrace` ile iz görünümüne geçilir. İz görünümü aynı `reqId`'ye sahip LogEvents, AuditLogs ve IntegrationCallMetrics kayıtlarını zaman sırasıyla birleştirir. Bunun için `IntegrationCallMetric` şemasına `corrId` eklenir. `AuditLogger` kayıtlarına da `reqId` eklenir; bugün yazılmıyor.
7. **Maskeleme:** Maskeleme sunucuda, kalıcılaştırmadan **önce** yapılır. Mevcut varsayılan-ret redaksiyonuna PII desenleri eklenir: e-posta (`a***@d***`), telefon, TCKN, IBAN, kart numarası. Maskeyi açan bir RPC yoktur.
8. **Saklama ve maliyet:** Tahmin: günde 10–50 bin belge × ~0,6 KB ≈ 14 günde 100–400 MB (indeksler dahil). Atlas depolama sınırı barındırma ADR'si ile birlikte izlenir. İndeks önerileri plan §2.9'dadır. Bunlar **yalnızca öneridir**: yeni koleksiyon ve indeks yaratmak DB değişikliğidir, önce yedek alınır (`CLAUDE.md` kural 3) ve Protokol 12 uygulanır. Yerelde mongoose `autoIndex` ile doğrulanır.

### Karar 8 — Aşamalar (ayrıntı: plan §3–§5)
| Aşama | Kapsam | Nerede |
|---|---|---|
| 0 | `frontend/packages/ui` çıkarımı + workspace. Davranış değişmez. Kabul: 0 görsel fark, tüm testler yeşil, mandallar yeniden anahtarlanmış. | Bulut (`cloud/ui-pkg-0`), `cloud/ds-v2-a6b` **birleştikten sonra** onun üzerine |
| 1a | Dark mode altyapısı (tercih, boot betiği, legacy dark, kanal ve grafik renkleri, dark kontrast testleri, `?theme=dark`) | Bulut |
| 1b | Dark görsel tur P1+P2 (kapı ölçümü, düzeltmeler, dark tabanlar) → anahtar açılır | Bulut + yerel taban onayı |
| 2-BE | `/admin-api` bağlama noktası, `EK_ADMIN`, `aud`, TOTP, step-up, `surface` alanı, impersonation bileti | Yerel (backend) |
| 2-FE | Backoffice iskeleti (kabuk, workspace fabrikası, `createRpcClient`, giriş + 2FA + step-up diyaloğu, dark), ekranlar boş | Bulut |
| 3 | Mevcut 8 admin ekranının taşınması (frontend'den kaldırılıp backoffice'e eklenmesi) + FE envanter testinin iki kökü taraması + `/api` platformAdmin kapatma | Bulut (FE) + yerel (BE test ve kapatma) |
| 4 | Yeni zengin ekranlar + backend uçları (Log Kontrol Merkezi ayrı iş kalemi) | Yerel BE → bulut FE, ekran grubu başına |

## Gerekçe
- **Maliyet bilinci (tek haneli abone, 1-2 platform yöneticisi):**
  - Yeni sunucu, servis, repo, SaaS ve monorepo aracı yok.
  - Backoffice statik bir SPA. API aynı süreçte bir bağlama noktası.
  - Loglar mevcut Mongo'da tutuluyor. Özellik bayrakları mevcut ADR-0020 yapılandırma motorunda.
  - Kayıtlı görünümler istemcide.
  - Bunların her birinin daha ağır alternatifi bir eşikle erteleniyor.
- **Ayrı uygulama neden gerekli ve neden sadece gizleme yetmez:** Bugün yönetici yetkisi sunucuda doğru zorlanıyor. Ama oturum müşteri oturumuyla aynı çerezde, 8 saat süreli ve 2FA'sız. Müşteri paketi yönetim ekranlarının kodunu da taşıyor. Yüzey ayrımı iki şey kazandırıyor: müşteri tarafında bir XSS ya da çerez sızıntısı yönetici yetkisine yükselemez (ayrı `aud` + `Path` + `SameSite=Strict`), ve yönetici tarafına müşteride gereksiz olan sıkı kontroller (2FA, step-up, kısa oturum) eklenebilir.
- **Klasör düzeni (c):** Hedef, açık bulut akışını ve mevcut 187 görsel tabanı bozmadan paylaşımı kurmak. Bu hedefe en az değişiklikle ulaşan düzen (c).
- **Yeniden yazım değil taşıma:** Admin ekranları yeniden yazılmıyor. Dosyalar backoffice'e taşınıyor (`git mv`) ve importları ile RPC istemcisi değiştiriliyor. İstisnalar:
  - `AdminView.vue`: `MessageListView` kopyası, kayıtlı değil ve kullanılmıyor. Taşınmaz, silinir (ölü kod, audit kanıtı: `screens.ts:117-118`).
  - `AdminSystemManagementView.vue` (1.507 satır): tek dosyada 4 alanı karıştırıyor. **Bölünerek** taşınır (Genel bakış / Motor / Altyapı / Cache). Bölme bir refactor'dür; mevcut `getSystemHealth` sözleşmesi korunur.

## Maliyet/Ölçek Notu
**Ek maliyet:** Yeni bir DNS kaydı ve statik barındırma (barındırma ADR'si), `LogEvents` depolaması (~100–400 MB), backoffice için ikinci bir Vite build, dark tabanlar (~30–50 PNG). Yeni harici bağımlılık yok: TOTP `node:crypto` ile yazılıyor.

**Yeniden değerlendirme eşikleri (sayısal):**
- `LogEvents` > **1 GB** ya da > **1 milyon belge/gün**, ya da log gezgini sorgularının p95 süresi > **2 sn** → harici log deposu (seçenek 3A) değerlendirilir.
- Platform yöneticisi sayısı > **5** → WebAuthn, iki-kişi onayı (ADR-0020 açık sorusu) ve rol bazlı yönetici kademeleri (salt okuma yöneticisi/destek) değerlendirilir. Bugün tüm yöneticiler eşit `platformAdmin`'dir.
- Üçüncü önyüz uygulaması başlarsa (Tauri `desktop`) ya da workspace kaynaklı kırık derleme ayda **>3** olursa → `frontend/apps/*` düzenine geçiş (açık bulut dalı yokken tek commit) ya da paketin sürümlenmesi değerlendirilir.
- Backoffice'te eşzamanlı canlı akış izleyicisi > **3** ya da polling maliyeti API isteklerinin > **%5**'i olursa → SSE değerlendirilir.
- Dark'a özgü görsel regresyon kullanıcıya **2** kez ulaşırsa → dark tabanlar P2 ve tablet görünümüne genişletilir.
- Tema tercihini cihazlar arası isteyen ödeyen müşteri sayısı **≥2** olursa → sunucu tarafı `uiPrefs.theme`.

## Etki Alanı
- **frontend:** workspace kökü, `packages/ui` (yeni), `backoffice/` (yeni), `src/design/**` → paket, `src/components/ds/**` → paket, `stores/theme.ts`, `stores/workspace.ts` (fabrika adaptörü), `composables/restapi.ts` (fabrika adaptörü), `index.html` + `public/theme-boot.js`, `forge.config.js`, mandal betikleri ve tabanları, `playwright.config.ts` (dark projesi). `views/secure/adminPanel/**`, `components/adminPanel/**` ve `screens.ts` admin girdileri Aşama 3'te kaldırılır.
- **site:** Token CSS import yolu (`src/styles/tokens.css`, `src/lib/tokens-node.ts`, `tests/tokens.test.ts`, `astro.config.mjs`).
- **backend:** `api/Security.ts`, `api/authenticate.ts`, `api/ApiManager.ts` (`/admin-api` bağlama noktası), `api/originCheck.ts`, `config/` (`ADMIN_CORS_ORIGINS`, `ADMIN_IP_ALLOWLIST`), `capabilities/types.ts` (`surface`, `requiresReauth`), `capabilities/derive/policy.ts`, `capabilities/domains/platform.ts` + yeni `backoffice.ts`, `api/services/*` (yeni Backoffice* servisleri), `platform/core/logger/**`, `platform/runtime/metrics/**`, `database/application/models/{ErrorEvent,IntegrationCallMetric,User}.ts` + yeni `LogEvent.ts`, `tests/characterization/auth/operation-policy.test.ts` (iki FE kökü).
- **Doküman:** `CLAUDE.md` kural 7 (öneri cümlesi), `docs/CLOUD_BRIEFS.md` (yeni şablonlar), `docs/CAPABILITIES.md` (yeniden üretim), `docs/ERROR_CODES.md` (`REAUTH_REQUIRED`, `MFA_REQUIRED`).
- **DB (yalnızca öneri, yedek + onay):** `LogEvents` koleksiyonu ve indeksleri; `ErrorEvents`, `AuditLogs` ve `IntegrationCallMetrics` için ek indeksler; `Users` şemasına `mfa` alanları; Aşama 3 sonrası `menus` içindeki admin kayıtlarının temizliği (isteğe bağlı).

## Uygulama notu — Aşama 2-BE (2026-09-30, `faz4-bo-2be`)
Karar 4'ün backend uygulaması ADR ile birebirdir; aşağıdakiler ADR'nin açık bıraktığı ya da bilinçli sapılan noktalardır. Kod: `backend/src/api/admin/**`.
- **TOTP saklama (sapma):** Sır ve kurtarma özetleri `Users.mfa` yerine ayrı `AdminMfa` modelindedir (`database/application/models/AdminMfa.ts`, `autoIndex:false`). Gerekçe: `Users` okuyan hiçbir yol (authenticate, kimlik önbelleği, profil DTO) TOTP sırrına dokunmaz. Sır `enc:v1:` (FIELD_ENCRYPTION_KEYS) ile şifrelidir. Önerilen `{sub:1}` tekil indeksi sabit olarak kodda durur, şemaya bağlı değildir (`index-manifest.json` girdisi boş); koleksiyon/indeks onaylı göçle (yedek + Protokol 12) kurulur. O zamana dek `sub` tekilliği `setPending/activate` koşullarıyla korunur.
- **Platform katmanı:** `platformSupport/Billing/Readonly` alt rolleri yoktur (ADR-0028 eşiği: >2 yönetici). "Yalnız platform katmanı" = DB'de taze `isGlobalAdmin === true` + `mfa` tamamlanmış oturum. Impersonation başlatma bugün tüm platform yöneticilerine açıktır.
- **Yetenek alanları (sapma):** `surface` ve `requiresReauth` yetenek tipine EKLENMEDİ (capabilities paylaşımlı paralel işte). Yerine: (a) `/admin-api` jenerik rotası yalnız `getRequiredTier === 'platformAdmin'` RPC'leri çağırır (+ yasak liste: `SecurityService/selectStore`); (b) step-up kümesi `admin/stepUp.ts` içinde tek kayıttır (`REAUTH_RPCS` + `effect:'destructive'`); (c) `/api` kapatma bayrağı `ADMIN_API_ONLY` `RunOperation`'da `tier === 'platformAdmin'` ile çalışır. Yetenek alanı gelince yalnız bu üç nokta o alandan okunur.
- **Oturum:** iki aşama (`pwd` 5 dk yenilenmez → `full` 30 dk kayan, `auth_time`'dan 8 sa mutlak). Kayıt (`confirmTotp`) başarılı olursa doğrudan tam oturum açılır. `reauth_at` giriş/`reauth` anında yazılır, kayan yenilemeyle uzamaz. Çıkış: çerez silinir + `jti` Redis kara listesi (en iyi çaba: Redis yoksa token en fazla 30 dk daha geçerli kalır); `logoutAllSessions` = `tokenVersion++`.
- **TOTP yeniden oynatma:** son kullanılan adım `AdminMfa.lastStep` üzerinde koşullu atomik güncellemeyle korunur; bu yüzden girişten hemen sonraki `reauth` bir SONRAKİ 30 sn adımının kodunu ister (kurtarma kodu da kabul edilir). Hesap başına 5 hatalı deneme → 15 dk kilit; IP hız sınırı ayrıca (`LOGIN_RATE_LIMIT_*` ayarı, ayrı kova).
- **CSRF/Origin:** yazmada Origin (yoksa Referer) `ADMIN_CORS_ORIGINS` içinde OLMALI; ikisi de yoksa ret, aynı-host istisnası yok (müşteri `originCheck`'inden bilinçli farklı). `ADMIN_CORS_ORIGINS ∩ CORS_ORIGINS ≠ ∅` ya da `*` → `assertConfig` ConfigError (süreç başlamaz).
- **Bağlama:** `Webserver.configure()` içinde müşteri `cors`/`originCheck`/`authenticate`'ten ÖNCE. Global rate limiter `/admin-api`'ye uygulanmaz; yerine giriş/TOTP uçlarında ayrı IP sınırlayıcı var.
- **Impersonation:** bilet `imp:<sha256>` NX EX 60, tüketim `GETDEL` (Redis yoksa üretilmez/tüketilmez: 503/401). Oturum claim'i `fx:true` (sabit ömür 60 dk -> **K41 ile 30 dk**, `Security.shouldRefresh` false; süre tek sabit: `IMPERSONATION_SESSION_MINUTES`); `aud` müşteri kodundaki sabit `web`'dir, `impBy` eklenmedi (`sub` zaten yöneticidir). Yıkıcı/dış-dünya/`users:manage`/`billing:manage`/`tenant:*` yasağı `RunOperation.authorize` içinde YALNIZ `fx` oturumlarda (ve `ADMIN_API_ONLY=true` iken kalan tüm imp oturumlarında) uygulanır; eski `selectStore` imp davranışı Aşama 3'e kadar DEĞİŞMEZ (characterization). `SecurityService/redeemImpersonation` açık + özel rota, `endImpersonation` özel rota (yetenek kaydına girmez; FE envanter testi istemciyi eklerken bu iki RPC'yi muaf saymalı).
- **Audit:** backoffice yazmaları `backoffice.write`, hassas okumalar `backoffice.sensitive_read` (`effect`/`pii`'den; `AdminService` regex'i yalnız `/api` yüzeyinde kalır, çift kayıt yok). Hedef tenant `onBehalfOf`'a yazılır, `tid` bilerek boştur (tenant denetim görünümünde platform-içi kayıt görünmesin); `impersonation.start/redeem/end` `tid` ile yazılır. `AuditLogs` şemasına `actorType/onBehalfOf/surface/imp/reqId` eklendi (geriye uyumlu, isteğe bağlı).
- **Hata kodları:** `REAUTH_REQUIRED`, `MFA_REQUIRED`, `IMPERSONATION_UNAVAILABLE`, `ADMIN_API_ONLY` (`docs/ERROR_CODES.md`).
- **Açık kalanlar:** `/api` `selectStore`/ga girişi kapatma yalnız bayrakla hazır (Aşama 3'te `ADMIN_API_ONLY=true`); `AdminMfa` göçü (0014) yazıldı, çalıştırılması bekliyor.
- **B12 uygulaması (2026-09-30, `faz4-bo-b12`):** `BackofficeAdminUserService` list/invite/disable/enable/resetMfa + kimliksiz `BackofficeAuthService/acceptInvite` (sözleşme: `docs/API_BACKOFFICE_ADMINS.md`). Kararlar: (1) mevcut kullanıcı e-postasına davet REDDEDİLİR (`ADMIN_INVITE_EXISTING_USER`; hesaba platform yetkisi verme ayrı insan kararı); (2) davet = bekleyen `Users` taslağı (`isActive:false`, `adminInvitePending:true`) + `AccountTokens` `purpose:'admin_invite'` (256 bit, yalnız sha256, 48 sa, tek kullanım); kabul sayfası `ADMIN_CORS_ORIGINS` ilk girdisindeki backoffice'e aittir (`/accept-invite#t=`); (3) son aktif yönetici kapatılamaz (kapatma SONRASI yeniden sayım + yarışta geri alma); kendini kapatma/MFA sıfırlama yasak; (4) dört yazma ucu step-up + gerekçe + `backoffice.write` + hedefli `backoffice.admin.*` denetimi; (5) `AdminMfa` `{sub:1}` tekil indeksi şemaya bağlandı, göç `0014-admin-mfa-sub-unique-app` (çalıştırılmadı), `ADMIN_MFA_INDEXES` manifest dışlaması kalktı; (6) `backend/scripts/reset-admin-mfa.ts` (`npm run admin:reset-mfa`; yalnız yerel 127.0.0.1, izinli DB, varsayılan dry-run, audit yazar; çalıştırılmadı).
