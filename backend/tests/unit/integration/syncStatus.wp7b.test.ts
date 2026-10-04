// [eslesme-fiyat WP7b] Senkron durumu (PLAN §3.5, F-07) + manuel tetik (F-10). DB/Redis/ağ YOK; Mongo/BullMQ sahte.
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const queueAdd = jest.fn<any>();
jest.mock('bullmq', () => ({ Queue: jest.fn().mockImplementation(() => ({ add: queueAdd })) }));
let redisReady = true;
jest.mock('@services/redis/RedisService', () => ({ RedisService: { isReady: () => redisReady, getConnectionConfig: () => ({}) } }));
const clientModel = { updateOne: jest.fn<any>(), findOne: jest.fn<any>() };
jest.mock('@database/index', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn(async () => ({ getClientModel: () => clientModel })) } }));
jest.mock('@services/notification/NotificationService', () => ({ NotificationService: { notify: jest.fn() } }));
jest.mock('@services/billing/EntitlementService', () => ({ EntitlementService: { checkAccess: jest.fn() } }));

import {
    readSyncState, syncSuccessUpdate, syncFailureUpdate, latestOrderSuccessAt, errorCodeFromMessage, safeSyncErrorCode, LEGACY_CURSOR_KIND,
} from '@platform/core/sync/syncState';
import { syncNow, manualSyncJobId, SYNC_NOW_COOLDOWN_MS, type SyncNowDeps } from '../../../src/operations/integrations/syncNow';
import { OrderRepository } from '@database/repositories/tenant/OrderRepository';
import { OrderErrorHandler } from '@integration/engine/order/OrderErrorHandler';
import { OrderQueueProducer } from '@integration/engine/order/OrderQueueProducer';
import { isLiveReadonlyBlockedRpc } from '../../../src/api/rpc/liveReadonlyRpcGuard';
import { isIntakeGatedRpc } from '../../../src/api/rpc/intakeRpcGuard';
import { buildIntegrationHealth } from '../../../src/operations/integrations/health';

const NOW = new Date('2026-10-04T10:00:00.000Z');
const MIN = 60 * 1000;

beforeEach(() => {
    queueAdd.mockReset();
    clientModel.updateOne.mockReset();
    clientModel.findOne.mockReset();
    redisReady = true;
});

describe('syncState (saf sözleşme)', () => {
    it('başarı: lastSuccessAt = lastAttemptAt, imleç, lastError silinir (konumsal yol)', () => {
        const c = new Date(NOW.getTime() - 5 * MIN);
        expect(syncSuccessUpdate('claims', NOW, c)).toEqual({
            $set: { 'integrations.$.sync.claims.lastSuccessAt': NOW, 'integrations.$.sync.claims.lastAttemptAt': NOW, 'integrations.$.sync.claims.cursor': c },
            $unset: { 'integrations.$.sync.claims.lastError': '' },
        });
    });
    it('hata: yalnız lastAttemptAt + lastError{code, at}; ham mesaj/geçersiz kod yazılmaz', () => {
        expect(syncFailureUpdate('orders', 'AUTH', NOW)).toEqual({ $set: { 'integrations.$.sync.orders.lastAttemptAt': NOW, 'integrations.$.sync.orders.lastError': { code: 'AUTH', at: NOW } } });
        expect(syncFailureUpdate('orders', 'token abc=123 sızdı', NOW).$set['integrations.$.sync.orders.lastError']).toEqual({ code: 'UNKNOWN', at: NOW });
        expect(errorCodeFromMessage('[RATE_LIMITED] 429')).toBe('RATE_LIMITED');
        expect(errorCodeFromMessage('düz hata')).toBe('UNKNOWN');
        expect(safeSyncErrorCode(undefined)).toBe('UNKNOWN');
    });
    it('okuma: yeni alan yoksa eski imleçten türetilir; yeni alan varsa o kazanır', () => {
        const legacy = new Date(NOW.getTime() - 10 * MIN);
        const s = readSyncState({ lastSuccessfulOrderSync: legacy, lastMessageSync: legacy.toISOString(), sync: { claims: { lastSuccessAt: NOW, lastError: { code: 'AUTH', at: NOW } } } });
        expect(s.orders).toEqual({ lastSuccessAt: legacy, lastAttemptAt: legacy, lastError: null, cursor: legacy });
        expect(s.messages.lastSuccessAt).toEqual(legacy);
        expect(s.claims).toMatchObject({ lastSuccessAt: NOW, lastError: { code: 'AUTH', at: NOW } });
        expect(s.finance).toEqual({ lastSuccessAt: null, lastAttemptAt: null, lastError: null, cursor: null });
        expect(Object.keys(s)).toEqual(['orders', 'claims', 'messages', 'finance', 'products', 'catalog']);
        expect(readSyncState(undefined).orders.lastSuccessAt).toBeNull();
    });
    it('[F-07] tenant düzeyi: etkin entegrasyonların en yeni sipariş başarısı (pasif sayılmaz)', () => {
        const a = new Date(NOW.getTime() - 30 * MIN), b = new Date(NOW.getTime() - 3 * MIN);
        expect(latestOrderSuccessAt([{ status: true, sync: { orders: { lastSuccessAt: a } } }, { status: false, sync: { orders: { lastSuccessAt: NOW } } }, { status: true, lastSuccessfulOrderSync: b }])).toEqual(b);
        expect(latestOrderSuccessAt(null)).toBeNull();
    });
    it('eski imleç alanı → tür eşlemesi (tam süpürme alanları senkron durumu değil)', () => {
        expect(LEGACY_CURSOR_KIND).toEqual({ lastSuccessfulOrderSync: 'orders', lastClaimSync: 'claims', lastMessageSync: 'messages', lastFinanceSync: 'finance' });
    });
});

