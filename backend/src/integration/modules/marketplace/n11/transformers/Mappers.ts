import { IMessage, ICategoryAttribute, ICategoryAttributeValue, IFinancialTransaction, UniversalTransactionType, IExportStagedProduct } from '@interfaces/index';
import { normalizeAttrValue, indexCategoryAttributes, findValueById, findValueByText, missingRequiredAttributes, labelAttribute } from '@integration/catalog/attributePayload';
import { integrationCode } from '../constants';
import { effectiveChannelPrice, effectiveListPrice, round2 } from '@platform/core/pricing/effectivePrice';
import { resolveVatRate } from '@platform/core/pricing/vat';

/** [eslesme-fiyat WP4, 02-ekler/n11 C-1] N11'de marka ayrı servis değil, kategori özelliği "Marka" (attributeId 1, zorunlu, isCustomValue). */
export const N11_BRAND_ATTRIBUTE_ID = '1';
/** `ms/product/tasks/product-create` istek başına en çok SKU (resmî 10393). */
export const N11_MAX_SKUS_PER_TASK = 1000;
/** Resmî `vatRate` değerleri (10393). */
export const N11_VAT_RATES = [0, 1, 10, 20] as const;
export const N11_DEFAULT_PREPARING_DAY = 3;

export interface IN11SkuContext {
    /** N11 kategori kimliği (AttributeMappings ya da içe aktarılmış `mapping.categoryId`). */
    categoryId: string | number;
    /** Yerel marka adı (`Brands.title`); Marka özelliği varyantta yoksa bundan üretilir. */
    brandName?: string;
    /** Kategori özellikleri (verilirse kimlik/değer doğrulaması ve zorunlu denetim yapılır). */
    catAttrs?: ICategoryAttribute[];
    /** Tenant ayarları (`shippingId` = kargo şablonu ADI, `shippingDuration`, `taxPercentage`, `maxPurchaseQuantity`). */
    settings?: Record<string, any>;
}

const filled = (v: any) => v !== undefined && v !== null && String(v).trim() !== '';

/**
 * [eslesme-fiyat WP5] N11 liste fiyatı: staging `listPrice` (Validator, `effectiveListPrice`) → yoksa payload'dan tek kaynak →
 * yoksa satış. Liste < satış gönderilmez (N11 reddeder); 2 ondalık. WP4'te bilinçli olarak satışa eşit bırakılmıştı.
 */
