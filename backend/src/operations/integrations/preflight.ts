/**
 * [eslesme-fiyat WP1, PLAN §3.3] Gönderim öncesi ön kontrol (preflight) ve "bu neden böyle" (explain). SALT OKUMA.
 *
 * - `preflightExport`: ürün × kanal için Validator'ın KULLANDIĞI AYNI denetim (`checkChannelReadiness`) + eşleme kontrolü
 *   (kategori/marka) + `AttributeResolver` kuru çalıştırma (bellekte, DB'ye yazılmaz) + adaptör `validate` → `issues[]` ve
 *   `resolvedPreview` (gidecek kategori/marka/özellik/fiyat/KDV/görsel/stok).
 * - `explainChannelProduct`: alan → kaynak zinciri (kategori ← AttributeMappings kaydı, fiyat ← kanal fiyatı ya da ana fiyat, ...).
 *
 * Bağımlılıklar enjekte edilir (RPC cephesi ClientDB + IntegrationFactory ile kurar); bu modül DB/ağ bilmez → bellek-içi test edilir.
 * Fiyat zinciri (WP5): `effectiveChannelPrice` kaynağı + `channel` kuralı gerekçeleri + bekleyen (kanala gönderilmemiş) durum.
 */
import { PLATFORM_PROCESS } from '@interfaces/index';
import { IntegrationIssue, hasBlockingIssue, makeIssue } from '@platform/core/errors/integrationIssues';
import { checkChannelReadiness } from '@integration/catalog/preflight/readiness';
import { AttributeResolver, IAttributeResolverProvider } from '@integration/catalog/attributeResolver';
import { mapPlatformMessage } from '@integration/modules/common/errors/errorMap';
import { errorRulesFor } from '@integration/modules/common/errors/registry';
import { getIntegrationDescriptor } from '@integration/catalog/IntegrationDescriptorRegistry';
import { describeEffectivePrice, effectiveChannelPrice, effectiveListPrice } from '@platform/core/pricing/effectivePrice';

export const PREFLIGHT_MAX_VARIANTS = 200;

/** Marka KİMLİĞİ eşlemesi gereken kanal mı (K-C; tek kaynak descriptor `brandMapping === 'id'`: TY/PZ/IS). */
export const needsBrandId = (code: string) => getIntegrationDescriptor(code)?.brandMapping === 'id';

export interface ChannelMappingSource extends IAttributeResolverProvider {
    getAllAttributeMappings(): Promise<any[]>;
    getPlatformBrandId(localBrandId: string): Promise<string | number>;
    getLocalCategoryTitle(localCategoryId: string): Promise<string>;
    getLocalBrandTitle(localBrandId: string): Promise<string>;
}

export interface PreflightDeps {
    findVariants(q: { variantIds?: string[]; productIds?: string[] }, limit: number): Promise<any[]>;
    findProducts(productIds: string[]): Promise<any[]>;
    mappingSource(integrationCode: string): ChannelMappingSource;
    /** Adaptörün kendi `validate`'i. Kanal hesapta kurulu değilse fırlatır → INTEGRATION_NOT_CONFIGURED. */
    adapterValidate?(integrationCode: string, variant: any): Promise<{ result: boolean; reason?: string }>;
}

export interface PreflightInput {
    variantIds?: string[];
    productIds?: string[];
    integrationCodes: string[];
    mode?: PLATFORM_PROCESS | string;
}

const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v));
const imageCount = (variant: any) => (Array.isArray(variant?.images) ? variant.images.filter(Boolean).length : 0);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null));

function priceOf(variant: any, code: string) {
    // [eslesme-fiyat WP5] tek kaynak: kanal özel fiyatı (bayrak) → kanal kuralı → ana fiyat.
    const e = effectiveChannelPrice(variant, code);
    return {
        salePrice: e.salePrice, marketPrice: effectiveListPrice(e), origin: e.source,
        source: `variant.${e.field}`, ruleId: e.ruleId ?? null, ruleVersion: e.ruleVersion ?? null,
        describe: describeEffectivePrice(e), reasons: e.source === 'rule' ? (variant?.platforms?.[code]?.rulePrice?.reasons ?? []) : [],
        pending: variant?.pricePending?.[code] ?? null,
    };
}

function vatOf(variant: any, product: any, code: string) {
    const vMapping = variant?.platforms?.[code]?.mapping;
    if (vMapping?.taxPercentage !== undefined && vMapping?.taxPercentage !== null && vMapping?.taxPercentage !== '') return { value: Number(vMapping.taxPercentage), source: `variant.platforms.${code}.mapping.taxPercentage` };
    if (product?.taxPercentage !== undefined && product?.taxPercentage !== null) return { value: Number(product.taxPercentage), source: 'product.taxPercentage' };
    return { value: null, source: 'kanal ayarı / varsayılan' };
}