describe('OrderRepository — sync.* yazımı', () => {
    it('[F-07] sipariş imleci: eski alan + sync.orders + üst seviye $max', async () => {
        const cursor = new Date(NOW.getTime() - 5 * MIN);
        await new OrderRepository().updateLastSyncTimestamp(7, 'trendyol', cursor, NOW);
        expect(clientModel.updateOne).toHaveBeenCalledWith(
            { clientId: 7, 'integrations.integrationCode': 'trendyol' },
            {
                $set: { 'integrations.$.lastSuccessfulOrderSync': cursor, 'integrations.$.sync.orders.lastSuccessAt': NOW, 'integrations.$.sync.orders.lastAttemptAt': NOW, 'integrations.$.sync.orders.cursor': cursor },
                $unset: { 'integrations.$.sync.orders.lastError': '' },
                $max: { lastSuccessfulOrderSync: NOW },
            },
        );
    });
    it('kaynak imleci: senkron türü olan alan sync.<kind> da yazar; tam süpürme alanı yalnız kendisi', async () => {
        await new OrderRepository().updateSourceSyncCursor(7, 'n11', 'lastClaimSync', NOW);
        const [, u1] = clientModel.updateOne.mock.calls[0] as any[];
        expect(u1.$set).toMatchObject({ 'integrations.$.lastClaimSync': NOW, 'integrations.$.sync.claims.cursor': NOW });
        expect(u1.$unset).toEqual({ 'integrations.$.sync.claims.lastError': '' });
        await new OrderRepository().updateSourceSyncCursor(7, 'n11', 'lastClaimFullSweepAt', NOW);
        expect(clientModel.updateOne.mock.calls[1][1]).toEqual({ $set: { 'integrations.$.lastClaimFullSweepAt': NOW } });
    });
    it('recordSyncFailure: DB hatası yutulur', async () => {
        clientModel.updateOne.mockRejectedValueOnce(new Error('mongo down'));
        await expect(new OrderRepository().recordSyncFailure(7, 'n11', 'finance', 'UNAVAILABLE', NOW)).resolves.toBeUndefined();
    });
});

