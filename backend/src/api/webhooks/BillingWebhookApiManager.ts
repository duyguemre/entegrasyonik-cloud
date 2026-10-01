import express, { Express, Request, Response } from 'express';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { AuditLogger } from '@services/audit/AuditLogger';
import { getConfiguredProviderName, getPaymentProvider } from '@services/billing/PaymentProviderFactory';
import { EntitlementService } from '@services/billing/EntitlementService';
import { PaymentProviderError, WebhookHeaders } from '@services/billing/PaymentProvider';
import { createRateLimiter } from '@platform/rateLimit/rateLimit';
import { eventLog } from '@platform/core/logger';

const log = eventLog('webhook', 'BillingWebhookApiManager');

// ADR-0008 §4: "Ayrı rota: POST /api/billing/webhooks/:provider — jenerik /:service/:operation RPC'sinin dışında,
// JWT gerektirmez, IP/istek rate limit'li, ham gövde (raw body) yakalanır."
//
// Mimari yerleşim: `WebhookApiManager.ts`'teki (ADR-0005 Karar 8) Trendyol webhook rotasıyla AYNI desen --
// `Webserver.configure()` içinde, `authenticate` middleware'i (ADR-0001) kaydedilmeden ÖNCE bağlanır. ADR-0008'in
// yol metni "/api/billing/webhooks/:provider" DEĞİŞMEZ (literal olarak uygulanır) ANCAK kimlik doğrulamadan
// muafiyeti `authenticate.ts`'teki `OPEN_ROUTES` listesine EKLEYEREK DEĞİL (o liste ApiWrapper/OPERATION_POLICY'ye
// bağlı jenerik RPC rotaları içindir ve bu rota jenerik RPC İLE ÇAĞRILAMAZ türden bağımsız bir uçtur), Express'in
// KAYIT SIRASINA dayanarak sağlanır: rota `authenticate` middleware'inden önce kayıtlıysa, eşleşen istek yanıtlanıp
// biter ve authenticate/ApiWrapper zincirine hiç girmez -- Trendyol rotasıyla birebir aynı mekanizma (bkz.
// `WebhookApiManager.ts` başındaki not). Kimlik doğrulaması JWT/çerez yerine sağlayıcı imza doğrulamasına dayanır.
//
// Rate limit: mevcut süreç-içi `createRateLimiter` (ADR-0001 Karar 10 ile aynı yardımcı, login/register'dakiyle
// AYNI mekanizma ama AYRI kova) -- yeni bağımlılık/Redis GEREKMEZ (tek haneli tenant ölçeğinde webhook trafiği
// düşük; 2+ replikaya geçilirse ADR-0001'in "rate limit deposu Redis'e taşınır" eşiği burada da geçerli olur).
//
// İşleme yaklaşımı (senkron, BullMQ DEĞİL) -- KASITLI TASARIM KARARI:
// ADR "hızlı 2xx, işlem BullMQ kuyruğunda (mevcut Redis) yeniden denemeli" der ve görev talimatı "minimal
// tutulabilir (senkron işleme de kabul edilebilir)" seçeneğini açıkça bırakır. Bu aşamada (Faz 3, tek haneli
// tenant, mock sağlayıcı) senkron işleme seçildi: (1) işlem birkaç Mongo yazmasından ibarettir (BillingEvents
// idempotency kaydı + Subscriptions güncellemesi), gerçek ağ çağrısı yalnızca `getSubscription` (mock'ta yerel,
// iyzico'da tek bir HTTP isteği) -- p95 gecikmesi sağlayıcının webhook zaman aşımı eşiğinin (tipik 10-30 sn)
// çok altında kalır; (2) BullMQ eklemek bu ölçekte ek bir hata yüzeyi (kuyruk gecikmesi, worker izleme) getirir
// ama somut bir gecikme/throughput sorunu YOK (INTEGRATION_ENGINE_STANDARDS "somut sayısal eşik" ilkesi); (3)
// idempotency zaten `BillingEvents.providerEventId` unique indeksiyle sağlanıyor -- kuyruk bunu değiştirmez,
// yalnızca "hemen 2xx dön" garantisini biraz güçlendirir. Yeniden değerlendirme eşiği: webhook işleme p95 süresi
// sağlayıcının zaman aşımına yaklaşırsa (iyzico adaptörü eklenince ölçülmeli) VEYA günlük mutabakat job'u (ADR §4,
// bu görevin kapsamı dışı) devreye alınınca yük artarsa -> BullMQ'ya taşınır (mevcut Redis altyapısı, aynı desende
// `OrderQueueProducer`). `processBillingWebhookEvent` bilerek Express'ten bağımsız/saf tutuldu (yalnızca event +
// DB modelleri alır) -- ileride bir BullMQ worker'ına taşımak bu fonksiyonun İMZASINI değiştirmeyi gerektirmez.