/** Tek ürün × kanal kuru çalıştırma (preflight ve explain'in ortak çekirdeği). */
async function evaluate(variant: any, product: any, code: string, mode: string, deps: PreflightDeps) {
    const ctx = { integrationCode: code, productId: product?._id ?? variant?.productId, variantId: variant?._id, barcode: variant?.barcode };
    const issues: IntegrationIssue[] = product ? [] : [makeIssue('PRODUCT_NOT_FOUND', ctx)];
    const source = deps.mappingSource(code);
    const work = clone(variant);
    if (product) work.product = product;

    const localCategoryId = str(product?.category);
    const localBrandId = str(product?.brand);
    let platformCategoryId: string | number | undefined;
    let platformBrandId: string | number | undefined;
    const attributes: { added: string[]; warnings: string[] } = { added: [], warnings: [] };

    if (product) {
        issues.push(...checkChannelReadiness({ variant, product, integrationCode: code, mode }));
        if (localCategoryId) {
            platformCategoryId = await source.getPlatformCategoryId(localCategoryId);
            if (platformCategoryId === undefined || platformCategoryId === null || String(platformCategoryId) === '') issues.push(makeIssue('MAP_CATEGORY_MISSING', { ...ctx, field: 'category' }));
        }
        if (localBrandId && needsBrandId(code)) {
            platformBrandId = variant?.platforms?.[code]?.mapping?.brandId ?? await source.getPlatformBrandId(localBrandId);
            if (platformBrandId === undefined || platformBrandId === null || String(platformBrandId) === '') issues.push(makeIssue('MAP_BRAND_MISSING', { ...ctx, field: 'brand' }));
        }
        if (localCategoryId) {
            try {
                const r = await new AttributeResolver(source, code).resolveInto(work, localCategoryId);
                attributes.added = r.added; attributes.warnings = r.warnings;
                for (const w of r.warnings) issues.push(makeIssue('MAP_ATTR_WARNING', { ...ctx, field: 'attributes', params: { detail: w } }));
            } catch (e: any) {
                issues.push(makeIssue('MAP_ATTR_WARNING', { ...ctx, field: 'attributes', params: { detail: `özellikler çözümlenemedi (${e?.message ?? 'bilinmeyen'})` } }));
            }
        }
        if (deps.adapterValidate && !hasBlockingIssue(issues)) {
            try {
                const v = await deps.adapterValidate(code, work);
                if (v && v.result === false) issues.push(mapPlatformMessage(v.reason || 'Platform kurallarına uymuyor.', ctx, errorRulesFor(code)));
            } catch (e: any) {
                issues.push(makeIssue('INTEGRATION_NOT_CONFIGURED', { ...ctx, platformMessage: e?.message }));
            }
        }
    }

    const vMapping = variant?.platforms?.[code]?.mapping;
    return {
        issues,
        preview: {
            category: { localId: localCategoryId ?? null, platformId: platformCategoryId ?? null },
            brand: { localId: localBrandId ?? null, platformId: platformBrandId ?? null, usesName: getIntegrationDescriptor(code)?.brandMapping === 'name' },
            attributes: work?.platforms?.[code]?.attributes ?? {},
            attributesFromMapping: attributes.added,
            title: vMapping?.title || product?.title || null,
            price: priceOf(variant, code),
            vatRate: vatOf(variant, product, code).value,
            imageCount: imageCount(variant),
            stock: typeof variant?.stock === 'number' ? variant.stock : null,
        },
        sources: { localCategoryId, platformCategoryId, localBrandId, platformBrandId, attributes, vMapping },
    };
}

export async function preflightExport(input: PreflightInput, deps: PreflightDeps) {
    const mode = String(input.mode || PLATFORM_PROCESS.TRANSFER);
    const codes = [...new Set(input.integrationCodes)];
    const variants = await deps.findVariants({ variantIds: input.variantIds, productIds: input.productIds }, PREFLIGHT_MAX_VARIANTS + 1);
    const truncated = variants.length > PREFLIGHT_MAX_VARIANTS;
    const list = variants.slice(0, PREFLIGHT_MAX_VARIANTS);
    const productIds = [...new Set(list.map((v) => str(v.productId)).filter(Boolean) as string[])];
    const products = new Map((await deps.findProducts(productIds)).map((p: any) => [String(p._id), p]));

    const summary: Record<string, { total: number; ready: number; blocked: number; withWarnings: number }> = {};
    for (const code of codes) summary[code] = { total: 0, ready: 0, blocked: 0, withWarnings: 0 };

    const items = [];
    for (const variant of list) {
        const product = products.get(String(variant.productId));
        const channels = [];
        for (const code of codes) {
            const r = await evaluate(variant, product, code, mode, deps);
            const blocked = hasBlockingIssue(r.issues);
            const s = summary[code];
            s.total++; if (blocked) s.blocked++; else s.ready++;
            if (r.issues.some((i) => i.severity === 'warning')) s.withWarnings++;
            channels.push({ integrationCode: code, ready: !blocked, issues: r.issues, resolvedPreview: r.preview });
        }
        items.push({ variantId: str(variant._id), productId: str(variant.productId), barcode: str(variant.barcode), title: product?.title ?? null, channels });
    }
    return { mode, generatedAt: new Date().toISOString(), truncated, limit: PREFLIGHT_MAX_VARIANTS, summary, items };
}

