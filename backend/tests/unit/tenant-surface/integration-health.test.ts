import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { aggregate } from './_miniAggregate';

// N7: IntegrationService.getIntegrationHealth (tenant entegrasyon sağlığı, YALNIZCA OKUMA). DB/Redis/ağ YOK.
// Metrik/Clients koleksiyonları bellek-içi taklit edilir; iki tenant'lı veriyle IDOR (çapraz-tenant sızıntı) ve DTO sızıntısı doğrulanır.

const appDb: any = {};
const clientDb: any = {};
jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: async () => appDb, getClientDB: async () => clientDb },
}));
jest.mock('@utils/decorator/cache', () => ({ nodeCache: { getStats: () => ({}), keys: () => [] } }));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { getInstance: () => ({}) } }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@integration/engine/IntegrationEventBus', () => ({ EVENTS: {}, integrationEventBus: { emit: jest.fn(), on: jest.fn() } }));
jest.mock('@services/notification/NotificationService', () => ({ NotificationService: {} }));

import IntegrationService from '../../../src/api/services/integration-service';
import { sanitizeResponse } from '../../../src/api/responseSanitizer';
import { buildIntegrationHealth, sanitizeOperation, CIRCUIT_STALE_MS } from '../../../src/operations/integration/IntegrationHealthOperations';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

const TENANT_A = 4;
const TENANT_B = 7;
const SECRET_TOKEN = 'WEBHOOK-TOKEN-' + 'a1b2c3d4'.repeat(8);

const metric = (o: any) => ({ kind: 'http', durationMs: 5, retries: 0, circuitState: 'closed', status: 'ok', ...o });

let metrics: any[];
let clients: any[];
let ciDocs: Record<number, any>;
let calls: { clientsFilter: any[]; ciTenants: number[]; pipelines: any[][] };

function wire(clientIdForClientDb: number) {
  calls = { clientsFilter: [], ciTenants: [], pipelines: [] };
  Object.assign(appDb, {
    getIntegrationCallMetricModel: () => ({ aggregate: jest.fn(async (p: any[]) => { calls.pipelines.push(p); return aggregate(metrics, p); }) }),
    getClientModel: () => ({
      findOne: jest.fn((filter: any) => {
        calls.clientsFilter.push(filter);
        const c = clients.find((x) => Object.entries(filter).every(([k, v]) => x[k] === v));
        return { lean: async () => (c ? JSON.parse(JSON.stringify(c)) : null) };
      }),
    }),
  });
  Object.assign(clientDb, {
    getClientIntegrationModel: () => ({ findOne: jest.fn(() => { calls.ciTenants.push(clientIdForClientDb); return { lean: async () => ciDocs[clientIdForClientDb] ?? null }; }) }),
  });
}

