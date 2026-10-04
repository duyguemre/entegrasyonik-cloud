import bodyParser from 'body-parser';
import { errorHandler, notFoundHandler } from '../api/http/errorEnvelope';
import { Server } from 'http';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import compression from 'compression'
import express, { Express, Request, Response } from 'express';

import { configureApis } from '@api/rpc/ApiManager';
import { configureAdminApi } from '@api/admin';
import { configureImageServices } from '@api/files/ImageApiManager';
import { configureExportDownloadRoutes } from '@api/files/ExportDownloadApiManager';
import { configureWebhookRoutes } from '@api/webhooks/WebhookApiManager';
import { configureChannelWebhookRoutes } from '@api/webhooks/ChannelWebhookApiManager';
import { configureBillingWebhookRoutes } from '@api/webhooks/BillingWebhookApiManager';
import { configureMockCheckoutRoutes } from '@api/webhooks/MockCheckoutApiManager';
import { configureNotificationUnsubscribeRoutes } from '@api/http/notificationUnsubscribe';
import { configurePublicConfigRoute } from '@api/http/publicConfig';
import { createMaintenanceMiddleware } from '@api/http/maintenanceGuard';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import Security from '@platform/core/security/Security';
import { createAuthenticateMiddleware } from '@api/http/authenticate';
import { configureNotificationStreamRoutes, getNotificationStreamHub } from '@api/http/notificationStream';
import { configureAgentRoutes, getAgentBroker } from '@api/http/agentRoutes';
import { configureOAuthConsentRoutes, configureOAuthPublicRoutes } from '@api/oauth'
import { configureMcpRoutes } from '@api/http/mcpRoutes';
import { configureMcpEndpoint } from '../mcp';
import { createOriginCheckMiddleware, parseCorsOrigins } from '@api/http/originCheck';
import { checkReadiness, AppRole } from '@health/HealthCheck';
import { RedisService } from '@services/redis';
import { config, config as appCfg } from '@config';
import { createRequestIdMiddleware, REQUEST_ID_HEADER } from '@api/http/requestId';
import { createSecurityHeadersMiddleware } from '@api/http/securityHeaders';
import { createGlobalRateLimitMiddleware } from '@platform/rateLimit/globalRateLimit';

export default class Webserver {
    private static instance: Webserver | null = null;
    private server!: Server
    private app: Express = {} as Express
    private role: AppRole = 'all'

    // Singleton yapısının dışarıdan doğrudan örneklenmesini engellemek için private constructor
    private constructor() { }

    // Webserver örneğini almak için kullanılan statik yöntem
    public static getInstance(): Webserver {
        if (!Webserver.instance) {
            Webserver.instance = new Webserver();
        }
        return Webserver.instance;
    }

    /**
     * .env'den gelen sunucu ayarlarını merkezi bir objede toplar
     */
    private getServerConfig() {
        // ADR-0001 Karar 10: CORS origin '*' kabul edilmez (listeden çıkarılır; kimlik bilgili isteklerde joker güvensizdir)
        const cors = parseCorsOrigins(config.server.cors.origins)
        if (cors.wildcardRejected) {
            console.warn('[WebServer] CORS_ORIGINS içindeki "*" kabul edilmez ve yok sayıldı; izinli originleri açıkça listeleyin (ADR-0001).')
        }
        return {
            name: config.server.name,
            context: config.server.context,
            url: config.server.host,
            port: config.server.port,
            imageFilesPath: config.server.imageFilesPath,
            corsOptions: {
                origin: cors.origins,
                methods: config.server.cors.methods,
                credentials: config.server.cors.credentials,
                optionsSuccessStatus: 204,
                // ADR-0017 Karar 1.6: tarayıcı JS'in yanıt başlığını okuyabilmesi için (Destek kodu gösterimi, Aşama D).
                exposedHeaders: [REQUEST_ID_HEADER],
            }
        };
    }

