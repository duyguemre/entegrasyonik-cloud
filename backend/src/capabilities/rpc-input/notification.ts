// [ADR-0023 / ADR-0029 NB4] NotificationService gövde şemaları (bildirim yetenekleri). SAF zod.
import { z } from 'zod';
import { strictBody } from './common';
import type { RpcRef } from '../types';

/** Mongo ObjectId (24 hex): geçersiz kimlik 400 VALIDATION (N-12). */
export const objectIdStr = z.string().regex(/^[a-fA-F0-9]{24}$/, 'geçersiz kimlik');
const idList = z.array(objectIdStr).max(200);

/** operations/notifications/catalog.types NOTIFICATION_CATEGORIES ile aynı (testle eşitliği denetlenir; katman sınırı: capabilities -> operations yok). */
export const NOTIFICATION_CATEGORY_KEYS = ['order', 'stock', 'integration', 'catalog', 'finance', 'billing', 'security', 'system'] as const;
const category = z.enum(NOTIFICATION_CATEGORY_KEYS);

const cell = z.object({ inApp: z.boolean().optional(), email: z.enum(['off', 'instant', 'digest']).optional(), push: z.boolean().optional() }).strict();
const matrix = z.object(Object.fromEntries(NOTIFICATION_CATEGORY_KEYS.map((k) => [k, cell.optional()])) as Record<typeof NOTIFICATION_CATEGORY_KEYS[number], z.ZodOptional<typeof cell>>).strict();
const b64url = z.string().regex(/^[A-Za-z0-9_-]+=*$/, 'base64url');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const prefsBody = {
    locale: z.enum(['tr', 'en']).optional(),
    matrix: matrix.optional(),
    digest: z.object({ cadence: z.enum(['hourly', 'daily']), hourLocal: z.number().int().min(0).max(23) }).strict().optional(),
    quietHours: z.object({ start: hhmm, end: hhmm, tz: z.string().min(1).max(64) }).strict().nullable().optional(),
};

/** Ortak ilk öğeler: sayfalama tavanı 200 (imleç yoksa) / 50 (imleçle) servis içinde sıkılaştırılır. */
/** MOB-04/MOB-06 web push gövdeleri (tenant NotificationService ve backoffice BackofficePrefsService ortak). */
// Tarayıcı aboneliği (`subscription`) YA DA Android kabuğu FCM belirteci (`fcmToken`, MOB-07) -- yalnız biri (serviste 400).
const fcmToken = z.string().regex(/^[A-Za-z0-9_:-]{32,4096}$/, 'fcm');
export const PUSH_SUBSCRIBE_BODY = {
    subscription: z.object({
        endpoint: z.string().url().max(1024),
        expirationTime: z.number().nullable().optional(),
        keys: z.object({ p256dh: b64url.max(128), auth: b64url.max(64) }).strict(),
    }).strict().optional(),
    fcmToken: fcmToken.optional(),
    deviceLabel: z.string().max(60).optional(),
};
export const PUSH_UNSUBSCRIBE_BODY = { endpoint: z.string().url().max(1024).optional(), id: objectIdStr.optional(), fcmToken: fcmToken.optional() };

export const NOTIFICATION_RPC_INPUT: Partial<Record<RpcRef, z.ZodType<any>>> = {
    'NotificationService/get': strictBody({
        cursor: objectIdStr.optional(), afterId: objectIdStr.optional(), limit: z.number().int().min(1).max(200).optional(),
        category: category.optional(), onlyUnread: z.boolean().optional(), archived: z.boolean().optional(), byCategory: z.boolean().optional(),
    }),
    'NotificationService/getUnreadCount': strictBody({ byCategory: z.boolean().optional() }),
    'NotificationService/markAsRead': strictBody({ notificationIds: idList.optional(), all: z.boolean().optional() }),
    'NotificationService/delete': strictBody({ notificationIds: idList.optional(), all: z.boolean().optional() }),
    'NotificationService/archive': strictBody({ notificationIds: idList.min(1) }),
    'NotificationService/unarchive': strictBody({ notificationIds: idList.min(1) }),
    'NotificationService/getCatalog': strictBody({}),
    'NotificationService/getPreferences': strictBody({}),
    'NotificationService/updatePreferences': strictBody(prefsBody),
    'NotificationService/getTenantDefaults': strictBody({}),
    'NotificationService/updateTenantDefaults': strictBody(prefsBody),
    // MOB-04 web push: uc/anahtar bicimi burada, izinli push servisi + bayt uzunlugu operations/notifications/push/subscriptions.ts'te.
    'NotificationService/getPushConfig': strictBody({}),
    'NotificationService/subscribePush': strictBody(PUSH_SUBSCRIBE_BODY),
    'NotificationService/unsubscribePush': strictBody(PUSH_UNSUBSCRIBE_BODY), // yalnız biri (serviste 400)
};
