import Security, { ApplicationError } from "./Security"
import { Express, Request, Response } from 'express';
import runOperation, { RequestMeta } from "./RunOperation";
import { authenticateRequest, isOpenRoute } from "./authenticate";
import { isSessionResult } from "./sessionResult";
import { toProfileDto } from "./profileDto";
import { getClientIp } from "./clientIp";
import {
    accountTokenRateLimitOptionsFromEnv, clientLogRateLimitOptionsFromEnv, createRateLimiter, passwordResetEmailRateLimitOptionsFromEnv,
    passwordResetIpRateLimitOptionsFromEnv, rateLimitOptionsFromEnv, registerRateLimitOptionsFromEnv,
} from "./rateLimit";
import { handleClientLog } from "./clientLog";
import { sanitizeResponse } from "./responseSanitizer";
import { AuditLogger } from "@services/audit/AuditLogger";
import { getRequestId } from "@platform/core/context";
import { AppError, ERROR_CODES } from "@platform/core/errors";
import { logger } from "@platform/core/logger";

const log = logger.child({ module: 'ApiManager' });

// ADR-0001: bu dosyadaki rotalar Webserver'daki `authenticate` middleware'inden SONRA çalışır.
// res.locals.userContext / res.locals.principal yalnızca o middleware tarafından (doğrulanmış token'dan) doldurulur.
// Fail-closed: açık listede olmayan bir rota principal'sız gelirse (middleware takılmamışsa) 401.
/** Sunucu tarafı istek üst verisi: istemci IP'si + authenticate'in çözdüğü tenant kaydı (ctx.tenant). */
function requestMetaOf(req: Request, res: Response): RequestMeta {
    const rawKey = req.headers?.['idempotency-key'];
    const idempotencyKey = typeof rawKey === 'string' ? rawKey : undefined;
    return { ip: getClientIp(req), tenant: res.locals?.tenant, idempotencyKey }
}

function requireAuthenticated(res: Response) {
    if (!res.locals || !res.locals.principal) throw new ApplicationError("Token is undefined", 401)
}

/**
 * ADR-0001 Karar 12: hata yanıtları istek gövdesini (parola, token, kimlik bilgisi...) GERİ YANSITMAZ.
 * Yalnızca { error, service, operation } döner.
 */
/**
 * ADR-0003 D.17: başarılı yanıt gövdesi, son savunma hattı olarak yasak anahtar adları (parola özeti, dbConfig, depolama anahtarları...)
 * için taranır; bulunursa silinir ve olay loglanır (hata sinyali). Sızıntı yoksa gövde AYNEN gönderilir.
 */
export function sendOk(req: Request, res: Response, body: any) {
    res.status(200).send(sanitizeResponse(body, { service: req.params?.service, operation: req.params?.operation }))
}

/**
 * [ADR-0017 2026-09-28 / ADR-0016 §4.3] Hata zarfı: RPC sözleşmesi (`error` metin, `service`, `operation`) KORUNUR;
 * `code` (yalnızca `ApplicationError`'da açıkça tanımlıysa — ESKİ davranışla AYNI kapı) ve `requestId` ALAN OLARAK
 * EKLENİR. Beklenmeyen (5xx) hatalarda `e.message` İSTEMCİYE SIZMAZ: genel ileti + `code:'INTERNAL'` (ayrıntı
 * yalnızca sunucu logunda, `platform/core/logger` sıcak-yol göçü — ADR-0017 Karar 1.7 adım 2). 4xx iletileri
 * (doğrulama/yetki/hesap uçları) DEĞİŞMEZ.
 */
export function sendError(req: Request, res: Response, e: any, defaultStatus: number = 500) {
    const statusCode = (e && e.statusCode) ? e.statusCode : defaultStatus
    const requestId = getRequestId()
    let message = e?.message
    let code: string | undefined = (e instanceof AppError && typeof e.code === 'string') ? e.code : undefined
    if (statusCode >= 500) {
        // Beklenmeyen hata: ayrıntı yalnızca sunucu logunda (requestId ile eşleştirilebilir), istemciye SIZMAZ.
        log.error({ service: req.params?.service, operation: req.params?.operation, err: e }, 'Beklenmeyen hata')
        message = ERROR_CODES.INTERNAL.message
        code = code ?? 'INTERNAL'
    }
    const body: any = { error: message, service: req.params?.service, operation: req.params?.operation }
    if (code) body.code = code
    // [ADR-0023] Girdi doğrulama hatası: alan yolu + ileti listesi (DEĞER içermez, gövde yansıtılmaz). Yalnız 4xx VALIDATION.
    if (statusCode < 500 && code === 'VALIDATION' && Array.isArray(e?.details)) body.fields = e.details
    if (requestId) body.requestId = requestId
    res.status(statusCode).send(body)
}

