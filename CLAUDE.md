# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## KRİTİK KURALLAR — Kapsam ve Veritabanı Güvenliği (her şeyden önce uygulanır)

1. **Dosya sistemi kapsamı:** Tüm dosya sistemi işlemleri (okuma/yazma/silme/tarama) SADECE bu proje kök dizini (`ENTEGRASYONIK_FACTORY`) içinde yapılır. Bu kök dizinin dışına hiçbir dosya yazılmaz/okunmaz. Tek istisna: veritabanı (MongoDB) ve Redis gibi ağ üzerinden erişilen servisler — bunlar doğal olarak dizin dışındadır ve bu kısıtın kapsamı dışındadır (dosya sistemi değil, ağ bağlantısıdır).
2. **MongoDB — sadece Entegrasyonik veritabanlarına dokun:** Atlas cluster'ında (`mongodbcluster.4ndov.mongodb.net`) ve yerel MongoDB'de bu projeye ait veritabanları DIŞINDA HİÇBİR veritabanına asla dokunulmaz. İzinli liste (kesin, 7 isim): `entegrasyonik`, `entegrasyonik_client`, `entegrasyonik_client_2`, `entegrasyonik_client_24`, `entegrasyonik_client_25`, `entegrasyonikClient_1`, `entegrasyonikDB` (uygulama DB'si `entegrasyonikDB`'dir). Listeye yeni bir isim eklemek insan onayı gerektirir. Bu listede olmayan bir DB'ye dokunulmaz (okuma, yazma, silme, migration, index değişikliği dahil) (okuma, yazma, silme, migration, index değişikliği dahil). Aynı cluster üzerinde başka projelere ait veritabanları bulunabilir — bunlar kesinlikle kapsam dışıdır.
3. **Yedek zorunluluğu:** Herhangi bir veritabanını etkileyebilecek gerçek çalışma (migration, refactor, veri temizliği, silme) başlamadan önce `backup/` klasöründe hem Atlas hem de yerel MongoDB için güncel, doğrulanmış bir yedek bulunmalı (bkz. `backup/README.md`). Yedek yoksa veya doğrulanmamışsa, veritabanını değiştirebilecek hiçbir adım atılmaz.
4. Gerçek bağlantı string'leri/parolalar hiçbir proje dokümanına (MASTER_STATE.md, ADR, BACKLOG.md vb.) veya commit mesajına yazılmaz — sadece `.env` içinde kalır.
5. **Yerel geliştirme veritabanı:** Local dev ortamında MongoDB, Docker'da ayrıca bir instance olarak ÇALIŞTIRILMAZ — kullanıcının makinesinde zaten kurulu olan local MongoDB kullanılır (bağlantı: `backend/.env` → `LOCAL_DB_URL`). Atlas'tan alınan güncel yedekler bu local instance'a `mongorestore` ile aktarılmıştır (bkz. `backup/README.md`, doğrulama kaydı: `docs/DB_BACKUP_VERIFICATION.md`).
   - `backend/.env` içindeki `DB_URL/DB_USER/DB_PASSWORD` şu an **local'i** gösterir (`127.0.0.1` — Node `localhost`'u IPv6'ya çözer, Mongo yalnızca IPv4 dinler). Atlas değerleri `ATLAS_DB_*` altında referans olarak durur ve kullanılmaz.
   - Tenant DB bağlantıları (ADR-0003, 2026-09-27) artık **env'deki `DB_URL/DB_USER/DB_PASSWORD`** ile kurulur; `Clients.dbConfig` yalnızca `dbname` ve `poolsize` taşır (`url/user/password` göçle silindi). Kaynak kodda sabit Atlas/R2 sırrı KALMADI (statik test korur). **Local'de yeni tenant oluşturulmaz:** provisioning yeni bir DB adı (`entegrasyonikClient_<n>`) yaratır ve bu, izinli 7 DB listesinin dışındadır (kural 2); tenant oluşturma yalnızca mock'lu testlerle doğrulanır.
   - Pazaryeri/entegrasyon sırları DB'de AES-256-GCM ile şifrelidir (`enc:v1:…`; anahtarlar `FIELD_ENCRYPTION_KEYS` env'inde, yoksa süreç başlamaz); API yanıtlarında 'sensitive' döner. Backend'i **yalnızca `npm run start:local` (egress guard) ile** çalıştır — mock modu fail-open (BACKLOG C19).
6. **Git hijyeni:** `.env*` dosyaları ve `backup/` git-ignored'dır ve asla commit'lenmez (yalnızca `.env.example` takip edilir). Commit'lerde `git add -A`/`git add .` kullanılmaz; dosyalar yol yol eklenir.
7. **Bulut oturumu (claude.ai/code, GitHub `entegrasyonik-cloud` kopyası):** Bu depo buluttaysa (kökte `.env`, `gitlab/`, `mockserver/` YOKTUR) bu yalnızca önyüz kopyasıdır (bkz. `docs/CLOUD_BRIEFS.md`):
   - Yalnızca `site/` ve `frontend/` değiştirilir. `backend/`, `docs/adr/`, `CLAUDE.md` salt-okunurdur (site testleri kanıt olarak okur). DB/Redis/`.env` yoktur; bunlara bağlanmaya, backend'i çalıştırmaya çalışma.
   - İş kendi dalında yapılır (`cloud/<kısa-ad>`), `main`'e push edilmez. Küçük adımlarla commit + push (oturum kesilirse iş kaybolmasın).
   - Görsel tabanlar Windows'ta üretilir (`*-win32.png`). Bulutta Playwright'ı `--update-snapshots=missing` ile çalıştır; `*-linux.png` dosyaları git-ignored'dır, commit'leme. Görsel onay yerelde yapılır.
   - Token tasarrufu: ara adımlarda yalnızca ilgili spec'i ve tek viewport'u çalıştır; tam koşu ve tam sayfa ekran görüntüsü yalnızca sonda.

