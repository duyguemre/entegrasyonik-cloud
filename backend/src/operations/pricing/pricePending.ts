import { effectiveChannelPrice, effectiveListPrice, round2 } from '@platform/core/pricing/effectivePrice';
import { ObjectId } from 'mongodb';

/**
 * [eslesme-fiyat WP5, PLAN §3.4, K-B] Yerel → kanal OTOMATİK fiyat yayınının "tek kapısı" (stoktaki `markStockDirty` deseni).
 *
 * Kullanıcı/toplu/kural yazımı bir varyantın bir kanaldaki ETKİN fiyatını (`effectiveChannelPrice`: satış + liste) değiştirirse
 * `Variants.pricePending.<kod> = { since, reason }` işaretlenir; `PricePublishTrigger` (60 sn) bunu `UPDATE_PRICE` ESP kaydına
 * çevirir. Yalnız kanala GÖNDERİLMİŞ (TRANSFER COMPLETED) kanallar işaretlenir. Kanal → yerel yazım YOK (K-B; dış değişiklik yalnız
 * gözlem + uyarı, bkz. `externalDrift.ts`). Aynı değişiklik `PriceHistory`'ye `source` ile yazılır (manual/bulk/rule_channel; Ek B P1-4).
 *
 * Motorun yazdığı kanal alt alanları (`rulePrice`, `observed`, `priceSync`) FE formu `platforms` nesnesini bütün olarak geri
 * gönderdiğinde EZİLMESİN diye `preserveEngineChannelFields` önceki değerleri geri koyar.
 */

export type PriceChangeReason = 'manual' | 'bulk' | 'rule_channel' | 'suggestion' | 'resync';

export interface ChannelPriceSnapshot { sale: number | null; list: number | null; source: string }
export interface PriceChange {
    variantId: string;
    barcode?: string;
    code: string;
    before: ChannelPriceSnapshot;
    after: ChannelPriceSnapshot;
}

/** Motorun yazdığı kanal alt alanları (FE gövdesinden gelirse yok sayılır, önceki değer korunur). */
export const ENGINE_CHANNEL_PRICE_FIELDS = ['rulePrice', 'observed', 'priceSync'] as const;

/** Fark hesabı için okunacak alanlar. */
export const PRICE_DIFF_PROJECTION = { prices: 1, platforms: 1, barcode: 1, stockcode: 1, pricePending: 1 } as const;

/** Varyantın kanala gönderilmiş (TRANSFER COMPLETED) kanalları. */
export function publishedCodes(variant: any): string[] {
    const p = variant?.platforms;
    if (!p || typeof p !== 'object') return [];
    return Object.keys(p).filter((code) => p[code]?.upload?.TRANSFER?.status === 'COMPLETED');
}

export function snapshot(variant: any, code: string): ChannelPriceSnapshot {
    const e = effectiveChannelPrice(variant, code);
    return { sale: e.salePrice === null ? null : round2(e.salePrice), list: effectiveListPrice(e), source: e.source };
}

/** `before` → `after` arasında ETKİN kanal fiyatı değişen yayınlanmış kanallar (kanal listesi `before`'dan; yeni kanal TRANSFER ile gider). */
export function diffChannelPrices(before: any, after: any): PriceChange[] {
    const out: PriceChange[] = [];
    for (const code of publishedCodes(before)) {
        const b = snapshot(before, code);
        const a = snapshot(after, code);
        if (b.sale !== a.sale || b.list !== a.list) {
            out.push({ variantId: String(before._id), barcode: before.barcode ?? undefined, code, before: b, after: a });
        }
    }
    return out;
}