describe('OrderErrorHandler — başarısız iş sync.<kind>.lastError yazar', () => {
    it('kind yoksa orders; ham mesaj değil kod', async () => {
        clientModel.updateOne.mockResolvedValue({});
        const job: any = { id: 'j1', data: { clientId: 7, integrationCode: 'hepsiburada', kind: 'messages' }, attemptsMade: 1, opts: { attempts: 5 } };
        await new OrderErrorHandler().handleFailedJob(job, '[UNAVAILABLE] 503 https://x?token=abc');
        const call = clientModel.updateOne.mock.calls.find((c: any) => c[1]?.$set?.['integrations.$.sync.messages.lastError']) as any;
        expect(call[0]).toEqual({ clientId: 7, 'integrations.integrationCode': 'hepsiburada' });
        expect(call[1].$set['integrations.$.sync.messages.lastError'].code).toBe('UNAVAILABLE');
        clientModel.updateOne.mockClear();
        await new OrderErrorHandler().handleFailedJob({ ...job, data: { clientId: 7, integrationCode: 'n11' } }, 'beklenmeyen');
        expect((clientModel.updateOne.mock.calls[0] as any)[1].$set['integrations.$.sync.orders.lastError'].code).toBe('UNKNOWN');
    });
});

describe('syncNow (F-10)', () => {
    const integ = (o: any = {}) => ({ integrationCode: 'trendyol', status: true, type: 'marketplace', ...o });
    const deps = (o: Partial<SyncNowDeps> = {}): SyncNowDeps & { enqueue: any } => ({
        clientModel: { findOne: jest.fn(() => ({ lean: async () => ({ clientId: 7, integrations: [integ()] }) })), updateOne: jest.fn(async () => ({ modifiedCount: 1 })) },
        clientId: 7,
        allowNewWork: () => true,
        liveReadonly: false,
        enqueue: jest.fn(async (a: any) => ({ jobId: a.jobId, skipped: false })),
        now: () => NOW,
        ...o,
    }) as any;

    it('kabul: 5 dk pencereli jobId, atomik soğuma koşulu, tenant principal\'dan', async () => {
        const d = deps();
        const r = await syncNow({ integrationCode: 'trendyol', kind: 'claims' }, d);
        const jobId = manualSyncJobId(7, 'trendyol', 'claims', NOW.getTime());
        expect(jobId).toBe(`manual_7_trendyol_claims_${Math.floor(NOW.getTime() / SYNC_NOW_COOLDOWN_MS)}`);
        expect(r).toMatchObject({ accepted: true, jobId, kind: 'claims', nextAllowedAt: new Date(NOW.getTime() + SYNC_NOW_COOLDOWN_MS) });
        const [filter, update] = (d.clientModel.updateOne as any).mock.calls[0];
        expect(filter.clientId).toBe(7);
        expect(filter.integrations.$elemMatch.$or[1]).toEqual({ 'sync.claims.manualRequestedAt': { $lte: new Date(NOW.getTime() - SYNC_NOW_COOLDOWN_MS) } });
        expect(update).toEqual({ $set: { 'integrations.$.sync.claims.manualRequestedAt': NOW } });
        expect(d.enqueue).toHaveBeenCalledWith(expect.objectContaining({ clientId: 7, integrationCode: 'trendyol', kind: 'claims', jobId }));
    });
    it('varsayılan tür orders', async () => {
        expect((await syncNow({ integrationCode: 'trendyol' }, deps())).kind).toBe('orders');
    });
    it('soğuma: koşullu yazım eşleşmezse 429 RATE_LIMITED + retryAfterSec, iş eklenmez', async () => {
        const last = new Date(NOW.getTime() - 2 * MIN);
        const d = deps({ clientModel: { findOne: jest.fn(() => ({ lean: async () => ({ integrations: [integ({ sync: { orders: { manualRequestedAt: last } } })] }) })), updateOne: jest.fn(async () => ({ modifiedCount: 0 })) } });
        await expect(syncNow({ integrationCode: 'trendyol' }, d)).rejects.toMatchObject({ statusCode: 429, code: 'RATE_LIMITED', details: { retryAfterSec: 180 } });
        expect(d.enqueue).not.toHaveBeenCalled();
    });
    it('kapılar: LIVE_READONLY 423, kill-switch 503, kayıtsız/pasif 404, needsAttention 502 AUTH, geçersiz tür 400', async () => {
        await expect(syncNow({ integrationCode: 'trendyol' }, deps({ liveReadonly: true }))).rejects.toMatchObject({ statusCode: 423, code: 'LIVE_READONLY' });
        await expect(syncNow({ integrationCode: 'trendyol' }, deps({ allowNewWork: () => false }))).rejects.toMatchObject({ statusCode: 503, code: 'INTEGRATION_PAUSED' });
        const one = (i: any) => deps({ clientModel: { findOne: jest.fn(() => ({ lean: async () => (i ? { integrations: [i] } : null) })), updateOne: jest.fn(async () => ({ modifiedCount: 1 })) } });
        await expect(syncNow({ integrationCode: 'trendyol' }, one(null))).rejects.toMatchObject({ statusCode: 404 });
        await expect(syncNow({ integrationCode: 'trendyol' }, one(integ({ status: false })))).rejects.toMatchObject({ statusCode: 404 });
        await expect(syncNow({ integrationCode: 'trendyol' }, one(integ({ type: 'erp' })))).rejects.toMatchObject({ statusCode: 404 });
        await expect(syncNow({ integrationCode: 'trendyol' }, one(integ({ needsAttention: { reason: 'AUTH' } })))).rejects.toMatchObject({ statusCode: 502, code: 'AUTH' });
        await expect(syncNow({ integrationCode: 'trendyol', kind: 'products' as any }, deps())).rejects.toMatchObject({ statusCode: 400 });
    });
    it('kuyruk yoksa soğuma geri alınır ve 503 QUEUE_UNAVAILABLE', async () => {
        const d = deps({ enqueue: jest.fn(async () => ({ jobId: '', skipped: true })) as any });
        await expect(syncNow({ integrationCode: 'trendyol' }, d)).rejects.toMatchObject({ statusCode: 503, code: 'QUEUE_UNAVAILABLE' });
        expect((d.clientModel.updateOne as any).mock.calls[1][1]).toEqual({ $unset: { 'integrations.$.sync.orders.manualRequestedAt': '' } });
    });
    it('RPC merkezî kapıları: LIVE_READONLY ve kill-switch kancası syncNow\'u kapsar (yetenek external + write)', () => {
        expect(isLiveReadonlyBlockedRpc('IntegrationService', 'syncNow')).toBe(true);
        expect(isIntakeGatedRpc('IntegrationService', 'syncNow')).toEqual({ gated: true, effect: 'write' });
    });
});

