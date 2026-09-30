// ADR-0029 Karar 3/8: uygulama ici bildirim deposu (tenant DB `Notifications`). ALICI BASINA belge; `userId` ZORUNLU
// (N-01 kok nedeni: eskiden userId yazilmiyor/suzulmuyordu). `userId` tipi `string` (opsiyonel DEGIL): userId'siz cagri
// DERLEME HATASI verir. Depo islevleri `userId` olmadan cagrilamaz.
import { RETENTION_DAYS, RetentionClass } from './catalog.types';

/** Yalniz bu deponun ihtiyac duydugu Mongoose Model yuzeyi (test/mock kolayligi). */
export interface NotificationModelLike {
    insertMany(docs: any[]): Promise<any[]>;
    updateMany(filter: any, update: any): Promise<any>;
}

export interface InAppNotificationInput {
    userId: string;                 // ZORUNLU
    type: string;
    mode?: string;
    severity: string;
    title: string;
    message: string;
    actionUrl?: string | null;
    metaData?: Record<string, unknown>;
    code?: string;
    category?: string;
    params?: Record<string, unknown>;
    eventId?: string;
    groupKey?: string;
    retention: RetentionClass;
    occurredAt: Date;
}

export function expiresAtFor(retention: RetentionClass, from: Date): Date {
    return new Date(from.getTime() + RETENTION_DAYS[retention] * 24 * 60 * 60 * 1000);
}

/** Alici basina bir belge yazar (fan-out on write). Dondurur: olusan belge id'leri (string). */
export async function createForRecipients(model: NotificationModelLike, items: InAppNotificationInput[]): Promise<string[]> {
    if (!items.length) return [];
    const docs = items.map((i) => ({
        userId: i.userId,
        type: i.type,
        ...(i.mode ? { mode: i.mode } : {}),
        severity: i.severity,
        title: i.title,
        message: i.message,
        actionUrl: i.actionUrl ?? null,
        metaData: i.metaData ?? {},
        code: i.code,
        category: i.category,
        params: i.params,
        eventId: i.eventId,
        groupKey: i.groupKey,
        count: 1,
        lastOccurredAt: i.occurredAt,
        isRead: false,
        isDeleted: false,
        isArchived: false,
        createdAt: i.occurredAt,
        expiresAt: expiresAtFor(i.retention, i.occurredAt),
    }));
    const created = await model.insertMany(docs);
    return created.map((d: any) => String(d._id));
}

/**
 * Grup penceresi icinde tekrar eden olay: ayni `eventId`'li TUM alici belgelerinde sayac artar, son parametreler/zaman yazilir,
 * belge yeniden "okunmamis" olur (kullanici tekrarini gorur). Yalniz `eventId` ile eslesir (baska olaya dokunmaz).
 */
export async function bumpGroup(model: NotificationModelLike, eventId: string, patch: { lastOccurredAt: Date; params?: Record<string, unknown> }): Promise<void> {
    await model.updateMany(
        { eventId, isDeleted: { $ne: true } },
        { $inc: { count: 1 }, $set: { lastOccurredAt: patch.lastOccurredAt, isRead: false, readAt: null, ...(patch.params ? { params: patch.params } : {}) } },
    );
}

// ---------------------------------------------------------------------------------------------------------------------
// ADR-0029 NB4 / N-01: kullanici kapsamli OKUMA/GUNCELLEME. Butun islevler `userId` ZORUNLU parametre alir; filtreler yalniz
// bu dosyadaki kurucularla olusur (servis ham filtre yazmaz).
//
// Eski (userId'siz) kayitlar: liste/sayimda tenant geneli SALT-OKUNUR gorunur (ADR-0029 Karar 9 `$or`), ama HIC kimse tarafindan
// degistirilemez (yazma filtreleri yalniz `{userId}`): silme/okundu/arsiv onlara dokunmaz (paylasilan belge kisi bazli tutulamaz).
// Okunmamis sayisina/`onlyUnread`'e GIRMEZ ve listede `isRead:true, legacy:true` doner -> temizlenemeyen rozet olmaz; 3 gunluk
// TTL ile kendiliginden biter (veri gocu yok).
// ---------------------------------------------------------------------------------------------------------------------

/** Yazma/okunmamis sayimi kapsami: YALNIZ bu kullanicinin kendi belgeleri. */
export function ownScope(userId: string): Record<string, unknown> {
    if (typeof userId !== 'string' || !userId) throw new Error('userId zorunlu (N-01)');
    return { userId };
}

/** Liste kapsami: kendi belgeleri + eski userId'siz belgeler (salt-okunur). */
export function readScope(userId: string): Record<string, unknown> {
    ownScope(userId);
    return { $or: [{ userId }, { userId: { $exists: false } }] };
}

export interface ListParams {
    userId: string;
    category?: string;
    onlyUnread?: boolean;
    archived?: boolean;
    /** Onceki sayfanin son `_id`'si (bunun ALTINDAKILER). */
    cursor?: string;
    /** Bu `_id`'den YENILER (SSE yakalama; NB6). */
    afterId?: string;
    /** Destek oturumu (impersonation) birlesik gorunumu: tenant'in TUM belgeleri (salt-okunur). */
    tenantWide?: boolean;
    toObjectId: (id: string) => unknown;
}

export function buildListFilter(p: ListParams): Record<string, unknown> {
    const f: Record<string, unknown> = { isDeleted: false };
    if (p.tenantWide) {
        // kapsam yok (yalniz destek oturumu; servis salt-okunur garanti eder)
    } else if (p.onlyUnread) Object.assign(f, ownScope(p.userId));
    else Object.assign(f, readScope(p.userId));
    f.isArchived = p.archived ? true : { $ne: true };
    if (p.category) f.category = p.category;
    if (p.onlyUnread) f.isRead = false;
    const idRange: Record<string, unknown> = {};
    if (p.cursor) idRange.$lt = p.toObjectId(p.cursor);
    if (p.afterId) idRange.$gt = p.toObjectId(p.afterId);
    if (Object.keys(idRange).length) f._id = idRange;
    return f;
}

/** Okunmamis sayim filtresi (rozet): yalniz kendi, silinmemis, arsivsiz. */
export function buildUnreadFilter(userId: string, category?: string): Record<string, unknown> {
    return { ...ownScope(userId), isRead: false, isDeleted: false, isArchived: { $ne: true }, ...(category ? { category } : {}) };
}

/** Kisisel guncelleme filtresi. `ids` verilmezse hepsi (kendi belgeleri); verilirse yalniz o kimlikler VE kendi belgeleri. */
export function buildOwnUpdateFilter(userId: string, ids: unknown[] | undefined, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { ...ownScope(userId), ...extra, ...(ids ? { _id: { $in: ids } } : {}) };
}

/** Listeleme cikti duzeltmesi: eski kayit -> salt-okunur/okunmus gorunum; `danger` -> `error`. */
export function presentNotification<T extends Record<string, any>>(n: T): T & { legacy?: true } {
    const legacy = !('userId' in n) || n.userId === undefined;
    const out: any = { ...n };
    if (out.severity === 'danger') out.severity = 'error';
    if (legacy) { out.isRead = true; out.legacy = true; }
    return out;
}
