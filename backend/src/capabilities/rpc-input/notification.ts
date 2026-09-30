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

const cell = z.object({ inApp: z.boolean().optional(), email: z.enum(['off', 'instant', 'digest']).optional() }).strict();
const matrix = z.object(Object.fromEntries(NOTIFICATION_CATEGORY_KEYS.map((k) => [k, cell.optional()])) as Record<typeof NOTIFICATION_CATEGORY_KEYS[number], z.ZodOptional<typeof cell>>).strict();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const prefsBody = {
    locale: z.enum(['tr', 'en']).optional(),
    matrix: matrix.optional(),
    digest: z.object({ cadence: z.enum(['hourly', 'daily']), hourLocal: z.number().int().min(0).max(23) }).strict().optional(),
    quietHours: z.object({ start: hhmm, end: hhmm, tz: z.string().min(1).max(64) }).strict().nullable().optional(),
};

/** Ortak ilk öğeler: sayfalama tavanı 200 (imleç yoksa) / 50 (imleçle) servis içinde sıkılaştırılır. */
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
};
