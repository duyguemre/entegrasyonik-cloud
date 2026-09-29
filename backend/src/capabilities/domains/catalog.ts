// Katalog: ürün, varyant, kategori, marka, seçenek (choice), etiket (hashtag), eşleme (attribute mapping), görsel, stok.
// CRUD aileleri iş odaklı yeteneklere bölünür; tekli+toplu RPC varyantları tek yeteneğin bağlarıdır.
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
        id: 'products.search', domain: 'catalog', summary: { tr: 'Ürünleri ara/filtrele/sayfala', en: 'Search/filter/paginate products' },
        effect: 'read', minTier: 'member', untrustedPaths: ['products[].name', 'products[].description'], bindings: [{ rpc: 'ProductService/getProducts' }],
        ui: onScreens(PRODUCTS),
        mcp: deferred('C', 'ADR-0009 çekirdek araç #5 (products_search); Aşama C\'de açılır. Önkoşul: query/limit≤50 strict şema, serbest metin alanları untrusted işareti.'), agent: NO_AGENT,
        review: 'Bağ ADAY eşlemedir: getProducts searchProductForm ile listeler; ADR-0009 sözleşmesi (query, SKU/ad/fiyat/stok/kanal eşleşme) için Aşama C\'de şema/çıktı netleştirilir.',
    }),
    c({
        id: 'products.statistics', domain: 'catalog', summary: { tr: 'Ürün istatistikleri', en: 'Product statistics' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'ProductService/getProductStatistics' }],
        ui: onShell('init'), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'products.get', domain: 'catalog', summary: { tr: 'Tek ürünü getir', en: 'Get a single product' },
        effect: 'read', minTier: 'member', untrustedPaths: ['name', 'description'], bindings: [{ rpc: 'ProductService/retrieveProduct' }],
        ui: onScreens(...PRODUCT_EDIT), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'products.create', domain: 'catalog', summary: { tr: 'Ürün oluştur', en: 'Create a product' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'ProductService/saveProduct' }],
        ui: onScreens(['definitions/ProductDefinitionView', 'save']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'products.update', domain: 'catalog', summary: { tr: 'Ürünü güncelle', en: 'Update a product' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'ProductService/updateProduct' }],
        ui: onScreens(...PRODUCT_EDIT.map((s) => [s, 'save'] as [string, string])), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'products.onsale.set', domain: 'catalog', summary: { tr: 'Ürünü satışa aç/kapat', en: 'Toggle product on-sale' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'ProductService/updateOnsale' }],
        ui: onScreens([PRODUCTS, 'onsale']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'products.delete', domain: 'catalog', summary: { tr: 'Ürünü sil', en: 'Delete a product' },
        effect: 'destructive', minTier: 'member', bindings: [{ rpc: 'ProductService/deleteProduct' }],
        ui: onScreens([PRODUCTS, 'delete']), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: yıkıcı silme; member bırakıldı.',
    }),
    c({
        id: 'products.export', domain: 'catalog', summary: { tr: 'Ürün listesini Excel\'e aktar', en: 'Export product list to Excel' },
        effect: 'read', minTier: 'member', rateCost: 10, bindings: [{ rpc: 'ProductService/exportExcel' }],
        ui: onScreens([PRODUCTS, 'exportExcel']), mcp: nx('binary_file', 'Excel dosyası üretir/indirir; ikili dosya kanalı LLM dışıdır (ADR-0009 §6).'), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: toplu veri çıkarma; gerekirse admin (tüm-tenant dışa aktarma DEĞİL, o owner: account.tenant.data.export).',
    }),
    c({
        id: 'products.platform_ready.set', domain: 'catalog', summary: { tr: 'Ürünü platforma yüklemeye hazır işaretle', en: 'Mark a product as ready for platform upload' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'IntegrationService/savePlatformUploadIsReadyForProduct' }],
        ui: onScreens([PRODUCTS, 'markReady']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),

    // --- Varyant ---
    c({
        id: 'variants.list', domain: 'catalog', summary: { tr: 'Ürünün varyantlarını getir', en: 'List a product\'s variants' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'VariantService/getVariants' }],
        ui: onScreens(...PRODUCT_EDIT), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'variants.add', domain: 'catalog', summary: { tr: 'Varyant ekle (tekli/çoklu)', en: 'Add variants (single/multiple)' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'VariantService/addVariant' }, { rpc: 'VariantService/addVariants' }],
        ui: onScreens(...PRODUCT_EDIT.map((s) => [s, 'addVariant'] as [string, string])), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'variants.update', domain: 'catalog', summary: { tr: 'Varyantları güncelle (stok/fiyat dahil; tekli/toplu)', en: 'Update variants (incl. stock/price; single/batch)' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'VariantService/updateVariants' }, { rpc: 'VariantService/batchProcessUpdate' }],
        ui: onScreens(...PRODUCT_EDIT.map((s) => [s, 'updateVariants'] as [string, string])),
        mcp: deferred('D', 'ADR-0019 Aşama D yazma adayları (stock.update, prices.update) bu yetenekten ayrıştırılacak; PendingAction + onay akışı hazır olunca açılır.'), agent: NO_AGENT,
    }),
    c({
        id: 'variants.delete', domain: 'catalog', summary: { tr: 'Varyantları sil (tekli/toplu)', en: 'Delete variants (single/batch)' },
        effect: 'destructive', minTier: 'member', bindings: [{ rpc: 'VariantService/deleteVariant' }, { rpc: 'VariantService/batchProcessDelete' }],
        ui: onScreens(...PRODUCT_EDIT.map((s) => [s, 'deleteVariant'] as [string, string])), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: yıkıcı silme (deleteVariant, batchProcessDelete); member bırakıldı.',
    }),

    // --- Kategori ---
    c({
        id: 'categories.list', domain: 'catalog', summary: { tr: 'Kategorileri getir', en: 'List categories' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'CategoryService/get' }],
        ui: onScreens(CATEGORIES, ...PRODUCT_EDIT), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'categories.create', domain: 'catalog', summary: { tr: 'Kategori ekle', en: 'Add a category' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'CategoryService/addCategory' }],
        ui: onScreens([CATEGORIES, 'create'], ['definitions/CategoryDefinitionView', 'create']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'categories.update', domain: 'catalog', summary: { tr: 'Kategoriyi güncelle', en: 'Update a category' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'CategoryService/updateCategory' }],
        ui: onScreens([CATEGORIES, 'update']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'categories.move', domain: 'catalog', summary: { tr: 'Kategoriyi taşı/sırala', en: 'Move/reorder a category' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'CategoryService/moveCategory' }, { rpc: 'CategoryService/changeOrderCategory' }],
        ui: onScreens([CATEGORIES, 'move']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'categories.delete', domain: 'catalog', summary: { tr: 'Kategoriyi sil', en: 'Delete a category' },
        effect: 'destructive', minTier: 'member', bindings: [{ rpc: 'CategoryService/deleteCategory' }],
        ui: onScreens([CATEGORIES, 'delete']), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: yıkıcı silme; member bırakıldı.',
    }),

    // --- Marka ---
    c({
        id: 'brands.list', domain: 'catalog', summary: { tr: 'Markaları getir', en: 'List brands' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'BrandService/get' }],
        ui: onScreens(BRANDS), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'brands.create', domain: 'catalog', summary: { tr: 'Marka ekle', en: 'Add a brand' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'BrandService/addBrand' }],
        ui: onScreens([BRANDS, 'create']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'brands.update', domain: 'catalog', summary: { tr: 'Markayı güncelle', en: 'Update a brand' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'BrandService/updateBrand' }],
        ui: onScreens([BRANDS, 'update']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'brands.delete', domain: 'catalog', summary: { tr: 'Markayı sil', en: 'Delete a brand' },
        effect: 'destructive', minTier: 'member', bindings: [{ rpc: 'BrandService/deleteBrand' }],
        ui: onScreens([BRANDS, 'delete']), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: yıkıcı silme; member bırakıldı.',
    }),
    c({
        id: 'brands.integration_mapping.save', domain: 'catalog', summary: { tr: 'Marka ↔ pazaryeri markası eşlemesini kaydet', en: 'Save brand ↔ marketplace brand mapping' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'BrandService/saveIntegrationBrand' }, { rpc: 'IntegrationService/saveOrUpdateIntegrationBrand' }],
        ui: onScreens([BRANDS, 'saveMapping']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),

    // --- Seçenek (choice) ---
    c({
        id: 'choices.list', domain: 'catalog', summary: { tr: 'Varyant seçeneklerini getir', en: 'List variant choices' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'ChoiceService/get' }],
        ui: onScreens(CHOICES), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'choices.create', domain: 'catalog', summary: { tr: 'Seçenek ekle (hazır seçenek dahil)', en: 'Add a choice (incl. prepared choice)' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'ChoiceService/addChoice' }, { rpc: 'ChoiceService/addPreparedChoice' }],
        ui: onScreens([CHOICES, 'create']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'choices.update', domain: 'catalog', summary: { tr: 'Seçeneği güncelle', en: 'Update a choice' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'ChoiceService/updateChoice' }],
        ui: onScreens([CHOICES, 'update']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'choices.delete', domain: 'catalog', summary: { tr: 'Seçeneği kaldır', en: 'Remove a choice' },
        effect: 'destructive', minTier: 'member', bindings: [{ rpc: 'ChoiceService/removeChoice' }],
        ui: onScreens([CHOICES, 'delete']), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
    }),
    c({
        id: 'choices.values.add', domain: 'catalog', summary: { tr: 'Seçeneğe değer ekle', en: 'Add a choice value' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'ChoiceService/addChoiceValue' }],
        ui: onScreens([CHOICES, 'addValue']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'choices.values.update', domain: 'catalog', summary: { tr: 'Seçenek değerini güncelle', en: 'Update a choice value' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'ChoiceService/updateChoiceValue' }],
        ui: onScreens([CHOICES, 'updateValue']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'choices.values.remove', domain: 'catalog', summary: { tr: 'Seçenek değerini kaldır', en: 'Remove a choice value' },
        effect: 'destructive', minTier: 'member', bindings: [{ rpc: 'ChoiceService/removeChoiceValue' }],
        ui: onScreens([CHOICES, 'removeValue']), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
    }),

    // --- Etiket (hashtag) ---
    c({
        id: 'hashtags.list', domain: 'catalog', summary: { tr: 'Etiketleri getir', en: 'List hashtags' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'HashtagService/get' }],
        ui: onScreens(HASHTAGS), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'hashtags.create', domain: 'catalog', summary: { tr: 'Etiket ekle', en: 'Add a hashtag' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'HashtagService/addHashtag' }],
        ui: onScreens([HASHTAGS, 'create']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'hashtags.update', domain: 'catalog', summary: { tr: 'Etiketi güncelle', en: 'Update a hashtag' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'HashtagService/updateHashtag' }],
        ui: onScreens([HASHTAGS, 'update']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'hashtags.delete', domain: 'catalog', summary: { tr: 'Etiketi kaldır', en: 'Remove a hashtag' },
        effect: 'destructive', minTier: 'member', bindings: [{ rpc: 'HashtagService/removeHashtag' }],
        ui: onScreens([HASHTAGS, 'delete']), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
    }),
    c({
        id: 'hashtags.values.add', domain: 'catalog', summary: { tr: 'Etikete değer ekle', en: 'Add a hashtag value' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'HashtagService/addHashtagValue' }],
        ui: onScreens([HASHTAGS, 'addValue']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'hashtags.values.update', domain: 'catalog', summary: { tr: 'Etiket değerini güncelle', en: 'Update a hashtag value' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'HashtagService/updateHashtagValue' }],
        ui: onScreens([HASHTAGS, 'updateValue']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'hashtags.values.remove', domain: 'catalog', summary: { tr: 'Etiket değerini kaldır', en: 'Remove a hashtag value' },
        effect: 'destructive', minTier: 'member', bindings: [{ rpc: 'HashtagService/removeHashtagValue' }],
        ui: onScreens([HASHTAGS, 'removeValue']), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
    }),

    // --- Kategori/özellik eşleme (AttributeMappingService) ---
    c({
        id: 'mappings.list', domain: 'catalog', summary: { tr: 'Eşleme tanımlarını getir', en: 'List mapping definitions' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'AttributeMappingService/get' }],
        ui: onScreens(CATEGORIES), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'mappings.category.get', domain: 'catalog', summary: { tr: 'Kategori eşlemesini getir', en: 'Get category mapping' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'AttributeMappingService/getCategoryMapping' }],
        ui: onScreens(CATEGORIES), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'mappings.category.save', domain: 'catalog', summary: { tr: 'Kategori eşlemesini kaydet', en: 'Save category mapping' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'AttributeMappingService/saveCategoryMapping' }],
        ui: onScreens([CATEGORIES, 'saveMapping']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'mappings.category.auto_match', domain: 'catalog', summary: { tr: 'Tüm kategorileri otomatik eşle', en: 'Auto-match all categories' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'AttributeMappingService/autoMatchAllCategories' }],
        ui: onScreens([CATEGORIES, 'autoMatch']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'mappings.attribute.get', domain: 'catalog', summary: { tr: 'Özellik eşlemesini getir', en: 'Get attribute mapping' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'AttributeMappingService/getAttributeMapping' }],
        ui: onScreens(CHOICES), mcp: deferred('later', LATER_READ), agent: NO_AGENT,
    }),
    c({
        id: 'mappings.attribute.save', domain: 'catalog', summary: { tr: 'Özellik ve özellik-değeri eşlemesini kaydet', en: 'Save attribute and attribute-value mapping' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'AttributeMappingService/saveAttributeMapping' }, { rpc: 'AttributeMappingService/saveAttributeValueMapping' }],
        ui: onScreens([CHOICES, 'saveMapping']), mcp: deferred('later', LATER_WRITE), agent: NO_AGENT,
    }),
    c({
        id: 'mappings.delete', domain: 'catalog', summary: { tr: 'Eşlemeyi tümüyle sil', en: 'Delete a full mapping' },
        effect: 'destructive', minTier: 'member', bindings: [{ rpc: 'AttributeMappingService/deleteFullMapping' }],
        ui: onScreens([CATEGORIES, 'deleteMapping']), mcp: deferred('later', LATER_DELETE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: eşleme silme; yıkıcı, member bırakıldı.',
    }),

    // --- Görsel (ImageApi sözde-servisi + ImageService.assignImages) ---
    c({
        id: 'images.list', domain: 'catalog', summary: { tr: 'Ürün görsellerini getir', en: 'List product images' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'ImageApi/getImages' }],
        ui: onScreens(...PRODUCT_EDIT), mcp: nx('binary_file', 'Görsel/dosya alanı; ikili dosya işlemleri yerel araç + mevcut yükleme API\'si üzerinden (ADR-0009 §6).'), agent: NO_AGENT,
    }),
    c({
        id: 'images.upload', domain: 'catalog', summary: { tr: 'Ürün görseli yükle', en: 'Upload a product image' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'ImageApi/upload' }],
        ui: onScreens(...PRODUCT_EDIT.map((s) => [s, 'uploadImage'] as [string, string])), mcp: nx('binary_file', 'İkili dosya yükleme (multipart); MCP JSON kanalı değil, yerel araç + yükleme API\'si (ADR-0009 §6).'), agent: NO_AGENT,
    }),
    c({
        id: 'images.delete', domain: 'catalog', summary: { tr: 'Ürün görsellerini sil (tekli/seçili)', en: 'Delete product images (single/selected)' },
        effect: 'destructive', minTier: 'member', bindings: [{ rpc: 'ImageApi/deleteImage' }, { rpc: 'ImageApi/deleteImageSelected' }],
        ui: onScreens(...PRODUCT_EDIT.map((s) => [s, 'deleteImage'] as [string, string])), mcp: nx('binary_file', 'Görsel/dosya alanı; ikili dosya işlemleri yerel araç + mevcut API üzerinden (ADR-0009 §6).'), agent: NO_AGENT,
    }),
    c({
        id: 'images.sort', domain: 'catalog', summary: { tr: 'Ürün görsellerini sırala', en: 'Reorder product images' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'ImageApi/sortImages' }],
        ui: onScreens(...PRODUCT_EDIT.map((s) => [s, 'sortImages'] as [string, string])), mcp: nx('binary_file', 'Görsel/dosya alanı; ikili dosya işlemleri yerel araç + mevcut API üzerinden (ADR-0009 §6).'), agent: NO_AGENT,
    }),
    c({
        id: 'images.assign', domain: 'catalog', summary: { tr: 'Görselleri ürüne/varyanta ata', en: 'Assign images to a product/variant' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'ImageService/assignImages' }],
        ui: onScreens(...PRODUCT_EDIT.map((s) => [s, 'assignImages'] as [string, string])), mcp: nx('binary_file', 'Görsel/dosya alanı; görsel atama görsel yönetim akışının parçası (ADR-0009 §6).'), agent: NO_AGENT,
    }),

    // --- Stok (ADR-0004 zero-oversell görünürlüğü ve politikası) ---
    c({
        id: 'stock.overview', domain: 'catalog', summary: { tr: 'Stok sağlığı özeti (OVERSOLD/UNMAPPED, rezervasyon)', en: 'Stock health overview (OVERSOLD/UNMAPPED, reservations)' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'StockService/getStockOverview' }],
        ui: noUi('Backend-only: FE ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: deferred('later', 'Stok sağlığı özeti; ADR-0009 çekirdek araç #4 (stock_low_list, eşik altı SKU listesi) DEĞİLDİR — o araç için henüz RPC yoktur (Aşama C önkoşulu).'), agent: NO_AGENT,
        review: 'stock_low_list için backend RPC eksik: getStockOverview yalnızca OVERSOLD/UNMAPPED ve rezervasyon toplamlarını döndürür (eşik altı SKU listesi yok).',
    }),
    c({
        id: 'stock.policy.get', domain: 'catalog', summary: { tr: 'Stok politikasını getir (birincil kanal, tampon, grace, oto-iptal)', en: 'Get stock policy (primary channel, buffer, grace, auto-cancel)' },
        effect: 'read', minTier: 'admin', bindings: [{ rpc: 'IntegrationService/getStockPolicy' }],
        ui: noUi('Backend-only: FE ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE; API_TENANT_SURFACE §1).'),
        mcp: deferred('later', 'Stok politikası okuma (admin+); zero-oversell davranışını etkileyen yapılandırma, toolset genişlemesinde değerlendirilir.'), agent: NO_AGENT,
    }),
    c({
        id: 'stock.policy.save', domain: 'catalog', summary: { tr: 'Stok politikasını kaydet (tenant birincil kanal / kanal bazlı)', en: 'Save stock policy (tenant primary channel / per channel)' },
        effect: 'write', minTier: 'admin', bindings: [{ rpc: 'IntegrationService/saveTenantStockPolicy' }, { rpc: 'IntegrationService/saveChannelStockPolicy' }],
        ui: noUi('Backend-only: FE ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE; API_TENANT_SURFACE §1).'),
        mcp: deferred('later', 'Zero-oversell davranışını değiştiren yapılandırma yazma (admin+); onay akışı (Aşama D) olmadan açılmaz.'), agent: NO_AGENT,
    }),
];
