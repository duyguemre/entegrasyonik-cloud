import { NextFunction, Request, Response } from 'express';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import Security, { ApplicationError, SessionPrincipal } from './Security';
import { OPEN_OPERATIONS } from './operationPolicy';
import { sendHttpError } from './http/errorEnvelope';
import { enrichContext } from '@platform/core/context';
import { getIdentityCache } from '@platform/core/security/identityCache';
import type { TenantEntry } from '@database/TenantRegistry';
import { buildActor, type Actor } from './requestContext';
import {
    MEMBERSHIP_CACHE_FIELD, decide, loadMembership, measureDual, membershipSource, overlayRole, type AuthzDecision,
} from './membershipAuthz';

// ADR-0001 (Karar 1, 4, 5): tüm /api rotaları varsayılan olarak reddeden TEK kimlik middleware'i.
// Açık (kimliksiz) rotalar yalnızca aşağıdaki sabit listedir; geri kalan her şey token yok/geçersizse 401.
// `jwt.decode` istek yolunda KULLANILMAZ; token yalnızca Security.verify (imza + exp + iss + aud) ile okunur.
//
// ImageApiManager (upload, uploadIdentity, getImages, deleteImage, sortImages, deleteImageSelected,
// getImage/:id, downloadImage/:id) herkese açık yol İÇERMEZ: hepsi bugün de tenant'a (userContext.order) bağlıydı;
// aynı middleware'den geçer, açık listede değildir.

/** [HTTP yöntemi, context'e göre yol]. Karşılaştırma büyük/küçük harf ve sondaki "/" duyarsızdır (Express varsayılanıyla aynı). */
export const OPEN_ROUTES: ReadonlyArray<readonly [string, string]> = [
    // POST açık operasyonlar (login/register/logout) operationPolicy.OPEN_OPERATIONS'tan türetilir (tek kaynak;
    // RunOperation aynı listeyi politika kaydından muaf tutar).
    // logout: süresi dolmuş/iptal edilmiş çerezle de çıkış yapılabilsin; işlem kimlik gerektirmez (yalnızca çerezi siler)
    ...OPEN_OPERATIONS.map((op) => ['POST', op] as const),
    // Kendi içinde kimlik doğrular (authenticateRequest) ve 401 döner
    ['GET', 'checkAuthentication'],
    // [ADR-0031 BE-CFG-3] kamu açılış yapılandırması (bakım/duyuru/destek iletişimi giriş ekranında da gerekir); sır içermez, bellekten yanıtlanır.
    ['GET', 'public-config'],
];

function normalizePath(p: string): string {
    return p.replace(/\/+$/, '').replace(/^\/+/, '').toLowerCase();
}

/** relPath: context önekinden sonraki yol (ör. "SecurityService/login"). */
export function isOpenRoute(method: string, relPath: string): boolean {
    const m = (method || '').toUpperCase();
    const p = normalizePath(relPath || '');
    return OPEN_ROUTES.some(([om, op]) => om === m && normalizePath(op) === p);
}

function relativeToContext(reqPath: string, context: string): string | undefined {
    const p = reqPath.toLowerCase();
    const c = context.replace(/\/+$/, '').toLowerCase();
    if (p === c) return '';
    if (p.startsWith(c + '/')) return reqPath.slice(c.length + 1);
    return undefined; // context dışı yol: hiçbir zaman açık değil
}

export interface AuthResult {
    principal: SessionPrincipal;
    /**
     * Sunucuda, doğrulanmış principal + merkezi Users belgesinden kurulan kullanıcı bağlamı.
     * Şekil eski token yüküyle aynıdır (user belgesi alanları: _id, email, name, surname, isGlobalAdmin, owner,
     * roleCode, resources, ...) ancak parola özeti, tokenVersion ve kilit alanları HARİÇtir.
     * `order` YALNIZCA doğrulanmış `tid`'dir.
     */
    userContext: any;
    /** Çözülmüş ACTIVE tenant kaydı (tid varsa). */
    tenant?: TenantEntry;
    /** Dondurulmuş, tipli aktör (ADR-0024 D3 / ADR-0028). */
    actor: Actor;
}

const SENSITIVE_USER_FIELDS = ['password', 'tokenVersion', 'failedLoginAttempts', 'lockUntil', MEMBERSHIP_CACHE_FIELD];

