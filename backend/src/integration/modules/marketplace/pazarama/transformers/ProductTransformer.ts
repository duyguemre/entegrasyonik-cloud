import { ICategoryAttribute, IExportStagedProduct, IInternalAddress, IVariant, PLATFORM_PROCESS } from '@interfaces/index';
import { integrationCode } from '../constants';
import { randomUUID } from 'crypto';
import { IInternalResult } from '@interfaces/index';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { normalizeAttrValue, missingRequiredAttributes, labelAttribute } from '@integration/catalog/attributePayload';

export class ProductMapper {
    public validate(variant: IVariant, mode: PLATFORM_PROCESS) {
        if (mode === PLATFORM_PROCESS.TRANSFER) {
            const status = variant.platforms?.[integrationCode]?.upload?.TRANSFER?.status;
            if (['SENT', 'WAITING', 'COMPLETED'].includes(status)) return { result: false, reason: "Ürün zaten gönderilmiş." };
        }

        if (!variant.barcode || String(variant.barcode).trim() === "") {
            return { result: false, reason: "Barkod eksik." };
        }

        if (mode !== PLATFORM_PROCESS.UPDATE_STOCK) {
            const vPrice = variant.platforms[integrationCode]?.prices || variant.prices;
            const sale = vPrice.salePrice;
            const market = vPrice.marketPrice || sale;

            if (!sale || sale <= 0) return { result: false, reason: "Fiyat geçersiz." };
            if (market && sale > market) return { result: false, reason: "Satış > Liste fiyatı hatası." };
        }

        if ((mode === PLATFORM_PROCESS.TRANSFER || mode === PLATFORM_PROCESS.UPDATE_STOCK) && (variant.stock === undefined || variant.stock < 0)) {
            return { result: false, reason: "Stok geçersiz." };
        }

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
        const salePrice = Math.round((vPrice.salePrice || 0) * 100) / 100;
        const marketPrice = Math.max(Math.round((vPrice.marketPrice || salePrice) * 100) / 100, salePrice);
        const vMapping = variant.platforms[integrationCode]?.mapping;

        const item: any = {
            barcode: String(variant.barcode)
        };

        if (mode === PLATFORM_PROCESS.TRANSFER || mode === PLATFORM_PROCESS.UPDATE) {
            item.name = vMapping?.title || variant.product?.title;
            item.displayName = item.name;
            item.description = vMapping?.description || variant.product?.description || "";
            item.code = String(variant.barcode);
            item.groupCode = variant.maincode || variant.product?.maincode;
            item.stockCode = variant.stockcode;
            item.brandId = String(mapping.brandId);
            item.categoryId = String(mapping.catId);
            item.stockCount = Number(variant.stock);
            item.salePrice = salePrice;
            item.listPrice = marketPrice;
            item.vatRate = Number(vMapping?.taxPercentage || variant.product?.taxPercentage || mapping.settings?.taxPercentage || 20);
            item.images = variant.images.map((img: any) => ({ imageurl: typeof img === 'string' ? img : img.url }));
            item.attributes = this.prepareAttributes(variant, catAttrs, mapping);
            item.desi = 1;
            item.currencyType = "TRY";
        } else if (mode === PLATFORM_PROCESS.UPDATE_PRICE) {
            // [eslesme-fiyat WP4, 02-ekler/pazarama C-3 / D-PZ-3] fiyat ve stok gövdeleri AYRI (eskiden ikisi de fiyat+stok
            // taşıyıp fiyat ucuna gidiyordu: stok-yalnız güncelleme fiyatı da yazıyordu). Fiyat: `{code, listPrice, salePrice}`.
            delete item.barcode;
            item.code = String(variant.barcode);
            item.listPrice = marketPrice;
            item.salePrice = salePrice;
        } else if (mode === PLATFORM_PROCESS.UPDATE_STOCK) {
            // [D-PZ-3] Stok: `product/updateStock {items:[{code, stockCount}]}` (5 bağımsız kaynak).
            delete item.barcode;
            item.code = String(variant.barcode);
            item.stockCount = Number(variant.stock);
        }

        return item;
    }

    public toInternalVariant(p: any, choicesResult: any): IVariant {
        const vat = p.vatRate || 0;
        return {
            code: integrationCode,
            maincode: p.productMainId || p.groupCode,
            title: p.title || p.productName,
            description: p.description,
            barcode: p.barcode,
            stockcode: p.stockCode || p.code,
            stock: p.quantity || p.stockCount || 0,
            prices: {
                isPlatformBasedPrice: false,
                price: (p.salePrice || 0) * (100 / (100 + vat)),
                salePrice: p.salePrice || 0, // COM-10: ic fiyat = pazaryeri brut satis fiyati; komisyon dusulmez (net fiyat COM-07 modeliyle okuma aninda)
                marketPrice: p.listPrice || p.salePrice,
            },
            images: p.images?.map((img: any) => typeof img === 'string' ? img : img.url) || [],
            choices: choicesResult.choices,
            platforms: {
                [integrationCode]: {
                    prices: { salePrice: p.salePrice, marketPrice: p.listPrice },
                    upload: {
                        TRANSFER: {
                            status: 'COMPLETED',
                            messages: ['Ürün çekimi tamamlandı.'],
                            updatedAt: new Date()
                        }
                    },
                    attributes: this.getRawAttributesMap(p.attributes),
                    mapping: {
                        id: p.id || p.productId,
                        categoryId: p.categoryId,
                        brandId: p.brandId
                    },
                }
            },
            taxPercentage: vat,
            // [DÜZELTME, 2026-09-29, ADR-0016 B-R-T4 bulgusu] `|| true` ölü sabitti — `p.onSale`/`p.active` AÇIKÇA
            // false verilse bile ifade `||` zincirinde her zaman truthy sonuçlanıyordu (`onSale` ASLA false
            // olamıyordu). `??` (nullish coalescing) ile explicit false artık korunuyor; yalnız null/undefined'da
            // (veri hiç yoksa) varsayılan `true`'ya düşülür — muhtemel orijinal niyet buydu.
            onSale: p.onSale ?? p.active ?? true,
            tempId: randomUUID(),
            uniqueId: p.uniqueId || randomUUID(),
            choiceId: choicesResult.slicer?.choiceId || '-',
            choiceValueId: choicesResult.slicer?.choiceValueId || '-',
            choiceValueTitle: choicesResult.slicer?.choiceValueTitle || '-'
        } as IVariant;
    }

