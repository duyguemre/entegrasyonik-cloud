// ADR-0026 Karar 4.9: impersonation bileti. 32 bayt rastgele, Redis'te `imp:<sha256(bilet)>` NX EX 60 (tek kullanimlik, 60 sn),
// tuketim `GETDEL` (atomik: iki es zamanli istek ayni bileti kullanamaz). Bilet dogrudan Redis'e YAZILMAZ (yalniz ozeti);
// bir Redis dokumu bileti ele gecirmeye yetmez. Redis hazir degilse bilet URETILMEZ (reddedilir; bellek ici yedek YOK -- tek
// kullanimlik garantisi cok-pod'da yalniz Redis ile saglanir).
import crypto from 'crypto';
import { ApplicationError } from '@platform/core/security/Security';
import { RedisService } from '@services/redis';

export const IMPERSONATION_TICKET_TTL_SECONDS = 60;
// K41 (2026-10-01): 60 dk -> 30 dk, UZATILMAZ. Tek kaynak (oturum claim'i, çerez ömrü, yanıttaki expiresAt buradan türer).
export const IMPERSONATION_SESSION_MINUTES = 30;
export const IMPERSONATION_SESSION_SECONDS = IMPERSONATION_SESSION_MINUTES * 60;
const KEY_PREFIX = 'imp:';
const TICKET_RE = /^[A-Za-z0-9_-]{43}$/;

export interface ImpersonationPayload {
    /** Bileti isteyen platform yoneticisi (Users._id). */
    sub: string;
    /** Hedef tenant (Clients.order). */
    tid: number;
    /** Bilet aninda yoneticinin tokenVersion'i (kullanimda yeniden dogrulanir). */
    tv: number;
    /** Gerekce (ticket no vb.; audit'e de yazilir). */
    reason: string;
    at: number;
}

/** ioredis'in kullanilan alt kumesi (testte sahte uygulanir). */
export interface TicketRedis {
    set(key: string, value: string, ex: 'EX', seconds: number, nx: 'NX'): Promise<'OK' | null>;
    getdel?(key: string): Promise<string | null>;
    eval?(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

const GETDEL_LUA = 'local v=redis.call("GET",KEYS[1]); if v then redis.call("DEL",KEYS[1]) end; return v';

export const hashTicket = (ticket: string) => crypto.createHash('sha256').update(ticket).digest('hex');

export type RedisProvider = () => TicketRedis | undefined;

export async function issueImpersonationTicket(redis: TicketRedis | undefined, payload: Omit<ImpersonationPayload, 'at'>, nowMs: number = Date.now()): Promise<string> {
    if (!redis) throw new ApplicationError('Impersonation şu an kullanılamıyor (önbellek servisi hazır değil).', 503, 'IMPERSONATION_UNAVAILABLE');
    const ticket = crypto.randomBytes(32).toString('base64url');
    const value = JSON.stringify({ ...payload, at: nowMs } satisfies ImpersonationPayload);
    const ok = await redis.set(KEY_PREFIX + hashTicket(ticket), value, 'EX', IMPERSONATION_TICKET_TTL_SECONDS, 'NX');
    if (ok !== 'OK') throw new ApplicationError('Bilet üretilemedi.', 500);
    return ticket;
}

/** Bileti TUKETIR (tek kullanim). Gecersiz/suresi dolmus/kullanilmis/Redis yok -> undefined. */
export async function redeemImpersonationTicket(redis: TicketRedis | undefined, ticket: unknown): Promise<ImpersonationPayload | undefined> {
    if (!redis || typeof ticket !== 'string' || !TICKET_RE.test(ticket)) return undefined;
    const key = KEY_PREFIX + hashTicket(ticket);
    let raw: unknown;
    if (typeof redis.getdel === 'function') raw = await redis.getdel(key);
    else if (typeof redis.eval === 'function') raw = await redis.eval(GETDEL_LUA, 1, key);
    else return undefined;
    if (typeof raw !== 'string') return undefined;
    try {
        const p = JSON.parse(raw);
        if (typeof p?.sub !== 'string' || !Number.isInteger(p?.tid) || typeof p?.tv !== 'number' || typeof p?.reason !== 'string') return undefined;
        return p as ImpersonationPayload;
    } catch {
        return undefined;
    }
}

/** Varsayilan Redis saglayici: yalniz baglanti HAZIRSA (ioredis `status==='ready'`); degilse undefined (bilet uretilmez/tuketilmez). */
export const defaultTicketRedis: RedisProvider = () => (RedisService.isReady() ? (RedisService.getInstance() as unknown as TicketRedis) : undefined);
