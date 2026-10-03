/**
 * BR-1: /api/agent/* uclari. Gercek Express + loopback (ephemeral port); DB/Redis YOK (MemoryKv). Kimlik `authenticate` yerine
 * test middleware'i ile kurulur (authenticate kendi testlerinde kanitli); burada: 401/403, info matrisi, govde dogrulamasi,
 * SSE basliklari/cerceveleme/nabiz/tamponsuzluk (compression ile), 409/429 kodlari, abort, tenant izolasyonu, DELETE.
 * (supertest projede yok; bildirim akis testiyle ayni http loopback deseni.)
 */
import { describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import http from 'http';
import express from 'express';
import compression from 'compression';
import { configureAgentRoutes } from '../../../src/api/http/agentRoutes';
import { createOriginCheckMiddleware } from '../../../src/api/originCheck';
import { errorHandler, notFoundHandler } from '../../../src/api/http/errorEnvelope';
import { AgentBroker, type ResolvedProvider } from '../../../src/operations/agent/AgentBroker';
import { MemoryKv } from '../../../src/operations/agent/kv';
import { ServerEventSchema, type ServerEvent } from '../../../src/operations/agent/protocol/v1';
import { ROLE_PERMISSIONS, type Role } from '../../../src/capabilities/roles';
import type { LlmEvent, LlmProvider, LlmStreamRequest } from '../../../src/platform/llm';

let server: http.Server; let port: number; let broker: AgentBroker; let kv: MemoryKv;
const open: http.ClientRequest[] = [];
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

class FnProvider implements LlmProvider {
    readonly id = 'fn';
    seen: LlmStreamRequest[] = [];
    constructor(private readonly fn: (req: LlmStreamRequest) => AsyncIterable<LlmEvent>) { }
    stream(req: LlmStreamRequest) { this.seen.push(req); return this.fn(req); }
}
const textProvider = (...parts: string[]) => new FnProvider(async function* () {
    for (const t of parts) yield { type: 'text-delta', text: t } as LlmEvent;
    yield { type: 'done', reason: 'stop' } as LlmEvent;
});

interface State { enabled: boolean; maintenance: boolean; provider: LlmProvider | null; turnsPerMinute: number }
let st: State;

async function start(heartbeatMs = 15_000) {
    kv = new MemoryKv();
    broker = new AgentBroker({
        kv: () => kv,
        isEnabled: () => st.enabled,
        isMaintenance: () => st.maintenance,
        resolveProvider: async (): Promise<ResolvedProvider | null> => (st.provider ? { provider: st.provider } : null),
        turnsPerMinute: st.turnsPerMinute,
    });
    const app = express();
    // gercek zincirin ilgili parcalari: compression (no-transform ile atlanmali), Origin denetimi (POST), JSON govde
    app.use(compression());
    app.use(express.json());
    app.use(createOriginCheckMiddleware(['https://app.example.test']));
    app.use((req, res, next) => {
        const raw = req.headers['x-test-principal'];
        if (typeof raw !== 'string') { res.status(401).send({ error: 'Token not verified' }); return; }
        const p = JSON.parse(raw) as { sub: string; tid?: number; role?: Role; imp?: boolean; noPerm?: boolean };
        res.locals.principal = { sub: p.sub, tid: p.tid, imp: p.imp };
        const role = p.role ?? 'operator';
        res.locals.actor = { sub: p.sub, tid: p.tid, role, permissions: p.noPerm ? new Set() : ROLE_PERMISSIONS[role], actorType: 'user' };
        next();
    });
    configureAgentRoutes(app, '/api', { broker: () => broker, heartbeatMs });
    app.use(notFoundHandler);
    app.use(errorHandler);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => { port = (server.address() as any).port; resolve(); }); });
}

