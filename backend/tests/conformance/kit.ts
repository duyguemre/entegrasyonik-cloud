// ADR-0033 Karar 3 (INT-03): parametrik adaptör conformance kiti. Bir adaptör "fixture sağlayıcı" (ConformanceSpec) ile kaydolur;
// C1-C14 ortak senaryoları (playbook §5.2) 127.0.0.1'deki yerel HTTP sunucusuna karşı koşar. GERÇEK ağ/DB YOK.
// Kit yalnız ORTAK davranışı sınar; platforma özgü iş kuralları adaptörün kendi testindedir.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import type http from 'http';
import { ADAPTER_KEYS, type AdapterCode } from '@integration/modules/adapterKeys';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { getIncomplete } from '@integration/contracts/IncompleteFetch';
import { setUnknownEnumSink, resetUnknownEnumState, type UnknownEnumEvent } from '@integration/modules/common/contract/reportUnknownEnum';
import { FindingService } from '@integration/compliance/FindingService';
import { startLocalServer, type LocalServerHandle } from '../helpers/localHttpServer';
import { captureLogs, type LogCapture } from '../helpers/logCapture';
import { KNOWN_OPEN, NOT_APPLICABLE, PLAYBOOK_ID, SCENARIO_IDS, type ScenarioId } from './exemptions';

/** Kit'in adaptörden istediği tutamaç: IPlatform cephesi (+ isteğe bağlı ham servis). */
export interface Built { platform: any; raw?: any }
export interface Req { method: string; url: string; body?: string }
export interface Reply { status: number; body?: unknown; headers?: Record<string, string> }

export interface ConformanceSpec {
    code: AdapterCode;
    /** Adaptörü (sahte ayarlarla) `baseUrl`'e yönlendirilmiş kurar. Gerçek host değil, yerel sunucu / C10'da yabancı host verilir. */
    build(baseUrl: string): Built;
    /** ResilientHttpClient zaman aşımı env düğmesi (ör. TY_HTTP_TIMEOUT_MS). */
    timeoutEnv: string;
    /** Log/hata çıktısında ASLA görünmemesi gereken sır değerleri (türev kodlamalar dâhil). */
    secrets: string[];
    read: {
        /** Tam sipariş çekimi (IPlatform.retrieveOrders). */
        call(a: Built): Promise<any>;
        /** `index`. sayfanın gövdesi (toplam `pageCount` sayfa, sayfa başına `perPage` kayıt; her sayfada benzersiz kimlik). */
        page(index: number, pageCount: number, perPage: number): unknown;
        /** Sayfa sırası URL sorgusundan okunamıyorsa (ör. POST gövdesinde pageNumber) gövde de verilir. */
        pageIndexOf?(url: string, body?: string): number;
        /** C6a/C6b sayfa başına kayıt sayısı (varsayılan 2). Sayfa boyutu sabit olan adaptörlerde (ör. Ideasoft 100: `<100` = son sayfa) gerçek boyut verilir. */
        pageSize?: number;
        /** C6a'da 3 sayfadan dönmesi beklenen toplam kayıt (varsayılan 6 = 3 x 2). Son sayfası kısa olan adaptörlerde (Ideasoft 100+100+2) verilir. */
        c6aTotal?: number;
        /** Dönüşten sipariş/satır kimlikleri. */
        ids(result: any): { orders: string[]; lines: string[] };
        /** Sonuç IOrderPackage şeklinde mi (`order.externalOrderId`, `customer`). */
        packageShapeOk(result: any): boolean;
        /** Zorunlu olmayan bir alan tipi bozuk ama kimlik tamam. */
        driftBody(): unknown;
        /** Tüm kayıtlarda zorunlu kimlik eksik. */
        missingIdBody(): unknown;
        /** Bilinmeyen durum değeri taşıyan gövde + dönüşten ham durumlar. */
        unknownEnumBody(raw: string): unknown;
        statusesOf(result: any): string[];
        /** Fixture'daki PII dizgeleri (log'da görünmemeli). */
        pii: string[];
    };
    write?: {
        /** Stok yazımı (dış etkili). */
        call(a: Built): Promise<any>;
        /** Başarılı yazma/durum sorgusu yanıtı (URL'ye göre ayırt eder). */
        respond(req: Req, mode: 'write' | 'batch-done' | 'batch-pending'): Reply;
        /** Başarılı yazma sonucu şekli (IBatchProcessResult). */
        shapeOk(result: any): boolean;
    };
    /** Yazma yolu olsa da batch/durum-takip kavramı yoksa (yazmalar senkron): checkBatchProduct NOT_SUPPORTED fırlatmalı (C8b; playbook §4.3). */
    noBatch?: true;
    /** Yazma yolu yoksa: çağrı NOT_SUPPORTED fırlatmalı. */
    writeNotSupported?: { call(a: Built): Promise<any> };
    /** Yazma yolu yoksa C5 için ham servis üzerinden dış-etkili POST (taban sınıf davranışı). */
    rawWrite?: (a: Built) => Promise<any>;
    mock: { prefix: string };
    /** Kimlik doğrulama ön-istekleri (ör. OAuth token ucu): true dönerse istek işlenmiş sayılır ve istek sayacına (C2a/C5/C6a/C6b/C10c) GİRMEZ. */
    authHandler?: (req: http.IncomingMessage, res: http.ServerResponse) => boolean;
    /** Bu adaptörün tüm senaryolarında geçerli ek env değerleri (ör. IDEASOFT_MAX_PAGES: sonsuz-sayfa testini kısa tutmak için adaptör tavanını düşürür). */
    env?: Record<string, string>;
    /** Sonsuz-sayfa (C6b) testinde kabul edilen en çok istek; varsayılan 25. Adaptörün belgelenmiş sayfa tavanı bundan büyükse (ör. HB 50 sayfa) artırılır. */
    maxSaneRequests?: number;
}

