// [ADR-0023] Katalog tanımları (marka/kategori/seçenek) + özellik eşleme (AttributeMappingService) gövde şemaları (WP11).
// Üst düzey `strict` (bilinmeyen alan reddedilir); FE'nin bugün gönderdiği ek alanlar (isCategoryMapping, isAllowCustom, isMultiple,
// deleteBrand.parentId) BİLİNÇLİ olarak izinli tutulur (FE sözleşmesi bozulmaz; servis okumaz).
import { z } from 'zod';
import { allowList, idStr, integrationCode, isSafeKey, reqText, strictBody, text } from './common';
import type { RpcRef } from '../types';

/** Mongo ObjectId (24 hex) dizgesi. */
export const objectIdStr = z.string().regex(/^[0-9a-fA-F]{24}$/, 'geçersiz kimlik');
/** Pazaryeri kimliği: FE bazen sayı (Trendyol kategori/özellik kimlikleri) bazen dizge yollar; servis String()'e çevirir. */
const platformId = z.union([z.string().min(1).max(128), z.number().int().nonnegative()]);
const flag = z.boolean().nullish();
const readPaging = strictBody({ limit: z.number().int().min(1).max(10000).optional(), skip: z.number().int().min(0).max(1_000_000).optional(), integrationCode: integrationCode.optional() });
const simpleReadPaging = strictBody({ limit: z.number().int().min(1).max(10000).optional(), skip: z.number().int().min(0).max(1_000_000).optional() });

const valueEntry = allowList({
    localValueId: objectIdStr,
    platformValueId: platformId.nullish(),
    platformValueName: reqText(300),
});

/**
 * [ADR-0023 / X5] Ürün/varyant belgeleri: FE form durumunu olduğu gibi geri gönderir (`$set productInfo`, `variants.$`), alan kümesi
 * sabit değildir (Products/Variants `strict:false`). Bu yüzden İÇ nesne `passthrough` (alan atılmaz, FE uyumu) ama ANAHTARLAR güvenli
 * olmalı (`$op`/nokta/prototip anahtarı reddedilir). TODO(X13): alan kümesi netleşince izin listesine çevir. Motor alanları
 * (`reserved/allocations/stockVersion/stockDirty`) servis katmanında zaten `stripEngineOwnedVariantFields` ile atılır.
 */
const safeKeys = (obj: Record<string, unknown>, ctx: z.RefinementCtx) => {
    for (const k of Object.keys(obj)) if (!isSafeKey(k)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'geçersiz alan anahtarı', path: [] });
};
export const looseEntity = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough().superRefine(safeKeys);
const numLike = z.union([z.number(), z.string().max(32)]);
const variantDocOf = (idRequired: boolean) => looseEntity({ _id: idRequired ? idStr : idStr.optional(), stockcode: text(200).nullish(), barcode: text(200).nullish(), stock: numLike.nullish() });
const variantDoc = variantDocOf(false);
const variantList = z.array(variantDoc).max(5000);
const productInfoOf = (idRequired: boolean) => looseEntity({ _id: idRequired ? idStr : idStr.optional(), tempId: text(64).optional(), title: text(1000).optional(), hasVariant: z.boolean().optional(), variants: variantList });
const productInfo = productInfoOf(false);
const variantScope = z.number().int().min(0).max(2);
const batchForm = allowList({ stock: numLike.optional(), shelf: text(200).optional(), prices: z.record(z.string(), z.unknown()) });

