import { PLATFORM_PROCESS, IVariant, IInternalAddress, IExportStagedProduct } from '@interfaces/index';
import { ProductConnector } from '../api/ProductConnector';
import { ProductMapper } from '../transformers/ProductTransformer';
import { CategoryService } from './CategoryService';
import Service from './Service';
import { integrationCode } from '../constants';
import { IBatchCheckPayload, IBatchProcessResult, IFetchProductsResult, IInternalConversionResult, IInternalResult, IPlatformProductSummary, IValidationResult } from '@interfaces/index';
import { ShipmentService } from './ShipmentService';
import { fillUrl, resolveProductUrls, ResolvedProductUrls } from '../api/productUrls';
import { TRENDYOL_PRODUCT_LIMITS } from '../productConstants';
import { barcodePriceGate } from '../limits';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { sleep } from '@integration/modules/common/http/RateLimiter';
import { recordRateBucketMetric } from '@platform/runtime/metrics';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { normalizeAttrValue, matchMappingValue } from '@integration/catalog/attributePayload';
import { eventLog } from '@platform/core/logger';

const log = eventLog('adapter-trendyol', 'ProductService');

interface IGroup {
    url: string;
    items: any[];
    variants: any[];
    /** content-bulk-update: contentId -> bu partideki barkodlar (sonuç barkod taşımaz). */
    contentBarcodes?: Map<string, string[]>;
    contentIndex?: Map<string, any>;
}

