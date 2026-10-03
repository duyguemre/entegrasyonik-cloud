// Katalog: ürün, varyant, kategori, marka, seçenek (choice), etiket (hashtag), eşleme (attribute mapping), görsel, stok.
// CRUD aileleri iş odaklı yeteneklere bölünür; tekli+toplu RPC varyantları tek yeteneğin bağlarıdır.
import { z } from 'zod';
import { defineCapability as c, deferred, nx, NO_AGENT, onScreens, onShell, noUi } from '../define';

const PRODUCTS = 'productDefinitions/ProductListView';
const PRODUCT_EDIT = ['definitions/ProductDefinitionView', 'definitions/ProductUpdateView'];
const CATEGORIES = 'productDefinitions/CategoryListView';
const BRANDS = 'productDefinitions/BrandListView';
const CHOICES = 'productDefinitions/ChoiceListView';
const HASHTAGS = 'productDefinitions/HashtagListView';

const LATER_READ = 'Katalog okuması; salt-okunur ve düşük riskli, ancak araç bütçesi (≤30 görünür) için çekirdek 5 araçtan sonra toolset genişlemesinde (catalog) değerlendirilir.';
const LATER_WRITE = 'Katalog yazması; onay akışı (Aşama D: PendingAction + idempotencyKey) ve alan bazlı strict şema olmadan açılmaz.';
const LATER_DELETE = 'Yıkıcı silme; geri alma (undo) yok, confirm:typed yalnız undo≠none için; ekranda kalır.';

