import { OrderInternalStatusEnum as S } from '@interfaces/order';

// [eslesme-fiyat WP6-kalan, D-ORD-4] Sipariş iç durumlarının KANALDAN BAĞIMSIZ tabloları — tek kaynak.
// Kanal ham durum → iç durum eşlemeleri adaptörlerde kalır (her biri bilinmeyen değerde `reportUnknownEnum` çağırır);
// iç durumun ağırlığı (senkron geri gitmez), stok kovası (ADR-0004 yedek katmanı) ve geçerli liste BURADADIR.
// Eskiden ağırlık tablosu OrderRepository'de iki kez, stok kovası orderStatusMapping'de, liste capabilities'te ayrı yazılıydı.
//
// Yeni durumlar:
//  - PRE_APPROVAL: pazaryeri ön onayı bekleniyor (HB `AwaitingPreApproval`); satıcı aksiyonu AÇILMAZ, stok RESERVED.
//  - SPLIT: paket bölündü, yerini yeni paketler aldı (TY `UnPacked`; yeni paketler `platformFields.splitFrom` taşır).
//    Kapanış durumu; stok yönü DEĞİŞMEZ (kova yok → çağıran atlar; çift rezervasyon/serbest bırakma riski alınmaz).

/** Tüm iç durumlar (API/yetenek şemaları buradan). */
export const ORDER_INTERNAL_STATUSES = Object.values(S) as [S, ...S[]];

/**
 * Senkron ağırlığı: gelen durumun ağırlığı mevcut olandan KÜÇÜKSE iç durum geri alınmaz. Kapanış durumları 10.
 * PRE_APPROVAL = UNAPPROVED (0): ön onaydan normal onay beklemeye (1) ileri geçiş serbest.
 */
export const ORDER_STATUS_WEIGHTS: Readonly<Record<S, number>> = {
    [S.UNAPPROVED]: 0,
    [S.PRE_APPROVAL]: 0,
    [S.AWAITING_APPROVAL]: 1,
    [S.APPROVED]: 2,
    [S.SHIPPED]: 4,
    [S.DELIVERED]: 5,
    [S.CANCELLED]: 10,
    [S.RETURNED]: 10,
    [S.SPLIT]: 10,
};

export function orderStatusWeight(status: string | null | undefined): number {
    return (status && (ORDER_STATUS_WEIGHTS as Record<string, number>)[status]) || 0;
}

export type OrderAllocationBucket = 'RESERVED' | 'COMMITTED' | 'RELEASED';

/** ADR-0004 yedek katmanı: iç durum → stok kovası. SPLIT bilinçli olarak YOK (stok yönü değişmez). */
export const ORDER_INTERNAL_STATUS_BUCKETS: Readonly<Partial<Record<S, OrderAllocationBucket>>> = {
    [S.UNAPPROVED]: 'RESERVED',
    [S.PRE_APPROVAL]: 'RESERVED',
    [S.AWAITING_APPROVAL]: 'RESERVED',
    [S.APPROVED]: 'RESERVED',
    [S.SHIPPED]: 'COMMITTED',
    [S.DELIVERED]: 'COMMITTED',
    [S.RETURNED]: 'COMMITTED',
    [S.CANCELLED]: 'RELEASED',
};
