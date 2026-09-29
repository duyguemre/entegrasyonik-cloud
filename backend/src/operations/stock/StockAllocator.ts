import { IClientDB } from "@interfaces/index";
import { AllocationState, IStockAllocationResult, deriveAvailable } from "@interfaces/stock";

/**
 * ADR-0004 — Zero-oversell: rezervasyon, çakışma ve stok yayını modeli (Karar 1-2).
 * bkz. docs/adr/0004-zero-oversell-rezervasyon-modeli.md
 *
 * Doğruluk kaynağı tenant ClientDB `Variants` dokümanıdır. Her geçiş TEK doküman üzerinde koşullu
 * atomik `findOneAndUpdate` ile uygulanır (Mongo'nun bedava verdiği tek-doküman atomikliği); replica
 * set / transaction / Redis sayacı GEREKMEZ. Çok satırlı siparişte her satır bağımsız ele alınır.
 *
 * İdempotency: her satır `key = "<integrationCode>:<externalOrderId>:<externalLineItemId>"` ile
 * (iade: `"return:<integrationCode>:<claimId>:<lineId>"`) `allocations[]` dizisinde, AYNI dokümanda
 * izlenir. Aynı `key` ile tekrar çağrı, mevcut durumu bozmadan aynı sonucu döner (no-op).
 *
 * Terminal state'ler (COMMITTED, RELEASED, RESTOCKED) GERİ DÖNMEZ — her metotta guard ile garanti
 * edilir (mevcut state terminal ise idempotent no-op döner, hiçbir $inc/$set uygulanmaz).
 *
 * `available = stock - reserved` TÜRETİLİR, hiçbir yerde saklanmaz (bkz. `StockAllocator.available`).
 *
 * KAPSAM DIŞI (bu sınıfta YOK, Aşama B/`PostOrderOperations`'ta): pazaryeri durumundan RESERVED/
 * COMMITTED/RELEASED türetme, `stockPolicy` okuma/karar (ör. `restock` çağrılmadan ÖNCE tenant'ın
 * `autoRestock` açık mı kontrolü çağıranın sorumluluğudur — bu sınıf tek Variant dokümanı dışına bakmaz).
 */
export class StockAllocator {
    /** Aynı anahtar için art arda okuma+koşullu-yazma arasında BAŞKA bir eşzamanlı çağrı araya girerse
     * (TOCTOU) döngü ile yeniden okunur; ADR'nin "veritabanına ilk ulaşan kazanır" kuralı bozulmaz,
     * bu sadece "kaybeden" çağrının doğru no-op/terminal sonucu bulması için tekrar deneme sayısıdır. */
    private static readonly MAX_RACE_RETRY = 5;

    constructor(private clientDB: IClientDB) { }

    private get model() {
        return this.clientDB.getVariantModel();
    }

    /** `available = stock - reserved`. DB'de saklanmaz, her ihtiyaçta türetilir. */
    public static available(variant: { stock?: number; reserved?: number } | null | undefined): number {
        return deriveAvailable(variant);
    }

