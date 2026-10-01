/**
 * ADR-0029 NB6: GET /api/notifications/stream (SSE zili). Gercek Express + loopback (ephemeral port); DB/Redis YOK.
 * Kimlik `authenticate` yerine test middleware'i ile kurulur (authenticate ayrica kendi testlerinde kanitli); burada kanitlanan:
 * acik rota DEGIL (yetkisiz 401), basliklar, tenant+kullanici suzmesi, PII yok, tavan 503, origin 403, kapanista shutdown.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import http from 'http';
import express from 'express';

jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));

import { configureNotificationStreamRoutes } from '@api/http/notificationStream';
import { isOpenRoute } from '@api/http/authenticate';
import { StreamHub, LocalRealtimeBus } from '@platform/runtime/realtime';

let server: http.Server; let port: number; let hub: StreamHub; let bus: LocalRealtimeBus;
const open: http.ClientRequest[] = [];

function start(hubOpts: Partial<ConstructorParameters<typeof StreamHub>[0]> = {}, enabled = true) {
    bus = new LocalRealtimeBus();
    hub = new StreamHub({ bus, unreadCount: async () => 4, ...hubOpts });
    const app = express();
    // authenticate benzeri: yalniz test basligi -> res.locals.principal; yoksa 401 (varsayilan ret)
    app.use((req, res, next) => {
        const raw = req.headers['x-test-principal'];
        if (typeof raw !== 'string') { res.status(401).send({ error: 'Token not verified' }); return; }
        res.locals.principal = JSON.parse(raw); next();
    });
    configureNotificationStreamRoutes(app, '/api', { hub: () => hub, allowedOrigins: ['https://app.example.test'], enabled: () => enabled });
    return new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => { port = (server.address() as any).port; resolve(); }); });
}

interface Client { status: number; headers: http.IncomingHttpHeaders; body: () => string; wait(pred: (b: string) => boolean, ms?: number): Promise<void>; req: http.ClientRequest; ended: () => boolean }
function connect(principal: object | undefined, headers: Record<string, string> = {}): Promise<Client> {
    return new Promise((resolve, reject) => {
        const h: Record<string, string> = { ...headers };
        if (principal) h['x-test-principal'] = JSON.stringify(principal);
        const req = http.get({ host: '127.0.0.1', port, path: '/api/notifications/stream', headers: h }, (res) => {
            let buf = ''; let ended = false;
            res.setEncoding('utf8'); res.on('data', (c) => { buf += c; }); res.on('end', () => { ended = true; });
            const c: Client = {
                status: res.statusCode!, headers: res.headers, body: () => buf, req, ended: () => ended,
                wait: (pred, ms = 2000) => new Promise((ok, ko) => {
                    const t0 = Date.now();
                    const iv = setInterval(() => { if (pred(buf)) { clearInterval(iv); ok(); } else if (Date.now() - t0 > ms) { clearInterval(iv); ko(new Error('timeout: ' + buf)); } }, 10);
                }),
            };
            resolve(c);
        });
        req.on('error', reject); open.push(req);
    });
}
const P = (sub: string, tid = 1, extra: object = {}) => ({ sub, tid, tv: 0, ga: false, imp: false, exp: Math.floor(Date.now() / 1000) + 3600, ...extra });
const evt = (tid: number, userIds: string[], id = 'E1') => ({ tid, userIds, kind: 'notification' as const, id, meta: { category: 'security', severity: 'warning' } });

beforeEach(async () => { await start(); });
afterEach(async () => { open.splice(0).forEach((r) => r.destroy()); await hub.close(); await new Promise((r) => server.close(r)); });

describe('GET /api/notifications/stream', () => {
    it('acik rota degildir; kimliksiz istek 401', async () => {
        expect(isOpenRoute('GET', 'notifications/stream')).toBe(false);
        const c = await connect(undefined);
        expect(c.status).toBe(401);
    });

    it('tenant baglami olmayan oturum 403', async () => {
        const c = await connect({ sub: 'admin', ga: true, tv: 0, imp: false });
        expect(c.status).toBe(403);
    });

    it('basliklar: event-stream, no-cache/no-transform, buffering kapali; retry + ilk yorum', async () => {
        const c = await connect(P('u1'));
        expect(c.status).toBe(200);
        expect(c.headers['content-type']).toContain('text/event-stream');
        expect(c.headers['cache-control']).toBe('no-cache, no-transform');
        expect(c.headers['x-accel-buffering']).toBe('no');
        await c.wait((b) => b.includes('retry: 5000'));
    });

    it('yalniz kendi tenant+kullanicisinin olayini alir; yuk PII icermez', async () => {
        const mine = await connect(P('u1', 1)); const other = await connect(P('u2', 1)); const otherTenant = await connect(P('u1', 2));
        await mine.wait((b) => b.includes(': connected'));
        await bus.publish({ ...evt(1, ['u1']), title: 'Gizli', body: 'ali@example.com' } as any);
        await mine.wait((b) => b.includes('event: notification'));
        await new Promise((r) => setTimeout(r, 50));
        expect(mine.body()).toContain('data: {"id":"E1","category":"security","severity":"warning","unreadCount":4}');
        expect(mine.body()).not.toMatch(/Gizli|ali@/);
        expect(other.body()).not.toContain('event: notification');
        expect(otherTenant.body()).not.toContain('event: notification');
    });

    it('Last-Event-ID ile gelen yeniden baglanti: gecersiz kimlik resync ile karsilanir', async () => {
        const c = await connect(P('u1'), { 'Last-Event-ID': 'garbage' });
        await c.wait((b) => b.includes('event: resync'));
    });

    it('yanlis Origin 403; izinli Origin ve Origin yok kabul', async () => {
        expect((await connect(P('u1'), { Origin: 'https://evil.example' })).status).toBe(403);
        expect((await connect(P('u1'), { Origin: 'https://app.example.test' })).status).toBe(200);
    });

    it('impersonation oturumu baglanabilir (salt okunur akis)', async () => {
        const c = await connect(P('admin', 1, { ga: true, imp: true }));
        expect(c.status).toBe(200);
    });

    it('kullanici baglanti tavani asilinca 503 + Retry-After', async () => {
        await hub.close(); await new Promise((r) => server.close(r));
        await start({ maxPerUser: 1 });
        const a = await connect(P('u1'));
        expect(a.status).toBe(200);
        const b = await connect(P('u1'));
        expect(b.status).toBe(503);
        expect(b.headers['retry-after']).toBe('30');
        expect(hub.stats().dropped).toBe(1);
    });

    it('kapanista event: shutdown alir ve akis kapanir', async () => {
        const c = await connect(P('u1'));
        await c.wait((b) => b.includes(': connected'));
        await hub.close();
        await c.wait((b) => b.includes('event: shutdown'));
        await c.wait(() => c.ended());
    });

    it('istemci kopunca baglanti kaydi temizlenir', async () => {
        const c = await connect(P('u1'));
        await c.wait((b) => b.includes(': connected'));
        expect(hub.stats().active).toBe(1);
        c.req.destroy();
        await new Promise<void>((ok) => { const iv = setInterval(() => { if (hub.stats().active === 0) { clearInterval(iv); ok(); } }, 10); });
    });

    it('NOTIFY_STREAM_ENABLED=false -> 503', async () => {
        await hub.close(); await new Promise((r) => server.close(r));
        await start({}, false);
        expect((await connect(P('u1'))).status).toBe(503);
    });
});

describe('NB2 baglantisi: createNotifierDeps.publish -> RealtimeBus', () => {
    it('notify olayi bus uzerinden abone tenant kanalina gider', async () => {
        const { createNotifierDeps } = (require('@operations/notifications/createNotifier') as typeof import('@operations/notifications/createNotifier'));
        const { setRealtimeBusForTests } = (require('@platform/runtime/realtime') as typeof import('@platform/runtime/realtime'));
        const b = new LocalRealtimeBus(); setRealtimeBusForTests(b);
        const h = jest.fn(); b.subscribe(9, h as any);
        await createNotifierDeps().publish!({ tid: 9, userIds: ['u1'], kind: 'notification', id: 'E', meta: { category: 'c', severity: 's' } });
        expect(h).toHaveBeenCalledTimes(1);
        setRealtimeBusForTests(undefined);
    });
});
