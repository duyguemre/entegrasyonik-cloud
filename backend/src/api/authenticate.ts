import { NextFunction, Request, Response } from 'express';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import Security, { ApplicationError, SessionPrincipal } from './Security';
import { OPEN_OPERATIONS } from './operationPolicy';
import { enrichContext } from '@platform/core/context';

// ADR-0001 (Karar 1, 4, 5): tüm /api rotaları varsayılan olarak reddeden TEK kimlik middleware'i.
// Açık (kimliksiz) rotalar yalnızca aşağıdaki sabit listedir; geri kalan her şey token yok/geçersizse 401.
// `jwt.decode` istek yolunda KULLANILMAZ; token yalnızca Security.verify (imza + exp + iss + aud) ile okunur.
//
// ImageApiManager (upload, uploadIdentity, getImages, deleteImage, sortImages, deleteImageSelected,
// getImage/:id, downloadImage/:id) herkese açık yol İÇERMEZ: hepsi bugün de tenant'a (userContext.order) bağlıydı;
// aynı middleware'den geçer, açık listede değildir.

/** [HTTP yöntemi, context'e göre yol]. Karşılaştırma büyük/küçük harf ve sondaki "/" duyarsızdır (Express varsayılanıyla aynı). */
export const OPEN_ROUTES: ReadonlyArray<readonly [string, string]> = [
    // POST açık operasyonlar (login/register/getCaptcha/logout) operationPolicy.OPEN_OPERATIONS'tan türetilir (tek kaynak;
    // RunOperation aynı listeyi politika kaydından muaf tutar).
    // logout: süresi dolmuş/iptal edilmiş çerezle de çıkış yapılabilsin; işlem kimlik gerektirmez (yalnızca çerezi siler)
    ...OPEN_OPERATIONS.map((op) => ['POST', op] as const),
    // Kendi içinde kimlik doğrular (authenticateRequest) ve 401 döner
    ['GET', 'checkAuthentication'],
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
}

const SENSITIVE_USER_FIELDS = ['password', 'tokenVersion', 'failedLoginAttempts', 'lockUntil'];

function buildUserContext(user: any, principal: SessionPrincipal): any {
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

    const applicationDB = await DatabaseManagerInstance.getApplicationDB();
    let user: any;
    try {
        user = await applicationDB.getUserModel().findById(principal.sub).lean();
    } catch (e: any) {
        if (e && e.name === 'CastError') throw new ApplicationError('Token not verified', 401);
        throw e;
    }
    if (!user) throw new ApplicationError('Token not verified', 401);

    // İptal: parola değişimi/silme/rol değişimi/"tüm oturumları kapat" tokenVersion'ı artırır
    if ((Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0) !== principal.tv) {
        throw new ApplicationError('Token not verified', 401);
    }
    // Ayrıcalık claim'i sunucudaki gerçek değerle tutarlı olmalı
    if (!!user.isGlobalAdmin !== principal.ga) throw new ApplicationError('Token not verified', 401);

    // Hesap pasifliği/kilidi
    if (user.isActive === false) throw new ApplicationError('Account is not active', 401);
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) throw new ApplicationError('Account is locked', 401);

    // Tenant tutarlılığı: tenant kullanıcısı için Users.order == tid zorunlu
    if (!principal.ga) {
        if (principal.tid === undefined || Number(user.order) !== principal.tid) {
            throw new ApplicationError('Token not verified', 401);
        }
    }

    // Tenant aktif olmalı
    if (principal.tid !== undefined) {
        const client: any = await applicationDB.getClientModel().findOne({ order: principal.tid }, 'status').lean();
        if (!client) throw new ApplicationError('Token not verified', 401);
        if (client.status !== 'ACTIVE') throw new ApplicationError('Tenant is not active', 403);
    }

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

    return { principal, userContext: buildUserContext(user, principal) };
}

function respondAuthError(res: Response, e: any) {
    if (e instanceof ApplicationError) {
        res.status(e.statusCode || 401).send({ error: e.message });
        return;
    }
    // Fail-closed: kimlik doğrulanamadıysa istek servise gitmez. Hata ayrıntısı istemciye verilmez.
    console.error('[authenticate] beklenmeyen hata:', e?.message);
    res.status(500).send({ error: 'Authentication unavailable' });
}

/** Tek authenticate middleware'i. Webserver.init() içinde configureApis/configureImageServices'ten ÖNCE takılır. */
export function createAuthenticateMiddleware(context: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
        // İstemciden gelen hiçbir şey userContext/principal'ı dolduramaz; yalnızca aşağıdaki doğrulama doldurur
        res.locals.userContext = undefined;
        res.locals.principal = undefined;

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
        // ADR-0017 Karar 1.6: doğrulanmış principal'dan bağlama tenantId/userSub işlenir (log/correlation alanı; yalnız
        // doğrulanmış kimlikten -- ADR-0001 Karar 5 ile aynı kural).
        enrichContext({ tenantId: result.principal.tid, userSub: result.principal.sub });
        next();
    };
}
