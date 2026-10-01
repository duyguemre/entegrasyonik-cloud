import { impersonationDenial } from './impersonationPolicy'
import MicroserviceWrapper from "./ApiWrapper";
import Apis from './index'
import { ApplicationError } from '@platform/core/security/Security';
import { AuditLogger } from '@services/audit/AuditLogger';
import { IMAGE_API_TARGETS, OPEN_OPERATIONS, PSEUDO_SERVICES, getRequiredPermission, getRequiredTier, isAllowed, resolveTier } from './operationPolicy';
import { can } from '@platform/core/authz/can';
import { CAPABILITY_BY_RPC } from '../../capabilities';
import { recordHttpRequestMetric } from '@platform/runtime/metrics';
import { config } from '@config';
import { validateRpcRequest } from './requestValidation';
import { EntitlementService } from '@services/billing/EntitlementService';
import type { TenantEntry } from '@database/TenantRegistry';
import { buildRequestContext } from './requestContext';
import { getRequestId } from '@platform/core/context';
import { isSensitiveRead } from '../admin/stepUp';
import { withIdempotency } from './idempotencyGuard';
import { enforceIntakeForRpc } from './intakeRpcGuard';
import { enforceLiveReadonlyForRpc } from './liveReadonlyRpcGuard';
import { planAppWriteAudit, captureBefore, buildAppWriteEntry } from './appWriteAudit';
import { eventLog } from '@platform/core/logger';

const log = eventLog('api', 'RunOperation');
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
            log.warn('CAPABILITY_DRIFT', '[ADR-0019 capability-drift] Yetkili RPC bir yetenek kaydına ÇÖZÜLEMEDİ (yalnız gözlem, engellenmedi)', { rpc });
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

/** Açık operasyonlar (login/register/logout): kimliksiz çalışır, politika kaydına takılmaz. Tam (büyük/küçük harf duyarlı) eşleşme. */
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
    // [ADR-0028 WP-A1] Karar noktası: izin tabanlı `can` (kademe paritesi capability-parity testiyle kanıtlı). Kayıt bozuksa fail-closed.
    const permission = getRequiredPermission(policyService, policyOperation)
    const actor = resolveTier(userContext, principal)
    // Politika kaydı var ama yetenek kaydına çözülemiyorsa (capability-drift; yalnız test/sürüklenme) eski kademe kontrolü korunur.
    const allowed = permission === undefined ? isAllowed(required, actor) : can(actor, permission).allowed
    if (!allowed) throw new ApplicationError('Forbidden', 403)
    enforceImpersonationRestrictions(policyService, policyOperation, principal)
    observeCapabilityResolution(policyService, policyOperation)
}

/**
 * [ADR-0026 Karar 4.9.7 / ADR-0028 Karar 9] Impersonation (`imp:true`) oturumunda yıkıcı (`effect:'destructive'`), dış-dünya (`external:true`)
 * ve tenant sahipliği/ödeme/kullanıcı-yönetimi izinli (`users:manage`, `billing:manage`, `tenant:*`) işlemler REDDEDİLİR (403). Gerekirse yönetici
 * bunları backoffice'teki karşılık ekranlarından yapar. Kayıtsız (drift) RPC'de guard karar üretmez (varsayılan ret zaten `getRequiredTier`'da).
 */
