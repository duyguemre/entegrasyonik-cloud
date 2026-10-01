import express, { Express, Request, Response } from 'express';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { OrderQueueProducer } from '@integration/engine/order/OrderQueueProducer';
import { createHash } from 'crypto';
import { createRateLimiter } from '@platform/rateLimit/rateLimit';
import { safeEqual, verifyWebhookHeaders } from './webhookAuth';
import { eventLog } from '@platform/core/logger';

const log = eventLog('webhook', 'WebhookApiManager');

// ADR-0005 Karar 8 (Aşama B): Trendyol sipariş durumu webhook alıcısı.
//
// Mimari yerleşim: bu rota `Webserver.configure()` içinde, `/health`/`/ready` (ADR-0006 Karar 5) ile AYNI
// YERDE ve authenticate middleware'inden (ADR-0001) ÖNCE bağlanır. Gerekçe: webhook kimlik doğrulaması JWT/oturum
// çerezine değil, `:hookToken` yol parametresine dayanır -- tenant kullanıcı oturumu YOKTUR (Trendyol'un
// sunucusu çağırır). `authenticate.ts`'teki `OPEN_ROUTES` listesine EKLEMEK yerine (o liste `/api` context'i
// İÇİNDEKİ, ApiWrapper/OPERATION_POLICY'ye bağlı RPC rotaları için tasarlanmıştır ve kimlik doğrulamasını TAMAMEN
// atlar) health/ready ile TUTARLI biçimde, `/api` context'inin DIŞINDA, kendi doğrulamasını (hookToken eşleşmesi)
// kendisi yapan bağımsız bir rota olarak açılır. Bu, ADR-0001'in "her operasyon OPERATION_POLICY'de kademeli
// yetkilendirmeden geçer" modeliyle karışmaz: webhook bir "operasyon" değil, dış sistemin sinyal verdiği ayrı bir
// giriş noktasıdır.
//
// Gövde VERİ KAYNAĞI OLARAK KULLANILMAZ (ADR-0005 Karar 8): `express.raw` ile gövde TAMPONLANIR (soket düzgün
// tüketilsin diye) ama HİÇ okunmaz/parse edilmez -- bozuk/zararlı JSON dahi 200/404 davranışını DEĞİŞTİRMEZ.
//
// Trendyol'un webhook isteğini doğrulamak için kullanılabilecek resmi bir imza/kimlik doğrulama başlığı
// (`docs/research/1f-findings.md` L16, `docs/adr/0005-...md` Bağlam) DOĞRULANAMADI: araştırma bulgusu yalnızca
// "webhook sipariş durumu olayları için var, 5 dk'da bir yeniden dener, sonra otomatik pasife alır" diyor;
// header/signature şeması belgelenmemiş. BULGU olarak işaretlendi (bkz. görev raporu / BACKLOG). Bu nedenle
// doğrulama TAMAMEN `hookToken` eşleşmesine dayanır (ADR-0005 Karar 8: "pazaryerinin desteklediği kimlik
// doğrulama başlığı da doğrulanır" notu bu bulgudan ötürü UYGULANAMADI).
//
// WP10 (güvenlik): (a) token karşılaştırması sabit-zamanlı (`safeEqual`); (b) Trendyol'un RESMİ yöntemleri (API_KEY başlığı
// veya Basic; HMAC yok -- docs/research/API_CONTRACTS_2026-09-30.md) entegrasyon kaydında `webhookAuthType` ile
// yapılandırılmışsa ZORUNLU doğrulanır, yapılandırılmamışsa bugünkü davranış korunur + uyarı loglanır (geriye uyumluluk);
// (c) tüm doğrulama hataları AYNI 404'tür (token yok/yanlış/başlık yanlış ayrımı sızmaz; ADR-0005 Karar 8: 404);
// (d) yalnız JSON Content-Type (gövde varsa) ve oran sınırı (token başına + IP başına kaba tavan).
// Tekilleştirme: olay gövdesi okunmaz (Karar 8); webhook yalnız "şimdi çek" sinyalidir. Aynı sinyalin tekrarı
// `enqueueWebhookTriggeredSync` içindeki 10 sn jobId tekilleştirmesiyle tek sync işine iner (çift işleme yok; sync durum-çekimidir, idempotenttir).
const WEBHOOK_BODY_LIMIT = '256kb';
const WEBHOOK_TOKEN_RATE = { windowMs: 60_000, max: 60 };   // Trendyol tekrar denemesi 5 dk'da bir; 60/dk cömert
const WEBHOOK_IP_RATE = { windowMs: 60_000, max: 600 };     // Trendyol IP'leri tenant'lar arası paylaşımlı: kaba tavan
const warnedUnconfigured = new Map<string, number>();

// Tek Queue/Redis bağlantısı: modül yüklendiğinde (Webserver başlarken) BİR KEZ kurulur. `OrderQueueProducer`
// constructor'ı Redis'e senkron bağlanmaya ÇALIŞMAZ (ADR-0005 Karar 2 ile aynı dayanıklılık garantisi) -- Redis
// o an ayakta olmasa da süreç bu yüzden çökmez/engellenmez.
const webhookOrderQueueProducer = new OrderQueueProducer();

export interface IWebhookResult {
    statusCode: number;
}