export class ProductService {
    private connector: ProductConnector;
    private transformer: ProductMapper;
    private categoryService: CategoryService;
    private shipmentService: ShipmentService;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new ProductConnector(this.service, this.params);
        this.transformer = new ProductMapper();
        this.categoryService = new CategoryService(this.params, this.service);
        this.shipmentService = new ShipmentService(this.params, this.service);
    }

    // --- BATCH GÖNDERİM OPERASYONLARI ---
    public async transferProducts(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.processBatch(stagedProducts, PLATFORM_PROCESS.TRANSFER); }
    public async updateProductPrice(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.processBatch(stagedProducts, PLATFORM_PROCESS.UPDATE_PRICE); }
    public async updateProductStock(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.processBatch(stagedProducts, PLATFORM_PROCESS.UPDATE_STOCK); }
    public async updateProduct(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.processBatch(stagedProducts, PLATFORM_PROCESS.UPDATE); }
    public async updateProductV2(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.processBatch(stagedProducts, PLATFORM_PROCESS.UPDATE); }
    public async updateProductVariantV2(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.processBatch(stagedProducts, PLATFORM_PROCESS.UPDATE_VARIANT); }
    public async updateProductDeliveryV2(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.processBatch(stagedProducts, PLATFORM_PROCESS.UPDATE_DELIVERY); }

    /**
     * [C22 2026-09-28] Ürün V2 gönderim akışı. Her (URL, kalem) grubu <=1000 kalemlik parçalara bölünüp POST edilir:
     *  - TRANSFER -> POST v2/products
     *  - UPDATE   -> onaylı ürün (productContentId var): POST content-bulk-update (contentId anahtarlı, contentId başına TEK kalem);
     *                onaysız ürün: POST unapproved-bulk-update (barkod anahtarlı). V1 `PUT products` KALDIRILDI.
     *  - UPDATE_VARIANT -> variant-bulk-update; UPDATE_DELIVERY -> delivery-info-bulk-update; UPDATE_PRICE/STOCK -> price-and-inventory (DEĞİŞMEDİ).
     * Bir işlem birden çok isteğe bölünürse her varyantın kendi `trackingId`'si `variantList` içinde döner (Publisher bunu kullanır).
     * KAPSAM: onaylı üründe UPDATE yalnızca İÇERİK (başlık/açıklama/görsel/slicer-dışı öznitelik) günceller; stockCode/adres/KDV/desi
     * için UPDATE_VARIANT, teslimat için UPDATE_DELIVERY modları kullanılır (Trendyol artık tek istekte hepsini kabul etmiyor).
     */
    private async processBatch(stagedProducts: IExportStagedProduct[], mode: PLATFORM_PROCESS): Promise<IBatchProcessResult> {
        const urls = this.urls();
        const failedVariants: any[] = [];
        const groups = new Map<string, IGroup>();
        const groupFor = (key: string, url: string): IGroup => {
            let g = groups.get(key);
            if (!g) { g = { url, items: [], variants: [] }; groups.set(key, g); }
            return g;
        };

        for (const stagedProduct of stagedProducts) {
            const variant = stagedProduct.payload;
            if (!variant) continue;
            const validationResult = this.transformer.validate(variant, mode);
            if (!validationResult.result) {
                failedVariants.push({ variantId: variant._id, barcode: variant.barcode, reason: validationResult.reason });
                continue;
            }

            try {
                const [catId, brandId] = await Promise.all([
                    this.params.mappingProvider.getPlatformCategoryId(variant.product?.category),
                    this.params.mappingProvider.getPlatformBrandId(variant.product?.brand)
                ]);

                if (!catId || catId == -1 || !brandId) throw new Error("Eşleşme bulunamadı.");

                const catAttrs = (mode === PLATFORM_PROCESS.TRANSFER || mode === PLATFORM_PROCESS.UPDATE)
                    ? await this.categoryService.fetchCategoryAttributes(String(catId))
                    : [];

                const vMap = variant.platforms?.[integrationCode]?.mapping;
                const returningAddressId = vMap?.returningAddressId;
                const shipmentAddressId = vMap?.shipmentAddressId;
                let addresses: IInternalAddress[] = [];
                if (!returningAddressId || !shipmentAddressId)
                    addresses = await this.shipmentService.fetchAddresses();

                const contentId = mode === PLATFORM_PROCESS.UPDATE ? vMap?.productContentId : undefined;
                const item = this.transformer.toPlatformBatch(stagedProduct, mode, catAttrs, addresses, {
                    catId, brandId, settings: this.params.integrationSettings?.settings, contentId, clientId: this.clientId
                });
                if (!item) continue;
                const varInfo: any = { variantId: variant._id, barcode: variant.barcode };

                if (mode === PLATFORM_PROCESS.UPDATE && this.transformer.isContentUpdateItem(item)) {
                    const g = groupFor('content', fillUrl(urls.updateContent, { sellerId: this.sellerId() }));
                    g.contentBarcodes ??= new Map();
                    g.contentIndex ??= new Map();
                    const key = String(item.contentId);
                    if (!g.contentIndex.has(key)) { g.contentIndex.set(key, item); g.items.push(item); }
                    g.contentBarcodes.set(key, [...(g.contentBarcodes.get(key) || []), String(variant.barcode)]);
                    g.variants.push(varInfo);
                } else {
                    const g = groupFor('main', this.getEndpointUrl(mode, urls));
                    g.items.push(item);
                    g.variants.push(varInfo);
                }
            } catch (e: any) {
                failedVariants.push({ variantId: variant._id, barcode: variant.barcode, reason: e.message });
            }
        }

        const all = Array.from(groups.values()).filter(g => g.items.length > 0);
        if (all.length === 0) return { trackingId: null, result: false, failedVariants, variantList: [] };

        if (mode === PLATFORM_PROCESS.UPDATE_PRICE) await this.applyBarcodePriceLimit(all);

        const variantList: any[] = [];
        let firstTracking: string | null = null;
        let sentAny = false;
        const max = TRENDYOL_PRODUCT_LIMITS.MAX_ITEMS_PER_WRITE_REQUEST;

        for (const g of all) {
            for (let i = 0; i < g.items.length; i += max) {
                const slice = g.items.slice(i, i + max);
                const sliceVariants = g.contentBarcodes
                    ? g.variants.filter(v => slice.some(it => (g.contentBarcodes!.get(String(it.contentId)) || []).includes(String(v.barcode))))
                    : g.variants.slice(i, i + max);
                let data: any;
                try {
                    data = await this.connector.postBatch(g.url, slice);
                } catch (err: any) {
                    // Daha önce başka bir parça gönderildiyse tümünü yeniden denetmeyelim (TRANSFER'de mükerrer gönderim riski):
                    // yalnızca bu parçanın varyantları hata olarak raporlanır. Hiç gönderim olmadıysa hata yukarı fırlar
                    // (Publisher retryable ise erteler, değilse FAILED işaretler).
                    if (!sentAny) throw err;
                    for (const v of sliceVariants) failedVariants.push({ variantId: v.variantId, barcode: v.barcode, reason: err?.message || 'Gönderim hatası' });
                    continue;
                }
                const trackingId = data?.batchRequestId ?? null;
                if (!trackingId) {
                    for (const v of sliceVariants) failedVariants.push({ variantId: v.variantId, barcode: v.barcode, reason: 'Trendyol batchRequestId dönmedi; işlem doğrulanamadı.' });
                    continue;
                }
                sentAny = true;
                firstTracking ??= String(trackingId);
                if (g.contentBarcodes) ProductService.rememberContentBarcodes(this.clientId, String(trackingId), g.contentBarcodes);
                for (const v of sliceVariants) variantList.push({ ...v, trackingId: String(trackingId) });
            }
        }

        if (!sentAny) return { trackingId: null, result: false, failedVariants, variantList: [] };
        return { trackingId: firstTracking, result: true, variantList, failedVariants, type: mode };
    }

    /**
     * [ADR-0030 X1] Barkod başına fiyat güncelleme sınırı (Trendyol 30/dk). (1) Aynı partide aynı barkod birden çok kez varsa
     * BİRLEŞTİRİLİR (son değer kazanır; varyant kayıtları korunur). (2) Barkodun son 60 sn'deki fiyat yazımı 30'u aşacaksa çağrı
     * REDDEDİLMEZ, slot boşalana dek (en fazla ~60 sn) ERTELENİR; kalem düşürülmez.
     */
    private async applyBarcodePriceLimit(groups: IGroup[]): Promise<void> {
        let maxWaitMs = 0;
        for (const g of groups) {
            if (g.contentBarcodes) continue;
            const byBarcode = new Map<string, any>();
            for (const it of g.items) byBarcode.set(String(it.barcode), it);
            g.items = Array.from(byBarcode.values());
            for (const barcode of byBarcode.keys()) {
                const w = barcodePriceGate.reserve(`${this.clientId}::${barcode}`);
                if (w > 0) { maxWaitMs = Math.max(maxWaitMs, w); recordRateBucketMetric({ integrationCode, group: 'price_per_barcode', event: 'barcode_deferred' }); }
            }
        }
        if (maxWaitMs > 0) {
            log.warn('BARCODE_PRICE_DEFERRED', 'Barkod başına fiyat sınırı (30/dk) aşıldı; gönderim ertelendi', { waitMs: maxWaitMs });
            await sleep(ResilientHttpClient.scaleDelayMs(maxWaitMs));
        }
    }

    // contentId -> barkodlar (content-bulk-update sonucu barkod taşımaz). Süreç-içi, sınırlı ve TTL'li (sonuçlar ~4 sa görünür).
    private static contentBarcodeMemo = new Map<string, { at: number; map: Map<string, string[]> }>();
    private static readonly MEMO_MAX = 500;
    private static rememberContentBarcodes(clientId: string, trackingId: string, map: Map<string, string[]>) {
        const memo = ProductService.contentBarcodeMemo;
        const now = Date.now();
        for (const [k, v] of memo) if (now - v.at > TRENDYOL_PRODUCT_LIMITS.BATCH_RESULT_RETENTION_MS) memo.delete(k);
        while (memo.size >= ProductService.MEMO_MAX) memo.delete(memo.keys().next().value as string);
        memo.set(`${clientId}::${trackingId}`, { at: now, map });
    }
    private static recallContentBarcodes(clientId: string, trackingId: string): Map<string, string[]> | undefined {
        return ProductService.contentBarcodeMemo.get(`${clientId}::${trackingId}`)?.map;
    }
    /** SADECE TEST. */
    public static resetMemoForTests(): void { ProductService.contentBarcodeMemo.clear(); }

    private urls(): ResolvedProductUrls {
        return resolveProductUrls(this.params.integrationSettings?.urls, { clientId: this.clientId });
    }

    private sellerId(): string {
        return String(this.params.integrationSettings?.settings?.SELLERID);
    }

    private mapToStaging(item: any) {
        return {
            _normalizedBarcode: item.barcode,
            _normalizedStockCode: item.stockCode ?? item.stockcode,
            _normalizedMainId: item.productMainId,
            ...item
        };
    }

    public async getSummaryFromRaw(rawData: any): Promise<IPlatformProductSummary> {
        // --- ÖNEMLİ: Bu servisin içinde 5 dk'lık bir cache olmalı! ---
        const categoryAttributes: any = await this.categoryService.fetchCategoryAttributes(String(rawData.pimCategoryId));

        // 1. Kritik ID'leri String olarak topla (Set hızı için)
        const criticalAttributeIds = new Set(
            categoryAttributes
                .filter((attr: any) => !!attr.varianter || !!attr.slicer)
                .map((attr: any) => String(attr._id)) // String'e cast et
        );

        // 2. rawData içindeki attributeları süz
        const requiredAttributes = (rawData.attributes || [])
            .filter((attr: any) => criticalAttributeIds.has(String(attr.attributeId)))
            .map((attr: any) => {
                const categoryAttribute = categoryAttributes.find((catAttr: any) => String(catAttr._id) === String(attr.attributeId))
                return {
                    attributeId: String(attr.attributeId),
                    attributeName: attr.attributeName,
                    attributeValue: String(attr.attributeValue),
                    attributeValueId: attr.attributeValueId || null,
                    slicer: categoryAttribute?.slicer,
                    varianter: categoryAttribute?.varianter,
                    allowCustom: categoryAttribute?.allowCustom,
                    required: categoryAttribute?.required,
                    multiple: categoryAttribute?.multiple
                }
            });

        return {
            category: rawData.pimCategoryId,
            salePrice: Number(rawData.salePrice || 0),
            marketPrice: Number(rawData.listPrice || 0),
            quantity: Number(rawData.quantity || 0),
            images: Array.isArray(rawData.images)
                ? rawData.images.map((img: any) => typeof img === 'object' ? img.url : img)
                : [],
            barcode: rawData.barcode,
            stockcode: rawData.stockCode ?? rawData.stockcode,
            maincode: rawData.productMainId,
            productId: rawData.id,
            platformCategoryId: rawData.pimCategoryId, // Raporlama için lazım olabilir
            requiredAttributes: requiredAttributes
        };
    }

    public async validate(variant: IVariant): Promise<IValidationResult> {
        //TODO URUN GONDERILMEYE UYGUN MU KONTROLU
        return { result: true, reason: 'Urun gonderilmeye uygun.' }
    }



    // --- ÜRÜN ÇEKME VE DÖNÜŞTÜRME (FETCH) ---
    /**
     * [C22 2026-09-28] V2 ürün filtreleme: önce ONAYLI (`…/products/approved`, contentId altında `variants[]`), sonra ONAYSIZ
     * (`…/products/unapproved`). Her içerik, mevcut hattın beklediği düz (barkod bazlı) ham şekle çevrilir. Sayfalama:
     * `page*size <= 10.000`; Trendyol `nextPageToken` dönerse imleç bununla sürer. Hoşgörülü okuma: `variants[]` yoksa
     * (eski/V1-benzeri düz `content[]`) aynen okunur. Tavan aşıldı ama token dönmediyse sessiz kesme YOK: `FAILED` + neden.
     */
    public async getProductsAndPersist(callback: (chunk: any[]) => Promise<void>, query?: Record<string, any>): Promise<IFetchProductsResult> {
        let totalProcessed = 0;
        let totalElements = 0;
        let totalPages = 0;

        const settings = this.params.integrationSettings;
        const urls = this.urls();

        try {
            for (const stage of [
                { url: urls.listApproved, approved: true, size: TRENDYOL_PRODUCT_LIMITS.FILTER.APPROVED_PAGE_SIZE },
                { url: urls.listUnapproved, approved: false, size: TRENDYOL_PRODUCT_LIMITS.FILTER.UNAPPROVED_PAGE_SIZE },
            ]) {
                const rawUrl = stage.url.replace("<SELLERID>", this.sellerId());
                // URL'de sabit sorgu parametresi olabilir (DB'de): base + mevcut query ayrıştırılır (loglanmaz).
                const [baseUrl, existingQuery] = rawUrl.split('?');
                const baseParams = Object.fromEntries(new URLSearchParams(existingQuery || "").entries());

                let page = 0;
                let token: string | undefined;
                let processedThisStage = 0;
                for (; ;) {
                    const finalParams: any = { ...baseParams, ...query, size: stage.size };
                    if (token) finalParams.nextPageToken = token; else finalParams.page = page;

                    const data = await this.connector.fetchProductsFromPlatform(baseUrl, finalParams);
                    const body = data?.data;
                    const contents: any[] = Array.isArray(body?.content) ? body.content : [];
                    if (stage.approved) { totalElements += Number(body?.totalElements || 0); totalPages += Number(body?.totalPages || 0); }
                    else { totalElements += Number(body?.totalElements || 0); }

                    if (contents.length > 0) {
                        const flat = contents.flatMap((c: any) => this.transformer.flattenListedProduct(c, stage.approved));
                        if (flat.length > 0) {
                            await callback(flat.map((item: any) => this.mapToStaging(item)));
                            totalProcessed += flat.length;
                            processedThisStage += flat.length;
                        }
                    }

                    const nextToken: string | undefined = body?.nextPageToken || undefined;
                    if (contents.length === 0) break;
                    if (nextToken) { token = String(nextToken); continue; }

                    const pagesKnown = typeof body?.totalPages === 'number';
                    if (pagesKnown ? (page + 1 >= body.totalPages) : (contents.length < stage.size)) break;
                    if ((page + 1) * stage.size >= TRENDYOL_PRODUCT_LIMITS.FILTER.MAX_WINDOW) {
                        // Tavana ulaşıldı, daha fazla kayıt var ama imleç yok → sessizce kesme.
                        throw new IntegrationError('UNAVAILABLE',
                            `Trendyol ürün listesi ${TRENDYOL_PRODUCT_LIMITS.FILTER.MAX_WINDOW} kayıt penceresini aştı ve nextPageToken dönmedi; ${processedThisStage} kayıt alındı, kalan çekilemedi.`,
                            { integrationCode, operation: 'getProductsAndPersist', clientId: this.clientId });
                    }
                    page++;
                }
            }

            return {
                totalElements,
                totalProcessed,
                totalPages,
                status: 'COMPLETED'
            };

        } catch (error: any) {
            // Hata durumunda algoritma akışını bozmadan durumu raporla
            return {
                totalElements,
                totalProcessed,
                totalPages,
                status: 'FAILED',
                error: error.message
            };
        }
    }

    public async convertToInternalModel(stagedProduct: any): Promise<IInternalConversionResult> {
        const platformProduct = stagedProduct.rawData
        const categoryId = stagedProduct.localCategoryId
        if (!platformProduct.pimCategoryId) {
            throw new Error(`Pazaryeri kategori ID (pimCategoryId) eksik. Ürün: ${platformProduct.barcode || platformProduct.title}`);
        }
        const brandId = await this.params.mappingProvider.getLocalBrandId(platformProduct.brandId);

        const choicesResult = await this.resolveVariantChoices(platformProduct.pimCategoryId, platformProduct.attributes, categoryId);
        const variant = this.transformer.toInternalVariant(platformProduct, choicesResult);

        return {
            product: {
                title: platformProduct.title, brand: brandId, category: categoryId,
                maincode: platformProduct.productMainId, hasVariant: !!platformProduct.productMainId
            },
            variant
        };
    }

    // --- STATÜ VE BATCH TAKİBİ ---
    /**
     * [C22 2026-09-28] Batch sonucu (spec §3.4): batch `status` yalnız IN_PROGRESS/COMPLETED; kalem SUCCESS/FAILED;
     * PARTIALLY_COMPLETED belgede yok; STOK/FİYAT batch'lerinde batch-seviyesi `status` DÖNMEZ → tamamlanma kalemlerden
     * çıkarılır (`ProductMapper.interpretBatchResponse`). Kesinleşmemiş/belirsiz sonuçta `undefined` döner (Sentinel cooldown
     * verir; 24 sa sonra görünür zaman aşımı mesajı). Bilinmeyen kalem statüsü asla COMPLETED sayılmaz (FAILED + açıklama).
     */
    public async checkBatchProduct(payload: IBatchCheckPayload): Promise<IInternalResult[] | undefined> {
        const urls = this.urls();
        const batchId = payload.trackingId || payload.batchProcessId;
        if (!batchId) return undefined;
        const url = fillUrl(urls.checkBatch, { sellerId: this.sellerId(), batchId: String(batchId) });

        const data = await this.connector.fetchBatchStatus(url);
        const interpretation = this.transformer.interpretBatchResponse(data);
        if (!interpretation.done) {
            log.info('PRODUCTSERVICE_BATCH_SONUCLANMADI', `batch=${String(batchId).slice(0, 40)} sonuçlanmadı: ${interpretation.note}`);
            return undefined;
        }

        let contentBarcodes = ProductService.recallContentBarcodes(String(this.clientId), String(batchId));
        const unresolved = this.transformer.collectUnresolvedContentIds(interpretation.items)
            .filter(id => !contentBarcodes?.has(id));
        if (unresolved.length > 0) {
            // Süreç yeniden başladıysa (bellek notu kayıp) contentId -> barkod eşlemesi platformdan alınır.
            // Not: bu yol, içeriğin TÜM barkodlarını döndürür (bu partide olmayan kardeş varyantlar dahil) — Sentinel
            // yalnız kendi staging kaydı olanları sonuçlandırır.
            contentBarcodes = new Map(contentBarcodes || []);
            for (const id of unresolved.slice(0, TRENDYOL_PRODUCT_LIMITS.FILTER.BARCODES_PER_REQUEST)) {
                const found = await this.lookupBarcodesByContentId(id); // hata fırlatırsa Sentinel cooldown ile yeniden dener
                if (found.length > 0) contentBarcodes.set(id, found);
            }
        }
        return this.transformer.toInternalBatchResult(interpretation.items, payload.mode, contentBarcodes);
    }

    private async lookupBarcodesByContentId(contentId: string): Promise<string[]> {
        const urls = this.urls();
        const [baseUrl] = urls.listApproved.replace("<SELLERID>", this.sellerId()).split('?');
        const body = await this.connector.fetchPlatformProducts(baseUrl, { contentId, size: TRENDYOL_PRODUCT_LIMITS.FILTER.APPROVED_PAGE_SIZE });
        const contents: any[] = Array.isArray(body?.content) ? body.content : [];
        return contents.flatMap((c: any) => this.transformer.flattenListedProduct(c, true)).map((v: any) => v.barcode).filter(Boolean).map(String);
    }

    /**
     * [C22 2026-09-28] Statü sorgusu: barkodlar 50'şer parçalanır (`barcodes` en fazla 50). Önce ONAYLI listede aranır
     * (bulunan → COMPLETED); bulunamayanlar için ONAYSIZ listede (rejected → FAILED, pendingApproval → WAITING). Hiçbirinde
     * yoksa sonuç DÖNMEZ (Sync "durum alınamadı" olarak yeniden dener).
     */
    public async updateProductStatuses(payload: any): Promise<IInternalResult[]> {
        const urls = this.urls();
        const barcodes: string[] = Array.isArray(payload?.barcodes) ? payload.barcodes.filter(Boolean).map(String) : [];
        const approvedUrl = urls.listApproved.replace("<SELLERID>", this.sellerId()).split('?')[0];
        const unapprovedUrl = urls.listUnapproved.replace("<SELLERID>", this.sellerId()).split('?')[0];
        const results: any[] = [];
        const per = TRENDYOL_PRODUCT_LIMITS.FILTER.BARCODES_PER_REQUEST;

        const flatten = (body: any, approved: boolean) =>
            (Array.isArray(body?.content) ? body.content : []).flatMap((c: any) => this.transformer.flattenListedProduct(c, approved));

        if (barcodes.length === 0) {
            const body = await this.connector.fetchPlatformProducts(approvedUrl, { size: TRENDYOL_PRODUCT_LIMITS.FILTER.APPROVED_PAGE_SIZE });
            return this.transformer.toInternalStatusResult(flatten(body, true));
        }

        for (let i = 0; i < barcodes.length; i += per) {
            const part = barcodes.slice(i, i + per);
            const want = new Set(part);
            const body = await this.connector.fetchPlatformProducts(approvedUrl, { barcodes: part.join(','), size: TRENDYOL_PRODUCT_LIMITS.FILTER.APPROVED_PAGE_SIZE });
            const approved = flatten(body, true).filter((v: any) => want.has(String(v.barcode)));
            approved.forEach((v: any) => want.delete(String(v.barcode)));
            results.push(...approved);

            if (want.size > 0) {
                // Onaysız liste: `barcodes` filtresi bu uç noktada belgelenmedi → gönderilir (desteklenirse daraltır), yanıt yine barkoda göre süzülür.
                for (let page = 0; page < TRENDYOL_PRODUCT_LIMITS.FILTER.UNAPPROVED_LOOKUP_MAX_PAGES && want.size > 0; page++) {
                    const ub = await this.connector.fetchPlatformProducts(unapprovedUrl, { barcodes: Array.from(want).join(','), size: TRENDYOL_PRODUCT_LIMITS.FILTER.UNAPPROVED_PAGE_SIZE, page });
                    const list = flatten(ub, false);
                    for (const v of list) if (want.has(String(v.barcode))) { results.push(v); want.delete(String(v.barcode)); }
                    if (list.length < TRENDYOL_PRODUCT_LIMITS.FILTER.UNAPPROVED_PAGE_SIZE || ub?.totalPages === undefined || page + 1 >= ub.totalPages) break;
                }
            }
        }
        return this.transformer.toInternalStatusResult(results);
    }

    // --- YARDIMCI METOTLAR ---
    private async resolveVariantChoices(platformCatId: any, platformAttrs: any[], localCategoryId: string) {

        // 1. Verileri al
        const allMappings = await this.params.mappingProvider.getAllAttributeMappings();
        const localChoices = await this.params.mappingProvider.getLocalChoices();

        const localChoiceMap = new Map(localChoices.map((c: any) => [String(c._id), c]));

        const results: any[] = [];
        const mappedAttrIds: string[] = [];

        // 2. Trendyol ürün verisini Map'e çevir (kimlik + metin ayrı taşınır: eşleme önce kimlikle, sonra metinle çözülür)
        const pAttrMap = new Map<string, { valueId?: string; text?: string }>();
        platformAttrs?.forEach(a => {
            const norm = normalizeAttrValue(a);
            if (norm) pAttrMap.set(String(a.attributeId), norm);
        });


        // 3. KRİTİK FİLTRE:
        // Hem platformCategoryId HEM DE localCategoryId kontrolü yapıyoruz.
        // Böylece aynı Trendyol kategorisine bağlı farklı yerel kategori mappingleri karışmaz.
        const categorySpecificMappings = allMappings.filter((m: any) =>
            m.integrationCode === integrationCode &&
            String(m.platformCategoryId) === String(platformCatId) &&
            String(m.localCategoryId) === String(localCategoryId) && // <-- Bu satır hayat kurtarır
            m.isCategoryMapping === false
        );



        // 4. Eşleştirme döngüsü
        // ... (Önceki filtrelemeler ve pAttrMap hazırlığı aynı)

        for (const mapping of categorySpecificMappings) {
            const pAttrId = String(mapping.platformAttributeId);
            const trendyolValueFromProduct = pAttrMap.get(pAttrId);

            if (!trendyolValueFromProduct) continue;

            // Kimlik kesin eşleşmesi öncelikli, sonra metin (allowCustom alanlarında platformValueId null olabilir).
            const matchedValue: any = matchMappingValue(mapping.values, trendyolValueFromProduct);

            if (matchedValue) {
                const choiceDoc: any = localChoiceMap.get(String(mapping.localChoiceId));
                const localValueDoc = choiceDoc?.values?.find((v: any) => String(v._id) === String(matchedValue.localValueId));

                if (mapping.isVarianter || mapping.isSlicer) {
                    mappedAttrIds.push(pAttrId);
                    results.push({
                        choiceId: mapping.localChoiceId,
                        choiceTitle: choiceDoc?.title || mapping.platformAttributeName,
                        choiceValueId: matchedValue.localValueId,
                        choiceValueTitle: localValueDoc?.title || matchedValue.platformValueName,
                        varianter: !!mapping.isVarianter,
                        slicer: !!mapping.isSlicer
                    });
                }
            }
        }
        return {
            choices: results,
            slicer: results.find(r => r.slicer) || results[0] || {},
            unmappedVarianters: []
        };
    }

    /**
     * [C22 2026-09-28] Mod -> V2 uç nokta. UPDATE burada YOK (onaylı/onaysız ayrımı `processBatch`'te: content-bulk-update
     * ya da unapproved-bulk-update). URL'ler DB değeri ESKİ olsa da `productUrls` normalizasyonuyla V2'ye çevrilir.
     */
    private getEndpointUrl(mode: PLATFORM_PROCESS, urls: ResolvedProductUrls): string {
        const targets: any = {
            [PLATFORM_PROCESS.TRANSFER]: urls.transfer,
            [PLATFORM_PROCESS.UPDATE_PRICE]: urls.updatePrice,
            [PLATFORM_PROCESS.UPDATE_STOCK]: urls.updateStock,
            [PLATFORM_PROCESS.UPDATE]: urls.updateUnapproved,
            [PLATFORM_PROCESS.UPDATE_VARIANT]: urls.updateVariant,
            [PLATFORM_PROCESS.UPDATE_DELIVERY]: urls.updateDelivery,
        };
        const url: string | undefined = targets[mode];
        if (!url) throw new IntegrationError('NOT_SUPPORTED', `Trendyol ürün modu desteklenmiyor: ${mode}`, { integrationCode, operation: 'getEndpointUrl', clientId: this.clientId });
        return fillUrl(url, { sellerId: this.sellerId() });
    }
}