export function n11ListPrice(sp: any, salePrice: number): number {
    const sale = Number.isFinite(salePrice) ? round2(salePrice) : 0;
    const staged = Number(sp?.listPrice);
    const fromStage = Number.isFinite(staged) && staged > 0 ? staged : null;
    const code = sp?.integrationCode || 'n11';
    const fromPayload = sp?.payload ? effectiveListPrice(effectiveChannelPrice(sp.payload, code)) : null;
    const list = fromStage ?? fromPayload ?? sale;
    return Math.max(round2(list), sale);
}

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

    /**
     * [eslesme-fiyat WP4, 02-ekler/n11 C-1 / D-N11-1 / D-N11-4 (P0)] `product-create` SKU gövdesi (resmî 10393). ÖNCEKİ GÖVDE
     * (`mapToRestBulkCreate`) `attributes`, `shipmentTemplate`, `vatRate`, `productMainId`, `preparingDay` göndermiyordu → her ürün ret
     * ("shipmentTemplate boş değer olamaz", "marka özellik değeri boş"). SAF: ağ/DB yok; eksik/geçersiz alanlar `errors[]` ile döner
     * (varyant gönderilmez, alan bazlı mesaj). Özellik: `{id, valueId}` (listeden) | `{id, customValue}` (isCustomValue) — iki alan
     * KARIŞTIRILMAZ. Marka varyant özelliklerinde yoksa yerel marka adından (kategori değer listesinde varsa kimlikle). Boş `attributes`/
     * `images` `[]` olarak gider (resmî kural).
     */
    public toRestCreateSku(sp: IExportStagedProduct, ctx: IN11SkuContext): { sku: any; errors: string[] } {
        const variant: any = sp.payload || {};
        const errors: string[] = [];
        const vMap = variant.platforms?.[integrationCode]?.mapping || {};
        const settings = ctx.settings || {};

        const { attributes, errors: attrErrors } = this.prepareAttributes(variant, ctx);
        errors.push(...attrErrors);

        const shipmentTemplate = [vMap.shippingId, settings.shippingId].find(filled);
        if (!filled(shipmentTemplate)) errors.push('shipmentTemplate (kargo şablonu): N11 ayarlarında kargo şablonu seçilmemiş');

        // [eslesme-fiyat WP5, D-PRICE-2] tek çözümleyici; ayarsız KDV'de 20 varsayımı KALKTI (alan bazlı hata).
        const vat = resolveVatRate(variant, integrationCode, settings);
        const vatRate = vat.value ?? 0;
        if (vat.value === null) errors.push('vatRate (KDV): ürün, kanal eşlemesi ya da N11 ayarında KDV oranı yok');
        else if (!(N11_VAT_RATES as readonly number[]).includes(vatRate)) errors.push(`vatRate (KDV): %${vat.value} N11'de geçersiz (izinli: ${N11_VAT_RATES.join(', ')})`);

        const preparingDay = Number([vMap.shippingDuration, vMap.preparingDay, settings.shippingDuration].find(filled) ?? N11_DEFAULT_PREPARING_DAY);
        const maxPurchase = [vMap.maxPurchaseQuantity, settings.maxPurchaseQuantity].find(filled);

        const stockCode = sp.stockcode || variant.stockcode || sp.productId;
        const productMainId = variant.maincode || stockCode;
        const salePrice = round2(parseFloat(String(sp.price ?? effectiveChannelPrice(variant, integrationCode).salePrice ?? 0)));
        if (!(salePrice > 0)) errors.push('salePrice (fiyat): sıfırdan büyük olmalı');
        const quantity = parseInt(String(sp.stock ?? variant.stock ?? 0), 10);
        const rawImages: any[] = Array.isArray(variant.images) && variant.images.length ? variant.images : ((sp as any).images || []);
        const images = rawImages
            .map((img: any) => (typeof img === 'string' ? img : img?.url))
            .filter(filled)
            .map((url: string, idx: number) => ({ url, order: idx + 1 }));

        const sku: any = {
            title: vMap.title || variant.product?.title || sp.title || '',
            description: vMap.description || variant.product?.description || variant.description || sp.title || '',
            categoryId: Number(ctx.categoryId),
            productMainId,
            stockCode,
            barcode: sp.barcode || variant.barcode,
            quantity: Number.isFinite(quantity) ? quantity : 0,
            salePrice,
            // [eslesme-fiyat WP5] liste fiyatı ayrı kaynaktan (staging `listPrice` ← `effectiveListPrice`); ≥ satış; yoksa satış.
            listPrice: n11ListPrice(sp, salePrice),
            currencyType: 'TL',
            vatRate,
            shipmentTemplate,
            preparingDay,
            images,
            attributes,
        };
        if (filled(maxPurchase)) sku.maxPurchaseQuantity = Number(maxPurchase);
        if (!sku.title) errors.push('title (ürün adı): boş olamaz');
        if (!filled(sku.barcode)) errors.push('barcode: boş olamaz');
        if (!filled(stockCode)) errors.push('stockCode: boş olamaz');
        return { sku, errors };
    }

    private prepareAttributes(variant: any, ctx: IN11SkuContext): { attributes: any[]; errors: string[] } {
        const vAttrs: Record<string, any> = variant.platforms?.[integrationCode]?.attributes || {};
        const { byId } = indexCategoryAttributes(ctx.catAttrs);
        const haveCategory = byId.size > 0;
        const attributes: any[] = [];
        const errors: string[] = [];
        const sent = new Set<string>();

        const push = (attrId: string, norm: { valueId?: string; text?: string }, nameHint?: string) => {
            const catAttr = haveCategory ? byId.get(attrId) : undefined;
            const label = labelAttribute(attrId, catAttr?.title ?? nameHint);
            const hasList = !!catAttr?.values && catAttr.values.length > 0;
            const allowCustom = catAttr ? catAttr.allowCustom === true : true;
            const numericId = norm.valueId !== undefined && /^\d+$/.test(norm.valueId) ? norm.valueId : undefined;
            if (numericId !== undefined && (!hasList || !!findValueById(catAttr, numericId))) {
                attributes.push({ id: Number(attrId), valueId: Number(numericId) });
            } else {
                const byText = norm.text !== undefined && hasList ? findValueByText(catAttr, norm.text) : undefined;
                if (byText && /^\d+$/.test(String(byText.id))) attributes.push({ id: Number(attrId), valueId: Number(byText.id) });
                else if (norm.text !== undefined && allowCustom) attributes.push({ id: Number(attrId), customValue: norm.text });
                else { errors.push(`${label}: '${String(norm.text ?? norm.valueId).slice(0, 40)}' değeri N11 değer listesinde yok — özelliği yeniden seçin`); return; }
            }
            sent.add(attrId);
        };

        for (const [rawId, attrData] of Object.entries(vAttrs)) {
            const attrId = String(rawId).trim();
            if (!/^\d+$/.test(attrId)) { errors.push(`özellik kimliği geçersiz: '${attrId.slice(0, 30)}'`); continue; }
            if (haveCategory && !byId.has(attrId)) continue; // bayat (kategori değişti): gönderme
            const norm = normalizeAttrValue(attrData);
            if (!norm) continue;
            push(attrId, norm, typeof attrData === 'object' ? attrData?.attributeName : undefined);
        }

        // [D-N11-4] Marka: varyantta seçilmemişse yerel marka adı (değer listesinde varsa kimlik, yoksa customValue).
        if (!sent.has(N11_BRAND_ATTRIBUTE_ID) && filled(ctx.brandName) && (!haveCategory || byId.has(N11_BRAND_ATTRIBUTE_ID))) {
            push(N11_BRAND_ATTRIBUTE_ID, { text: String(ctx.brandName).trim() }, 'Marka');
        }

        if (haveCategory) {
            const missing = missingRequiredAttributes(ctx.catAttrs, sent);
            if (missing.length) errors.push(`zorunlu özellik eksik: ${missing.map(c => labelAttribute(String(c._id), c.title)).join(', ')}`);
        } else if (!sent.has(N11_BRAND_ATTRIBUTE_ID)) {
            errors.push(`${labelAttribute(N11_BRAND_ATTRIBUTE_ID, 'Marka')}: marka boş olamaz (ürünün markasını seçin)`);
        }
        return { attributes, errors };
    }

    /**
     * [eslesme-fiyat WP4, D-N11-2 / C-3] `ms/product-query` `content[]` kaydı → Stager'a giden DÜZ ham kayıt (HB `toImportRecord` kalıbı).
     * Alan adları resmî özetten (10493: stockCode, productMainId, salePrice, listPrice, productStatus, attributes{attributeId,
     * attributeName, attributeValue}); tam şema canlıda doğrulanmadı → bilinen takma adlarla hoşgörülü okuma.
     */
    public toImportRecord(p: any): any {
        const attrsRaw = Array.isArray(p?.attributes) ? p.attributes : (Array.isArray(p?.attributes?.attribute) ? p.attributes.attribute : []);
        const attributes = attrsRaw.map((a: any) => ({
            attributeId: String(a.attributeId ?? a.id ?? ''),
            attributeName: a.attributeName ?? a.name,
            attributeValue: a.attributeValue ?? a.value ?? a.customValue,
            attributeValueId: a.attributeValueId ?? a.valueId ?? null,
        })).filter((a: any) => a.attributeId !== '');
        const brand = attributes.find((a: any) => a.attributeId === N11_BRAND_ATTRIBUTE_ID || String(a.attributeName || '').toLocaleLowerCase('tr') === 'marka');
        const imgs = Array.isArray(p?.images) ? p.images : (Array.isArray(p?.imageUrls) ? p.imageUrls : []);
        const stockCode = p?.stockCode ?? p?.sellerStockCode ?? p?.productSellerCode;
        return {
            id: p?.id ?? p?.n11ProductId ?? p?.productId ?? stockCode,
            stockCode,
            barcode: p?.barcode ?? p?.gtin,
            title: p?.title ?? p?.productName ?? '',
            description: p?.description ?? '',
            categoryId: p?.categoryId ?? p?.category?.id,
            productMainId: p?.productMainId ?? p?.groupId ?? stockCode,
            salePrice: Number(p?.salePrice ?? p?.price ?? 0),
            listPrice: Number(p?.listPrice ?? p?.salePrice ?? p?.price ?? 0),
            quantity: Number(p?.quantity ?? p?.stock ?? 0),
            vatRate: p?.vatRate !== undefined && p?.vatRate !== null ? Number(p.vatRate) : undefined,
            productStatus: p?.productStatus ?? p?.status,
            images: imgs.map((i: any) => (typeof i === 'string' ? i : i?.url)).filter(filled),
            attributes,
            brandName: brand?.attributeValue,
        };
    }

    /** [D-N11-2] Düz ham kayıt → iç varyant (round-trip: Marka metni `mapping.brandName`, özellikler kimlik anahtarlı). */
    public toInternalVariant(r: any): any {
        const vat = Number.isFinite(r.vatRate) ? r.vatRate : 20;
        const salePrice = Number(r.salePrice || 0);
        const marketPrice = Number(r.listPrice || salePrice);
        const attributes: Record<string, any> = {};
        for (const a of r.attributes || []) {
            if (String(a.attributeId) === N11_BRAND_ATTRIBUTE_ID) continue; // marka ayrı (yerel Brands)
            attributes[String(a.attributeId)] = {
                attributeName: a.attributeName,
                attributeValue: a.attributeValue,
                ...(a.attributeValueId !== null && a.attributeValueId !== undefined ? { attributeValueId: String(a.attributeValueId) } : {}),
            };
        }
        return {
            code: integrationCode,
            maincode: r.productMainId || r.stockCode,
            title: r.title,
            description: r.description,
            barcode: r.barcode,
            stockcode: r.stockCode,
            stock: Number(r.quantity || 0),
            prices: { isPlatformBasedPrice: false, price: salePrice * (100 / (100 + vat)), salePrice, marketPrice },
            images: r.images || [],
            choices: [],
            platforms: {
                [integrationCode]: {
                    // [eslesme-fiyat WP5, PLAN §3.4] içe aktarmada kanal fiyat NESNESİ yazılmaz (bayrak false; eski kayıt gönderimde yok sayılıyordu) →
                    // kanalda görülen fiyat `observed` olarak saklanır (dış değişiklik karşılaştırma tabanı).
                    observed: { salePrice, marketPrice, source: 'import' },
                    upload: { TRANSFER: { status: 'COMPLETED', messages: ['Ürün çekimi tamamlandı.'], updatedAt: new Date() } },
                    attributes,
                    mapping: { id: r.id, categoryId: r.categoryId, brandName: r.brandName, taxPercentage: vat },
                },
            },
            taxPercentage: vat,
            onSale: r.productStatus === undefined ? true : r.productStatus === 'Active',
            uniqueId: String(r.id ?? r.stockCode ?? ''),
            choiceId: '-', choiceValueId: '-', choiceValueTitle: '-',
        };
    }

    /** [C-4] Resmî `productStatus` (10493) → yayın durumu. */
    public mapProductStatus(status: unknown): 'COMPLETED' | 'WAITING' | 'FAILED' {
        const s = String(status ?? '');
        if (s === 'Active' || s === 'Approved') return 'COMPLETED';
        if (s === 'CatalogRejected' || s === 'Prohibited' || s === 'Suspended') return 'FAILED';
        return 'WAITING'; // InCatalogApproval, InApproval, Unlisted, bilinmeyen
    }

    /** Eski gövde: yalnız `updateProduct` (product-update; resmî güncelleme alan listesi görülemedi, C-13) için korunur. */
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
                    listPrice: n11ListPrice(sp, parseFloat(sp.price?.toString() || '0')),
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
                    listPrice: sp.price !== undefined ? n11ListPrice(sp, parseFloat(sp.price.toString())) : undefined
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
                // [eslesme-fiyat WP6, D-FIN-1] N11 hakedişinde kimlik yok: belirlenimci bileşik anahtar (tarih|durum|tutar). Eskiden
                // yalnız tarih (aynı gün farklı hakedişler eziliyordu) ya da `Date.now()` (her turda çift satır). Tarih yoksa boş → atlanır.
                externalId: s.settlementDate ? `${s.settlementDate}|${s.status ?? ''}|${amount.toFixed(2)}` : '',
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
