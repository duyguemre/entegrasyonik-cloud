// ADR-0029 Karar 1: katalog girisi tanimlayici. Zod ile calisma zamani dogrulamasi (bicim + kategori/izin tutarliligi).
import { z } from 'zod';
import {
    CATEGORY_DEFAULT_PERMISSION, NOTIFICATION_CATEGORIES, NOTIFICATION_PERMISSIONS, NOTIFICATION_SEVERITIES, RETENTION_DAYS,
    NotificationDefinition,
} from './catalog.types';

const CODE_RE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

const defSchema = z.object({
    code: z.string().regex(CODE_RE),
    category: z.enum(NOTIFICATION_CATEGORIES),
    severities: z.array(z.enum(NOTIFICATION_SEVERITIES)).min(1),
    mandatory: z.boolean(),
    defaultChannels: z.object({ inApp: z.literal(true), email: z.enum(['off', 'instant', 'digest']) }),
    audience: z.object({
        permission: z.enum(NOTIFICATION_PERMISSIONS),
        fallbackMinTier: z.enum(['member', 'admin', 'owner']),
        actorOnly: z.boolean().optional(),
    }),
    template: z.object({ titleKey: z.string().min(1), bodyKey: z.string().min(1) }),
    retention: z.enum(Object.keys(RETENTION_DAYS) as ['short', 'standard', 'long']),
    surface: z.enum(['tenant', 'platform']),
}).passthrough();

type DefInput<P> = Omit<NotificationDefinition<P>, 'template' | 'severities'> & { severities?: NotificationDefinition<P>['severities'] };

/** Tanimi dogrular ve dondurur. Gecersizse modul yuklenirken FIRLATIR (hatali katalog testi/sureci kirar). */
export function defineNotification<P = any>(def: DefInput<P>): NotificationDefinition<P> {
    const full: NotificationDefinition<P> = {
        ...def,
        severities: def.severities ?? (typeof def.severity === 'string' ? [def.severity] : []),
        template: { titleKey: `notifications.events.${def.code}.title`, bodyKey: `notifications.events.${def.code}.body` },
    };
    const parsed = defSchema.safeParse(full);
    if (!parsed.success) {
        throw new Error(`[notifications] gecersiz katalog girisi ${def.code}: ${parsed.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    }
    if (!def.legacy && !CATEGORY_DEFAULT_PERMISSION[def.category].includes(def.audience.permission)) {
        throw new Error(`[notifications] ${def.code}: izin ${def.audience.permission} kategori ${def.category} icin gecersiz (genisletme yasak)`);
    }
    return Object.freeze(full);
}
