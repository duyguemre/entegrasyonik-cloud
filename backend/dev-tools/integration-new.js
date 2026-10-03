#!/usr/bin/env node
/**
 * ADR-0033 INT-08: yeni entegrasyon iskelet üreticisi (docs/INTEGRATION_PLAYBOOK.md §0, §3.1, §3.3).
 *
 *   npm run integration:new -- --kind <marketplace|ecommerce|erp|einvoice|shipping> --code <kod> [--name "<Ad>"] [--dry-run]
 *   (`cargo` = `shipping` takma adıdır.)
 *
 * KURALLAR (ADR-0033 Karar 4):
 *   - YALNIZ YENİ dosya üretir; mevcut hiçbir dosyaya dokunmaz (TS dosyalarına otomatik ekleme kırılgandır).
 *   - Var olan klasöre/dosyaya yazmayı REDDEDER; `--force` yoktur.
 *   - Yapıştırılacak parçacıkları (ADAPTER_KEYS, outboundHosts, Factory, descriptor kaydı, ...) EKRANA basar.
 *   - Eksik dokunma noktalarını tests/static/adapterKeys.static.test.ts + integrationPlaybook.static.test.ts yakalar.
 * Bağımlılık yok; ağ/DB yok. Test için `--out-root <dizin>`: çıktı `<dizin>/backend/...` ve `<dizin>/docs/...` altına yazılır.
 */
const fs = require('fs');
const path = require('path');

const BACKEND = path.resolve(__dirname, '..');
const REPO = path.resolve(BACKEND, '..');
const KINDS = ['marketplace', 'ecommerce', 'erp', 'einvoice', 'shipping'];
const CODE_RE = /^[a-z][a-z0-9]{1,23}$/;

