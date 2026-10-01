/**
 * BİRİM: TrialExpiryJob (backend/src/operations/billing/TrialExpiryJob.ts) — ADR-0008 §3 deneme bitişi -> suspended.
 * DB/Redis/ağ YOK: ApplicationDB modelleri filtre semantiğini ($ne/$lte/$gt) gerçekten değerlendiren bellek-içi sahtelerdir,
 * böylece "atomik guard" ve "billingExempt'e dokunulmaz" davranışı literal filtre eşitliğiyle değil sonuçla doğrulanır.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@database/index', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn() } }));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { isReady: jest.fn() } }));
jest.mock('@services/billing/EntitlementService', () => ({ EntitlementService: { invalidate: jest.fn() } }));
jest.mock('@services/notification/NotificationService', () => require('../../helpers/notificationServiceMock').notificationServiceModule());

import { TrialExpiryJob } from '@operations/billing/TrialExpiryJob';
import { DatabaseManagerInstance } from '@database/index';
import { RedisService } from '@services/redis/RedisService';
import { EntitlementService } from '@services/billing/EntitlementService';
import { NotificationService } from '@services/notification/NotificationService';
import { expectCatalogNotify } from '../../helpers/notificationServiceMock';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-28T12:00:00.000Z');
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

// ---- mini Mongo filtre değerlendirici (yalnızca bu işin kullandığı operatörler) ----
function matches(doc: any, filter: any): boolean {
    return Object.entries(filter).every(([k, cond]) => {
        const v = doc[k];
        if (cond instanceof Date || typeof cond !== 'object' || cond === null) return v === cond || (v instanceof Date && cond instanceof Date && v.getTime() === cond.getTime());
        return Object.entries(cond as any).every(([op, arg]) => {
            switch (op) {
                case '$ne': return v !== arg;
                case '$lte': return v !== undefined && v !== null && v.getTime() <= (arg as Date).getTime();
                case '$gt': return v !== undefined && v !== null && v.getTime() > (arg as Date).getTime();
                default: throw new Error('sahte model: desteklenmeyen operatör ' + op);
            }
        });
    });
}

function makeFakes(initial: any[]) {
    const subs = initial.map(s => ({ ...s }));
    const events: any[] = [];
    const calls = { find: [] as any[], limit: [] as number[], findOneAndUpdate: [] as any[] };
    const hooks: { beforeFindOneAndUpdate?: (filter: any) => void; failFor?: number; createError?: any } = {};

    const subscriptionModel = {
        find: (filter: any) => {
            calls.find.push(filter);
            let rows = subs.filter(s => matches(s, filter)).map(s => ({ ...s }));
            const chain: any = {
                sort: (spec: any) => { const [[key, dir]] = Object.entries(spec) as any; rows.sort((a: any, b: any) => (a[key] - b[key]) * dir); return chain; },
                limit: (n: number) => { calls.limit.push(n); rows = rows.slice(0, n); return chain; },
                select: () => chain,
                lean: async () => rows,
            };
            return chain;
        },
        findOneAndUpdate: (filter: any, update: any, options: any) => {
            calls.findOneAndUpdate.push({ filter, update, options });
            return {
                lean: async () => {
                    if (hooks.failFor !== undefined && filter.clientId === hooks.failFor) throw new Error('db boom');
                    hooks.beforeFindOneAndUpdate?.(filter);
                    const doc = subs.find(s => matches(s, filter)); // TEK adımda eşleş+güncelle (atomik sahte)
                    if (!doc) return null;
                    Object.assign(doc, update.$set);
                    return { ...doc };
                },
            };
        },
    };
    const billingEventModel = {
        create: async (doc: any) => {
            if (hooks.createError) throw hooks.createError;
            if (events.some(e => e.provider === doc.provider && e.providerEventId === doc.providerEventId)) {
                throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
            }
            events.push({ ...doc });
            return doc;
        },
    };
    (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue({
        getSubscriptionModel: () => subscriptionModel,
        getBillingEventModel: () => billingEventModel,
    });
    return { subs, events, calls, hooks };
}

const sub = (clientId: number, extra: any = {}) => ({ clientId, planCode: 'starter', status: 'trialing', billingExempt: false, trialEndsAt: at(-1000), ...extra });
const job = () => new TrialExpiryJob(() => NOW);
const notifications = () => (NotificationService.sendClientNotification as any).mock.calls.map((c: any[]) => c[0]);

beforeEach(() => {
    jest.clearAllMocks();
    (RedisService.isReady as any).mockReturnValue(true);
    (NotificationService.sendClientNotification as any).mockResolvedValue(undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('TrialExpiryJob.run - Redis dayanıklılığı', () => {
    it('Redis hazır değilse tur TAMAMEN ATLANIR: ApplicationDB\'ye sorulmaz, hata fırlatılmaz', async () => {
        (RedisService.isReady as any).mockReturnValue(false);
        const result = await job().run();
        expect(result).toEqual({ skipped: true, scanned: 0, suspended: 0, alreadyHandled: 0, warned: 0, failed: 0 });
        expect(DatabaseManagerInstance.getApplicationDB).not.toHaveBeenCalled();
    });
});

describe('TrialExpiryJob.run - süresi dolmuş deneme -> suspended (ADR-0008 §3)', () => {
    it('süresi dolmuş trialing abonelik suspended olur; EntitlementService.invalidate, BillingEvents denetimi ve tenant bildirimi yapılır', async () => {
        const { subs, events } = makeFakes([sub(7, { trialEndsAt: at(-3600_000) })]);
        const result = await job().run();

        expect(result).toMatchObject({ skipped: false, scanned: 1, suspended: 1, alreadyHandled: 0, failed: 0 });
        expect(subs[0].status).toBe('suspended');
        expect(EntitlementService.invalidate).toHaveBeenCalledWith(7);

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            provider: 'system', type: 'subscription.trial_expired', clientId: 7, status: 'processed',
            providerEventId: `trial-expired:7:${at(-3600_000).getTime()}`,
        });
        expect(events[0].payloadRedacted).toMatchObject({ from: 'trialing', to: 'suspended', reason: 'trial_expired', planCode: 'starter' });

        const [n] = notifications();
        expect(notifications()).toHaveLength(1);
        expect(n.clientId).toBe('7');
        expect(n.notificationData).toMatchObject({ type: 'SYSTEM', mode: 'BILLING', severity: 'error', actionUrl: '/subscription' });
        expect(n.notificationData.message).toContain('stok');
        expect(n.notificationData.metaData.code).toBe('TRIAL_EXPIRED');
        const [, , p1, o1] = expectCatalogNotify(NotificationService, 'BILLING_TRIAL_ENDED', 7);
        expect(p1.trialEnd).toBe(at(-3600_000).toISOString());
        expect(o1.idempotencyKey).toBe(`trial-ended:${at(-3600_000).getTime()}`);
        expect(JSON.stringify(p1)).not.toContain('stok'); // metin params'a girmez
    });

    it('deneme bitişi tam "şimdi" ise de süresi dolmuş sayılır (<=), henüz dolmamış (+1 sn) sayılmaz', async () => {
        const { subs } = makeFakes([sub(1, { trialEndsAt: at(0) }), sub(2, { trialEndsAt: at(1000) })]);
        await job().run();
        expect(subs.find(s => s.clientId === 1)!.status).toBe('suspended');
        expect(subs.find(s => s.clientId === 2)!.status).toBe('trialing');
    });

    it('billingExempt (legacy) tenant\'a ASLA dokunulmaz — süresi dolmuş trialing görünse bile (ne durum, ne bildirim, ne denetim, ne invalidate)', async () => {
        const { subs, events } = makeFakes([sub(9, { billingExempt: true, trialEndsAt: at(-5 * DAY) })]);
        const result = await job().run();
        expect(result).toMatchObject({ scanned: 0, suspended: 0, warned: 0 });
        expect(subs[0].status).toBe('trialing');
        expect(events).toHaveLength(0);
        expect(EntitlementService.invalidate).not.toHaveBeenCalled();
        expect(notifications()).toHaveLength(0);
    });

    it('trialing OLMAYAN abonelikler (active/past_due/suspended/canceled/expired) ve trialEndsAt\'i olmayanlar değişmez', async () => {
        const rows = ['active', 'past_due', 'suspended', 'canceled', 'expired'].map((status, i) => sub(10 + i, { status, trialEndsAt: at(-DAY) }));
        rows.push(sub(20, { trialEndsAt: undefined }));
        const { subs, events } = makeFakes(rows);
        const result = await job().run();
        expect(result.suspended).toBe(0);
        expect(subs.map(s => s.status)).toEqual(['active', 'past_due', 'suspended', 'canceled', 'expired', 'trialing']);
        expect(events).toHaveLength(0);
    });

    it('aday sorgusu ve atomik guard filtresi: yalnızca trialing + billingExempt!=true + trialEndsAt<=şimdi; new:true, yalnızca status $set edilir (süre/plan ezilmez)', async () => {
        const { calls } = makeFakes([sub(3)]);
        await job().run();
        const expected = { status: 'trialing', billingExempt: { $ne: true }, trialEndsAt: { $lte: NOW } };
        expect(calls.find[0]).toEqual(expected);
        expect(calls.findOneAndUpdate[0].filter).toEqual({ clientId: 3, ...expected });
        expect(calls.findOneAndUpdate[0].update).toEqual({ $set: { status: 'suspended' } });
        expect(calls.findOneAndUpdate[0].options).toEqual({ new: true });
        expect(calls.limit[0]).toBe(TrialExpiryJob.BATCH_LIMIT);
    });

    it('İDEMPOTENT: ikinci tur hiçbir şey yapmaz (yeniden geçiş, yeni denetim kaydı, yeni bildirim, invalidate YOK)', async () => {
        const { events } = makeFakes([sub(4)]);
        await job().run();
        jest.clearAllMocks();
        const second = await job().run();

        expect(second).toMatchObject({ scanned: 0, suspended: 0, alreadyHandled: 0 });
        expect(events).toHaveLength(1);
        expect(notifications()).toHaveLength(0);
        expect(EntitlementService.invalidate).not.toHaveBeenCalled();
    });

    it('YARIŞ: aday listelendikten sonra tenant ödeme yapıp active olursa guard eşleşmez -> ezilmez, bildirim/denetim/invalidate YOK, alreadyHandled sayılır', async () => {
        const { subs, events, hooks } = makeFakes([sub(5)]);
        hooks.beforeFindOneAndUpdate = () => { subs[0].status = 'active'; }; // başka pod/webhook araya girdi
        const result = await job().run();

        expect(result).toMatchObject({ scanned: 1, suspended: 0, alreadyHandled: 1, failed: 0 });
        expect(subs[0].status).toBe('active');
        expect(events).toHaveLength(0);
        expect(notifications()).toHaveLength(0);
        expect(EntitlementService.invalidate).not.toHaveBeenCalled();
    });

    it('YARIŞ: deneme bitişi araya giren bir işlemle ileri alınmışsa (uzatma) guard eşleşmez -> askıya alınmaz', async () => {
        const { subs, hooks } = makeFakes([sub(6)]);
        hooks.beforeFindOneAndUpdate = () => { subs[0].trialEndsAt = at(10 * DAY); };
        const result = await job().run();
        expect(result.alreadyHandled).toBe(1);
        expect(subs[0].status).toBe('trialing');
    });

    it('audit idempotency: aynı anahtar zaten varsa (E11000) hata FIRLATILMAZ; geçiş ve bildirim yine yapılmıştır', async () => {
        const { subs, events } = makeFakes([sub(8)]);
        events.push({ provider: 'system', providerEventId: `trial-expired:8:${subs[0].trialEndsAt.getTime()}` }); // önceki kısmi tur
        const result = await job().run();
        expect(result).toMatchObject({ suspended: 1, failed: 0 });
        expect(subs[0].status).toBe('suspended');
        expect(events).toHaveLength(1);
        expect(notifications()).toHaveLength(1);
    });

    it('BillingEvents yazımı başka bir hatayla başarısız olsa bile geçiş kalıcıdır, tur çökmez (denetim best-effort, loglanır)', async () => {
        const { subs, hooks } = makeFakes([sub(11)]);
        hooks.createError = new Error('write concern');
        const result = await job().run();
        expect(result).toMatchObject({ suspended: 1, failed: 0 });
        expect(subs[0].status).toBe('suspended');
        expect(console.error).toHaveBeenCalled();
    });

    it('bildirim gönderimi hata verirse tur çökmez ve geçiş bozulmaz', async () => {
        (NotificationService.sendClientNotification as any).mockRejectedValue(new Error('bus down'));
        const { subs } = makeFakes([sub(12)]);
        const result = await job().run();
        expect(result).toMatchObject({ suspended: 1, failed: 0 });
        expect(subs[0].status).toBe('suspended');
    });

    it('tenant başına hata izolasyonu: bir tenant\'ta DB hatası diğerlerini engellemez, failed sayılır', async () => {
        const { subs, hooks } = makeFakes([sub(1, { trialEndsAt: at(-3000) }), sub(2, { trialEndsAt: at(-2000) }), sub(3, { trialEndsAt: at(-1000) })]);
        hooks.failFor = 2;
        const result = await job().run();
        expect(result).toMatchObject({ scanned: 3, suspended: 2, failed: 1 });
        expect(subs.map(s => s.status)).toEqual(['suspended', 'trialing', 'suspended']);
    });

    it('en eski bitiş önce işlenir (trialEndsAt artan) ve tenant bildirimi clientId string olarak gider', async () => {
        makeFakes([sub(2, { trialEndsAt: at(-1000) }), sub(1, { trialEndsAt: at(-5000) })]);
        await job().run();
        expect(notifications().map((n: any) => n.clientId)).toEqual(['1', '2']);
    });

    it('ApplicationDB alınamazsa tur genel hatayı yutar (fırlatmaz) ve sonuç sıfırdır', async () => {
        (DatabaseManagerInstance.getApplicationDB as any).mockRejectedValue(new Error('no db'));
        await expect(job().run()).resolves.toMatchObject({ skipped: false, suspended: 0, failed: 0 });
    });
});

describe('TrialExpiryJob.run - 3 gün önceki uyarı (ADR-0008 §3 risk notu)', () => {
  it('bitişine <= 3 gün kalan deneme için TEK SEFERLİK uyarı bildirimi gider (durum DEĞİŞMEZ); ikinci turda tekrarlanmaz', async () => {
        const { subs, events } = makeFakes([sub(31, { trialEndsAt: at(2 * DAY) })]);
        const first = await job().run();
        expect(first).toMatchObject({ suspended: 0, warned: 1 });
        expect(subs[0].status).toBe('trialing');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ type: 'subscription.trial_ending_soon', clientId: 31, providerEventId: `trial-ending-warning:31:${at(2 * DAY).getTime()}` });
        expect(notifications()).toHaveLength(1);
        expect(notifications()[0].notificationData).toMatchObject({ severity: 'warning', mode: 'BILLING' });
        expect(notifications()[0].notificationData.metaData.code).toBe('TRIAL_ENDING_SOON');
        expect(expectCatalogNotify(NotificationService, 'BILLING_TRIAL_ENDING', 31)[2]).toMatchObject({ daysLeft: 3 });
        expect(EntitlementService.invalidate).not.toHaveBeenCalled();

        const second = await job().run();
        expect(second.warned).toBe(0);
        expect(notifications()).toHaveLength(1);
        expect(events).toHaveLength(1);
    });

    it('tam 3 gün kalan (sınır) uyarılır; 3 gün + 1 sn kalan uyarılmaz', async () => {
        makeFakes([sub(32, { trialEndsAt: at(3 * DAY) }), sub(33, { trialEndsAt: at(3 * DAY + 1000) })]);
        const result = await job().run();
        expect(result.warned).toBe(1);
        expect(notifications().map((n: any) => n.clientId)).toEqual(['32']);
    });

    it('billingExempt tenant uyarılmaz', async () => {
        makeFakes([sub(34, { billingExempt: true, trialEndsAt: at(DAY) })]);
        const result = await job().run();
        expect(result.warned).toBe(0);
        expect(notifications()).toHaveLength(0);
    });

    it('denetim kaydı yazılamazsa (dup olmayan hata) uyarı bu turda GÖNDERİLMEZ (15 dk\'da bir tekrar spam riski yok)', async () => {
        const { hooks } = makeFakes([sub(35, { trialEndsAt: at(DAY) })]);
        hooks.createError = new Error('write concern');
        const result = await job().run();
        expect(result.warned).toBe(0);
        expect(notifications()).toHaveLength(0);
    });

    it('bir turda hem süresi dolan hem yaklaşan tenant\'lar doğru ayrıştırılır', async () => {
        const { subs } = makeFakes([sub(41, { trialEndsAt: at(-1000) }), sub(42, { trialEndsAt: at(DAY) }), sub(43, { trialEndsAt: at(10 * DAY) })]);
        const result = await job().run();
        expect(result).toMatchObject({ suspended: 1, warned: 1 });
        expect(subs.map(s => s.status)).toEqual(['suspended', 'trialing', 'trialing']);
    });
});
