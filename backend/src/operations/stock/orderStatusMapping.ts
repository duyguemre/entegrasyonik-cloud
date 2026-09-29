/**
 * ADR-0004 — Zero-oversell: rezervasyon, çakışma ve stok yayını modeli (Karar 3, seviye tetiklemeli sürücü).
 * bkz. docs/adr/0004-zero-oversell-rezervasyon-modeli.md
 *
 * Pazaryeri sipariş durumunu ADR'nin 3 kovasından (RESERVED/COMMITTED/RELEASED) birine eşler. Ham durum
 * adları TAHMİN EDİLMEDİ: her pazaryerinin KENDİ transformer'ından (`toInternalOrderPackages`/`mapStatus`)
 * okunan GERÇEK enum/string/sayısal değerlerdir:
 *  - Trendyol: `OrderTransformer.ts > STATUS_RULES` — 'Created'|'Picking'|'Invoiced'|'Shipped'|'Delivered'|
 *    'Cancelled'|'Unsupplied'|'Returned' (+ [C22] 'Awaiting'|'Verified'|'AtCollectionPoint'|'UnDelivered'|'UnPacked').
 *  - Hepsiburada: `OrderTransformer.ts > mapStringStatus` — küçük harfe çevrilmiş: 'open'|'awaitingapproval'|
 *    'packaged'|'unpacked'|'shipped'|'delivered'|'cancelledbymerchant'|'cancelledbycustomer'|'cancelled'|'returned'.
 *  - Pazarama: `OrderTransformer.ts > mapNumericStatus` — sayısal kodlar (3,12,5,16,19,11,9,6,18,13,14,7,8,10).
 *  - N11: [ADR-0018 Karar 2a(iii) düzeltmesi, 2026-09-29] `OrderMapper.ts > resolveStatus` — SOAP ham
 *    `orderList.order[].status` (string, `n11APISoapREFERANSDOKUMANTASYONU_v9_0.docx` §3.7 GetShipmentPackages
 *    kaynaklı): 'Created'|'Picking'|'Shipped'|'Delivered'|'Cancelled'|'UnSupplied' (bkz. `OrderMapper.ts`
 *    STATUS_RULES JSDoc'u — "Returned" dokümante EDİLMEMİŞ, N11'de iade ayrı `ClaimReturn` servisiyle
 *    yönetiliyor). 'UnPacked' anlamı doğrulanamadığı için (Trendyol'daki eşdeğeri gibi) KASITLI OLARAK
 *    tabloya girmedi, yedek katmana düşer.
 *
 * Yedek katman: ham durum tabloda yoksa (bilinmeyen/yeni bir ham değer ya da N11) `IOrder.internalStatus`
 * (OrderInternalStatusEnum — 4 adaptörün de zaten ürettiği normalize alan) üzerinden aynı 3 kovaya eşlenir.
 * Bucket sınırları ile `OrderInternalStatusEnum` sınırları KASITLI olarak birebir örtüşecek şekilde
 * seçildi (her adaptörün kendi `mapStatus`/`mapStringStatus`/`mapNumericStatus` fonksiyonu zaten bu
 * kovalarla eşleşiyor) — bu yüzden yedek katman "tahmin" değil, mevcut kodun DOĞRULANMIŞ bir başka görünümü.
 */

export type AllocationBucket = 'RESERVED' | 'COMMITTED' | 'RELEASED';

