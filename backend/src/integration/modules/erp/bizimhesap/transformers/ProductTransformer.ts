import { ICategory, ICategoryAttribute, IBrand, IInternalResult } from '@interfaces/index';
import { integrationCode } from '../constants';
import { v4 as uuidv4 } from 'uuid';

export class ProductTransformer {
    private toUrlFriendly(text: string): string {
        return (text || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-zA-Z0-9ğüşöçıĞÜŞİÖÇ\s]/g, '')
            .trim()
            .replace(/\s+/g, '_');
    }

    private getImages(photoField: any): string[] {
        try {
            if (!photoField) return [];
            const parsed = JSON.parse(photoField);
            return parsed.map((p: any) => p.PhotoUrl || p.url || '').filter(Boolean);
        } catch {
            if (typeof photoField === 'string' && photoField.startsWith('http')) return [photoField];
            return [];
        }
    }

    private getVariantAttributes(variantName: string, variant: string): Record<string, string> {
        const names = (variantName || '').split(' -- ').map((v: string) => v.trim());
        const values = (variant || '').split(' -- ').map((v: string) => v.trim());
        const map: Record<string, string> = {};
        names.forEach((name, idx) => {
            if (name) map[name] = values[idx] || '';
        });
        return map;
    }

    public extractCatalog(platformProducts: any[]): { categories: ICategory[], brands: IBrand[], options: ICategoryAttribute[] } {
        const categoryMap = new Map<string, ICategory>();
        const brandMap = new Map<string, IBrand>();
        const variantMap = new Map<string, ICategoryAttribute>();

        for (const product of platformProducts) {
            if (product.category && !categoryMap.has(product.category)) {
                categoryMap.set(product.category, {
                    _id: String(product.category),
                    parentId: '0',
                    children: [],
                    level: 0,
                    title: String(product.category)
                });
            }

            if (product.brand && !brandMap.has(product.brand)) {
                brandMap.set(product.brand, {
                    id: String(product.brand),
                    title: String(product.brand)
                });
            }

            // [DÜZELTME, 2026-09-29, ADR-0016 B-R-T4 bulgusu] `.filter(Boolean)` boş segmentleri ATIP index'leri
            // KAYDIRIYORDU, ama `variantValues` filtrelenmiyordu -> isim/değer eşleşmesi yanlış kayabiliyordu.
            // AYNI dosyadaki `getVariantAttributes()`'ın DOĞRU deseni (filtrelemeden, index korunarak `if(name)`
            // koruması) buraya da uygulandı.
            const variantNames = (product.variantName || '').split(' -- ').map((v: string) => v.trim());
            const variantValues = (product.variant || '').split(' -- ').map((v: string) => v.trim());

            variantNames.forEach((name: string, index: number) => {
                if (!name) return;
                const value = variantValues[index] || '';
                if (!variantMap.has(name)) {
                    variantMap.set(name, {
                        _id: name,
                        title: name,
                        allowCustom: false,
                        required: false,
                        varianter: true,
                        slicer: false,
                        multiple: false,
                        values: []
                    });
                }
                const group = variantMap.get(name)!;
                if (!group.values) group.values = [];
                if (value && !group.values.some((v: any) => v.id === value)) {
                    group.values.push({ id: value, title: value });
                }
            });
        }

        return {
            categories: Array.from(categoryMap.values()).sort((a, b) => a._id.localeCompare(b._id)),
            brands: Array.from(brandMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
            options: Array.from(variantMap.values())
        };
    }

    public async convertProducts(
        platformProducts: any[],
        mappingProvider: any
    ): Promise<any[]> {
        const productMap = new Map<string, any>();

        for (const p of platformProducts) {
            const maincode = this.toUrlFriendly(p.title);
            if (!maincode) continue;

            if (!productMap.has(maincode)) {
                const [brandId, categoryId] = await Promise.all([
                    mappingProvider?.getLocalBrandId?.(p.brand) ?? p.brand,
                    mappingProvider?.getLocalCategoryId?.(p.category) ?? p.category
                ]);

                productMap.set(maincode, {
                    code: integrationCode,
                    maincode,
                    tempId: uuidv4(),
                    title: p.title,
                    description: p.description,
                    brand: brandId,
                    category: categoryId,
                    hasVariant: true,
                    images: [],
                    variants: []
                });
            }

            const product = productMap.get(maincode)!;
            const images = this.getImages(p.photo);
            product.images = Array.from(new Set([...product.images, ...images]));

            const variantAttrs = this.getVariantAttributes(p.variantName || '', p.variant || '');
            const salePrice = Number(p.price || 0);
            const tax = Number(p.tax || 0);

            product.variants.push({
                code: integrationCode,
                maincode,
                title: p.title,
                description: p.description,
                barcode: String(p.barcode || ''),
                stockcode: String(p.code || ''),
                stock: Number(p.quantity || 0),
                prices: {
                    isPlatformBasedPrice: false,
                    price: salePrice * (100 / (100 + tax)),
                    salePrice,
                    marketPrice: salePrice
                },
                images,
                choices: [],
                platforms: {
                    [integrationCode]: {
                        prices: { salePrice, marketPrice: salePrice },
                        infos: {},
                        upload: {},
                        mappings: { productId: String(p.id || '') },
                        attributes: variantAttrs,
                        mapping: {
                            id: p.id,
                            categoryId: p.category,
                            brandId: p.brand
                        }
                    }
                },
                taxPercentage: tax,
                onSale: p.isActive === 1 || p.isActive === true,
                tempId: uuidv4(),
                uniqueId: p.uniqueId || uuidv4()
            });
        }

        return Array.from(productMap.values());
    }

    public toInternalStatusResult(platformProducts: any[]): IInternalResult[] {
        return (platformProducts || []).map((p: any) => ({
            matchValue: String(p.barcode || ''),
            barcode: String(p.barcode || ''),
            status: (p.isActive === 1 || p.isActive === true) ? 'COMPLETED' : 'FAILED',
            messages: (p.isActive !== 1 && p.isActive !== true) ? ['Pasif'] : []
        }));
    }
}
