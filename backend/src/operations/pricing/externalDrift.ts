// [eslesme-fiyat WP5, PLAN §3.4, K-B] Dış fiyat gözlemi ve çakışma çözümü. Kanal → yerel OTOMATİK YAZMA YOKTUR.
//
// Günlük dış mutabakat (ExternalReconciliationJob, zaten kanal ürün akışını okuyor; EK API ÇAĞRISI YOK) her eşleşen varyant için kanalın
// raporladığı satış/liste fiyatını `platforms.<kod>.observed` alanına yazar. Gözlenen satış fiyatı bizim ETKİN fiyatımızdan (`effectiveChannelPrice`)
// farklıysa ve bizim bekleyen/yeni gönderilmiş bir değişikliğimiz yoksa `observed.drift=true` + PriceHistory `external` (K10/K17 kanıtı).
// Kullanıcı farkı görür (hazırlık denetiminde PRICE_EXTERNAL_DRIFT uyarısı) ve seçer: `pushLocal` (yereli kanala yeniden yaz) ya da
// `acceptChannel` (kanal fiyatını bu kanalın özel fiyatı olarak al). İkisi de kullanıcı eylemidir (RPC `PricingService/resolvePriceDrift`).
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { AppError } from '@platform/core/errors';
import { round2 } from '@platform/core/pricing/effectivePrice';
import { diffChannelPrices, snapshot } from './pricePending';

/** Bizim kuyruğa aldığımız fiyatın kanala yansıması için tanınan süre (bu sürede fark "dış değişiklik" sayılmaz). */
export const DRIFT_GRACE_MS = 6 * 60 * 60 * 1000;

