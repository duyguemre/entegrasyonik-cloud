/**
 * [eslesme-fiyat WP1, D-VAL-1/D-VAL-2] Kanala gönderim öncesi YEREL hazırlık denetimi (saf; DB/ağ yok).
 *
 * Tek kaynak: Validator gerçek gönderimde, `preflightExport` kuru çalıştırmada AYNI fonksiyonu kullanır.
 * Yalnız resmi dokümanda geçen sınırlar kodlanır (03-uyumluluk-analizi §2.1); bilinmeyen kanal → yalnız genel denetimler.
 * Fiyat denetimi yalnız dönüştürücüsü aynı kuralı uygulayan kanallarda (TY/HB/PZ: "Fiyat geçersiz", "Satış > Liste").
 */
import { PLATFORM_PROCESS } from '@interfaces/index';
import { IntegrationIssue, makeIssue } from '@platform/core/errors/integrationIssues';

export interface ChannelRules {
    barcodeMax?: number;
    /** Barkodda izinli karakterler (boşluklar kanal tarafından silindiği için önce atılır). */
    barcodePattern?: RegExp;
    stockcodeMax?: number;
    maincodeMax?: number;
    titleMax?: number;
    imagesMax?: number;
    imagesHttps?: boolean;
    vatRates?: readonly number[];
    /** Dönüştürücüsü aynı fiyat kuralını uygulayan kanallar (TY/HB/PZ): fiyat sorunu burada erken yakalanır. */
    priceRequired?: boolean;
}

export const CHANNEL_RULES: Readonly<Record<string, ChannelRules>> = {
    // Trendyol ürün V2: barcode ≤40 (`. - _`), title ≤100, productMainId ≤40, stockCode ≤100, images ≤8 HTTPS, vatRate 0/1/10/20.
    trendyol: { barcodeMax: 40, barcodePattern: /^[A-Za-z0-9._-]+$/, stockcodeMax: 100, maincodeMax: 40, titleMax: 100, imagesMax: 8, imagesHttps: true, vatRates: [0, 1, 10, 20], priceRequired: true },
    // Hepsiburada katalog: Image1..Image10.
    hepsiburada: { imagesMax: 10, priceRequired: true },
    pazarama: { priceRequired: true },
    // N11: stockCode ≤255.
    n11: { stockcodeMax: 255 },
};

/** İçerik (başlık/görsel/kod) gönderen modlar; fiyat/stok güncellemesinde içerik denetlenmez. */
const CONTENT_MODES: ReadonlySet<string> = new Set([PLATFORM_PROCESS.TRANSFER, PLATFORM_PROCESS.UPDATE, PLATFORM_PROCESS.UPDATE_VARIANT]);

export interface ReadinessInput {
    variant: any;
    product: any;
    integrationCode: string;
    mode: PLATFORM_PROCESS | string;
}

const imageUrl = (img: any): string => (typeof img === 'string' ? img : typeof img?.url === 'string' ? img.url : '');
const len = (v: unknown) => (v === undefined || v === null ? 0 : String(v).length);

export function checkChannelReadiness({ variant, product, integrationCode, mode }: ReadinessInput): IntegrationIssue[] {
    const issues: IntegrationIssue[] = [];
    const rules = CHANNEL_RULES[integrationCode] || {};
    const ctx = { integrationCode, productId: product?._id ?? variant?.productId, variantId: variant?._id, barcode: variant?.barcode };
    const vMapping = variant?.platforms?.[integrationCode]?.mapping;

    // Genel (her mod): eski Validator kuralları — sıra ve metin korunur (ilk hata eski errorMessage'dır).
    if (!product?.category) issues.push(makeIssue('PRODUCT_CATEGORY_MISSING', { ...ctx, field: 'category' }));
    if (!product?.brand) issues.push(makeIssue('PRODUCT_BRAND_MISSING', { ...ctx, field: 'brand' }));

    if (rules.priceRequired && mode !== PLATFORM_PROCESS.UPDATE_STOCK) {
        const vPrice = variant?.platforms?.[integrationCode]?.prices || variant?.prices || {};
        const sale = Number(vPrice.salePrice);
        const market = Number(vPrice.marketPrice || vPrice.salePrice);
        if (!Number.isFinite(sale) || sale <= 0) issues.push(makeIssue('PRICE_INVALID', { ...ctx, field: 'prices.salePrice' }));
        else if (Number.isFinite(market) && sale > market) issues.push(makeIssue('PRICE_ABOVE_LIST', { ...ctx, field: 'prices.marketPrice' }));
    }

    if (!CONTENT_MODES.has(mode)) return issues;

    const barcode = variant?.barcode === undefined || variant?.barcode === null ? '' : String(variant.barcode).replace(/\s+/g, '');
    if (!barcode) issues.push(makeIssue('BARCODE_MISSING', { ...ctx, field: 'barcode' }));
    else {
        if (rules.barcodeMax && barcode.length > rules.barcodeMax) issues.push(makeIssue('BARCODE_INVALID', { ...ctx, field: 'barcode', params: { detail: `en çok ${rules.barcodeMax} karakter (${barcode.length})` } }));
        else if (rules.barcodePattern && !rules.barcodePattern.test(barcode)) issues.push(makeIssue('BARCODE_INVALID', { ...ctx, field: 'barcode', params: { detail: 'yalnız harf, rakam ve . - _ kullanılabilir' } }));
    }
    if (rules.stockcodeMax && len(variant?.stockcode) > rules.stockcodeMax) issues.push(makeIssue('STOCKCODE_INVALID', { ...ctx, field: 'stockcode', params: { detail: `en çok ${rules.stockcodeMax} karakter (${len(variant.stockcode)})` } }));
    if (rules.maincodeMax && len(variant?.maincode) > rules.maincodeMax) issues.push(makeIssue('STOCKCODE_INVALID', { ...ctx, field: 'maincode', params: { detail: `model kodu en çok ${rules.maincodeMax} karakter (${len(variant.maincode)})` } }));

    const title = vMapping?.title || product?.title;
    if (rules.titleMax && len(title) > rules.titleMax) issues.push(makeIssue('TITLE_TOO_LONG', { ...ctx, field: 'title', params: { max: rules.titleMax, length: len(title) } }));

    const images: string[] = (Array.isArray(variant?.images) ? variant.images : []).map(imageUrl).filter(Boolean);
    if (rules.imagesMax && mode === PLATFORM_PROCESS.TRANSFER && images.length === 0) issues.push(makeIssue('IMAGE_MISSING', { ...ctx, field: 'images' }));
    if (rules.imagesMax && images.length > rules.imagesMax) issues.push(makeIssue('IMAGE_TOO_MANY', { ...ctx, field: 'images', params: { max: rules.imagesMax, count: images.length } }));
    // Yalnız açıkça `http://` olanlar işaretlenir (depolama anahtarı gibi URL olmayan değerler dönüştürücüde çözülür).
    const insecure = rules.imagesHttps ? images.filter((u) => /^http:\/\//i.test(u)).length : 0;
    if (insecure > 0) issues.push(makeIssue('IMAGE_NOT_HTTPS', { ...ctx, field: 'images', params: { count: insecure } }));

    if (rules.vatRates) {
        const raw = [vMapping?.taxPercentage, product?.taxPercentage].find((v) => v !== undefined && v !== null && v !== '');
        if (raw !== undefined && !rules.vatRates.includes(Number(raw))) issues.push(makeIssue('VAT_INVALID', { ...ctx, field: 'taxPercentage' }));
    }
    return issues;
}
