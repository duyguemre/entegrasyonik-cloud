// MOB-07: Android kabuğu (Capacitor) yerel push taşıyıcısı -- FCM HTTP v1. Android WebView'de Web Push API YOK; kabukta bildirim
// yalnız FCM cihaz belirteciyle gider. Kanal kuralları MOB-04 ile AYNI (aynı outbox/dağıtıcılar, aynı içerik: sabit başlık + kısa metin
// + uygulama içi yol; hassas veri yok). Hizmet hesabı YALNIZ env'de (`FCM_SERVICE_ACCOUNT_JSON`, ham JSON ya da base64; SIR).
// Yoksa/bozuksa FCM kapalı, süreç başlar. Erişim belirteci (OAuth2 JWT-bearer, RS256) bellekte, süresinden 60 sn önce yenilenir.
import jwt from 'jsonwebtoken';
import type { PushSendOptions } from './PushDispatcher';

export interface FcmConfig { projectId: string; clientEmail: string; privateKey: string }

export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const FCM_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const FCM_API_HOST = 'fcm.googleapis.com';
/** FCM kayıt belirteci biçimi (uzunluk/karakter kümesi; içerik doğrulanamaz -- FCM 404/400 ile reddeder). */
export const FCM_TOKEN_RE = /^[A-Za-z0-9_:-]{32,4096}$/;

/** Geçerliyse yapılandırma, değilse neden (değer ASLA dönmez/loglanmaz). */
export function resolveFcm(raw: string | undefined): { ok: true; fcm: FcmConfig } | { ok: false; reason: 'missing' | 'invalid_json' | 'invalid_fields' } {
    const v = (raw ?? '').trim();
    if (!v) return { ok: false, reason: 'missing' };
    let o: any;
    try { o = JSON.parse(v.startsWith('{') ? v : Buffer.from(v, 'base64').toString('utf8')); } catch { return { ok: false, reason: 'invalid_json' }; }
    const projectId = typeof o?.project_id === 'string' ? o.project_id : '';
    const clientEmail = typeof o?.client_email === 'string' ? o.client_email : '';
    const privateKey = typeof o?.private_key === 'string' ? o.private_key.replace(/\\n/g, '\n') : '';
    if (!/^[a-z0-9-]{4,64}$/.test(projectId) || !/^[^\s@]+@[^\s@]+$/.test(clientEmail) || !privateKey.includes('PRIVATE KEY')) return { ok: false, reason: 'invalid_fields' };
    return { ok: true, fcm: { projectId, clientEmail, privateKey } };
}

export interface FcmMessageInput { token: string; payload: string; opts: PushSendOptions }

/** FCM v1 ileti gövdesi: `data` (kabuk tıklamada `url`'yi okur) + Android sistem bildirimi (uygulama kapalıyken de görünür). */
export function buildFcmMessage(i: FcmMessageInput): Record<string, unknown> {
    let p: Record<string, unknown> = {};
    try { p = JSON.parse(i.payload); } catch { p = {}; }
    const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');
    const data: Record<string, string> = { v: String(p.v ?? 1), title: str('title'), body: str('body'), url: str('url'), tag: str('tag'), severity: str('severity') };
    return {
        message: {
            token: i.token,
            data,
            android: {
                priority: i.opts.urgency === 'high' ? 'high' : 'normal',
                ttl: `${i.opts.ttl}s`,
                ...(i.opts.topic ? { collapse_key: i.opts.topic } : {}),
                notification: { title: data.title, body: data.body, ...(data.tag ? { tag: data.tag } : {}) },
            },
        },
    };
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ status: number; json(): Promise<any> }>;

export interface FcmSenderDeps { config(): FcmConfig | undefined; fetch?: FetchLike; now?(): number; timeoutMs?: number }

/** Başarısızlıkta `statusCode` taşıyan hata fırlatır (PushDispatcher.classifyPushError: 404 → abonelik biter, 429/5xx → geçici). */
export function createFcmSender(d: FcmSenderDeps) {
    const doFetch: FetchLike = d.fetch ?? ((url, init) => fetch(url, init) as any);
    const now = () => (d.now ? d.now() : Date.now());
    const timeout = d.timeoutMs ?? 10_000;
    let cached: { key: string; token: string; exp: number } | null = null;
    const fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

    async function accessToken(cfg: FcmConfig): Promise<string> {
        const key = `${cfg.projectId}:${cfg.clientEmail}`;
        if (cached && cached.key === key && cached.exp - 60_000 > now()) return cached.token;
        const iat = Math.floor(now() / 1000);
        const assertion = jwt.sign({ iss: cfg.clientEmail, scope: FCM_SCOPE, aud: FCM_TOKEN_URL, iat, exp: iat + 3600 }, cfg.privateKey, { algorithm: 'RS256' });
        const r = await doFetch(FCM_TOKEN_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(), signal: AbortSignal.timeout(timeout),
        });
        const body = await r.json().catch(() => ({}));
        if (r.status !== 200 || typeof body?.access_token !== 'string') throw fail(r.status >= 500 ? r.status : 503, 'FCM erişim belirteci alınamadı');
        cached = { key, token: body.access_token, exp: now() + Number(body.expires_in ?? 3600) * 1000 };
        return cached.token;
    }

    return {
        async send(token: string, payload: string, opts: PushSendOptions): Promise<{ statusCode?: number }> {
            const cfg = d.config();
            if (!cfg) throw fail(503, 'FCM kapalı');
            const bearer = await accessToken(cfg);
            const r = await doFetch(`https://${FCM_API_HOST}/v1/projects/${encodeURIComponent(cfg.projectId)}/messages:send`, {
                method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(buildFcmMessage({ token, payload, opts })), signal: AbortSignal.timeout(timeout),
            });
            if (r.status === 401) cached = null; // belirteç geçersiz: sonraki denemede yenilenir (geçici sayılır)
            if (r.status < 200 || r.status >= 300) throw fail(r.status === 401 ? 503 : r.status, `FCM ${r.status}`);
            return { statusCode: r.status };
        },
    };
}