export function buildUserContext(user: any, principal: Pick<SessionPrincipal, 'tid' | 'ga'>): any {
    const ctx: any = {};
    for (const [k, v] of Object.entries(user)) {
        if (!SENSITIVE_USER_FIELDS.includes(k)) ctx[k] = v;
    }
    if (principal.tid !== undefined) {
        ctx.order = principal.tid;
        // Süper yönetici başka tenant'ı görüntülüyorsa (eski selectStore davranışı) clientId de tenant numarasıdır.
        if (principal.ga) ctx.clientId = principal.tid;
    } else {
        // Tenant yok (ör. mağaza seçmemiş süper yönetici): belgede kalmış order/clientId tenant kimliği olarak KULLANILMAZ
        delete ctx.order;
        delete ctx.clientId;
    }
    return ctx;
}

/**
 * Çerezdeki token'ı doğrular, merkezi Users belgesini okuyup tokenVersion / hesap durumu / tenant tutarlılığını
 * ve Clients.status == 'ACTIVE' kuralını kontrol eder, gerekirse çerezi sliding yeniler.
 * Hata: ApplicationError (401 kimlik yok/geçersiz; 403 tenant aktif değil). DB hatası fail-open OLMAZ.
 */
export async function authenticateRequest(req: Request, res: Response): Promise<AuthResult> {
    const principal = Security.getInstance().verify(req);
    const { result, user } = await resolveIdentity(principal);

    // Sliding yenileme (kalan < 4 saat ve auth_time'dan <= 7 gün); rol/ga/tv sunucudaki güncel değerlerden
    if (Security.shouldRefresh(principal)) {
        Security.setSessionCookie(res, {
            sub: principal.sub,
            tid: principal.tid,
            role: user.roleCode,
            ga: principal.ga,
            tv: principal.tv,
            imp: principal.imp,
            auth_time: principal.auth_time,
        });
    }
    return result;
}

/**
 * Doğrulanmış (imza/aud zaten kontrol edilmiş) principal'dan kullanıcı/tenant/aktör çözümü: Users belgesi + `tv` + `ga` tutarlılığı + hesap
 * durumu + üyelik kararı + Clients.status. Çerez hattı (`authenticateRequest`) ve `/mcp` Bearer hattı (ADR-0035, MCP-3) AYNI kuralları paylaşır.
 * Çerez/sliding yenileme burada YOK (çağırana ait). Hata: ApplicationError (401/403). DB hatası fail-open OLMAZ.
 */
