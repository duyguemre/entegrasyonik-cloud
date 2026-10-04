// [eslesme-fiyat WP7b, F-11 / K-J] Hepsiburada + Ideasoft webhook alıcıları, HMAC doğrulama, tekrar oynatma, belirteç indeksi göçü 0032.
// DB/Redis/ağ YOK: DatabaseManager ve OrderQueueProducer sahte.
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createHmac } from 'crypto';
import { encryptField } from '@utils/FieldCrypto';

let producer: any;
jest.mock('@integration/engine/order/OrderQueueProducer', () => ({
    OrderQueueProducer: jest.fn().mockImplementation(() => {
        producer = { enqueueWebhookTriggeredSync: jest.fn(async () => ({ jobId: 'j', skipped: false })) };
        return producer;
    }),
}));
const getClientDB = jest.fn<any>();
jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: (...a: any[]) => getClientDB(...a) } }));

import { handleHepsiburadaWebhook, handleIdeasoftWebhook, configureChannelWebhookRoutes, markReplay, resetReplayCache } from '@api/webhooks/ChannelWebhookApiManager';
import * as fs from 'fs';
import * as path from 'path';
import { verifyHmacSha256 } from '@api/webhooks/webhookAuth';
import { hbEventKind, HB_WEBHOOK_EVENTS, WEBHOOK_CHANNELS, isWebhookChannel } from '@integration/contracts/webhookChannels';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { rotateWebhookToken } from '@operations/integrations/settings';
import { ClientSchema } from '../../../src/database/application/models/Client';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migrate = require('../../../dev-tools/migrate');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifest = require('../../../migrations/index-manifest.json');

const SECRET = 'cs_' + 'a'.repeat(40);
const TOKEN = 'tok-' + 'b'.repeat(60);
const sign = (body: Buffer | string, secret = SECRET, enc: 'base64' | 'hex' = 'base64') => createHmac('sha256', secret).update(body).digest(enc);

function mockClient(integration: any | null, updateOne = jest.fn(async () => ({}))) {
    const client = integration ? { clientId: 5, status: 'ACTIVE', integrations: [{ webhookToken: TOKEN, status: true, ...integration }] } : null;
    (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue({ getClientModel: () => ({ findOne: () => ({ lean: async () => client }), updateOne }) });
    return { updateOne };
}
function mockTenantSecret(secret: string | undefined) {
    getClientDB.mockResolvedValue({
        getClientIntegrationModel: () => ({ findOne: () => ({ lean: async () => ({ ecommerce: [{ code: 'ideasoft', settings: secret === undefined ? {} : { secret } }] }) }) }),
    });
}

beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    producer?.enqueueWebhookTriggeredSync?.mockClear();
    getClientDB.mockReset();
    resetReplayCache();
});

describe('webhookChannels (saf)', () => {
    it('alıcısı olan kanallar; HB 12 olay → 8 orders / 4 claims; büyük-küçük harf duyarsız; bilinmeyen undefined', () => {
        expect(WEBHOOK_CHANNELS).toEqual(['trendyol', 'hepsiburada', 'ideasoft']);
        expect(isWebhookChannel('n11')).toBe(false);
        const kinds = Object.values(HB_WEBHOOK_EVENTS);
        expect(kinds.filter((k) => k === 'orders')).toHaveLength(8);
        expect(kinds.filter((k) => k === 'claims')).toHaveLength(4);
        expect(hbEventKind('CreateOrder')).toBe('orders');
        expect(hbEventKind('awaitingPreApproval')).toBe('claims');
        expect(hbEventKind('order.created')).toBeUndefined();
        expect(hbEventKind(undefined)).toBeUndefined();
    });
});