    /**
     * Rezerve (ADR Karar 2, madde 1). Tek atomik `findOneAndUpdate`:
     * - Eşleşirse (anahtar yok VE `available >= qty`): RESERVED push + `reserved`/`stockVersion` artır.
     * - Eşleşme yoksa VE anahtar zaten varsa: idempotent no-op (mevcut durumu döner).
     * - Eşleşme yoksa VE anahtar yoksa (yetersiz stok): guard'lı OVERSOLD push.
     */
    public async reserve(variantId: any, key: string, qty: number): Promise<IStockAllocationResult> {
        const now = new Date();

        const reservedDoc = await this.model.findOneAndUpdate(
            {
                _id: variantId,
                'allocations.key': { $ne: key },
                // $ifNull: eski dokümanlarda `stock`/`reserved` alanı henüz yoksa (migration YOK, strict:false)
                // $subtract'in null üzerinde patlamasını önler; şema varsayılanı 0'dır.
                $expr: {
                    $gte: [
                        { $subtract: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$reserved', 0] }] },
                        qty,
                    ],
                },
            },
            {
                $inc: { reserved: qty, stockVersion: 1 },
                $push: { allocations: { key, qty, state: 'RESERVED', at: now } },
                // ADR Karar 6: stok etkileyen (available'ı değiştiren) her geçiş stockDirty=true yapar.
                $set: { stockDirty: true },
            },
            { new: true },
        );
        if (reservedDoc) return { state: 'RESERVED', idempotent: false, variant: reservedDoc };

        for (let attempt = 0; attempt < StockAllocator.MAX_RACE_RETRY; attempt++) {
            const current = await this.model.findOne({ _id: variantId }).lean();
            if (!current) throw new Error(`[StockAllocator] reserve: variant bulunamadı (${String(variantId)})`);

            const existing = (current.allocations || []).find((a: any) => a.key === key);
            if (existing) {
                // Idempotent: aynı anahtarla tekrar çağrı, mevcut durumu bozmadan aynı sonucu döner.
                return { state: existing.state, idempotent: true, variant: current };
            }

            // Anahtar hiç yok -> yetersiz stok. Guard'lı OVERSOLD push (available değişmez, stockDirty
            // gerekmez -- yalnızca telafi/bildirim akışı bu satırı işler, Aşama C).
            const oversoldDoc = await this.model.findOneAndUpdate(
                { _id: variantId, 'allocations.key': { $ne: key } },
                { $push: { allocations: { key, qty, state: 'OVERSOLD', at: now } } },
                { new: true },
            );
            if (oversoldDoc) return { state: 'OVERSOLD', idempotent: false, variant: oversoldDoc };
            // race: bu aralıkta başka bir çağrı aynı anahtarı ekledi -- döngü başına dön, `existing` bulunacak.
        }
        throw new Error(`[StockAllocator] reserve: eşzamanlı çakışma çözülemedi (key=${key})`);
    }

    /**
     * Sevk/Commit (ADR Karar 2, madde 2). Normal yol: RESERVED -> COMMITTED (`stock` VE `reserved`
     * birlikte düşer). İlk kez sevk edilmiş görülen sipariş (anahtar hiç yok): `reserved`'a DOKUNULMAZ
     * (hiç rezerve edilmemişti), yalnızca `stock` düşer. OVERSOLD -> COMMITTED de aynı mantıkla (OVERSOLD
     * satırında `reserved` hiç artırılmamıştı) yalnızca `stock` düşer.
     */
    public async commit(variantId: any, key: string, qty: number): Promise<IStockAllocationResult> {
        const now = new Date();

        for (let attempt = 0; attempt < StockAllocator.MAX_RACE_RETRY; attempt++) {
            const committedDoc = await this.model.findOneAndUpdate(
                { _id: variantId, allocations: { $elemMatch: { key, state: 'RESERVED' } } },
                {
                    $inc: { stock: -qty, reserved: -qty },
                    $set: { 'allocations.$.state': 'COMMITTED', stockDirty: true },
                },
                { new: true },
            );
            if (committedDoc) return { state: 'COMMITTED', idempotent: false, variant: committedDoc };

            const current = await this.model.findOne({ _id: variantId }).lean();
            if (!current) throw new Error(`[StockAllocator] commit: variant bulunamadı (${String(variantId)})`);
            const existing = (current.allocations || []).find((a: any) => a.key === key);

            if (!existing) {
                // İlk kez sevk edilmiş görülen sipariş: reserved'a DOKUNULMAZ.
                const insertedDoc = await this.model.findOneAndUpdate(
                    { _id: variantId, 'allocations.key': { $ne: key } },
                    {
                        $inc: { stock: -qty },
                        $push: { allocations: { key, qty, state: 'COMMITTED', at: now } },
                        $set: { stockDirty: true },
                    },
                    { new: true },
                );
                if (insertedDoc) return { state: 'COMMITTED', idempotent: false, variant: insertedDoc };
                continue; // race: bu aralıkta başka bir çağrı aynı anahtarı ekledi -- tekrar oku.
            }

            if (existing.state === 'RESERVED') continue; // race: bir önceki adımdan sonra RESERVED oldu, yeniden dene.

            if (existing.state === 'OVERSOLD') {
                // OVERSOLD satırında reserved hiç artırılmamıştı -- yalnızca stock düşer.
                const fromOversoldDoc = await this.model.findOneAndUpdate(
                    { _id: variantId, allocations: { $elemMatch: { key, state: 'OVERSOLD' } } },
                    {
                        $inc: { stock: -qty },
                        $set: { 'allocations.$.state': 'COMMITTED', stockDirty: true },
                    },
                    { new: true },
                );
                if (fromOversoldDoc) return { state: 'COMMITTED', idempotent: false, variant: fromOversoldDoc };
                continue; // race
            }

            // Terminal state'ler (COMMITTED/RELEASED/RESTOCKED): geri dönüş YOK -- idempotent no-op.
            return { state: existing.state, idempotent: true, variant: current };
        }
        throw new Error(`[StockAllocator] commit: eşzamanlı çakışma çözülemedi (key=${key})`);
    }

    /**
     * İptal/Release (ADR Karar 2, madde 3). RESERVED -> RELEASED: `reserved` geri düşer (qty allocations
     * dizisinden okunur, çağıran taşımaz). OVERSOLD -> RELEASED: stok/reserved etkisi YOK (hiç rezerve
     * edilmemişti). Hiç görülmemiş satır iptal olarak gelirse "mezar taşı" RELEASED push edilir
     * (qty=0 -- amaç yalnızca sonradan gelecek bayat "oluşturuldu" durumunu no-op'a düşürmek; ADR bu
     * qty'yi açıkça belirtmiyor, burada alınan karar: stok/reserved etkisi olmaması için 0).
     */
    public async release(variantId: any, key: string): Promise<IStockAllocationResult> {
        const now = new Date();

        for (let attempt = 0; attempt < StockAllocator.MAX_RACE_RETRY; attempt++) {
            const current = await this.model.findOne({ _id: variantId }).lean();
            if (!current) throw new Error(`[StockAllocator] release: variant bulunamadı (${String(variantId)})`);
            const existing = (current.allocations || []).find((a: any) => a.key === key);

            if (!existing) {
                const tombstoneDoc = await this.model.findOneAndUpdate(
                    { _id: variantId, 'allocations.key': { $ne: key } },
                    { $push: { allocations: { key, qty: 0, state: 'RELEASED', at: now } } },
                    { new: true },
                );
                if (tombstoneDoc) return { state: 'RELEASED', idempotent: false, variant: tombstoneDoc };
                continue; // race
            }

            if (existing.state === 'RESERVED') {
                const releasedDoc = await this.model.findOneAndUpdate(
                    { _id: variantId, allocations: { $elemMatch: { key, state: 'RESERVED' } } },
                    {
                        $inc: { reserved: -existing.qty },
                        $set: { 'allocations.$.state': 'RELEASED', stockDirty: true },
                    },
                    { new: true },
                );
                if (releasedDoc) return { state: 'RELEASED', idempotent: false, variant: releasedDoc };
                continue; // race: okuma ile yazma arasında state değişti -- yeniden oku.
            }

            if (existing.state === 'OVERSOLD') {
                const releasedDoc = await this.model.findOneAndUpdate(
                    { _id: variantId, allocations: { $elemMatch: { key, state: 'OVERSOLD' } } },
                    { $set: { 'allocations.$.state': 'RELEASED' } },
                    { new: true },
                );
                if (releasedDoc) return { state: 'RELEASED', idempotent: false, variant: releasedDoc };
                continue; // race
            }

            // Terminal state'ler (COMMITTED/RELEASED/RESTOCKED): geri dönüş YOK -- idempotent no-op.
            return { state: existing.state, idempotent: true, variant: current };
        }
        throw new Error(`[StockAllocator] release: eşzamanlı çakışma çözülemedi (key=${key})`);
    }

    /**
     * İade/Restock (ADR Karar 2, madde 4). Stoka geri alma varsayılan KAPALIDIR: yalnızca çağıran
     * `opts.allowed === true` geçerse uygulanır. Tenant `stockPolicy.autoRestock` okuma/kararı
     * ÇAĞIRANIN sorumluluğudur (Aşama B) -- bu sınıf tek Variant dokümanı dışına bakmaz.
     */
    public async restock(
        variantId: any,
        claimKey: string,
        qty: number,
        opts: { allowed: boolean } = { allowed: false },
    ): Promise<IStockAllocationResult> {
        if (!opts.allowed) {
            return { state: 'SKIPPED_POLICY', idempotent: true, variant: null };
        }
        const now = new Date();

        for (let attempt = 0; attempt < StockAllocator.MAX_RACE_RETRY; attempt++) {
            const restockedDoc = await this.model.findOneAndUpdate(
                { _id: variantId, 'allocations.key': { $ne: claimKey } },
                {
                    $inc: { stock: qty },
                    $push: { allocations: { key: claimKey, qty, state: 'RESTOCKED', at: now } },
                    $set: { stockDirty: true },
                },
                { new: true },
            );
            if (restockedDoc) return { state: 'RESTOCKED', idempotent: false, variant: restockedDoc };

            const current = await this.model.findOne({ _id: variantId }).lean();
            if (!current) throw new Error(`[StockAllocator] restock: variant bulunamadı (${String(variantId)})`);
            const existing = (current.allocations || []).find((a: any) => a.key === claimKey);
            if (!existing) continue; // race: tekrar dene

            // Terminal guard: aynı claimKey ile tekrar çağrı (idempotent) ya da başka bir state'ten
            // RESTOCKED'a geçiş YOK (ADR: terminal state'lerden geri dönüş yok).
            return { state: existing.state, idempotent: true, variant: current };
        }
        throw new Error(`[StockAllocator] restock: eşzamanlı çakışma çözülemedi (key=${claimKey})`);
    }
    /**
     * OVERSOLD -> RESERVED yeniden deneme (ADR Karar 7b, Aşama C). YENİ, ADDITIVE bir metottur: Karar 2
     * (Aşama A/B, bu görevde DEĞİŞTİRİLMEDİ) bu geçişi TANIMLAMAZ — `reserve()` var olan bir anahtarı
     * (terminal olsun olmasın) her zaman idempotent no-op olarak döner, OVERSOLD'dan asla RESERVED'e
     * geçmez. Mevcut `reserve/commit/release/restock` metotlarının HİÇBİRİNİN gövdesi değişmedi.
     *
     * Grace-period penceresi/karar (ne zaman çağrılacağı) ÇAĞIRANIN sorumluluğudur (`OversellCompensationJob`,
     * Aşama C) — bu metot yalnızca "şu an stok yeterliyse OVERSOLD->RESERVED'e geç" atomik işlemini yapar.
     * Terminal olmayan ama zaten OVERSOLD'dan başka bir duruma geçmiş satırlar (RESERVED/COMMITTED/RELEASED
     * -- ör. süpürme işi araya girmiş) idempotent no-op döner; hiç görülmemiş anahtar da (mezar taşı/asla
     * oluşturulmamış) no-op döner (RELEASED gibi ele alınır -- yeniden deneme için OVERSOLD kaydı yok).
     */
    public async retryOversold(variantId: any, key: string, qty: number): Promise<IStockAllocationResult> {
        const now = new Date();

        const retriedDoc = await this.model.findOneAndUpdate(
            {
                _id: variantId,
                allocations: { $elemMatch: { key, state: 'OVERSOLD' } },
                $expr: {
                    $gte: [
                        { $subtract: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$reserved', 0] }] },
                        qty,
                    ],
                },
            },
            {
                $inc: { reserved: qty, stockVersion: 1 },
                $set: { 'allocations.$.state': 'RESERVED', 'allocations.$.at': now, stockDirty: true },
            },
            { new: true },
        );
        if (retriedDoc) return { state: 'RESERVED', idempotent: false, variant: retriedDoc };

        const current = await this.model.findOne({ _id: variantId }).lean();
        if (!current) throw new Error(`[StockAllocator] retryOversold: variant bulunamadı (${String(variantId)})`);
        const existing = (current.allocations || []).find((a: any) => a.key === key);

        if (!existing) {
            // Hiç görülmemiş anahtar: yeniden denenecek bir OVERSOLD kaydı yok -- no-op.
            return { state: 'RELEASED', idempotent: true, variant: current };
        }
        // existing.state === 'OVERSOLD' ise $expr (stok hâlâ yetersiz) tuttuğu için eşleşmedi; başka bir
        // duruma geçmişse (RESERVED/COMMITTED/RELEASED) zaten bu metodun ilgi alanı dışında -- her ikisi de
        // idempotent no-op'tur.
        return { state: existing.state, idempotent: true, variant: current };
    }
}

export type { AllocationState };