// [PRC-R0/R1] PricingService tel gövdeleri (iş kuralı sınırları operations/pricing/*'ta ikinci kez doğrulanır).
const barcodeStr = z.string().min(1).max(128);
const costMoney = z.number().finite().min(0).max(10_000_000);
const variantOrBarcode = { variantId: objectIdStr.optional(), barcode: barcodeStr.optional() };
const PRICING_RPC_INPUT: Partial<Record<RpcRef, z.ZodType<any>>> = {
    'PricingService/listCosts': strictBody({
        variantIds: z.array(objectIdStr).max(200).optional(), barcodes: z.array(barcodeStr).max(200).optional(), productId: objectIdStr.optional(),
        missingOnly: z.boolean().optional(), limit: z.number().int().min(1).max(200).optional(), cursor: objectIdStr.optional(),
    }),
    'PricingService/setVariantCosts': strictBody({ items: z.array(allowList({ ...variantOrBarcode, costPrice: costMoney.nullable() })).min(1).max(500) }),
    'PricingService/listBuybox': strictBody({
        status: z.enum(['winning', 'losing', 'not_found', 'unchecked']).optional(), productIds: z.array(objectIdStr).max(100).optional(),
        barcodes: z.array(barcodeStr).max(100).optional(), limit: z.number().int().min(1).max(200).optional(), cursor: objectIdStr.optional(),
    }),
    'PricingService/getBuyboxHistory': strictBody({ barcode: barcodeStr, days: z.number().int().min(1).max(90).optional() }),
    'PricingService/previewMargin': strictBody({ items: z.array(allowList({ ...variantOrBarcode, price: costMoney.optional() })).min(1).max(50) }),
    // [PRC-R2] Kural/öneri/uygulama tel gövdeleri. K1/K4/K6 iş kuralları `operations/pricing/priceRule.ts`'te (sunucuda) ikinci kez doğrulanır;
    // burada da rakip/mağaza alanı TANINMAZ (strict).
    'PricingService/getRules': strictBody({}),
    'PricingService/saveRule': strictBody({
        id: objectIdStr.optional(), name: z.string().min(1).max(80), enabled: z.boolean(), integrationCode: z.literal('trendyol'),
        scope: strictBody({ productIds: z.array(objectIdStr).max(500).optional(), barcodes: z.array(barcodeStr).max(500).optional() }).optional(),
        competition: strictBody({
            mode: z.enum(['below', 'above']), deltaAmount: z.number().finite().min(0).max(100_000).nullable().optional(),
            deltaPercent: z.number().finite().min(0).max(50).nullable().optional(), floorMarginPercent: z.number().finite().min(0).max(90),
            ceiling: z.number().finite().positive().max(10_000_000), step: z.number().finite().min(0.01).max(1000),
            maxChangesPerDay: z.number().int().min(1).max(24), cooldownMin: z.number().int().min(15).max(1440),
            maxIncreasePercentPerDay: z.number().finite().min(0).max(10), excludeIfOutOfStock: z.boolean(),
        }),
    }),
    'PricingService/deleteRule': strictBody({ id: objectIdStr }),
    'PricingService/setPricingSettings': strictBody({ enabled: z.boolean(), consentVersion: z.string().max(40).optional(), dualEngineAcknowledged: z.boolean().optional() }),
    'PricingService/listSuggestions': strictBody({
        status: z.enum(['open', 'blocked', 'applied', 'dismissed', 'expired']).optional(), ruleId: objectIdStr.optional(),
        barcodes: z.array(barcodeStr).max(100).optional(), buyboxLostOnly: z.boolean().optional(), limit: z.number().int().min(1).max(200).optional(), cursor: objectIdStr.optional(),
    }),
    'PricingService/getPriceHistory': strictBody({ barcode: barcodeStr.optional(), days: z.number().int().min(1).max(90).optional(), limit: z.number().int().min(1).max(200).optional(), cursor: objectIdStr.optional() }),
    'PricingService/applySuggestions': strictBody({ suggestionIds: z.array(objectIdStr).min(1).max(50) }),
    'PricingService/dismissSuggestions': strictBody({ suggestionIds: z.array(objectIdStr).min(1).max(50) }),
};