interface Client {
    status: number; headers: http.IncomingHttpHeaders; body(): string; json(): any; events(): ServerEvent[];
    wait(pred: (b: string) => boolean, ms?: number): Promise<void>; req: http.ClientRequest; ended(): boolean; done(): Promise<void>;
}
const P = (sub: string, tid = 1, extra: object = {}) => JSON.stringify({ sub, tid, ...extra });
function call(method: string, path: string, principal: string | undefined, body?: unknown, headers: Record<string, string> = {}): Promise<Client> {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? undefined : JSON.stringify(body);
        const h: Record<string, string> = { ...headers };
        if (principal) h['x-test-principal'] = principal;
        if (payload) { h['content-type'] = 'application/json'; h['content-length'] = String(Buffer.byteLength(payload)); }
        const req = http.request({ host: '127.0.0.1', port, path, method, headers: h }, (res) => {
            let buf = ''; let ended = false; let finish!: () => void;
            const fin = new Promise<void>((r) => { finish = r; });
            res.setEncoding('utf8'); res.on('data', (c) => { buf += c; }); res.on('end', () => { ended = true; finish(); }); res.on('close', () => finish());
            const c: Client = {
                status: res.statusCode!, headers: res.headers, body: () => buf, req, ended: () => ended, done: () => fin,
                json: () => JSON.parse(buf),
                events: () => buf.split('\n\n').filter((b) => b.startsWith('event: ')).map((b) => JSON.parse(b.split('\n')[1].replace(/^data: /, ''))),
                wait: (pred, ms = 3000) => new Promise((ok, ko) => {
                    const t0 = Date.now();
                    const iv = setInterval(() => { if (pred(buf)) { clearInterval(iv); ok(); } else if (Date.now() - t0 > ms) { clearInterval(iv); ko(new Error('timeout: ' + buf)); } }, 5);
                }),
            };
            resolve(c);
        });
        req.on('error', reject); open.push(req);
        if (payload) req.write(payload);
        req.end();
    });
}
const turn = (text: string, extra: object = {}) => ({ v: 1, conversationId: null, clientTurnId: uuid(), locale: 'tr', input: { kind: 'text', text }, ...extra });
const postTurn = (principal: string | undefined, body: unknown) => call('POST', '/api/agent/turns', principal, body);

beforeEach(async () => { st = { enabled: true, maintenance: false, provider: textProvider('Merhaba', ' dünya'), turnsPerMinute: 10 }; });
afterEach(async () => {
    open.splice(0).forEach((r) => r.destroy());
    broker?.stop();
    await new Promise((r) => server.close(r));
});

describe('kimlik ve yetki', () => {
    beforeEach(() => start());
    it('kimliksiz istek 401 (her uc)', async () => {
        expect((await call('GET', '/api/agent/info', undefined)).status).toBe(401);
        expect((await call('POST', '/api/agent/turns', undefined, turn('a'))).status).toBe(401);
        expect((await call('DELETE', '/api/agent/conversations/c1', undefined)).status).toBe(401);
    });
    it('tenant baglami yoksa 403; app:use izni yoksa 403', async () => {
        const noTenant = await call('GET', '/api/agent/info', JSON.stringify({ sub: 'u1' }));
        expect(noTenant.status).toBe(403);
        const noPerm = await call('GET', '/api/agent/info', P('u1', 1, { noPerm: true }));
        expect(noPerm.status).toBe(403);
        expect(noPerm.json().code).toBe('FORBIDDEN');
    });
    it('durum degistiren istekte yabanci Origin reddedilir (mevcut originCheck)', async () => {
        const c = await postTurn(P('u1'), turn('a'));
        expect(c.status).toBe(200); // Origin yok -> izin
        const bad = await call('POST', '/api/agent/turns', P('u1'), turn('b'), { origin: 'https://evil.example.test' });
        expect(bad.status).toBe(403);
    });
});