/** "130,50" / "1.299,90" / 130.5 → sayı (TR biçimi dahil); geçersizse null. */
export function parseMoney(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string' || v.trim() === '') return null;
    let s = v.trim();
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

export interface DriftEval {
    observed: { salePrice: number; marketPrice: number | null };
    expected: number | null;
    drift: boolean;
}

/** Saf: gözlenen fiyatı bizim etkin fiyatımızla karşılaştırır (bekleyen/yeni gönderilmiş değişiklik varsa fark sayılmaz). */
export function evaluateDrift(variant: any, code: string, observed: { salePrice?: unknown; marketPrice?: unknown }, now: Date): DriftEval | null {
    const sale = parseMoney(observed.salePrice);
    if (sale === null || sale <= 0) return null;
    const list = parseMoney(observed.marketPrice);
    const exp = snapshot(variant, code).sale;
    const queuedAt = variant?.platforms?.[code]?.priceSync?.queuedAt;
    const recentlyQueued = queuedAt && now.getTime() - new Date(queuedAt).getTime() < DRIFT_GRACE_MS;
    const pending = !!variant?.pricePending?.[code];
    const drift = exp !== null && !pending && !recentlyQueued && Math.abs(round2(sale) - exp) >= 0.01;
    return { observed: { salePrice: round2(sale), marketPrice: list === null ? null : round2(list) }, expected: exp, drift };
}

/** Mutabakat turunda tek varyant×kanal gözlemi yazar. Dönüş: fark var mı. */
export async function recordObservation(clientDB: any, variant: any, code: string, summary: { salePrice?: unknown; marketPrice?: unknown }, now: Date): Promise<boolean> {
    const e = evaluateDrift(variant, code, summary, now);
    if (!e) return false;
    const prev = variant?.platforms?.[code]?.observed;
    await clientDB.getVariantModel().updateOne({ _id: variant._id }, {
        $set: { [`platforms.${code}.observed`]: { ...e.observed, at: now, source: 'reconciliation', drift: e.drift, expectedSalePrice: e.expected } },
    });
    // Aynı dış fiyat her gün yeniden geçmişe yazılmaz (yalnız yeni bir dış değer).
    if (e.drift && !(prev?.drift && round2(prev?.salePrice) === e.observed.salePrice)) {
        await clientDB.getPriceHistoryModel().create({
            integrationCode: code, variantId: variant._id, barcode: variant.barcode, at: now, salePrice: e.observed.salePrice,
            previousPrice: e.expected ?? undefined, listPrice: e.observed.marketPrice ?? undefined, source: 'external',
        });
    }
    return e.drift;
}

/** Mutabakatın okuması gereken varyant alanları (kanal başına). */
export const driftProjection = (code: string) => `_id barcode prices pricePending platforms.${code}`;

export const resolveDriftInput = z.object({
    variantId: z.string().regex(/^[0-9a-fA-F]{24}$/),
    integrationCode: z.string().regex(/^[A-Za-z0-9_-]+$/).max(40),
    action: z.enum(['pushLocal', 'acceptChannel']),
}).strict();

/**
 * Kullanıcı kararı (K-B): `pushLocal` → yerel etkin fiyat kanala yeniden gönderilir (pricePending, gövde özeti sıfırlanır);
 * `acceptChannel` → gözlenen fiyat bu kanalın ÖZEL fiyatı olur (bayrak açılır; diğer kanalların etkin fiyatı DEĞİŞMEZ — bayrak kapalıyken
 * etkisiz duran eski kanal nesneleri kaldırılır ki bayrak açılınca canlanmasınlar).
 */
export async function resolvePriceDrift(clientDB: any, actor: string | null, raw: unknown, now: Date = new Date()) {
    const p = resolveDriftInput.safeParse(raw ?? {});
    if (!p.success) throw AppError.of('VALIDATION', { message: 'Geçersiz istek.', details: p.error.issues.map((x) => ({ path: x.path.join('.') })) });
    const { variantId, integrationCode: code, action } = p.data;
    const model = clientDB.getVariantModel();
    const v = await model.findOne({ _id: new ObjectId(variantId) }, { barcode: 1, prices: 1, platforms: 1, pricePending: 1 }).lean();
    if (!v) throw AppError.of('NOT_FOUND', { message: 'Varyant bulunamadı.' });
    const obs = v.platforms?.[code]?.observed;
    if (!obs?.drift) throw AppError.of('VALIDATION', { message: 'Bu kanalda çözülecek fiyat farkı yok.' });

    if (action === 'pushLocal') {
        await model.updateOne({ _id: v._id }, {
            $set: { [`pricePending.${code}`]: { since: now, reason: 'resync' }, priceDirty: true, [`platforms.${code}.observed.drift`]: false },
            $unset: { [`platforms.${code}.priceSync`]: '' },
        });
        return { action, integrationCode: code, salePrice: snapshot(v, code).sale };
    }

    const set: Record<string, unknown> = {
        [`platforms.${code}.prices`]: { salePrice: obs.salePrice, marketPrice: obs.marketPrice ?? obs.salePrice },
        [`platforms.${code}.observed.drift`]: false,
    };
    const unset: Record<string, ''> = {};
    if (v.prices?.isPlatformBasedPrice !== true) {
        set['prices.isPlatformBasedPrice'] = true;
        for (const other of Object.keys(v.platforms ?? {})) if (other !== code && v.platforms[other]?.prices) unset[`platforms.${other}.prices`] = '';
    }
    // Güvenlik: diğer kanalların etkin fiyatı değişmemeli (yalnız bu kanal gözlenen fiyata geçer).
    const after = JSON.parse(JSON.stringify(v));
    after.prices = { ...after.prices, isPlatformBasedPrice: true };
    for (const k of Object.keys(unset)) delete after.platforms[k.split('.')[1]].prices;
    after.platforms[code].prices = set[`platforms.${code}.prices`];
    const others = diffChannelPrices(v, after).filter((c) => c.code !== code);
    if (others.length) throw AppError.of('CONFLICT', { message: 'Bu işlem diğer kanalların fiyatını değiştirirdi; ürün formundan kanal fiyatlarını düzenleyin.' });
    await model.updateOne({ _id: v._id }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
    await clientDB.getPriceHistoryModel().create({
        integrationCode: code, variantId: v._id, barcode: v.barcode, at: now, salePrice: obs.salePrice, previousPrice: snapshot(v, code).sale ?? undefined,
        listPrice: obs.marketPrice ?? undefined, source: 'manual', actor: actor ?? undefined,
    });
    return { action, integrationCode: code, salePrice: obs.salePrice };
}