    public async init(role: AppRole = 'all') {
        this.role = role;
        Security.assertConfig(); // JWT_SECRET yok/kısa ise süreç başlamaz (fail-fast)
        const config = this.getServerConfig();
        this.configure(config);

        // ADR-0001: tek authenticate middleware'i (varsayılan ret). Açık rotalar authenticate.ts'teki sabit listedir.
        // Eski "MOCK SECURITY" middleware'i ve jwt.decode kullanımı kaldırıldı.
        // ADR-0001 Karar 10: durum değiştiren isteklerde Origin/Referer doğrulaması (yoksa izin; preflight etkilenmez)
        this.app.use(createOriginCheckMiddleware(config.corsOptions.origin));
        this.app.use(createAuthenticateMiddleware(config.context));
        // ADR-0017 §10 "Rate limiting": authenticate'ten SONRA (kimlik anahtarlı sınır -- res.locals.principal
        // gerekir), rota kaydından ÖNCE. `/health`/`/ready`/webhook rotaları zaten bu middleware zincirinin
        // dışındadır (configureHealthRoutes/configureWebhookRoutes daha erken, authenticate'ten önce tanımlı).
        this.app.use(createGlobalRateLimitMiddleware());

        // ADR-0031 BE-CFG-3: kimliksiz `GET /api/public-config` (OPEN_ROUTES kamu istisnası; genel hız sınırından SONRA, jenerik `/:service` rotasından ÖNCE).
        configurePublicConfigRoute(this.app, config.context);
        // BACKOFFICE_PLAN B11: bakım modu (`maintenance.enabled`) -> tenant `/api` yazmaları 503 MAINTENANCE; authenticate'ten SONRA (küresel yönetici muaf), rotalardan ÖNCE.
        this.app.use(config.context, createMaintenanceMiddleware());

        // ADR-0029 NB6: SSE zili (authenticate + rate limit'ten SONRA; cerez oturumu). Kapanista bootstrap akislari kapatir.
        configureNotificationStreamRoutes(this.app, config.context, {
            hub: getNotificationStreamHub,
            allowedOrigins: config.corsOptions.origin,
            enabled: () => appCfg.notify.streamEnabled,
        });
        // ADR-0034 BR-1: sohbet araci (`/api/agent/*`; SSE tur). Jenerik `/:service/:operation` rotasindan ONCE.
        configureAgentRoutes(this.app, config.context, { broker: getAgentBroker });
        // ADR-0035 / MCP-1: cerezli onay ekrani uclari (`/api/oauth/requests/:id[/decision]`; oauth.consent.view|decide).
        configureOAuthConsentRoutes(this.app, config.context);
        // ADR-0035 / MCP-2: tenant MCP ayari + bagli uygulamalar (`/api/mcp/*`; mcp.settings.*, mcp.connections.*, mcp.approvals.list) + gercek ayar okuyucusu baglama.
        configureMcpRoutes(this.app, config.context);
        configureApis(this.app, config.context)
        configureImageServices(this.app, config.context, config.imageFilesPath)
        // KVKK dışa aktarma indirme rotası (owner, oturumlu, tek kullanımlık token; docs/API_TENANT_SURFACE.md §5)
        configureExportDownloadRoutes(this.app, config.context)
        // [ADR-0030 X5] TÜM rotalardan (SSE/webhook/abonelik-iptal/admin dahil) SONRA: JSON 404 + son hata işleyici (bozuk JSON/10 MB aşımı dahil).
        this.app.use(notFoundHandler)
        this.app.use(errorHandler)
        await this.start(config)
    }

