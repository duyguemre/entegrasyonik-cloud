/**
 * [eslesme-fiyat WP3, D-HB-1 / API_HEPSIBURADA K-3] HB ürün İÇE AKTARIM kaydı = katalog ürünü (mpop `all-products-of-merchant`: ad, barkod,
 * kategori, marka, görsel, öznitelikler) + listing (listing-external: fiyat, `availableStock`, `isSalable`, hbSku), anahtar `merchantSku`.
 * Eskiden yalnız listing okunuyor ve listing'de OLMAYAN `productName/barcode/categoryId/brand/images` bekleniyordu → ürünler adsız/kategorisiz
 * oluşuyordu; ayrıca Stager'a iç model veriliyordu. Şimdi Stager'a bu düz HAM kayıt gider (`getSummaryFromRaw/convertToInternalModel` okur).
 *
 * Katalog yanıt alanları resmi spec'ten (Spring zarfı; `productAttributes/variantTypeAttributes/baseAttributes`, `brand` string); gerçek
 * fikstür yerel canlı turda (03 §5) gelecek → okuma HOŞGÖRÜLÜ (birden çok olası ad). Bellekte yalnız aşağıdaki sıkıştırılmış alanlar tutulur.
 */
export interface HbCatalogCompact {
    merchantSku: string;
    hbSku?: string;
    barcode?: string;
    productName?: string;
    description?: string;
    categoryId?: string;
    brand?: string;
    variantGroupId?: string;
    images: string[];
    attributes: Record<string, string>;
    vatRate?: number;
}

const str = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : String(v));

/** `[{name|id|key, value}]` ya da düz nesne → `{ad: değer}`. */
function attrRecord(list: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(list)) {
        for (const a of list as any[]) {
            const k = str(a?.id ?? a?.name ?? a?.key ?? a?.attributeName);
            const v = str(a?.value ?? a?.values?.[0] ?? a?.attributeValue);
            if (k && v) out[k] = v;
        }
    } else if (list && typeof list === 'object') {
        for (const [k, v] of Object.entries(list as Record<string, unknown>)) { const s = str(v); if (s) out[k] = s; }
    }
    return out;
}

export function compactCatalogProduct(raw: any): HbCatalogCompact | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const base = attrRecord(raw.baseAttributes);
    const merchantSku = str(raw.merchantSku ?? raw.merchantSKU ?? raw.sku ?? base.merchantSku);
    if (!merchantSku) return undefined;
    const imgs: string[] = [];
    for (const i of Array.isArray(raw.images) ? raw.images : []) { const u = typeof i === 'string' ? i : str(i?.url ?? i?.link); if (u) imgs.push(u); }
    if (!imgs.length) for (let n = 1; n <= 10; n++) { const u = base[`Image${n}`]; if (u) imgs.push(u); }
    const vat = Number(raw.vatRate ?? raw.tax ?? base.tax_vat_rate);
    return {
        merchantSku,
        hbSku: str(raw.hbSku ?? raw.hbSKU),
        barcode: str(raw.barcode ?? base.Barcode),
        productName: str(raw.productName ?? raw.name ?? base.UrunAdi),
        description: str(raw.description ?? base.UrunAciklamasi),
        categoryId: str(raw.categoryId ?? raw.category?.id),
        brand: str(raw.brand ?? base.Marka),
        variantGroupId: str(raw.variantGroupId ?? base.VaryantGroupID),
        images: imgs,
        attributes: { ...attrRecord(raw.productAttributes), ...attrRecord(raw.variantTypeAttributes) },
        vatRate: Number.isFinite(vat) ? vat : undefined,
    };
}

/**
 * Listing kaydı + (varsa) katalog → Stager'a giden düz ham kayıt. Alan adları mevcut `ProductMapper.toInternalVariant`'ın okuduğu
 * biçimdedir (productName, barcode, categoryId, brand, images, attributes, stockCount, status, price, listPrice, vatRate).
 */
export function toImportRecord(listing: any, catalog?: HbCatalogCompact): Record<string, any> {
    const price = Number(listing?.price ?? listing?.pricings?.[0]?.price);
    const stock = Number(listing?.availableStock ?? listing?.stockCount ?? listing?.stock);
    const salable = listing?.isSalable ?? (listing?.status ? listing.status === 'Active' : undefined);
    return {
        hbSku: str(listing?.hbSku) ?? catalog?.hbSku,
        merchantSku: str(listing?.merchantSku) ?? catalog?.merchantSku,
        barcode: catalog?.barcode ?? str(listing?.barcode),
        productName: catalog?.productName ?? str(listing?.productName),
        description: catalog?.description,
        categoryId: catalog?.categoryId ?? str(listing?.categoryId),
        brand: catalog?.brand ?? str(listing?.brand),
        variantGroupId: catalog?.variantGroupId,
        images: catalog?.images?.length ? catalog.images : (Array.isArray(listing?.images) ? listing.images : []),
        attributes: catalog?.attributes ?? listing?.attributes ?? {},
        vatRate: catalog?.vatRate ?? listing?.vatRate,
        price: Number.isFinite(price) ? price : 0,
        listPrice: listing?.listPrice,
        stockCount: Number.isFinite(stock) ? stock : 0,
        status: salable === undefined ? listing?.status : (salable ? 'Active' : 'Passive'),
        catalogMatched: !!catalog,
    };
}