// ---- arg ayrıştırma ---------------------------------------------------------------------------------------------
function parseArgs(argv) {
    const out = { dryRun: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dry-run') out.dryRun = true;
        else if (a === '--kind' || a === '--code' || a === '--name' || a === '--out-root') {
            const v = argv[++i];
            if (v === undefined || v.startsWith('--')) throw new UsageError(a + ' için değer gerekli');
            out[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
        } else if (a === '--force') throw new UsageError('--force yoktur: var olan dosya/klasörün üzerine yazılmaz');
        else throw new UsageError('bilinmeyen argüman: ' + a);
    }
    return out;
}
class UsageError extends Error { }

function existingCodes() {
    const src = fs.readFileSync(path.join(BACKEND, 'src/integration/modules/adapterKeys.ts'), 'utf8');
    return [...src.matchAll(/code:\s*'([a-z0-9]+)'/g)].map(m => m[1]);
}

// ---- şablon yardımcıları ----------------------------------------------------------------------------------------
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fill = (tpl, v) => tpl.replace(/__([A-Z]+)__/g, (_, k) => (k in v ? v[k] : '__' + k + '__'));

// Kategori matrisinin Z yetenekleri (playbook §2) -> descriptor'a TODO'lu not_supported + metot listesi.
const CAPS = {
    marketplace: {
        products: ['transferProducts', 'checkBatchProduct', 'updateProduct'],
        stockPrice: ['updateProductStock', 'updateProductPrice'],
        orders: ['retrieveOrders'],
        orderActions: ['approveOrder', 'rejectOrder'],
        shippingNotice: ['sendOrderShipping'],
        invoiceNotice: ['sendOrderInvoice'],
        returns: ['retrieveClaims'],
        categories: ['retrieveCategories', 'retrieveCategoryAttributes', 'retrieveBrands'],
    },
    ecommerce: {
        products: ['streamProducts', 'updateProduct'],
        stockPrice: ['updateProductStock', 'updateProductPrice'],
        orders: ['retrieveOrders'],
        shippingNotice: ['sendOrderShipping'],
        categories: ['retrieveCategories'],
    },
    erp: { products: ['streamProducts'], stockPrice: ['updateProductStock'] },
    einvoice: { taxpayerLookup: [], einvoiceIssue: [], documentStatus: [], documentPdf: [] },
    shipping: { shipmentCreate: [], label: [], tracking: [] },
};
const CONTRACTS = {
    marketplace: ['orders.list', 'batch.result', 'categories.list'],
    ecommerce: ['products.list', 'orders.list'],
    erp: ['products.list', 'orders.list'],
    einvoice: ['document.status'],
    shipping: ['shipment.track'],
};
const CONNECTORS = {
    marketplace: [['Order', 'orders.list'], ['Product', 'batch.result']],
    ecommerce: [['Order', 'orders.list'], ['Product', 'products.list']],
    erp: [['Order', 'orders.list'], ['Product', 'products.list']],
    einvoice: [['Document', 'document.status']],
    shipping: [['Shipment', 'shipment.track']],
};
const isPlatformKind = k => k === 'marketplace' || k === 'ecommerce' || k === 'erp';
const constName = (code, ep) => (code + '_' + ep).toUpperCase().replace(/[^A-Z0-9]+/g, '_');

// ---- dosya şablonları -------------------------------------------------------------------------------------------
function constantsTs(v) {
    return fill(`// __NAME__ sabitleri (INT-08 iskeleti). TODO: requiredSettings'i ön keşif §2'ye göre doldur; sır olan alan ADLARI
// utils/secretKeys.ts INTEGRATION_SECRET_FIELD_NAMES'te yoksa oraya eklenmeli (playbook §3.3 satır 13).
export const integrationCode = '__CODE__';
export const integrationName = '__NAME__';
export const requiredSettings: string[] = ['apikey']; // TODO
`, v);
}

function serviceTs(v) {
    return fill(`import { ADAPTER_KEYS, type AdapterKey } from '@integration/modules/adapterKeys';
import { AdapterHttpService, type AuthConfig } from '@integration/modules/common/adapter/AdapterHttpService';
import { integrationCode } from '../constants';

// ADR-0033 INT-01 tabanı. ADAPTER_KEYS satırı henüz eklenmediyse (iskelet aşaması) kurucu açık bir hata verir.
function adapterKey(): AdapterKey {
    const row = (ADAPTER_KEYS as readonly { code: string }[]).find(k => k.code === integrationCode);
    if (!row) throw new Error('[__CODE__] ADAPTER_KEYS satırı eksik (docs/INTEGRATION_PLAYBOOK.md §3.3 satır 4)');
    return row as unknown as AdapterKey;
}

export default class Service extends AdapterHttpService {
    constructor(params: any) {
        super(adapterKey(), params);
    }

    // TODO(ön keşif §2): kimlik doğrulama. Sır URL'ye konmaz; token gerekiyorsa OAuthTokenCache kullan.
    protected authConfig(): AuthConfig {
        const s = this.params.integrationSettings?.settings || {};
        const apikey = String(s.apikey || '').trim();
        return { headers: { Authorization: 'Bearer ' + apikey } };
    }
}
`, v);
}

function limitsTs(v) {
    return fill(`// __NAME__ servis grubu limitleri (playbook §4.1, X1). TODO: ön keşif §4'teki gruplar; sayısal sabit limit burada YAZILMAZ,
// ADR-0020 kataloğundan (resilience.__CODE__.<ad>) okunur. Platform servis grubu tanımlamıyorsa bu dosya silinebilir.
export const SERVICE_GROUPS = {
    // TODO: örn. productRead: 'product_read', stockPriceWrite: 'stock_price_write'
} as const;
`, v);
}

function contractsTs(v) {
    const eps = CONTRACTS[v.kind];
    const decls = eps.map(ep => fill(`/** TODO: resmi yanıt örneğinden zorunlu (kodun okuduğu) alanları ekle; .passthrough() kalır. */
export const __C__: ResponseContract = {
    integration: '__CODE__', endpoint: '__EP__',
    schema: z.object({}).passthrough(),
};
`, { ...v, C: constName(v.code, ep), EP: ep })).join('\n');
    const ids = eps.map(ep => "    '" + v.code + '.' + ep + "@v1',").join('\n');
    return fill(`// __NAME__ YANIT sözleşmeleri (playbook §4.2). Yalnız GÖZLEM (observeResponseSchema): uyuşmazlıkta API_SCHEMA_DRIFT.
import { z } from 'zod';
import type { ResponseContract } from '@integration/modules/common/contract/observeResponseSchema';

${decls}
/** descriptor.contracts buradan beslenir (kimlik: <kod>.<alan>.<işlem>@v<n>). */
export const CONTRACT_IDS: string[] = [
${ids}
];
`, v);
}

function connectorTs(v, name, ep) {
    return fill(`import { paginate } from '@integration/modules/common/adapter/paginate';
import { observeResponseSchema } from '@integration/modules/common/contract/observeResponseSchema';
import { __C__ } from '../contracts';
import type Service from '../services/Service';

// Connector: YALNIZ URL + HTTP çağrısı + sözleşme etiketi (playbook §3.1). İş mantığı/dönüşüm burada YOK.
// Log: yalnız eventLog; gövde/PII loglanmaz.
export class __N__Connector {
    constructor(private service: Service, private params: any) { }

    /** TODO: URL, sayfalama türü (page|offset|cursor) ve toplam sinyali ön keşif §5'e göre. */
    public async fetch__N__s(_query?: Record<string, any>): Promise<any[]> {
        return paginate<any>(async ({ page, limit }) => {
            const res = await this.service.get('TODO/path', { page, size: limit }, { operation: '__EP__' });
            observeResponseSchema(__C__, res.data, { clientId: this.params.clientId });
            const items = Array.isArray(res.data) ? res.data : [];
            return { items };
        }, { kind: 'page', maxPages: 100, limit: 100, operation: '__EP__', integrationCode: '__CODE__', clientId: this.params.clientId });
    }
}
`, { ...v, N: name, EP: ep, C: constName(v.code, ep) });
}

function transformerTs(v) {
    const n = v.kind === 'einvoice' ? 'Document' : v.kind === 'shipping' ? 'Shipment' : 'Order';
    return fill(`// __NAME__ dönüştürücü (saf fonksiyonlar; playbook §3.1, §4.9): platform JSON -> iç model.
// TODO: tarihler UTC Date (ofsetsiz yerel saat = Europe/Istanbul, TEK yerde dönüştür + test), para/KDV açık (currency, vatIncluded).
export function to__N__(raw: Record<string, any>): Record<string, any> {
    // TODO: alan eşlemesi; zorunlu kimlik yoksa sessiz '' DEĞİL IntegrationError('VALIDATION') (playbook §4.2).
    return { ...raw };
}
`, { ...v, N: n });
}

function descriptorTs(v) {
    const caps = CAPS[v.kind];
    const lines = Object.keys(caps).map(k => "        " + k + ": { level: 'not_supported', methods: [" +
        caps[k].map(m => "'" + m + "'").join(', ') + "], note: 'TODO: ön keşif sonrası supported/limited/platform_auto olarak güncelle.' },").join('\n');
    return fill(`// ADR-0018 yetenek manifestosu — __NAME__ (INT-08 iskeleti). Kaynak: docs/research/INTEGRATION___UPPER__.md.
// TODO: tüm alanlar ön keşfe göre doldurulur; \`verification.liveApi\` yalnız gerçek hesapla duman testi yapıldıysa true (§4.13).
import type { IntegrationDescriptor } from '@integration/catalog/types';
import { integrationCode, integrationName, requiredSettings } from './constants';
import { CONTRACT_IDS } from './contracts';

const __PASCAL__Descriptor: IntegrationDescriptor = {
    code: integrationCode,
    displayName: integrationName,
    category: '__KIND__',
    status: 'roadmap',
    adapterVersion: '0.1.0',
    protocol: 'rest', // TODO
    auth: { type: 'api_key_header', requiredSettings, tokenLifecycle: 'none' }, // TODO
    brandMapping: 'none', // TODO: 'id' | 'name' | 'attribute' | 'none' (eslesme-fiyat K-C)
    capabilities: {
${lines}
    },
    limitations: ['TODO: görünür kapsam sınırlarını yaz (dürüstlük ilkesi).'],
    rateLimits: { configured: { timeoutMs: 30000 }, verified: false }, // TODO: politika ile eşit olmalı (§4.13)
    api: {
        hosts: [], // TODO: yalnız host; ALLOWED_OUTBOUND_HOSTS ile eşit olacak
        docs: [], // TODO: resmi kaynaklar (ön keşif §1)
    },
    // TODO: kayıt sonrası \`hosts: ALLOWED_OUTBOUND_HOSTS[integrationCode]\` (outboundHosts.ts girdisi eklendikten sonra).
    config: { hosts: [] },
    mock: { available: true, prefix: '__UPPER__', contractFixtures: [] },
    contracts: CONTRACT_IDS,
    verification: { liveApi: false, mockEnvironment: true },
};

export default __PASCAL__Descriptor;
`, v);
}

const NS_PLATFORM = `
    // ---- Yetenekler: başlangıçta hepsi NOT_SUPPORTED. TODO: ön keşfe göre gerçek uygulamayla değiştir (playbook §2). ----
    // Z* yetenek desteklenmiyorsa descriptor'da gerekçeli not_supported kalır ve metot NOT_SUPPORTED fırlatmaya devam eder.
    public async retrieveCategories(): Promise<ICategory[]> { return this.ns('retrieveCategories'); }
    public async retrieveCategoryAttributes(_categoryId: string): Promise<ICategoryAttribute[]> { return this.ns('retrieveCategoryAttributes'); }
    public async retrieveCategoryCommision(_categoryId: string): Promise<any> { return this.ns('retrieveCategoryCommision'); }
    public async retrieveBrands(_query: Record<string, any>): Promise<IBrand[]> { return this.ns('retrieveBrands'); }

    public async getSummaryFromRaw(_raw: any): Promise<IPlatformProductSummary> { return this.ns('getSummaryFromRaw'); }
    public async validate(_variant: IVariant): Promise<IValidationResult> { return this.ns('validate'); }
    public async streamProducts(_callback: (chunk: any[]) => Promise<void>, _query?: Record<string, any>): Promise<IFetchProductsResult> { return this.ns('streamProducts'); }
    public async convertToInternalModel(_staged: any): Promise<IInternalConversionResult> { return this.ns('convertToInternalModel'); }

    public async transferProducts(_v: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.ns('transferProducts'); }
    public async updateProductPrice(_v: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.ns('updateProductPrice'); }
    public async updateProductStock(_v: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.ns('updateProductStock'); }
    public async updateProduct(_v: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.ns('updateProduct'); }
    public async updateProductVariant(_v: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.ns('updateProductVariant'); }
    public async updateProductDelivery(_v: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.ns('updateProductDelivery'); }
    public async updateProductStatuses(_payload: any): Promise<IInternalResult[]> { return this.ns('updateProductStatuses'); }
    // Batch kavramı yoksa NOT_SUPPORTED kalır (undefined DEĞİL; playbook §4.3, conformance C8b).
    public async checkBatchProduct(_payload: IBatchCheckPayload): Promise<IInternalResult[] | undefined> { return this.ns('checkBatchProduct'); }

    public async retrieveOrders(_query?: Record<string, any>): Promise<IOrderPackage[]> { return this.ns('retrieveOrders'); }
    public async retrieveClaims(_query?: Record<string, any>): Promise<any[]> { return this.ns('retrieveClaims'); }
    public async approveClaim(_id: string, _params?: { meta?: any }): Promise<IPlatformResponse> { return this.ns('approveClaim'); }
    public async rejectClaim(_id: string, _params: IClaimRejectParams): Promise<IPlatformResponse> { return this.ns('rejectClaim'); }
    public async rejectOrder(_id: string, _params: IOrderRejectParams): Promise<boolean> { return this.ns('rejectOrder'); }
    public async approveOrder(_id: string, _params?: { meta?: any }): Promise<boolean | IPlatformResponse> { return this.ns('approveOrder'); }
    public async retrieveOrderRejectionReasons(): Promise<IOrderRejectionReason[]> { return this.ns('retrieveOrderRejectionReasons'); }
    public async retrievePlatformInfos(): Promise<any> { return this.ns('retrievePlatformInfos'); }
    public async retrieveToken(_data: any): Promise<string | undefined> { return this.ns('retrieveToken'); }
    public async sendOrderShipping(_payload: ISendTrackingPayload): Promise<IPlatformResponse> { return this.ns('sendOrderShipping'); }
    public async sendOrderInvoice(_payload: ISendInvoicePayload): Promise<IPlatformResponse> { return this.ns('sendOrderInvoice'); }
    public async retrieveMessages(_query?: any): Promise<IMessage[]> { return this.ns('retrieveMessages'); }
    public async answerMessage(_id: string, _answer: string): Promise<boolean> { return this.ns('answerMessage'); }
    public async retrieveFinancials(_query: any): Promise<IFinancialTransaction[]> { return this.ns('retrieveFinancials'); }
    public async retrieveCargoInvoices(_serial: string): Promise<ICargoInvoice[]> { return this.ns('retrieveCargoInvoices'); }
    public async retrieveSettlementsByPaymentId(_id: string): Promise<IFinancialTransaction[]> { return this.ns('retrieveSettlementsByPaymentId'); }
`;

function indexTs(v) {
    const probe = `    /** testConnection: yan etkisiz, kimlik doğrulamalı en hafif GET (tek kayıt); gövde atılır; ASLA fırlatmaz (playbook §4.1). */
    public async testConnection(): Promise<TestConnectionResult> {
        return runConnectionProbe(integrationCode, async () => {
            // TODO(ön keşif): en ucuz okuma ucu, ör. await this.service.get('TODO/path?page=0&size=1', undefined, { operation: 'testConnection' });
            throw new IntegrationError('NOT_SUPPORTED', 'testConnection probe henüz yazılmadı', { integrationCode, operation: 'testConnection', clientId: this.params.clientId || 'UnknownClient' });
        });
    }
`;
    const head = `import Service from './services/Service';
import { runConnectionProbe, type TestConnectionResult } from '@integration/modules/common/adapter/testConnection';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { integrationCode, requiredSettings } from './constants';
`;
    if (isPlatformKind(v.kind)) {
        return fill(`${head}import {
    IPlatform, IBrand, ICategory, ICategoryAttribute, IOrderPackage, IBatchProcessResult, IExportStagedProduct, IMessage,
    IFetchProductsResult, IInternalConversionResult, IInternalResult, IPlatformProductSummary, IValidationResult, IVariant,
    IBatchCheckPayload, IPlatformResponse, ISendInvoicePayload, ISendTrackingPayload, IClaimRejectionReason, MappingKey,
} from '@interfaces/index';
import { IOrderRejectParams, IClaimRejectParams, IFinancialTransaction, ICargoInvoice, IOrderRejectionReason } from '@interfaces/platforms';

// __NAME__ IPlatform cephesi (INT-08 iskeleti): yalnız yönlendirme, iş mantığı YOK (playbook §3.1).
export default class __PASCAL__ implements IPlatform {
    public requiredSettings = requiredSettings;
    protected service: Service;

    constructor(protected params: any) {
        this.service = new Service(params);
    }

    public async init(): Promise<boolean> {
        const s = this.params.integrationSettings?.settings || {};
        return this.requiredSettings.every(k => !!s[k]);
    }

${probe}
    public getMatchKey(): MappingKey {
        return (this.params.integrationSettings?.settings?.MATCHKEY || 'barcode') as MappingKey;
    }

    private ns(op: string): never {
        throw new IntegrationError('NOT_SUPPORTED', op + ' bu entegrasyon için henüz uygulanmadı', { integrationCode, operation: op, clientId: this.params.clientId || 'UnknownClient' });
    }
${NS_PLATFORM}}
`, v);
    }
    // einvoice / shipping: IEInvoiceProvider / IShippingProvider portları henüz yok (INTEGRATION_CATEGORY_MODEL.md §5.1/§5.2);
    // ilk gerçek adaptörün PR'ında port + IntegrationFactory.getEInvoiceProvider/getShippingProvider açılır.
    return fill(`${head}
// __NAME__ cephesi (INT-08 iskeleti). TODO: ilk gerçek __KIND__ adaptörüyle birlikte port (__PORT__) açılır ve bu sınıf onu uygular
// (INTEGRATION_CATEGORY_MODEL.md §5; playbook §2 port eşlemesi, §3.3 satır 1). Yetenekler: ${Object.keys(CAPS[v.kind]).join(', ')}.
export default class __PASCAL__ {
    public requiredSettings = requiredSettings;
    protected service: Service;

    constructor(protected params: any) {
        this.service = new Service(params);
    }

    public async init(): Promise<boolean> {
        const s = this.params.integrationSettings?.settings || {};
        return this.requiredSettings.every(k => !!s[k]);
    }

${probe}}
`, { ...v, PORT: v.kind === 'einvoice' ? 'IEInvoiceProvider' : 'IShippingProvider' });
}

function readmeMd(v) {
    return fill(`# __NAME__ (__CODE__) — platforma özgü notlar

Playbook'u TEKRAR ETMEZ (\`docs/INTEGRATION_PLAYBOOK.md\`). Burada yalnız bu platformun tuzakları, alan anlamları ve bilinen sapmalar yazılır.
Ön keşif: \`docs/research/INTEGRATION___UPPER__.md\`.

- TODO: kimlik doğrulama tuzakları
- TODO: durum enum'ları ve eşleme kararları
`, v);
}

function conformanceTs(v) {
    const importPath = '@integration/modules/' + v.kind + '/' + v.code;
    return fill(`// INT-08 iskeleti: __NAME__ conformance bağlantısı. Gerçek ağ YOK (yerel sunucu; tests/conformance/kit.ts).
// "HENÜZ KAYITLI DEĞİL" modu: kod ADAPTER_KEYS'te yokken yalnız it.todo koşar (KNOWN_OPEN'a EKLENMEZ — ratchet yeni adaptörün açıkla
// gelmesini yasaklar). ADAPTER_KEYS satırı eklenince kit GERÇEKTEN koşar (başta kırmızı: spec TODO'larını doldur, C1-C14 yeşile döner).
import { describe, it } from '@jest/globals';
import __PASCAL__ from '${importPath}';
import Service from '${importPath}/services/Service';
import { ADAPTER_KEYS, type AdapterCode } from '@integration/modules/adapterKeys';
import { runAdapterConformance, type ConformanceSpec } from './kit';

const REGISTERED = (ADAPTER_KEYS as readonly { code: string }[]).some(k => k.code === '__CODE__');

const SECRET = 'SECRET-conformance-placeholder';
const params = (baseUrl: string) => ({
    clientId: 1,
    integrationSettings: { settings: { apikey: SECRET }, urls: { baseUrl } },
});
const todo = (what: string): never => { throw new Error('TODO(conformance spec): ' + what); };

const spec: ConformanceSpec = {
    code: '__CODE__' as AdapterCode,
    mock: { prefix: '__UPPER__' },
    timeoutEnv: '__UPPER___HTTP_TIMEOUT_MS',
    secrets: [SECRET],
    build: (baseUrl) => ({ platform: new __PASCAL__(params(baseUrl)), raw: new Service(params(baseUrl)) }),
    read: {
        call: (a) => a.platform.retrieveOrders({}),
        page: () => todo('page(index, pageCount, perPage): platformun resmi örneğinden sayfa gövdesi'),
        ids: () => todo('ids(result)'),
        packageShapeOk: () => todo('packageShapeOk(result)'),
        driftBody: () => todo('driftBody()'),
        missingIdBody: () => todo('missingIdBody()'),
        unknownEnumBody: () => todo('unknownEnumBody(raw)'),
        statusesOf: () => todo('statusesOf(result)'),
        pii: [],
    },
    // TODO: yazma yolu varsa \`write: { call, respond, shapeOk }\`; yoksa aşağıdaki ikisi (C5 taban sınıf POST'u).
    writeNotSupported: { call: (a) => a.platform.updateProductStock([]) },
    rawWrite: (a) => a.raw.post('TODO/path', {}, { operation: 'todo.write' }),
};

if (REGISTERED) {
    runAdapterConformance(spec);
} else {
    describe('__CODE__ conformance (henüz kayıtlı değil)', () => {
        it.todo('ADAPTER_KEYS satırını ekle (playbook §3.3 satır 4) -> kit C1-C14 koşar');
        it.todo('spec TODO alanlarını resmi dokümandan doldur (read.page/ids/driftBody/...)');
    });
}
`, v);
}

function researchMd(v) {
    return fill(`# INTEGRATION___UPPER__ — ön keşif (__DATE__, TODO araştıran)

Şablon: \`docs/INTEGRATION_PLAYBOOK.md\` §1. Yalnız resmi kaynak "doğrulandı" sayılır; bilinmeyenler \`DOĞRULANMADI\` diye işaretlenir.

## 0. Özet kararı
- Kategori: __KIND__
- Tahmini boy: S | M | L (§7.1 ölçütleriyle)       - Önerilen ilk kapsam: (yetenek listesi)
- Engelleyen insan kararı var mı? (hesap/sözleşme/ücret/entegratör başvurusu)

## 1. Resmi kaynaklar                      [ZORUNLU]
| URL | tür (reference/changelog/announcements/openapi/status) | resmi mi | izleme (auto/manual/off) | erişim notu |
|---|---|---|---|---|

## 2. Kimlik doğrulama                     [ZORUNLU]
- Tür: basic | api_key_header | oauth2_client_credentials | oauth2_authorization_code | custom (HMAC imza vb.)
- Tenant'tan alınacak alanlar (ad, anlam, sır mı?)
- Token ömrü / yenileme / iptal; zorunlu başlıklar (ör. User-Agent biçimi)
- Entegratör (bizim) kaydı gerekiyor mu? (entegratör kodu, onay süreci, süre)

## 3. Ortamlar                             [ZORUNLU]
- Prod host(lar), sandbox/stage host(lar), tenant'a özgü host var mı?
- Sandbox var mı, nasıl alınır, sandbox verisi gerçekçi mi?

## 4. Oran limitleri ve servis grupları   [ZORUNLU]
| Servis grubu | limit | pencere | kaynak | doğrulandı mı |
|---|---|---|---|---|
- 429 yanıtı: Retry-After başlığı var mı? Aynı gövde tekrar kısıtı var mı?

## 5. Sayfalama ve pencere                 [ZORUNLU]
- Tür: page+size | offset+limit | cursor/nextPageToken | tarih penceresi | yok
- Toplam sinyali (totalPages/totalElements/hasMore) var mı? Sayfa/pencere üst sınırları?
- Sipariş sorgusunda en büyük tarih aralığı, sıralama anahtarı, "son değişen" filtresi var mı?

## 6. Webhook / olay                       [ZORUNLU]
- Var/yok; imza yöntemi; tekrar gönderim ve sıra garantisi; hangi olaylar

## 7. İş akışları                          [kategoriye göre ZORUNLU, §2]
- Ürün: oluşturma senkron mu asenkron (batch/trackingId) mı? Onay süreci? Varyant modeli?
- Stok/fiyat: ayrı uç mu, toplu mu, gecikme?
- Sipariş: durum listesi (tam enum), paket/satır kimlikleri, iptal/kısmi iptal
- İade/talep: durumlar, onay/ret
- Fatura: fatura linki/dosyası pazaryerine nasıl bildirilir?
- Kargo: pazaryeri anlaşmalı kargo mu, satıcı kargo mu; takip no bildirimi
- (e-fatura) mükellef sorgusu, belge türleri, durum/iptal süreleri   (kargo) gönderi/etiket/takip/iptal/iade
- Tek yazar kararı (§2.1): ürün ana verisi / stok / fiyat / sipariş için kaynak: entegrasyonik | platform

## 8. Kategori / marka / öznitelik modeli  [marketplace + ecommerce ZORUNLU]
- Kategori ağacı derinliği, yaprak zorunlu mu, öznitelik türleri, varyant öznitelikleri, marka kimliği

## 9. Hata modeli                          [ZORUNLU]
- Hata gövdesi biçimi; iş hatası HTTP 200 ile mi dönüyor?; bilinen kodlar -> IntegrationError eşlemesi taslağı

## 10. Sürümleme ve kapanışlar             [ZORUNLU]
- Güncel sürüm, bilinen kapanış/brownout tarihleri, changelog/duyuru kanalı

## 11. Hukuki / KVKK / ticari notlar       [ZORUNLU]
- API kullanım koşulları (veri saklama, önbellek süresi, yeniden satış yasağı), maskelenmiş PII alanları, entegratör ücreti

## 12. Açık sorular / DOĞRULANMADI listesi
- (Boş değilse ilgili yetenek descriptor'da \`limited\` + \`note\` ile işaretlenir; \`rateLimits.verified:false\` kalır.)
`, v);
}

// ---- dosya planı ------------------------------------------------------------------------------------------------
function plan(v) {
    const base = 'backend/src/integration/modules/' + v.kind + '/' + v.code + '/';
    const files = {};
    files[base + 'constants.ts'] = constantsTs(v);
    files[base + 'descriptor.ts'] = descriptorTs(v);
    files[base + 'index.ts'] = indexTs(v);
    files[base + 'limits.ts'] = limitsTs(v);
    files[base + 'readme.md'] = readmeMd(v);
    files[base + 'services/Service.ts'] = serviceTs(v);
    files[base + 'contracts/index.ts'] = contractsTs(v);
    files[base + 'transformers/' + (v.kind === 'einvoice' ? 'Document' : v.kind === 'shipping' ? 'Shipment' : 'Order') + 'Transformer.ts'] = transformerTs(v);
    for (const [n, ep] of CONNECTORS[v.kind]) files[base + 'api/' + n + 'Connector.ts'] = connectorTs(v, n, ep);
    files['backend/tests/conformance/' + v.code + '.conformance.test.ts'] = conformanceTs(v);
    files['docs/research/INTEGRATION_' + v.upper + '.md'] = researchMd(v);
    return files;
}

// ---- ekrana basılacak parçacıklar (playbook §3.3, satır numaraları birebir) --------------------------------------
function snippets(v) {
    const ins = v.kind === 'shipping' ? 'shipment' : v.kind;
    const port = v.kind === 'einvoice' ? 'getEInvoiceProvider' : v.kind === 'shipping' ? 'getShippingProvider' : null;
    const s = [];
    const add = (n, file, body) => s.push('--- [' + n + '] ' + file + '\n' + body);
    add(4, 'backend/src/integration/modules/adapterKeys.ts  (ADAPTER_KEYS dizisine satır; 5-9 buradan türer)',
        "    { code: '" + v.code + "', category: '" + v.kind + "', mockPrefix: '" + v.upper + "', envPrefix: '" + v.upper + "', mockDefaultBase: 'http://localhost:6015/" + v.code + "', fallbackBaseUrl: 'https://TODO-prod-host' },");
    add(3, 'backend/src/integration/modules/common/security/outboundHosts.ts  (ALLOWED_OUTBOUND_HOSTS içine; güvenlik incelemesi)',
        "    " + v.code + ": ['TODO-prod-host', 'TODO-sandbox-host'],");
    add(1, 'backend/src/integration/modules/IntegrationFactory.ts  (import + switch case' + (port ? ' + ' + port + '()' : '') + ')',
        "import " + v.pascal + " from './" + v.kind + "/" + v.code + "';\n            case '" + v.code + "': moduleInstance = new " + v.pascal + "(config); break;");
    add(2, 'backend/src/integration/catalog/IntegrationDescriptorRegistry.ts  (import + INTEGRATION_DESCRIPTORS girdisi)',
        "import " + v.pascal + "Descriptor from '@integration/modules/" + v.kind + "/" + v.code + "/descriptor';\n    " + v.pascal + "Descriptor,");
    add(8, 'backend/src/integration/config/catalog/integrationHttp.ts  (perIntegration değerleri: timeoutMs / maxConcurrent / ratePerMin)',
        "    " + v.code + ": 30000,   // resilience.timeoutMs\n    " + v.code + ": 10,      // resilience.maxConcurrent\n    " + v.code + ": 0,       // resilience.ratePerMin (0 = sınırsız; belgelenmiş limitin ALTINDA bir değer yaz)");
    add(9, 'backend/src/config/env.ts  (httpTimeoutMs haritası; ' + v.upper + '_HTTP_TIMEOUT_MS şema girdisi + okuma)',
        "    " + v.upper + "_HTTP_TIMEOUT_MS  (env şeması)\n    " + v.code + ": e." + v.upper + "_HTTP_TIMEOUT_MS as number | undefined,");
    add(10, 'backend/src/operations/tenant/TenantProvisioningService.ts  (seed; status:false, kimlik bilgisi YOK)',
        "    { status: false, type: '" + ins + "', integrationCode: '" + v.code + "' },\n    " + ins + ": [{ order: N, status: false, code: '" + v.code + "', settings: { test: 1 } }],");
    add(13, 'backend/src/utils/secretKeys.ts  (yalnız YENİ sır alan adı varsa INTEGRATION_SECRET_FIELD_NAMES)',
        "    'apikey',  // constants.ts requiredSettings'teki sır alan adları; mevcut listede yoksa ekle");
    add(15, 'backend/tests/tools/run-tests.js  (MODULES haritası)',
        "  " + v.code + ": ['[" + v.code.charAt(0) + v.code.charAt(0).toUpperCase() + "]" + v.code.slice(1) + "'],");
    add(11, 'backend/src/capabilities/domains/*.ts', '(yalnız YENİ RPC açılıyorsa; genel RPC\'ler integrationCode parametreli — CAPABILITY_CHECKLIST.md)');
    add(12, 'backend/src/api/rpc/handlers/integration-service.ts', '(yalnız FE yetkilendirme adresi gibi bir `urls` alt kümesi gerekiyorsa FE_VISIBLE_PLATFORM_URLS)');
    add(14, 'backend/src/api/webhooks/WebhookApiManager.ts', '(yalnız webhook varsa, playbook §4.10)');
    add('16-20', 'frontend/src + site/src  (bulut önyüz işi, docs/CLOUD_BRIEFS.md)',
        "  16 frontend/src/components/integrations/" + ins + "/" + v.pascal + "Component.vue + ilgili *View.vue dalı\n" +
        "  17 frontend/src/plugins/locales/{tr,en}.json: her requiredSettings alanı için integrations.<alan küçük harf> (integrations." + v.code + ".* KULLANILMAZ)\n" +
        "  18 frontend/src/navigation/screens.ts allowed enum'ları ('" + v.code + "'); design/tokens/palette.ts, ds/EkPlatformMark.vue (renk/logo)\n" +
        "  19 frontend/src/components/adminPanel/integrations/settingsCatalogMirror.ts (ayar kataloğu aynası, ADR-0020)\n" +
        "  20 site/src/data/{integrations,capabilities,connect,faq,channel-colors}.ts (tanıtım kaydı)");
    add('21-22', 'INTEGRATIONS_REGISTRY.md + docs/INTEGRATION_PLAYBOOK.md Ek A',
        "### x.y " + v.name + " — M/" + v.kind + "/" + v.code + "/\n  | " + v.name + " | " + v.kind + " | " + v.code + " | roadmap | 0.1.0 | INTEGRATION_" + v.upper + ".md |");
    return s;
}

function checklist(v) {
    return [
        '1. docs/research/INTEGRATION_' + v.upper + '.md ön keşfini doldur (DOĞRULANMADI\'lar işaretli) -> descriptor/constants.requiredSettings',
        '2. Yukarıdaki parçacıkları yapıştır (en az 4, 3, 1, 2, 8, 9, 10, 15); ADAPTER_KEYS satırı eklenince conformance testi gerçekten koşar',
        '3. npm run test:module -- ' + v.code + '   (başta kırmızı olabilir; spec TODO alanlarını resmi örneklerle doldur)',
        '4. Sözleşmeler (contracts/*.ts) + fixture (tests/fixtures/' + v.code + '/, ilk satırda _source) + transformer testleri',
        '5. Connector/service/transformer -> conformance kiti yeşil (playbook §5.2)',
        '6. npx jest tests/static (adapterKeys + integrationPlaybook statik testleri eksik dokunma noktalarını ADIYLA raporlar)',
        '7. Frontend/site kayıtları (16-20, bulut işi), INTEGRATIONS_REGISTRY.md + playbook Ek A + değişiklik günlüğü (aynı PR)',
        '8. DoD kopyala-yapıştır listesi (playbook §4) PR açıklamasına',
    ];
}

// ---- ana akış ---------------------------------------------------------------------------------------------------
function run(argv, io) {
    const out = io && io.log ? io.log : console.log;
    const a = parseArgs(argv);
    if (!a.kind || !a.code) throw new UsageError('kullanım: integration:new -- --kind <' + KINDS.join('|') + '> --code <kod> [--name "<Ad>"] [--dry-run]');
    const kind = a.kind === 'cargo' ? 'shipping' : a.kind;
    if (!KINDS.includes(kind)) throw new UsageError('geçersiz --kind: ' + a.kind + ' (beklenen: ' + KINDS.join(', ') + ')');
    if (!CODE_RE.test(a.code)) throw new UsageError('geçersiz --code: ' + a.code + ' (küçük harf+rakam, harfle başlar, 2-24 karakter: ' + CODE_RE + ')');
    if (existingCodes().includes(a.code)) throw new UsageError('kod zaten kayıtlı (ADAPTER_KEYS): ' + a.code);
    const modulesRoot = path.join(BACKEND, 'src/integration/modules');
    for (const k of KINDS) if (fs.existsSync(path.join(modulesRoot, k, a.code))) throw new UsageError('modül klasörü zaten var: modules/' + k + '/' + a.code);

    const v = { kind, code: a.code, name: a.name || cap(a.code), pascal: cap(a.code), upper: a.code.toUpperCase(), date: new Date().toISOString().slice(0, 10) };
    v.DATE = v.date;
    const vars = { KIND: v.kind, CODE: v.code, NAME: v.name, PASCAL: v.pascal, UPPER: v.upper, DATE: v.date };
    const files = plan({ ...v, ...vars });
    const root = a.outRoot ? path.resolve(a.outRoot) : REPO;
    const rels = Object.keys(files);
    for (const rel of rels) if (fs.existsSync(path.join(root, rel))) throw new UsageError('dosya zaten var, üzerine yazılmaz: ' + rel);
    // modül klasörü (out-root'ta) zaten varsa da reddet
    const modDir = path.join(root, 'backend/src/integration/modules', kind, a.code);
    if (fs.existsSync(modDir)) throw new UsageError('modül klasörü zaten var: ' + path.relative(root, modDir));

    out((a.dryRun ? '[dry-run] ' : '') + 'Üretilecek dosyalar (' + rels.length + '):');
    for (const rel of rels) out('  + ' + rel);
    if (a.dryRun) { out('[dry-run] hiçbir şey yazılmadı.'); return { files: rels, written: false }; }

    for (const rel of rels) {
        const p = path.join(root, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, files[rel], { encoding: 'utf8', flag: 'wx' });
    }
    out('\nYazıldı: ' + rels.length + ' dosya. Mevcut hiçbir dosya DEĞİŞTİRİLMEDİ.');
    out('\n=== YAPIŞTIRILACAK PARÇACIKLAR (playbook §3.3 satır numaralarıyla; TODO-host değerlerini ön keşfe göre doldur) ===\n');
    for (const sn of snippets({ ...v, ...vars })) out(sn + '\n');
    out('=== SONRAKİ ADIMLAR ===');
    for (const c of checklist(v)) out(c);
    return { files: rels, written: true };
}

module.exports = { run, parseArgs, UsageError, plan, snippets };

if (require.main === module) {
    try {
        run(process.argv.slice(2));
    } catch (e) {
        if (e instanceof UsageError) { console.error('HATA: ' + e.message); process.exit(1); }
        throw e;
    }
}
