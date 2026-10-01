// [ADR-0029 NB7/NB8] Backoffice bildirim/duyuru/uyarı + tenant duyuru bandı gövde şemaları (SAF zod). Üst düzey `strictBody`: bilinmeyen alan 400 VALIDATION.
// `reason` (>=10 karakter) step-up katmanında (`admin/stepUp.ts requireReason`) ayrıca doğrulanır; burada yalnız üst sınır.
import { z } from 'zod';
import { strictBody } from './common';
import type { RpcRef } from '../types';

const reason = z.string().min(1).max(500);
const tid = z.number().int().positive().max(2_000_000_000);
const oid = z.string().regex(/^[a-f0-9]{24}$/i);
const cursor = z.string().min(1).max(100);
const limit = z.number().int().min(1).max(200);
const planCode = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const code = z.string().regex(/^[A-Z][A-Z0-9_]{1,59}$/);
const isoDate = z.string().min(10).max(40);

const localized = (max: number) => z.object({ tr: z.string().min(1).max(max), en: z.string().min(1).max(max).optional() }).strict();

/** Duyuru girdisi (create/update/preview taslağı). İç içe nesne de strict: hedef/kanal alanlarında fazlalık reddedilir. */
export const announcementInput = z.object({
    kind: z.enum(['info', 'maintenance', 'incident', 'release']),
    severity: z.enum(['info', 'warning', 'critical']).optional(),
    title: localized(160), body: localized(2000),
    target: z.object({ mode: z.enum(['all', 'plans', 'tenants']), planCodes: z.array(planCode).min(1).max(50).optional(), tids: z.array(tid).min(1).max(5000).optional() }).strict(),
    audience: z.enum(['all_members', 'owners_admins']).optional(),
    channels: z.object({ banner: z.boolean(), inApp: z.boolean(), email: z.boolean() }).strict(),
    startsAt: isoDate, endsAt: isoDate.nullable().optional(), dismissible: z.boolean().optional(),
}).strict();

export const BACKOFFICE_NOTIFICATIONS_RPC_INPUT: Partial<Record<RpcRef, z.ZodType<any>>> = {
    'AnnouncementService/getActive': strictBody({}),
    'BackofficeNotificationService/listAnnouncements': strictBody({
        status: z.enum(['draft', 'scheduled', 'active', 'ended', 'cancelled']).optional(), kind: z.enum(['info', 'maintenance', 'incident', 'release']).optional(),
        from: isoDate.optional(), to: isoDate.optional(), cursor: cursor.optional(), limit: limit.optional(),
    }),
    'BackofficeNotificationService/getAnnouncement': strictBody({ id: oid }),
    'BackofficeNotificationService/createAnnouncement': strictBody({ announcement: announcementInput, reason }),
    'BackofficeNotificationService/updateAnnouncement': strictBody({ id: oid, announcement: announcementInput, reason }),
    'BackofficeNotificationService/scheduleAnnouncement': strictBody({ id: oid, emailConsent: z.boolean().optional(), reason }),
    'BackofficeNotificationService/cancelAnnouncement': strictBody({ id: oid, reason }),
    'BackofficeNotificationService/previewAnnouncement': strictBody({ id: oid.optional(), draft: announcementInput.optional() }),
    'BackofficeNotificationService/getDeliveryStats': strictBody({}),
    'BackofficeNotificationService/listDeliveries': strictBody({
        status: z.enum(['pending', 'sending', 'sent', 'failed', 'dead', 'skipped', 'suppressed']).optional(), channel: z.enum(['email', 'push']).optional(), tid: tid.optional(),
        code: code.optional(), eventId: oid.optional(), cursor: cursor.optional(), limit: limit.optional(),
    }),
    'BackofficeNotificationService/retryDelivery': strictBody({ id: oid, tid: tid.optional(), reason }),
    'BackofficeNotificationService/discardDelivery': strictBody({ id: oid, tid: tid.optional(), reason }),
    'BackofficeNotificationService/getTenantHistory': strictBody({ tid, cursor: cursor.optional(), limit: limit.optional() }),
    'BackofficeNotificationService/getCatalog': strictBody({}),
    'BackofficeNotificationService/previewTemplate': strictBody({
        code, locale: z.enum(['tr', 'en']), channel: z.enum(['inApp', 'email']), params: z.record(z.string().max(60), z.union([z.string().max(600), z.number(), z.boolean()])).optional(),
    }),
    'BackofficeNotificationService/sendTestEmail': strictBody({ reason }),
    'BackofficeNotificationService/listAlerts': strictBody({
        status: z.enum(['firing', 'resolved']).optional(), level: z.enum(['warning', 'critical']).optional(), ruleId: z.string().regex(/^R\d{1,2}$/).optional(), cursor: cursor.optional(), limit: limit.optional(),
    }),
    'BackofficeNotificationService/muteAlert': strictBody({ ruleId: z.string().regex(/^R\d{1,2}$/), scopeKey: z.string().min(1).max(120), hours: z.number().int().min(0).max(336), reason }),
};