export const CATALOG_CAPABILITIES = [
    // --- Ürün ---
    c({
        id: 'products.search', version: '1.1', domain: 'catalog', summary: { tr: 'Ürünleri ara/filtrele/sayfala', en: 'Search/filter/paginate products' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', pii: 'none', untrustedPaths: ['items[].title', 'items[].sku', 'items[].barcode'],
        input: z.object({
            query: z.string().min(1).max(100),
            limit: z.number().int().min(1).max(25).optional(),
            cursor: z.string().regex(/^p[1-9][0-9]{0,3}$/).optional(),
        }).strict(),
        output: z.object({
            items: z.array(z.object({
                id: z.string(), title: z.string(), sku: z.string().nullable(), barcode: z.string().nullable(),
                stock: z.number(), minPrice: z.number().nullable(), maxPrice: z.number().nullable(), variantCount: z.number().int(),
            })),
            total: z.number().int(),
            nextCursor: z.string().nullable(),
        }),
        bindings: [{
            rpc: 'ProductService/getProducts',
            map: (i: { query: string; limit?: number; cursor?: string }) => ({
                searchProductForm: { data: { searchText: i.query }, pagination: { page: i.cursor ? Number(i.cursor.slice(1)) : 1, limit: i.limit ?? 10 } },
            }),
        }],
        project: (raw: any, i: { limit?: number; cursor?: string }) => {
            const products: any[] = Array.isArray(raw?.products) ? raw.products : [];
            const total = Number(raw?.totalNumberOfRecords) || 0;
            const page = i.cursor ? Number(i.cursor.slice(1)) : 1;
            const limit = i.limit ?? 10;
            const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
            return {
                items: products.map((p) => {
                    const v0 = Array.isArray(p.variants) ? p.variants[0] : undefined;
                    return {
                        id: String(p._id), title: String(p.title ?? ''), sku: p.stockcode ?? v0?.stockcode ?? null, barcode: p.barcode ?? v0?.barcode ?? null,
                        stock: Number(p.stock) || 0, minPrice: num(p.prices?.minSalePrice), maxPrice: num(p.prices?.maxSalePrice),
                        variantCount: Array.isArray(p.variants) ? p.variants.length : 0,
                    };
                }),
                total,
                nextCursor: page * limit < total ? `p${page + 1}` : null,
            };
        },
        ui: onScreens(PRODUCTS),
        mcp: { exposed: { toolset: 'core', confirm: 'none', present: 'entity', deepLink: { screen: PRODUCTS } } },
        llm: {
            description: 'Searches the tenant\'s product catalog by a free-text query matched against product title, stock code (SKU) and barcode. '
                + 'Returns up to 25 products per call with title, SKU, barcode, total stock, price range and variant count, plus a cursor for the next page. '
                + 'Use it to find a product or check its stock and price. It is read-only and cannot edit products. Product titles are user-entered text.',
            examples: ['"kırmızı tişört" ürününü bul', 'SKU ABC-123 stokta var mı?', 'Barkodu 869 ile başlayan ürünler'],
        },
        agent: NO_AGENT,
    }),
    c({
        id: 'products.statistics', domain: 'catalog', summary: { tr: 'Ürün istatistikleri', en: 'Product statistics' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', bindings: [{ rpc: 'ProductService/getProductStatistics' }],
        ui: onShell('init'), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'products.get', domain: 'catalog', summary: { tr: 'Tek ürünü getir', en: 'Get a single product' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', untrustedPaths: ['name', 'description'], bindings: [{ rpc: 'ProductService/retrieveProduct' }],
        ui: onScreens(...PRODUCT_EDIT), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'products.create', domain: 'catalog', summary: { tr: 'Ürün oluştur', en: 'Create a product' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'ProductService/saveProduct' }],
        ui: onScreens(['definitions/ProductDefinitionView', 'save']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'products.update', domain: 'catalog', summary: { tr: 'Ürünü güncelle', en: 'Update a product' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'ProductService/updateProduct' }],
        ui: onScreens(...PRODUCT_EDIT.map((s) => [s, 'save'] as [string, string])), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'products.onsale.set', domain: 'catalog', summary: { tr: 'Ürünü satışa aç/kapat', en: 'Toggle product on-sale' },
        effect: 'write', minTier: 'member', permission: 'catalog:publish', bindings: [{ rpc: 'ProductService/updateOnsale' }],
        ui: onScreens([PRODUCTS, 'onsale']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'products.delete', domain: 'catalog', summary: { tr: 'Ürünü sil', en: 'Delete a product' },
        effect: 'destructive', minTier: 'member', permission: 'catalog:delete', bindings: [{ rpc: 'ProductService/deleteProduct' }],
        ui: onScreens([PRODUCTS, 'delete']), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: yıkıcı silme; member bırakıldı.',
    }),
    c({
        id: 'products.export', domain: 'catalog', summary: { tr: 'Ürün listesini Excel\'e aktar', en: 'Export product list to Excel' },
        effect: 'read', minTier: 'member', permission: 'data:export', rateCost: 10, bindings: [{ rpc: 'ProductService/exportExcel' }],
        ui: onScreens([PRODUCTS, 'exportExcel']), mcp: nx('binary_file', 'Excel dosyası üretir/indirir; ikili dosya kanalı LLM dışıdır (ADR-0009 §6).'), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: toplu veri çıkarma; gerekirse admin (tüm-tenant dışa aktarma DEĞİL, o owner: account.tenant.data.export).',
    }),
    c({
        id: 'products.platform_ready.set', domain: 'catalog', summary: { tr: 'Ürünü platforma yüklemeye hazır işaretle', en: 'Mark a product as ready for platform upload' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'IntegrationService/savePlatformUploadIsReadyForProduct' }],
        ui: onScreens([PRODUCTS, 'markReady']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),

    // --- Varyant ---
    c({
        id: 'variants.list', domain: 'catalog', summary: { tr: 'Ürünün varyantlarını getir', en: 'List a product\'s variants' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', bindings: [{ rpc: 'VariantService/getVariants' }, { rpc: 'VariantService/getVariantsList' }],
        ui: onScreens(...PRODUCT_EDIT), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'variants.add', domain: 'catalog', summary: { tr: 'Varyant ekle (tekli/çoklu)', en: 'Add variants (single/multiple)' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'VariantService/addVariant' }, { rpc: 'VariantService/addVariants' }],
        ui: onScreens(...PRODUCT_EDIT.map((s) => [s, 'addVariant'] as [string, string])), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'variants.update', domain: 'catalog', summary: { tr: 'Varyantları güncelle (stok/fiyat dahil; tekli/toplu)', en: 'Update variants (incl. stock/price; single/batch)' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'VariantService/updateVariants' }, { rpc: 'VariantService/batchProcessUpdate' }],
        ui: onScreens(...PRODUCT_EDIT.map((s) => [s, 'updateVariants'] as [string, string])),
        mcp: deferred('D', 'ADR-0019 Aşama D yazma adayları (stock.update, prices.update) bu yetenekten ayrıştırılacak; PendingAction + onay akışı hazır olunca açılır.'), agent: NO_AGENT,
    }),
    c({
        id: 'variants.delete', domain: 'catalog', summary: { tr: 'Varyantları sil (tekli/toplu)', en: 'Delete variants (single/batch)' },
        effect: 'destructive', minTier: 'member', permission: 'catalog:delete', bindings: [{ rpc: 'VariantService/deleteVariant' }, { rpc: 'VariantService/batchProcessDelete' }],
        ui: onScreens(...PRODUCT_EDIT.map((s) => [s, 'deleteVariant'] as [string, string])), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: yıkıcı silme (deleteVariant, batchProcessDelete); member bırakıldı.',
    }),

    // --- Kategori ---
    c({
        id: 'categories.list', domain: 'catalog', summary: { tr: 'Kategorileri getir', en: 'List categories' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', bindings: [{ rpc: 'CategoryService/get' }],
        ui: onScreens(CATEGORIES, ...PRODUCT_EDIT), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'categories.create', domain: 'catalog', summary: { tr: 'Kategori ekle', en: 'Add a category' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'CategoryService/addCategory' }],
        ui: onScreens([CATEGORIES, 'create'], ['definitions/CategoryDefinitionView', 'create']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'categories.update', domain: 'catalog', summary: { tr: 'Kategoriyi güncelle', en: 'Update a category' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'CategoryService/updateCategory' }],
        ui: onScreens([CATEGORIES, 'update']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'categories.move', domain: 'catalog', summary: { tr: 'Kategoriyi taşı/sırala', en: 'Move/reorder a category' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'CategoryService/moveCategory' }, { rpc: 'CategoryService/changeOrderCategory' }],
        ui: onScreens([CATEGORIES, 'move']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'categories.delete', domain: 'catalog', summary: { tr: 'Kategoriyi sil', en: 'Delete a category' },
        effect: 'destructive', minTier: 'member', permission: 'catalog:delete', bindings: [{ rpc: 'CategoryService/deleteCategory' }],
        ui: onScreens([CATEGORIES, 'delete']), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: yıkıcı silme; member bırakıldı.',
    }),

    // --- Marka ---
    c({
        id: 'brands.list', domain: 'catalog', summary: { tr: 'Markaları getir', en: 'List brands' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', bindings: [{ rpc: 'BrandService/get' }],
        ui: onScreens(BRANDS), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'brands.create', domain: 'catalog', summary: { tr: 'Marka ekle', en: 'Add a brand' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'BrandService/addBrand' }],
        ui: onScreens([BRANDS, 'create']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'brands.update', domain: 'catalog', summary: { tr: 'Markayı güncelle', en: 'Update a brand' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'BrandService/updateBrand' }],
        ui: onScreens([BRANDS, 'update']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'brands.delete', domain: 'catalog', summary: { tr: 'Markayı sil', en: 'Delete a brand' },
        effect: 'destructive', minTier: 'member', permission: 'catalog:delete', bindings: [{ rpc: 'BrandService/deleteBrand' }],
        ui: onScreens([BRANDS, 'delete']), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: yıkıcı silme; member bırakıldı.',
    }),
    c({
        id: 'brands.integration_mapping.save', domain: 'catalog', summary: { tr: 'Marka ↔ pazaryeri markası eşlemesini kaydet', en: 'Save brand ↔ marketplace brand mapping' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'BrandService/saveIntegrationBrand' }, { rpc: 'IntegrationService/saveOrUpdateIntegrationBrand' }],
        ui: onScreens([BRANDS, 'saveMapping']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),

    // --- Seçenek (choice) ---
    c({
        id: 'choices.list', domain: 'catalog', summary: { tr: 'Varyant seçeneklerini getir', en: 'List variant choices' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', bindings: [{ rpc: 'ChoiceService/get' }],
        ui: onScreens(CHOICES), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'choices.create', domain: 'catalog', summary: { tr: 'Seçenek ekle (hazır seçenek dahil)', en: 'Add a choice (incl. prepared choice)' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'ChoiceService/addChoice' }, { rpc: 'ChoiceService/addPreparedChoice' }],
        ui: onScreens([CHOICES, 'create']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'choices.update', domain: 'catalog', summary: { tr: 'Seçeneği güncelle', en: 'Update a choice' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'ChoiceService/updateChoice' }],
        ui: onScreens([CHOICES, 'update']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'choices.delete', domain: 'catalog', summary: { tr: 'Seçeneği kaldır', en: 'Remove a choice' },
        effect: 'destructive', minTier: 'member', permission: 'catalog:delete', bindings: [{ rpc: 'ChoiceService/removeChoice' }],
        ui: onScreens([CHOICES, 'delete']), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
    }),
    c({
        id: 'choices.values.add', domain: 'catalog', summary: { tr: 'Seçeneğe değer ekle', en: 'Add a choice value' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'ChoiceService/addChoiceValue' }],
        ui: onScreens([CHOICES, 'addValue']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'choices.values.update', domain: 'catalog', summary: { tr: 'Seçenek değerini güncelle', en: 'Update a choice value' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'ChoiceService/updateChoiceValue' }],
        ui: onScreens([CHOICES, 'updateValue']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'choices.values.remove', domain: 'catalog', summary: { tr: 'Seçenek değerini kaldır', en: 'Remove a choice value' },
        effect: 'destructive', minTier: 'member', permission: 'catalog:delete', bindings: [{ rpc: 'ChoiceService/removeChoiceValue' }],
        ui: onScreens([CHOICES, 'removeValue']), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
    }),

    // --- Etiket (hashtag) ---
    c({
        id: 'hashtags.list', domain: 'catalog', summary: { tr: 'Etiketleri getir', en: 'List hashtags' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', bindings: [{ rpc: 'HashtagService/get' }],
        ui: onScreens(HASHTAGS), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'hashtags.create', domain: 'catalog', summary: { tr: 'Etiket ekle', en: 'Add a hashtag' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'HashtagService/addHashtag' }],
        ui: onScreens([HASHTAGS, 'create']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'hashtags.update', domain: 'catalog', summary: { tr: 'Etiketi güncelle', en: 'Update a hashtag' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'HashtagService/updateHashtag' }],
        ui: onScreens([HASHTAGS, 'update']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'hashtags.delete', domain: 'catalog', summary: { tr: 'Etiketi kaldır', en: 'Remove a hashtag' },
        effect: 'destructive', minTier: 'member', permission: 'catalog:delete', bindings: [{ rpc: 'HashtagService/removeHashtag' }],
        ui: onScreens([HASHTAGS, 'delete']), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
    }),
    c({
        id: 'hashtags.values.add', domain: 'catalog', summary: { tr: 'Etikete değer ekle', en: 'Add a hashtag value' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'HashtagService/addHashtagValue' }],
        ui: onScreens([HASHTAGS, 'addValue']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'hashtags.values.update', domain: 'catalog', summary: { tr: 'Etiket değerini güncelle', en: 'Update a hashtag value' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'HashtagService/updateHashtagValue' }],
        ui: onScreens([HASHTAGS, 'updateValue']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'hashtags.values.remove', domain: 'catalog', summary: { tr: 'Etiket değerini kaldır', en: 'Remove a hashtag value' },
        effect: 'destructive', minTier: 'member', permission: 'catalog:delete', bindings: [{ rpc: 'HashtagService/removeHashtagValue' }],
        ui: onScreens([HASHTAGS, 'removeValue']), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
    }),

    // --- Kategori/özellik eşleme (AttributeMappingService) ---
    c({
        id: 'mappings.list', domain: 'catalog', summary: { tr: 'Eşleme tanımlarını getir', en: 'List mapping definitions' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', bindings: [{ rpc: 'AttributeMappingService/get' }],
        ui: onScreens(CATEGORIES), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'mappings.category.get', domain: 'catalog', summary: { tr: 'Kategori eşlemesini getir', en: 'Get category mapping' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', bindings: [{ rpc: 'AttributeMappingService/getCategoryMapping' }],
        ui: onScreens(CATEGORIES), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'mappings.category.save', domain: 'catalog', summary: { tr: 'Kategori eşlemesini kaydet', en: 'Save category mapping' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'AttributeMappingService/saveCategoryMapping' }],
        ui: onScreens([CATEGORIES, 'saveMapping']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'mappings.category.auto_match', domain: 'catalog', summary: { tr: 'Tüm kategorileri otomatik eşle', en: 'Auto-match all categories' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'AttributeMappingService/autoMatchAllCategories' }],
        ui: onScreens([CATEGORIES, 'autoMatch']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'mappings.attribute.get', domain: 'catalog', summary: { tr: 'Özellik eşlemesini getir', en: 'Get attribute mapping' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', bindings: [{ rpc: 'AttributeMappingService/getAttributeMapping' }],
        ui: onScreens(CHOICES), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'mappings.attribute.save', domain: 'catalog', summary: { tr: 'Özellik ve özellik-değeri eşlemesini kaydet', en: 'Save attribute and attribute-value mapping' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'AttributeMappingService/saveAttributeMapping' }, { rpc: 'AttributeMappingService/saveAttributeValueMapping' }, { rpc: 'AttributeMappingService/copyMappingsFromCategory' }],
        ui: onScreens([CHOICES, 'saveMapping']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'mappings.delete', domain: 'catalog', summary: { tr: 'Eşlemeyi tümüyle sil', en: 'Delete a full mapping' },
        effect: 'destructive', minTier: 'member', permission: 'catalog:delete', bindings: [{ rpc: 'AttributeMappingService/deleteFullMapping' }],
        ui: onScreens([CATEGORIES, 'deleteMapping']), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: eşleme silme; yıkıcı, member bırakıldı.',
    }),

    // --- Görsel (ImageApi sözde-servisi + ImageService.assignImages) ---
    c({
        id: 'images.list', domain: 'catalog', summary: { tr: 'Ürün görsellerini getir', en: 'List product images' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', bindings: [{ rpc: 'ImageApi/getImages' }],
        ui: onScreens(...PRODUCT_EDIT), mcp: nx('binary_file', 'Görsel/dosya alanı; ikili dosya işlemleri yerel araç + mevcut yükleme API\'si üzerinden (ADR-0009 §6).'), agent: NO_AGENT,
    }),
    c({
        id: 'images.upload', domain: 'catalog', summary: { tr: 'Ürün görseli yükle', en: 'Upload a product image' },
        effect: 'write', minTier: 'member', permission: 'catalog:write',
        // ADR-0027: eski multipart yolu + doğrudan (imzalı PUT) yükleme bileti ve onayı AYNI yeteneğin bağlarıdır.
        bindings: [{ rpc: 'ImageApi/upload' }, { rpc: 'ImageService/createUploadUrl' }, { rpc: 'ImageService/confirmUpload' }],
        ui: onScreens(...PRODUCT_EDIT.map((s) => [s, 'uploadImage'] as [string, string])), mcp: nx('binary_file', 'İkili dosya yükleme (multipart); MCP JSON kanalı değil, yerel araç + yükleme API\'si (ADR-0009 §6).'), agent: NO_AGENT,
    }),
    c({
        id: 'images.delete', domain: 'catalog', summary: { tr: 'Ürün görsellerini sil (tekli/seçili)', en: 'Delete product images (single/selected)' },
        effect: 'destructive', minTier: 'member', permission: 'catalog:delete', bindings: [{ rpc: 'ImageApi/deleteImage' }, { rpc: 'ImageApi/deleteImageSelected' }],
        ui: onScreens(...PRODUCT_EDIT.map((s) => [s, 'deleteImage'] as [string, string])), mcp: nx('binary_file', 'Görsel/dosya alanı; ikili dosya işlemleri yerel araç + mevcut API üzerinden (ADR-0009 §6).'), agent: NO_AGENT,
    }),
    c({
        id: 'images.sort', domain: 'catalog', summary: { tr: 'Ürün görsellerini sırala', en: 'Reorder product images' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'ImageApi/sortImages' }],
        ui: onScreens(...PRODUCT_EDIT.map((s) => [s, 'sortImages'] as [string, string])), mcp: nx('binary_file', 'Görsel/dosya alanı; ikili dosya işlemleri yerel araç + mevcut API üzerinden (ADR-0009 §6).'), agent: NO_AGENT,
    }),
    c({
        id: 'images.assign', domain: 'catalog', summary: { tr: 'Görselleri ürüne/varyanta ata', en: 'Assign images to a product/variant' },
        effect: 'write', minTier: 'member', permission: 'catalog:write', bindings: [{ rpc: 'ImageService/assignImages' }],
        ui: onScreens(...PRODUCT_EDIT.map((s) => [s, 'assignImages'] as [string, string])), mcp: nx('binary_file', 'Görsel/dosya alanı; görsel atama görsel yönetim akışının parçası (ADR-0009 §6).'), agent: NO_AGENT,
    }),

    // --- Stok (ADR-0004 zero-oversell görünürlüğü ve politikası) ---
    c({
        id: 'stock.overview', domain: 'catalog', summary: { tr: 'Stok sağlığı özeti (OVERSOLD/UNMAPPED, rezervasyon)', en: 'Stock health overview (OVERSOLD/UNMAPPED, reservations)' },
        effect: 'read', minTier: 'member', permission: 'stock:read', bindings: [{ rpc: 'StockService/getStockOverview' }],
        ui: noUi('Backend-only: FE ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: deferred('later', 'Stok sağlığı özeti (OVERSOLD/UNMAPPED, rezervasyon toplamları); eşik altı SKU listesi stock.low_list yeteneğindedir.'), agent: NO_AGENT,
    }),
    c({
        id: 'stock.low_list', version: '1.1', domain: 'catalog', summary: { tr: 'Düşük stoklu varyantlar (eşik altı, sayfalı)', en: 'Low-stock variants (below threshold, paged)' },
        effect: 'read', minTier: 'member', permission: 'stock:read', pii: 'none', untrustedPaths: ['items[].sku', 'items[].barcode'],
        input: z.object({
            threshold: z.number().int().min(0).max(1_000_000).optional(),
            channel: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
            limit: z.number().int().min(1).max(50).optional(),
            cursor: z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/).optional(),
        }).strict(),
        output: z.object({
            enabled: z.boolean(),
            threshold: z.number().int().nullable(),
            items: z.array(z.object({
                variantId: z.string(), productId: z.string().nullable(), sku: z.string().nullable(), barcode: z.string().nullable(),
                stock: z.number(), reserved: z.number(), available: z.number(),
            })),
            nextCursor: z.string().nullable(),
        }),
        bindings: [{
            rpc: 'StockService/listLowStock',
            map: (i: { threshold?: number; channel?: string; limit?: number; cursor?: string }) => ({ ...i, limit: i.limit ?? 25 }),
        }],
        ui: noUi('Backend-only: FE ekranı ADR-0015 sonrası (docs/API_STOCK_FEATURES.md).'),
        mcp: { exposed: { toolset: 'core', confirm: 'none', present: 'table', deepLink: { screen: PRODUCTS } } },
        llm: {
            description: 'Lists product variants whose available stock (stock minus reserved) is at or below a threshold, lowest first, with SKU, barcode, '
                + 'stock, reserved and available counts. The threshold comes from the request or the tenant\'s stock policy; if neither is set the feature is off and the list is empty. '
                + 'Optionally restrict to one sales channel. Returns up to 50 rows per call plus a cursor. Read-only; it cannot change stock.',
            examples: ['Stoğu azalan ürünler hangileri?', 'Stoğu 5\'in altına düşen ürünleri listele', 'Trendyol\'da tükenmek üzere olanlar'],
        },
        agent: NO_AGENT,
        review: 'Eşik: istek `threshold` ya da tenant `stockPolicy.lowStockThreshold` (varsayılan yok = kapalı). Tam tarama + maxTimeMS (hesaplanan alan).',
    }),
    c({
        id: 'stock.movements.list', domain: 'catalog', summary: { tr: 'Stok hareket defteri (varyant başına, tarih aralıklı)', en: 'Stock movement ledger (per variant, date range)' },
        effect: 'read', minTier: 'member', permission: 'stock:read', bindings: [{ rpc: 'StockService/listMovements' }],
        ui: noUi('Backend-only: FE ekranı ADR-0015 sonrası (docs/API_STOCK_FEATURES.md).'),
        mcp: deferred('later', 'Stok hareket izi ("neden bu stok"); salt-okunur, toolset genişlemesinde değerlendirilir.'), agent: NO_AGENT,
        review: 'StockMovements (ADR-0021 D14) göçü (0015) çalıştırılmadan indeksler yok; koleksiyon boşken liste boş döner.',
    }),
    c({
        id: 'stock.publish_lag.summary', domain: 'catalog', summary: { tr: 'Stok yayın gecikmesi özeti (p50/p95, platform geneli)', en: 'Stock publish lag summary (p50/p95, platform-wide)' },
        effect: 'read', minTier: 'admin', permission: 'integrations:manage', bindings: [{ rpc: 'StockService/getPublishLagSummary' }],
        ui: noUi('Backend-only: izleme/backoffice (docs/API_STOCK_FEATURES.md).'),
        mcp: deferred('later', 'Platform geneli gecikme özeti; tenant kapsamlı değil, MCP araç adayı değil.'), agent: NO_AGENT,
        review: 'Metrik etiketi tenant taşımaz -> platform kapsamı (admin+). Histogram üst kovası 60 sn: p95 >60 sn ise null+overflow (X12).',
    }),
    c({
        id: 'products.channel_preflight.run', domain: 'catalog', summary: { tr: 'Gönderim öncesi ön kontrol (ürün × kanal eksikleri ve gidecek değerler)', en: 'Pre-export check (per product × channel issues and resolved preview)' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', bindings: [{ rpc: 'IntegrationService/preflightExport' }],
        input: z.object({
            variantIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(200).optional(),
            productIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(200).optional(),
            integrationCodes: z.array(z.string().regex(/^[a-z0-9_-]{2,32}$/)).min(1).max(10),
            mode: z.enum(['TRANSFER', 'UPDATE', 'UPDATE_VARIANT', 'UPDATE_PRICE', 'UPDATE_STOCK', 'UPDATE_DELIVERY']).optional(),
        }).strict().refine((v) => (v.variantIds?.length ?? 0) + (v.productIds?.length ?? 0) > 0, { message: 'variantIds ya da productIds gerekli' }),
        ui: noUi('Backend-only (eslesme-fiyat WP1): FE "Hazırlık durumu" paneli WP2/WP8 (BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: deferred('later', 'Salt okuma ön kontrol; ürün/kanal eksik listesi ajan için yararlı, toolset genişlemesinde (catalog) değerlendirilir.'), agent: NO_AGENT,
        review: 'Kuru çalıştırma: AttributeResolver bellekte çalışır, DB\'ye yazılmaz; adaptör validate yan etkisizdir (ağ yok). En çok 200 varyant (truncated bayrağı).',
    }),
    c({
        id: 'products.channel_explain.get', domain: 'catalog', summary: { tr: 'Kanal değerinin kaynağını açıkla (bu neden böyle)', en: 'Explain where a channel value comes from' },
        effect: 'read', minTier: 'member', permission: 'catalog:read', bindings: [{ rpc: 'IntegrationService/explainChannelProduct' }],
        input: z.object({ variantId: z.string().regex(/^[a-f0-9]{24}$/i), integrationCode: z.string().regex(/^[a-z0-9_-]{2,32}$/) }).strict(),
        ui: noUi('Backend-only (eslesme-fiyat WP1): FE ürün formu kanal sekmesi "Gönderilecek" önizlemesi WP2/WP8 (BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: deferred('later', 'Salt okuma açıklama zinciri; toolset genişlemesinde (catalog) değerlendirilir.'), agent: NO_AGENT,
    }),
    c({
        id: 'stock.policy.get', domain: 'catalog', summary: { tr: 'Stok politikasını getir (birincil kanal, tampon, grace, oto-iptal)', en: 'Get stock policy (primary channel, buffer, grace, auto-cancel)' },
        effect: 'read', minTier: 'admin', permission: 'settings:manage', bindings: [{ rpc: 'IntegrationService/getStockPolicy' }],
        ui: noUi('Backend-only: FE ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE; API_TENANT_SURFACE §1).'),
        mcp: deferred('later', 'Stok politikası okuma (admin+); zero-oversell davranışını etkileyen yapılandırma, toolset genişlemesinde değerlendirilir.'), agent: NO_AGENT,
    }),
    c({
        id: 'stock.policy.save', domain: 'catalog', summary: { tr: 'Stok politikasını kaydet (tenant birincil kanal / kanal bazlı)', en: 'Save stock policy (tenant primary channel / per channel)' },
        effect: 'write', minTier: 'admin', permission: 'settings:manage', bindings: [{ rpc: 'IntegrationService/saveTenantStockPolicy' }, { rpc: 'IntegrationService/saveChannelStockPolicy' }],
        ui: noUi('Backend-only: FE ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE; API_TENANT_SURFACE §1).'),
        mcp: deferred('later', 'Zero-oversell davranışını değiştiren yapılandırma yazma (admin+); onay akışı (Aşama D) olmadan açılmaz.'), agent: NO_AGENT,
    }),
];
