import { IMessage, ICategoryAttribute, ICategoryAttributeValue, IFinancialTransaction, UniversalTransactionType } from '@interfaces/index';

export class ProductMapper {
    public mapToCreateProduct(sp: any) {
        return {
            product: {
                productSellerCode: sp.stockcode || sp.productId,
                title: sp.title || '',
                description: sp.payload?.description || sp.title || '',
                category: { id: sp.category?.id || 0 },
                price: sp.price?.toString() || '0',
                currencyType: '1', // TRY
                shipmentTemplate: 'Default',
                preparingDay: '3',
                stockItems: {
                    stockItem: {
                        quantity: sp.stock?.toString() || '0',
                        sellerStockCode: sp.barcode,
                        gtin: sp.barcode
                    }
                }
            }
        };
    }

    public mapToRestBulkCreate(stagedProducts: any[], integrator: string) {
        return {
            payload: {
                integrator,
                skus: stagedProducts.map(sp => ({
                    title: sp.title || '',
                    description: sp.payload?.description || sp.title || '',
                    categoryId: parseInt(sp.category?.id || '0'),
                    stockCode: sp.stockcode || sp.productId, // Use stockcode if available
                    barcode: sp.barcode,
                    quantity: parseInt(sp.stock?.toString() || '0'),
                    salePrice: parseFloat(sp.price?.toString() || '0'),
                    listPrice: parseFloat(sp.price?.toString() || '0'),
                    currencyType: 'TL',
                    images: (sp.images || []).map((img: string, idx: number) => ({ url: img, order: idx }))
                }))
            }
        };
    }

    public mapToRestBulkUpdate(stagedProducts: any[], integrator: string) {
        return {
            payload: {
                integrator,
                skus: stagedProducts.map(sp => ({
                    stockCode: sp.stockcode || sp.productId, // Use stockcode if available
                    barcode: sp.barcode,
                    quantity: sp.stock !== undefined ? parseInt(sp.stock.toString()) : undefined,
                    salePrice: sp.price !== undefined ? parseFloat(sp.price.toString()) : undefined,
                    listPrice: sp.price !== undefined ? parseFloat(sp.price.toString()) : undefined
                }))
            }
        };
    }

    public mapToUpdatePrice(sp: any) {
        return {
            productSellerCode: sp.stockcode || sp.productId,
            stockItems: {
                stockItem: {
                    sellerStockCode: sp.barcode,
                    optionPrice: sp.price?.toString() || '0'
                }
            }
        };
    }

    public mapToUpdateStock(sp: any) {
        return {
            productSellerCode: sp.stockcode || sp.productId,
            stockItems: {
                stockItem: {
                    sellerStockCode: sp.barcode,
                    quantity: sp.stock?.toString() || '0'
                }
            }
        };
    }
}

export class CategoryMapper {
    public toInternalCategories(inputList: any[]): any[] {
        if (!Array.isArray(inputList)) return [];

        // 1. ADIM: Düzleştirme (Propagating parentId and level)
        const flatList: any[] = [];
        const flatten = (items: any[], pId: string = "0", depth: number = 0) => {
            items.forEach(item => {
                const currentId = String(item._id || item.id || "");
                // Eğer item'ın kendi parentId'si geçerliyse onu kullan, yoksa hiyerarşiden geleni kullan
                const currentParentId = (item.parentId !== undefined && item.parentId !== null) 
                    ? String(item.parentId) 
                    : pId;

                const normalizedItem = {
                    ...item,
                    _id: currentId,
                    parentId: currentParentId,
                    level: depth
                };

                flatList.push(normalizedItem);
                if (item.subCategories && Array.isArray(item.subCategories)) {
                    flatten(item.subCategories, currentId, depth + 1);
                }
            });
        };
        flatten(inputList);

        const map = new Map<string, any>();
        const roots: any[] = [];

        // 2. ADIM: Map oluşturma
        flatList.forEach(item => {
            const node = {
                ...item,
                _id: item._id,
                parentId: item.parentId,
                title: item.title || item.name,
                level: item.level,
                children: []
            };

            delete (node as any).id;
            delete (node as any).name;
            delete (node as any).subCategories;

            map.set(node._id, node);
        });

        // 3. ADIM: Hiyerarşiyi Kur
        map.forEach(node => {
            const parentId = node.parentId;
            if (parentId !== "0" && map.has(parentId)) {
                map.get(parentId).children.push(node);
            } else {
                roots.push(node);
            }
        });

        // 4. ADIM: Temizlik
        this.cleanupEmptyChildren(roots);

        return roots;
    }

