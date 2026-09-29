import { ICategoryAttribute, IExportStagedProduct, IInternalAddress, IVariant, PLATFORM_PROCESS } from '@interfaces/index';
import { integrationCode } from '../constants';
import { randomUUID } from 'crypto';
import { IInternalResult } from '@interfaces/index';

export class ProductMapper {
    public validate(variant: IVariant, mode: PLATFORM_PROCESS) {
        if (mode === PLATFORM_PROCESS.TRANSFER) {
            const status = variant.platforms?.[integrationCode]?.upload?.TRANSFER?.status;
            if (['SENT', 'WAITING', 'COMPLETED'].includes(status)) return { result: false, reason: "Ürün zaten gönderilmiş." };
        }

        if (!variant.barcode || String(variant.barcode).trim() === "") {
            return { result: false, reason: "Barkod eksik." };
        }

        const vPrice = variant.platforms[integrationCode]?.prices || variant.prices;
        const sale = vPrice.salePrice;

        if (!sale || sale <= 0) return { result: false, reason: "Fiyat geçersiz." };

        return { result: true, reason: "" };
    }

    public toPlatformBatch(
        stagedProduct: IExportStagedProduct,
        mode: PLATFORM_PROCESS,
        catAttrs: ICategoryAttribute[],
        addresses: IInternalAddress[],
        mapping: { catId: any, brandId: any, settings: any }
    ) {
        const variant = stagedProduct.payload;
        if (!variant) return null;

        const vPrice = variant.platforms[integrationCode]?.prices || variant.prices;
        const salePrice = vPrice.salePrice || 0;
        
        // Hepsiburada expects price as string with comma
        const formattedPrice = (Math.round(salePrice * 100) / 100).toFixed(2).replace('.', ',');
        
        const vMapping = variant.platforms[integrationCode]?.mapping;

        // Prepare Images
        const variantImages: Record<string, any> = {};
        variant.images.forEach((img: any, index: number) => {
            variantImages[`Image${index + 1}`] = typeof img === 'string' ? img : img.url;
        });

        // Prepare Additional Attributes
        const vAttrs: Record<string, any> = variant.platforms?.[integrationCode]?.attributes || {};
        const attributes: Record<string, any> = {};
        Object.entries(vAttrs).forEach(([attrId, attrData]) => {
            if (attrData) {
                // If it's an object with id/title, take the title or id as per old code's logic
                attributes[attrId] = attrData.attributeValueId || attrData.id || attrData;
            }
        });

        const taxPercentage = Number(vMapping?.taxPercentage || variant.product?.taxPercentage || mapping.settings?.taxPercentage || 20);
        const desi = String(vMapping?.desi || variant.product?.desi || 1);
        const warranty = Number(vMapping?.warranty || variant.product?.warranty || 24);

        // Hepsiburada Product Import Model (Old structure)
        const item: any = {
            categoryId: Number(mapping.catId),
            merchant: mapping.settings?.APIKEY || mapping.settings?.USERNAME || "",
            attributes: {
                merchantSku: variant.stockcode || String(variant.barcode),
                VaryantGroupID: variant.maincode || variant.stockcode,
                Barcode: String(variant.barcode),
                UrunAdi: vMapping?.title || variant.product?.title || "",
                UrunAciklamasi: vMapping?.description || variant.product?.description || "",
                Marka: String(mapping.brandId), // This should be the brand title
                GarantiSuresi: warranty,
                kg: desi,
                tax_vat_rate: String(taxPercentage),
                price: formattedPrice,
                stock: String(variant.stock),
                ...variantImages,
                ...attributes
            }
        };

        return item;
    }

    public toInternalVariant(p: any, choicesResult: any, commission: number): IVariant {
        const vat = p.vatRate || 0;
        const salePrice = p.price || 0;
        return {
            code: integrationCode,
            maincode: p.merchantSku || p.barcode,
            title: p.productName || p.name,
            description: p.description,
            barcode: p.barcode,
            stockcode: p.merchantSku,
            stock: p.stockCount || 0,
            prices: {
                isPlatformBasedPrice: false,
                price: salePrice * (100 / (100 + vat)),
                salePrice: salePrice * (100 / (100 + commission)),
                marketPrice: p.listPrice || salePrice,
            },
            images: p.images || [],
            choices: choicesResult.choices,
            platforms: {
                [integrationCode]: {
                    prices: { salePrice, marketPrice: p.listPrice || salePrice },
                    upload: {
                        TRANSFER: {
                            status: 'COMPLETED',
                            messages: ['Ürün çekimi tamamlandı.'],
                            updatedAt: new Date()
                        }
                    },
                    attributes: p.attributes || {},
                    mapping: {
                        id: p.hbSku || p.barcode,
                        categoryId: p.categoryId,
                        brandId: p.brand
                    },
                }
            },
            taxPercentage: vat,
            onSale: p.status === 'Active',
            tempId: randomUUID(),
            uniqueId: p.hbSku || randomUUID(),
            choiceId: choicesResult.slicer?.choiceId || '-',
            choiceValueId: choicesResult.slicer?.choiceValueId || '-',
            choiceValueTitle: choicesResult.slicer?.choiceValueTitle || '-'
        } as IVariant;
    }

    public toInternalBatchResult(data: any): IInternalResult[] {
        if (!data) return [];

        // Status still processing — no results yet
        if (data.status === 'Processing') return [];

        // Completed with stored items (mock approval flow)
        if (data.status === 'Completed') {
            const items: any[] = Array.isArray(data.items) ? data.items : [];
            if (items.length > 0) {
                return items.map((item: any) => {
                    const attrs = item.attributes || {};
                    const matchValue = attrs.Barcode || attrs.merchantSku || '';
                    return {
                        matchValue: matchValue,
                        barcode: attrs.Barcode,
                        status: 'COMPLETED',
                        messages: ['Ürün başarıyla aktarıldı.']
                    } as IInternalResult;
                });
            }
        }

        // Product-level results from HB status endpoint
        const productItems: any[] = Array.isArray(data.data) ? data.data : [];
        if (productItems.length > 0) {
            return productItems.map((item: any) => {
                const isFailed = item.productStatus === 'REJECTED' || item.productStatus === 'MISSING_INFO';
                const isSuccess = item.productStatus === 'Satışa Hazır' || item.productStatus === 'MATCHED';
                
                const messages = [
                    ...(item.validationResults || []).map((v: any) => v.message).filter(Boolean),
                    ...(item.taskDetails?.reason ? [item.taskDetails.reason] : [])
                ];
                if (messages.length === 0 && item.statusDescription) messages.push(item.statusDescription);
                if (messages.length === 0) messages.push('Statü: ' + item.productStatus);
                
                return {
                    matchValue: item.barcode || item.merchantSku || '',
                    barcode: item.barcode,
                    status: isFailed ? 'FAILED' : (isSuccess ? 'COMPLETED' : 'WAITING'),
                    messages
                } as IInternalResult;
            });
        }

        // Legacy errors array format
        const errors: any[] = Array.isArray(data.errors) ? data.errors : [];
        return errors.map((err: any) => ({
            barcode: err.sku || '',
            status: 'FAILED',
            messages: [err.message]
        } as IInternalResult));
    }
}