/**
 * [ADR-0005 Karar 8] Trendyol sipariş durumu webhook'u işleyicisi. Express'ten bağımsız (test edilebilirlik
 * için `Request`/`Response` ALMAZ, yalnızca `hookToken` alır ve statusCode döner).
 *
 * Akış:
 * 1. `hookToken` ApplicationDB'deki (aktif) bir `Client.integrations[].webhookToken` ile eşleşmeli. Eşleşmezse
 *    (veya integration `trendyol` değilse -- bu rota şimdilik yalnızca Trendyol için) **404** (varlığını
 *    sızdırmamak için 401 DEĞİL, ADR-0005 Karar 8 madde 2).
 * 2. Eşleşirse: webhook sağlık alanları güncellenir (`webhookHealthy=true`, `webhookLastReceivedAt=now`) VE
 *    ilgili (tenant, entegrasyon) için order-sync işi HEMEN kuyruğa eklenir (`OrderQueueProducer.
 *    enqueueWebhookTriggeredSync`, 10 sn tekilleştirme). **200** hızlıca döner; gerçek sync ASENKRON (BullMQ
 *    worker'ı bloklamaz).
 * 3. Beklenmeyen hata (DB/Redis) -> **500** (Trendyol'un kendi retry mekanizması devreye girer; ADR-0005
 *    Bağlam: "başarısız teslimde 5 dk'da bir yeniden dener" -- bu nedenle iç hatada 200 DÖNMEK yerine 500 tercih
 *    edildi, aksi halde Trendyol bizim hatamızı "teslim edildi" sayardı).
 */
export async function handleTrendyolWebhook(hookToken: string, headers?: Record<string, unknown>): Promise<IWebhookResult> {
    try {
        if (!hookToken) return { statusCode: 404 };

        const applicationDB = await DatabaseManagerInstance.getApplicationDB();
        const clientModel = applicationDB.getClientModel();

        const client: any = await clientModel.findOne(
            { status: 'ACTIVE', 'integrations.webhookToken': hookToken },
        ).lean();
        if (!client) return { statusCode: 404 };

        const integration = (client.integrations || []).find((i: any) => i && safeEqual(i.webhookToken, hookToken));
        // Kapsam (ADR-0005 Karar 8, Faz 2): bu rota YALNIZCA Trendyol için. Teorik olarak başka bir entegrasyon
        // türü aynı alanı kullanıp eşleşse bile (bugün üretmiyoruz, ama savunmacı) işlenmez.
        if (!integration || integration.integrationCode !== 'trendyol') return { statusCode: 404 };

        // WP10: Trendyol başlık doğrulaması (yapılandırılmışsa zorunlu; aksi halde geriye uyumlu + uyarı).
        const headerAuth = verifyWebhookHeaders(integration, headers);
        if (headerAuth === 'fail') return { statusCode: 404 };
        if (headerAuth === 'not-configured') {
            const k = String(client.clientId);
            const t = Date.now();
            if ((warnedUnconfigured.get(k) ?? 0) + 3_600_000 < t) {
                warnedUnconfigured.set(k, t);
                log.warn('WEBHOOK_HEADER_AUTH_UNCONFIGURED', 'trendyol webhook: başlık kimlik doğrulaması (API_KEY/BASIC) yapılandırılmamış; yalnız URL token ile doğrulandı', { clientId: client.clientId });
            }
        }

        const now = new Date();
        const lastSyncTimestamp = integration.lastSuccessfulOrderSync || new Date(now.getTime() - 24 * 60 * 60 * 1000);

        await Promise.all([
            clientModel.updateOne(
                { clientId: client.clientId, 'integrations.integrationCode': integration.integrationCode },
                { $set: { 'integrations.$.webhookHealthy': true, 'integrations.$.webhookLastReceivedAt': now } },
            ),
            webhookOrderQueueProducer.enqueueWebhookTriggeredSync(client.clientId, integration.integrationCode, lastSyncTimestamp),
        ]);

        return { statusCode: 200 };
    } catch (e: any) {
        log.error('WEBHOOK_PROCESSING_FAILED', '[WebhookApiManager] Trendyol webhook işleme hatası:', { err: e?.message });
        return { statusCode: 500 };
    }
}

/** `Webserver.configure()` içinde, health/ready ile aynı yerde ve authenticate middleware'inden ÖNCE çağrılır. */
export function configureWebhookRoutes(app: Express) {
    const ipLimiter = createRateLimiter(WEBHOOK_IP_RATE);
    const tokenLimiter = createRateLimiter({
        ...WEBHOOK_TOKEN_RATE,
        // Ham token bellekte/anahtarda tutulmaz: kısaltılmış özet.
        keyFn: (req) => createHash('sha256').update(String(req.params?.hookToken ?? '')).digest('hex').slice(0, 16),
    });
    app.post(
        '/hooks/trendyol/:hookToken',
        ipLimiter,
        tokenLimiter,
        webhookContentTypeGuard,
        express.raw({ type: '*/*', limit: WEBHOOK_BODY_LIMIT }),
        async (req: Request, res: Response) => {
            const result = await handleTrendyolWebhook(req.params.hookToken, req.headers as Record<string, unknown>);
            res.status(result.statusCode).end();
        },
    );
}

/** Gövde VARSA yalnız application/json kabul edilir (boş gövdeli ping'ler geçer); aksi 415. */
export function webhookContentTypeGuard(req: Request, res: Response, next: () => void) {
    const len = Number(req.headers['content-length'] ?? 0);
    const chunked = !!req.headers['transfer-encoding'];
    if (len > 0 || chunked) {
        const ct = String(req.headers['content-type'] ?? '').toLowerCase();
        if (!/^application\/json(\s*;|$)/.test(ct)) {
            res.status(415).end();
            return;
        }
    }
    next();
}