function enforceImpersonationRestrictions(service: string, operation: string, principal: any): void {
    // Kapsam: bilet ile açılan (sabit ömürlü, `fx`) impersonation oturumları. Eski `selectStore` imp oturumu (fx yok) Aşama 3'te
    // `ADMIN_API_ONLY=true` ile kapanana kadar DEĞİŞMEZ (mevcut /api davranışı; characterization: operation-policy.test.ts); bayrak açılınca
    // kalan her imp oturumu da kapsama girer.
    if (!principal || principal.imp !== true) return
    if (principal.fx !== true && !config.admin.apiOnly) return
    if (impersonationDenial(service + '/' + operation)) {
        throw new ApplicationError('Bu işlem yönetici görüntüleme (impersonation) oturumunda yapılamaz.', 403, 'FORBIDDEN')
    }
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
export interface RequestMeta {
    ip?: string;
    /** authenticate'in çözdüğü ACTIVE tenant kaydı (sunucu tarafı; ctx.tenant'ı besler, BaseApi'de kayıt defteri okumasını önler). */
    tenant?: TenantEntry;
    /** [ADR-0026] Çağrının geldiği bağlama noktası. `'backoffice'` (`/admin-api`): audit yetenek `effect`inden türetilir (Karar 4.8). Gövdeden ASLA alınmaz. */
    surface?: 'app' | 'backoffice';
    /** [ADR-0026 Karar 4.6/4.8] Step-up gerektiren işlemde doğrulanmış gerekçe (audit `meta.reason`). */
    reason?: string;
    /** [ADR-0030 X3] Ham `Idempotency-Key` başlığı (yalnız dış etkili yazma RPC'lerinde anlamlı). Gövdeden ASLA alınmaz. */
    idempotencyKey?: string;
}

async function execute(userContext: any, service: string, operation: string, request: any, principal: any, requestMeta?: RequestMeta) {
    let microServiceWrapper = getService(service)
    if (!microServiceWrapper) throw new ApplicationError('Forbidden', 403)

    const clientId = userContext?.order;
    const { userContext: _uc, principal: _pr, requestMeta: _rm, ctx: _ctx, order: _o, clientId: bodyClientId, ...safeRequest } = (request ?? {}) as any;
    if (service === 'SecurityService' && operation === 'selectStore' && bodyClientId !== undefined) {
        safeRequest.clientId = bodyClientId;
    }
    // [ADR-0023] Yetkilendirme + sunucu alanlarının atılmasından SONRA, servis örneklenmeden ÖNCE gövde şema doğrulaması
    // (şemasız operasyon eskisi gibi). Hata 400 VALIDATION; servis/DB'ye hiç dokunulmaz.
    const validated = validateRpcRequest(service, operation, safeRequest);
    const enhancedRequest: any = { ...validated, userContext, principal };
    if (requestMeta) enhancedRequest.requestMeta = { ip: requestMeta.ip };
    // ADR-0024 P1-CORE: tipli bağlam (BaseApi `this.ctx`); `userContext`/`principal` alanları geriye uyumluluk için kalır.
    const ctx = buildRequestContext({ principal, userContext, tenant: requestMeta?.tenant && requestMeta.tenant.order === clientId ? requestMeta.tenant : undefined, ip: requestMeta?.ip });
    if (ctx) enhancedRequest.ctx = ctx;
    return await microServiceWrapper.process(clientId, operation, enhancedRequest)
}

/** ADR-0001 Karar 11: AdminService'in tüm YAZMA işlemleri (get/retrieve önekli olmayanlar) audit log'a yazılır. */
function isAdminWrite(service: string, operation: string): boolean {
    return service === 'AdminService' && !/^(get|retrieve)/i.test(operation)
}

/**
 * [ADR-0030 X4] Müşteri yüzeyindeki yazmalar (`effect !== 'read'`) `app.write` olarak yazılır (okumalar yazılmaz). Alanlar/PII/önce-sonra
 * kuralları `appWriteAudit.ts`'te. Denetim hazırlığı/yazımı hiçbir koşulda isteği düşürmez veya sonucunu değiştirmez.
 */
async function executeAppWriteAudited(userContext: any, service: string, operation: string, request: any, principal: any, requestMeta?: RequestMeta) {
    let plan: ReturnType<typeof planAppWriteAudit>
    try { plan = planAppWriteAudit(service, operation, principal) } catch { plan = undefined }
    if (!plan && principal?.imp === true) {
        // [B3] Destek oturumunda OKUMALAR (ve `app.write` planı olmayan istekler) da denetlenir (tenant denetim görünümünde `impersonation.request`; yük/PII yok, yalnız servis+operasyon).
        try {
            void AuditLogger.log({
                event: 'impersonation.request', result: 'ok', sub: principal.sub, tid: principal.tid, ip: requestMeta?.ip, surface: 'app',
                actorType: 'impersonator', imp: true, onBehalfOf: principal.tid, reqId: getRequestId(),
                meta: { service, operation, effect: CAPABILITY_BY_RPC.get(service + '/' + operation)?.effect ?? 'unknown', ...(typeof principal.impReason === 'string' && principal.impReason ? { impReason: principal.impReason.slice(0, 200) } : {}) },
            })
        } catch { /* denetim asla isteği etkilemez */ }
    }
    if (!plan) return await execute(userContext, service, operation, request, principal, requestMeta)
    const before = await captureBefore(plan, userContext?.order, request)
    const emit = (error?: any) => {
        try { void AuditLogger.log(buildAppWriteEntry(plan!, request, before, principal, requestMeta?.ip, error)) } catch { /* denetim asla isteği etkilemez */ }
    }
    try {
        const resp = await execute(userContext, service, operation, request, principal, requestMeta)
        emit()
        return resp
    } catch (e) {
        emit(e ?? new Error('unknown'))
        throw e
    }
}

async function executeAudited(userContext: any, service: string, operation: string, request: any, principal: any, requestMeta?: RequestMeta) {
    if (requestMeta?.surface === 'backoffice') return await executeBackofficeAudited(userContext, service, operation, request, principal, requestMeta)
    if (!isAdminWrite(service, operation)) return await executeAppWriteAudited(userContext, service, operation, request, principal, requestMeta)
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
 * [ADR-0026 Karar 4.8 / plan S7] `/admin-api` üzerindeki TÜM yazmalar (`effect !== 'read'`; kayıtsız RPC de yazma sayılır) `backoffice.write`,
 * tenant PII'sine dokunan okumalar `backoffice.sensitive_read` olarak yazılır. Karar servis adı regex'inden DEĞİL yetenek `effect`inden türer
 * (bugünkü `isAdminWrite` yalnız `AdminService` yazmalarını yakalıyordu). Eski `admin.write` kaydı bu yüzeyde YAZILMAZ (çift kayıt tekilleştirilir);
 * `IntegrationConfigService`/`IntegrationComplianceService`'in kendi audit çağrıları (config.publish vb.) korunur. Hedef tenant `onBehalfOf`'a
 * yazılır (`tid` bilerek boş: tenant denetim görünümünde platform-içi kayıt görünmesin). Salt okuma ve hassas olmayan okuma yazılmaz.
 */
async function executeBackofficeAudited(userContext: any, service: string, operation: string, request: any, principal: any, requestMeta: RequestMeta) {
    const rpc = service + '/' + operation
    const cap = CAPABILITY_BY_RPC.get(rpc)
    const write = !cap || cap.effect !== 'read'
    const sensitive = !write && isSensitiveRead(rpc)
    if (!write && !sensitive) return await execute(userContext, service, operation, request, principal, requestMeta)
    const target = [request?.tid, request?.clientId, request?.order].map(Number).find(n => Number.isInteger(n) && n > 0)
    const meta: Record<string, any> = { service, operation, effect: cap?.effect ?? 'unknown' }
    if (requestMeta.reason) meta.reason = requestMeta.reason
    const base = {
        event: write ? 'backoffice.write' : 'backoffice.sensitive_read',
        sub: principal?.sub, ip: requestMeta.ip, surface: 'backoffice' as const, actorType: 'platform' as const,
        reqId: getRequestId(), onBehalfOf: target, meta,
    }
    try {
        const resp = await execute(userContext, service, operation, request, principal, requestMeta)
        void AuditLogger.log({ ...base, result: 'ok' })
        return resp
    } catch (e) {
        void AuditLogger.log({ ...base, result: 'error' })
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
        // [ADR-0026 Aşama 3, BAYRAK: ADMIN_API_ONLY (varsayılan false = davranış DEĞİŞMEZ)] platformAdmin işlemleri (selectStore dahil) yalnız `/admin-api`.
        if (config.admin.apiOnly && requestMeta?.surface !== 'backoffice' && getRequiredTier(service, operation) === 'platformAdmin') {
            throw new ApplicationError('Bu işlem yalnızca yönetim uygulamasından yapılabilir.', 403, 'ADMIN_API_ONLY')
        }
        // Sözde-servisler (ImageApi) jenerik RPC ile çağrılamaz; yalnızca runImageApi ile
        if (PSEUDO_SERVICES.includes(service)) throw new ApplicationError('Forbidden', 403)
        authorize(service, operation, userContext, principal)
        await enforceEntitlementGuard(service, operation, userContext?.order)
    }
    // [LIVE-RO] canlı salt-okuma kipi (LIVE_READONLY=1): dış dünyaya yazan RPC'ler 423 (kip kapalıyken no-op; servis örneklenmeden ÖNCE)
    enforceLiveReadonlyForRpc(service, operation)
    // [ADR-0030 X6-b] acil durdurma (intake): dış çağrı yapan RPC'ler (idempotency kaydı açılmadan ÖNCE reddedilir)
    await enforceIntakeForRpc(service, operation, request, requestMeta?.surface, userContext?.order)
    // [ADR-0030 X3] dış etkili yazma RPC'lerinde Idempotency-Key (varsayılan gözlem kipi: davranış değişmez)
    return await withIdempotency(service, operation, userContext, principal, request, requestMeta, () => executeAudited(userContext, service, operation, request, principal, requestMeta))
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
