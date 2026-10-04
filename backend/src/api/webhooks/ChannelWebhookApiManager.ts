import express, { Express, Request, Response } from 'express';
import { createHash } from 'crypto';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { OrderQueueProducer } from '@integration/engine/order/OrderQueueProducer';
import { createRateLimiter } from '@platform/rateLimit/rateLimit';
import { eventLog } from '@platform/core/logger';
import { safeEqual, verifyWebhookHeaders, verifyHmacSha256, plainSecret } from './webhookAuth';
import { webhookContentTypeGuard } from './WebhookApiManager';
import { hbEventKind, IDEASOFT_HMAC_HEADER, type WebhookSignalKind } from '@integration/contracts/webhookChannels';

const log = eventLog('webhook', 'ChannelWebhookApiManager');

/**
 * [eslesme-fiyat WP7b, F-11 / K-J, PLAN §3.5] Hepsiburada ve Ideasoft webhook alıcıları. Trendyol alıcısı (`WebhookApiManager`) ile
 * AYNI model (ADR-0005 Karar 8): gövde VERİ KAYNAĞI DEĞİL, yalnız "şimdi çek" sinyali; tenant kullanıcı oturumu yok, doğrulama yol
 * belirteciyle; tüm doğrulama hataları AYNI 404 (varlık/neden sızmaz); iç hata 500 (sağlayıcı yeniden dener); `/api` DIŞINDA,
 * authenticate'ten ÖNCE bağlanır.
 *
 * Kanal farkları:
 *  - Hepsiburada: `PUT /hooks/hepsiburada/:hookToken/:event` (HB `PUT <baseUrl>/<eventName>`, 5 sn içinde 2xx). Olay adı yalnız
 *    sinyal TÜRÜNÜ seçer (8 sipariş olayı → orders, 4 claim olayı → claims; `webhookChannels.HB_WEBHOOK_EVENTS`); bilinmeyen olay 404.
 *    İmza belgelenmemiş (API_HEPSIBURADA.md §5) → belirteç + isteğe bağlı API_KEY/BASIC başlığı (Trendyol'daki `webhookAuthType`).
 *  - Ideasoft: `POST /hooks/ideasoft/:hookToken`, ZORUNLU `X-Ideashop-Hmac-Sha256` = Base64(HMAC-SHA256(ham gövde, client secret)).
 *    Ham gövde YALNIZ HMAC girdisidir, ayrıştırılmaz/okunmaz (bu dosyada `req.body` ham `Buffer` olarak yalnız `verifyHmacSha256`'ya
 *    geçer). Sır: `Clients.integrations[].webhookSecret` (varsa) ya da tenant DB `ClientIntegrations.ecommerce[ideasoft].settings.secret`
 *    (şifreli `enc:v1:` çözülür). Sır yoksa doğrulanamaz → 404 (fail-closed; Trendyol'daki "yapılandırılmamışsa uyarıyla geç" YOK, çünkü
 *    Ideasoft imzayı belgeliyor). Tekrar (replay): aynı belirteç için aynı ham gövde özeti 10 dk içinde ikinci kez gelirse 200 döner ama
 *    iş EKLENMEZ (sinyal zaten idempotent; bu, çalınmış bir isteğin yeniden oynatılmasıyla senkron tetiklenmesini de keser).
 *    Ideasoft konu (topic) gövdededir ve okunmaz → her olay `orders` sinyalidir (`product/update` içe aktarım kapsamı WP8).
 */
const WEBHOOK_BODY_LIMIT = '256kb';
const WEBHOOK_TOKEN_RATE = { windowMs: 60_000, max: 120 };  // HB 12 olay × paket; IS çok konu → Trendyol'un 2 katı
const WEBHOOK_IP_RATE = { windowMs: 60_000, max: 600 };
const REPLAY_WINDOW_MS = 10 * 60 * 1000;
const REPLAY_MAX_KEYS = 20_000;

const producer = new OrderQueueProducer();
const warnedUnconfigured = new Map<string, number>();

