import { IVariant, IInternalResult, ICategoryAttribute } from '@interfaces/index';
import { integrationCode } from '../constants';

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

        const salePrice = (variant as any).platforms?.[integrationCode]?.prices?.salePrice
            || (variant as any).prices?.salePrice || 0;
        const formattedPrice = Math.round(Number(salePrice) * 100) / 100;

        const variantAttrs = (variant as any).platforms?.[integrationCode]?.attributes || {};
        const optionGroups = Object.entries(variantAttrs)
            .filter(([, valueId]) => !!valueId)
            .map(([attrId, valueId]) => ({
                id: attrId,
                options: [{ id: valueId }]
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

    public toInternalVariant(platformProduct: any, parentProduct: any): Partial<IVariant> {
        const salePrice = platformProduct.prices?.[0]?.value || platformProduct.price1 || 0;
        return {
            code: integrationCode,
            maincode: `${integrationCode}_${parentProduct?.id}`,
            title: parentProduct?.name || platformProduct.name,
            barcode: platformProduct.barcode,
            stockcode: platformProduct.sku,
            stock: Number(platformProduct.stockAmount || 0),
            prices: {
                isPlatformBasedPrice: false,
                price: salePrice * (100 / (100 + (platformProduct.tax || 0))),
                salePrice,
                marketPrice: salePrice
            },
            images: [],
            platforms: {
                [integrationCode]: {
                    prices: { salePrice, marketPrice: salePrice },
                    infos: {},
                    upload: {},
                    mappings: { productId: platformProduct.id },
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