    private cleanupEmptyChildren(nodes: any[]): void {
        nodes.forEach(node => {
            if (node.children && node.children.length === 0) {
                delete node.children;
            } else if (node.children) {
                this.cleanupEmptyChildren(node.children);
            }
        });
    }

    // REST GET /cdn/category/{categoryId}/attribute → { categoryAttributes: [...] }
    public toInternalAttributes(rawResponse: any): ICategoryAttribute[] {
        // 1. Durum: REST formatı (categoryAttributes veya attributes dizisi)
        const restAttributes = rawResponse.categoryAttributes || rawResponse.attributes || (Array.isArray(rawResponse) ? rawResponse : null);
        
        if (restAttributes && Array.isArray(restAttributes)) {
            return restAttributes.map((a: any) => ({
                _id: String(a.attributeId || a.id || ""),
                title: String(a.attributeName || a.name || a.title || "Özellik"),
                required: a.isMandatory === true || a.mandatory === true || a.mandatory === 'true' || !!a.required,
                allowCustom: a.isCustomValue === true || !!a.allowCustom || !!a.customValue,
                varianter: a.isVariant === true || !!a.variant,
                slicer: a.isSlicer === true || !!a.slicer,
                multiple: !!a.isMultipleSelection || false, // N11 REST'te nadiren gelir ama varsa alalım
                values: (a.attributeValues || a.values || []).map((v: any) => ({
                    id: String(v.id || v.valueId || ""),
                    title: String(v.value || v.name || v.title || "")
                })).sort((x: any, y: any) => (x.title || "").localeCompare(y.title || ""))
            })).sort((x: any, y: any) => (x.title || "").localeCompare(y.title || ""));
        }

        // 2. Durum: SOAP formatı fallback
        const soapAttributes = rawResponse.category?.attributeList?.attribute || rawResponse.attributeList?.attribute || [];
        const attrArray = Array.isArray(soapAttributes) ? soapAttributes : [soapAttributes];
        
        return attrArray.map((a: any) => ({
            _id: String(a.id || a.attributeId || ""),
            title: String(a.name || a.attributeName || a.title || "Özellik"),
            required: a.mandatory === 'true' || a.mandatory === true || !!a.isMandatory,
            allowCustom: a.isCustomValue === true || !!a.allowCustom || !!a.customValue,
            varianter: a.isVariant === true || !!a.variant,
            slicer: a.isSlicer === true || !!a.slicer,
            multiple: !!a.multipleSelection || false,
            values: (a.valueList?.value || []).map((v: any) => ({
                id: String(v.id || ""),
                title: String(v.name || v.value || "")
            }))
        }));
    }

    public toInternalAttributeValues(rawResponse: any): ICategoryAttributeValue[] {
        const values = rawResponse.category?.attributeList?.attribute?.valueList?.value || rawResponse.attributeValues || rawResponse.values || [];
        const valuesArray = Array.isArray(values) ? values : [values];
        return valuesArray.map((v: any) => ({
            id: String(v.id || v.valueId || ""),
            title: String(v.value || v.name || v.title || "")
        }));
    }
}

export class MessageMapper {
    public toInternalMessages(rawResponse: any): IMessage[] {
        const questions = rawResponse.productQuestions?.productQuestion || [];
        const questionsArray = Array.isArray(questions) ? questions : [questions];

        return questionsArray.map((q: any) => ({
            integrationCode: 'n11',
            externalMessageId: q.id,
            externalUserName: q.buyerEmail || 'Bilinmeyen Müşteri',
            text: q.question,
            answer: q.answer || '',
            type: 'PRODUCT_QUESTION',
            status: q.answer ? 'ANSWERED' : 'UNREAD',
            direction: 'INBOUND',
            date: new Date(),
            context: {
                productMainId: q.productId,
                productName: q.productTitle
            }
        }));
    }
}

export class FinancialMapper {
    public toInternalTransactions(rawResponse: any): IFinancialTransaction[] {
        const settlements = rawResponse.settlementListData?.settlementList || [];
        const settlementsArray = Array.isArray(settlements) ? settlements : [settlements];

        return settlementsArray.map((s: any) => {
            const amount = parseFloat(s.settlementAmount || '0');
            return {
                integrationCode: 'n11',
                externalId: s.settlementDate || Date.now().toString(),
                transactionDate: new Date(s.settlementDate),
                transactionType: UniversalTransactionType.SALE,
                platformType: s.status,
                debt: 0,
                credit: amount,
                netAmount: amount,
                description: `N11 Settlement - ${s.status}`
            };
        });
    }
}