export async function resolveIdentity(principal: Pick<SessionPrincipal, 'sub' | 'tid' | 'tv' | 'ga'> & Partial<SessionPrincipal>): Promise<{ result: AuthResult; user: any }> {
    const tv = principal.tv;

    // ADR-0024 P1-CORE: kullanıcı belgesi (sub, tid, tv) anahtarlı kısa TTL'li kimlik önbelleğinden gelir (sıcakken 0 okuma).
    // Girdi yalnızca tokenVersion doğrulanmış bir okumadan sonra yazılır; iptal yazan yollar invalidateUser/invalidateTenant çağırır.
    const identityCache = getIdentityCache();
    let user: any = identityCache.get(principal.sub, principal.tid, tv);
    let fromDb: { epoch: number } | undefined;
    if (!user) {
        const epoch = identityCache.epoch;
        const applicationDB = await DatabaseManagerInstance.getApplicationDB();
        try {
            user = await applicationDB.getUserModel().findById(principal.sub).lean();
        } catch (e: any) {
            if (e && e.name === 'CastError') throw new ApplicationError('Token not verified', 401);
            throw e;
        }
        if (!user) throw new ApplicationError('Token not verified', 401);
        // İptal: parola değişimi/silme/rol değişimi/"tüm oturumları kapat" tokenVersion'ı artırır
        if ((Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0) !== tv) throw new ApplicationError('Token not verified', 401);
        fromDb = { epoch };
    }

    // Ayrıcalık claim'i sunucudaki gerçek değerle tutarlı olmalı
    if (!!user.isGlobalAdmin !== principal.ga) throw new ApplicationError('Token not verified', 401);

    // Hesap pasifliği/kilidi (her istekte, önbellekteki belge üzerinde yeniden değerlendirilir: kilit süresi dolabilir)
    if (user.isActive === false) throw new ApplicationError('Account is not active', 401);
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) throw new ApplicationError('Account is locked', 401);

    // ADR-0028 WP-A3: yetki kaynağı. legacy'de aşağıdaki her şey eskisi gibidir (üyelik okunmaz).
    const source = membershipSource();
    const usesMembership = source !== 'legacy' && !principal.ga;

    // Tenant tutarlılığı: tenant kullanıcısı için Users.order == tid zorunlu (`membership` modunda tenant bağı üyeliktir;
    // Users.order Aşama 3'e kadar yalnız ayna alandır ve çok-tenant üyeliği engellememelidir)
    if (!principal.ga) {
        if (principal.tid === undefined || (source !== 'membership' && Number(user.order) !== principal.tid)) {
            throw new ApplicationError('Token not verified', 401);
        }
    }

    // Üyelik yalnız SOĞUKTA okunur ve kullanıcı belgesiyle birlikte (sub, tid, tv) önbelleğine girer; sıcakta ek okuma yok.
    if (fromDb && usesMembership) {
        const membership = await loadMembership(await DatabaseManagerInstance.getApplicationDB(), principal.sub, principal.tid as number);
        user = { ...user, [MEMBERSHIP_CACHE_FIELD]: membership };
        if (source === 'dual') measureDual(user, membership, principal.tid);
    }

    // Yalnızca TÜM kullanıcı denetimlerini geçen belge önbelleğe yazılır (kilitli/pasif/tutarsız belge önbelleğe girmez).
    // Üyelik reddi (aşağıda) her istekte önbellekteki özet üzerinde yeniden değerlendirilir, bu yüzden önbelleğe yazmaya engel değildir.
    if (fromDb) identityCache.set(principal.sub, principal.tid, tv, user, fromDb.epoch);

    // Karar: legacy/dual -> eski alanlar; membership -> üyelik (yok/askıda -> 403)
    const decision: AuthzDecision | undefined = usesMembership ? decide(source, user) : undefined;

    // Tenant aktif olmalı (TenantRegistry: 30 sn önbellek; status yazan yollar invalidate çağırır). Kayıt yok -> 401 (mevcut sözleşme).
    let tenant: TenantEntry | undefined;
    if (principal.tid !== undefined) {
        if (!principal.tid) throw new ApplicationError('Token not verified', 401);
        tenant = await DatabaseManagerInstance.getTenant(principal.tid);
        if (!tenant) throw new ApplicationError('Token not verified', 401);
        if (tenant.status !== 'ACTIVE') throw new ApplicationError('Tenant is not active', 403);
    }

    let userContext = buildUserContext(user, principal);
    // membership modunda RunOperation/profil aynı rol kaynağını görsün: eski-şekilli alanlar üyelik rolünden üretilir
    if (decision?.overlay) userContext = overlayRole(userContext, decision.overlay);
    return { result: { principal: principal as SessionPrincipal, userContext, tenant, actor: buildActor(principal, userContext, { permissionSource: decision?.source })! }, user };
}

function respondAuthError(res: Response, e: any) {
    if (e instanceof ApplicationError) {
        sendHttpError(res, e.statusCode || 401, e.message, e.code);
        return;
    }
    // Fail-closed: kimlik doğrulanamadıysa istek servise gitmez. Hata ayrıntısı istemciye verilmez.
    console.error('[authenticate] beklenmeyen hata:', e?.message);
    sendHttpError(res, 500, 'Authentication unavailable', 'INTERNAL');
}

/** Tek authenticate middleware'i. Webserver.init() içinde configureApis/configureImageServices'ten ÖNCE takılır. */
export function createAuthenticateMiddleware(context: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
        // İstemciden gelen hiçbir şey userContext/principal'ı dolduramaz; yalnızca aşağıdaki doğrulama doldurur
        res.locals.userContext = undefined;
        res.locals.principal = undefined;
        res.locals.tenant = undefined;
        res.locals.actor = undefined;

        const rel = relativeToContext(req.path, context);
        if (rel !== undefined && isOpenRoute(req.method, rel)) {
            next();
            return;
        }

        let result: AuthResult;
        try {
            result = await authenticateRequest(req, res);
        } catch (e) {
            respondAuthError(res, e);
            return;
        }
        res.locals.principal = result.principal;
        res.locals.userContext = result.userContext;
        res.locals.tenant = result.tenant;
        res.locals.actor = result.actor;
        // ADR-0017 Karar 1.6: doğrulanmış principal'dan bağlama tenantId/userSub işlenir (log/correlation alanı; yalnız
        // doğrulanmış kimlikten -- ADR-0001 Karar 5 ile aynı kural).
        enrichContext({ tenantId: result.principal.tid, userSub: result.principal.sub });
        next();
    };
}
