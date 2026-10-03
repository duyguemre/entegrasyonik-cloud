/**
 * [eslesme-fiyat WP1 / ADR-0038 taslağı, D-ERR-1] Yapılandırılmış entegrasyon hata/uyarı sözleşmesi.
 *
 * Kullanıcıya "neyin eksik olduğu, neden ve ne yapacağı" tek biçimde gösterilir. Taşıyıcılar: ESP staging `issues[]`,
 * `Variants.platforms[code].upload.<MODE>.issues[]`, ImportJobReport `issues[]` (okumada türetilir), preflight yanıtı.
 * `errorMessage`/`messages` düz metni geriye uyum için KALIR ve `issuesToMessage` ile türetilir.
 *
 * Kurallar: `reason`/`solution` TR sade dil; `{param}` yer tutucuları `params` ile doldurulur. `platformMessage` yalnız
 * "teknik ayrıntı" içindir ve `maskPlatformMessage` ile maskelenir (sır/PII sızmaz). Katalogda olmayan kod → `PLATFORM_REJECTED`.
 * i18n anahtarı: `integrationIssues.<CODE>.reason|solution` (FE çevirisi yoksa backend metni gösterilir).
 */
import { redactFreeText } from '@platform/core/logger/redact';

const MAX_PLATFORM_MESSAGE = 500;
/** Kanal metni: sır/PII desenleri maskelenir, 500 karakterde kesilir (platform katmanı integration'a bağımlı olmaz). */
export function maskPlatformMessage(message: unknown): string {
    const text = redactFreeText(typeof message === 'string' ? message : String(message))
        .replace(/((?:pass\w*|token|secret\w*|apikey|api[_-]?key|key)\s*[:=]\s*)("?)([^\s"&,;]+)\2/gi, (_m, p, q) => `${p}${q}***${q}`);
    return text.length > MAX_PLATFORM_MESSAGE ? `${text.slice(0, MAX_PLATFORM_MESSAGE)}…` : text;
}

export type IssueSeverity = 'error' | 'warning' | 'info';
export type IssueModule = 'mapping' | 'price' | 'product' | 'stock' | 'order' | 'claim' | 'invoice' | 'finance' | 'message' | 'auth' | 'rate' | 'import';

/** Önyüzde ilgili ekrana götüren bağlantı (`screen` = workspace ekran kimliği, capabilities `deepLink.screen` ile aynı biçim). */
export interface IssueLink { screen: string; params?: Record<string, string> }

export interface IntegrationIssue {
    code: string;
    severity: IssueSeverity;
    module: IssueModule;
    integrationCode?: string;
    productId?: string;
    variantId?: string;
    barcode?: string;
    field?: string;
    reason: string;
    solution: string;
    link?: IssueLink;
    platformMessage?: string;
}

interface IssueDef { severity: IssueSeverity; module: IssueModule; reason: string; solution: string; screen?: string }

const SCR = {
    CATEGORIES: 'productDefinitions/CategoryListView',
    BRANDS: 'productDefinitions/BrandListView',
    CHOICES: 'productDefinitions/ChoiceListView',
    PRODUCTS: 'productDefinitions/ProductListView',
    PRICING: 'pricing/PricingRulesView',
    MARKETPLACE: 'integrations/MarketplaceView',
} as const;