const BILLING_WEBHOOK_BODY_LIMIT = '256kb';

function envPositiveInt(name: string, fallback: number): number {
    const n = Number(process.env[name]);
    return Number.isInteger(n) && n > 0 ? n : fallback;
}

const billingWebhookRateLimiter = createRateLimiter({
    max: envPositiveInt('BILLING_WEBHOOK_RATE_LIMIT_MAX', 60),
    windowMs: envPositiveInt('BILLING_WEBHOOK_RATE_LIMIT_WINDOW_MS', 60_000),
});

export interface IBillingWebhookResult {
    statusCode: number;
    /** Yalnızca gözlemlenebilirlik/testler için -- HTTP yanıtına yansımaz. */
    outcome?: 'processed' | 'ignored' | 'failed' | 'invalid_signature' | 'unknown_provider';
}

/**
 * [ADR-0008 §4] Sağlayıcı webhook alıcısı. Express'ten bağımsız (test edilebilirlik için `Request`/`Response`
 * ALMAZ) -- `WebhookApiManager.handleTrendyolWebhook` ile aynı desen.
 *
 * Akış:
 * 1. `provider` yol parametresi, o an yapılandırılmış sağlayıcıyla (PAYMENT_PROVIDER) eşleşmeli; eşleşmezse
 *    **404** (hangi sağlayıcıların var olduğunu sızdırmaz -- Trendyol rotasındaki 404 ilkesiyle aynı gerekçe).
 * 2. `verifyAndParseWebhook` başarısızsa (imza geçersiz) **401** + audit kaydı (best-effort).
 * 3. `BillingEvents.providerEventId` (provider ile birlikte) zaten varsa -> **200**, `ignored` (idempotency;
 *    ADR §4 "tekrar gelen olay ignored olarak 200 döner" -- ikinci kez işlenmez, unique indeks doğal koruma).
 * 4. Yeni olay: eşleşen `Subscriptions` kaydı bulunursa sağlayıcıdan KANONİK durum yeniden çekilir
 *    (`getSubscription` -- ADR §4 "webhook'a tek başına güvenilmez, doğruluk kaynağı sağlayıcıdır") ve
 *    `Subscriptions` bu kanonik değerle güncellenir; `EntitlementService` önbelleği o tenant için silinir.
 * 5. Her durumda (eşleşen abonelik bulunamasa/işleme hata verse bile) `BillingEvents` kaydı yazılır
 *    (`processed`/`failed`) ve **200** dönülür (ADR "hızlı 2xx"; başarısız olay admin panelinde görünür kalır --
 *    panel entegrasyonu bu görevin kapsamında değil). Yalnızca DB'ye TAMAMEN ulaşılamazsa (idempotency kaydı bile
 *    okunamıyorsa) **500** dönülür (Trendyol rotasındaki gerekçeyle aynı: sağlayıcının kendi retry'ı devam etsin).
 */