/** Tekrar oynatma önbelleği: anahtar = sha256(token özeti + gövde özeti); değer = ilk görülme (ms). Bellek-içi, pod başına (yeterli: amaç çalınan isteğin tekrarını kesmek). */
const replaySeen = new Map<string, number>();
function replayKey(hookToken: string, rawBody: Buffer): string {
    return createHash('sha256').update(hookToken).update('\u0000').update(rawBody).digest('hex');
}
/** true → bu (belirteç, gövde) çifti pencere içinde zaten görüldü. */
export function markReplay(hookToken: string, rawBody: Buffer, nowMs = Date.now()): boolean {
    if (replaySeen.size >= REPLAY_MAX_KEYS) {
        for (const [k, t] of replaySeen) if (nowMs - t > REPLAY_WINDOW_MS) replaySeen.delete(k);
        if (replaySeen.size >= REPLAY_MAX_KEYS) replaySeen.delete(replaySeen.keys().next().value as string); // en eski
    }
    const k = replayKey(hookToken, rawBody);
    const first = replaySeen.get(k);
    if (first !== undefined && nowMs - first <= REPLAY_WINDOW_MS) return true;
    replaySeen.set(k, nowMs);
    return false;
}
/** Test/çalışma zamanı sıfırlaması. */
export function resetReplayCache(): void { replaySeen.clear(); }

export interface ChannelWebhookInput {
    hookToken: string;
    headers?: Record<string, unknown>;
    /** HB: URL'deki olay adı. */
    event?: string;
    /** IS: ham gövde (yalnız HMAC girdisi). */
    rawBody?: Buffer;
}
export interface IWebhookResult { statusCode: number }

async function lookup(hookToken: string, channel: 'hepsiburada' | 'ideasoft') {
    const applicationDB = await DatabaseManagerInstance.getApplicationDB();
    const clientModel = applicationDB.getClientModel();
    const client: any = await clientModel.findOne({ status: 'ACTIVE', 'integrations.webhookToken': hookToken }).lean();
    if (!client) return null;
    const integration = (client.integrations || []).find((i: any) => i && safeEqual(i.webhookToken, hookToken));
    if (!integration || integration.integrationCode !== channel || integration.status === false) return null;
    return { clientModel, client, integration };
}

async function signal(clientModel: any, client: any, integration: any, kind: WebhookSignalKind): Promise<void> {
    const now = new Date();
    const lastSyncTimestamp = integration.lastSuccessfulOrderSync || new Date(now.getTime() - 24 * 60 * 60 * 1000);
    await Promise.all([
        clientModel.updateOne(
            { clientId: client.clientId, 'integrations.integrationCode': integration.integrationCode },
            { $set: { 'integrations.$.webhookHealthy': true, 'integrations.$.webhookLastReceivedAt': now } },
        ),
        producer.enqueueWebhookTriggeredSync(client.clientId, integration.integrationCode, lastSyncTimestamp, kind, integration),
    ]);
}

function warnOnce(channel: string, clientId: unknown): void {
    const k = `${channel}:${clientId}`;
    const t = Date.now();
    if ((warnedUnconfigured.get(k) ?? 0) + 3_600_000 < t) {
        warnedUnconfigured.set(k, t);
        log.warn('WEBHOOK_HEADER_AUTH_UNCONFIGURED', `${channel} webhook: başlık kimlik doğrulaması (API_KEY/BASIC) yapılandırılmamış; yalnız URL belirteciyle doğrulandı`, { clientId });
    }
}

/** Hepsiburada: belirteç + olay adı → `orders|claims` sinyali. */
export async function handleHepsiburadaWebhook(input: ChannelWebhookInput): Promise<IWebhookResult> {
    try {
        if (!input.hookToken) return { statusCode: 404 };
        const kind = hbEventKind(input.event);
        if (!kind) return { statusCode: 404 };
        const found = await lookup(input.hookToken, 'hepsiburada');
        if (!found) return { statusCode: 404 };
        const headerAuth = verifyWebhookHeaders(found.integration, input.headers);
        if (headerAuth === 'fail') return { statusCode: 404 };
        if (headerAuth === 'not-configured') warnOnce('hepsiburada', found.client.clientId);
        await signal(found.clientModel, found.client, found.integration, kind);
        return { statusCode: 200 };
    } catch (e: any) {
        log.error('WEBHOOK_PROCESSING_FAILED', '[ChannelWebhookApiManager] Hepsiburada webhook işleme hatası:', { err: e?.message });
        return { statusCode: 500 };
    }
}