describe('verifyHmacSha256 (Ideasoft imzası)', () => {
    const body = Buffer.from('{"topic":"order/update","id":42}');
    it('Base64 ve hex imza geçer; yanlış sır / bozuk imza / farklı gövde / boş sır / dizi başlık geçmez', () => {
        expect(verifyHmacSha256(body, sign(body), SECRET)).toBe(true);
        expect(verifyHmacSha256(body, ' ' + sign(body) + '\n', SECRET)).toBe(true);
        expect(verifyHmacSha256(body, sign(body, SECRET, 'hex'), SECRET)).toBe(true);
        expect(verifyHmacSha256(body, [sign(body)], SECRET)).toBe(true);
        expect(verifyHmacSha256(body, sign(body, 'other'), SECRET)).toBe(false);
        expect(verifyHmacSha256(Buffer.from('{"id":43}'), sign(body), SECRET)).toBe(false);
        expect(verifyHmacSha256(body, 'not-a-signature', SECRET)).toBe(false);
        expect(verifyHmacSha256(body, sign(body, ''), '')).toBe(false);
        expect(verifyHmacSha256(body, undefined, SECRET)).toBe(false);
        expect(verifyHmacSha256(body, sign(body), undefined)).toBe(false);
    });
    it('boş gövde geçerli imzayla doğrulanır; gövde yoksa boş sayılır', () => {
        expect(verifyHmacSha256(Buffer.alloc(0), sign(Buffer.alloc(0)), SECRET)).toBe(true);
        expect(verifyHmacSha256(undefined, sign(Buffer.alloc(0)), SECRET)).toBe(true);
    });
});

describe('handleHepsiburadaWebhook', () => {
    it('sipariş olayı → orders sinyali; claim olayı → claims sinyali (entegrasyon kaydı iade imleci için geçer); sağlık alanları yazılır', async () => {
        const integ = { integrationCode: 'hepsiburada', lastSuccessfulOrderSync: new Date('2026-10-01T00:00:00Z'), lastClaimSync: new Date('2026-09-30T00:00:00Z') };
        const { updateOne } = mockClient(integ);
        expect(await handleHepsiburadaWebhook({ hookToken: TOKEN, event: 'createPackages' })).toEqual({ statusCode: 200 });
        expect(producer.enqueueWebhookTriggeredSync).toHaveBeenCalledWith(5, 'hepsiburada', integ.lastSuccessfulOrderSync, 'orders', expect.objectContaining({ lastClaimSync: integ.lastClaimSync }));
        expect(updateOne).toHaveBeenCalledWith({ clientId: 5, 'integrations.integrationCode': 'hepsiburada' }, { $set: expect.objectContaining({ 'integrations.$.webhookHealthy': true }) });
        expect(await handleHepsiburadaWebhook({ hookToken: TOKEN, event: 'disputedClaimResult' })).toEqual({ statusCode: 200 });
        expect(producer.enqueueWebhookTriggeredSync).toHaveBeenLastCalledWith(5, 'hepsiburada', expect.anything(), 'claims', expect.anything());
    });
    it('bilinmeyen olay / belirteç yok / başka kanalın belirteci / pasif entegrasyon → 404, iş eklenmez', async () => {
        mockClient({ integrationCode: 'hepsiburada' });
        expect(await handleHepsiburadaWebhook({ hookToken: TOKEN, event: 'order.created' })).toEqual({ statusCode: 404 });
        expect(await handleHepsiburadaWebhook({ hookToken: '', event: 'createOrder' })).toEqual({ statusCode: 404 });
        mockClient({ integrationCode: 'trendyol' });
        expect(await handleHepsiburadaWebhook({ hookToken: TOKEN, event: 'createOrder' })).toEqual({ statusCode: 404 });
        mockClient({ integrationCode: 'hepsiburada', status: false });
        expect(await handleHepsiburadaWebhook({ hookToken: TOKEN, event: 'createOrder' })).toEqual({ statusCode: 404 });
        mockClient(null);
        expect(await handleHepsiburadaWebhook({ hookToken: TOKEN, event: 'createOrder' })).toEqual({ statusCode: 404 });
        expect(producer.enqueueWebhookTriggeredSync).not.toHaveBeenCalled();
    });
    it('API_KEY başlık doğrulaması yapılandırılmışsa zorunlu (yanlış → 404, doğru → 200); yapılandırılmamışsa yalnız belirteç', async () => {
        mockClient({ integrationCode: 'hepsiburada', webhookAuthType: 'API_KEY', webhookApiKey: 'k1' });
        expect(await handleHepsiburadaWebhook({ hookToken: TOKEN, event: 'deliver', headers: { 'x-api-key': 'wrong' } })).toEqual({ statusCode: 404 });
        expect(await handleHepsiburadaWebhook({ hookToken: TOKEN, event: 'deliver', headers: { 'x-api-key': 'k1' } })).toEqual({ statusCode: 200 });
        mockClient({ integrationCode: 'hepsiburada' });
        expect(await handleHepsiburadaWebhook({ hookToken: TOKEN, event: 'deliver' })).toEqual({ statusCode: 200 });
    });
    it('DB hatası → 500', async () => {
        (DatabaseManagerInstance.getApplicationDB as any).mockRejectedValue(new Error('mongo down'));
        expect(await handleHepsiburadaWebhook({ hookToken: TOKEN, event: 'deliver' })).toEqual({ statusCode: 500 });
    });
});