export async function handleBillingWebhook(provider: string, rawBody: Buffer, headers: WebhookHeaders): Promise<IBillingWebhookResult> {
    try {
        if (!provider || getConfiguredProviderName() !== provider) {
            return { statusCode: 404, outcome: 'unknown_provider' };
        }

        const paymentProvider = getPaymentProvider();

        let event;
        try {
            event = await paymentProvider.verifyAndParseWebhook(rawBody, headers);
        } catch (e: any) {
            if (!(e instanceof PaymentProviderError) || e.code !== 'invalid_signature') {
                log.error('BILLING_WEBHOOK_VERIFY_UNEXPECTED', '[BillingWebhookApiManager] beklenmeyen doğrulama hatası', { err: e?.message });
            }
            await AuditLogger.log({ event: 'billing.webhook.invalid_signature', result: 'fail', meta: { provider } });
            return { statusCode: 401, outcome: 'invalid_signature' };
        }

        const applicationDB = await DatabaseManagerInstance.getApplicationDB();
        const billingEventModel = applicationDB.getBillingEventModel();

        const existing = await billingEventModel.findOne({ provider, providerEventId: event.providerEventId }).lean();
        if (existing) {
            return { statusCode: 200, outcome: 'ignored' };
        }

        let clientId: number | undefined;
        let status: 'processed' | 'failed' = 'processed';
        let failureReason: string | undefined;

        try {
            if (!event.providerSubscriptionRef) {
                status = 'failed';
                failureReason = 'missing_providerSubscriptionRef';
            } else {
                const subscriptionModel = applicationDB.getSubscriptionModel();
                const sub: any = await subscriptionModel.findOne({ provider, providerSubscriptionRef: event.providerSubscriptionRef }).lean();
                if (!sub) {
                    status = 'failed';
                    failureReason = 'subscription_not_found';
                } else {
                    clientId = sub.clientId;
                    const canonical = await paymentProvider.getSubscription(event.providerSubscriptionRef);
                    await subscriptionModel.updateOne({ clientId: sub.clientId }, {
                        $set: {
                            status: canonical.status,
                            currentPeriodStart: canonical.currentPeriodStart,
                            currentPeriodEnd: canonical.currentPeriodEnd,
                            cancelAtPeriodEnd: !!canonical.cancelAtPeriodEnd,
                            providerCustomerRef: canonical.providerCustomerRef,
                            cardLast4: canonical.cardLast4,
                            cardBrand: canonical.cardBrand,
                        },
                    });
                    // ADR §3 son paragraf: "webhook işlenince ilgili tenant anahtarı silinir"
                    EntitlementService.invalidate(sub.clientId);
                }
            }
        } catch (e: any) {
            status = 'failed';
            failureReason = String(e?.message ?? 'unknown_error').slice(0, 200);
            log.error('BILLING_WEBHOOK_PROCESS_FAILED', '[BillingWebhookApiManager] olay işleme hatası', { err: e?.message });
        }

        try {
            await billingEventModel.create({
                provider,
                providerEventId: event.providerEventId,
                type: event.type,
                clientId,
                receivedAt: new Date(),
                processedAt: new Date(),
                status,
                payloadRedacted: event.raw,
                failureReason,
            });
        } catch (e: any) {
            // İdempotency yarışı: iki eşzamanlı istek aynı olayı aynı anda ilk kez işlemeye çalışırsa unique
            // indeks ikincisini reddeder -- bu durum da "ignored" ile eşdeğerdir (ilki zaten kaydı yazdı/yazacak).
            log.error('BILLING_EVENT_WRITE_FAILED', '[BillingWebhookApiManager] BillingEvent yazılamadı (muhtemelen idempotency yarışı)', { err: e?.message });
            return { statusCode: 200, outcome: 'ignored' };
        }

        return { statusCode: 200, outcome: status === 'processed' ? 'processed' : 'failed' };
    } catch (e: any) {
        log.error('BILLING_WEBHOOK_UNEXPECTED', '[BillingWebhookApiManager] beklenmeyen hata', { err: e?.message });
        return { statusCode: 500 };
    }
}

function toWebhookHeaders(req: Request): WebhookHeaders {
    return req.headers as unknown as WebhookHeaders;
}

/** `Webserver.configure()` içinde, health/ready/Trendyol webhook ile aynı yerde ve authenticate middleware'inden ÖNCE çağrılır. */
export function configureBillingWebhookRoutes(app: Express) {
    app.post(
        '/api/billing/webhooks/:provider',
        billingWebhookRateLimiter,
        express.raw({ type: '*/*', limit: BILLING_WEBHOOK_BODY_LIMIT }),
        async (req: Request, res: Response) => {
            const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
            const result = await handleBillingWebhook(req.params.provider, rawBody, toWebhookHeaders(req));
            res.status(result.statusCode).end();
        },
    );
}