describe('GET /api/agent/info', () => {
    beforeEach(() => start());
    it('enabled; yetki bayraklari role gore (operator: hicbiri, admin: canConfigure, owner: canConsent)', async () => {
        const op = (await call('GET', '/api/agent/info', P('u1', 1, { role: 'operator' }))).json();
        expect(op).toMatchObject({ v: 1, enabled: true, setup: { configured: true, canConfigure: false, canConsent: false }, readOnly: false });
        expect(op.limits).toEqual({ maxInputChars: 4000, turnsPerMinute: 10 });
        const admin = (await call('GET', '/api/agent/info', P('u2', 1, { role: 'admin' }))).json();
        expect(admin.setup).toMatchObject({ canConfigure: true, canConsent: false });
        const owner = (await call('GET', '/api/agent/info', P('u3', 1, { role: 'owner' }))).json();
        expect(owner.setup).toMatchObject({ canConfigure: true, canConsent: true });
    });
    it('impersonation oturumu: readOnly true, canConsent false', async () => {
        const i = (await call('GET', '/api/agent/info', P('u1', 1, { role: 'owner', imp: true }))).json();
        expect(i.readOnly).toBe(true);
        expect(i.setup.canConsent).toBe(false);
    });
    it('agent kapali -> enabled:false reason DISABLED; anahtarsiz tenant -> SETUP_REQUIRED; bakim -> enabled + salt-okunur (BR-3)', async () => {
        st.enabled = false;
        expect((await call('GET', '/api/agent/info', P('u1'))).json()).toMatchObject({ enabled: false, reason: 'DISABLED' });
        st.enabled = true; st.provider = null;
        expect((await call('GET', '/api/agent/info', P('u1', 1, { role: 'admin' }))).json()).toMatchObject({ enabled: false, reason: 'SETUP_REQUIRED', setup: { configured: false, canConfigure: true } });
        st.provider = textProvider('x'); st.maintenance = true;
        expect((await call('GET', '/api/agent/info', P('u1'))).json()).toMatchObject({ enabled: true, readOnly: true });
    });
    it('locale sorgusu onerileri dilde verir; onbellek yok (no-store)', async () => {
        const en = await call('GET', '/api/agent/info?locale=en', P('u1'));
        expect(en.headers['cache-control']).toBe('no-store');
        expect(en.json().suggestions[0].text).toMatch(/orders/i);
        expect((await call('GET', '/api/agent/info?locale=xx', P('u1'))).json().suggestions[0].text).toMatch(/sipariş/i);
    });
});