async function health(clientId: number, request: any = {}) {
  wire(clientId);
  const s: any = new IntegrationService(clientId, { principal: { sub: 'u1', tid: clientId }, ...request });
  await s.init();
  return s.getIntegrationHealth();
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  clients = [
    { clientId: TENANT_A, order: TENANT_A, dbConfig: { dbname: 'x' }, integrations: [
      { integrationCode: 'trendyol', type: 'marketplace', status: true, lastSuccessfulOrderSync: ago(3 * MIN), webhookHealthy: true, webhookLastReceivedAt: ago(1 * MIN), webhookToken: SECRET_TOKEN },
      { integrationCode: 'n11', type: 'marketplace', status: true, lastSuccessfulOrderSync: ago(2 * DAY) },
      { integrationCode: 'hepsiburada', type: 'marketplace', status: false },
      { integrationCode: 'pazarama', type: 'marketplace', status: true },
    ] },
    { clientId: TENANT_B, order: TENANT_B, integrations: [{ integrationCode: 'trendyol', type: 'marketplace', status: true, lastSuccessfulOrderSync: ago(9 * MIN), webhookToken: 'B-TOKEN' }] },
  ];
  ciDocs = {
    [TENANT_A]: {
      marketplace: [
        { code: 'trendyol', order: 1, settings: { SELLERID: '1', APIKEY: 'enc:v1:k1:AAAA', APISECRET: 'plain-secret-xyz' } },
        { code: 'n11', order: 2, settings: { APIKEY: 'n11-key-value', APISECRET: 'n11-secret-value' } },
        { code: 'hepsiburada', order: 3, settings: { test: 1 } },
        { code: 'pazarama', order: 4, settings: { APIKEY: 'pz-key', APISECRET: 'pz-secret' } },
      ],
      shipment: [], ecommerce: [], erp: [], einvoice: [],
    },
    [TENANT_B]: { marketplace: [{ code: 'trendyol', order: 1, settings: { APIKEY: 'B-KEY', APISECRET: 'B-SECRET' } }], shipment: [], ecommerce: [], erp: [], einvoice: [] },
  };
  metrics = [
    // A/trendyol: 5 ok + 1 hata (RATE_LIMITED, en son değil) -> healthy; devre kapalı
    ...[1, 2, 3, 4, 5].map((i) => metric({ integrationCode: 'trendyol', clientId: String(TENANT_A), at: ago(i * 10 * MIN), operation: 'GET /suppliers/123/orders' })),
    metric({ integrationCode: 'trendyol', clientId: String(TENANT_A), at: ago(2 * HOUR), status: 'error', code: 'RATE_LIMITED', httpStatus: 429, operation: 'GET /suppliers/123/orders?apiKey=SUPERSECRET&token=abc' }),
    // A/n11: son çağrı hata (AUTH) ve devre AÇIK, gözlem 1 dk önce -> down
    metric({ integrationCode: 'n11', clientId: String(TENANT_A), at: ago(3 * HOUR), status: 'ok' }),
    metric({ integrationCode: 'n11', clientId: String(TENANT_A), at: ago(20 * MIN), status: 'error', code: 'AUTH', httpStatus: 401, operation: 'POST /ms/product/tasks' }),
    metric({ integrationCode: 'n11', clientId: String(TENANT_A), at: ago(1 * MIN), status: 'error', code: 'UNAVAILABLE', httpStatus: 503, circuitState: 'open', operation: 'GET /ms/orders' }),
    // 24 saatten ESKİ hata (sayıma girmez ama lastError/circuit için görünür: 30 gün geriye bakış)
    metric({ integrationCode: 'pazarama', clientId: String(TENANT_A), at: ago(5 * DAY), status: 'error', code: 'VALIDATION', httpStatus: 400, operation: 'POST /x' }),
    // TENANT B verisi (A'nın çıktısında ASLA görünmemeli)
    metric({ integrationCode: 'trendyol', clientId: String(TENANT_B), at: ago(1 * MIN), status: 'error', code: 'AUTH', httpStatus: 401, circuitState: 'open', operation: 'GET /b-only-operation' }),
    metric({ integrationCode: 'trendyol', clientId: String(TENANT_B), at: ago(2 * MIN), status: 'error', code: 'AUTH', httpStatus: 401, operation: 'GET /b-only-operation' }),
    metric({ integrationCode: 'b-only-integration', clientId: String(TENANT_B), at: ago(2 * MIN), status: 'ok' }),
  ];
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

const byCode = (r: any) => Object.fromEntries(r.integrations.map((i: any) => [i.integrationCode, i]));

describe('getIntegrationHealth: içerik', () => {
  it('kanal başına son senkron, webhook, son 24 sa sayıları, son hata (IntegrationError.code) ve devre kesici', async () => {
    const r = await health(TENANT_A);
    expect(r.windowHours).toBe(24);
    const m = byCode(r);
    expect(Object.keys(m).sort()).toEqual(['hepsiburada', 'n11', 'pazarama', 'trendyol']);

    expect(m.trendyol).toMatchObject({
      type: 'marketplace', enabled: true, credentialsConfigured: true,
      last24h: { total: 6, success: 5, error: 1, errorsByCode: { RATE_LIMITED: 1 } },
      lastError: { code: 'RATE_LIMITED', httpStatus: 429 },
      circuit: { state: 'closed', stale: false },
      webhook: { healthy: true },
      health: 'healthy',
    });
    expect(m.trendyol.lastSuccessfulSyncAt).toEqual(ago(3 * MIN));
    expect(m.trendyol.webhook.lastReceivedAt).toEqual(ago(1 * MIN));

    expect(m.n11).toMatchObject({
      last24h: { total: 3, success: 1, error: 2, errorsByCode: { AUTH: 1, UNAVAILABLE: 1 } },
      lastError: { code: 'UNAVAILABLE', httpStatus: 503, operation: 'GET /ms/orders' },
      circuit: { state: 'open', stale: false },
      health: 'down',
    });
    expect(m.n11.webhook).toBeNull();
  });

  it('kimlik bilgisi girilmemiş + çağrı yok = not_configured; devre dışı entegrasyon enabled=false; 24 sa dışı hata sayıma girmez ama lastError\'da görünür', async () => {
    const m = byCode(await health(TENANT_A));
    expect(m.hepsiburada).toMatchObject({ enabled: false, credentialsConfigured: false, health: 'not_configured', lastError: null, circuit: null, last24h: { total: 0, success: 0, error: 0, errorsByCode: {} } });
    expect(m.pazarama).toMatchObject({ credentialsConfigured: true, health: 'no_data', last24h: { total: 0 }, lastError: { code: 'VALIDATION', httpStatus: 400 } });
  });

  it('bayat devre kesici gözlemi (open ama > 10 dk önce) "down" saymaz: stale=true', async () => {
    metrics.push(metric({ integrationCode: 'pazarama', clientId: String(TENANT_A), at: new Date(NOW.getTime() - CIRCUIT_STALE_MS - MIN), status: 'error', code: 'UNAVAILABLE', circuitState: 'open' }));
    const m = byCode(await health(TENANT_A));
    expect(m.pazarama.circuit).toMatchObject({ state: 'open', stale: true });
    expect(m.pazarama.health).not.toBe('down');
  });

  it('bilinmeyen hata kodu UNKNOWN\'a indirgenir (ham metin/ tahmin edilemez değer dönmez)', async () => {
    metrics.push(metric({ integrationCode: 'pazarama', clientId: String(TENANT_A), at: ago(1 * MIN), status: 'error', code: 'apiKey=LEAK-123 Bearer abc', httpStatus: 500 }));
    const m = byCode(await health(TENANT_A));
    expect(m.pazarama.lastError.code).toBe('UNKNOWN');
    expect(m.pazarama.last24h.errorsByCode).toEqual({ UNKNOWN: 1 });
    expect(JSON.stringify(m)).not.toMatch(/LEAK-123|Bearer/);
  });

  it('Clients kaydı / tenant DB yoksa boş liste (hata değil)', async () => {
    clients = []; ciDocs = {}; metrics = [];
    const r = await health(TENANT_A);
    expect(r.integrations).toEqual([]);
  });
});

describe('getIntegrationHealth: sızıntı (DTO beyaz liste)', () => {
  it('webhookToken, kimlik bilgisi/şifreli değer, sorgu dizesi ve ham ayar ASLA dönmez (ve yanıt sanitizer\'ı tetiklenmez)', async () => {
    const r = await health(TENANT_A);
    const json = JSON.stringify(r);
    for (const leak of [SECRET_TOKEN, 'webhookToken', 'plain-secret-xyz', 'enc:v1', 'n11-key-value', 'n11-secret-value', 'SUPERSECRET', 'apiKey=', 'token=abc', 'SELLERID', 'dbConfig', 'settings']) {
      expect([leak, json.includes(leak)]).toEqual([leak, false]);
    }
    const warn = jest.spyOn(console, 'warn');
    expect(sanitizeResponse(r, { service: 'IntegrationService', operation: 'getIntegrationHealth' })).toBe(r); // aynı referans = yasak anahtar yok
    expect(warn).not.toHaveBeenCalled();
    // operation alanından sorgu dizesi atılmış
    expect(byCode(r).trendyol.lastError.operation).toBe('GET /suppliers/123/orders');
  });

  it('sanitizeOperation: sorgu/fragment atılır, kimlik bilgisi kalıpları ve uzun token benzeri parçalar maskelenir, 120 ile sınırlanır', () => {
    expect(sanitizeOperation('GET /a/b?x=1#frag')).toBe('GET /a/b');
    expect(sanitizeOperation('GET /hooks/trendyol/' + 'f'.repeat(64))).toBe('GET /hooks/trendyol/***');
    expect(sanitizeOperation('login token=abc123')).toBe('login token=***');
    expect(sanitizeOperation(undefined)).toBe('');
    expect(sanitizeOperation('x'.repeat(31) + '/y'.repeat(200)).length).toBeLessThanOrEqual(120);
  });
});

describe('getIntegrationHealth: tenant izolasyonu (IDOR)', () => {
  it('A kendi verisini görür; B\'nin metrikleri/entegrasyonları/webhook token\'ı/son hatası HİÇBİR alanda görünmez', async () => {
    const r = await health(TENANT_A);
    const json = JSON.stringify(r);
    for (const leak of ['b-only-integration', 'b-only-operation', 'B-TOKEN', 'B-KEY', 'B-SECRET']) expect([leak, json.includes(leak)]).toEqual([leak, false]);
    expect(byCode(r).trendyol.lastError.code).toBe('RATE_LIMITED'); // B'nin AUTH hatası değil
    expect(byCode(r).trendyol.circuit.state).toBe('closed');         // B'nin open devresi değil
  });

  it('B kendi tenant\'ının verisini görür (simetri)', async () => {
    const r = await health(TENANT_B);
    expect(r.integrations.map((i: any) => i.integrationCode).sort()).toEqual(['b-only-integration', 'trendyol']);
    expect(byCode(r).trendyol).toMatchObject({ lastError: { code: 'AUTH' }, circuit: { state: 'open' }, last24h: { error: 2 } });
    expect(JSON.stringify(r)).not.toMatch(/RATE_LIMITED|SUPERSECRET/);
  });

  it('TÜM aggregate hatları ve Clients sorgusu yalnızca sunucudaki tenant kimliğiyle süzülür', async () => {
    await health(TENANT_A);
    expect(calls.pipelines.length).toBe(4);
    for (const p of calls.pipelines) expect(p[0].$match.clientId).toBe(String(TENANT_A));
    expect(calls.clientsFilter).toEqual([{ clientId: TENANT_A }]);
    expect(calls.ciTenants).toEqual([TENANT_A]);
  });

  it('gövdedeki clientId / targetClientId / order / integrationCode tenant SEÇEMEZ (yok sayılır)', async () => {
    const forged = { clientId: TENANT_B, targetClientId: TENANT_B, order: TENANT_B, tid: TENANT_B, integrationCode: 'trendyol' };
    const r = await health(TENANT_A, forged);
    expect(JSON.stringify(r)).not.toMatch(/b-only|B-TOKEN/);
    for (const p of calls.pipelines) expect(p[0].$match.clientId).toBe(String(TENANT_A));
    expect(calls.clientsFilter).toEqual([{ clientId: TENANT_A }]);
  });

  it('tenant kimliği geçersizse (ör. platformAdmin, mağaza seçmemiş) 400; sorgu atılmaz', async () => {
    wire(TENANT_A);
    await expect(buildIntegrationHealth({ applicationDB: appDb, clientDB: clientDb, clientId: NaN as any })).rejects.toMatchObject({ statusCode: 400 });
    expect(calls.pipelines).toEqual([]);
  });
});
