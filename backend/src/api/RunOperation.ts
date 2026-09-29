import MicroserviceWrapper from "./ApiWrapper";
import Apis from './index'
import { ApplicationError } from './Security';
import { AuditLogger } from '@services/audit/AuditLogger';
import { IMAGE_API_TARGETS, OPEN_OPERATIONS, PSEUDO_SERVICES, getRequiredTier, isAllowed, resolveTier } from './operationPolicy';
import { CAPABILITY_BY_RPC } from '../capabilities';
import { recordHttpRequestMetric } from '@platform/runtime/metrics';
import { config } from '@config';
import { EntitlementService } from '@services/billing/EntitlementService';
var services = new Map<string, MicroserviceWrapper>()

/**
 * [ADR-0019 §2, Aşama A — MİNİMAL KANCA, log-only/warn, ENFORCE DEĞİL] Yetkilendirilmiş bir RPC çağrısının kayıtlı
 * bir yeteneğe çözülüp çözülmediğini gözlemler. Aşama A'da `OPERATION_POLICY` zaten `CAPABILITY_BY_RPC`'den türetildiği
 * için (bkz. `operationPolicy.ts`) bu normalde HİÇBİR ZAMAN tetiklenmez; sahte/izole test kayıtları (ör.
 * `run-operation.test.ts`'in `Object.assign(OPERATION_POLICY, ...)` ile eklediği geçici sahte servisler) veya ileride
 * `OPERATION_POLICY`nin türetmeden sapması (drift) durumunda TEK SEFER uyarır. Davranışı ASLA etkilemez: hata yutulur,
 * çağrıyı bloklamaz/geciktirmez.
 */
const warnedRpcDrift = new Set<string>();
function observeCapabilityResolution(service: string, operation: string): void {
    try {
        const rpc = service + '/' + operation;
        if (!CAPABILITY_BY_RPC.has(rpc) && !warnedRpcDrift.has(rpc)) {
            warnedRpcDrift.add(rpc);
            console.warn(`[ADR-0019 capability-drift] Yetkili RPC bir yetenek kaydına ÇÖZÜLEMEDİ (yalnız gözlem, engellenmedi): ${rpc}`);
        }
    } catch { /* gözlem asla çağrıyı etkilemez */ }
}

function prepareServices() {
    for (const [service, serviceClass] of Object.entries(Apis)) {
        if (serviceClass)
            services.set(service, new MicroserviceWrapper(serviceClass));
    }
}

function getService(serviceName: string): MicroserviceWrapper | undefined {
    if (services.size == 0) {
        prepareServices()
    }
    return services.get(serviceName)
}

/** Açık operasyonlar (login/register/getCaptcha/logout): kimliksiz çalışır, politika kaydına takılmaz. Tam (büyük/küçük harf duyarlı) eşleşme. */
function isOpenOperation(service: string, operation: string): boolean {
    return OPEN_OPERATIONS.includes(service + '/' + operation);
}

/**
 * ADR-0001 (Karar 7, 8): varsayılan ret. Kayıtta olmayan (servis, operasyon) -> 403; kademe yetmiyorsa -> 403.
 * Çağrı, servis örneklenmeden (init/DB erişimi dahil hiçbir şey çalışmadan) reddedilir.
 * Yetki kararı yalnızca sunucuda kurulan userContext + doğrulanmış principal'a dayanır.
 */
function authorize(policyService: string, policyOperation: string, userContext: any, principal: any) {
    const required = getRequiredTier(policyService, policyOperation)
    if (required === undefined) throw new ApplicationError('Forbidden', 403)
    if (!principal) throw new ApplicationError('Token is undefined', 401)
    if (!isAllowed(required, resolveTier(userContext, principal))) throw new ApplicationError('Forbidden', 403)
    observeCapabilityResolution(policyService, policyOperation)
}