export const CATALOG_RPC_INPUT: Partial<Record<RpcRef, z.ZodType<any>>> = {
    ...PRICING_RPC_INPUT,
    // --- Stok (Faz-3; docs/API_STOCK_FEATURES.md) ---
    'StockService/listLowStock': strictBody({
        threshold: z.number().int().min(0).max(1_000_000).optional(), channel: integrationCode.optional(),
        cursor: z.string().min(1).max(200).optional(), limit: z.number().int().min(1).max(200).optional(),
    }),
    'StockService/listMovements': strictBody({
        variantId: objectIdStr.optional(), barcode: z.string().min(1).max(200).optional(),
        from: z.string().min(8).max(40).optional(), to: z.string().min(8).max(40).optional(),
        cursor: z.string().min(1).max(200).optional(), limit: z.number().int().min(1).max(200).optional(),
    }).refine((b) => (b.variantId === undefined) !== (b.barcode === undefined), { message: 'variantId ya da barcode (yalnız biri) zorunludur' }),
    'StockService/getPublishLagSummary': strictBody({ window: z.enum(['1h', '24h']).optional() }),
    // --- Özellik eşleme ---
    'AttributeMappingService/get': readPaging,
    // [eslesme-fiyat WP2] mode=suggest: yazmaz, skorlu öneri döner (varsayılan apply).
    'AttributeMappingService/autoMatchAllCategories': strictBody({ integrationCode: integrationCode.optional(), mode: z.enum(['apply', 'suggest']).optional() }),
    'AttributeMappingService/saveCategoryMapping': strictBody({
        localCategoryId: objectIdStr, integrationCode, platformCategoryId: platformId,
        isCategoryMapping: flag,
        /** true: platform kategorisi değişse de eski özellik eşlemeleri KORUNUR (varsayılan: temizlenir). */
        keepAttributeMappings: z.boolean().optional(),
    }),
    'AttributeMappingService/saveAttributeMapping': strictBody({
        localCategoryId: objectIdStr, integrationCode, platformCategoryId: platformId, platformAttributeId: platformId,
        platformAttributeName: text(300).nullish(), localChoiceId: objectIdStr,
        isVarianter: flag, isSlicer: flag, isRequired: flag, isAllowCustom: flag, isMultiple: flag, isCategoryMapping: flag,
        values: z.array(valueEntry).max(5000).optional(),
    }),
    'AttributeMappingService/saveAttributeValueMapping': strictBody({
        integrationCode, platformCategoryId: platformId, platformAttributeId: platformId, platformAttributeName: text(300).nullish(),
        /** Verilmezse sunucu, (integrationCode, platformCategoryId) kategori eşlemesinden TEK yerel kategori çıkarır; belirsizse 400. */
        localCategoryId: objectIdStr.optional(),
        localChoiceId: objectIdStr, localValueId: objectIdStr,
        /** Kimlik zorunlu; kimliksiz (serbest metin) değer yalnız `isAllowCustom: true` ile ve `platformValueName` ile. */
        platformValueId: platformId.nullish(), platformValueName: text(300).nullish(),
        isVarianter: flag, isSlicer: flag, isRequired: flag, isAllowCustom: flag, isMultiple: flag, isCategoryMapping: flag,
    }),
    // [eslesme-fiyat WP2] "üst kategoriden kopyala": kaynak kategorinin (kategori + özellik + değer) eşlemeleri hedefe; varsayılan mevcutları EZMEZ.
    'AttributeMappingService/copyMappingsFromCategory': strictBody({
        sourceLocalCategoryId: objectIdStr, targetLocalCategoryId: objectIdStr, integrationCode, overwrite: z.boolean().optional(),
    }),
    // `integrationCode`: FE kategori silme akışında -1 (seçili entegrasyon yok) yollayabilir -> servis no-op (eski davranış).
    'AttributeMappingService/deleteFullMapping': strictBody({ localCategoryId: objectIdStr, integrationCode: z.union([integrationCode, z.number()]).optional() }),

    // --- Marka ---
    'BrandService/get': simpleReadPaging,
    'BrandService/addBrand': strictBody({ title: reqText(200) }),
    // FE iki farklı anahtar kullanır: BrandSync `brandId`, BrandList `_id`; servis ikisini de kabul eder.
    'BrandService/updateBrand': strictBody({ brandId: objectIdStr.optional(), _id: objectIdStr.optional(), title: reqText(200) }), // ikisinden biri gerekli: servis doğrular
    'BrandService/deleteBrand': strictBody({ _id: objectIdStr, parentId: z.unknown().optional() }),
    'BrandService/saveIntegrationBrand': strictBody({ brandId: objectIdStr, integrationCode, integrationBrand: z.record(z.string(), z.unknown()).nullable() }),

    // --- Kategori ---
    'CategoryService/addCategory': strictBody({ parentCategoryId: objectIdStr.nullish(), title: reqText(200) }),
    'CategoryService/updateCategory': strictBody({ categoryId: objectIdStr, title: reqText(200) }),
    'CategoryService/moveCategory': strictBody({ moveCategoryId: objectIdStr, moveInCategoryId: objectIdStr, parentId: z.unknown().optional() }),
    'CategoryService/changeOrderCategory': strictBody({ fromCategoryId: objectIdStr, toCategoryId: objectIdStr }),
    'CategoryService/deleteCategory': strictBody({ _id: objectIdStr }),

    // --- Seçenek (Choice) ---
    'ChoiceService/get': simpleReadPaging,
    'ChoiceService/addChoice': strictBody({ title: reqText(200), isVarianter: flag, isSlicer: flag }),
    'ChoiceService/addPreparedChoice': strictBody({
        choice: allowList({
            title: reqText(200), isVarianter: flag, isSlicer: flag,
            values: z.array(allowList({ title: reqText(200), allowCustom: flag })).max(5000).optional(),
        }),
    }),
    'ChoiceService/updateChoice': strictBody({ _id: objectIdStr, title: reqText(200), isVarianter: flag, isSlicer: flag }),
    'ChoiceService/removeChoice': strictBody({ _id: objectIdStr }),
    'ChoiceService/addChoiceValue': strictBody({ _id: objectIdStr, title: reqText(200), allowCustom: flag }),
    'ChoiceService/updateChoiceValue': strictBody({ _id: objectIdStr, id: objectIdStr, title: reqText(200), allowCustom: flag }),
    'ChoiceService/removeChoiceValue': strictBody({ _id: objectIdStr, id: objectIdStr }),

    // --- Ürün / varyant yazma (X5) ---
    'ProductService/saveProduct': strictBody({ productInfo }),
    'ProductService/updateProduct': strictBody({ productInfo: productInfoOf(true) }),
    'VariantService/addVariant': strictBody({ productId: idStr, variant: variantDoc }),
    'VariantService/addVariants': strictBody({
        productId: idStr,
        singleVariant: looseEntity({ prices: looseEntity({}) }),
        variantChoices: z.array(z.array(allowList({ choiceId: idStr, choiceValueId: idStr })).max(100)).max(5000),
    }),
    'VariantService/updateVariants': strictBody({ productId: idStr, variants: z.array(variantDocOf(true)).min(1).max(5000) }),
    'VariantService/deleteVariant': strictBody({ variantId: idStr }),
    'VariantService/batchProcessUpdate': strictBody({ productId: idStr, scope: variantScope, selectedVariants: z.array(idStr).max(5000).optional(), batchProcessForm: batchForm }),
    'VariantService/batchProcessDelete': strictBody({ productId: idStr, scope: variantScope, selectedVariants: z.array(idStr).max(5000).optional() }),
};