describe('handleIdeasoftWebhook', () => {
    const body = Buffer.from('{"topic":"order/create","id":1}');
    it('tenant DB\'deki şifreli client secret ile geçerli imza → 200 + orders sinyali; sır yalnız HMAC için okunur', async () => {
        mockClient({ integrationCode: 'ideasoft' });
        mockTenantSecret(encryptField(SECRET));
        expect(await handleIdeasoftWebhook({ hookToken: TOKEN, rawBody: body, headers: { 'x-ideashop-hmac-sha256': sign(body) } })).toEqual({ statusCode: 200 });
        expect(getClientDB).toHaveBeenCalledWith(5);
        expect(producer.enqueueWebhookTriggeredSync).toHaveBeenCalledWith(5, 'ideasoft', expect.any(Date), 'orders', expect.anything());
    });
    it('Clients.integrations[].webhookSecret önceliklidir (tenant DB\'ye gidilmez)', async () => {
        mockClient({ integrationCode: 'ideasoft', webhookSecret: encryptField('override-secret') });
        expect(await handleIdeasoftWebhook({ hookToken: TOKEN, rawBody: body, headers: { 'x-ideashop-hmac-sha256': sign(body, 'override-secret') } })).toEqual({ statusCode: 200 });
        expect(getClientDB).not.toHaveBeenCalled();
    });
    it('imza yok / yanlış / gövde değişmiş / sır yok → 404 (fail-closed), iş eklenmez', async () => {
        mockClient({ integrationCode: 'ideasoft' });
        mockTenantSecret(SECRET);
        expect(await handleIdeasoftWebhook({ hookToken: TOKEN, rawBody: body, headers: {} })).toEqual({ statusCode: 404 });
        expect(await handleIdeasoftWebhook({ hookToken: TOKEN, rawBody: body, headers: { 'x-ideashop-hmac-sha256': sign(body, 'other') } })).toEqual({ statusCode: 404 });
        expect(await handleIdeasoftWebhook({ hookToken: TOKEN, rawBody: Buffer.from('{"id":2}'), headers: { 'x-ideashop-hmac-sha256': sign(body) } })).toEqual({ statusCode: 404 });
        mockTenantSecret(undefined);
        expect(await handleIdeasoftWebhook({ hookToken: TOKEN, rawBody: body, headers: { 'x-ideashop-hmac-sha256': sign(body) } })).toEqual({ statusCode: 404 });
        expect(producer.enqueueWebhookTriggeredSync).not.toHaveBeenCalled();
    });
    it('tekrar oynatma: aynı belirteç + aynı gövde 10 dk içinde → 200 ama sinyal YOK; farklı gövde yeni sinyal', async () => {
        mockClient({ integrationCode: 'ideasoft' });
        mockTenantSecret(SECRET);
        const h = { 'x-ideashop-hmac-sha256': sign(body) };
        expect(await handleIdeasoftWebhook({ hookToken: TOKEN, rawBody: body, headers: h })).toEqual({ statusCode: 200 });
        expect(await handleIdeasoftWebhook({ hookToken: TOKEN, rawBody: body, headers: h })).toEqual({ statusCode: 200 });
        expect(producer.enqueueWebhookTriggeredSync).toHaveBeenCalledTimes(1);
        const b2 = Buffer.from('{"topic":"order/update","id":1}');
        expect(await handleIdeasoftWebhook({ hookToken: TOKEN, rawBody: b2, headers: { 'x-ideashop-hmac-sha256': sign(b2) } })).toEqual({ statusCode: 200 });
        expect(producer.enqueueWebhookTriggeredSync).toHaveBeenCalledTimes(2);
    });
    it('markReplay penceresi: 10 dk sonra aynı gövde yeniden kabul edilir', () => {
        const b = Buffer.from('x');
        expect(markReplay('t', b, 0)).toBe(false);
        expect(markReplay('t', b, 5 * 60_000)).toBe(true);
        expect(markReplay('t', b, 11 * 60_000)).toBe(false);
        expect(markReplay('t2', b, 11 * 60_000)).toBe(false); // başka belirteç ayrı
    });
});

