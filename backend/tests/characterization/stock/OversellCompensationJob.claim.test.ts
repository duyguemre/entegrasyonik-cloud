/**
 * CHARACTERIZATION (Protokol 13): OversellCompensationJob -- çok-pod / üst üste binen tur güvenliği (GV-08).
 * Bugünkü hata: grace sonrası OVERSOLD satır için `rejectOrder` çağrısından ÖNCE atomik talep (claim/lease)
 * alınmıyor; iki eşzamanlı `run()` (iki pod veya üst üste binen tur) AYNI satır için ÇİFT pazaryeri iptali atar.
 * DB/Redis/ağ YOK: paylaşılan durumlu, bellek-içi sahte `Orders` modeli (atomik `findOneAndUpdate` semantiğiyle).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({
    DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() },
}));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { isReady: jest.fn() } }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@services/notification/NotificationService', () => require('../../helpers/notificationServiceMock').notificationServiceModule());

import { OversellCompensationJob } from '@operations/stock/OversellCompensationJob';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { RedisService } from '@services/redis/RedisService';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { NotificationService } from '@services/notification/NotificationService';

const factoryCtor = IntegrationFactory as unknown as jest.Mock<any>;
const NOW = Date.now();

// ---------------------------------------------------------------------------------------------
// Mini bellek-içi Orders modeli: yalnızca bu job'un kullandığı filtre/güncelleme biçimlerini destekler.
// JS tek iş parçacıklı olduğundan her metot gövdesi (await'siz) ATOMİKTİR -- gerçek Mongo'nun tek-doküman
// atomikliğinin modeli. `find().lean()` çağrı anındaki KOPYAYI döndürür (gerçek dünya: iki pod ayrı okur).
// ---------------------------------------------------------------------------------------------
function matchCond(obj: any, cond: any): boolean {
    return Object.entries(cond).every(([k, v]: [string, any]) => {
        if (k === '$or') return (v as any[]).some((c) => matchCond(obj, c));
        const actual = obj[k];
        if (v && typeof v === 'object' && !(v instanceof Date)) {
            if ('$lt' in v) return actual instanceof Date && actual.getTime() < (v.$lt as Date).getTime();
            if ('$exists' in v) return (actual !== undefined) === v.$exists;
            if ('$elemMatch' in v) return (actual || []).some((el: any) => matchCond(el, v.$elemMatch));
        }
        if (v === null) return actual === null || actual === undefined;
        if (v instanceof Date) return actual instanceof Date && actual.getTime() === v.getTime();
        return actual === v;
    });
}

function makeFakeOrderModel(initial: any[]) {
    const docs = initial;
    const findIndexItem = (doc: any, filter: any): number => {
        const lineId = filter['items.externalLineItemId'];
        if (lineId !== undefined) return doc.items.findIndex((i: any) => i.externalLineItemId === lineId);
        if (filter.items?.$elemMatch) return doc.items.findIndex((i: any) => matchCond(i, filter.items.$elemMatch));
        return -1;
    };
    const applyUpdate = (item: any, update: any) => {
        for (const [path, val] of Object.entries(update.$set || {})) item[path.replace('items.$.', '')] = val;
        for (const path of Object.keys(update.$unset || {})) delete item[path.replace('items.$.', '')];
    };
    const model: any = {
        docs,
        find: jest.fn((filter: any) => ({
            lean: async () => JSON.parse(JSON.stringify(docs.filter((d) => d.items.some((i: any) => i.allocationState === filter.items.$elemMatch.allocationState)))).map((d: any) => {
                d.dates.orderDate = new Date(d.dates.orderDate);
                for (const i of d.items) for (const f of ['lastAllocationAppliedAt', 'cancelClaimedAt', 'cancelClaimUntil', 'cancelUnknownAt', 'oversoldEscalatedAt']) if (i[f]) i[f] = new Date(i[f]);
                return d;
            }),
        })),
        updateOne: jest.fn(async (filter: any, update: any) => {
            const doc = docs.find((d) => d._id === filter._id);
            if (!doc) return { modifiedCount: 0 };
            const idx = findIndexItem(doc, filter);
            if (idx < 0) return { modifiedCount: 0 };
            applyUpdate(doc.items[idx], update);
            return { modifiedCount: 1 };
        }),
        findOneAndUpdate: jest.fn(async (filter: any, update: any) => {
            const doc = docs.find((d) => d._id === filter._id);
            if (!doc) return null;
            const idx = findIndexItem(doc, filter);
            if (idx < 0) return null;
            applyUpdate(doc.items[idx], update);
            return doc;
        }),
    };
    return model;
}

function deferred() {
    let resolve!: (v: any) => void;
    const promise = new Promise<any>((r) => { resolve = r; });
    return { promise, resolve };
}

function oversoldOrder(over: any = {}) {
    // [NOT 2026-09-29, BACKLOG C22] kanal 'hepsiburada': DOĞRULANMIŞ reasonId eşlemesine sahip (bkz.
    // OversellCompensationJob.VERIFIED_REASON_ID_BY_CHANNEL). Bu dosyanın odağı GV-08 talep/lease
    // eşzamanlılığıdır, reasonId doğruluğu DEĞİL; 'trendyol' kullanılsaydı reasonId eşlemesi eksik olduğundan
    // rejectOrder HİÇ ÇAĞRILMAZDI ve bu testler farklı (ilgisiz) bir dalı sınardı (bkz. OversellCompensationJob.test.ts
    // 'Trendyol: doğrulanmış reasonId eşlemesi YOK' testi -- o davranış AYRI bir testte kapsanıyor).
    return {
        _id: 'order-1', integrationCode: 'hepsiburada', externalOrderId: 'EXT-1', orderNumber: 'ON-1',
        dates: { orderDate: new Date(NOW - 60 * 60 * 1000) },
        items: [{ externalLineItemId: 'L1', externalItemId: 'L1', barcode: 'B1', sku: 'B1', quantity: 2, allocationState: 'OVERSOLD', lastAllocationAppliedAt: new Date(NOW - 40 * 60 * 1000) }],
        ...over,
    };
}

function wire(orderModel: any, rejectImpl: () => Promise<any>) {
    (RedisService.isReady as any).mockReturnValue(true);
    (NotificationService.sendClientNotification as any).mockClear();
    (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue({
        getClientModel: () => ({ find: () => ({ lean: async () => [{ order: 1, status: 'ACTIVE' }] }) }),
    });
    const variantModel = { findOne: () => ({ select: () => ({ lean: async () => ({ _id: 'v1' }) }) }) };
    const integrationModel = { findOne: () => ({ lean: async () => ({ marketplace: [{ code: 'hepsiburada', settings: { stockPolicy: { graceMinutes: 30 } } }] }) }) };
    (DatabaseManagerInstance.getClientDB as any).mockResolvedValue({
        getOrderModel: () => orderModel, getVariantModel: () => variantModel, getClientIntegrationModel: () => integrationModel,
    });
    const instance = { rejectOrder: jest.fn(rejectImpl) };
    factoryCtor.mockImplementation(() => ({ getInstance: jest.fn(async () => instance) }));
    jest.spyOn(require('@operations/stock/StockAllocator').StockAllocator.prototype, 'release')
        .mockImplementation(jest.fn(async () => ({ state: 'RELEASED', idempotent: false, variant: {} })) as any);
    return instance;
}

describe('OversellCompensationJob - eşzamanlı tur (iki pod / üst üste binen tur) [GV-08]', () => {
    afterEach(() => { jest.restoreAllMocks(); });

    it('[DÜZELTME 2026-09-28] iki eşzamanlı run(): AYNI satır için rejectOrder YALNIZCA BİR KEZ çağrılır (atomik claim; eski karakterizasyon "2 kez" idi)', async () => {
        const orderModel = makeFakeOrderModel([oversoldOrder()]);
        const gate = deferred(); // pazaryeri çağrısı yavaş: ikinci tur okumasını bu sırada yapar
        const instance = wire(orderModel, () => gate.promise);

        const podA = new OversellCompensationJob().run();
        const podB = new OversellCompensationJob().run();
        // İki tur da OVERSOLD kopyasını okuyup rejectOrder'a ulaşana dek mikro-görev kuyruğunu boşalt.
        for (let i = 0; i < 20; i++) await Promise.resolve();
        gate.resolve(true);
        await Promise.all([podA, podB]);

        expect(instance.rejectOrder).toHaveBeenCalledTimes(1); // [DÜZELTME] (eskiden 2: geri alınamaz çift iptal)
        expect(orderModel.docs[0].items[0].allocationState).toBe('RELEASED');
    });

    it('claim kaybeden tur rejectOrder çağırmaz ve cancelled/escalated saymaz; kazanan cancelled=1', async () => {
        const orderModel = makeFakeOrderModel([oversoldOrder()]);
        const gate = deferred();
        wire(orderModel, () => gate.promise);

        const a = new OversellCompensationJob().run();
        const b = new OversellCompensationJob().run();
        for (let i = 0; i < 20; i++) await Promise.resolve();
        gate.resolve(true);
        const [ra, rb] = await Promise.all([a, b]);

        expect(ra.cancelled + rb.cancelled).toBe(1);
        expect(ra.escalated + rb.escalated).toBe(0);
        expect(NotificationService.sendClientNotification).toHaveBeenCalledTimes(1); // yalnızca kazananın "otomatik iptal" bildirimi
    });

    it('aynı pod içinde üst üste binen tur da bloklanır (pod kimliği AYNI olsa bile yeniden-giriş YOK)', async () => {
        const orderModel = makeFakeOrderModel([oversoldOrder()]);
        const gate = deferred();
        const instance = wire(orderModel, () => gate.promise);
        const job = new OversellCompensationJob(); // TEK job örneği, iki eşzamanlı run()

        const a = job.run();
        const b = job.run();
        for (let i = 0; i < 20; i++) await Promise.resolve();
        gate.resolve(true);
        await Promise.all([a, b]);

        expect(instance.rejectOrder).toHaveBeenCalledTimes(1);
    });

    it('claim lease süresi DOLMUŞSA (çöken pod) satır yeniden alınabilir ve iptal edilir; süresi dolmamışsa atlanır', async () => {
        const live = oversoldOrder({ _id: 'live' });
        live.items[0].cancelClaimedBy = 'pod-x'; live.items[0].cancelClaimedAt = new Date(NOW - 30 * 1000); live.items[0].cancelClaimUntil = new Date(NOW + 90 * 1000);
        const expired = oversoldOrder({ _id: 'expired', externalOrderId: 'EXT-2' });
        expired.items[0].cancelClaimedBy = 'pod-y'; expired.items[0].cancelClaimedAt = new Date(NOW - 10 * 60 * 1000); expired.items[0].cancelClaimUntil = new Date(NOW - 8 * 60 * 1000);
        const orderModel = makeFakeOrderModel([live, expired]);
        const instance = wire(orderModel, async () => true);

        const result = await new OversellCompensationJob().run();

        expect(instance.rejectOrder).toHaveBeenCalledTimes(1);
        expect(instance.rejectOrder).toHaveBeenCalledWith('EXT-2', expect.anything());
        expect(result.cancelled).toBe(1);
        expect(orderModel.docs.find((d: any) => d._id === 'live').items[0].allocationState).toBe('OVERSOLD');
        expect(orderModel.docs.find((d: any) => d._id === 'live').items[0].cancelClaimedBy).toBe('pod-x'); // başkasının aktif talebine dokunulmadı
    });

    it('iki FARKLI satır/tenant birbirini bloklamaz: her biri kendi claim\'ini alıp iptal edilir', async () => {
        const o1 = oversoldOrder({ _id: 'o1', externalOrderId: 'EXT-A' });
        const o2 = oversoldOrder({ _id: 'o2', externalOrderId: 'EXT-B' });
        const orderModel = makeFakeOrderModel([o1, o2]);
        const instance = wire(orderModel, async () => true);

        const result = await new OversellCompensationJob().run();

        expect(instance.rejectOrder).toHaveBeenCalledTimes(2);
        expect(result.cancelled).toBe(2);
    });

    it('rejectOrder UNKNOWN_OUTCOME (yazma zaman aşımı): körlemesine tekrar YOK; satır cancelUnknownAt ile işaretlenir, talep bırakılır, tenant\'a error bildirimi; sonraki tur iptal atmaz', async () => {
        const { IntegrationError } = require('@integration/modules/common/IntegrationError');
        const orderModel = makeFakeOrderModel([oversoldOrder()]);
        const instance = wire(orderModel, async () => {
            throw new IntegrationError('UNKNOWN_OUTCOME', 'timeout', { integrationCode: 'hepsiburada', operation: 'rejectOrder', clientId: 1 });
        });

        const r1 = await new OversellCompensationJob().run();
        const item = orderModel.docs[0].items[0];

        expect(instance.rejectOrder).toHaveBeenCalledTimes(1);
        expect(r1.cancelled).toBe(0);
        expect(r1.escalated).toBe(1);
        expect(item.allocationState).toBe('OVERSOLD'); // RELEASED YAPILMAZ (iptalin uygulanıp uygulanmadığı bilinmiyor)
        expect(item.cancelUnknownAt).toBeInstanceOf(Date);
        expect(item.cancelClaimedBy).toBeUndefined();
        expect((NotificationService.sendClientNotification as any).mock.calls[0][0].notificationData.severity).toBe('error');

        // Sonraki tur(lar): kalıcı işaret -> rejectOrder BİR KEZ DAHA çağrılmaz, ek bildirim yok.
        (NotificationService.sendClientNotification as any).mockClear();
        const r2 = await new OversellCompensationJob().run();
        const r3 = await new OversellCompensationJob().run();
        expect(instance.rejectOrder).toHaveBeenCalledTimes(1);
        expect(r2.escalated + r3.escalated + r2.cancelled + r3.cancelled).toBe(0);
        expect(NotificationService.sendClientNotification).not.toHaveBeenCalled();
    });

    it('[UNKNOWN_OUTCOME] öneki taşıyan düz Error (servis katmanı sarmalaması) da belirsiz sayılır', async () => {
        const orderModel = makeFakeOrderModel([oversoldOrder()]);
        const instance = wire(orderModel, async () => { throw new Error('[1][PazaramaOrderService:rejectOrder] [UNKNOWN_OUTCOME] socket hang up'); });

        await new OversellCompensationJob().run();

        expect(orderModel.docs[0].items[0].cancelUnknownAt).toBeInstanceOf(Date);
        await new OversellCompensationJob().run();
        expect(instance.rejectOrder).toHaveBeenCalledTimes(1);
    });

    it('kalıcı başarısızlık (VALIDATION/false): talep BIRAKILIR, manuel göreve düşer (oversoldEscalatedAt), cancelUnknownAt YOK; sonraki tur yeniden deneyebilir', async () => {
        const { IntegrationError } = require('@integration/modules/common/IntegrationError');
        const orderModel = makeFakeOrderModel([oversoldOrder()]);
        const instance = wire(orderModel, async () => {
            throw new IntegrationError('VALIDATION', 'geçersiz neden', { integrationCode: 'hepsiburada', operation: 'rejectOrder', clientId: 1 });
        });

        const r1 = await new OversellCompensationJob().run();
        const item = orderModel.docs[0].items[0];

        expect(r1.escalated).toBe(1);
        expect(item.cancelUnknownAt).toBeUndefined();
        expect(item.cancelClaimedBy).toBeUndefined(); // talep bırakıldı
        expect(item.oversoldEscalatedAt).toBeInstanceOf(Date);

        await new OversellCompensationJob().run(); // talep bırakıldığı için yeniden alınabilir (mevcut davranış korunur)
        expect(instance.rejectOrder).toHaveBeenCalledTimes(2);
        expect(NotificationService.sendClientNotification).toHaveBeenCalledTimes(1); // oversoldEscalatedAt spam koruması korunur
    });

    it('claim sonrası satır OVERSOLD değilse (başka akış RELEASED/RESERVED yaptı) rejectOrder ÇAĞRILMAZ (guard)', async () => {
        const orderModel = makeFakeOrderModel([oversoldOrder()]);
        const instance = wire(orderModel, async () => true);
        // find() OVERSOLD kopyayı döndürdükten sonra, claim'den önce durum değişir:
        const origFind = orderModel.find;
        orderModel.find = jest.fn((f: any) => {
            const res = origFind(f);
            return { lean: async () => { const r = await res.lean(); orderModel.docs[0].items[0].allocationState = 'RESERVED'; return r; } };
        });

        const result = await new OversellCompensationJob().run();

        expect(instance.rejectOrder).not.toHaveBeenCalled();
        expect(result.cancelled).toBe(0);
    });
});
