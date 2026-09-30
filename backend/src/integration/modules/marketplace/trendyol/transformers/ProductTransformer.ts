import { ICategoryAttribute, IExportStagedProduct, IInternalAddress, IVariant, PLATFORM_PROCESS } from '@interfaces/index';
import { integrationCode } from '../constants';
import { randomUUID } from 'crypto';
import { IInternalResult } from '@interfaces/index';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { normalizeAttrValue, indexCategoryAttributes, findValueById, findValueByText, missingRequiredAttributes, labelAttribute } from '@integration/catalog/attributePayload';
import { TRENDYOL_ORIGIN_PATTERN, TRENDYOL_ORIGIN_REQUIRED_FROM_MS, TRENDYOL_FIELD_LIMITS, TRENDYOL_VAT_RATES } from '../productConstants';

/** `toPlatformBatch` eşleme bağlamı. `contentId` doluysa UPDATE onaylı-içerik gövdesi üretilir (aksi halde onaysız). */
export interface IProductBatchMapping {
    catId: any;
    brandId: any;
    settings: any;
    /** [C22] Onaylı ürünün Trendyol `contentId`'si (UPDATE → content-bulk-update anahtarı). */
    contentId?: string | number | null;
    clientId?: string | number;
}

/** Batch sonucunun yorumu (bkz. `interpretBatchResponse`). */
export interface IBatchInterpretation {
    /** false => sonuç henüz kesinleşmedi (Sentinel bir sonraki turda tekrar sorar). */
    done: boolean;
    items: any[];
    /** Kesinleşmeme / belirsizlik gerekçesi (log; sır içermez). */
    note?: string;
}

const TERMINAL_OK = new Set(['SUCCESS']);
const TERMINAL_FAIL = new Set(['FAILED', 'FAILURE', 'ERROR']);
/** Sonuçlanmamış (henüz bekleyen) kalem statüleri. Belgede yalnız IN_PROGRESS var; diğerleri savunmacı. */
const NON_TERMINAL = new Set(['IN_PROGRESS', 'PENDING', 'PROCESSING', 'RECEIVED', 'WAITING']);

const upper = (v: any): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : undefined);

export class ProductMapper {
    /** SADECE TEST: saat enjeksiyonu (Date.now'u dondurmak HTTP dayanıklılık katmanının zamanlayıcılarını bozar). */
    public static clock: () => number = () => Date.now();

    /**
     * ÜRÜN GÖNDERİMİ: Varyantları teknik ve iş mantığı açısından doğrular.
     */
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

