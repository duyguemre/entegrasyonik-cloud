// [ADR-0030 X4] Müşteri (app) yüzeyindeki iş yazmalarının denetim kaydı (`app.write`), backoffice desenini genelleştirir.
//
// Kapsam kuralı: yetenek kaydında `effect !== 'read'` olan (write/propose/destructive) RPC'ler; okumalar ve kayıtsız (drift) RPC'ler YAZILMAZ.
// Hariç: platformAdmin kademeli işlemler (selectStore; kendi olayı var), `AdminService` (kendi `admin.write` kaydı var), kişisel tercih/kabuk yazmaları (`scope:'user'`: favori, bildirim tercihi... -- gürültü;
// parola değişimi kendi `user.password_change` olayını yazar).
// Önce/sonra YALNIZ aşağıdaki dar alan tablosunda (TEK yer, genişletilebilir): stok, fiyat, ürün durumu, stok politikası, kullanıcı rolü/durumu.
// Kimlik bilgisi/ayar alanlarında değer ASLA yazılmaz; yalnız değişen alan ADLARI (`changed`). Toplu işlemde yalnız sayı. Tam belge anlık görüntüsü YOK.
// Yazım AuditLogger üzerinden best-effort/asenkrondur (isteği düşürmez). "Önce" değeri yalnız tabloda `load` tanımlı işlemlerde, tek dar
// projeksiyonlu okumayla ve zaman aşımıyla alınır; hata olursa "önce" alanı atlanır, işlem etkilenmez.
import { CAPABILITY_BY_RPC } from '../capabilities';
import type { AuditEntry } from '@services/audit/AuditLogger';
import { maskLogText } from '@platform/core/logger/redact';
import { getRequestId } from '@platform/core/context';

type Primitive = string | number | boolean;

interface FieldSpec {
    /** meta anahtar adı (`a_<name>` sonra, `b_<name>` önce). */
    name: string;
    /** İstekteki (gövde) nokta yolu; değer "sonra" olarak yazılır. */
    from?: string;
    /** Sabit "sonra" değeri (ör. suspendUser => 'suspended'). */
    constant?: Primitive;
    /** `load` çıktısındaki nokta yolu; "önce" değeri. */
    before?: string;
}

interface WriteAuditSpec {
    /** Hedef kimlikleri (istek gövdesi nokta yolları; en çok 2, düz kimlik/kod). */
    targets?: string[];
    fields?: FieldSpec[];
    /** İstekte bu yolun altındaki nesne kimlik bilgisi/ayar: yalnız değişen ALAN ADLARI yazılır (değer asla; 'sensitive' = değişmedi). */
    changedKeysAt?: string;
    /** Toplu işlem: bu yoldaki dizinin uzunluğu `count` olarak yazılır. */
    countAt?: string;
    /** `fields` için nesne alanı: bu yoldaki nesnenin ilkel anahtarları (en çok 4) alan olarak alınır, önce değeri `beforeObj`'ten. */
    objectAt?: { path: string; beforeObj: string };
    /** Yalnız tek öğeli işlemde: `fields`'a ek olarak dizideki tek öğeden `from` alınır (yol `[]` içermez, öğe köküne göredir). */
    singleOf?: string;
    load?: (db: any, request: any) => Promise<any>;
}

/** Yükleyicilerde sorgu enjeksiyonunu önler: yalnız düz string (nesne/operatör => geçersiz sorgu değeri). */
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const PRODUCT_TARGET = ['productId', '_id', 'productInfo._id'];

