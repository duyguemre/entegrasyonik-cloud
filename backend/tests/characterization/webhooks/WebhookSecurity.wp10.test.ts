/**
 * WP10: Trendyol webhook güvenliği (sabit-zamanlı karşılaştırma, API_KEY/Basic, oran sınırı, içerik türü) + admin cache dökümü şekli.
 * DB/Redis yok: her şey mock'lu.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { captureLogs, LogCapture } from '../../helpers/logCapture';

let producer: any;
jest.mock('@integration/engine/order/OrderQueueProducer', () => ({
  OrderQueueProducer: jest.fn().mockImplementation(() => {
    producer = { enqueueWebhookTriggeredSync: jest.fn(async () => ({ skipped: false })) };
    return producer;
  }),
}));
jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn() } }));

import { handleTrendyolWebhook, configureWebhookRoutes, webhookContentTypeGuard } from '@api/webhooks/WebhookApiManager';
import { safeEqual, parseBasicAuth, verifyWebhookHeaders } from '@api/webhooks/webhookAuth';
import { familyOfKey } from '@api/rpc/cacheDump';
import { DatabaseManagerInstance } from '@database/DatabaseManager';

function mockClient(integration: any) {
  const client = { clientId: 5, status: 'ACTIVE', integrations: [{ integrationCode: 'trendyol', webhookToken: 'tok-abc', ...integration }] };
  const updateOne = jest.fn(async () => ({}));
  (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue({
    getClientModel: () => ({ findOne: () => ({ lean: async () => client }), updateOne }),
  });
  return { updateOne };
}
const basic = (u: string, p: string) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  producer?.enqueueWebhookTriggeredSync?.mockClear();
});

describe('safeEqual / parseBasicAuth', () => {
  it('eşit/farklı/farklı-uzunluk/boş/string-olmayan', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
    expect(safeEqual(undefined, 'a')).toBe(false);
    expect(safeEqual(123 as any, '123')).toBe(false);
  });
  it('Basic ayrıştırma (parolada iki nokta üst üste korunur)', () => {
    expect(parseBasicAuth(basic('u', 'p:q'))).toEqual({ username: 'u', password: 'p:q' });
    expect(parseBasicAuth('Bearer x')).toBeNull();
    expect(parseBasicAuth(undefined)).toBeNull();
  });
});

describe('verifyWebhookHeaders', () => {
  it('yapılandırılmamış -> not-configured', () => {
    expect(verifyWebhookHeaders({}, {})).toBe('not-configured');
  });
  it('API_KEY doğru/yanlış/eksik ve özel başlık adı', () => {
    const i = { webhookAuthType: 'API_KEY', webhookApiKey: 'k1' };
    expect(verifyWebhookHeaders(i, { 'x-api-key': 'k1' })).toBe('ok');
    expect(verifyWebhookHeaders(i, { 'x-api-key': 'k2' })).toBe('fail');
    expect(verifyWebhookHeaders(i, {})).toBe('fail');
    expect(verifyWebhookHeaders({ ...i, webhookApiKeyHeader: 'X-Hook-Key' }, { 'x-hook-key': 'k1' })).toBe('ok');
  });
  it('API_KEY türü var ama sır yok -> fail-closed', () => {
    expect(verifyWebhookHeaders({ webhookAuthType: 'API_KEY' }, { 'x-api-key': 'x' })).toBe('fail');
  });
  it('BASIC doğru/yanlış', () => {
    const i = { webhookAuthType: 'BASIC', webhookUsername: 'u', webhookPassword: 'p' };
    expect(verifyWebhookHeaders(i, { authorization: basic('u', 'p') })).toBe('ok');
    expect(verifyWebhookHeaders(i, { authorization: basic('u', 'x') })).toBe('fail');
    expect(verifyWebhookHeaders(i, {})).toBe('fail');
  });
});

describe('handleTrendyolWebhook - başlık doğrulaması', () => {
  it('yapılandırılmamış: bugünkü davranış (200) + uyarı logu', async () => {
    mockClient({});
    const cap = captureLogs();
    expect(await handleTrendyolWebhook('tok-abc')).toEqual({ statusCode: 200 });
    // F-06: uyarı artık eventLog ile (code WEBHOOK_HEADER_AUTH_UNCONFIGURED, level warn) yazılır; console.warn değil.
    expect(cap.find((l) => l.code === 'WEBHOOK_HEADER_AUTH_UNCONFIGURED' && l.level === 'warn')).toBeDefined();
    cap.restore();
  });
  it('API_KEY yapılandırılmış: doğru başlık 200; yanlış/eksik başlık 404 (token yanlışıyla AYNI kod) ve iş eklenmez', async () => {
    const { updateOne } = mockClient({ webhookAuthType: 'API_KEY', webhookApiKey: 'k1' });
    expect(await handleTrendyolWebhook('tok-abc', { 'x-api-key': 'k1' })).toEqual({ statusCode: 200 });
    producer.enqueueWebhookTriggeredSync.mockClear(); updateOne.mockClear();
    const bad = await handleTrendyolWebhook('tok-abc', { 'x-api-key': 'yanlis' });
    const missing = await handleTrendyolWebhook('tok-abc', {});
    const badToken = await handleTrendyolWebhook('tok-yanlis', { 'x-api-key': 'k1' });
    expect(bad).toEqual({ statusCode: 404 });
    expect(missing).toEqual(bad);
    expect(badToken).toEqual(bad);
    expect(updateOne).not.toHaveBeenCalled();
    expect(producer.enqueueWebhookTriggeredSync).not.toHaveBeenCalled();
  });
  it('BASIC yapılandırılmış', async () => {
    mockClient({ webhookAuthType: 'BASIC', webhookUsername: 'u', webhookPassword: 'p' });
    expect(await handleTrendyolWebhook('tok-abc', { authorization: basic('u', 'p') })).toEqual({ statusCode: 200 });
    expect(await handleTrendyolWebhook('tok-abc', { authorization: basic('u', 'z') })).toEqual({ statusCode: 404 });
  });
  it('tekrar olay: aynı sinyal iki kez -> her seferinde aynı (tenant, entegrasyon) ile enqueue (10 sn jobId tekilleştirmesi producer tarafında)', async () => {
    mockClient({});
    await handleTrendyolWebhook('tok-abc'); await handleTrendyolWebhook('tok-abc');
    const calls = producer.enqueueWebhookTriggeredSync.mock.calls;
    expect(calls.map((c: any[]) => [c[0], c[1]])).toEqual([[5, 'trendyol'], [5, 'trendyol']]);
  });
});

describe('route: oran sınırı + içerik türü', () => {
  function collect() {
    let handlers: any[] = [];
    configureWebhookRoutes({ post: (_p: string, ...h: any[]) => { handlers = h; } } as any);
    return handlers;
  }
  it('iki oran sınırlayıcı + içerik türü koruması + raw gövde zincirde', () => {
    expect(collect().length).toBe(5);
  });
  it('token başına sınır aşılınca 429 (61. istek)', () => {
    const tokenLimiter = collect()[1];
    const mk = () => ({ res: { status: jest.fn().mockReturnThis(), send: jest.fn(), setHeader: jest.fn() }, next: jest.fn() });
    const req: any = { params: { hookToken: 'flood-tok' }, headers: {}, socket: { remoteAddress: '1.1.1.1' } };
    let last: any;
    for (let i = 0; i < 61; i++) { last = mk(); tokenLimiter(req, last.res, last.next); }
    expect(last.next).not.toHaveBeenCalled();
    expect(last.res.status).toHaveBeenCalledWith(429);
  });
  it('gövde varsa JSON dışı 415; JSON veya boş gövde geçer', () => {
    const run = (headers: any) => { const res: any = { status: jest.fn().mockReturnThis(), end: jest.fn() }; const next = jest.fn(); webhookContentTypeGuard({ headers } as any, res, next); return { res, next }; };
    expect(run({ 'content-length': '10', 'content-type': 'text/plain' }).res.status).toHaveBeenCalledWith(415);
    expect(run({ 'content-length': '10', 'content-type': 'application/json; charset=utf-8' }).next).toHaveBeenCalled();
    expect(run({}).next).toHaveBeenCalled();
  });
});

describe('cacheDump.familyOfKey', () => {
  it('yalnız aile adı; tenant kimliği/ham anahtar çıkmaz', () => {
    expect(familyOfKey('t:42:trendyol:ctx.Svc.m:abcdef')).toBe('ctx.Svc.m');
    expect(familyOfKey('g:trendyol:tcat.Svc.m:abcdef')).toBe('tcat.Svc.m');
    expect(familyOfKey('legacy-key-1')).toBe('unknown');
  });
});