    /**
     * ÜRÜN GÖNDERİMİ: Veriyi Trendyol JSON formatına çevirir (Batch operasyonları için).
     *
     * [C22 2026-09-28] Ürün V2 gövde şemaları (docs/research/2026-09-28-trendyol-v2-migration-spec.md §3):
     *  - TRANSFER (POST v2/products): `currencyType`, `cargoCompanyId`, `stockUnitType` V2'de YOK (çıkarıldı); `origin` eklendi;
     *    `deliveryOption` yalnız `{deliveryDuration}`; `lotNumber` yalnız tanımlıysa (eski varsayılan "1" kaldırıldı).
     *  - UPDATE: onaylı ürün (`mapping.contentId` var) → content-bulk-update gövdesi (contentId anahtarlı, barkodsuz);
     *    onaysız ürün → unapproved-bulk-update gövdesi (barkod anahtarlı). V1 PUT gövdesi ARTIK YOK.
     *  - UPDATE_VARIANT: variant-bulk-update (+ origin); UPDATE_DELIVERY: delivery-info-bulk-update (çoğul `deliveryOptions`).
     */
    public toPlatformBatch(
        stagedProduct: IExportStagedProduct,
        mode: PLATFORM_PROCESS,
        catAttrs: ICategoryAttribute[],
        addresses: IInternalAddress[],
        mapping: IProductBatchMapping
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
        /** [WP9] Özellik (attribute) yüküne ait alan bazlı hatalar; assertContract diğer ihlallerle TEK VALIDATION'da toplar. */
        let attrErrors: string[] = [];

        let shipmentAddressId = Number(vMapping?.shipmentAddressId || mapping.settings?.shipmentAddressId || 0);
        let returningAddressId = Number(vMapping?.returningAddressId || mapping.settings?.returningAddressId || 0);

        if (shipmentAddressId === 0) {
            const shipmentAddress = addresses.find(a => a.type == 'Shipment');
            if (shipmentAddress) {
                shipmentAddressId = Number(shipmentAddress.id);
            }
        }

        if (returningAddressId === 0) {
            const returningAddress = addresses.find((a: IInternalAddress) => a.type == 'Returning');
            if (returningAddress) {
                returningAddressId = Number(returningAddress.id);
            }
        }

        if (mode === PLATFORM_PROCESS.TRANSFER) {
            item.title = this.getTitle(vMapping, variant, mapping);
            item.description = this.getDescription(vMapping, variant, mapping);
            item.productMainId = variant.maincode;
            item.brandId = Number(mapping.brandId);
            item.categoryId = Number(mapping.catId);
            item.quantity = Number(variant.stock);
            item.stockCode = variant.stockcode;
            item.dimensionalWeight = this.getDimensionalWeight(vMapping, variant, mapping);
            //SKT - son kullanım tarihi (yalnız tanımlıysa; V2'de opsiyonel, eski "1" varsayılanı yanıltıcıydı)
            if (variant.lotNumber) item.lotNumber = variant.lotNumber;
            item.vatRate = this.getVatRate(vMapping, variant, mapping);
            item.shipmentAddressId = shipmentAddressId != 0 ? shipmentAddressId : 0;
            item.returningAddressId = returningAddressId != 0 ? returningAddressId : 0;
            item.salePrice = salePrice
            item.listPrice = marketPrice
            const origin = this.resolveOrigin(variant, vMapping, mapping, true);
            if (origin) item.origin = origin;
            const deliveryOption = this.getDeliveryOption(vMapping, mapping);
            if (deliveryOption) item.deliveryOption = deliveryOption;
            item.images = this.getImages(variant);
            const prepared = this.prepareAttributes(variant, catAttrs);
            item.attributes = prepared.attributes;
            attrErrors = prepared.errors;
            this.assertContract(item, mapping, true, attrErrors);
        }
        else if (mode === PLATFORM_PROCESS.UPDATE) {
            if (mapping.contentId !== undefined && mapping.contentId !== null && String(mapping.contentId) !== '') {
                // ONAYLI ürün içerik güncellemesi: contentId anahtarlı; barcode/productMainId/brandId/categoryId
                // ve slicer/varianter öznitelikleri onaylı üründe DEĞİŞTİRİLEMEZ → gönderilmez.
                delete item.barcode;
                item.contentId = this.toNumericIfPossible(mapping.contentId);
                item.title = this.getTitle(vMapping, variant, mapping);
                item.description = this.getDescription(vMapping, variant, mapping);
                const images = this.getImages(variant);
                if (images.length > 0) item.images = images;
                const prepared = this.prepareAttributes(variant, catAttrs, { excludeVariantDefining: true });
                // Boş liste GÖNDERİLMEZ: "attributes değişiyorsa TÜM değerler gönderilmeli" — boş dizi silme anlamına gelebilir.
                if (prepared.attributes.length > 0) { item.attributes = prepared.attributes; attrErrors = prepared.errors; }
            } else {
                // ONAYSIZ ürün: barkod anahtarlı tam güncelleme (unapproved-bulk-update)
                item.title = this.getTitle(vMapping, variant, mapping);
                item.description = this.getDescription(vMapping, variant, mapping);
                item.productMainId = variant.maincode;
                item.brandId = Number(mapping.brandId);
                item.categoryId = Number(mapping.catId);
                item.stockCode = variant.stockcode;
                item.dimensionalWeight = this.getDimensionalWeight(vMapping, variant, mapping);
                item.vatRate = this.getVatRate(vMapping, variant, mapping);
                if (variant.lotNumber) item.lotNumber = variant.lotNumber;
                item.shipmentAddressId = shipmentAddressId != 0 ? shipmentAddressId : 0;
                item.returningAddressId = returningAddressId != 0 ? returningAddressId : 0;
                const origin = this.resolveOrigin(variant, vMapping, mapping, true);
                if (origin) item.origin = origin;
                const deliveryOption = this.getDeliveryOption(vMapping, mapping);
                if (deliveryOption) item.deliveryOption = deliveryOption;
                item.images = this.getImages(variant);
                const prepared = this.prepareAttributes(variant, catAttrs);
                item.attributes = prepared.attributes;
                attrErrors = prepared.errors;
                this.assertContract(item, mapping, true, attrErrors);
            }
            if (item.contentId !== undefined) this.assertContract(item, mapping, false, attrErrors);
        }
        else if (mode === PLATFORM_PROCESS.UPDATE_VARIANT) {
            item.vatRate = this.getVatRate(vMapping, variant, mapping);
            item.stockCode = variant.stockcode;
            item.shipmentAddressId = shipmentAddressId != 0 ? shipmentAddressId : 0;
            item.returningAddressId = returningAddressId != 0 ? returningAddressId : 0;
            item.dimensionalWeight = this.getDimensionalWeight(vMapping, variant, mapping);
            if (variant.lotNumber) item.lotNumber = variant.lotNumber;
            item.locationBasedDelivery = vMapping?.locationBasedDelivery || mapping.settings?.locationBasedDelivery || "DISABLED";
            // Varyant güncellemede origin opsiyonel (kısmi güncelleme): biliniyorsa gönder, bilinmiyorsa reddetme.
            const origin = this.resolveOrigin(variant, vMapping, mapping, false);
            if (origin) item.origin = origin;
        }
        else if (mode === PLATFORM_PROCESS.UPDATE_DELIVERY) {
            const deliveryOption = this.getDeliveryOption(vMapping, mapping);
            if (!deliveryOption) {
                throw new IntegrationError('VALIDATION',
                    'Teslimat süresi tanımlı değil: varyant/entegrasyon ayarında deliveryDuration (0 = aynı gün, 1 = ertesi gün) belirtin.',
                    { integrationCode, operation: 'toPlatformBatch:UPDATE_DELIVERY', clientId: mapping.clientId ?? 'unknown' });
            }
            // delivery-info-bulk-update gövde nesnesi ÇOĞUL `deliveryOptions` (ürün oluşturmada tekil `deliveryOption`).
            item.deliveryOptions = deliveryOption;
        }
        else if (mode === PLATFORM_PROCESS.UPDATE_PRICE) {
            item.salePrice = salePrice;
            item.listPrice = marketPrice;
        }
        else if (mode === PLATFORM_PROCESS.UPDATE_STOCK) {
            item.quantity = Number(variant.stock);
        }
        return item;
    }

