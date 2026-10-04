import crypto from 'crypto';
import { PLATFORM_PROCESS } from '@interfaces/index';
import { snapshot } from './pricePending';

/**
 * [eslesme-fiyat WP5, PLAN §3.4/§3.6, K-B] Otomatik fiyat yayını: `priceDirty:true` varyantların `pricePending.<kod>` kanallarını
 * mevcut export hattına (Dispatcher → Validator → Publisher → Sentinel; HİÇBİRİ değişmedi) `UPDATE_PRICE` ESP kaydı olarak bağlar.
 * Desen `StockPublishTrigger` ile AYNI (ExportStagedProduct upsert + ExportFlag.queuedCount + PROCESS_NEXT_SIGNAL); fark: bağımlılıklar
 * enjekte edilir (bellek-içi test).
 *
 * Kurallar:
 *  - Yalnız kanala gönderilmiş (TRANSFER COMPLETED) ve bağlı/etkin kanal; kill-switch kapalıysa işaret KORUNUR (açılınca gider).
 *  - Gövde özeti (`priceSync.hash` = satış|liste) son kuyruğa alınanla aynıysa yeniden gönderilmez (Trendyol "aynı gövde 15 dk"
 *    kuralı + gereksiz çağrı). Sonuçlanmamış aktif UPDATE_PRICE kaydı varsa bu tur ERTELENİR (işaret kalır).
 *  - İşaret temizliği KOŞULLU: `pricePending.<kod>.since` okunduğu gibiyse silinir (arada yeni değişiklik varsa kaybolmaz).
 *  - Validator varyantı TAZE okur ve fiyatı `effectiveChannelPrice` ile yeniden hesaplar (kuyruktaki değer bilgi amaçlı).
 */

export const PRICE_PUBLISH_JOB_NAME = 'pricing.publish';
export const PRICE_PUBLISH_SCAN_LIMIT = 2000;
const ACTIVE_STAGE_STATUSES = ['QUEUED', 'PREPARING', 'PENDING', 'SENT', 'WAITING'];
const PRIORITY = 110; // stok (120/500) ardından

export interface PricePublishDeps {
    redisReady(): boolean;
    /** Etkin tenant `order` listesi. */
    activeClients(): Promise<number[]>;
    clientDB(order: number): Promise<any | null>;
    /** ExportFlag modeli (App DB). */
    exportFlagModel(): Promise<any>;
    /** Tenant'ın bağlı ve etkin pazaryeri/e-ticaret kanal kodları. */
    activeChannels(clientDB: any): Promise<string[]>;
    matchKey(order: number, code: string): Promise<string>;
    allowNewWork(code: string): boolean;
    signal(): void;
    now?(): Date;
}

export interface PricePublishResult { skipped: boolean; scannedClients: number; staged: number; cleared: number; deferred: number }

export function priceBodyHash(sale: number | null, list: number | null): string {
    return crypto.createHash('sha1').update(`${sale ?? ''}|${list ?? ''}`).digest('hex').slice(0, 16);
}

export async function runPricePublish(deps: PricePublishDeps): Promise<PricePublishResult> {
    const res: PricePublishResult = { skipped: false, scannedClients: 0, staged: 0, cleared: 0, deferred: 0 };
    if (!deps.redisReady()) return { ...res, skipped: true };
    for (const order of await deps.activeClients()) {
        res.scannedClients++;
        try {
            const r = await runPricePublishForClient(deps, order);
            res.staged += r.staged; res.cleared += r.cleared; res.deferred += r.deferred;
        } catch (err) {
            console.error(`[PricePublishTrigger] tenant hata (order=${order}):`, (err as Error)?.message);
        }
    }
    return res;
}