describe('OrderQueueProducer.enqueueManualSync', () => {
    it('kanal kuyruğuna, verilen jobId ile, isManualTrigger; tür penceresi imleçten (tam süpürme yok)', async () => {
        queueAdd.mockResolvedValue({ id: 'manual_7_n11_claims_1' });
        const cursor = new Date(NOW.getTime() - 60 * MIN);
        const r = await new OrderQueueProducer().enqueueManualSync({ clientId: 7, integrationCode: 'n11', kind: 'claims', jobId: 'manual_7_n11_claims_1', integration: { lastClaimSync: cursor }, now: NOW });
        expect(r).toEqual({ jobId: 'manual_7_n11_claims_1', skipped: false });
        const [name, data, opts] = queueAdd.mock.calls[0] as any[];
        expect(name).toBe('claims-n11');
        expect(opts).toEqual({ jobId: 'manual_7_n11_claims_1' });
        expect(data).toMatchObject({ clientId: 7, integrationCode: 'n11', kind: 'claims', isManualTrigger: true });
        expect(data.claimSync.isFullSweep).toBe(false);
        expect(data.claimSync.endDate).toEqual(NOW);
        expect(data.claimSync.startDate.getTime()).toBeLessThan(cursor.getTime());
        expect(data.financeSync).toBeUndefined();
    });
    it('Redis hazır değilse eklemez (skipped)', async () => {
        redisReady = false;
        expect(await new OrderQueueProducer().enqueueManualSync({ clientId: 7, integrationCode: 'n11', kind: 'orders', jobId: 'x', integration: {}, now: NOW })).toEqual({ jobId: '', skipped: true });
        expect(queueAdd).not.toHaveBeenCalled();
    });
});