/**
 * [ADR-0008 §3(a), BAYRAK KORUMALI (`ENTITLEMENT_GUARD_ENABLED`, varsayılan `false`)] `authorize()` BAŞARILI olduktan
 * SONRA, işlem gerçek işi yapmadan ÖNCE çağrılır. Bayrak KAPALIYKEN (varsayılan) HİÇBİR ŞEY yapmaz -- mevcut davranış
 * birebir korunur (Protokol 13: bu görev öncesi karakterizasyon testleri DEĞİŞMEZ).
 *
 * Yeteneğin `effect` alanına (capabilities/types.ts; ADR-0019) göre erişim boyutu türetilir: `read` -> `read`,
 * diğerleri (`propose`/`write`/`destructive`) -> `write` (ADR-0008 §3 tablosunun "Web/MCP okuma" / "Yazma" iki
 * sütununa karşılık gelir; API katmanında `engine` boyutu KULLANILMAZ -- bu, IntegrationEngine iş planlayıcısının
 * kendi kancasıdır, bkz. Dispatcher.ts/OrderQueueProducer.ts). `EntitlementService.checkAccess` (ADR §3: "uygulama
 * noktası tek yerdir") TEK karar noktasıdır; burada karar İCAT EDİLMEZ, yalnızca çağrılır.
 *
 * `billingExempt` (legacy) tenant'lar `computeAccess` içinde ZATEN her zaman tam erişimlidir (TrialExpiryJob ile
 * aynı güvenlik ağı) -- burada AYRICA kontrol edilmez.
 *
 * Fail-OPEN koşulları (yeni bir kısıtlama yüzeyi İCAT ETMEMEK için kasıtlı): tenant kimliği sayısal değilse (ör.
 * süper yönetici henüz mağaza seçmediyse, `userContext.order` yoktur) veya RPC bir yetenek kaydına ÇÖZÜLEMİYORSA
 * (ADR-0019 capability-drift; `observeCapabilityResolution` zaten ayrıca gözlemliyor) guard karar ÜRETMEZ.
 */
async function enforceEntitlementGuard(service: string, operation: string, tenantId: unknown): Promise<void> {
    if (!config.flags.entitlementGuardEnabled) return
    if (typeof tenantId !== 'number') return
    const capability = CAPABILITY_BY_RPC.get(service + '/' + operation)
    if (!capability) return
    const dimension = capability.effect === 'read' ? 'read' : 'write'
    const decision = await EntitlementService.checkAccess(tenantId, dimension)
    if (!decision.allowed) {
        throw new ApplicationError(decision.reason ?? 'Aboneliğiniz bu işlem için yeterli erişime sahip değil.', 403, 'SUBSCRIPTION_RESTRICTED')
    }
}

/** Sunucu tarafı istek üst verisi (ör. istemci IP'si); istek gövdesinden ASLA alınmaz. */
export interface RequestMeta { ip?: string }

async function execute(userContext: any, service: string, operation: string, request: any, principal: any, requestMeta?: RequestMeta) {
    let microServiceWrapper = getService(service)
    if (!microServiceWrapper) throw new ApplicationError('Forbidden', 403)

    const clientId = userContext?.order;
    const { userContext: _uc, principal: _pr, requestMeta: _rm, order: _o, clientId: bodyClientId, ...safeRequest } = (request ?? {}) as any;
    if (service === 'SecurityService' && operation === 'selectStore' && bodyClientId !== undefined) {
        safeRequest.clientId = bodyClientId;
    }
    const enhancedRequest: any = { ...safeRequest, userContext, principal };
    if (requestMeta) enhancedRequest.requestMeta = requestMeta;
    return await microServiceWrapper.process(clientId, operation, enhancedRequest)
}

/** ADR-0001 Karar 11: AdminService'in tüm YAZMA işlemleri (get/retrieve önekli olmayanlar) audit log'a yazılır. */
function isAdminWrite(service: string, operation: string): boolean {
    return service === 'AdminService' && !/^(get|retrieve)/i.test(operation)
}

