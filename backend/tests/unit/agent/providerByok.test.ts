/**
 * BR-5: BYOK kurulum uclari + KVKK sahip onayi + kullanim sayaci + anahtar sizintisi. Gercek Express + loopback; DB/Redis/AG YOK
 * (sahte ayar deposu, MemoryKv, sahte dogrulama/fetch). Kimlik `authenticate` yerine test middleware'i (agentRoutes.test ile ayni desen).
 */
import { describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import http from 'http';
import express from 'express';
import { configureAgentRoutes } from '../../../src/api/http/agentRoutes';
import { createOriginCheckMiddleware } from '../../../src/api/http/originCheck';
import { errorHandler, notFoundHandler } from '../../../src/api/http/errorEnvelope';
import { AgentBroker } from '../../../src/operations/agent/AgentBroker';
import { MemoryKv } from '../../../src/operations/agent/kv';
import { CONSENT_TEXT_VERSION, ProviderService, type AgentSettingsStore, type StoredAgentSettings } from '../../../src/operations/agent/providerSettings';
import { meterProvider, readUsage } from '../../../src/operations/agent/providerUsage';
import { ProviderStatusSchema, ProviderTestResultSchema, AgentInfoSchema } from '../../../src/operations/agent/protocol/v1';
import { AuditLogger } from '../../../src/services/audit/AuditLogger';
import { setLogSink } from '../../../src/platform/core/logger';
import { sanitizeResponse } from '../../../src/platform/core/security/responseSanitizer';
import { ROLE_PERMISSIONS, type Role } from '../../../src/capabilities/roles';
import { metricsRegistry } from '../../../src/platform/runtime/metrics';
import { LlmError, type LlmEvent, type LlmProvider } from '../../../src/platform/llm';
import { decryptField, encryptField } from '../../../src/utils/FieldCrypto';
import SettingService from '../../../src/api/rpc/handlers/setting-service';

const KEY_A = 'sk-ant-TENANT-A-SECRET-111111';
const KEY_B = 'sk-ant-TENANT-B-SECRET-222222';

/** Tenant basina bellek ici ayar deposu. */
class MemStore implements AgentSettingsStore {
    docs = new Map<number, StoredAgentSettings>();
    writes: Array<{ tid: number; set?: Record<string, unknown>; unset?: string[] }> = [];
    async read(tid: number) { const d = this.docs.get(tid); return d ? JSON.parse(JSON.stringify(d)) : undefined; }
    async patch(tid: number, p: { set?: Record<string, unknown>; unset?: string[] }) {
        this.writes.push({ tid, ...p });
        const d: any = this.docs.get(tid) ?? {};
        for (const [k, v] of Object.entries(p.set ?? {})) d[k] = v;
        for (const k of p.unset ?? []) delete d[k];
        this.docs.set(tid, d);
    }
}

let server: http.Server; let port: number; let store: MemStore; let kv: MemoryKv; let svc: ProviderService; let broker: AgentBroker;
let verifyCalls: Array<{ provider: string; model: string; apiKey: string }>;
let verifyResult: () => Promise<void>;
let maintenance = false;
const audit: any[] = [];
const logs: any[] = [];
const bodies: string[] = []; // her yanit govdesi (sizinti taramasi)
let now = Date.parse('2026-10-01T10:00:00Z');

const okVerify = async () => undefined;

async function start() {
    store = new MemStore(); kv = new MemoryKv(() => now); verifyCalls = []; verifyResult = okVerify; maintenance = false;
    svc = new ProviderService({
        store, kv: () => kv, now: () => now, testsPerMinute: 5,
        verify: async (provider, cred) => { verifyCalls.push({ provider, model: cred.model, apiKey: cred.apiKey }); await verifyResult(); },
    });
    broker = new AgentBroker({
        kv: () => kv, isEnabled: () => true, isMaintenance: () => maintenance,
        resolveProvider: async (tid) => {
            const s = await svc.resolveState(tid);
            if (s.state !== 'ready') return null;
            const p: LlmProvider = { id: 'fake', async *stream() { yield { type: 'text-delta', text: 'selam' } as LlmEvent; yield { type: 'done', reason: 'stop' } as LlmEvent; } };
            return { provider: p, providerId: s.provider, model: s.model };
        },
        setupState: async (tid) => { const s = await svc.resolveState(tid); return s.state === 'ready' ? { configured: true, consentRequired: false, provider: s.provider, model: s.model } : { configured: s.configured, consentRequired: s.consentRequired, ...(s.provider ? { provider: s.provider } : {}), ...(s.model ? { model: s.model } : {}) }; },
    });
    const app = express();
    app.use(express.json());
    app.use(createOriginCheckMiddleware(['https://app.example.test']));
    app.use((req, res, next) => {
        const raw = req.headers['x-test-principal'];
        if (typeof raw !== 'string') { res.status(401).send({ error: 'Token not verified' }); return; }
        const p = JSON.parse(raw) as { sub: string; tid?: number; role?: Role; imp?: boolean };
        res.locals.principal = { sub: p.sub, tid: p.tid, imp: p.imp };
        const role = p.role ?? 'operator';
        res.locals.actor = { sub: p.sub, tid: p.tid, role, permissions: ROLE_PERMISSIONS[role], actorType: 'user' };
        next();
    });
    configureAgentRoutes(app, '/api', { broker: () => broker, providers: () => svc, isMaintenance: () => maintenance });
    app.use(notFoundHandler);
    app.use(errorHandler);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => { port = (server.address() as any).port; resolve(); }); });
}

