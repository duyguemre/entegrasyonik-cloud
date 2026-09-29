export interface IProduct {
    _id?: any
    code: string;
    maincode: string;
    tempId: string
    title: string;
    description?: string;
    brand: string;
    category: string;
    hasVariant: boolean;
    images: any[];
    variants: IVariant[];
    platforms?: any,

    shippingDuration?: number
    taxPercentage?: number
    desi?: number
    warranty?: number
    maxPurchaseQuantity?: number
}

export interface IVariant {
    _id?: any
    code: string;
    platformProductId?: string;
    maincode: string;
    title: string;
    description: string;
    barcode: string;
    stockcode: string;
    stock: number;
    prices: IVariantPrices;
    images: Array<String>;
    choices: IVariantChoice[];
    platforms: {
        [integrationCode: string]: IPlatformInfo;
    };
    taxPercentage: number;
    onSale: boolean;
    tempId: string;
    uniqueId: string;
    choiceId: string;
    choiceValueId: string;
    choiceValueTitle: string;
    product?: IProduct;

    lotNumber?: string;

    // ADR-0004 Karar 1 (zero-oversell) — bkz. docs/adr/0004-zero-oversell-rezervasyon-modeli.md.
    // Yeni tenantlarda/eski dokümanlarda alan yoksa şema varsayılanı (0/[]/false) geçerlidir; migration YOK.
    /** Sevk edilmemiş aktif rezervasyon toplamı. `available = stock - reserved` TÜRETİLİR, saklanmaz. */
    reserved?: number;
    allocations?: import('@interfaces/stock').IAllocationEntry[];
    /** Her stok etkileyen işlemde artar; yalnızca mutabakat (onarım) yolunda optimistic guard. */
    stockVersion?: number;
    /** Kanal sayısı kadar indeks açmamak için tek bayrak (kanal bazlı detay platforms.<code>.stockSync.dirty). */
    stockDirty?: boolean;
}

export interface IVariantPrices {
    isPlatformBasedPrice: boolean;
    price: number;
    salePrice: number;
    marketPrice: number;
}

export interface IPlatformInfo {
    prices: {
        salePrice: number;
        marketPrice: number;
    };
    upload: any,
    attributes: Array<{
        [attributeId: string]: {
            attributeName: string;
            attributeValue: string;
            attributeValueId: string;
        }
    }>
    mapping: Record<string, any>; // daha detaylıysa ayrıca tanımlanabilir

    /** ADR-0004 Karar 1: delta tespiti + Trendyol "aynı gövde 15dk" kuralı için. MEVCUT platforms yapısına eklendi. */
    stockSync?: {
        lastPublishedQty?: number;
        lastPublishedAt?: Date;
        lastBatchId?: string;
        dirty?: boolean;
    };
}

export interface IVariantChoice {
    choiceId: string;
    choiceTitle: string;
    [key: string]: any; // ek alanlar varsa
}


