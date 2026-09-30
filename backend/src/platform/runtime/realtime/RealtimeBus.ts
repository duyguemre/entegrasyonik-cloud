// ADR-0029 Karar 6 (NB6): gercek zamanli olay yolu. YALNIZ 'zil' sinyali tasir: kimlik + kategori/onem. Baslik/metin/PII YOK
// (veri istemci tarafinda RPC ile cekilir). Tek surecte yerel; web/worker ayrilinca Redis pub/sub (kanal `rt:tid:{tid}`).
export interface RealtimeEvent {
    tid: number;
    /** Alici kullanici kimlikleri (tenant uyeleri). Sunucuda suzme icin; istemciye gitmez. */
    userIds: string[];
    kind: 'notification';
    /** Bildirim olayi (defter) kimligi. */
    id: string;
    meta: { category: string; severity: string };
}

export type RealtimeHandler = (evt: RealtimeEvent) => void;

export interface RealtimeBus {
    readonly kind: 'local' | 'redis';
    /** Asla firlatmaz (Redis yoksa/hata varsa yerel teslimata duser). */
    publish(evt: RealtimeEvent): Promise<void>;
    /** Tenant kanalina abone olur; donen fonksiyon aboneligi kapatir. */
    subscribe(tid: number, handler: RealtimeHandler): () => void;
    close(): Promise<void>;
}

/** Alinan (guvenilmeyen) yuku dogrular; yalniz bilinen alanlar gecer. */
export function parseRealtimeEvent(raw: string, expectedTid?: number): RealtimeEvent | undefined {
    try {
        const o = JSON.parse(raw);
        if (!o || o.kind !== 'notification' || !Number.isInteger(o.tid) || typeof o.id !== 'string' || !Array.isArray(o.userIds)) return undefined;
        if (expectedTid !== undefined && o.tid !== expectedTid) return undefined;
        const m = o.meta ?? {};
        return {
            tid: o.tid, kind: 'notification', id: o.id,
            userIds: o.userIds.filter((u: unknown): u is string => typeof u === 'string'),
            meta: { category: String(m.category ?? ''), severity: String(m.severity ?? '') },
        };
    } catch { return undefined; }
}

/** Kanala yazilan yuk: yalniz izinli alanlar (PII sizmasin diye yeniden kurulur). */
export function serializeRealtimeEvent(e: RealtimeEvent): string {
    return JSON.stringify({ tid: e.tid, userIds: e.userIds, kind: e.kind, id: e.id, meta: { category: e.meta.category, severity: e.meta.severity } });
}
