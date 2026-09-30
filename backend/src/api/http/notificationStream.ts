// ADR-0029 Karar 6 (NB6): GET /api/notifications/stream -- gercek zamanli 'zil' (SSE). `authenticate`'ten SONRA baglanir
// (cerez oturumu; res.locals.principal). Yalniz KENDI tenant+userId kanali; yuk = {id, category, severity, unreadCount}
// (baslik/metin/PII YOK; veri RPC ile cekilir). Salt okunur: impersonation oturumu da baglanabilir, yazma islemi yoktur.
// Cloudflare arkasi (ADR-0027): buffering kapali (`X-Accel-Buffering: no`), `no-transform` (compression atlanir), 25 sn heartbeat.
import type { Express, Request, Response } from 'express';
import { config } from '@config';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { logger } from '@platform/core/logger';
import { metricsRegistry } from '@platform/runtime/metrics';
import { getRealtimeBus, StreamHub, type StreamSink } from '@platform/runtime/realtime';
import { buildUnreadFilter } from '@operations/notifications/inAppRepository';
import { isOriginAllowed } from '../originCheck';

const log = logger.child({ module: 'notifications.stream' });

export const STREAM_PATH = '/notifications/stream';

export interface StreamRouteDeps {
    hub(): StreamHub;
    /** CORS_ORIGINS listesi (mevcut /api ile ayni kural). */
    allowedOrigins: string[];
    enabled?(): boolean;
}


/** Uretim hub'i: bus + tenant DB sayimi + oturum yeniden dogrulamasi. */
export function createNotificationStreamHub(): StreamHub {
    return new StreamHub({
        bus: getRealtimeBus(),
        maxPerUser: config.notify.streamMaxPerUser,
        maxTotal: config.notify.streamMaxTotal,
        log,
        inc: (m, l) => metricsRegistry.incCounter(m, l),
        async unreadCount(tid, userId, imp) {
            if (imp) return 0; // destek oturumu: kendi belgesi yok (NotificationService ile ayni)
            const db = await DatabaseManagerInstance.getClientDB(tid);
            const model = db?.getNotificationModel();
            if (!model) return null;
            return model.countDocuments(buildUnreadFilter(userId) as any);
        },
        async revalidate({ sub, tid, tv }) {
            const app = await DatabaseManagerInstance.getApplicationDB();
            const u: any = await app.getUserModel().findById(sub, { tokenVersion: 1, isActive: 1, lockUntil: 1 }).lean();
            if (!u) return false;
            if ((Number.isInteger(u.tokenVersion) ? u.tokenVersion : 0) !== tv) return false;
            if (u.isActive === false) return false;
            if (u.lockUntil && new Date(u.lockUntil) > new Date()) return false;
            const t = await DatabaseManagerInstance.getTenant(tid);
            return !!t && t.status === 'ACTIVE';
        },
    });
}

let singleton: StreamHub | undefined;
export function getNotificationStreamHub(): StreamHub {
    if (!singleton) singleton = createNotificationStreamHub();
    return singleton;
}

/** bootstrap shutdown adimi: acik akislara `event: shutdown` + kapat (server.close() acik SSE'yi beklemesin). */
export async function closeNotificationStreams(): Promise<void> {
    const h = singleton; singleton = undefined;
    await h?.close();
}

export function configureNotificationStreamRoutes(app: Express, context: string, deps: StreamRouteDeps) {
    app.get(`${context.replace(/\/+$/, '')}${STREAM_PATH}`, (req: Request, res: Response) => {
        if (deps.enabled && !deps.enabled()) { res.status(503).json({ error: 'Stream disabled' }); return; }
        const principal = res.locals.principal as { sub?: string; tid?: number; tv?: number; imp?: boolean; exp?: number } | undefined;
        if (!principal || typeof principal.sub !== 'string') { res.status(401).json({ error: 'Token not verified' }); return; }
        if (typeof principal.tid !== 'number') { res.status(403).json({ error: 'Tenant required' }); return; }
        // GET'te genel originCheck calismaz (yalniz durum degistirenlerde); akis icin ayni listeyle burada uygulanir.
        if (!isOriginAllowed({ method: 'POST', headers: req.headers } as Request, deps.allowedOrigins)) { res.status(403).json({ error: 'Forbidden origin' }); return; }

        let started = false;
        const sink: StreamSink = {
            write(chunk) {
                if (!started) {
                    started = true;
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream; charset=utf-8',
                        'Cache-Control': 'no-cache, no-transform',
                        Connection: 'keep-alive',
                        'X-Accel-Buffering': 'no',
                    });
                }
                res.write(chunk);
                (res as unknown as { flush?: () => void }).flush?.();
            },
            end() { if (!started) { started = true; res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' }); } res.end(); },
        };
        const lastEventId = req.headers['last-event-id'];
        const r = deps.hub().accept({
            tid: principal.tid, userId: principal.sub, sub: principal.sub, tv: principal.tv ?? 0, imp: principal.imp === true,
            expSec: principal.exp, lastEventId: typeof lastEventId === 'string' ? lastEventId : undefined, sink,
        });
        if (!r.ok) {
            res.set('Retry-After', '30');
            res.status(503).json({ error: r.reason === 'user_cap' ? 'Too many streams for user' : r.reason === 'closed' ? 'Shutting down' : 'Server stream capacity reached' });
            return;
        }
        req.socket.setTimeout(0);
        req.socket.setNoDelay(true);
        req.socket.setKeepAlive(true);
        res.on('close', () => r.conn.close('client_closed'));
    });
}
