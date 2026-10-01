// ADR-0017 Karar 1.8: `POST /client-log` -- istemci (frontend) hata raporlama ucu. Sözleşme, frontend
// `composables/logger.ts`'in `reportToServer()` TODO yorumundaki beklentiyle uyumludur (bkz. Karar 1.8 alan
// beyaz listesi): `{level, msg, errName, stack(<=30 satır), route (parametresiz), reqId, appVer, platform, ts}`.
// **AUTH'LU** (Karar 1.8: "Kimliksiz sayfalar (giriş) raporlamaz -- kötüye kullanım yüzeyi"); tenant/kullanıcı
// bağlamı SUNUCUDA (`res.locals.principal`) eklenir, istemciden ASLA alınmaz.
import type { Request, Response } from 'express';
import { redactFreeText, redactLogObject, fingerprintOf } from '@platform/core/logger';
import { recordErrorEvent } from '@platform/runtime/metrics';
import { getRequestId } from '@platform/core/context';
import { sendHttpError } from './errorEnvelope';

export const CLIENT_LOG_MAX_BODY_BYTES = 8 * 1024;
const ALLOWED_LEVELS = ['error', 'warn'] as const;
type ClientLogLevel = typeof ALLOWED_LEVELS[number];
const ALLOWED_PLATFORMS = ['web', 'electron'] as const;
const MAX_STRING_LEN = 2000;
const MAX_STACK_LINES = 30;

export interface ClientLogRequestBody {
    level: ClientLogLevel;
    msg: string;
    errName?: string;
    stack?: string;
    route?: string;
    reqId?: string;
    appVer?: string;
    platform?: typeof ALLOWED_PLATFORMS[number];
    ts?: string;
    /** Beyaz liste DIŞINDA serbest bağlam (küçük, redakte edilir). */
    context?: Record<string, unknown>;
}

function clampStr(v: unknown, max = MAX_STRING_LEN): string | undefined {
    return typeof v === 'string' ? v.slice(0, max) : undefined;
}

function clampStack(v: unknown): string | undefined {
    if (typeof v !== 'string') return undefined;
    const lines = v.split('\n').slice(0, MAX_STACK_LINES);
    return lines.join('\n').slice(0, MAX_STRING_LEN);
}

/** Gövde alan beyaz listesi + tip doğrulama (ADR-0017 Karar 1.8). Geçersiz -> `undefined` (çağıran 400 döner). */
export function parseClientLogBody(raw: unknown): ClientLogRequestBody | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const b = raw as Record<string, unknown>;
    if (b.level !== 'error' && b.level !== 'warn') return undefined;
    const msg = clampStr(b.msg);
    if (!msg) return undefined;
    const platform = b.platform === 'electron' ? 'electron' : 'web';
    return {
        level: b.level,
        msg,
        errName: clampStr(b.errName, 200),
        stack: clampStack(b.stack),
        route: clampStr(b.route, 200),
        reqId: clampStr(b.reqId, 100),
        appVer: clampStr(b.appVer, 50),
        platform,
        ts: clampStr(b.ts, 40),
        context: (b.context && typeof b.context === 'object') ? (b.context as Record<string, unknown>) : undefined,
    };
}

/** `Content-Length` VEYA (yoksa) JSON serileştirme boyutu 8 KB'ı aşıyor mu (ADR-0017 Karar 1.8). */
export function isBodyTooLarge(req: Request): boolean {
    const len = Number(req.headers['content-length']);
    if (Number.isFinite(len) && len > 0) return len > CLIENT_LOG_MAX_BODY_BYTES;
    try { return Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8') > CLIENT_LOG_MAX_BODY_BYTES; } catch { return false; }
}

/** İstemciden gelen `message`/`stack`/`context` içindeki olası sır desenlerini temizler (redaksiyon: ikinci savunma hattı, istemci de kendi tarafında redakte eder -- Karar 1.8). */
function sanitizeBody(body: ClientLogRequestBody): { message: string; stack?: string; context?: Record<string, unknown> } {
    return {
        message: redactFreeText(body.msg),
        stack: body.stack ? redactFreeText(body.stack) : undefined,
        context: body.context ? redactLogObject(body.context) : undefined,
    };
}

// ADR-0017 Karar 1.8 ("aynı parmak izi oturum başına 1 kez"): oturum (userSub) başına görülmüş fp kümesi.
// Bellek üst sınırı: en fazla `MAX_SESSIONS` oturum × `MAX_FP_PER_SESSION` fp (en eski oturum LRU atılır).
const MAX_SESSIONS = 5000;
const MAX_FP_PER_SESSION = 200;
const seenFingerprintsBySession = new Map<string, Set<string>>();

/** true => bu oturumda bu fp DAHA ÖNCE görüldü (bu çağrı Mongo'ya YAZILMAZ, yine de 204 döner). */
function alreadyReportedInSession(sessionKey: string, fp: string): boolean {
    let set = seenFingerprintsBySession.get(sessionKey);
    if (!set) {
        if (seenFingerprintsBySession.size >= MAX_SESSIONS) {
            const oldest = seenFingerprintsBySession.keys().next().value;
            if (oldest !== undefined) seenFingerprintsBySession.delete(oldest);
        }
        set = new Set();
        seenFingerprintsBySession.set(sessionKey, set);
    }
    if (set.has(fp)) return true;
    if (set.size < MAX_FP_PER_SESSION) set.add(fp);
    return false;
}

/** Yalnız testler için: oturum bazlı fp dedup durumunu sıfırlar. */
export function resetClientLogDedupForTests(): void {
    seenFingerprintsBySession.clear();
}

export function handleClientLog(req: Request, res: Response): void {
    if (isBodyTooLarge(req)) { sendHttpError(res, 413, 'İstek gövdesi çok büyük (8 KB üst sınırı).', 'PAYLOAD_TOO_LARGE'); return; }
    const parsed = parseClientLogBody(req.body);
    if (!parsed) { sendHttpError(res, 400, 'Geçersiz istek.', 'VALIDATION'); return; }

    const sanitized = sanitizeBody(parsed);
    const principal = (res.locals as any)?.principal;
    const tenantId: number | undefined = typeof principal?.tid === 'number' ? principal.tid : undefined;
    const sessionKey: string = typeof principal?.sub === 'string' ? principal.sub : 'anon';
    // ADR-0017 Karar 1.6: sunucudaki `X-Request-Id` (correlation) esas alınır; istemcinin kendi `reqId`'si yalnızca YOKSA yedek.
    const requestId = getRequestId() ?? parsed.reqId;

    const fp = `client::${fingerprintOf(parsed.platform, parsed.errName, sanitized.message)}`;
    if (!alreadyReportedInSession(sessionKey, fp)) {
        recordErrorEvent({
            source: 'client',
            module: parsed.platform,
            code: parsed.errName,
            message: sanitized.message,
            stack: sanitized.stack,
            tenantId,
            corrId: requestId,
            route: parsed.route,
            appVer: parsed.appVer,
        });
    }

    res.status(204).send();
}