const HOST_EVIL = 'https://evil.example.com';
const MAX_SANE_REQUESTS = 25; // oran limitleyici gerçek zamanlı (ör. 300/dk = 200 ms/istek): tavan testi bu yüzden küçük tutulur
const SLOW_MS = 30_000;

const jsonReply = (res: http.ServerResponse, r: Reply) => {
    res.writeHead(r.status, { 'Content-Type': 'application/json', ...(r.headers ?? {}) });
    res.end(JSON.stringify(r.body ?? {}));
};

async function rejection(p: Promise<unknown>): Promise<any> {
    try { await p; } catch (e) { return e; }
    throw new Error('hata fırlatması bekleniyordu, çağrı başarıyla döndü');
}

const pageIndexDefault = (url: string) => Number(new URL(url, 'http://x').searchParams.get('page') ?? 0);

function moduleDir(code: AdapterCode): string {
    const cat = ADAPTER_KEYS.find(k => k.code === code)!.category;
    return path.resolve(__dirname, '../../src/integration/modules', cat, code);
}

function listTs(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? listTs(p) : (e.name.endsWith('.ts') ? [p] : []);
    });
}

export function runAdapterConformance(spec: ConformanceSpec): void {
    let srv: LocalServerHandle | undefined;
    const envTouched = new Set<string>();
    const setEnv = (k: string, v: string) => { envTouched.add(k); process.env[k] = v; };
    const prefixEnv = (suffix: string) => `${spec.mock.prefix}_${suffix}`;

    let authCount = 0; // `spec.authHandler`ın karşıladığı (token vb.) istekler: adaptörün veri istekleri sayımına girmez
    const reqCount = (h: LocalServerHandle) => h.requestCount() - authCount;
    const serve = async (handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) => {
        authCount = 0;
        srv = await startLocalServer((q, res) => {
            // gövde tamponlanır (POST gövdesinde sayfa numarası olan adaptörler için); `q.body` olarak elde edilir
            const chunks: Buffer[] = [];
            q.on('data', (c: Buffer) => chunks.push(c));
            q.on('end', () => {
                (q as any).body = Buffer.concat(chunks).toString('utf8');
                if (spec.authHandler?.(q, res)) { authCount++; return; }
                handler(q, res);
            });
        });
        return srv;
    };
    const okRead = (req: http.IncomingMessage, res: http.ServerResponse, pageCount = 1, perPage = 2) =>
        jsonReply(res, { status: 200, body: spec.read.page((spec.read.pageIndexOf ?? pageIndexDefault)(req.url ?? '/', (req as any).body), pageCount, perPage) });
    const reqOf = (q: http.IncomingMessage): Req => ({ method: q.method ?? 'GET', url: q.url ?? '/', body: (q as any).body });

    // Sözleşme bekçisi (ContractGuard) bulguları ERTELENMİŞ (microtask) yazar: sink dosya boyunca bellek-içi tutulur ki hiçbir bulgu DB'ye gitmesin.
    let findings: any[] = [];
    let cap: LogCapture;
    beforeAll(() => {
        ResilientHttpClient.setTestDelayScale(0.001);
        FindingService.setSink(async (_op, rec) => { findings.push(rec); });
        FindingService.setReader(async () => null);
    });
    afterAll(() => {
        ResilientHttpClient.setTestDelayScale(1);
        FindingService.setSink(undefined); FindingService.setReader(undefined);
    });
    beforeEach(() => {
        ResilientHttpClient.resetAllState(); resetUnknownEnumState(); findings = []; cap = captureLogs();
        for (const [k, v] of Object.entries(spec.env ?? {})) setEnv(k, v);
    });
    afterEach(async () => {
        cap.restore();
        jest.restoreAllMocks();
        setUnknownEnumSink(null);
        if (srv) { await srv.close(); srv = undefined; }
        for (const k of envTouched) delete process.env[k];
        envTouched.clear();
    });

    const scenarios: Record<ScenarioId, () => Promise<void>> = {
        // C1 - okuma 500 -> UNAVAILABLE ([] dönmez)
        C1: async () => {
            const s = await serve((_q, res) => jsonReply(res, { status: 500, body: { message: 'sunucu hatası' } }));
            const e = await rejection(spec.read.call(spec.build(s.baseUrl)));
            expect(e).toMatchObject({ name: 'IntegrationError', code: 'UNAVAILABLE' });
        },
        // C2a - 429 küçük Retry-After -> sonunda başarı
        C2a: async () => {
            let n = 0;
            const s = await serve((q, res) => {
                n++;
                if (n === 1) jsonReply(res, { status: 429, body: { message: 'rate limited' }, headers: { 'Retry-After': '0' } });
                else okRead(q, res);
            });
            const r = await spec.read.call(spec.build(s.baseUrl));
            expect(Array.isArray(r)).toBe(true);
            expect(spec.read.ids(r).orders.length).toBeGreaterThan(0);
            expect(reqCount(s)).toBe(2);
        },
        // C2b - 429 büyük Retry-After -> RATE_LIMITED
        C2b: async () => {
            const s = await serve((_q, res) => jsonReply(res, { status: 429, body: { message: 'rate limited' }, headers: { 'Retry-After': '3600' } }));
            const e = await rejection(spec.read.call(spec.build(s.baseUrl)));
            expect(e).toMatchObject({ name: 'IntegrationError', code: 'RATE_LIMITED' });
        },
        // C3 - zaman aşımı -> UNAVAILABLE
        C3: async () => {
            const s = await serve((_q, res) => { setTimeout(() => { try { res.writeHead(200); res.end('{}'); } catch { /* iptal edilmiş olabilir */ } }, 300); });
            setEnv(spec.timeoutEnv, '50');
            const e = await rejection(spec.read.call(spec.build(s.baseUrl)));
            expect(e).toMatchObject({ name: 'IntegrationError', code: 'UNAVAILABLE' });
        },
        // C4 - 401 ve 403 -> AUTH (generic Error'a sarılmaz, retry yok)
        C4: async () => {
            for (const status of [401, 403]) {
                ResilientHttpClient.resetAllState();
                const s = await serve((_q, res) => jsonReply(res, { status, body: { message: 'yetkisiz' } }));
                const e = await rejection(spec.read.call(spec.build(s.baseUrl)));
                expect(e.name).toBe('IntegrationError');
                expect(e.code).toBe('AUTH');
                expect(e.retryable).toBe(false);
                await s.close(); srv = undefined;
            }
        },
        // C5 - dış etkili yazma 5xx -> UNKNOWN_OUTCOME, tam 1 çağrı
        C5: async () => {
            const s = await serve((_q, res) => jsonReply(res, { status: 500, body: { message: 'sunucu hatası' } }));
            const a = spec.build(s.baseUrl);
            // rawWrite verilmişse öncelikli: write.call per-öğe hatayı yutup failedVariants'a koyan (senkron toplu) adaptörlerde fırlatmaz
            const e = await rejection(spec.rawWrite ? spec.rawWrite(a) : spec.write!.call(a));
            expect(e).toMatchObject({ name: 'IntegrationError', code: 'UNKNOWN_OUTCOME' });
            expect(reqCount(s)).toBe(1);
        },
        // C6a - 3 sayfa x n kayıt -> tümü, benzersiz
        C6a: async () => {
            const s = await serve((q, res) => okRead(q, res, 3, spec.read.pageSize ?? 2));
            const r = await spec.read.call(spec.build(s.baseUrl));
            const ids = spec.read.ids(r).orders;
            const total = spec.read.c6aTotal ?? 6;
            expect(ids).toHaveLength(total);
            expect(new Set(ids).size).toBe(total);
            expect(reqCount(s)).toBe(3);
        },
        // C6b - sonsuz sayfa bildiren sunucu: adaptör KENDİ tavanında durmalı (sonsuz döngü yok) ve eksikliği işaretlemeli
        C6b: async () => {
            const maxRequests = spec.maxSaneRequests ?? MAX_SANE_REQUESTS;
            const s = await serve((q, res) => {
                if (reqCount(srv!) > maxRequests) return jsonReply(res, { status: 400, body: {} }); // kaçış: test asılı kalmasın (tavansız adaptör burada kesilir ve sayaç eşiği aşar)
                okRead(q, res, 1_000_000, spec.read.pageSize ?? 2);
            });
            let result: any; let err: any;
            try { result = await spec.read.call(spec.build(s.baseUrl)); } catch (e) { err = e; }
            expect(reqCount(s)).toBeLessThanOrEqual(maxRequests); // tavan: tavansız döngü yasak
            if (err) expect(err).toMatchObject({ name: 'IntegrationError', platformCode: 'ORDER_WINDOW_OVERFLOW' }); // ya açık hata (pencere taşması)
            else expect(getIncomplete(result)).toMatchObject({ incomplete: true }); // ya da incomplete işareti
        },
        // C7a - zorunlu olmayan alan tipi bozuk -> drift sinyali, istek başarılı
        C7a: async () => {
            const s = await serve((_q, res) => jsonReply(res, { status: 200, body: spec.read.driftBody() }));
            const r = await spec.read.call(spec.build(s.baseUrl));
            expect(spec.read.ids(r).orders.length).toBeGreaterThan(0);
            await new Promise(resolve => setImmediate(resolve));
            // sinyal: API_SCHEMA_DRIFT olayı (observeResponseSchema) YA DA mismatch bulgusu (ContractGuard); "yeni alan" bulgusu (#unknown_fields) drift SAYILMAZ
            const drift = cap.find(l => l.code === 'API_SCHEMA_DRIFT') || findings.find(f => f.kind === 'schema' && String(f.subjectKey).endsWith('#mismatch'));
            expect(drift).toBeDefined();
        },
        // C7b - zorunlu kimlik eksik -> VALIDATION (sessiz kayıt/atlama yok)
        C7b: async () => {
            const s = await serve((_q, res) => jsonReply(res, { status: 200, body: spec.read.missingIdBody() }));
            const e = await rejection(spec.read.call(spec.build(s.baseUrl)));
            expect(e).toMatchObject({ name: 'IntegrationError', code: 'VALIDATION' });
        },
        // C8a - stok yazımı şekli (IBatchProcessResult) ya da yazma yolu yoksa NOT_SUPPORTED
        C8a: async () => {
            if (spec.writeNotSupported) {
                const e = await rejection(spec.writeNotSupported.call(spec.build('http://127.0.0.1:1')));
                expect(e).toMatchObject({ name: 'IntegrationError', code: 'NOT_SUPPORTED' });
                return;
            }
            const s = await serve((q, res) => jsonReply(res, spec.write!.respond(reqOf(q), 'write')));
            const r = await spec.write!.call(spec.build(s.baseUrl));
            expect(spec.write!.shapeOk(r)).toBe(true);
        },
        // C8b - checkBatchProduct: tamamlanmışta COMPLETED/FAILED; sonuçlanmamışta undefined YA DA WAITING; batch kavramı yoksa NOT_SUPPORTED
        C8b: async () => {
            if (!spec.write || spec.noBatch) {
                // batch kavramı yok: undefined DÖNMEMELİ, NOT_SUPPORTED fırlatmalı (playbook §4.3)
                const a0 = spec.build('http://127.0.0.1:1');
                const e = await rejection(Promise.resolve(a0.platform.checkBatchProduct({ trackingId: 'T-1', mode: 'UPDATE_STOCK' })));
                expect(e).toMatchObject({ name: 'IntegrationError', code: 'NOT_SUPPORTED' });
                return;
            }
            const s = await serve((q, res) => jsonReply(res, spec.write!.respond(reqOf(q), 'batch-done')));
            const done = await spec.build(s.baseUrl).platform.checkBatchProduct({ trackingId: 'T-1', mode: 'UPDATE_STOCK' });
            expect(Array.isArray(done)).toBe(true);
            expect(done.length).toBeGreaterThan(0);
            for (const r of done) expect(['COMPLETED', 'FAILED']).toContain(r.status);
            await s.close(); srv = undefined;
            const s2 = await serve((q, res) => jsonReply(res, spec.write!.respond(reqOf(q), 'batch-pending')));
            const pending = await spec.build(s2.baseUrl).platform.checkBatchProduct({ trackingId: 'T-1', mode: 'UPDATE_STOCK' });
            if (pending !== undefined) for (const r of pending) expect(r.status).toBe('WAITING');
        },
        // C9a - sipariş içe alma kararlılığı: aynı girdi iki kez -> aynı sipariş/satır kimlikleri
        C9a: async () => {
            const s = await serve((q, res) => okRead(q, res, 1, 2));
            const a = spec.build(s.baseUrl);
            const one = spec.read.ids(await spec.read.call(a));
            const two = spec.read.ids(await spec.read.call(a));
            expect(one.orders.length).toBeGreaterThan(0);
            expect(two).toEqual(one);
            expect(one.lines.length).toBeGreaterThan(0);
            for (const id of [...one.orders, ...one.lines]) expect(id).toMatch(/^(?!undefined$)(?!null$).+/); // "undefined" kimliği kaydedilmez
            expect(new Set(one.orders).size).toBe(one.orders.length);
        },
        // C9b - IOrderPackage şekli (motor `pkg.order.externalOrderId` okur)
        C9b: async () => {
            const s = await serve((q, res) => okRead(q, res, 1, 2));
            const r = await spec.read.call(spec.build(s.baseUrl));
            expect(spec.read.packageShapeOk(r)).toBe(true);
        },
        // C10a - izinsiz host: istek atılmadan OUTBOUND_HOST_NOT_ALLOWED
        C10a: async () => {
            const e = await rejection(spec.read.call(spec.build(HOST_EVIL)));
            expect(e).toMatchObject({ name: 'IntegrationError', code: 'VALIDATION', platformCode: 'OUTBOUND_HOST_NOT_ALLOWED' });
        },
        // C10b - mock AÇIK + yabancı (gerçek) host: fail-closed, gerçek host'a gidilmez
        C10b: async () => {
            setEnv(prefixEnv('MOCK_MODE'), 'true'); setEnv(prefixEnv('MOCKABLE_ENDPOINTS'), '!,/mockable-yok');
            const e = await rejection(spec.read.call(spec.build(HOST_EVIL)));
            expect(e.name).toBe('IntegrationError');
            expect(['MOCK_ENDPOINT_NOT_MOCKED', 'OUTBOUND_HOST_NOT_ALLOWED']).toContain(e.platformCode);
        },
        // C10c - mock AÇIK + listede olmayan uç: MOCK_ENDPOINT_NOT_MOCKED, istek atılmaz
        C10c: async () => {
            const s = await serve((q, res) => okRead(q, res));
            setEnv(prefixEnv('MOCK_MODE'), 'true'); setEnv(prefixEnv('MOCKABLE_ENDPOINTS'), '!,/mockable-yok');
            const e = await rejection(spec.read.call(spec.build(s.baseUrl)));
            expect(e).toMatchObject({ name: 'IntegrationError', platformCode: 'MOCK_ENDPOINT_NOT_MOCKED' });
            expect(reqCount(s)).toBe(0);
        },
        // C11 - log hijyeni: yakalanan log/konsolda sır değeri ve fixture PII'si yok (başarı + 500 + 401 akışları)
        C11: async () => {
            const sink: string[] = [];
            const push = (...args: unknown[]) => { for (const x of args) { try { sink.push(typeof x === 'string' ? x : JSON.stringify(x)); } catch { sink.push(String(x)); } } };
            for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) jest.spyOn(console, m).mockImplementation(push as never);
            for (const status of [200, 500, 401]) {
                ResilientHttpClient.resetAllState();
                const s = await serve((q, res) => (status === 200 ? okRead(q, res, 1, 2) : jsonReply(res, { status, body: { message: 'sunucu hatası' } })));
                try { await spec.read.call(spec.build(s.baseUrl)); } catch { /* beklenen */ }
                await s.close(); srv = undefined;
            }
            await new Promise(resolve => setImmediate(resolve));
            const all = [...cap.lines.map(l => JSON.stringify(l)), ...findings.map(f => JSON.stringify(f)), ...sink].join('\n');
            for (const secret of spec.secrets) expect(all).not.toContain(secret);
            for (const pii of spec.read.pii) expect(all).not.toContain(pii);
        },
        // C12 - bilinmeyen enum: ham değer korunur + bulgu raporlanır
        C12: async () => {
            const events: UnknownEnumEvent[] = [];
            setUnknownEnumSink(ev => { events.push(ev); });
            const raw = 'ZZ_NEW_STATE';
            const s = await serve((_q, res) => jsonReply(res, { status: 200, body: spec.read.unknownEnumBody(raw) }));
            const r = await spec.read.call(spec.build(s.baseUrl));
            expect(spec.read.statusesOf(r)).toContain(raw);
            expect(events.some(e => e.value === raw)).toBe(true);
        },
        // C13 - intake off (statik): modül dizininde zamanlayıcı döngüsü/cron yok (tüm periyodik iş motor tüketicilerinden gelir)
        C13: async () => {
            const offenders: string[] = [];
            for (const f of listTs(moduleDir(spec.code))) {
                const src = fs.readFileSync(f, 'utf8');
                if (/\bsetInterval\s*\(|node-cron|cron\.schedule\s*\(|new\s+CronJob\s*\(/.test(src)) offenders.push(path.relative(moduleDir(spec.code), f));
            }
            expect(offenders).toEqual([]);
        },
        // C14 - testConnection: yan etkisiz, başarıda {ok:true, code:'OK'}, 401'de {ok:false, code:'AUTH_FAILED'}, yalnız GET
        C14: async () => {
            const methods: string[] = [];
            let status = 200;
            const s = await serve((q, res) => { methods.push(q.method ?? '?'); jsonReply(res, { status, body: spec.read.page(0, 1, 1) }); });
            const a = spec.build(s.baseUrl);
            expect(typeof a.platform.testConnection).toBe('function');
            const okRes = await a.platform.testConnection();
            expect(okRes).toMatchObject({ ok: true, code: 'OK' });
            status = 401;
            ResilientHttpClient.resetAllState();
            const bad = await a.platform.testConnection();
            expect(bad).toMatchObject({ ok: false, code: 'AUTH_FAILED' });
            expect(methods.every(m => m === 'GET')).toBe(true);
        },
    };

    describe(`conformance: ${spec.code}`, () => {
        for (const id of SCENARIO_IDS) {
            const known = KNOWN_OPEN[spec.code]?.[id];
            const na = NOT_APPLICABLE[spec.code]?.[id];
            const title = `${id} (playbook ${PLAYBOOK_ID(id)})`;
            if (na) { it.skip(`${title} - uygulanmaz: ${na}`, () => undefined); continue; }
            if (known) {
                it(`${title} - BİLİNEN AÇIK (bugün başarısız, ratchet): ${known}`, async () => {
                    let failed = false;
                    try { await scenarios[id](); } catch { failed = true; }
                    if (!failed) throw new Error(`${spec.code}/${id} artık GEÇİYOR: tests/conformance/exemptions.ts KNOWN_OPEN listesinden çıkar (ratchet aşağı).`);
                }, id === 'C6b' ? SLOW_MS : undefined);
                continue;
            }
            it(title, scenarios[id], id === 'C6b' ? SLOW_MS : undefined);
        }
    });
}