export const INTEGRATION_ISSUES = {
    // --- eşleme ---
    MAP_CATEGORY_MISSING: { severity: 'error', module: 'mapping', reason: 'Ürünün kategorisi bu kanalın bir kategorisiyle eşlenmemiş.', solution: 'Kategori eşlemesini yap.', screen: SCR.CATEGORIES },
    MAP_BRAND_MISSING: { severity: 'error', module: 'mapping', reason: 'Ürünün markası bu kanalın bir markasıyla eşlenmemiş.', solution: 'Marka eşlemesini yap.', screen: SCR.BRANDS },
    MAP_ATTR_MISSING: { severity: 'error', module: 'mapping', reason: 'Kanalın zorunlu tuttuğu "{attribute}" özelliği için değer bulunamadı, çünkü özellik eşlemesi yapılmamış.', solution: 'Özellik eşlemesini yap ya da ürüne değer gir.', screen: SCR.CATEGORIES },
    MAP_ATTR_VALUE_MISSING: { severity: 'error', module: 'mapping', reason: '"{attribute}" özelliğinin "{value}" değeri kanalın değer listesinde eşlenmemiş.', solution: 'Değer eşlemesini yap.', screen: SCR.CHOICES },
    MAP_ATTR_WARNING: { severity: 'warning', module: 'mapping', reason: 'Özellik çözümlemesi uyarı verdi: {detail}', solution: 'Eşleme ekranında özelliği kontrol et.', screen: SCR.CATEGORIES },
    HB_BRAND_UNMATCHED: { severity: 'error', module: 'mapping', reason: 'Hepsiburada marka adını tanımadı.', solution: 'Marka adını Hepsiburada\'daki adıyla aynı yaz ya da marka başvurusu yap.', screen: SCR.BRANDS },
    // --- ürün ---
    PRODUCT_NOT_FOUND: { severity: 'error', module: 'product', reason: 'Ürünün ana kaydı bulunamadı.', solution: 'Ürünü yeniden kaydet ya da listeden kaldır.', screen: SCR.PRODUCTS },
    VARIANT_NOT_FOUND: { severity: 'error', module: 'product', reason: 'Varyant ana tabloda bulunamadı.', solution: 'Varyantı yeniden kaydet ve tekrar gönder.', screen: SCR.PRODUCTS },
    PRODUCT_CATEGORY_MISSING: { severity: 'error', module: 'product', reason: 'Ürünün kategorisi seçilmemiş.', solution: 'Ürüne kategori seç.', screen: SCR.PRODUCTS },
    PRODUCT_BRAND_MISSING: { severity: 'error', module: 'product', reason: 'Ürünün markası seçilmemiş.', solution: 'Ürüne marka seç.', screen: SCR.PRODUCTS },
    BARCODE_MISSING: { severity: 'error', module: 'product', reason: 'Barkod eksik.', solution: 'Varyanta barkod gir.', screen: SCR.PRODUCTS },
    BARCODE_INVALID: { severity: 'error', module: 'product', reason: 'Barkod kanal kurallarına uymuyor: {detail}', solution: 'Barkodu kanal kurallarına göre düzelt.', screen: SCR.PRODUCTS },
    STOCKCODE_INVALID: { severity: 'error', module: 'product', reason: 'Stok kodu kanal kurallarına uymuyor: {detail}', solution: 'Stok kodunu kısalt ya da düzelt.', screen: SCR.PRODUCTS },
    TITLE_TOO_LONG: { severity: 'error', module: 'product', reason: 'Ürün adı {max} karakteri aşıyor ({length}).', solution: 'Ürün adını kısalt.', screen: SCR.PRODUCTS },
    IMAGE_MISSING: { severity: 'error', module: 'product', reason: 'Ürünün görseli yok.', solution: 'En az bir görsel ekle.', screen: SCR.PRODUCTS },
    IMAGE_TOO_MANY: { severity: 'warning', module: 'product', reason: 'Kanal en çok {max} görsel kabul ediyor; {count} görsel var, fazlası gönderilmeyebilir.', solution: 'Görsel sırasını kontrol et.', screen: SCR.PRODUCTS },
    IMAGE_NOT_HTTPS: { severity: 'error', module: 'product', reason: 'Kanal yalnız HTTPS görsel adresi kabul ediyor; {count} görsel HTTPS değil.', solution: 'Görselleri yeniden yükle.', screen: SCR.PRODUCTS },
    IMAGE_INVALID: { severity: 'error', module: 'product', reason: 'Kanal ürün görselini kabul etmedi.', solution: 'Görsel boyutunu/biçimini kanal kurallarına göre düzelt.', screen: SCR.PRODUCTS },
    ALREADY_SENT: { severity: 'info', module: 'product', reason: 'Ürün bu kanala zaten gönderilmiş.', solution: 'Gerekirse "Güncelle" ile gönder.', screen: SCR.PRODUCTS },
    TY_ORIGIN_REQUIRED: { severity: 'error', module: 'product', reason: 'Trendyol menşei (origin) bilgisini zorunlu tutuyor.', solution: 'Ürüne menşei bilgisi gir.', screen: SCR.PRODUCTS },
    // --- fiyat / stok ---
    PRICE_INVALID: { severity: 'error', module: 'price', reason: 'Satış fiyatı geçersiz (boş ya da 0).', solution: 'Satış fiyatı gir.', screen: SCR.PRODUCTS },
    PRICE_ABOVE_LIST: { severity: 'error', module: 'price', reason: 'Satış fiyatı liste fiyatından yüksek.', solution: 'Liste fiyatını satış fiyatına eşit ya da yüksek yap.', screen: SCR.PRODUCTS },
    VAT_INVALID: { severity: 'error', module: 'price', reason: 'KDV oranı geçersiz.', solution: 'KDV oranını gir (0, 1, 10 ya da 20).', screen: SCR.PRODUCTS },
    STOCK_INVALID: { severity: 'error', module: 'stock', reason: 'Stok geçersiz (boş ya da negatif).', solution: 'Stok adedini düzelt.', screen: SCR.PRODUCTS },
    // --- bağlantı / kanal ---
    AUTH_FAILED: { severity: 'error', module: 'auth', reason: 'Kanal kimlik bilgilerini reddetti.', solution: 'Entegrasyon ayarlarında API bilgilerini kontrol et.', screen: SCR.MARKETPLACE },
    RATE_LIMITED: { severity: 'warning', module: 'rate', reason: 'Kanal istek sınırına ulaşıldı.', solution: 'Bekle; işlem otomatik tekrar denenecek.' },
    PLATFORM_UNAVAILABLE: { severity: 'warning', module: 'rate', reason: 'Kanal şu an yanıt vermiyor.', solution: 'Bekle; işlem otomatik tekrar denenecek.' },
    PLATFORM_REJECTED: { severity: 'error', module: 'product', reason: 'Kanal kaydı reddetti.', solution: 'Teknik ayrıntıdaki kanal mesajına göre ürünü düzelt.', screen: SCR.PRODUCTS },
    SYSTEM_ERROR: { severity: 'error', module: 'product', reason: 'Gönderim sırasında sistem hatası oluştu.', solution: 'Tekrar gönder; sürerse destek talebi aç.' },
    // --- içe aktarma raporu ---
    IMPORT_CATEGORY_UNMAPPED: { severity: 'warning', module: 'import', reason: 'Kanaldaki "{category}" kategorisi yerel bir kategoriyle eşlenmemiş ({count} ürün).', solution: 'Kategori eşlemesini yap ve içe aktarmayı yinele.', screen: SCR.CATEGORIES },
    IMPORT_ATTRIBUTE_UNMAPPED: { severity: 'warning', module: 'import', reason: '"{category}" kategorisinde "{attribute}" özelliği eşlenmemiş.', solution: 'Özellik eşlemesini yap.', screen: SCR.CATEGORIES },
    IMPORT_DUPLICATE_BARCODE: { severity: 'warning', module: 'import', reason: '"{barcode}" barkodu birden çok üründe var; içe aktarılmadı.', solution: 'Kanalda ya da yerelde yinelenen barkodu düzelt.', screen: SCR.PRODUCTS },
} as const satisfies Record<string, IssueDef>;

