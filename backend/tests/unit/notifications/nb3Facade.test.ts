/**
 * ADR-0029 NB3 -- cephe: notify(..., { legacy }) bayrak kapali eski yol / bayrak acik cekirdek; kisma; metrik.
 * DB/ag YOK.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

let mockV2 = false;
jest.mock('@config', () => {
    const actual: any = jest.requireActual('@config');
    const notify = { get v2Enabled() { return mockV2; }, emailEnabled: false };
    return { ...actual, config: new Proxy(actual.config, { get: (t, k) => (k === 'notify' ? notify : t[k]) }) };
});

import { NotificationService } from '@services/notification/NotificationService';
import { notificationEventBus } from '@services/notification/NotificationEventBus';
import { NOTIFICATION_EVENTS } from '@interfaces/index';
import { metricsRegistry } from '@platform/runtime/metrics';

const ev: any = { clientId: '42', notificationData: { type: 'STOCK_ALERT', severity: 'warning', title: 't', message: 'm', actionUrl: '/orders' } };

let sink: { notify: jest.Mock<any>; notifyLegacy: jest.Mock<any> };
let saveNotification: jest.Mock<any>;
const tick = () => new Promise((res) => setImmediate(res));
const opts = (over: any = {}) => ({ corrId: 'c-1', legacy: { event: ev, ...over } });

beforeEach(() => {
    notificationEventBus.removeAllListeners(NOTIFICATION_EVENTS.SEND_CLIENT_NOTIFICATION);
    saveNotification = jest.fn(async () => undefined);
    NotificationService.init({ saveNotification, getStorageConfig: jest.fn() } as any);
    sink = { notify: jest.fn(async () => ({ status: 'created' })), notifyLegacy: jest.fn(async () => ({ status: 'created' })) };
    NotificationService.setSink(sink as any);
    NotificationService.resetLegacyThrottleForTests();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('NB3 cephe: notify + legacy', () => {
    it('bayrak KAPALI: legacy olay saveNotification\'a BIREBIR gider; cekirdek (sink.notify) cagrilmaz', async () => {
        mockV2 = false;
        const r = await NotificationService.notify('STOCK_OVERSOLD', 42, { lineId: 'L' }, opts());
        await tick();
        expect(saveNotification).toHaveBeenCalledWith('42', ev.notificationData);
        expect(sink.notify).not.toHaveBeenCalled();
        expect(r.status).toBe('created');
    });

    it('bayrak KAPALI + throttle: ayni anahtarla saatte bir (eski OrderWorker davranisi); sure dolunca yeniden gider', async () => {
        mockV2 = false;
        let t = 1_000_000;
        const spy = jest.spyOn(Date, 'now').mockImplementation(() => t);
        const o = opts({ throttle: { key: 'k', ms: 3_600_000 } });
        await NotificationService.notify('ORDER_SYNC_WINDOW_OVERFLOW', 42, {}, o);
        const second = await NotificationService.notify('ORDER_SYNC_WINDOW_OVERFLOW', 42, {}, o);
        await tick();
        expect(saveNotification).toHaveBeenCalledTimes(1);
        expect(second.status).toBe('grouped');
        t += 3_600_001;
        await NotificationService.notify('ORDER_SYNC_WINDOW_OVERFLOW', 42, {}, o);
        await tick();
        expect(saveNotification).toHaveBeenCalledTimes(2);
        spy.mockRestore();
    });

    it('bayrak ACIK: legacy YOK SAYILIR, katalog kodu + params + corrId cekirdege gider; cephe throttle uygulamaz (defter kisar)', async () => {
        mockV2 = true;
        const o = opts({ throttle: { key: 'k', ms: 3_600_000 } });
        await NotificationService.notify('ORDER_SYNC_WINDOW_OVERFLOW', 42, { integ: 'n11', reason: 'X' }, o);
        await NotificationService.notify('ORDER_SYNC_WINDOW_OVERFLOW', 42, { integ: 'n11', reason: 'X' }, o);
        await tick();
        expect(saveNotification).not.toHaveBeenCalled();
        expect(sink.notify).toHaveBeenCalledTimes(2);
        expect(sink.notify).toHaveBeenCalledWith('ORDER_SYNC_WINDOW_OVERFLOW', 42, { integ: 'n11', reason: 'X' }, { corrId: 'c-1' });
    });

    it('metrik: notifications.notify{code,result} sonuc basina artar (grouped / failed)', async () => {
        const spy = jest.spyOn(metricsRegistry, 'incCounter');
        mockV2 = true;
        sink.notify.mockResolvedValueOnce({ status: 'grouped' } as never).mockRejectedValueOnce(new Error('x') as never);
        await NotificationService.notify('STOCK_OVERSOLD', 1, {});
        await NotificationService.notify('STOCK_OVERSOLD', 1, {});
        expect(spy).toHaveBeenCalledWith('notifications.notify', { code: 'STOCK_OVERSOLD', result: 'grouped' });
        expect(spy).toHaveBeenCalledWith('notifications.notify', { code: 'STOCK_OVERSOLD', result: 'failed' });
        spy.mockRestore();
    });
});