/** TEK alan tablosu: `Servis/operasyon` -> denetlenecek dar alanlar. Tabloda OLMAYAN yazmalar yine `app.write` (kim/ne/sonuç/reqId) yazar, alan yazmaz. */
export const WRITE_AUDIT_FIELDS: Readonly<Record<string, WriteAuditSpec>> = {
    'ProductService/updateOnsale': {
        targets: ['_id'],
        fields: [{ name: 'onsale', from: 'onsale', before: 'onsale' }],
        load: async (db, req) => await db.getProductModel().findOne({ _id: str(req?._id) }, { onsale: 1 }).lean(),
    },
    'ProductService/updateProduct': { targets: ['productInfo._id'] },
    'ProductService/saveProduct': { targets: ['productInfo._id'] },
    'VariantService/updateVariants': {
        targets: ['productId'],
        countAt: 'variants',
        singleOf: 'variants',
        fields: [
            { name: 'stock', from: 'stock', before: 'stock' },
            { name: 'salePrice', from: 'prices.salePrice', before: 'prices.salePrice' },
        ],
        load: async (db, req) => {
            const vid = Array.isArray(req?.variants) && req.variants.length === 1 ? str(req.variants[0]?._id) : undefined
            if (!vid || !str(req.productId)) return undefined
            // [DB-07] kanonik kaynak `Variants` koleksiyonu (gömülü Product.variants yoktur)
            return await db.getVariantModel().findOne({ _id: str(vid), productId: str(req.productId) }, { stock: 1, prices: 1 }).lean()
        },
    },
    'VariantService/batchProcessUpdate': { targets: ['productId'], countAt: 'selectedVariants' },
    'IntegrationService/saveTenantStockPolicy': {
        fields: [
            { name: 'primaryChannel', from: 'primaryChannel', before: 'stockPolicy.primaryChannel' },
            { name: 'lowStockThreshold', from: 'lowStockThreshold', before: 'stockPolicy.lowStockThreshold' },
        ],
        load: async (db) => await db.getClientIntegrationModel().findOne({}, { 'stockPolicy.primaryChannel': 1, 'stockPolicy.lowStockThreshold': 1 }).lean(),
    },
    'IntegrationService/saveChannelStockPolicy': {
        targets: ['integrationCode'],
        objectAt: { path: 'stockPolicy', beforeObj: 'settings.stockPolicy' },
        load: async (db, req) => {
            const doc: any = await db.getClientIntegrationModel().findOne({ 'marketplace.code': str(req?.integrationCode) }, { marketplace: { $elemMatch: { code: str(req?.integrationCode) } } }).lean()
            return doc?.marketplace?.[0]
        },
    },
    // COM-04: komisyon override oranı (finansal yapılandırma; not/serbest metin yazılmaz)
    'FinancialService/setCommissionOverride': {
        targets: ['integrationCode', 'platformCategoryId'],
        fields: [{ name: 'rate', from: 'rate', before: 'rate' }, { name: 'scope', from: 'scope' }],
        load: async (db, req) => await db.getCommissionOverrideModel().findOne({
            integrationCode: str(req?.integrationCode).trim().toLowerCase(), scope: str(req?.scope),
            platformCategoryId: str(req?.scope) === 'category' ? str(req?.platformCategoryId).trim() : null,
        }, { rate: 1 }).lean(),
    },
    'FinancialService/deleteCommissionOverride': {
        targets: ['id'],
        load: async (db, req) => await db.getCommissionOverrideModel().findOne({ _id: str(req?.id) }, { rate: 1 }).lean(),
    },
    // Entegrasyon ayarı/kimlik bilgisi: yalnız değişen alan adları
    'IntegrationService/saveClientMarketplaceSettings': { targets: ['clientMarketplace.code'], changedKeysAt: 'clientMarketplace.settings' },
    'IntegrationService/saveClientECommerceSettings': { targets: ['clientECommerce.code'], changedKeysAt: 'clientECommerce.settings' },
    'IntegrationService/saveClientErpSettings': { targets: ['clientErp.code'], changedKeysAt: 'clientErp.settings' },
    'IntegrationService/saveClientShipmentSettings': { targets: ['clientShipment.code'], changedKeysAt: 'clientShipment.settings' },
    'IntegrationService/generateWebhookToken': {},
    // Kullanıcı rol/durum
    'UserService/updateUser': {
        targets: ['user._id'],
        fields: [{ name: 'role', from: 'user.roleCode', before: 'roleCode' }],
        load: async (db, req) => await db.getUserModel().findOne({ _id: str(req?.user?._id) }, { roleCode: 1 }).lean(),
    },
    'UserService/suspendUser': { targets: ['userId'], fields: [{ name: 'status', constant: 'suspended' }] },
    'UserService/reactivateUser': { targets: ['userId'], fields: [{ name: 'status', constant: 'active' }] },
    'UserService/deleteUser': { targets: ['userId'] },
};

/** Ürün yazmalarında hedef için kullanılan ortak yol listesi (tablo dışı yazmalarda da ürün kimliği denenir). */
const DEFAULT_TARGETS = PRODUCT_TARGET;

const LOAD_TIMEOUT_MS = 500;
const MAX_STR = 40;

function getPath(obj: any, path: string): unknown {
    let cur = obj
    for (const seg of path.split('.')) {
        if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
        cur = cur[seg]
    }
    return cur
}

/** Yalnız güvenli ilkel değerler; string maskelenir ve kırpılır (PII/sır deseni maskesi). */
function safeValue(v: unknown): Primitive | undefined {
    if (typeof v === 'boolean') return v
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
    if (typeof v === 'string') return maskLogText(v).slice(0, MAX_STR)
    if (v !== null && v !== undefined && typeof (v as any).toString === 'function' && (v as any)._bsontype === 'ObjectId') return String(v)
    return undefined
}

export interface AppWritePlan {
    rpc: string;
    service: string;
    operation: string;
    effect: string;
    spec: WriteAuditSpec;
}

/** Senkron, G/Ç yok. Denetlenmeyecekse undefined. */
export function planAppWriteAudit(service: string, operation: string, principal: any): AppWritePlan | undefined {
    if (service === 'AdminService') return undefined
    const rpc = service + '/' + operation
    const cap = CAPABILITY_BY_RPC.get(rpc)
    if (!cap || cap.effect === 'read') return undefined
    if (cap.scope === 'user') return undefined
    if (cap.minTier === 'platformAdmin') return undefined // platform işlemleri (selectStore vb.) kendi/backoffice olaylarını yazar
    if (!principal) return undefined // kimliksiz (açık) operasyonlar kendi olaylarını yazar
    return { rpc, service, operation, effect: cap.effect, spec: WRITE_AUDIT_FIELDS[rpc] ?? {} }
}

