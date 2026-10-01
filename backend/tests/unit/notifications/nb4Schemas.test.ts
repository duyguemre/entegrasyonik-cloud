/** ADR-0029 NB4: NotificationService girdi şemaları (ADR-0023 strict) + kategori listesi eşitliği. */
import { describe, it, expect } from '@jest/globals';
import { NOTIFICATION_RPC_INPUT, NOTIFICATION_CATEGORY_KEYS } from '../../../src/capabilities/rpc-input/notification';
import { NOTIFICATION_CATEGORIES } from '@operations/notifications/catalog.types';

const S = (rpc: string) => (NOTIFICATION_RPC_INPUT as any)[`NotificationService/${rpc}`];
const id = 'aaaaaaaaaaaaaaaaaaaaaaa1';

describe('NB4 rpc-input', () => {
    it('kategori listesi operations/notifications ile aynı', () => {
        expect([...NOTIFICATION_CATEGORY_KEYS]).toEqual([...NOTIFICATION_CATEGORIES]);
    });

    it('bilinmeyen alan reddedilir (strict), geçersiz ObjectId reddedilir', () => {
        expect(S('get').safeParse({ x: 1 }).success).toBe(false);
        expect(S('markAsRead').safeParse({ notificationIds: ['zzz'] }).success).toBe(false);
        expect(S('markAsRead').safeParse({ notificationIds: [id] }).success).toBe(true);
        expect(S('get').safeParse({ cursor: { $ne: 1 } }).success).toBe(false);
        expect(S('get').safeParse({ category: 'nope' }).success).toBe(false);
        expect(S('get').safeParse({ limit: 500 }).success).toBe(false);
        expect(S('archive').safeParse({ notificationIds: [] }).success).toBe(false);
    });

    it('tercih şeması: kategori/kanal enum, dijest/sessiz saat biçimi', () => {
        expect(S('updatePreferences').safeParse({ matrix: { order: { inApp: false, email: 'digest' } } }).success).toBe(true);
        expect(S('updatePreferences').safeParse({ matrix: { bogus: { inApp: true } } }).success).toBe(false);
        expect(S('updatePreferences').safeParse({ matrix: { order: { email: 'sms' } } }).success).toBe(false);
        expect(S('updatePreferences').safeParse({ quietHours: { start: '25:00', end: '08:00', tz: 'UTC' } }).success).toBe(false);
        expect(S('updatePreferences').safeParse({ quietHours: null, digest: { cadence: 'daily', hourLocal: 9 } }).success).toBe(true);
        expect(S('updateTenantDefaults').safeParse({ tid: 3 }).success).toBe(false);
    });

    it('her NotificationService ucu şemalı', () => {
        for (const rpc of ['get', 'getUnreadCount', 'markAsRead', 'delete', 'archive', 'unarchive', 'getCatalog', 'getPreferences', 'updatePreferences', 'getTenantDefaults', 'updateTenantDefaults']) {
            expect(S(rpc)).toBeDefined();
        }
    });
});