    public toInternalBatchResult(data: any, type: string): IInternalResult[] {
        const results: IInternalResult[] = [];

        // Handle failed products
        if (Array.isArray(data.failedProducts)) {
            data.failedProducts.forEach((fp: any) => {
                results.push({
                    matchValue: fp.productCode,
                    barcode: fp.barcode || fp.productCode,
                    status: 'FAILED',
                    messages: [fp.errorReason]
                });
            });
        }

        // Handle successful products in batchResult (if any)
        if (Array.isArray(data.batchResult)) {
            data.batchResult.forEach((br: any) => {
                // If it's already in results as FAILED, don't add as SUCCESS
                if (results.some(r => r.matchValue === br.productCode)) return;

                if (br.status === 'SUCCESS' || br.isSuccess) {
                    results.push({
                        matchValue: br.productCode,
                        barcode: br.barcode || br.productCode,
                        status: (type === 'TRANSFER' || type === 'UPDATE') ? 'WAITING' : 'COMPLETED',
                        messages: []
                    });
                }
            });
        }

        return results;
    }

    public toInternalStatusResult(content: any[]): IInternalResult[] {
        return content.map((p: any) => {
            const state = Number(p.state);
            let status: 'COMPLETED' | 'WAITING' | 'FAILED' = 'WAITING';

            if (state === 3) {
                status = 'COMPLETED';
            } else if (state === 6) {
                status = 'FAILED';
            } else if ([1, 2, 7].includes(state)) {
                status = 'WAITING';
            }

            return {
                matchValue: p.barcode || p.code,
                barcode: p.barcode || p.code,
                mapping: {
                    id: p.id || p.productId || p.code,
                    categoryId: p.categoryId,
                    brandId: p.brandId
                },
                status: status,
                messages: p.waitingApproveExp ? [p.waitingApproveExp] : (p.stateDescription ? [p.stateDescription] : [])
            };
        });
    }

    /**
     * [WP9] Özellik yükü. Pazarama sözleşmesi resmi kaynaktan DOĞRULANAMADI (API_CONTRACTS §4): mevcut alan biçimi
     * (`attributeId`, `attributeValueId`, `customAttributeValue`) KORUNUR; değişen yalnızca güvenlik: boş/'undefined' değerli
     * kayıt gönderilmez, kimlik/metin dizeye çevrilir, kategoride ZORUNLU olup eksik özellik yayın öncesi alan bazlı VALIDATION olur.
     */
    private prepareAttributes(variant: any, catAttrs: any[], mapping?: any) {
        const vAttrs: Record<string, any> = variant.platforms?.[integrationCode]?.attributes || {};
        const out: any[] = [];
        const sent = new Set<string>();
        for (const [attrId, attrData] of Object.entries(vAttrs)) {
            const norm = normalizeAttrValue(attrData);
            if (!norm) continue;
            const isObj = attrData !== null && typeof attrData === 'object';
            const item: any = { attributeId: attrId };
            // Nesne biçiminde kimlik/metin ayrı taşınır; ilkel (eski) biçimde tek değer hem kimlik hem metin adayıdır.
            if (norm.valueId !== undefined && isObj) item.attributeValueId = norm.valueId;
            if (norm.text !== undefined && isObj) item.customAttributeValue = norm.text;
            if (!isObj) { item.attributeValueId = norm.valueId; item.customAttributeValue = norm.text; }
            out.push(item);
            sent.add(String(attrId));
        }
        const missing = missingRequiredAttributes(catAttrs, sent);
        if (missing.length > 0) {
            throw new IntegrationError('VALIDATION',
                `Pazarama ürün doğrulaması başarısız (barkod ${String(variant.barcode ?? '?').slice(0, 40)}): zorunlu özellik eksik: ${missing.map(c => labelAttribute(String(c._id), c.title)).join(', ')}.`,
                { integrationCode, operation: 'prepareAttributes', clientId: mapping?.clientId ?? 'unknown' });
        }
        return out;
    }

    private getRawAttributesMap(attrs: any[]) {
        const map: any = {};
        attrs?.forEach(a => map[String(a.attributeId)] = {
            attributeName: a.attributeName || a.name,
            attributeValue: a.attributeValue || a.value,
            attributeValueId: String(a.attributeValueId || a.valueId)
        });
        return map;
    }
}