/** Nokta yollu `$set` gövdesini (toplu güncelleme) belgenin derin kopyasına uygular (fark hesabı için; DB'ye yazmaz). */
export function applyDotSet(doc: any, set: Record<string, unknown>): any {
    const copy = JSON.parse(JSON.stringify(doc ?? {}));
    for (const [path, value] of Object.entries(set)) {
        const keys = path.split('.');
        let cur = copy;
        for (let i = 0; i < keys.length - 1; i++) {
            if (cur[keys[i]] === null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
            cur = cur[keys[i]];
        }
        cur[keys[keys.length - 1]] = value;
    }
    return copy;
}

/** Gelen tam `platforms` nesnesine motor alt alanlarının ÖNCEKİ değerlerini geri koyar (girdi değiştirilmez). */
export function preserveEngineChannelFields(incomingPlatforms: any, beforePlatforms: any): any {
    if (!incomingPlatforms || typeof incomingPlatforms !== 'object') return incomingPlatforms;
    const out: any = { ...incomingPlatforms };
    for (const code of Object.keys(out)) {
        if (!out[code] || typeof out[code] !== 'object') continue;
        const next = { ...out[code] };
        for (const f of ENGINE_CHANNEL_PRICE_FIELDS) {
            delete next[f];
            const prev = beforePlatforms?.[code]?.[f];
            if (prev !== undefined) next[f] = prev;
        }
        out[code] = next;
    }
    return out;
}

/** Fark hesabı için mevcut varyantların fiyat görüntüsü (id → belge). Kimliksiz/yeni varyant yok sayılır. */
export async function loadPriceSnapshots(variantModel: any, ids: ReadonlyArray<unknown>): Promise<Map<string, any>> {
    const valid = ids.filter((id) => id !== undefined && id !== null && ObjectId.isValid(String(id))).map((id) => new ObjectId(String(id)));
    if (valid.length === 0) return new Map();
    const rows: any[] = await variantModel.find({ _id: { $in: valid } }, PRICE_DIFF_PROJECTION).lean();
    return new Map((rows || []).map((r) => [String(r._id), r]));
}

/** Varyant başına `$set` alanları: değişen kanallar için `pricePending.<kod>`. */
export function pricePendingFields(changes: ReadonlyArray<PriceChange>, reason: PriceChangeReason, now: Date = new Date()): Map<string, Record<string, unknown>> {
    const out = new Map<string, Record<string, unknown>>();
    for (const c of changes) {
        const set = out.get(c.variantId) ?? {};
        set[`pricePending.${c.code}`] = { since: now, reason };
        set.priceDirty = true;
        out.set(c.variantId, set);
    }
    return out;
}

/** PriceHistory kaydı (Ek B P1-4: manuel/toplu değişiklik de kanıta girer; K8/K10 bu kayıttan beslenir). */
export function historyDocs(changes: ReadonlyArray<PriceChange>, source: 'manual' | 'bulk' | 'rule_channel' | 'import', actor: string | null, now: Date = new Date(), extra: Record<string, unknown> = {}): any[] {
    return changes.filter((c) => c.after.sale !== null).map((c) => ({
        integrationCode: c.code, variantId: c.variantId, barcode: c.barcode, at: now, salePrice: c.after.sale,
        previousPrice: c.before.sale ?? undefined, listPrice: c.after.list ?? undefined, source, actor: actor ?? undefined,
        ...extra,
    }));
}

/**
 * Yazımdan SONRA çağrılır: değişen varyantlara `pricePending` işaretler + geçmişe yazar. Best-effort: hata kaydı yutulur
 * (fiyat yazımı zaten oldu; işaret kaybolursa kullanıcı "Platform fiyatlarını güncelle" ile elle gönderebilir — eski yol duruyor).
 */
export async function markPriceChanges(
    clientDB: any, changes: ReadonlyArray<PriceChange>, opts: { reason: PriceChangeReason; historySource: 'manual' | 'bulk' | 'rule_channel'; actor?: string | null; now?: Date; extra?: Record<string, unknown> },
): Promise<{ marked: number; history: number }> {
    if (changes.length === 0) return { marked: 0, history: 0 };
    const now = opts.now ?? new Date();
    let marked = 0, history = 0;
    try {
        const sets = pricePendingFields(changes, opts.reason, now);
        const ops = [...sets.entries()].map(([id, set]) => ({ updateOne: { filter: { _id: toId(id) }, update: { $set: set } } }));
        if (ops.length) { await clientDB.getVariantModel().bulkWrite(ops, { ordered: false }); marked = ops.length; }
    } catch (err) {
        console.error('[pricePending] işaretleme başarısız:', (err as Error)?.message);
    }
    try {
        const docs = historyDocs(changes, opts.historySource, opts.actor ?? null, now, opts.extra);
        if (docs.length) { await clientDB.getPriceHistoryModel().insertMany(docs, { ordered: false }); history = docs.length; }
    } catch (err) {
        console.error('[pricePending] fiyat geçmişi yazılamadı:', (err as Error)?.message);
    }
    return { marked, history };
}

const toId = (id: string): any => (ObjectId.isValid(id) ? new ObjectId(id) : id);