    /**
     * [WP5] Gönderim ÖNCESİ yerel sözleşme doğrulaması (resmi V2 sınırları, API_CONTRACTS Trendyol §1): pazaryerinin kesin
     * reddedeceği veri gönderilmez. Tüm ihlaller alan bazlı TEK VALIDATION hatasında toplanır (kullanıcıya anlamlı mesaj).
     * `full=true`: aktarma/onaysız güncelleme (zorunlu alanlar aranır); `full=false`: onaylı içerik güncellemesi (yalnız mevcut alanlar).
     */
    public assertContract(item: any, mapping: IProductBatchMapping, full: boolean, extraErrors: string[] = []): void {
        const errs: string[] = [];
        const has = (v: any) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');
        const isInt = (v: any) => typeof v === 'number' && Number.isInteger(v) && v > 0;

        if (full || item.barcode !== undefined) {
            const b = String(item.barcode ?? '').replace(/\s+/g, '');
            if (!b) errs.push('barcode: boş olamaz');
            else if (b.length > TRENDYOL_FIELD_LIMITS.barcode) errs.push(`barcode: en fazla ${TRENDYOL_FIELD_LIMITS.barcode} karakter (${b.length})`);
            else if (!/^[A-Za-z0-9._-]+$/.test(b)) errs.push("barcode: yalnızca harf, rakam ve . - _ karakterleri kullanılabilir");
        }
        if (full || item.title !== undefined) {
            if (!has(item.title)) errs.push('title: boş olamaz');
            else if (String(item.title).length > TRENDYOL_FIELD_LIMITS.title) errs.push(`title: en fazla ${TRENDYOL_FIELD_LIMITS.title} karakter (${String(item.title).length})`);
        }
        if (full) {
            if (!has(item.productMainId)) errs.push('productMainId (ana ürün kodu): boş olamaz');
            else if (String(item.productMainId).length > TRENDYOL_FIELD_LIMITS.productMainId) errs.push(`productMainId: en fazla ${TRENDYOL_FIELD_LIMITS.productMainId} karakter`);
            if (!isInt(item.brandId)) errs.push('brandId: geçerli (tam sayı) bir Trendyol marka eşleşmesi gerekli');
            if (!isInt(item.categoryId)) errs.push('categoryId: geçerli (tam sayı) bir Trendyol kategori eşleşmesi gerekli');
            if (item.quantity !== undefined && !(Number.isInteger(item.quantity) && item.quantity >= 0)) errs.push('quantity: 0 veya pozitif tam sayı olmalı');
            if (item.salePrice !== undefined && !(item.salePrice > 0)) errs.push('salePrice: 0’dan büyük olmalı');
            if (item.listPrice !== undefined && item.salePrice !== undefined && item.listPrice < item.salePrice) errs.push('listPrice: salePrice’tan küçük olamaz');
            if (!TRENDYOL_VAT_RATES.includes(item.vatRate)) errs.push(`vatRate: ${TRENDYOL_VAT_RATES.join(', ')} değerlerinden biri olmalı (${String(item.vatRate)})`);
            if (has(item.stockCode) && String(item.stockCode).length > TRENDYOL_FIELD_LIMITS.stockCode) errs.push(`stockCode: en fazla ${TRENDYOL_FIELD_LIMITS.stockCode} karakter`);
            if (has(item.lotNumber) && String(item.lotNumber).length > TRENDYOL_FIELD_LIMITS.lotNumber) errs.push(`lotNumber: en fazla ${TRENDYOL_FIELD_LIMITS.lotNumber} karakter`);
        }
        if (item.description !== undefined || full) {
            const d = String(item.description ?? '');
            if (full && d.trim() === '') errs.push('description: boş olamaz');
            else if (d.length > TRENDYOL_FIELD_LIMITS.description) errs.push(`description: en fazla ${TRENDYOL_FIELD_LIMITS.description} karakter (${d.length})`);
        }
        if (full || item.images !== undefined) {
            const imgs: any[] = Array.isArray(item.images) ? item.images : [];
            if (full && imgs.length === 0) errs.push('images: en az 1 görsel gerekli');
            if (imgs.length > TRENDYOL_FIELD_LIMITS.images) errs.push(`images: en fazla ${TRENDYOL_FIELD_LIMITS.images} görsel (${imgs.length})`);
            const bad = imgs.filter(i => !/^https:\/\//i.test(String(i?.url ?? ''))).length;
            if (bad > 0) errs.push(`images: ${bad} görsel HTTPS değil/boş (yalnızca https:// adresleri kabul edilir)`);
        }
        errs.push(...extraErrors);
        if (errs.length > 0) {
            throw new IntegrationError('VALIDATION', `Trendyol ürün doğrulaması başarısız (barkod ${String(item.barcode ?? item.contentId ?? '?').slice(0, 40)}): ${errs.join('; ')}.`,
                { integrationCode, operation: 'assertContract', clientId: mapping.clientId ?? 'unknown' });
        }
    }

    /** UPDATE gövdesi onaylı içerik güncellemesi mi (contentId anahtarlı)? */
    public isContentUpdateItem(item: any): boolean {
        return !!item && item.contentId !== undefined;
    }

    private getTitle(vMapping: any, variant: IVariant, mapping: any) {
        return vMapping?.title || variant.product?.title;
    }
    private getDescription(vMapping: any, variant: IVariant, mapping: any) {
        return vMapping?.description || variant.product?.description || "";
    }
    private getDimensionalWeight(vMapping: any, variant: IVariant, mapping: any) {
        return Number(vMapping?.desi || variant.product?.desi || mapping.settings?.desi || 1);
    }
    private getVatRate(vMapping: any, variant: IVariant, mapping: any) {
        // 0 (%0 KDV) GEÇERLİ bir orandır: `||` zinciri 0'ı düşürüp 20'ye çeviriyordu (yanlış KDV) → `??` ile yalnız yoksa 20.
        const raw = [vMapping?.taxPercentage, variant.product?.taxPercentage, mapping.settings?.taxPercentage]
            .find(v => v !== undefined && v !== null && v !== '');
        return raw === undefined ? 20 : Number(raw);
    }

    private toNumericIfPossible(v: any) {
        const n = Number(v);
        return Number.isFinite(n) && String(v).trim() !== '' ? n : v;
    }

    /**
     * Teslimat süresi: 0 = aynı gün, 1 = ertesi gün (V2). Kaynak önceliği: varyant `deliveryDuration` →
     * entegrasyon ayarı `deliveryDuration` → (ESKİ) `fastDeliveryType` ayarı: SAME_DAY_SHIPPING → 0, diğerleri → 1
     * (eski sabit `deliveryDuration: 1` korunur). Hiçbiri tanımlı değilse `undefined` (alan gönderilmez).
     * `fastDeliveryType` Ağustos 2026'dan beri Trendyol'da işlenmiyor; aynı-gün niyeti artık 0 ile ifade edilir.
     */
    private getDeliveryDuration(vMapping: any, mapping: any): 0 | 1 | undefined {
        const explicit = vMapping?.deliveryDuration ?? mapping.settings?.deliveryDuration;
        if (explicit !== undefined && explicit !== null && explicit !== '' && explicit !== -1 && explicit !== '-1') {
            const n = Number(explicit);
            if (n === 0 || n === 1) return n;
            throw new IntegrationError('VALIDATION', `Geçersiz teslimat süresi (deliveryDuration): '${String(explicit)}'. Yalnızca 0 (aynı gün) veya 1 (ertesi gün) kabul edilir.`,
                { integrationCode, operation: 'getDeliveryDuration', clientId: mapping.clientId ?? 'unknown' });
        }
        const legacy = vMapping?.fastDeliveryType || mapping.settings?.fastDeliveryType;
        if (legacy && legacy != -1) {
            return String(legacy).toUpperCase() === 'SAME_DAY_SHIPPING' ? 0 : 1;
        }
        return undefined;
    }

    private getDeliveryOption(vMapping: any, mapping: any): { deliveryDuration: 0 | 1 } | null {
        const deliveryDuration = this.getDeliveryDuration(vMapping, mapping);
        return deliveryDuration === undefined ? null : { deliveryDuration };
    }

    /**
     * MENŞE (origin, 2 harfli ülke kodu). Kaynak önceliği (veri modeli DEĞİŞMEDİ; şemasız/`strict:false` alanlar):
     *   1) `variant.platforms.trendyol.mapping.origin` (V2 çekmeden dolar / kullanıcı platform bazlı ezmesi)
     *   2) `variant.origin`  3) `variant.product.origin`  4) entegrasyon ayarı `settings.origin` (tenant varsayılanı).
     * Değer VARSA biçim doğrulanır (2 harf; aksi halde VALIDATION — yanlış kod Trendyol'da reddedilir).
     * Değer YOKSA: `required` ve 23.10.2026 (TR) sonrasıysa VALIDATION ile açıkça reddedilir; öncesinde alan
     * atlanır (Trendyol'da o güne kadar opsiyonel; kategori zorunlu menşe attribute'u attributes'tan gitmeye devam eder).
     */
    private resolveOrigin(variant: IVariant, vMapping: any, mapping: IProductBatchMapping, required: boolean): string | undefined {
        const anyVariant: any = variant;
        const raw = vMapping?.origin ?? anyVariant.origin ?? anyVariant.product?.origin ?? mapping.settings?.origin;
        const ctx = { integrationCode, operation: 'resolveOrigin', clientId: mapping.clientId ?? 'unknown' };
        if (raw === undefined || raw === null || String(raw).trim() === '') {
            if (required && ProductMapper.clock() >= TRENDYOL_ORIGIN_REQUIRED_FROM_MS) {
                throw new IntegrationError('VALIDATION',
                    "Menşe (origin) bilgisi eksik: Trendyol 23.10.2026'dan itibaren menşe ülke kodunu (2 harf, örn. TR) zorunlu tutuyor. Ürün/varyant 'origin' alanını veya entegrasyon ayarındaki varsayılan 'origin'i tanımlayın.",
                    ctx);
            }
            return undefined;
        }
        const value = String(raw).trim();
        if (!TRENDYOL_ORIGIN_PATTERN.test(value)) {
            throw new IntegrationError('VALIDATION', `Geçersiz menşe (origin) kodu: '${value.slice(0, 20)}'. 2 harfli ülke kodu bekleniyor (örn. TR).`, ctx);
        }
        return value.toUpperCase();
    }

    private getImages(variant: IVariant) {
        // Eğer variant.images zaten [{url: '...'}, {url: '...'}] ise:
        return variant.images.map((imgObj: String) => ({
            url: imgObj
        }));
    }


    /**
     * ÜRÜN ALIMI: Platform varyantını dükkan modeline (IVariant) çevirir.
     */
    public toInternalVariant(p: any, choicesResult: any): IVariant {
        const vat = p.vatRate || 0;
        return {
            code: integrationCode,
            maincode: p.productMainId,
            title: p.title,
            description: p.description,
            barcode: p.barcode,
            stockcode: p.stockCode,
            stock: p.quantity,
            prices: {
                isPlatformBasedPrice: false,
                price: p.salePrice * (100 / (100 + vat)),
                salePrice: p.salePrice, // COM-10: ic fiyat = pazaryeri brut satis fiyati; komisyon dusulmez (net fiyat COM-07 modeliyle okuma aninda)
                marketPrice: p.listPrice,
            },
            images: p.images?.map((img: any) => img.url) || [],
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
                        id: p.id,
                        platformListingId: p.platformListingId,
                        pimCategoryId: p.pimCategoryId,
                        productContentId: p.productContentId,
                        brandId: p.brandId,
                        returningAddressId: p.returningAddressId,
                        shipmentAddressId: p.shipmentAddressId,
                        // [C22] menşe (V2 filtre yanıtından; yoksa undefined) — şema değişikliği yok (mapping serbest nesne)
                        origin: p.origin,
                        unmappedVarianters: choicesResult.unmappedVarianters
                    },
                }
            },
            taxPercentage: vat,
            //TODO BUNU EKLE
            lotNumber: p.lotNumber,
            onSale: p.onSale,
            tempId: randomUUID(),
            uniqueId: p.uniqueId || randomUUID(),
            choiceId: choicesResult.slicer?.choiceId || '-',
            choiceValueId: choicesResult.slicer?.choiceValueId || '-',
            choiceValueTitle: choicesResult.slicer?.choiceValueTitle || '-'
        } as IVariant;
    }

    // ------------------------------------------------------------------
    // V2 ÜRÜN ÇEKME: contentId altında iç içe `variants[]` → bizim düz (V1-benzeri) ham şekil
    // ------------------------------------------------------------------

    /**
     * [C22 2026-09-28] V2 filtre yanıtı öğesini (onaylı: `{contentId, variants[]}`; onaysız: kökte barkod) mevcut
     * ham (V1-benzeri düz) şekle çevirir; Stager/`getSummaryFromRaw`/`toInternalVariant` DEĞİŞMEDEN çalışır.
     * HOŞGÖRÜLÜ okuma: `variants[]` YOKSA öğe zaten düz (V1) şekildedir → aynen (normalize edilerek) döner;
     * alan adı varyantları (`brand.id`/`brandId`, `stock.quantity`/`quantity`, `price.salePrice`/`salePrice`…) desteklenir.
     */
    public flattenListedProduct(content: any, approved: boolean): any[] {
        if (!content || typeof content !== 'object') return [];
        const variants = Array.isArray(content.variants) ? content.variants : null;
        if (!variants) return [this.normalizeFlatItem(content, content, approved)];
        return variants.map((v: any) => this.normalizeFlatItem(content, v, approved));
    }

    private normalizeFlatItem(content: any, v: any, approved: boolean): any {
        const pick = (...vals: any[]) => vals.find(x => x !== undefined && x !== null);
        const status = typeof content.status === 'string' ? content.status.toLowerCase() : (typeof v.status === 'string' ? v.status.toLowerCase() : undefined);
        const price = v.price && typeof v.price === 'object' ? v.price : {};
        const stock = v.stock && typeof v.stock === 'object' ? v.stock : {};
        const contentId = pick(content.contentId, content.productContentId, v.contentId, v.productContentId);
        const isNested = v !== content;
        const attrSources = isNested ? [content.attributes, v.attributes] : [content.attributes];
        const rawApprovedFlag = pick(v.approved, content.approved);

        return {
            ...(isNested ? {} : content),
            id: pick(v.variantId, v.id, content.id),
            variantId: pick(v.variantId, v.id),
            platformListingId: pick(v.platformListingId, content.platformListingId),
            productContentId: contentId,
            contentId,
            productMainId: pick(content.productMainId, v.productMainId),
            barcode: pick(v.barcode, content.barcode),
            stockCode: pick(v.stockCode, v.stockcode, content.stockCode, content.stockcode),
            title: pick(content.title, v.title),
            description: pick(content.description, v.description),
            images: pick(content.images, v.images) || [],
            attributes: this.mergeAttributes(...attrSources),
            brandId: pick(content.brand?.id, content.brandId, v.brandId),
            brandName: pick(content.brand?.name, content.brandName),
            pimCategoryId: pick(content.category?.id, content.categoryId, content.pimCategoryId, v.pimCategoryId),
            quantity: pick(stock.quantity, v.quantity, content.quantity),
            salePrice: pick(price.salePrice, v.salePrice, content.salePrice),
            listPrice: pick(price.listPrice, v.listPrice, content.listPrice),
            vatRate: pick(v.vatRate, content.vatRate),
            origin: pick(v.origin, content.origin),
            lotNumber: pick(v.lotNumber, content.lotNumber),
            onSale: pick(v.onSale, content.onSale),
            shipmentAddressId: pick(v.shipmentAddressId, content.shipmentAddressId),
            returningAddressId: pick(v.returningAddressId, content.returningAddressId),
            deliveryOption: pick(v.deliveryOption, content.deliveryOption),
            cargoProviders: pick(v.cargoProviders, content.cargoProviders),
            channels: pick(v.channels, content.channels),
            locked: pick(v.locked, content.locked),
            archived: pick(v.archived, content.archived),
            blacklisted: pick(v.blacklisted, content.blacklisted),
            rejectReasonDetails: pick(content.rejectReasonDetails, v.rejectReasonDetails),
            // Onay bayrakları: liste uç noktasından türetilir (onaylı liste → approved:true; onaysız → rejected/pendingApproval)
            approved: approved ? true : (rawApprovedFlag === true),
            rejected: !approved && (status === 'rejected' || pick(v.rejected, content.rejected) === true),
        };
    }

    /** Öznitelik dizilerini birleştirir (aynı attributeId için sonraki kaynak kazanır) ve alan adlarını normalize eder. */
    private mergeAttributes(...sources: any[]): any[] {
        const byId = new Map<string, any>();
        for (const list of sources) {
            if (!Array.isArray(list)) continue;
            for (const a of list) {
                if (!a) continue;
                const attributeId = a.attributeId ?? a.id;
                if (attributeId === undefined || attributeId === null) continue;
                byId.set(String(attributeId), {
                    ...a,
                    attributeId,
                    attributeName: a.attributeName ?? a.name,
                    attributeValue: a.attributeValue ?? a.customAttributeValue ?? a.value,
                    attributeValueId: a.attributeValueId ?? a.valueId,
                });
            }
        }
        return Array.from(byId.values());
    }

    // ------------------------------------------------------------------
    // BATCH SONUCU YORUMLAMA (C22/R7)
    // ------------------------------------------------------------------

    /**
     * [C22 2026-09-28] Resmi belge (spec §3.4): batch `status` yalnızca `IN_PROGRESS`/`COMPLETED`; kalem `status`
     * `SUCCESS`/`FAILED` (teslimat güncellemede ayrıca `IN_PROGRESS`); `PARTIALLY_COMPLETED` belgede YOK.
     * STOK/FİYAT batch'lerinde batch-seviyesi `status` DÖNMEZ → tamamlanma KALEMLERDEN çıkarılır.
     *
     * Kurallar (güvenli yön: emin olunmayan kalem ASLA başarılı sayılmaz):
     *  - batch `IN_PROGRESS` → bekle.
     *  - kalem yok → bekle (not düşülür; Sentinel 24 sa zaman aşımı görünür mesaj üretir).
     *  - herhangi kalem bekleyen statüde (IN_PROGRESS/…) veya statüsüz + batch statüsü de yok → bekle.
     *  - batch `COMPLETED` (ya da eski `FAILED`/`PARTIALLY_COMPLETED`) veya tüm kalemler kesin → tamam.
     *  - bilinmeyen kalem statüsü (bitmiş batch içinde) → `toInternalBatchResult` FAILED + açıklama (asla COMPLETED).
     */
    public interpretBatchResponse(data: any): IBatchInterpretation {
        if (!data || typeof data !== 'object') return { done: false, items: [], note: 'boş/geçersiz batch yanıtı' };
        const items: any[] = Array.isArray(data.items) ? data.items : [];
        const batchStatus = upper(data.status);
        const batchDoneStatuses = new Set(['COMPLETED', 'FAILED', 'PARTIALLY_COMPLETED']);

        if (batchStatus === 'IN_PROGRESS') return { done: false, items, note: 'batch IN_PROGRESS' };
        if (items.length === 0) return { done: false, items, note: 'batch yanıtında kalem yok' };

        const itemStatuses = items.map(i => upper(i?.status));
        if (itemStatuses.some(s => s !== undefined && NON_TERMINAL.has(s))) {
            return { done: false, items, note: 'sonuçlanmamış (IN_PROGRESS) kalem var' };
        }

        if (batchStatus && batchDoneStatuses.has(batchStatus)) return { done: true, items };

        // Batch-seviyesi statü yok (stok/fiyat) ya da bilinmeyen değer → kalem bazlı karar
        const allDecisive = itemStatuses.every(s => s !== undefined && (TERMINAL_OK.has(s) || TERMINAL_FAIL.has(s)));
        if (allDecisive) return { done: true, items };

        return { done: false, items, note: `belirsiz durum (batch='${batchStatus ?? 'yok'}', kalem statüleri: ${Array.from(new Set(itemStatuses.map(s => s ?? 'yok'))).join(',')})` };
    }

    /**
     * Kalem sonuçlarını dahili sonuca çevirir. `contentBarcodes` (contentId → barkodlar): content-bulk-update
     * sonuçları barkod yerine `contentId` taşır; her barkod için ayrı sonuç üretilir.
     * SUCCESS → (TRANSFER: WAITING (onay bekler) | diğer: COMPLETED); FAILED/FAILURE/ERROR → FAILED;
     * BİLİNMEYEN → FAILED (açıklamalı) — asla sessizce COMPLETED değil.
     */
    public toInternalBatchResult(items: any[], type: string, contentBarcodes?: Map<string, string[]>): IInternalResult[] {
        const out: IInternalResult[] = [];
        for (const element of items) {
            const s = upper(element?.status);
            let status: IInternalResult['status'];
            let messages: string[] = this.normalizeFailureReasons(element?.failureReasons);
            if (s && TERMINAL_OK.has(s)) status = type === 'TRANSFER' ? 'WAITING' : 'COMPLETED';
            else if (s && TERMINAL_FAIL.has(s)) status = 'FAILED';
            else {
                status = 'FAILED';
                messages = [`Trendyol kalem durumu belirsiz/bilinmiyor ('${s ?? 'yok'}'); işlem onaylanmadı.`, ...messages];
            }

            const req = element?.requestItem || {};
            const barcode = req.barcode ?? element?.barcode;
            if (barcode !== undefined && barcode !== null && String(barcode) !== '') {
                out.push({ matchValue: String(barcode), barcode: String(barcode), status, messages });
                continue;
            }
            const contentId = req.contentId ?? element?.contentId;
            if (contentId !== undefined && contentId !== null) {
                const barcodes = contentBarcodes?.get(String(contentId));
                if (barcodes && barcodes.length > 0) {
                    for (const b of barcodes) out.push({ matchValue: b, barcode: b, status, messages });
                    continue;
                }
                // barkod çözülemedi: eşleşmeyen bir kayıt olarak döner (Sentinel yok sayar; zaman aşımı görünür mesaj üretir)
                out.push({ matchValue: `content:${contentId}`, barcode: undefined, status, messages: [`contentId ${contentId} barkoda eşlenemedi.`, ...messages] });
                continue;
            }
            out.push({ matchValue: '', barcode: undefined, status, messages });
        }
        return out;
    }

    /** `failureReasons` dizisini (string ya da nesne) kullanıcıya gösterilebilir metinlere çevirir. */
    private normalizeFailureReasons(reasons: any): string[] {
        if (!Array.isArray(reasons)) return typeof reasons === 'string' && reasons ? [reasons] : [];
        return reasons.map((r: any) => typeof r === 'string' ? r : (r?.message ?? r?.reason ?? r?.description ?? JSON.stringify(r))).filter(Boolean);
    }

    /** Sonuç kalemlerinden barkodu olmayan `contentId`'leri döner (barkoda çözülecek). */
    public collectUnresolvedContentIds(items: any[]): string[] {
        const ids = new Set<string>();
        for (const el of items) {
            const req = el?.requestItem || {};
            const barcode = req.barcode ?? el?.barcode;
            const contentId = req.contentId ?? el?.contentId;
            if ((barcode === undefined || barcode === null || String(barcode) === '') && contentId !== undefined && contentId !== null) ids.add(String(contentId));
        }
        return Array.from(ids);
    }

    public toInternalStatusResult(content: any[]): IInternalResult[] {
        return content.map((p: any) => ({
            matchValue: p.barcode,
            barcode: p.barcode,
            mapping: {
                id: p.id,
                productContentId: p.productContentId ?? p.contentId,
                platformListingId: p.platformListingId,
                returningAddressId: p.returningAddressId,
                shipmentAddressId: p.shipmentAddressId,
                brandId: p.brandId,
                pimCategoryId: p.pimCategoryId
            },
            status: p.rejected ? 'FAILED' : (p.approved ? 'COMPLETED' : 'WAITING'),
            messages: p.rejectReasonDetails?.map((r: any) => `${r.rejectReason}: ${r.rejectReasonDetail}`) || []
        }));
    }

    /**
     * [WP9] Özellik yükü (V2 `attributes[]`): `{attributeId:int, attributeValueId:int}` YA DA `{attributeId:int, customAttributeValue:str}`
     * (birbirini dışlar; API_CONTRACTS Trendyol §1). Kural özeti:
     *  - Boş/`undefined`/`null` değerli kayıtlar YOK sayılır (zorunluysa aşağıda eksik olarak raporlanır).
     *  - Kategoride olmayan özellik (kategori değişince kalan bayat kayıt) GÖNDERİLMEZ (Trendyol tüm kalemi reddederdi).
     *  - Listeden seçilmiş (geçerli) değer kimliği HER ZAMAN kimlikle gider (allowCustom olsa bile); kimlik listede yoksa
     *    (silinmiş/bayat) metinle eşleşen liste değerine çevrilir, olmazsa allowCustom ise serbest metne düşer, aksi halde HATA.
     *  - Kimliksiz metin: allowCustom -> customAttributeValue; değilse listede metinle aranır (bulunamazsa HATA;
     *    değer listesi hiç yüklenmemişse eski davranış: customAttributeValue).
     *  - Zorunlu kategori özelliği eksikse HATA (alan bazlı). Onaylı içerik güncellemesinde slicer/varianter hariç tutulur ve
     *    zorunluluk yalnız öznitelik gönderiliyorsa denetlenir.
     * Not: veri modeli özellik başına TEK değer tutar; çoklu değer (`multiple`) bugün temsil edilemez (rapor: WP9 P1).
     */
    private prepareAttributes(variant: any, catAttrs: any[], opts: { excludeVariantDefining?: boolean } = {}): { attributes: any[]; errors: string[] } {
        const vAttrs: Record<string, any> = variant.platforms?.[integrationCode]?.attributes || {};
        const { byId } = indexCategoryAttributes(catAttrs);
        const haveCategory = byId.size > 0;
        const attributes: any[] = [];
        const errors: string[] = [];
        const sent = new Set<string>();

        for (const [rawId, attrData] of Object.entries(vAttrs)) {
            const attrId = String(rawId).trim();
            if (!/^\d+$/.test(attrId)) { errors.push(`özellik kimliği geçersiz: '${attrId.slice(0, 30)}'`); continue; }
            const catAttr = haveCategory ? byId.get(attrId) : undefined;
            if (haveCategory && !catAttr) continue; // bayat (kategori değişti): gönderme
            // [C22] Onaylı içerik güncellemesinde slicer/varianter öznitelikleri değiştirilemez → hariç tut
            if (opts.excludeVariantDefining && (catAttr?.varianter || catAttr?.slicer)) continue;

            const norm = normalizeAttrValue(attrData);
            if (!norm) continue;
            const name = catAttr?.title ?? (typeof attrData === 'object' ? attrData?.attributeName : undefined);
            const label = labelAttribute(attrId, name);
            const allowCustom = catAttr?.allowCustom === true;
            const hasList = !!catAttr?.values && catAttr.values.length > 0;
            const numericId = norm.valueId !== undefined && /^\d+$/.test(norm.valueId) ? norm.valueId : undefined;

            let out: any;
            if (numericId !== undefined && (!hasList || findValueById(catAttr, numericId))) {
                out = { attributeId: Number(attrId), attributeValueId: Number(numericId) };
            } else {
                const byText = norm.text !== undefined && hasList ? findValueByText(catAttr, norm.text) : undefined;
                if (byText && /^\d+$/.test(String(byText.id))) {
                    out = { attributeId: Number(attrId), attributeValueId: Number(byText.id) };
                } else if (norm.text !== undefined && (allowCustom || !hasList)) {
                    out = { attributeId: Number(attrId), customAttributeValue: norm.text };
                } else {
                    errors.push(`${label}: '${String(norm.text ?? norm.valueId).slice(0, 40)}' değeri Trendyol değer listesinde yok (silinmiş olabilir) — özelliği yeniden seçin`);
                    continue;
                }
            }
            attributes.push(out);
            sent.add(attrId);
        }

        if (haveCategory && (!opts.excludeVariantDefining || attributes.length > 0)) {
            const missing = missingRequiredAttributes(catAttrs, sent, opts.excludeVariantDefining ? (c => !!(c.varianter || c.slicer)) : undefined);
            if (missing.length > 0) errors.push(`zorunlu özellik eksik: ${missing.map(c => labelAttribute(String(c._id), c.title)).join(', ')}`);
        }
        return { attributes, errors };
    }

    private getRawAttributesMap(attrs: any[]) {
        const map: any = {};
        attrs?.forEach(a => map[String(a.attributeId)] = {
            attributeName: a.attributeName,
            attributeValue: a.attributeValue,
            attributeValueId: String(a.attributeValueId)
        });
        return map;
    }
}
