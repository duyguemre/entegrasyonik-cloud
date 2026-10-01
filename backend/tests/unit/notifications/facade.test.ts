/**
 * ADR-0029 NB2 -- cephe (NotificationService) bayrak davranisi + saf yardimcilar (audience, preferences, safeError, inAppRepository).
 * DB/ag YOK. `NOTIFY_V2_ENABLED=false` iken `sendClientNotification` bugunku yolu BIREBIR kullanir (characterization testleri de yesil).
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
import { resolveRecipients, memberTier, Member } from '@operations/notifications/audience';
import { resolveChannels } from '@operations/notifications/preferences';
import { safeErrorCode, safeErrorMessage, sanitizeParams } from '@operations/notifications/safeError';
import { createForRecipients, expiresAtFor } from '@operations/notifications/inAppRepository';
import { getDefinition } from '@operations/notifications/catalog';

const ev: any = { clientId: '42', notificationData: { type: 'STOCK_ALERT', severity: 'warning', title: 't', message: 'm', actionUrl: '/orders' } };

describe('cephe: bayrak kapali (varsayilan) -> eski yol birebir', () => {
    let saveNotification: jest.Mock<any>;
    let sink: { notify: jest.Mock<any>; notifyLegacy: jest.Mock<any> };
    beforeEach(() => {
        mockV2 = false;
        notificationEventBus.removeAllListeners(NOTIFICATION_EVENTS.SEND_CLIENT_NOTIFICATION);
        saveNotification = jest.fn(async () => undefined);
        NotificationService.init({ saveNotification, getStorageConfig: jest.fn() } as any);
        sink = { notify: jest.fn(async () => ({ status: 'created' })), notifyLegacy: jest.fn(async () => ({ status: 'created' })) };
        NotificationService.setSink(sink as any);
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    it('sink enjekte olsa da olay yolu -> saveNotification (ham payload), sink cagrilmaz', async () => {
        await NotificationService.sendClientNotification(ev);
        await new Promise((r) => setImmediate(r));
        expect(saveNotification).toHaveBeenCalledWith('42', ev.notificationData);
        expect(sink.notifyLegacy).not.toHaveBeenCalled();
    });

    it('notify(): bayrak kapaliyken cekirdek "skipped" doner (cephe sink\'e iletir, yazim yapmaz)', async () => {
        sink.notify.mockResolvedValueOnce({ status: 'skipped', reason: 'disabled' } as never);
        expect(await NotificationService.notify('ORDER_SYNC_FAILED', 42, {})).toMatchObject({ status: 'skipped' });
    });
});

describe('cephe: bayrak acik -> kopru notify cekirdegine', () => {
    let saveNotification: jest.Mock<any>;
    let sink: { notify: jest.Mock<any>; notifyLegacy: jest.Mock<any> };
    beforeEach(() => {
        mockV2 = true;
        notificationEventBus.removeAllListeners(NOTIFICATION_EVENTS.SEND_CLIENT_NOTIFICATION);
        saveNotification = jest.fn(async () => undefined);
        NotificationService.init({ saveNotification, getStorageConfig: jest.fn() } as any);
        sink = { notify: jest.fn(async () => ({ status: 'created' })), notifyLegacy: jest.fn(async () => ({ status: 'created' })) };
        NotificationService.setSink(sink as any);
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    it('sendClientNotification -> notifyLegacy(tid:number); eski saveNotification yolu KULLANILMAZ', async () => {
        await NotificationService.sendClientNotification(ev);
        await new Promise((r) => setImmediate(r));
        expect(sink.notifyLegacy).toHaveBeenCalledWith(42, expect.objectContaining({ type: 'STOCK_ALERT', title: 't', message: 'm', actionUrl: '/orders' }));
        expect(saveNotification).not.toHaveBeenCalled();
    });

    it('sink yoksa (erken acilis) eski yola duser; sink firlatirsa cagirana firlatmaz', async () => {
        NotificationService.setSink(undefined);
        await NotificationService.sendClientNotification(ev);
        await new Promise((r) => setImmediate(r));
        expect(saveNotification).toHaveBeenCalled();
        expect(await NotificationService.notify('X', 1, {})).toMatchObject({ status: 'skipped', reason: 'no_sink' });
        NotificationService.setSink({ notify: async () => { throw new Error('x'); }, notifyLegacy: async () => { throw new Error('y'); } } as any);
        await expect(NotificationService.sendClientNotification(ev)).resolves.toBeUndefined();
        expect(await NotificationService.notify('X', 1, {})).toMatchObject({ status: 'failed' });
    });
});

describe('audience (saf)', () => {
    const owner: Member = { userId: 'o', owner: true };
    const admin: Member = { userId: 'a', roleCode: 'ROLE_ADMIN' };
    const op: Member = { userId: 'm', roleCode: 'ROLE_OPERATOR' };
    const all = [owner, admin, op];
    it('kademe esleme operationPolicy ile ayni', () => {
        expect(memberTier(owner)).toBe('owner');
        expect(memberTier(admin)).toBe('admin');
        expect(memberTier(op)).toBe('member');
    });
    it('izin -> kademe yedegi', () => {
        expect(resolveRecipients(getDefinition('FINANCE_RECONCILIATION_MISMATCH')!, {}, all).map((m) => m.userId)).toEqual(['o', 'a']);
        expect(resolveRecipients(getDefinition('BILLING_SUSPENDED')!, {}, all).map((m) => m.userId)).toEqual(['o']);
        expect(resolveRecipients(getDefinition('ORDER_SYNC_FAILED')!, {}, all)).toHaveLength(3);
    });
});

describe('preferences.resolveChannels (saf)', () => {
    it('zorunlu: uygulama ici kapatilamaz, e-posta "off" secilemez; anlik -> ozet yalniz kritik olmayanda', () => {
        const paymentFailed = getDefinition('BILLING_PAYMENT_FAILED')!; // mandatory, severity error, instant
        expect(resolveChannels(paymentFailed, { billing: { inApp: false, email: 'off' } })).toEqual({ inApp: true, email: 'instant', push: true });
        expect(resolveChannels(paymentFailed, { billing: { email: 'digest' } }).email).toBe('digest');
        const oversold = getDefinition('STOCK_OVERSOLD')!; // mandatory + critical
        expect(resolveChannels(oversold, { stock: { email: 'digest' } }).email).toBe('instant');
    });
    it('zorunlu degil: kullanici -> tenant -> katalog sirasi', () => {
        const d = getDefinition('ORDER_SYNC_FAILED')!; // varsayilan digest
        expect(resolveChannels(d)).toEqual({ inApp: true, email: 'digest', push: false });
        expect(resolveChannels(d, undefined, { order: { email: 'instant' } }).email).toBe('instant');
        expect(resolveChannels(d, { order: { email: 'off', inApp: false } }, { order: { email: 'instant' } })).toEqual({ inApp: false, email: 'off', push: false });
    });
});

describe('safeError (N-05)', () => {
    it('kod cikarma ve ham ileti eleme', () => {
        expect(safeErrorCode(Object.assign(new Error('gizli'), { code: 'UPSTREAM_TIMEOUT' }))).toBe('UPSTREAM_TIMEOUT');
        expect(safeErrorCode(new Error('sk-live-123'))).toBe('UNEXPECTED_ERROR');
        expect(safeErrorCode({ code: 'has spaces & secret' })).toBe('UNEXPECTED_ERROR');
        expect(safeErrorMessage('UPSTREAM_TIMEOUT', 'en')).toMatch(/respond/);
        expect(safeErrorMessage('BILINMEYEN')).toBe(safeErrorMessage('UNEXPECTED_ERROR'));
        const out = sanitizeParams({ integ: 'x', error: new Error('ham'), err: 'a' });
        expect(out).toEqual({ integ: 'x', errorCode: 'UNEXPECTED_ERROR' });
    });
});

describe('inAppRepository', () => {
    it('userId zorunlu (derleme hatasi) ve alici basina belge, expiresAt saklama sinifindan', async () => {
        const inserted: any[] = [];
        const model = { insertMany: async (d: any[]) => { inserted.push(...d); return d.map((_x, i) => ({ _id: `id${i}` })); }, updateMany: async () => ({}) };
        const base = { type: 'INFO', severity: 'info', title: 't', message: 'm', retention: 'long' as const, occurredAt: new Date('2026-01-01T00:00:00Z') };
        // @ts-expect-error userId olmadan cagri derleme hatasi vermeli (N-01)
        const noUser = () => createForRecipients(model, [{ ...base }]);
        expect(typeof noUser).toBe('function');
        const ids = await createForRecipients(model, [{ ...base, userId: 'u1' }, { ...base, userId: 'u2' }]);
        expect(ids).toEqual(['id0', 'id1']);
        expect(inserted.map((d) => d.userId)).toEqual(['u1', 'u2']);
        expect(inserted[0].expiresAt).toEqual(expiresAtFor('long', base.occurredAt));
        expect(inserted[0].expiresAt.getTime() - base.occurredAt.getTime()).toBe(90 * 24 * 3600 * 1000);
    });
});