/**
 * Yalnızca ÖZEL rotalardan çalışan hesap operasyonları (küçük harf). Özel rotalar rate limit (açık uçlar) veya çerez yenileme
 * (changePassword) yapar; jenerik `/:service/:operation` rotasından çağrılırlarsa bunlar ATLANIRDI (ör. yüzde-kodlanmış yol
 * `/AccountService/%72equestPasswordReset` statik rotayla eşleşmez, jenerik rotaya düşer -> kimlikli bir kullanıcı sınırsız sıfırlama
 * e-postası tetikleyebilirdi). Bu yüzden jenerik rota bunları 403 ile reddeder.
 */
const DEDICATED_ONLY_OPERATIONS: ReadonlySet<string> = new Set([
    'accountservice/requestpasswordreset',
    'accountservice/confirmpasswordreset',
    'accountservice/verifyemail',
    'accountservice/getinvitation',
    'accountservice/acceptinvitation',
    'accountservice/changepassword',
    // [ADR-0026] cerez basan/kapatan impersonation operasyonlari yalniz ozel rotalardan (SessionResult jenerik rotada cerezsiz sizardi)
    'securityservice/redeemimpersonation',
    'securityservice/endimpersonation',
])

export function configureApis(
    app: Express,
    context: string
) {
    // ADR-0001 Karar 10: login için süreç-içi IP bazlı rate limit (varsayılan 10 istek/dk/IP; env ile ayarlanır).
    // ADR-0003 A.4: register AYRI kovada ve daha sıkı (varsayılan 3 kayıt/saat/IP; REGISTER_RATE_LIMIT_MAX/_WINDOW_MS).
    const registerLimiter = createRateLimiter(registerRateLimitOptionsFromEnv())
    const loginLimiter = createRateLimiter(rateLimitOptionsFromEnv())

    // Hesap yaşam döngüsü (docs/API_ACCOUNT_LIFECYCLE.md): üç açık uç + oturum çerezini yenileyen changePassword ÖZEL rotalardır (jenerik
    // rotadan ÖNCE kaydedilir). Kimliksiz uçlar kendi rate limit kovalarına sahiptir; hiçbiri oturum AÇMAZ.
    const resetIpLimiter = createRateLimiter(passwordResetIpRateLimitOptionsFromEnv())
    const resetEmailLimiter = createRateLimiter(passwordResetEmailRateLimitOptionsFromEnv())
    const accountTokenLimiter = createRateLimiter(accountTokenRateLimitOptionsFromEnv())
    // ADR-0017 Karar 1.8: `/client-log` -- IP+oturum anahtarlı, "istemci başına 20 olay/5 dk".
    const clientLogLimiter = createRateLimiter(clientLogRateLimitOptionsFromEnv())

    app.post(context + '/AccountService/requestPasswordReset', resetIpLimiter, resetEmailLimiter, async (req: Request, res: Response) => {
        try {
            const resp = await runOperation(undefined, "AccountService", "requestPasswordReset", req.body, undefined, { ip: getClientIp(req) })
            sendOk(req, res, resp)
        } catch (e: any) {
            sendError(req, res, e)
        }
    })
    app.post(context + '/AccountService/confirmPasswordReset', accountTokenLimiter, async (req: Request, res: Response) => {
        try {
            const resp = await runOperation(undefined, "AccountService", "confirmPasswordReset", req.body, undefined, { ip: getClientIp(req) })
            sendOk(req, res, resp)
        } catch (e: any) {
            sendError(req, res, e)
        }
    })
    app.post(context + '/AccountService/verifyEmail', accountTokenLimiter, async (req: Request, res: Response) => {
        try {
            const resp = await runOperation(undefined, "AccountService", "verifyEmail", req.body, undefined, { ip: getClientIp(req) })
            sendOk(req, res, resp)
        } catch (e: any) {
            sendError(req, res, e)
        }
    })
    // [ADR-0028 WP-A4] Davet: kimliksiz iki uç (accountTokenLimiter; oturum AÇMAZ).
    app.post(context + '/AccountService/getInvitation', accountTokenLimiter, async (req: Request, res: Response) => {
        try {
            const resp = await runOperation(undefined, "AccountService", "getInvitation", req.body, undefined, { ip: getClientIp(req) })
            sendOk(req, res, resp)
        } catch (e: any) {
            sendError(req, res, e)
        }
    })
    app.post(context + '/AccountService/acceptInvitation', accountTokenLimiter, async (req: Request, res: Response) => {
        try {
            const resp = await runOperation(undefined, "AccountService", "acceptInvitation", req.body, undefined, { ip: getClientIp(req) })
            sendOk(req, res, resp)
        } catch (e: any) {
            sendError(req, res, e)
        }
    })
    // Kimlikli: parola değişince diğer oturumlar düşer (tokenVersion++); ÇAĞRAN oturum için yeni çerez basılır (selectStore deseni).
    // Claim'ler gövdeye ASLA girmez (jenerik rota sessionClaims'i gövdeye koyardı; bu yüzden özel rota).
    app.post(context + '/AccountService/changePassword', async (req: Request, res: Response) => {
        try {
            requireAuthenticated(res)
            const result = await runOperation(res.locals.userContext, "AccountService", "changePassword", req.body, res.locals.principal, requestMetaOf(req, res))
            if (!isSessionResult(result)) throw new ApplicationError('changePassword failed', 500)
            Security.setSessionCookie(res, result.sessionClaims)
            res.status(200).send(result.body)
        } catch (e: any) {
            sendError(req, res, e)
        }
    })

    app.post(context + '/SecurityService/register', registerLimiter, async (req: Request, res: Response) => {
        const ip = getClientIp(req)
        try {
            const result = await runOperation(undefined, "SecurityService", "register", req.body, undefined, { ip })
            if (isSessionResult(result)) {
                // ADR-0001 Karar 12: yanıt = profil DTO (parola özeti/tokenVersion yok); oturum çerezi asgari claim'lerle
                Security.setSessionCookie(res, result.sessionClaims)
                void AuditLogger.log({ event: 'register', result: 'ok', sub: result.sessionClaims.sub, tid: result.sessionClaims.tid, ip })
                res.status(200).send(result.body)
                return
            }
            res.status(200).send(result)
        } catch (e: any) {
            void AuditLogger.log({ event: 'register', result: 'error', ip })
            sendError(req, res, e)
        }
    })

    app.post(context + '/SecurityService/login', loginLimiter, async (req: Request, res: Response) => {
        const ip = getClientIp(req)
        try {
            const result = await runOperation(undefined, "SecurityService", "login", req.body, undefined, { ip })
            if (isSessionResult(result)) {
                Security.setSessionCookie(res, result.sessionClaims)
                void AuditLogger.log({ event: 'login', result: 'ok', sub: result.sessionClaims.sub, tid: result.sessionClaims.tid, ip })
                res.status(200).send(result.body)
                return
            }
            // oturum açılmadı (SessionResult değil)
            res.status(200).send(result)
        } catch (e: any) {
            // Başarısızlıkta yalnızca IP kaydedilir; hesabın bulunup bulunmadığı/nedeni (kilit, pasif, parola) audit'e de YAZILMAZ
            const credentialFailure = e && (e.statusCode === 401 || e.statusCode === 400)
            void AuditLogger.log({ event: 'login', result: credentialFailure ? 'fail' : 'error', ip })
            sendError(req, res, e)
        }
    })
    // [ADR-0026 Karar 4.9] Backoffice bileti tüketir, `imp:true` oturum çerezini basar (30 dk - K41, UZATILMAZ). Açık rota (kimlik = bilet); hız sınırlı.
    app.post(context + '/SecurityService/redeemImpersonation', accountTokenLimiter, async (req: Request, res: Response) => {
        try {
            const result = await runOperation(undefined, "SecurityService", "redeemImpersonation", req.body, undefined, { ip: getClientIp(req) })
            if (!isSessionResult(result)) throw new ApplicationError('redeemImpersonation failed', 500)
            Security.setSessionCookie(res, result.sessionClaims)
            res.status(200).send(result.body)
        } catch (e: any) {
            sendError(req, res, e)
        }
    })
    // Impersonation oturumunu bitirir (yalnız `imp:true` oturum): çerez silinir, `impersonation.end` denetime yazılır.
    app.post(context + '/SecurityService/endImpersonation', async (req: Request, res: Response) => {
        try {
            requireAuthenticated(res)
            const principal = res.locals.principal
            if (principal.imp !== true) throw new ApplicationError('Aktif bir impersonation oturumu yok.', 400)
            void AuditLogger.log({
                event: 'impersonation.end', result: 'ok', sub: principal.sub, tid: principal.tid, ip: getClientIp(req),
                actorType: 'impersonator', onBehalfOf: principal.tid, surface: 'app', imp: true,
                meta: typeof principal.impReason === 'string' && principal.impReason ? { reason: principal.impReason } : undefined,
            })
            Security.expireSecurityCookie(res, context)
            res.status(200).send(true)
        } catch (e: any) {
            sendError(req, res, e)
        }
    })
    app.post(context + '/SecurityService/logout', async (req: Request, res: Response) => {
        try {
            // ADR-0001: logout açık rotadır (çerez süresi dolmuş olsa da çıkış yapılabilsin); çerez başarıda HER ZAMAN silinir.
            await runOperation(res.locals.userContext, "SecurityService", "logout", req.body, res.locals.principal)
            Security.expireSecurityCookie(res, context)
            res.status(200).send(true)
        } catch (e: any) {
            sendError(req, res, e)
        }
    })

    // ADR-0001 Karar 6: selectStore yeni oturumu Set-Cookie ile yazar; token gövdede DÖNMEZ (gövde: { store, user }).
    app.post(context + '/SecurityService/selectStore', async (req: Request, res: Response) => {
        try {
            requireAuthenticated(res)
            const result = await runOperation(res.locals.userContext, "SecurityService", "selectStore", req.body, res.locals.principal, requestMetaOf(req, res))
            if (!isSessionResult(result)) throw new ApplicationError('selectStore failed', 500)
            Security.setSessionCookie(res, result.sessionClaims)
            res.status(200).send(result.body)
        } catch (e: any) {
            sendError(req, res, e)
        }
    })

    app.get(context + '/userContext', async (req: Request, res: Response) => {
        try {
            requireAuthenticated(res)
            // Doğrulanmış principal + merkezi Users belgesinden sunucuda kurulan bağlam; yanıt profil DTO'sudur
            const dto: any = toProfileDto(res.locals.userContext)
            const pr = res.locals.principal
            // [B3] Destek oturumu: bant sayfa yenilemesinde de çıkabilsin diye oturum durumu sunucudan gelir (profil DTO'su yönetici kullanıcıdır: ad/soyad = bant etiketi)
            if (pr?.imp === true) dto.impersonation = { active: true, expiresAt: typeof pr.exp === 'number' ? new Date(pr.exp * 1000).toISOString() : undefined, reason: typeof pr.impReason === 'string' ? pr.impReason : undefined }
            res.status(200).send(dto)
        } catch (e: any) {
            sendError(req, res, e)
        }
    })

    // Açık rota: middleware kimlik istemez; kimliği kendisi doğrular (geçersizse 401) ve gerekirse çerezi sliding yeniler
    app.get(context + '/checkAuthentication', async (req: Request, res: Response) => {
        try {
            await authenticateRequest(req, res)
            res.status(200).send(true)
        } catch (e: any) {
            sendError(req, res, e)
        }
    })
    // ADR-0017 Karar 1.8: istemci hata raporlama. AUTH'LU (kimliksiz sayfalar -- ör. giriş ekranı -- raporlamaz,
    // kötüye kullanım yüzeyi); tenant/kullanıcı bağlamı SUNUCUDA (`res.locals.principal`) eklenir. Jenerik RPC
    // rotasından (`/:service/:operation`) ÖNCE kaydedilir (özel gövde şekli/boyut sınırı/redaksiyon RunOperation'a gitmez).
    app.post(context + '/client-log', clientLogLimiter, (req: Request, res: Response) => {
        try {
            requireAuthenticated(res)
            handleClientLog(req, res)
        } catch (e: any) {
            sendError(req, res, e)
        }
    })

    app.post(context + '/:service/:operation', async (req: Request, res: Response) => {
        try {
            if (DEDICATED_ONLY_OPERATIONS.has((req.params.service + '/' + req.params.operation).toLowerCase())) throw new ApplicationError('Forbidden', 403)
            // Yalnızca açık listedeki operasyonlar (ör. SecurityService/login) kimliksiz çalışır
            if (!isOpenRoute('POST', req.params.service + '/' + req.params.operation)) requireAuthenticated(res)

            const resp = await runOperation(res.locals.userContext, req.params.service, req.params.operation, req.body, res.locals.principal, requestMetaOf(req, res))
            sendOk(req, res, resp)
        } catch (e: any) {
            sendError(req, res, e)
        }
    })

    app.get(context + '/:service', async (req: Request, res: Response) => {
        try {
            requireAuthenticated(res)

            const resp = await runOperation(res.locals.userContext, req.params.service, 'get', {}, res.locals.principal, requestMetaOf(req, res))
            sendOk(req, res, resp);
        } catch (e: any) {
            sendError(req, res, e)
        }
    })
}