describe('rotalar', () => {
    it('HB PUT+POST `/hooks/hepsiburada/:hookToken/:event`, IS POST `/hooks/ideasoft/:hookToken`; Webserver authenticate\'ten önce bağlar', () => {
        const app: any = { post: jest.fn(), put: jest.fn() };
        configureChannelWebhookRoutes(app);
        expect(app.put.mock.calls.map((c: any) => c[0])).toEqual(['/hooks/hepsiburada/:hookToken/:event']);
        expect(app.post.mock.calls.map((c: any) => c[0])).toEqual(['/hooks/hepsiburada/:hookToken/:event', '/hooks/ideasoft/:hookToken']);
        const src = fs.readFileSync(path.resolve(__dirname, '../../../src/bootstrap/Webserver.ts'), 'utf8');
        const a = src.indexOf('configureWebhookRoutes(this.app)'), b = src.indexOf('configureChannelWebhookRoutes(this.app)'), c = src.indexOf('authenticate');
        expect(a).toBeGreaterThan(-1); expect(b).toBeGreaterThan(a);
        expect(c === -1 || c > b || src.lastIndexOf('authenticate') > b).toBe(true);
    });
});

describe('rotateWebhookToken — yalnız alıcısı olan kanallar', () => {
    const catalog: any = { rotateWebhookToken: jest.fn(async () => ({ ok: 1 })) };
    it('hepsiburada/ideasoft için belirteç üretir; n11 için 400 NOT_SUPPORTED', async () => {
        for (const code of ['hepsiburada', 'ideasoft']) {
            const r = await rotateWebhookToken(catalog, 7, code);
            expect(r.webhookToken).toMatch(/^[a-f0-9]{64}$/);
        }
        await expect(rotateWebhookToken(catalog, 7, 'n11')).rejects.toMatchObject({ statusCode: 400, code: 'NOT_SUPPORTED' });
    });
});

describe('göç 0032 — Clients integrations_webhookToken', () => {
    const m32 = migrate.findMigration(migrate.discoverMigrations(), '0032-clients-webhook-token-index-app');
    it('şema beyanı = göç = manifest (sparse, çok-anahtarlı; unique DEĞİL)', () => {
        const i = m32.TARGETS[0].indexes[0];
        const { name, ...rest } = i.options;
        const decl = (ClientSchema as any).indexes().find(([, o]: any) => o?.name === name);
        expect(decl[0]).toEqual(i.fields);
        expect(rest).toEqual({ sparse: true });
        expect(manifest.app.Clients.find((e: any) => e.name === name)).toEqual({ name, fields: i.fields, options: rest });
    });
    it('plan belirteçli entegrasyon sayısını raporlar (yazmaz); up kurar; izinsiz DB reddedilir', async () => {
        const createIndex = jest.fn(async () => 'ok');
        const coll = { collectionName: 'Clients', indexes: async () => [], createIndex, dropIndex: jest.fn(), countDocuments: jest.fn(async () => 12) };
        const ctx = { dbname: 'entegrasyonikDB', connection: { db: { collection: () => coll } } };
        const p = await m32.plan(ctx);
        expect(p.collections[0].integrationsWithToken).toBe(12);
        expect(createIndex).not.toHaveBeenCalled();
        await m32.up(ctx);
        expect(createIndex).toHaveBeenCalledWith({ 'integrations.webhookToken': 1 }, expect.objectContaining({ name: 'integrations_webhookToken', sparse: true }));
        await expect(m32.plan({ ...ctx, dbname: 'baska_proje' })).rejects.toThrow();
    });
});