    private configure(config: any) {
        this.app = express()

        // ADR-0017 Karar 1.6: HER rotadan (health/webhook dahil) önce, auth'tan ÖNCE: correlation id kurulumu +
        // yanıt başlığı. `X-Request-Id` yoksa/geçersizse üretilir; AsyncLocalStorage bağlamı bu isteğin ömrü boyunca taşınır.
        this.app.use(createRequestIdMiddleware());

        // ADR-0017 §10 "Güvenlik başlıkları": helmet, TÜM yanıtlara (health/webhook dahil) uygulanır.
        this.app.use(createSecurityHeadersMiddleware());

        // ADR-0006 Karar 5: `/health` `/ready` context yolunun ("/api") DIŞINDA, auth'suz. `authenticate.ts`'teki
        // `isOpenRoute` listesine GİRMEZ — tamamen ayrı, `createAuthenticateMiddleware`'den önce kayıtlı rota
        // (Express, eşleşen rota bulunca middleware zincirine hiç girmez).
        this.configureHealthRoutes();

        // ADR-0005 Karar 8 (Aşama B): Trendyol webhook rotası (`/hooks/trendyol/:hookToken`) health/ready ile
        // AYNI YERDE (context "/api" DIŞINDA, `authenticate` middleware'inden ÖNCE) bağlanır. Kimlik doğrulaması
        // JWT/oturum çerezine DEĞİL, `hookToken` eşleşmesine dayanır (kendi doğrulamasını `WebhookApiManager`
        // içinde kendisi yapar) -- ayrıntı ve gerekçe `WebhookApiManager.ts` başındaki not.
        configureWebhookRoutes(this.app);
        configureChannelWebhookRoutes(this.app); // [WP7b, F-11] Hepsiburada + Ideasoft alıcıları (aynı yer, authenticate'ten ÖNCE)

        // ADR-0008 §4 (Aşama A): billing webhook rotası (`/api/billing/webhooks/:provider`). AYNI gerekçeyle
        // (JWT yok, sağlayıcı imza doğrulaması kendi içinde) Trendyol webhook'uyla aynı yerde, `authenticate`
        // middleware'inden ÖNCE bağlanır -- ayrıntı `BillingWebhookApiManager.ts` başındaki not.
        configureBillingWebhookRoutes(this.app);

        // ADR-0008 §1 / ADR-0014 S4a: mock hosted checkout sayfası + dev tetikleyici (`/api/billing/mock-checkout/*`,
        // `/api/billing/mock/simulate`). Aynı yerde/gerekçeyle authenticate'ten ÖNCE; yalnızca PAYMENT_PROVIDER=mock ve
        // NODE_ENV!=='production' iken yanıt verir (aksi 404 -- kapı her istekte değerlendirilir), imzalı tek kullanımlık token ister.
        configureMockCheckoutRoutes(this.app);

        // ADR-0029 NB5: kimliksiz abonelikten cikma (RFC 8058); yetki = imzali sureli belirtec; authenticate'ten ONCE.
        configureNotificationUnsubscribeRoutes(this.app, {
            secret: () => appCfg.notify.unsubSecret,
            prefs: async () => (await DatabaseManagerInstance.getApplicationDB()).getNotificationPreferencesModel() as any,
        });

        // ADR-0035 / MCP-3: uzak MCP ucu `POST /mcp` (durumsuz, Bearer `aud:mcp`). cookieParser/body-parser (10 MB)/authenticate'ten ONCE: kendi 256 KB govde sinirini ve
        // kimlik hattini (McpAuth) kullanir; MCP_ENABLED=false iken 404.
        configureMcpEndpoint(this.app);

        this.app.use(cookieParser());
        this.app.use(compression())
        this.app.use(bodyParser.json({ limit: '10mb' }));
        this.app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

        // ADR-0026 Karar 2B/4: backoffice `/admin-api` — ayrı CORS listesi, `EK_ADMIN` çerezi, ayrı kimlik/audit. Müşteri `cors` (aşağıda) ve
        // `originCheck`/`authenticate`'ten ÖNCE bağlanır: müşteri CORS listesi bu yolda devreye girmez (preflight dahil) ve
        // `JWT_TOKEN` çerezi hiç okunmaz. Bilinmeyen `/admin-api/*` yolu router içinde 404 ile biter (müşteri zincirine düşmez).
        configureAdminApi(this.app);

        // ADR-0035 / MCP-1: kimliksiz OAuth yetkilendirme sunucusu (`/.well-known/*`, `/oauth/*`; cerezsiz, CORS `*`). originCheck/authenticate'ten ONCE
        // (cross-origin tarayici istemcileri token/register'a erisebilsin). MCP_ENABLED=false iken her yol 404.
        configureOAuthPublicRoutes(this.app);

        // .env'den gelen CORS ayarları uygulanıyor
        this.app.use(cors(config.corsOptions));
    }

    /**
     * ADR-0006 Karar 5: `/health` (liveness, sabit 200 — bağımlılık kontrolü YOK) ve `/ready` (readiness: Mongo +
     * rol worker/all ise Redis, ≤1sn; kapanış başladıysa 503). İçerik ayrıntısız (host/sürüm bilgisi yok).
     */
    private configureHealthRoutes() {
        this.app.get('/health', (_req: Request, res: Response) => {
            res.status(200).json({ status: 'ok' });
        });

        this.app.get('/ready', async (_req: Request, res: Response) => {
            const status = await checkReadiness(this.role, () => RedisService.getInstance());
            res.status(status.ready ? 200 : 503).json(status);
        });
    }

    /** ADR-0006 Karar 6 (graceful shutdown, adım 2): yeni bağlantı kabul etmeyi durdurur; uçuştaki istekler biter. */
    public async close(): Promise<void> {
        if (!this.server) return;
        await new Promise<void>((resolve) => this.server.close(() => resolve()));
    }

    private async start(config: any): Promise<boolean> {
        return await new Promise((resolve, reject) => {
            this.server = this.app.listen(config.port, config.url, () => {
                console.log('[\x1b[32mWebServer\x1b[0m] ' + config.name + ' running at http://' + config.url + ':' + config.port + config.context)
                resolve(true)
            }).on("error", (error) => {
                console.log('[\x1b[31mWebServer\x1b[0m] ' + config.name + ' DOWN at port : ', config.port, error);
                resolve(false)
            })
        })
    }
}