export interface ExplainField { field: string; value: unknown; source: string; chain: string[] }

/** "Bu neden böyle": tek ürün × kanal için alan → kaynak zinciri. Varyant yoksa `null`. */
export async function explainChannelProduct(input: { variantId: string; integrationCode: string }, deps: PreflightDeps) {
    const code = input.integrationCode;
    const [variant] = await deps.findVariants({ variantIds: [input.variantId] }, 1);
    if (!variant) return null;
    const [product] = await deps.findProducts([String(variant.productId)]);
    const r = await evaluate(variant, product, code, PLATFORM_PROCESS.TRANSFER, deps);
    const source = deps.mappingSource(code);
    const s = r.sources;
    const fields: ExplainField[] = [];

    if (s.localCategoryId) {
        const title = await source.getLocalCategoryTitle(s.localCategoryId);
        const rec = (await source.getAllAttributeMappings()).find((m: any) => m.integrationCode === code && m.isCategoryMapping === true && String(m.localCategoryId) === s.localCategoryId);
        const when = rec?.updatedAt ? ` (${new Date(rec.updatedAt).toISOString().slice(0, 10)}${rec.updatedBy ? `, ${rec.updatedBy}` : ''})` : '';
        fields.push({ field: 'category', value: s.platformCategoryId ?? null, source: rec ? 'AttributeMappings' : 'eşleme yok',
            chain: [`yerel kategori: ${title}`, rec ? `kanal kategorisi ${rec.platformCategoryName ?? s.platformCategoryId} ← AttributeMappings${when}` : 'kategori eşlemesi yapılmamış'] });
    }
    if (s.localBrandId) {
        const title = await source.getLocalBrandTitle(s.localBrandId);
        const chain = [`yerel marka: ${title}`];
        const brandMode = getIntegrationDescriptor(code)?.brandMapping;
        if (brandMode === 'name') chain.push('marka ADI gönderilir (Brands.title)');
        else if (brandMode === 'attribute') chain.push('marka kategori özelliği olarak gider ("Marka")');
        else if (brandMode === 'id') chain.push(s.vMapping?.brandId ? `kanal marka kimliği ← ürün kanal formu (variant.platforms.${code}.mapping.brandId)` : s.platformBrandId ? `kanal marka kimliği ${s.platformBrandId} ← Brands.platforms.${code}` : 'marka eşlemesi yapılmamış');
        else chain.push('kanal marka eşlemesi kullanmaz');
        fields.push({ field: 'brand', value: s.platformBrandId ?? (brandMode === 'name' ? title : null), source: chain[1], chain });
    }
    const price = r.preview.price;
    fields.push({ field: 'price', value: price.salePrice, source: price.source,
        chain: [price.describe, ...price.reasons.map((x: string) => `kural: ${x}`), `liste fiyatı: ${price.marketPrice ?? '-'}`,
            ...(price.pending ? [`kanala gönderilmedi (bekliyor, ${price.pending.reason ?? 'değişiklik'})`] : [])] });
    const vat = vatOf(variant, product, code);
    fields.push({ field: 'vatRate', value: vat.value, source: vat.source, chain: [`KDV ← ${vat.source}`] });
    fields.push({ field: 'title', value: r.preview.title, source: s.vMapping?.title ? `variant.platforms.${code}.mapping.title` : 'product.title', chain: [s.vMapping?.title ? 'kanala özel başlık' : 'ürün başlığı'] });
    const existing = Object.keys(variant?.platforms?.[code]?.attributes ?? {});
    fields.push({ field: 'attributes', value: r.preview.attributes, source: 'variant.platforms + AttributeMappings',
        chain: [`kanal formunda girilen: ${existing.length}`, `eşlemeden çözülen: ${s.attributes.added.length}${s.attributes.added.length ? ` (${s.attributes.added.join(', ')})` : ''}`] });
    const sync = variant?.platforms?.[code]?.stockSync;
    fields.push({ field: 'stock', value: r.preview.stock, source: 'variant.stock', chain: [`yerel stok: ${r.preview.stock ?? '-'}`, sync?.lastPublishedQty !== undefined ? `son yayınlanan: ${sync.lastPublishedQty}` : 'henüz yayınlanmadı'] });

    const upload = variant?.platforms?.[code]?.upload ?? {};
    const lastUpload = Object.fromEntries(Object.entries(upload).map(([m, u]: [string, any]) => [m, { status: u?.status ?? null, updatedAt: u?.updatedAt ?? null, issues: Array.isArray(u?.issues) ? u.issues : [] }]));
    return { variantId: str(variant._id), integrationCode: code, ready: !hasBlockingIssue(r.issues), issues: r.issues, fields, lastUpload };
}
