/**
 * [eslesme-fiyat WP7b, PLAN §3.5] Entegrasyon başına senkron durumu — TEK sözleşme.
 *
 * `Clients.integrations[].sync.<kind> = { lastSuccessAt, lastAttemptAt, lastError?: {code, at}, cursor? }`
 * `Clients.integrations` şemasız (`{type: Object}`) → göç gerekmez. Eski düz alanlar (`lastSuccessfulOrderSync`,
 * `lastClaimSync`, `lastMessageSync`, `lastFinanceSync`) KALIR: motor ikisini de yazar, okuyucu (`readSyncState`)
 * yeni alan yoksa eski imleçten türetir (dağıtım anında boş görünmez).
 *
 * Saf modül: yalnız güncelleme belgesi üretir / okur; DB çağrısı yapmaz (yazan: OrderRepository, OrderErrorHandler,
 * ImportOrchestrator).
 */

export const SYNC_KINDS = ['orders', 'claims', 'messages', 'finance', 'products', 'catalog'] as const;
export type SyncKind = typeof SYNC_KINDS[number];

/** Sipariş kuyruğunda manuel tetiklenebilen türler (products → ürün içe aktarımı ayrı akış, catalog → platform geneli). */
export const ORDER_SYNC_KINDS = ['orders', 'claims', 'messages', 'finance'] as const;

export function isSyncKind(v: unknown): v is SyncKind {
    return typeof v === 'string' && (SYNC_KINDS as readonly string[]).includes(v);
}

/** Eski düz imleç alanı → tür. Tam süpürme alanları (`last*FullSweepAt`) ve `lastOrderDetectedAt` senkron durumu DEĞİLDİR. */
export const LEGACY_CURSOR_KIND: Readonly<Record<string, SyncKind>> = {
    lastSuccessfulOrderSync: 'orders',
    lastClaimSync: 'claims',
    lastMessageSync: 'messages',
    lastFinanceSync: 'finance',
};

export interface SyncKindState {
    lastSuccessAt: Date | null;
    lastAttemptAt: Date | null;
    lastError: { code: string; at: Date } | null;
    cursor: Date | null;
}

/** Hata kodu yalnız katalogdaki büyük harfli kimlik (ham mesaj ASLA yazılmaz — sızıntı). */
export function safeSyncErrorCode(code: unknown): string {
    return typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,40}$/.test(code) ? code : 'UNKNOWN';
}

/** `[CODE] mesaj` biçimli hata metninden kod (IntegrationError deseni); yoksa UNKNOWN. */
export function errorCodeFromMessage(message: unknown): string {
    return safeSyncErrorCode(/^\[([A-Z_]+)\]/.exec(String(message ?? ''))?.[1]);
}

const path = (kind: SyncKind, field: string) => `integrations.$.sync.${kind}.${field}`;

/**
 * Başarılı koşu: `lastSuccessAt = lastAttemptAt = at`, `lastError` silinir, imleç verildiyse yazılır.
 * Konumsal (`integrations.$`) filtreyle kullanılır: `{ clientId, 'integrations.integrationCode': kod }`.
 */
export function syncSuccessUpdate(kind: SyncKind, at: Date, cursor?: Date): { $set: Record<string, Date>; $unset: Record<string, ''> } {
    const $set: Record<string, Date> = { [path(kind, 'lastSuccessAt')]: at, [path(kind, 'lastAttemptAt')]: at };
    if (cursor) $set[path(kind, 'cursor')] = cursor;
    return { $set, $unset: { [path(kind, 'lastError')]: '' } };
}

/** Başarısız/eksik koşu: `lastAttemptAt = at`, `lastError = {code, at}`; `lastSuccessAt` ve imleç DEĞİŞMEZ. */
export function syncFailureUpdate(kind: SyncKind, code: unknown, at: Date): { $set: Record<string, unknown> } {
    return { $set: { [path(kind, 'lastAttemptAt')]: at, [path(kind, 'lastError')]: { code: safeSyncErrorCode(code), at } } };
}

const toDate = (v: unknown): Date | null => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v as any);
    return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Bir `Clients.integrations[]` öğesinden tüm türlerin durumu. Yeni alan yoksa eski imleç `lastSuccessAt` ve `cursor`
 * olarak döner (eski imleç `başlangıç − örtüşme` yazıldığı için gerçek koşudan birkaç dk ESKİ görünür — bilinçli; göç yok).
 */
export function readSyncState(integration: any): Record<SyncKind, SyncKindState> {
    const sync = integration && typeof integration.sync === 'object' && integration.sync ? integration.sync : {};
    const legacy: Partial<Record<SyncKind, unknown>> = {};
    for (const [field, kind] of Object.entries(LEGACY_CURSOR_KIND)) legacy[kind] = integration?.[field];
    const out = {} as Record<SyncKind, SyncKindState>;
    for (const kind of SYNC_KINDS) {
        const s = sync[kind] && typeof sync[kind] === 'object' ? sync[kind] : {};
        const legacyAt = toDate(legacy[kind]);
        const errAt = toDate(s.lastError?.at);
        out[kind] = {
            lastSuccessAt: toDate(s.lastSuccessAt) ?? legacyAt,
            lastAttemptAt: toDate(s.lastAttemptAt) ?? toDate(s.lastSuccessAt) ?? legacyAt,
            lastError: s.lastError && errAt ? { code: safeSyncErrorCode(s.lastError.code), at: errAt } : null,
            cursor: toDate(s.cursor) ?? legacyAt,
        };
    }
    return out;
}

/** [F-07] Tenant düzeyi "son başarılı sipariş senkronu": etkin entegrasyonların sipariş `lastSuccessAt` en büyüğü. */
export function latestOrderSuccessAt(integrations: unknown): Date | null {
    let best: Date | null = null;
    for (const it of Array.isArray(integrations) ? integrations : []) {
        if (!it || (it as any).status === false) continue;
        const at = readSyncState(it).orders.lastSuccessAt;
        if (at && (!best || at.getTime() > best.getTime())) best = at;
    }
    return best;
}
