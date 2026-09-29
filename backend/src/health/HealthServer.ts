import http from 'http';
import { checkReadiness, AppRole } from './HealthCheck';
import { RedisService } from '@services/redis';

/**
 * ADR-0006 Karar 3/5: `APP_ROLE=worker` iken tam Express API (Webserver) BAŞLAMAZ, ama konteyner
 * orkestrasyonunun (Railway/Render/ileride Kubernetes) canlılık/hazırlık kontrolü yapabilmesi için `worker`
 * rolünün de minimal, bağımsız bir HTTP sunucusu üzerinden `/health` ve `/ready` sunması gerekir (karar: EVET —
 * bkz. final rapor). Bu sunucu; auth, CORS, body-parser, statik dosya sunumu İÇERMEZ — sadece bu iki rota.
 */
export interface MinimalHealthServer {
    server: http.Server;
    close(): Promise<void>;
}

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}

export function startHealthOnlyServer(port: number, host: string, role: AppRole): MinimalHealthServer {
    const server = http.createServer(async (req, res) => {
        const url = (req.url || '').split('?')[0];

        if (req.method !== 'GET') {
            sendJson(res, 404, { error: 'not found' });
            return;
        }

        if (url === '/health') {
            sendJson(res, 200, { status: 'ok' });
            return;
        }

        if (url === '/ready') {
            try {
                const status = await checkReadiness(role, () => RedisService.getInstance());
                sendJson(res, status.ready ? 200 : 503, status);
            } catch {
                sendJson(res, 503, { ready: false, mongo: 'fail', redis: 'fail' });
            }
            return;
        }

        sendJson(res, 404, { error: 'not found' });
    });

    server.listen(port, host);

    return {
        server,
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
}
