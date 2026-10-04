import { IVariant, IInternalResult, ICategoryAttribute } from '@interfaces/index';
import { integrationCode } from '../constants';
import { normalizeAttrValue } from '@integration/catalog/attributePayload';
import { channelPricePair } from '@platform/core/pricing/effectivePrice';

export class ProductTransformer {
    private slugify(text: string): string {
        return (text || '')
            .toLowerCase()
            .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
            .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    public buildIdeasoftProduct(product: any, settings: any): any {
        const taxPct = Number(product.taxPercentage || settings.taxPercentage || 18);
        const desi = Number(product.desi || settings.desi || 1);
        const warranty = Number(product.warranty || settings.warranty || 0);
        const stockTypeLabel = product.stockTypeLabel || settings.stockTypeLabel || 'Piece';

        return {
            name: product.title,
            fullname: product.title,
            slug: this.slugify(product.title),
            sku: product.maincode,
            barcode: product.maincode,
            detail: { details: product.description || '' },
            stockAmount: product.totalStock || 0,
            price1: product.minPrice || 0,
            currency: { id: 3 },
            taxIncluded: 1,
            tax: taxPct,
            warranty,
            volumetricWeight: desi,
            stockTypeLabel,
            customShippingDisabled: 1,
            hasOption: 1,
            hasGift: 0,
            status: 1,
            categoryShowcaseStatus: 0,
            brand: { id: Number(product.platformBrandId) },
            categories: [{ id: Number(product.platformCategoryId) }],
            images: product.images || []
        };
    }

    public buildIdeasoftVariant(
        variant: IVariant,
        product: any,
        platformBrandId: any,
        platformCategoryId: any,
        categoryAttributes: ICategoryAttribute[],
        settings: any
    ): any {
        const taxPct = Number((variant as any).taxPercentage || product.taxPercentage || settings.taxPercentage || 18);
        const desi = Number((variant as any).desi || product.desi || settings.desi || 1);
        const warranty = Number((variant as any).warranty || product.warranty || settings.warranty || 0);
        const stockTypeLabel = (variant as any).stockTypeLabel || settings.stockTypeLabel || 'Piece';

        const salePrice = channelPricePair(variant, integrationCode).salePrice || 0;
        const formattedPrice = Math.round(Number(salePrice) * 100) / 100;

        const variantAttrs = (variant as any).platforms?.[integrationCode]?.attributes || {};
        // [WP9] FE değeri nesne ({attributeValueId,...}) olarak kaydeder; eskiden nesnenin KENDİSİ `options[].id` olarak gidiyordu.
        // Seçenek kimliği zorunludur: kimliği olmayan (yalnız metin) kayıt gönderilmez. İlkel (eski) biçim aynen desteklenir.
        const optionGroups = Object.entries(variantAttrs)
            .map(([attrId, raw]) => ({ attrId, optionId: normalizeAttrValue(raw)?.valueId }))
            .filter((e) => e.optionId !== undefined)
            .map((e) => ({
                id: e.attrId,
                options: [{ id: e.optionId }]
            }));

        return {
            name: (variant as any).title || product.title,
            fullname: product.title,
            slug: this.slugify((variant as any).title || product.title),
            sku: (variant as any).stockcode,
            barcode: (variant as any).barcode,
            detail: { details: '' },
            stockAmount: Number((variant as any).stock || 0),
            price1: formattedPrice,
            currency: { id: 3 },
            taxIncluded: 1,
            tax: taxPct,
            warranty,
            volumetricWeight: desi,
            stockTypeLabel,
            customShippingDisabled: 1,
            hasOption: 0,
            hasGift: 0,
            status: 1,
            categoryShowcaseStatus: 0,
            brand: { id: Number(platformBrandId) },
            categories: [{ id: Number(platformCategoryId) }],
            optionGroups,
            images: []
        };
    }

    /**
     * [eslesme-fiyat WP4, API_IDEASOFT K-8 / D-IS-2] Ana ürün kodu: üst ürün (`parent.id`) varsa onun kimliği, YOKSA ürünün KENDİ kimliği.
     * Eskiden parent'sız (basit) ürünlerin hepsi `ideasoft_undefined` tek ana ürününe çöküyordu (veri kaybı).
     */
    public mainCodeOf(platformProduct: any, parentProduct?: any): string {
        const id = parentProduct?.id ?? platformProduct?.parent?.id ?? platformProduct?.id;
        return `${integrationCode}_${id}`;
    }

    /**
     * [D-IS-3] Fiyat: `price1` + `taxIncluded` (0 → KDV hariç; iç model brüt satış fiyatı tutar → KDV eklenir) + `discount`/`discountType`
     * (indirim varsa `marketPrice` = indirimsiz, `salePrice` = indirimli). `discountType` 1 = yüzde, diğer = tutar varsayımı (kaynak
     * şemada değer listesi yok; canlı örnekle doğrulanacak). `prices[0].value` eski yol olarak korunur.
     */
    public pricesOf(p: any): { salePrice: number; marketPrice: number; tax: number } {
        const tax = Number(p?.tax) || 0;
        let base = Number(p?.prices?.[0]?.value ?? p?.price1 ?? 0) || 0;
        if (p?.taxIncluded !== undefined && p?.taxIncluded !== null && Number(p.taxIncluded) === 0) base = base * (1 + tax / 100);
        const discount = Number(p?.discount) || 0;
        let sale = base;
        if (discount > 0) sale = Number(p?.discountType) === 1 ? base * (1 - discount / 100) : base - discount * (Number(p?.taxIncluded) === 0 ? 1 + tax / 100 : 1);
        const r = (n: number) => Math.round(Math.max(n, 0) * 100) / 100;
        return { salePrice: r(sale), marketPrice: r(Math.max(base, sale)), tax };
    }

    public toInternalVariant(platformProduct: any, parentProduct: any): Partial<IVariant> {
        const { salePrice, marketPrice, tax } = this.pricesOf(platformProduct);
        const images = (platformProduct.images || [])
            .map((img: any) => (typeof img === 'string' ? img : img?.originalUrl || img?.url))
            .filter((u: any) => typeof u === 'string' && u !== '');
        return {
            code: integrationCode,
            maincode: this.mainCodeOf(platformProduct, parentProduct),
            title: parentProduct?.name || platformProduct.name,
            barcode: platformProduct.barcode,
            stockcode: platformProduct.sku,
            stock: Number(platformProduct.stockAmount || 0),
            prices: {
                isPlatformBasedPrice: false,
                price: salePrice * (100 / (100 + tax)),
                salePrice,
                marketPrice
            },
            images,
            platforms: {
                [integrationCode]: {
                    prices: { salePrice, marketPrice },
                    infos: {},
                    upload: {},
                    mapping: { productId: platformProduct.id },
                    attributes: {}
                }
            },
            onSale: platformProduct.status === 1,
        } as any;
    }

    public toInternalStatusResult(platformProducts: any[]): IInternalResult[] {
        return (platformProducts || []).map((p: any) => ({
            matchValue: p.barcode,
            barcode: p.barcode,
            status: (p.status === 1 && p.stockAmount > 0) ? 'COMPLETED' : 'FAILED',
            messages: p.status !== 1 ? ['Pasif'] : (p.stockAmount === 0 ? ['Stok sıfır'] : [])
        }));
    }
}