export async function runPricePublishForClient(deps: PricePublishDeps, order: number): Promise<{ staged: number; cleared: number; deferred: number }> {
    const out = { staged: 0, cleared: 0, deferred: 0 };
    const clientDB = await deps.clientDB(order);
    if (!clientDB) return out;
    const variantModel = clientDB.getVariantModel();
    const dirty: any[] = await variantModel.find({ priceDirty: true }, { prices: 1, platforms: 1, barcode: 1, stockcode: 1, productId: 1, pricePending: 1 })
        .limit(PRICE_PUBLISH_SCAN_LIMIT).lean();
    if (!dirty?.length) return out;

    const channels = new Set(await deps.activeChannels(clientDB));
    const matchKeys: Record<string, string> = {};
    const perChannel: Record<string, number> = {};
    const now = deps.now ? deps.now() : new Date();
    const variantOps: any[] = [];

    for (const v of dirty) {
        const pending: Record<string, any> = v.pricePending && typeof v.pricePending === 'object' ? v.pricePending : {};
        for (const [code, mark] of Object.entries(pending)) {
            const clearFilter = { _id: v._id, [`pricePending.${code}.since`]: mark?.since ?? null };
            const clear = (extraSet?: Record<string, unknown>) => {
                variantOps.push({ updateOne: { filter: clearFilter, update: { $unset: { [`pricePending.${code}`]: '' }, ...(extraSet ? { $set: extraSet } : {}) } } });
                out.cleared++;
            };
            const info = v.platforms?.[code];
            // Kanal bağlı değil ya da ürün kanala hiç gönderilmemiş → güncellenecek ilan yok (ilk fiyat TRANSFER ile gider).
            if (!channels.has(code) || info?.upload?.TRANSFER?.status !== 'COMPLETED') { clear(); continue; }
            if (!deps.allowNewWork(code)) { out.deferred++; continue; } // kill-switch: işaret korunur

            const snap = snapshot(v, code);
            if (snap.sale === null || !(snap.sale > 0)) { clear(); continue; } // geçersiz fiyat gönderilmez (preflight PRICE_INVALID gösterir)
            const hash = priceBodyHash(snap.sale, snap.list);
            if (info?.priceSync?.hash === hash) { clear(); continue; } // aynı gövde zaten kuyruğa alındı/gönderildi

            matchKeys[code] ??= ((await deps.matchKey(order, code)) || 'barcode').toLowerCase();
            const matchKey = matchKeys[code];
            const matchValue = v[matchKey];
            if (!matchValue) { clear(); continue; }

            const inFlight = await clientDB.getExportStagedProductModel().countDocuments({
                integrationCode: code, mode: PLATFORM_PROCESS.UPDATE_PRICE, [matchKey]: matchValue, status: { $in: ACTIVE_STAGE_STATUSES },
            });
            if (inFlight > 0) { out.deferred++; continue; }

            await clientDB.getExportStagedProductModel().updateOne(
                { [matchKey]: matchValue, mode: PLATFORM_PROCESS.UPDATE_PRICE, integrationCode: code, status: { $in: ['QUEUED', 'PREPARING'] } },
                {
                    $set: {
                        productId: v.productId, payload: { barcode: v.barcode, stockcode: v.stockcode, productId: v.productId },
                        status: 'QUEUED', priorityScore: PRIORITY, price: snap.sale, listPrice: snap.list ?? undefined,
                        nextRunAt: now, updatedAt: now, barcode: v.barcode, stockcode: v.stockcode,
                    },
                    $setOnInsert: {
                        createdAt: now, requestId: `price-publish-${now.getTime()}`, batchId: null,
                        logs: [{ status: 'QUEUED', worker: 'PricePublishTrigger', message: `Sistem tetiklemeli fiyat yayını sıraya alındı (${mark?.reason ?? 'değişiklik'}).`, timestamp: now }],
                    },
                },
                { upsert: true },
            );
            clear({ [`platforms.${code}.priceSync`]: { hash, salePrice: snap.sale, listPrice: snap.list, source: snap.source, queuedAt: now } });
            perChannel[code] = (perChannel[code] || 0) + 1;
            out.staged++;
        }
    }

    if (variantOps.length) await variantModel.bulkWrite(variantOps, { ordered: false });
    // Tüm kanalları boşalan varyantlarda bayrak kalkar (yalnız boş nesne — arada yeni işaret gelmişse dokunulmaz).
    await variantModel.updateMany(
        { _id: { $in: dirty.map((v) => v._id) }, priceDirty: true, $or: [{ pricePending: {} }, { pricePending: { $exists: false } }] },
        { $unset: { priceDirty: '', pricePending: '' } },
    );

    if (Object.keys(perChannel).length) {
        const flags = await deps.exportFlagModel();
        for (const [code, count] of Object.entries(perChannel)) {
            await flags.updateOne({ clientId: order, integrationCode: code }, { $inc: { queuedCount: count }, $set: { lastUpdatedAt: now } }, { upsert: true });
        }
        deps.signal();
    }
    return out;
}