/** Pazaryeri kodu (küçük harf) -> ham durum değeri (string'e çevrilmiş) -> hedef kova. */
const RAW_STATUS_BUCKETS: Record<string, Record<string, AllocationBucket>> = {
    trendyol: {
        Created: 'RESERVED',
        Picking: 'RESERVED',
        Invoiced: 'RESERVED',
        Shipped: 'COMMITTED',
        Delivered: 'COMMITTED',
        Returned: 'COMMITTED',
        Cancelled: 'RELEASED',
        Unsupplied: 'RELEASED',
        // [C22 2026-09-28] Sipariş V2 yeni statüleri (spec §2.1; kararlar OrderTransformer.STATUS_RULES'ta gerekçeli):
        UnSupplied: 'RELEASED', // resmi yazım (büyük S); eski 'Unsupplied' ile aynı
        // Awaiting/Verified = ödeme onayı bekleyen paket. Trendyol: "stok düşümü dışında hiçbir işlem yapılmamalı" -> stok
        // rezervasyonu SERBEST (yalnızca stok), başka hiçbir aksiyon açılmaz. Sıfır-oversell için RESERVED korunur.
        Awaiting: 'RESERVED',
        Verified: 'RESERVED',
        // Teslim noktasında / teslim edilemedi: daha önce Shipped=COMMITTED olan paket geri RESERVED'a DÜŞMESİN.
        AtCollectionPoint: 'COMMITTED',
        UnDelivered: 'COMMITTED',
        // UnPacked: anlamı doğrulanamadı -> SKIP_RAW_STATUSES (kovaya sokulmaz).
    },
    hepsiburada: {
        open: 'RESERVED',
        awaitingapproval: 'RESERVED',
        packaged: 'RESERVED',
        unpacked: 'RESERVED',
        shipped: 'COMMITTED',
        delivered: 'COMMITTED',
        returned: 'COMMITTED',
        cancelledbymerchant: 'RELEASED',
        cancelledbycustomer: 'RELEASED',
        cancelled: 'RELEASED',
    },
    pazarama: {
        '3': 'RESERVED', // AWAITING_APPROVAL
        '12': 'RESERVED', // APPROVED
        '5': 'COMMITTED', '16': 'COMMITTED', '19': 'COMMITTED', // SHIPPED (üç varyant)
        '11': 'COMMITTED', '9': 'COMMITTED', // DELIVERED (iki varyant)
        '7': 'COMMITTED', '8': 'COMMITTED', '10': 'COMMITTED', // RETURNED (ADR: Returned -> COMMITTED)
        '6': 'RELEASED', '18': 'RELEASED', '13': 'RELEASED', '14': 'RELEASED', // CANCELLED (dört varyant)
    },
    n11: {
        created: 'RESERVED',
        picking: 'RESERVED',
        shipped: 'COMMITTED',
        delivered: 'COMMITTED',
        cancelled: 'RELEASED',
        unsupplied: 'RELEASED',
        // 'unpacked': anlamı doğrulanamadı -> SKIP_RAW_STATUSES (kovaya sokulmaz, Trendyol ile AYNI ihtiyat).
    },
};

/**
 * Açıkça ATLANAN ham durumlar (kovaya sokulmaz, `internalStatus` yedeğine de DÜŞMEZ): çağıran satırları atlar ve log basar
 * (mevcut rezervasyon/taahhüt olduğu gibi kalır). Şüphede muhafazakâr: anlamı doğrulanamayan durumda stok yönünü DEĞİŞTİRME.
 * Trendyol UnPacked (paket bozuldu/bölündü): çift rezervasyon veya yanlış serbest bırakma riski alınmaz.
 */
const SKIP_RAW_STATUSES: Record<string, ReadonlySet<string>> = {
    trendyol: new Set(['unpacked']), // karşılaştırma küçük harfle (webhook: UNPACKED)
    n11: new Set(['unpacked']), // OrderMapper.ts STATUS_RULES ile AYNI gerekçe (anlamı doğrulanamadı)
};

/** `OrderInternalStatusEnum` -> hedef kova (tüm adaptörlerin normalize ettiği ortak alan, yedek katman). */
const INTERNAL_STATUS_BUCKETS: Record<string, AllocationBucket> = {
    UNAPPROVED: 'RESERVED',
    AWAITING_APPROVAL: 'RESERVED',
    APPROVED: 'RESERVED',
    SHIPPED: 'COMMITTED',
    DELIVERED: 'COMMITTED',
    RETURNED: 'COMMITTED',
    CANCELLED: 'RELEASED',
};

/**
 * Sipariş satırı için istenen tahsis kovasını türetir. Önce pazaryerine özgü ham durum tablosuna bakar;
 * orada bulunamazsa (tablo yok / değer eşleşmedi) `internalStatus` yedeğine düşer. İkisi de sonuç
 * vermezse `null` döner (çağıran bu satırı ATLAR, log basar — StockAllocator ÇAĞRILMAZ).
 */
export function deriveDesiredAllocationBucket(
    integrationCode: string | null | undefined,
    externalStatus: string | null | undefined,
    internalStatus: string | null | undefined,
): AllocationBucket | null {
    const code = (integrationCode || '').toLowerCase().trim();
    const table = RAW_STATUS_BUCKETS[code];

    if (externalStatus !== undefined && externalStatus !== null && SKIP_RAW_STATUSES[code]?.has(String(externalStatus).toLowerCase())) {
        return null;
    }

    if (table && externalStatus !== undefined && externalStatus !== null) {
        // Hepsiburada/N11'in kendi mapStringStatus'u/resolveStatus'u küçük harfe çeviriyor; AYNI karşılaştırmayı kullanıyoruz.
        const lookupKey = (code === 'hepsiburada' || code === 'n11') ? String(externalStatus).toLowerCase() : String(externalStatus);
        const bucket = table[lookupKey];
        if (bucket) return bucket;
    }

    if (internalStatus && INTERNAL_STATUS_BUCKETS[internalStatus]) {
        return INTERNAL_STATUS_BUCKETS[internalStatus];
    }

    return null;
}