describe('POST /api/agent/turns -- SSE', () => {
    beforeEach(() => start(30));
    it('basliklar (ADR-0029 Karar 6), cerceveleme, olay sirasi ve sema', async () => {
        const c = await postTurn(P('u1'), turn('selam'));
        expect(c.status).toBe(200);
        expect(c.headers['content-type']).toContain('text/event-stream');
        expect(c.headers['cache-control']).toBe('no-cache, no-transform');
        expect(c.headers['x-accel-buffering']).toBe('no');
        expect(c.headers['content-encoding']).toBeUndefined(); // compression atlandi
        await c.done();
        const body = c.body();
        expect(body.startsWith(': open\n\n')).toBe(true);
        expect(body).toMatch(/event: turn\.start\ndata: \{/);
        const evs = c.events();
        expect(evs.map((e) => e.type)).toEqual(['turn.start', 'part', 'delta', 'delta', 'turn.end']);
        for (const e of evs) expect(ServerEventSchema.safeParse(e).success).toBe(true);
        expect(evs[evs.length - 1]).toMatchObject({ type: 'turn.end', status: 'completed' });
        // her data tek satir JSON
        for (const block of body.split('\n\n').filter((b) => b.startsWith('event:'))) expect(block.split('\n')).toHaveLength(2);
    });
    it('akis TAMPONLANMAZ: ilk olay saglayici bitmeden istemciye ulasir', async () => {
        let open!: () => void; const gate = new Promise<void>((r) => { open = r; });
        st.provider = new FnProvider(async function* () {
            yield { type: 'text-delta', text: 'ilk' } as LlmEvent;
            await gate;
            yield { type: 'text-delta', text: 'son' } as LlmEvent;
            yield { type: 'done', reason: 'stop' } as LlmEvent;
        });
        const c = await postTurn(P('u1'), turn('uzun'));
        await c.wait((b) => b.includes('"text":"ilk"'));
        expect(c.ended()).toBe(false);
        open();
        await c.done();
        expect(c.body()).toContain('"text":"son"');
    });
    it('nabiz: bekleme sirasinda ": ping" yorum satiri gelir', async () => {
        let open!: () => void; const gate = new Promise<void>((r) => { open = r; });
        st.provider = new FnProvider(async function* () { await gate; yield { type: 'done', reason: 'stop' } as LlmEvent; });
        const c = await postTurn(P('u1'), turn('bekle'));
        await c.wait((b) => b.includes(': ping\n\n'));
        open(); await c.done();
    });
    it('saglayici hatasi akista error olayi olarak gelir (HTTP 200 sonrasi), ham ayrinti yok', async () => {
        // eslint-disable-next-line require-yield
        st.provider = new FnProvider(async function* () { throw new Error('ham-saglayici-govdesi-sk-123'); });
        const c = await postTurn(P('u1'), turn('x'));
        await c.done();
        expect(c.events().map((e) => e.type)).toEqual(['turn.start', 'error']);
        expect(c.body()).not.toContain('sk-123');
    });
    it('istemci baglantiyi koparinca saglayici iptal edilir, konusma kaydedilmez, kilit serbest kalir', async () => {
        let providerSignal: AbortSignal | undefined;
        st.provider = new FnProvider(async function* (req) {
            providerSignal = req.signal;
            yield { type: 'text-delta', text: 'basladi' } as LlmEvent;
            await new Promise<void>((r) => req.signal.addEventListener('abort', () => r(), { once: true }));
        });
        const c = await postTurn(P('u1'), turn('kop', { conversationId: 'conv-abort' }));
        await c.wait((b) => b.includes('basladi'));
        c.req.destroy();
        const t0 = Date.now();
        while (!providerSignal?.aborted && Date.now() - t0 < 2000) await new Promise((r) => setTimeout(r, 10));
        expect(providerSignal?.aborted).toBe(true);
        await new Promise((r) => setTimeout(r, 30));
        expect(kv.keys().filter((k) => k.startsWith('agent:conv:'))).toEqual([]);
        st.provider = textProvider('tamam');
        const next = await postTurn(P('u1'), turn('sonra'));
        expect(next.status).toBe(200); // TURN_IN_PROGRESS degil
        await next.done();
    });
});

describe('POST /api/agent/turns -- dogrulama ve sinirlar', () => {
    beforeEach(() => start());
    it('400 VALIDATION: bos metin, >4000 karakter, fazla alan (tenant govdede kabul edilmez), bozuk kimlik; form girdisi', async () => {
        for (const bad of [
            turn(''), turn('a'.repeat(4001)), { ...turn('a'), tenant: 7 }, { ...turn('a'), clientTurnId: 'x' },
            turn('a', { conversationId: 'a:b' }), { ...turn('a'), input: { kind: 'form', formId: 'f', values: {} } },
        ]) {
            const c = await postTurn(P('u1'), bad);
            expect([c.status, c.json().code]).toEqual([400, 'VALIDATION']);
        }
    });
    it('400 PROTOCOL: farkli ana surum', async () => {
        const c = await postTurn(P('u1'), { ...turn('a'), v: 2 });
        expect([c.status, c.json().code]).toEqual([400, 'PROTOCOL']);
    });
    it('hata ictigi gövde degerini yansitmaz (yalniz alan yolu)', async () => {
        const c = await postTurn(P('u1'), { ...turn('a'), locale: 'sifre-degeri-123' });
        expect(c.status).toBe(400);
        expect(c.body()).not.toContain('sifre-degeri-123');
    });
    it('anahtarsiz tenant -> 403 SETUP_REQUIRED; kapali -> 503 UNAVAILABLE; bakimda tur ACIK (BR-3)', async () => {
        st.provider = null;
        expect([(await postTurn(P('u1'), turn('a'))).status]).toEqual([403]);
        expect((await postTurn(P('u1'), turn('a'))).json().code).toBe('SETUP_REQUIRED');
        st.provider = textProvider('x'); st.enabled = false;
        expect((await postTurn(P('u1'), turn('a'))).json().code).toBe('UNAVAILABLE');
        st.enabled = true; st.maintenance = true;
        const m = await postTurn(P('u1'), turn('a')); // bakimda okuma turu calisir (yazma yetenek duzeyinde kapali)
        expect(m.status).toBe(200);
        await m.done();
    });
    it('eszamanli 2. tur 409 TURN_IN_PROGRESS; ayni clientTurnId 409 TURN_DUPLICATE', async () => {
        let open!: () => void; const gate = new Promise<void>((r) => { open = r; });
        st.provider = new FnProvider(async function* () { await gate; yield { type: 'done', reason: 'stop' } as LlmEvent; });
        const first = await postTurn(P('u1'), turn('bir'));
        await first.wait((b) => b.includes('turn.start'));
        const second = await postTurn(P('u1'), turn('iki'));
        expect([second.status, second.json().code]).toEqual([409, 'TURN_IN_PROGRESS']);
        const other = await postTurn(P('u2'), turn('baska kullanici'));
        expect(other.status).toBe(200);
        open(); await first.done(); await other.done();
        st.provider = textProvider('ok');
        const dupBody = turn('dup');
        await (await postTurn(P('u1'), dupBody)).done();
        const dup = await postTurn(P('u1'), dupBody);
        expect([dup.status, dup.json().code]).toEqual([409, 'TURN_DUPLICATE']);
    });
    it('dakikada 10 tur -> 429 RATE_LIMITED + Retry-After', async () => {
        await broker.stop();
        st.turnsPerMinute = 2;
        await new Promise((r) => server.close(r));
        await start();
        for (let i = 0; i < 2; i++) await (await postTurn(P('u1'), turn('x' + i))).done();
        const c = await postTurn(P('u1'), turn('fazla'));
        expect([c.status, c.json().code]).toEqual([429, 'RATE_LIMITED']);
        expect(Number(c.headers['retry-after'])).toBeGreaterThan(0);
    });
});

describe('tenant izolasyonu ve konusma silme', () => {
    beforeEach(() => start());
    it('iki tenant ayni conversationId ile birbirinin gecmisini goremez; calisma bellegi anahtari tenant+kullanici kapsamli', async () => {
        const prov = textProvider('ok'); st.provider = prov;
        await (await postTurn(P('u1', 1), turn('tenant-1 gizli', { conversationId: 'ortak' }))).done();
        await (await postTurn(P('u1', 2), turn('tenant-2 soru', { conversationId: 'ortak' }))).done();
        await (await postTurn(P('u9', 1), turn('ayni tenant baska kullanici', { conversationId: 'ortak' }))).done();
        expect(prov.seen[1].messages).toEqual([{ role: 'user', content: 'tenant-2 soru' }]);
        expect(prov.seen[2].messages).toEqual([{ role: 'user', content: 'ayni tenant baska kullanici' }]);
        expect(kv.keys().filter((k) => k.startsWith('agent:conv:')).sort()).toEqual([
            'agent:conv:app:1:u1:ortak', 'agent:conv:app:1:u9:ortak', 'agent:conv:app:2:u1:ortak',
        ]);
    });
    it('DELETE /conversations/:id 204, yalniz kendi tenant+kullanicinin kaydini siler; gecersiz kimlik 400', async () => {
        st.provider = textProvider('ok');
        await (await postTurn(P('u1', 1), turn('a', { conversationId: 'c1' }))).done();
        await (await postTurn(P('u1', 2), turn('b', { conversationId: 'c1' }))).done();
        const del = await call('DELETE', '/api/agent/conversations/c1', P('u1', 1));
        expect(del.status).toBe(204);
        expect(kv.keys().filter((k) => k.startsWith('agent:conv:'))).toEqual(['agent:conv:app:2:u1:c1']);
        expect((await call('DELETE', '/api/agent/conversations/a%3Ab', P('u1', 1))).status).toBe(400);
    });
});