/** Ideasoft client secret: `Clients.integrations[].webhookSecret` > tenant DB `ClientIntegrations.ecommerce[ideasoft].settings.secret|APISECRET`. */
async function ideasoftSecret(client: any, integration: any): Promise<string | undefined> {
    const override = plainSecret(integration?.webhookSecret);
    if (override) return override;
    const clientDB: any = await DatabaseManagerInstance.getClientDB(Number(client.clientId));
    if (!clientDB?.getClientIntegrationModel) return undefined;
    const doc: any = await clientDB.getClientIntegrationModel().findOne({ 'ecommerce.code': 'ideasoft' }, { ecommerce: 1 }).lean();
    const item = (doc?.ecommerce || []).find((i: any) => i?.code === 'ideasoft');
    const s = item?.settings || {};
    return plainSecret(s.secret) ?? plainSecret(s.APISECRET);
}

/** Ideasoft: belirteç + ZORUNLU HMAC; tekrar oynatma → 200 ama sinyal yok. */
export async function handleIdeasoftWebhook(input: ChannelWebhookInput): Promise<IWebhookResult> {
    try {
        if (!input.hookToken) return { statusCode: 404 };
        const found = await lookup(input.hookToken, 'ideasoft');
        if (!found) return { statusCode: 404 };
        const secret = await ideasoftSecret(found.client, found.integration);
        const rawBody = input.rawBody instanceof Uint8Array ? Buffer.from(input.rawBody) : Buffer.alloc(0);
        const sig = input.headers?.[IDEASOFT_HMAC_HEADER];
        if (!secret) {
            log.warn('WEBHOOK_HMAC_SECRET_MISSING', 'ideasoft webhook: client secret yok; imza doğrulanamadı (404)', { clientId: found.client.clientId });
            return { statusCode: 404 };
        }
        if (!verifyHmacSha256(rawBody, sig, secret)) return { statusCode: 404 };
        if (markReplay(input.hookToken, rawBody)) {
            log.warn('WEBHOOK_REPLAY_IGNORED', 'ideasoft webhook: aynı imzalı gövde 10 dk içinde yeniden geldi; sinyal verilmedi', { clientId: found.client.clientId });
            return { statusCode: 200 };
        }
        await signal(found.clientModel, found.client, found.integration, 'orders');
        return { statusCode: 200 };
    } catch (e: any) {
        log.error('WEBHOOK_PROCESSING_FAILED', '[ChannelWebhookApiManager] Ideasoft webhook işleme hatası:', { err: e?.message });
        return { statusCode: 500 };
    }
}

/** `configureWebhookRoutes` içinden çağrılır (health/ready ile aynı yer, authenticate'ten ÖNCE). */
export function configureChannelWebhookRoutes(app: Express): void {
    const ipLimiter = createRateLimiter(WEBHOOK_IP_RATE);
    const tokenLimiter = createRateLimiter({
        ...WEBHOOK_TOKEN_RATE,
        keyFn: (req) => createHash('sha256').update(String(req.params?.hookToken ?? '')).digest('hex').slice(0, 16),
    });
    const raw = express.raw({ type: '*/*', limit: WEBHOOK_BODY_LIMIT });

    // HB `PUT <baseUrl>/<eventName>`; POST da kabul (belge PUT der; sağlayıcı değişikliğine karşı). Gövde tamponlanır, okunmaz.
    const hb = async (req: Request, res: Response) => {
        const r = await handleHepsiburadaWebhook({ hookToken: req.params.hookToken, event: req.params.event, headers: req.headers as Record<string, unknown> });
        res.status(r.statusCode).end();
    };
    app.put('/hooks/hepsiburada/:hookToken/:event', ipLimiter, tokenLimiter, webhookContentTypeGuard, raw, hb);
    app.post('/hooks/hepsiburada/:hookToken/:event', ipLimiter, tokenLimiter, webhookContentTypeGuard, raw, hb);

    // IS: ham gövde yalnız HMAC girdisi (Buffer; ayrıştırma yok).
    app.post('/hooks/ideasoft/:hookToken', ipLimiter, tokenLimiter, webhookContentTypeGuard, raw, async (req: Request, res: Response) => {
        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        const r = await handleIdeasoftWebhook({ hookToken: req.params.hookToken, headers: req.headers as Record<string, unknown>, rawBody });
        res.status(r.statusCode).end();
    });
}