interface Res { status: number; headers: http.IncomingHttpHeaders; text: string; json(): any }
const P = (role: Role, sub = `${role}-1`, tid = 1, extra: object = {}) => JSON.stringify({ sub, tid, role, ...extra });
function call(method: string, path: string, principal: string | undefined, body?: unknown): Promise<Res> {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? undefined : JSON.stringify(body);
        const h: Record<string, string> = {};
        if (principal) h['x-test-principal'] = principal;
        if (payload) { h['content-type'] = 'application/json'; h['content-length'] = String(Buffer.byteLength(payload)); }
        const req = http.request({ host: '127.0.0.1', port, path, method, headers: h }, (res) => {
            let buf = ''; res.setEncoding('utf8'); res.on('data', (c) => { buf += c; });
            res.on('end', () => { bodies.push(buf); resolve({ status: res.statusCode!, headers: res.headers, text: buf, json: () => JSON.parse(buf) }); });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}
const save = (principal: string | undefined, over: object = {}) => call('PUT', '/api/agent/provider', principal, { v: 1, provider: 'anthropic', model: 'claude-sonnet-4-5', apiKey: KEY_A, ...over });
const consentBody = (decision: 'accept' | 'revoke' = 'accept', textVersion = CONSENT_TEXT_VERSION) => ({ v: 1, decision, textVersion });
const turn = (principal: string) => call('POST', '/api/agent/turns', principal, { v: 1, conversationId: null, clientTurnId: '00000000-0000-4000-8000-000000000001', locale: 'tr', input: { kind: 'text', text: 'selam' } });

beforeEach(async () => {
    audit.length = 0; logs.length = 0; bodies.length = 0;
    AuditLogger.setSink(async (r) => { audit.push(r); });
    setLogSink((r) => logs.push({ msg: r.msg, fields: r.fields, bindings: r.bindings }));
    await start();
});
afterEach(async () => {
    AuditLogger.setSink(undefined); setLogSink(undefined);
    svc.stop(); broker.stop();
    await new Promise((r) => server.close(r));
});

describe('yetki: yalniz settings:manage; consent yalniz SAHIP; impersonation YASAK', () => {
    it('kimliksiz 401; operator (settings:manage yok) her uc 403', async () => {
        expect((await call('GET', '/api/agent/provider', undefined)).status).toBe(401);
        const op = P('operator');
        expect((await call('GET', '/api/agent/provider', op)).status).toBe(403);
        expect((await save(op)).status).toBe(403);
        expect((await call('POST', '/api/agent/provider/test', op, { v: 1, provider: 'anthropic', model: 'claude-sonnet-4-5', apiKey: KEY_A })).status).toBe(403);
        expect((await call('DELETE', '/api/agent/provider', op)).status).toBe(403);
        expect((await call('POST', '/api/agent/provider/consent', op, consentBody())).status).toBe(403);
        expect(verifyCalls).toHaveLength(0);
        expect(store.writes).toHaveLength(0);
    });
    it('admin: anahtari girer/gorur/siler; onay VEREMEZ (consent ucu 403, PUT icindeki consent alani 403, hicbir sey yazilmaz)', async () => {
        const admin = P('admin');
        const r = await save(admin);
        expect(r.status).toBe(200);
        expect(r.json()).toMatchObject({ configured: true, canConfigure: true, canConsent: false, consentRequired: true, provider: 'anthropic', apiKey: 'sensitive' });
        const c = await call('POST', '/api/agent/provider/consent', admin, consentBody());
        expect(c.status).toBe(403);
        expect(c.json().code).toBe('FORBIDDEN');
        const before = store.writes.length;
        const sneaky = await save(admin, { consent: { textVersion: CONSENT_TEXT_VERSION, accepted: true } });
        expect(sneaky.status).toBe(403);
        expect(store.writes.length).toBe(before);
        expect((await store.read(1))?.transferConsent).toBeUndefined();
        expect((await call('DELETE', '/api/agent/provider', admin)).status).toBe(204);
        expect((await store.read(1))?.apiKey).toBeUndefined();
    });
    it('owner onay verir/geri alir; status `consent` alani', async () => {
        const owner = P('owner');
        await save(owner);
        const c = await call('POST', '/api/agent/provider/consent', owner, consentBody());
        expect(c.status).toBe(200);
        expect(c.json()).toMatchObject({ consentRequired: false, canConsent: true, consent: { byRole: 'owner', textVersion: CONSENT_TEXT_VERSION } });
        const rev = await call('POST', '/api/agent/provider/consent', owner, consentBody('revoke'));
        expect(rev.json()).toMatchObject({ consentRequired: true });
        expect(rev.json().consent).toBeUndefined();
    });
    it('owner PUT ile anahtar + onayi birlikte verir', async () => {
        const r = await save(P('owner'), { consent: { textVersion: CONSENT_TEXT_VERSION, accepted: true } });
        expect(r.status).toBe(200);
        expect(r.json()).toMatchObject({ configured: true, consentRequired: false });
    });
    it('IMPERSONATION (destek oturumu): sahip bile olsa TUM provider uclari 403 IMPERSONATION_FORBIDDEN; hicbir sey yazilmaz/test edilmez', async () => {
        const imp = P('owner', 'support-1', 1, { imp: true });
        const calls = [
            await call('GET', '/api/agent/provider', imp),
            await save(imp),
            await call('POST', '/api/agent/provider/test', imp, { v: 1, provider: 'anthropic', model: 'claude-sonnet-4-5', apiKey: KEY_A }),
            await call('DELETE', '/api/agent/provider', imp),
            await call('POST', '/api/agent/provider/consent', imp, consentBody()),
        ];
        for (const c of calls) { expect(c.status).toBe(403); expect(c.json().code).toBe('IMPERSONATION_FORBIDDEN'); }
        expect(verifyCalls).toHaveLength(0);
        expect(store.writes).toHaveLength(0);
        expect(audit).toHaveLength(0);
    });
    it('gecersiz govde/surum 400; bilinmeyen alan reddedilir; izinli listede olmayan model 400', async () => {
        const admin = P('admin');
        expect((await save(admin, { v: 2 })).json().code).toBe('PROTOCOL');
        expect((await save(admin, { extra: 1 })).status).toBe(400);
        expect((await save(admin, { provider: 'evil' })).status).toBe(400);
        expect((await save(admin, { model: 'gpt-4.1' })).status).toBe(400); // baska saglayicinin modeli
        expect((await save(admin, { model: '../../x' })).status).toBe(400);
        expect((await save(admin, { apiKey: 'bos luk\nenjeksiyon' })).status).toBe(400); // baslik enjeksiyonu
        expect(verifyCalls).toHaveLength(0);
    });
});

describe('kaydet = once TEST; saklama; test ucu', () => {
    it('basarisiz test KAYDETMEZ ve 422 ProviderTestResult doner (sinif + mesaj; anahtar yok)', async () => {
        verifyResult = async () => { throw new LlmError('LLM_KEY_INVALID'); };
        const r = await save(P('admin'));
        expect(r.status).toBe(422);
        expect(ProviderTestResultSchema.parse(r.json())).toMatchObject({ ok: false, code: 'LLM_KEY_INVALID' });
        expect(store.writes).toHaveLength(0);
        expect(audit).toHaveLength(0);
        verifyResult = async () => { throw new LlmError('LLM_RATE_LIMITED', { retryAfterSec: 9 }); };
        expect((await save(P('admin'))).json()).toMatchObject({ code: 'LLM_RATE_LIMITED', retryAfterSec: 9 });
    });
    it('basarida anahtar enc:v1 SIFRELI saklanir (cozulunce ayni; duz metin DB belgesinde yok); denetim yalniz saglayici/model', async () => {
        const r = await save(P('admin'));
        expect(r.status).toBe(200);
        const doc = await store.read(1);
        expect(doc?.apiKey?.startsWith('enc:v1:')).toBe(true);
        expect(JSON.stringify(doc)).not.toContain(KEY_A);
        expect(decryptField(doc!.apiKey!)).toBe(KEY_A);
        expect(doc).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-4-5', lastTest: { ok: true } });
        const ev = audit.find((a) => a.event === 'agent.provider.saved');
        expect(ev).toMatchObject({ result: 'ok', sub: 'admin-1', tid: 1, surface: 'chat', meta: { provider: 'anthropic', model: 'claude-sonnet-4-5', replaced: true } });
        expect(verifyCalls).toEqual([{ provider: 'anthropic', model: 'claude-sonnet-4-5', apiKey: KEY_A }]);
    });
    it('anahtarsiz PUT: ayni saglayicida kayitli anahtar yeniden kullanilir (model degisimi); saglayici degisirse anahtar GEREKLI', async () => {
        await save(P('admin'));
        verifyCalls.length = 0;
        const r = await save(P('admin'), { apiKey: undefined, model: 'claude-haiku-4-5' });
        expect(r.status).toBe(200);
        expect(verifyCalls[0]).toMatchObject({ model: 'claude-haiku-4-5', apiKey: KEY_A });
        expect((await store.read(1))?.model).toBe('claude-haiku-4-5');
        expect(store.writes[store.writes.length - 1].set?.apiKey).toBeUndefined(); // anahtar yeniden yazilmadi
        const sw = await save(P('admin'), { provider: 'openai', model: 'gpt-4.1', apiKey: undefined });
        expect(sw.status).toBe(400);
    });
    it('POST /test: ad-hoc anahtarla (kaydetmez) ve kayitli anahtarla (lastTest yazar); sonuc semasi; saglayici hatasi 200 ok:false', async () => {
        const admin = P('admin');
        const a = await call('POST', '/api/agent/provider/test', admin, { v: 1, provider: 'google', model: 'gemini-2.5-flash', apiKey: KEY_B });
        expect(a.status).toBe(200);
        expect(ProviderTestResultSchema.parse(a.json())).toMatchObject({ ok: true });
        expect(store.writes).toHaveLength(0);
        await save(admin);
        verifyResult = async () => { throw new LlmError('LLM_QUOTA'); };
        const b = await call('POST', '/api/agent/provider/test', admin, { v: 1, provider: 'anthropic', model: 'claude-sonnet-4-5' });
        expect(b.json()).toMatchObject({ ok: false, code: 'LLM_QUOTA' });
        expect((await store.read(1))?.lastTest).toMatchObject({ ok: false, code: 'LLM_QUOTA' });
        const st = await call('GET', '/api/agent/provider', admin);
        expect(ProviderStatusSchema.parse(st.json()).lastTest).toMatchObject({ ok: false, code: 'LLM_QUOTA' });
    });
    it('kullanici basina 5/dk: 6. test (ve kayit) 429 RATE_LIMITED + Retry-After', async () => {
        const admin = P('admin');
        for (let i = 0; i < 5; i++) expect((await call('POST', '/api/agent/provider/test', admin, { v: 1, provider: 'openai', model: 'gpt-4.1', apiKey: KEY_B })).status).toBe(200);
        const r = await call('POST', '/api/agent/provider/test', admin, { v: 1, provider: 'openai', model: 'gpt-4.1', apiKey: KEY_B });
        expect(r.status).toBe(429);
        expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
        expect((await save(admin)).status).toBe(429); // kayit da test calistirir: ayni kova
        expect((await call('POST', '/api/agent/provider/test', P('admin', 'admin-2'), { v: 1, provider: 'openai', model: 'gpt-4.1', apiKey: KEY_B })).status).toBe(200); // baska kullanici etkilenmez
    });
    it('bakim modunda kaydet/sil/onay 503 MAINTENANCE; durum okuma serbest', async () => {
        maintenance = true;
        expect((await save(P('admin'))).status).toBe(503);
        expect((await call('DELETE', '/api/agent/provider', P('admin'))).status).toBe(503);
        expect((await call('POST', '/api/agent/provider/consent', P('owner'), consentBody())).status).toBe(503);
        expect((await call('GET', '/api/agent/provider', P('admin'))).status).toBe(200);
    });
    it('GET: katalog (3 saglayici, izinli modeller) + onay metni surumu; kayit yokken configured:false', async () => {
        const r = ProviderStatusSchema.parse((await call('GET', '/api/agent/provider', P('admin'))).json());
        expect(r).toMatchObject({ configured: false, consentRequired: false, canConfigure: true });
        expect(r.apiKey).toBeUndefined();
        expect(r.catalog.map((c) => c.id).sort()).toEqual(['anthropic', 'google', 'openai']);
        expect(r.consentText.version).toBe(CONSENT_TEXT_VERSION);
        expect(r.usage).toMatchObject({ today: { requests: 0 }, month: { requests: 0 } });
    });
});

describe('K38: sahip onayi olmadan sohbet SETUP_REQUIRED', () => {
    it('anahtar var + onay yok: info SETUP_REQUIRED consentRequired:true, tur 403 SETUP_REQUIRED; onaydan sonra tur calisir; geri alinca yine kapanir', async () => {
        await save(P('admin'));
        const info = AgentInfoSchema.parse((await call('GET', '/api/agent/info', P('admin'))).json());
        expect(info).toMatchObject({ enabled: false, reason: 'SETUP_REQUIRED', setup: { configured: true, consentRequired: true, canConsent: false, provider: 'anthropic' } });
        const t = await turn(P('operator', 'op-1'));
        expect(t.status).toBe(403);
        expect(t.json().code).toBe('SETUP_REQUIRED');
        await call('POST', '/api/agent/provider/consent', P('owner'), consentBody());
        expect((await call('GET', '/api/agent/info', P('operator', 'op-1'))).json()).toMatchObject({ enabled: true, setup: { configured: true, consentRequired: false } });
        const ok = await turn(P('operator', 'op-1'));
        expect(ok.status).toBe(200);
        expect(ok.text).toContain('turn.end');
        await call('POST', '/api/agent/provider/consent', P('owner'), consentBody('revoke'));
        expect((await turn(P('operator', 'op-2'))).status).toBe(403);
    });
    it('eski/yanlis metin surumuyle onay reddedilir; sahipligi olan eski surum onayi gecersizdir (yeniden onay istenir)', async () => {
        await save(P('admin'));
        expect((await call('POST', '/api/agent/provider/consent', P('owner'), consentBody('accept', 'eski-surum'))).status).toBe(400);
        await store.patch(1, { set: { transferConsent: { at: new Date(), by: 'owner-1', byRole: 'owner', textVersion: 'tr-2026-09-eski' } } });
        svc.invalidate(1);
        expect((await call('GET', '/api/agent/provider', P('admin'))).json()).toMatchObject({ consentRequired: true });
        expect((await turn(P('operator'))).status).toBe(403);
    });
    it('onay denetime yazilir (given/revoked); metin yok', async () => {
        await save(P('admin'));
        await call('POST', '/api/agent/provider/consent', P('owner'), consentBody());
        await call('POST', '/api/agent/provider/consent', P('owner'), consentBody('revoke'));
        expect(audit.filter((a) => a.event.startsWith('agent.transfer_consent.')).map((a) => a.event)).toEqual(['agent.transfer_consent.given', 'agent.transfer_consent.revoked']);
        expect(audit.find((a) => a.event === 'agent.transfer_consent.given')).toMatchObject({ sub: 'owner-1', tid: 1, surface: 'chat' });
    });
});

describe('tenant izolasyonu', () => {
    it('tenant A anahtari tenant B turunda KULLANILMAZ; her tenant kendi anahtariyla cagirir', async () => {
        const fetched: Array<{ key: string }> = [];
        const fetchSpy = (async (_u: any, init: any) => { fetched.push({ key: init.headers['x-api-key'] }); return new Response('', { status: 500 }); }) as unknown as typeof fetch;
        svc = new ProviderService({ store, kv: () => kv, now: () => now, http: { fetch: fetchSpy }, verify: async () => undefined });
        await store.patch(1, { set: { provider: 'anthropic', model: 'claude-sonnet-4-5', apiKey: encryptField(KEY_A), transferConsent: { at: new Date(), by: 'o', byRole: 'owner', textVersion: CONSENT_TEXT_VERSION } } });
        await store.patch(2, { set: { provider: 'anthropic', model: 'claude-sonnet-4-5', apiKey: encryptField(KEY_B), transferConsent: { at: new Date(), by: 'o', byRole: 'owner', textVersion: CONSENT_TEXT_VERSION } } });
        await store.patch(3, { set: {} }); // tenant 3: anahtar yok
        const run = async (tid: number) => {
            const r = await svc.createProviderFor(tid);
            if (!r) return null;
            try { for await (const _ of r.provider.stream({ system: 's', messages: [{ role: 'user', content: 'x' }], tools: [], maxTokens: 10, signal: new AbortController().signal })) { /* hata bekleniyor */ } } catch { /* 500 -> LlmError */ }
            return true;
        };
        expect(await run(1)).toBe(true); expect(await run(2)).toBe(true); expect(await run(3)).toBeNull();
        expect(fetched).toEqual([{ key: KEY_A }, { key: KEY_B }]);
        // onbellek tid anahtarli: A icin yeniden cozum B'nin anahtarini dondurmez
        expect(await run(1)).toBe(true);
        expect(fetched[2]).toEqual({ key: KEY_A });
    });
    it('yazim/sil/onay yalniz oturumdaki tenant icin (govdede tenant alani yok); baska tenant etkilenmez', async () => {
        await save(P('admin', 'a1', 1));
        await save(P('admin', 'b1', 2), { apiKey: KEY_B });
        await call('DELETE', '/api/agent/provider', P('admin', 'a1', 1));
        expect((await store.read(1))?.apiKey).toBeUndefined();
        expect(decryptField((await store.read(2))!.apiKey!)).toBe(KEY_B);
        expect((await call('GET', '/api/agent/provider', P('admin', 'a1', 1))).json().configured).toBe(false);
        expect((await call('GET', '/api/agent/provider', P('admin', 'b1', 2))).json().configured).toBe(true);
    });
    it('onbellek 60 sn: kayit sonrasi aninda gecerli (invalidate); ayar disaridan degisirse 60 sn sonra gorulur', async () => {
        await save(P('owner'), { consent: { textVersion: CONSENT_TEXT_VERSION, accepted: true } });
        expect((await svc.resolveState(1)).state).toBe('ready');
        await store.patch(1, { unset: ['apiKey'] });
        expect((await svc.resolveState(1)).state).toBe('ready'); // onbellekte
        now += 61_000;
        expect((await svc.resolveState(1)).state).toBe('setup');
    });
});

describe('ANAHTAR SIZINTISI: yanit/log/denetim/metrik/Settings RPC', () => {
    it('tum uclarin yanitlari, denetim kayitlari ve loglar anahtari (ve sifreli degeri) ICERMEZ', async () => {
        verifyResult = async () => { throw new LlmError('LLM_KEY_INVALID'); };
        await save(P('admin'));
        verifyResult = okVerify;
        await save(P('owner'), { consent: { textVersion: CONSENT_TEXT_VERSION, accepted: true } });
        await call('POST', '/api/agent/provider/test', P('admin'), { v: 1, provider: 'anthropic', model: 'claude-sonnet-4-5', apiKey: KEY_B });
        await call('POST', '/api/agent/provider/test', P('admin'), { v: 1, provider: 'anthropic', model: 'claude-sonnet-4-5' });
        await call('GET', '/api/agent/provider', P('admin'));
        await call('GET', '/api/agent/info', P('admin'));
        await save(P('admin'), { apiKey: 'x' }); // gecersiz biçim -> 400
        await call('DELETE', '/api/agent/provider', P('admin'));
        const all = JSON.stringify({ bodies, audit, logs });
        for (const secret of [KEY_A, KEY_B, 'enc:v1:']) expect(all).not.toContain(secret);
        expect(bodies.length).toBeGreaterThan(5);
        expect(audit.length).toBeGreaterThan(2);
    });
    it('`apiKey` ciktida yalniz "sensitive"; sanitizeResponse saklanan sifreli belgeyi de sizdirmaz', async () => {
        await save(P('admin'));
        const st = (await call('GET', '/api/agent/provider', P('admin'))).json();
        expect(st.apiKey).toBe('sensitive');
        const doc = await store.read(1);
        const cleaned = sanitizeResponse({ settings: { agent: doc } }, { service: 'test' });
        expect(JSON.stringify(cleaned)).not.toContain('enc:v1:');
    });
    it('SettingService: `agent` alt nesnesi tenant ayar RPC\'lerinden OKUNMAZ ve YAZILAMAZ (sahte onay/anahtar enjeksiyonu)', async () => {
        const updates: any[] = [];
        const model = {
            findOne: () => ({ lean: async () => ({ docId: 1, storeName: 'x', agent: { apiKey: 'enc:v1:zzz', transferConsent: { textVersion: CONSENT_TEXT_VERSION } } }) }),
            findOneAndUpdate: (_q: any, u: any) => { updates.push(u); return { lean: async () => ({ docId: 1, storeName: 'x', agent: { apiKey: 'enc:v1:zzz' } }) }; },
        };
        const mk = (request: any) => { const s: any = new SettingService(1, request); s.clientDB = { getSettingModel: () => model }; return s; };
        const got = await mk({}).getSettings();
        expect(got.settings.agent).toBeUndefined();
        expect(got.settings.storeName).toBe('x');
        const res = await mk({ settings: { storeName: 'y', agent: { transferConsent: { textVersion: CONSENT_TEXT_VERSION, by: 'admin' }, apiKey: 'sahte' } } }).updateSettings();
        expect(updates[0].$set.agent).toBeUndefined();
        expect(updates[0].$set.storeName).toBe('y');
        expect(res.agent).toBeUndefined();
    });
});

describe('kullanim sayaci (yalniz bilgi) + metrik', () => {
    const provider = (events: LlmEvent[]): LlmProvider => ({ id: 'anthropic', async *stream() { for (const e of events) yield e; } });
    const drain = async (p: LlmProvider) => { for await (const _ of p.stream({ system: '', messages: [], tools: [], maxTokens: 1, signal: new AbortController().signal })) { /* tuket */ } };

    it('usage olaylari Redis/bellek sayaclarina (gun + ay) ve agent_tokens_total{surface,provider,kind} metrigine yazilir; olaylar aynen iletilir', async () => {
        metricsRegistry.drain();
        const p = meterProvider(provider([{ type: 'text-delta', text: 'a' }, { type: 'usage', in: 100, out: 40 }, { type: 'done', reason: 'stop' }]), { tid: 7, surface: 'chat', kv: () => kv, now: () => new Date(now) });
        const seen: string[] = [];
        for await (const e of p.stream({ system: '', messages: [], tools: [], maxTokens: 1, signal: new AbortController().signal })) seen.push(e.type);
        expect(seen).toEqual(['text-delta', 'usage', 'done']);
        await new Promise((r) => setTimeout(r, 5));
        await drain(meterProvider(provider([{ type: 'usage', in: 10, out: 5 }, { type: 'done', reason: 'stop' }]), { tid: 7, surface: 'chat', kv: () => kv, now: () => new Date(now) }));
        await new Promise((r) => setTimeout(r, 5));
        const u = await readUsage(kv, 7, new Date(now));
        expect(u.today).toEqual({ requests: 2, inputTokens: 110, outputTokens: 45 });
        expect(u.month).toEqual({ requests: 2, inputTokens: 110, outputTokens: 45 });
        const tok = metricsRegistry.drain().filter((x) => x.metric === 'agent_tokens_total').map((x) => `${x.labels.surface}/${x.labels.provider}/${x.labels.kind}=${x.count}`).sort();
        expect(tok).toEqual(['chat/anthropic/in=110', 'chat/anthropic/out=45']);
        expect(await readUsage(kv, 8, new Date(now))).toEqual({ today: { requests: 0, inputTokens: 0, outputTokens: 0 }, month: { requests: 0, inputTokens: 0, outputTokens: 0 } });
        expect(kv.keys().filter((k) => k.startsWith('agent:usage:7:20261001:')).sort()).toEqual(['agent:usage:7:20261001:in', 'agent:usage:7:20261001:out', 'agent:usage:7:20261001:req']);
    });
    it('ay toplami onceki gunleri kapsar; gecen ay dahil degil; status.usage doner', async () => {
        const meter = async (d: string, inT: number) => { now = Date.parse(d); await drain(meterProvider(provider([{ type: 'usage', in: inT, out: 1 }, { type: 'done', reason: 'stop' }]), { tid: 1, surface: 'chat', kv: () => kv, now: () => new Date(now) })); await new Promise((r) => setTimeout(r, 3)); };
        await meter('2026-09-30T10:00:00Z', 1000); // gecen ay
        await meter('2026-10-01T09:00:00Z', 10);
        now = Date.parse('2026-10-01T10:00:00Z');
        const owner = P('admin');
        const st = ProviderStatusSchema.parse((await call('GET', '/api/agent/provider', owner)).json());
        expect(st.usage?.today.inputTokens).toBe(10);
        expect(st.usage?.month.inputTokens).toBe(10);
    });
    it('metrikte tenant/kullanici etiketi YOK (dusuk kardinalite)', async () => {
        metricsRegistry.drain();
        await drain(meterProvider(provider([{ type: 'usage', in: 3, out: 2 }, { type: 'done', reason: 'stop' }]), { tid: 99, surface: 'chat', kv: () => kv }));
        const series = metricsRegistry.drain().filter((x) => x.metric === 'agent_tokens_total');
        expect(series).toHaveLength(2);
        for (const s of series) expect(Object.keys(s.labels).sort()).toEqual(['kind', 'provider', 'surface']);
    });
});

describe('K38: konusma metni kalici yazilmaz', () => {
    it('kurulum + tur sonrasi ayar deposuna yalniz ayar/onay alanlari yazilir (sohbet metni hicbir yazimda yok)', async () => {
        await save(P('owner'), { consent: { textVersion: CONSENT_TEXT_VERSION, accepted: true } });
        await turn(P('operator'));
        const written = JSON.stringify(store.writes);
        expect(written).not.toContain('selam');
        for (const w of store.writes) for (const k of [...Object.keys(w.set ?? {}), ...(w.unset ?? [])]) expect(['provider', 'model', 'apiKey', 'transferConsent', 'lastTest']).toContain(k);
        expect(audit.every((a) => a.event.startsWith('agent.provider.') || a.event.startsWith('agent.transfer_consent.') || a.event.startsWith('agent.'))).toBe(true);
        expect(JSON.stringify(audit)).not.toContain('selam');
    });
});