/** "Önce" değerini tek dar okumayla alır; hata/zaman aşımı => undefined (işlem etkilenmez). */
export async function captureBefore(plan: AppWritePlan, tenantId: unknown, request: any): Promise<any> {
    if (!plan.spec.load || typeof tenantId !== 'number') return undefined
    let timer: NodeJS.Timeout | undefined
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- TS6-01: node16 CJS, tembel yukleme (dinamik import yerine)
        const { DatabaseManagerInstance } = (require('@database/DatabaseManager') as typeof import('@database/DatabaseManager'))
        const work = (async () => {
            const db = await DatabaseManagerInstance.getClientDB(tenantId)
            return db ? await plan.spec.load!(db, request) : undefined
        })()
        const timeout = new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), LOAD_TIMEOUT_MS) })
        return await Promise.race([work, timeout])
    } catch {
        return undefined
    } finally {
        if (timer) clearTimeout(timer)
    }
}

function errorCode(e: any): string | undefined {
    const c = typeof e?.code === 'string' ? e.code : typeof e?.statusCode === 'number' ? String(e.statusCode) : undefined
    return c ? maskLogText(c).slice(0, 40) : undefined
}

/** Denetim kaydını kurar (saf). `error` verilirse sonuç hata; 4xx => 'fail', diğer => 'error'. */
export function buildAppWriteEntry(plan: AppWritePlan, request: any, before: any, principal: any, ip: string | undefined, error?: any): AuditEntry {
    const { spec } = plan
    const meta: Record<string, Primitive> = { service: plan.service, operation: plan.operation, effect: plan.effect }
    const targets = spec.targets ?? DEFAULT_TARGETS
    let ti = 0
    for (const p of targets) {
        if (ti >= 2) break
        const v = safeValue(getPath(request, p))
        if (v !== undefined && v !== '') { meta[ti === 0 ? 'target' : 'target2'] = v; ti++ }
    }
    if (spec.countAt) {
        const arr = getPath(request, spec.countAt)
        if (Array.isArray(arr)) meta.count = arr.length
    }
    const single = spec.singleOf ? getPath(request, spec.singleOf) : undefined
    const singleItem = Array.isArray(single) && single.length === 1 ? single[0] : undefined
    const bulk = spec.countAt !== undefined && !(spec.singleOf && singleItem !== undefined)
    if (!bulk) {
        for (const f of spec.fields ?? []) {
            const src = spec.singleOf ? singleItem : request
            const after = f.constant !== undefined ? f.constant : f.from ? safeValue(getPath(src, f.from)) : undefined
            if (after === undefined) continue
            meta['a_' + f.name] = after
            const b = f.before ? safeValue(getPath(before, f.before)) : undefined
            if (b !== undefined) meta['b_' + f.name] = b
        }
        if (spec.objectAt) {
            const obj = getPath(request, spec.objectAt.path)
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                let n = 0
                for (const [k, v] of Object.entries(obj)) {
                    if (n >= 3) break
                    const name = maskLogText(k).replace(/[^A-Za-z0-9_]/g, '').slice(0, 30)
                    const after = safeValue(v)
                    if (!name || after === undefined) continue
                    meta['a_' + name] = after
                    const b = safeValue(getPath(before, spec.objectAt.beforeObj + '.' + k))
                    if (b !== undefined) meta['b_' + name] = b
                    n++
                }
            }
        }
    }
    if (spec.changedKeysAt) {
        const obj = getPath(request, spec.changedKeysAt)
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            const names = Object.entries(obj)
                .filter(([, v]) => v !== 'sensitive' && v !== undefined)
                .map(([k]) => maskLogText(k).replace(/[^A-Za-z0-9_]/g, '').slice(0, 30))
                .filter(Boolean)
                .slice(0, 8)
            meta.credentialsChanged = names.length > 0
            if (names.length) meta.changed = names.join(',')
        }
    }
    if (error !== undefined) { const c = errorCode(error); if (c) meta.code = c }
    const imp = principal?.imp === true
    // [B3] Destek oturumunda eylemi yapan platform yöneticisidir (`sub`); adına işlem yapılan tenant `onBehalfOf`, gerekçe `impReason` (meta).
    if (imp && typeof principal?.impReason === 'string' && principal.impReason) meta.impReason = principal.impReason.slice(0, 200)
    return {
        event: 'app.write',
        result: error === undefined ? 'ok' : (typeof error?.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500 ? 'fail' : 'error'),
        sub: principal?.sub, tid: principal?.tid, ip, surface: 'app',
        actorType: imp ? 'impersonator' : 'user', imp: imp ? true : undefined, onBehalfOf: imp ? principal?.tid : undefined,
        reqId: getRequestId(), meta,
    }
}