describe('health.ts — sync.* ve needsAttention (PLAN §3.5)', () => {
    it('DTO tür başına durum (imleç ÇIKMAZ), lastSuccessfulSyncAt sync.orders\'tan, needsAttention kısa', async () => {
        const legacy = new Date(NOW.getTime() - 20 * MIN);
        const applicationDB = {
            getIntegrationCallMetricModel: () => ({ aggregate: async () => [] }),
            getClientModel: () => ({ findOne: () => ({ lean: async () => ({ integrations: [
                { integrationCode: 'trendyol', status: true, type: 'marketplace', lastSuccessfulOrderSync: legacy, sync: { orders: { lastSuccessAt: NOW, cursor: legacy }, claims: { lastError: { code: 'AUTH', at: NOW } } }, needsAttention: { reason: 'AUTH', since: NOW, failures: 3 }, webhookToken: 'gizli' },
            ] }) }) }),
        };
        const r = await buildIntegrationHealth({ applicationDB, clientDB: null, clientId: 7, now: () => NOW });
        const it0: any = r.integrations[0];
        expect(it0.lastSuccessfulSyncAt).toEqual(NOW);
        expect(it0.sync.orders).toEqual({ lastSuccessAt: NOW, lastAttemptAt: NOW, lastError: null });
        expect(it0.sync.claims.lastError).toEqual({ code: 'AUTH', at: NOW });
        expect(JSON.stringify(it0)).not.toContain('cursor');
        expect(JSON.stringify(it0)).not.toContain('gizli');
        expect(it0.needsAttention).toEqual({ reason: 'AUTH', since: NOW });
    });
});

describe('§3.6 sync.* ayar kataloğu', () => {
    it('anahtarlar katalogda; kanal eşzamanlılığı varsayılanı PLAN §3.5 tablosu; soğuma 5 dk', () => {
        const { getSettingDef } = require('../../../src/integration/config/catalog');
        const conc = getSettingDef('sync.queue.concurrency');
        expect(conc.default).toEqual({ _: 1, trendyol: 5, hepsiburada: 3, n11: 3, pazarama: 3, ideasoft: 2, bizimhesap: 1 });
        expect(conc.scope).toBe('integration');
        expect(getSettingDef('sync.manual.cooldownMs').default).toBe(300000);
    });
    it('işçi eşzamanlılığı ayardan (geçersiz kılma yokken = sabit tablo)', () => {
        const { queueConcurrency } = require('../../../src/integration/engine/order/worker-runner');
        expect(['trendyol', 'hepsiburada', 'ideasoft', 'bizimhesap', 'other'].map((c) => queueConcurrency(`order-sync-${c}`))).toEqual([5, 3, 2, 1, 1]);
    });
    it('üretici aralıkları (geçersiz kılma yokken) = PLAN §3.6 / order.config.json', () => {
        const { resolveSyncIntervals } = require('../../../src/integration/engine/order/OrderQueueProducer');
        expect(resolveSyncIntervals()).toEqual({ orders: 300000, webhookReconcile: 600000, claims: 900000, finance: 21600000, messages: 600000 });
    });
    it('syncNow soğuma ayarı: pencere ve retryAfter ayardan; 60 sn altı yok sayılır', async () => {
        const mk = (cooldownMs: number, modified = 1) => ({
            clientModel: { findOne: jest.fn(() => ({ lean: async () => ({ integrations: [{ integrationCode: 'n11', status: true, type: 'marketplace', sync: { orders: { manualRequestedAt: NOW } } }] }) })), updateOne: jest.fn(async () => ({ modifiedCount: modified })) },
            clientId: 7, allowNewWork: () => true, liveReadonly: false, now: () => NOW, cooldownMs,
            enqueue: jest.fn(async (a: any) => ({ jobId: a.jobId, skipped: false })),
        }) as any;
        const r = await syncNow({ integrationCode: 'n11' }, mk(600000));
        expect(r.nextAllowedAt).toEqual(new Date(NOW.getTime() + 600000));
        expect(r.jobId).toBe(manualSyncJobId(7, 'n11', 'orders', NOW.getTime(), 600000));
        await expect(syncNow({ integrationCode: 'n11' }, mk(600000, 0))).rejects.toMatchObject({ details: { retryAfterSec: 600 } });
        expect((await syncNow({ integrationCode: 'n11' }, mk(1000))).nextAllowedAt).toEqual(new Date(NOW.getTime() + SYNC_NOW_COOLDOWN_MS));
    });
});