## Project Overview

**Entegrasyonik** is a multi-tenant SaaS platform that integrates Turkish e-commerce marketplaces (Trendyol, Hepsiburada, Pazarama, N11), ERP systems, and platforms into a unified management layer. **Actually implemented (verified 2026-09-26, INTEGRATIONS_REGISTRY.md):** Trendyol, Hepsiburada, N11, Pazarama, Ideasoft, Bizimhesap. Shipping/e-invoice and Shopify/WooCommerce/Magento/etc. exist only as UI forms — no backend integration.

## Commands

### Backend (`/backend`)
```bash
npm run build        # Compile TypeScript → dist/ (rimraf + tsc + tsc-alias)
npm run forceBuild   # Force rebuild with --force flag
npm run start        # Build and start: npm run build && node dist/entegrasyonik.js
```

### Frontend (`/frontend`)
```bash
npm run dev          # Vite dev server on port 3000
npm run build        # Type-check (vue-tsc) + Vite bundle
npm run preview      # Preview production build
npm start            # Launch Electron desktop app
npm run make         # Build platform installers (Windows/macOS/Linux)
```

There is no test suite configured.

## Architecture

### Backend (`backend/src/`)

Entry point: `backend/entegrasyonik.ts` — initializes three subsystems in order:
1. **DatabaseManager** — establishes MongoDB connections
2. **Webserver** — starts Express HTTP server
3. **IntegrationEngine** — launches background orchestration workers

**DatabaseManager** (`src/database/DatabaseManager.ts`) implements multi-tenant data isolation:
- `ApplicationDB` — singleton connection for platform-wide metadata (users, configs, logs)
- `ClientDB` — per-tenant MongoDB connections held in an LRU cache; each tenant's data is isolated

**Webserver** (`src/Webserver.ts`) — singleton Express app with:
- JWT authentication via HTTP-only cookies
- Routes mounted under `/api` via `ApiManager`
- 25+ service classes under `src/api/services/` (ProductService, OrderService, IntegrationService, etc.)

**IntegrationEngine** (`src/integration/`) — event-driven orchestration:
- `ExportOrchestrator` — publishes product data to marketplaces
- `ImportOrchestrator` — pulls product/order data from marketplaces
- `OrderOrchestrator` — processes orders across channels
- Workers: Stager → Importer → Dispatcher → Validator → Publisher → Sentinel → Sync
- Coordination via two event buses: `IntegrationEventBus` (internal signals) and `NotificationEventBus` (user-facing)
- Redis/BullMQ used for queue management; **the process does NOT start without Redis** (`RedisService.ts:19-21`, `entegrasyonik.ts:46`; verified 2026-09-26) — run Redis (docker) before starting the backend. The catalog pipeline uses a Mongo state machine (no Redis); only the order pipeline uses BullMQ

**Path aliases** (defined in `backend/tsconfig.json`):
- `@database` → database layer
- `@api` → API routes and services
- `@services` → cross-cutting services (Storage S3/R2, Mail, Redis, Notifications)
- `@interfaces` → TypeScript interfaces shared across backend
- `@operations` → business logic operations (ClientOperations, CatalogOperations)
- `@integration` → marketplace adapters and orchestrators
- `@utils` → utilities

**Marketplace adapters** live under `src/integration/modules/` — one directory per platform (trendyol, hepsiburada, pazarama, n11). Trendyol and Pazarama have built-in mock mode controlled by environment variables.

### Frontend (`frontend/src/`)

Vue 3 + TypeScript + Vuetify 3, also packaged as an Electron desktop app.

- **State**: Pinia stores in `src/stores/` — `context.ts` holds auth/user state; separate stores for brands, categories, ecommerce, erp, einvoice, configuration
- **API client**: `src/composables/restapi.ts` — all backend calls go through here
- **Auth**: `src/composables/user.ts`
- **Types**: `src/types/` — ClaimTypes, OrderTypes, InvoiceTypes, MessageTypes, TicketTypes, PlatformProcess
- **i18n**: Turkish and English, wired in `src/plugins/`
- **Electron main process**: `frontend/main.js` — loads `http://localhost:3000` in dev, `dist/index.html` in production

### Environment & Deployment

- Backend port: `5001`, context path `/api`
- MongoDB: Atlas cluster (`duyguemre`) production/staging için; **local geliştirme kullanıcının makinesindeki yerel MongoDB'yi kullanır** (bkz. `backend/.env` → `LOCAL_DB_URL`) — Docker'da ayrı bir Mongo instance kurulmaz.
- Deployments: Railway (staging), Render.com (`entegrasyonik.onrender.com`), production `app.entegrasyonik.com`
- `POD_NAME` env var used for multi-pod distributed lock cleanup
- Docker image: Node 20 Alpine, exposes port 5001