async function executeAudited(userContext: any, service: string, operation: string, request: any, principal: any, requestMeta?: RequestMeta) {
    if (!isAdminWrite(service, operation)) return await execute(userContext, service, operation, request, principal, requestMeta)
    const base = { sub: principal?.sub, tid: principal?.tid, ip: requestMeta?.ip }
    try {
        const resp = await execute(userContext, service, operation, request, principal, requestMeta)
        void AuditLogger.log({ event: 'admin.write', result: 'ok', ...base, meta: { service, operation } })
        return resp
    } catch (e) {
        void AuditLogger.log({ event: 'admin.write', result: 'error', ...base, meta: { service, operation } })
        throw e
    }
}

/**
 * ADR-0001 (Karar 5): tenant kimliği YALNIZCA doğrulanmış principal'dan (authenticate middleware'inin kurduğu
 * `userContext.order` = doğrulanmış `tid`) gelir. İstek gövdesindeki `userContext`, `principal`, `order`, `clientId`
 * alanları sunucuda ezilir/atılır. İstisna: SecurityService.selectStore hedef tenant'ı gövdedeki `clientId` ile
 * bildirir (bir tenant kimliği kaynağı DEĞİL, işlem parametresi; yetki kontrolü OPERATION_POLICY'de `platformAdmin`).
 *
 * ADR-0001 (Karar 8): jenerik RPC yalnızca OPERATION_POLICY kaydındaki operasyonları çağırır (varsayılan ret, 403).
 */
export default async function run(userContext: any, service: string, operation: string, request: any, principal?: any, requestMeta?: RequestMeta) {
    // ADR-0017 Karar 2.2 (RED -- HTTP): `http_requests{op,statusClass}` + süre histogramı. `tenantId` etiketi
    // BİLEREK YOK (Karar 2.3, kardinalite kuralı). Metrik kaydı ASLA fırlatmaz/beklemez (senkron, DB YOK) --
    // hatayı YENİDEN fırlatmadan önce ölçülür, davranış/istisna zinciri DEĞİŞMEZ.
    const op = `${service}/${operation}`;
    const startedAt = Date.now();
    try {
        const result = await runInner(userContext, service, operation, request, principal, requestMeta);
        recordHttpRequestMetric(op, 200, Date.now() - startedAt);
        return result;
    } catch (e: any) {
        const statusCode = typeof e?.statusCode === 'number' ? e.statusCode : 500;
        recordHttpRequestMetric(op, statusCode, Date.now() - startedAt);
        throw e;
    }
}

async function runInner(userContext: any, service: string, operation: string, request: any, principal?: any, requestMeta?: RequestMeta) {
    if (!isOpenOperation(service, operation)) {
        // Sözde-servisler (ImageApi) jenerik RPC ile çağrılamaz; yalnızca runImageApi ile
        if (PSEUDO_SERVICES.includes(service)) throw new ApplicationError('Forbidden', 403)
        authorize(service, operation, userContext, principal)
        await enforceEntitlementGuard(service, operation, userContext?.order)
    }
    return await executeAudited(userContext, service, operation, request, principal, requestMeta)
}

/**
 * ADR-0001 (Karar 9): ImageApiManager rotaları aynı politika kaydını `ImageApi` sözde-servisi altında kullanır.
 * Gerçek hedef servis/metot IMAGE_API_TARGETS'tan gelir (jenerik RPC'ye açılmaz).
 */
export async function runImageApi(route: string, userContext: any, request: any, principal?: any) {
    const target = Object.prototype.hasOwnProperty.call(IMAGE_API_TARGETS, route) ? IMAGE_API_TARGETS[route] : undefined
    if (!target) throw new ApplicationError('Forbidden', 403)
    authorize('ImageApi', route, userContext, principal)
    await enforceEntitlementGuard('ImageApi', route, userContext?.order)
    return await execute(userContext, target[0], target[1], request, principal)
}
