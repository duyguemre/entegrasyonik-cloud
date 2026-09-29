/**
 * ADR-0004 — Zero-oversell: rezervasyon, çakışma ve stok yayını modeli.
 * Doğruluk kaynağı: tenant ClientDB `Variants` dokümanı. Bu dosya yalnızca TİP tanımlarını taşır;
 * iş kuralı/atomik geçişler `@operations/stock/StockAllocator` içindedir.
 * bkz. docs/adr/0004-zero-oversell-rezervasyon-modeli.md
 */

export type AllocationState = 'RESERVED' | 'COMMITTED' | 'RELEASED' | 'OVERSOLD' | 'RESTOCKED';

/** Terminal state'ler: buradan geri dönüş YOK (ADR Karar 2, madde 2 sonu). */
export const TERMINAL_ALLOCATION_STATES: ReadonlySet<AllocationState> = new Set<AllocationState>([
    'COMMITTED',
    'RELEASED',
    'RESTOCKED',
]);

export interface IAllocationEntry {
    /** `"<integrationCode>:<externalOrderId>:<externalLineItemId>"`; iade: `"return:<integrationCode>:<claimId>:<lineId>"`. */
    key: string;
    qty: number;
    state: AllocationState;
    at: Date;
}

export interface IStockPolicy {
    /** Birincil olmayan kanallarda son adedi koruyan tampon (adet). Varsayılan 1. */
    bufferUnits?: number;
    /** Yüzde tampon; varsayılan 0 (kapalı). */
    bufferPercent?: number;
    /** Grace penceresi sonunda OVERSOLD satırı otomatik iptal edilsin mi. Varsayılan true; kanalın gerçek/testli iptal yeteneği yoksa (ör. N11/C9) uygulanmaz. */
    autoCancelOversold?: boolean;
    /** OVERSOLD sonrası otomatik iptalden önce beklenecek dakika. Varsayılan 30. */
    graceMinutes?: number;
    /** İade/claim akışında stoka otomatik geri alma. Varsayılan KAPALI (false). */
    autoRestock?: boolean;
    /** Tenant düzeyi: SKU ≥2 kanalda listeleniyorsa "son adet" bu kanalda satılır. */
    primaryChannel?: string;
}

/** StockAllocator metotlarının döndürdüğü sonuç (mevcut/etkilenen allocation kaydının durumu). */
export interface IStockAllocationResult<TVariant = any> {
    state: AllocationState | 'SKIPPED_POLICY';
    /** true ise bu çağrı state'i DEĞİŞTİRMEDİ (aynı key ile tekrar çağrı ya da terminal state guard'ı). */
    idempotent: boolean;
    /** İşlem sonrası (veya no-op durumunda mevcut) varyant dokümanı; SKIPPED_POLICY'de null. */
    variant: TVariant | null;
}

/** `available = stock - reserved` — TÜRETİLİR, hiçbir yerde saklanmaz (ADR Karar 1). */
export function deriveAvailable(variant: { stock?: number; reserved?: number } | null | undefined): number {
    if (!variant) return 0;
    return (variant.stock ?? 0) - (variant.reserved ?? 0);
}
