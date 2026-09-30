// ADR-0029 Karar 1: bildirim olay katalogu tipleri. Saf tip/sabit dosyasi (DB yok, bagimlilik yok).
import type { ZodTypeAny } from 'zod';

export const NOTIFICATION_CATEGORIES = ['order', 'stock', 'integration', 'catalog', 'finance', 'billing', 'security', 'system'] as const;
export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];

export const NOTIFICATION_SEVERITIES = ['info', 'success', 'warning', 'error', 'critical'] as const;
export type NotificationSeverity = typeof NOTIFICATION_SEVERITIES[number];

/** Saklama sinifi -> uygulama ici TTL (gun). ADR-0029 Karar 3: short 14 / standard 30 / long 90. */
export const RETENTION_DAYS = { short: 14, standard: 30, long: 90 } as const;
export type RetentionClass = keyof typeof RETENTION_DAYS;

export type EmailMode = 'off' | 'instant' | 'digest';
export type MinTier = 'member' | 'admin' | 'owner';
export type NotificationSurface = 'tenant' | 'platform';
export const NOTIFICATION_LOCALES = ['tr', 'en'] as const;
export type NotificationLocale = typeof NOTIFICATION_LOCALES[number];

/**
 * ADR-0028 izin anahtarlari (`kaynak:eylem`). Izin katalogu (`permissions.ts`) henuz kodda YOK (ADR-0028 Asama 1
 * bekliyor); bu liste GECICI sabittir ve ADR-0028 gelince ondan turetilir.
 */
export const NOTIFICATION_PERMISSIONS = [
    'orders:read', 'stock:read', 'integrations:read', 'integrations:manage', 'catalog:read', 'finance:read',
    'billing:read', 'users:read', 'self:manage', 'app:use',
] as const;
export type NotificationPermission = typeof NOTIFICATION_PERMISSIONS[number];

/** Kategori -> izinli izinler (ADR-0029 Karar 1 tablosu). Katalog girisi daha DAR izinle ezebilir, genisletemez. */
export const CATEGORY_DEFAULT_PERMISSION: Record<NotificationCategory, ReadonlyArray<NotificationPermission>> = {
    order: ['orders:read'],
    stock: ['stock:read'],
    integration: ['integrations:read', 'integrations:manage'],
    catalog: ['catalog:read'],
    finance: ['finance:read'],
    billing: ['billing:read'],
    security: ['users:read', 'self:manage'],
    system: ['app:use'],
};

/** Yasak params alan adlari (PII / ham hata / sir; ADR-0029 Karar 8). Tam ad eslesmesi (kucuk harf): `errorCode` serbest. */
export const FORBIDDEN_PARAM_KEYS: ReadonlyArray<string> = ['name', 'surname', 'address', 'phone', 'email', 'message', 'error', 'token', 'password'];

export type LegacyType = 'BATCH_PROCESS' | 'ORDER' | 'STOCK_ALERT' | 'INFO' | 'SYSTEM' | 'EXPORT_READY' | 'IMPORT_READY';

export interface NotificationDefinition<P = any> {
    /** SCREAMING_SNAKE, kalici; yeniden adlandirma alias ile. */
    readonly code: string;
    readonly category: NotificationCategory;
    /** Sabit onem ya da params'a bagli hesap. */
    readonly severity: NotificationSeverity | ((p: P) => NotificationSeverity);
    /** Kodun alabilecegi tum onem duzeyleri (katalog DTO + test). */
    readonly severities: ReadonlyArray<NotificationSeverity>;
    readonly mandatory: boolean;
    readonly defaultChannels: { inApp: true; email: EmailMode };
    readonly audience: { permission: NotificationPermission; fallbackMinTier: MinTier; actorOnly?: boolean };
    readonly params: ZodTypeAny;
    /** i18n anahtarlari: notifications.events.<code>.{title,body} */
    readonly template: { titleKey: string; bodyKey: string };
    /** Yalniz uygulama ici yol; FE internalActionPath ile de suzulur. */
    readonly action?: (p: P) => string;
    /** Ayni olay iki kez uretilmez (kalici; defter TTL'i kadar). */
    readonly dedupeKey?: (p: P) => string;
    /** Pencere icinde tek kayitta toplanir (sayac). */
    readonly group?: { key: (p: P) => string; windowMs: number };
    readonly retention: RetentionClass;
    readonly surface: NotificationSurface;
    readonly example: P;
    /** Gecici LEGACY_* ailesi (sendClientNotification koprusu); duz title/message'a izin verilen tek aile. */
    readonly legacy?: boolean;
    /** Eski `type` (FE ikon yedegi / Notification.type enum) ve `mode` eslemesi. */
    readonly legacyType?: LegacyType;
    readonly legacyMode?: string;
}

export interface NotificationCatalogDto {
    code: string; category: NotificationCategory; severities: NotificationSeverity[]; mandatory: boolean;
    defaultChannels: { inApp: true; email: EmailMode }; permission: NotificationPermission; retention: RetentionClass;
    surface: NotificationSurface; titleKey: string; bodyKey: string; grouped: boolean; legacy: boolean;
}