export type IntegrationIssueCode = keyof typeof INTEGRATION_ISSUES;

export interface IssueContext {
    integrationCode?: string;
    productId?: unknown;
    variantId?: unknown;
    barcode?: unknown;
    field?: string;
    params?: Record<string, string | number | undefined | null>;
    platformMessage?: unknown;
    /** Bağlantı parametreleri (ör. `{ integrationCode }`); verilmezse `integrationCode` (varsa) eklenir. */
    linkParams?: Record<string, string>;
}

const fill = (tpl: string, params?: IssueContext['params']) =>
    tpl.replace(/\{(\w+)\}/g, (_m, k) => (params?.[k] === undefined || params?.[k] === null ? '' : String(params[k])));

const idOf = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : String(v));

export function isIssueCode(code: unknown): code is IntegrationIssueCode {
    return typeof code === 'string' && Object.prototype.hasOwnProperty.call(INTEGRATION_ISSUES, code);
}

/** Katalog kodundan issue üretir; bilinmeyen kod → `PLATFORM_REJECTED` (ham metin `platformMessage`'da kalır). */
export function makeIssue(code: string, ctx: IssueContext = {}): IntegrationIssue {
    const key: IntegrationIssueCode = isIssueCode(code) ? code : 'PLATFORM_REJECTED';
    const def: IssueDef = INTEGRATION_ISSUES[key];
    const issue: IntegrationIssue = {
        code: key, severity: def.severity, module: def.module,
        reason: fill(def.reason, ctx.params).replace(/\s+/g, ' ').trim(),
        solution: fill(def.solution, ctx.params),
    };
    if (ctx.integrationCode) issue.integrationCode = ctx.integrationCode;
    const productId = idOf(ctx.productId); if (productId) issue.productId = productId;
    const variantId = idOf(ctx.variantId); if (variantId) issue.variantId = variantId;
    const barcode = idOf(ctx.barcode); if (barcode) issue.barcode = barcode;
    if (ctx.field) issue.field = ctx.field;
    if (def.screen) {
        const params = ctx.linkParams ?? (ctx.integrationCode ? { integrationCode: ctx.integrationCode } : undefined);
        issue.link = params ? { screen: def.screen, params } : { screen: def.screen };
    }
    if (ctx.platformMessage !== undefined && ctx.platformMessage !== null && ctx.platformMessage !== '') issue.platformMessage = maskPlatformMessage(ctx.platformMessage);
    return issue;
}

/** Geriye uyum: `errorMessage`/`messages` düz metni issue'lardan türetilir (önce hatalar; kanal mesajı varsa o, yoksa reason). */
export function issuesToMessage(issues: IntegrationIssue[]): string {
    const ordered = [...issues].sort((a, b) => rank(a.severity) - rank(b.severity));
    return ordered.map((i) => i.platformMessage || i.reason).join(' | ');
}
const rank = (s: IssueSeverity) => (s === 'error' ? 0 : s === 'warning' ? 1 : 2);

export const hasBlockingIssue = (issues: IntegrationIssue[]) => issues.some((i) => i.severity === 'error');

/**
 * Issue taşıyan hata. Validator/preflight yerel kontrolleri bunu fırlatır; `message` geriye uyum için ESKİ düz metindir
 * (ör. "Ürünün kategorisi bulunamadı."), böylece `errorMessage` değişmez.
 */
export class IssueError extends Error {
    constructor(message: string, public readonly issues: IntegrationIssue[]) {
        super(message);
        this.name = 'IssueError';
        Object.setPrototypeOf(this, IssueError.prototype);
    }
    static is(err: unknown): err is IssueError {
        return !!err && typeof err === 'object' && (err as any).name === 'IssueError' && Array.isArray((err as any).issues);
    }
}
