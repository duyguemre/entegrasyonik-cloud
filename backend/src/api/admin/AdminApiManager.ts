// ADR-0026 Karar 2B / Karar 4: `/admin-api` baglama noktasi (AYNI surecte, `ApiManager` deseni, AYNI RPC motoru).
//
// Sira (her istek): IP allowlist (opsiyonel) -> ayri CORS (ADMIN_CORS_ORIGINS) -> Origin dogrulamasi (yazmalarda ZORUNLU) -> kimlik.
// Bu router `Webserver.configure()` icinde musteri `cors`/`originCheck`/`authenticate` middleware'lerinden ONCE baglanir; boylece
// musteri CORS listesi/`JWT_TOKEN` cerezi bu yolda HIC devreye girmez ve `/admin-api` musteri `authenticate`'ine takilmaz.
// Yalniz platform katmani aktorleri (DB'de `isGlobalAdmin`) + TOTP tamamlanmis oturumlar operasyon cagirabilir.
import express, { NextFunction, Request, Response, Router } from 'express';
import cors from 'cors';
import { config } from '@config';
import Security, { ApplicationError, type SessionPrincipal } from '@platform/core/security/Security';
import runOperation from '@api/rpc/RunOperation';
import { getRequiredTier } from '@api/rpc/operationPolicy';
import { buildUserContext } from '@api/http/authenticate';
import { sendError, sendOk } from '@api/rpc/ApiManager';
import { getClientIp } from '@platform/rateLimit/clientIp';
import { createRateLimiter, rateLimitOptionsFromEnv } from '@platform/rateLimit/rateLimit';
import { getIdentityCache } from '@platform/core/security/identityCache';
import { AuditLogger, type AuditEntry } from '@services/audit/AuditLogger';
import { getRequestId } from '@platform/core/context';
import { decryptField, encryptField } from '@utils/FieldCrypto';
import { GENERIC_LOGIN_ERROR } from '@api/rpc/handlers/security-service';
import {
    ADMIN_ABSOLUTE_SECONDS, ADMIN_API_PATH, ADMIN_REAUTH_SECONDS, expireAdminSessionCookie, readAdminCookie, setAdminSessionCookie,
    verifyAdminToken, refreshAdminSession, type AdminPrincipal,
} from './adminSession';
import { authenticateAdminRequest } from './adminAuthenticate';
import { defaultAdminDeps, type AdminDeps } from './adminDeps';
import { isIpAllowed } from './ipAllowlist';
import { generateTotpSecret, otpauthUri, verifyTotp } from './totp';
import { findRecoveryCodeIndex, generateRecoveryCodes, hashRecoveryCodes, isRecoveryCodeShape } from './recoveryCodes';
import { isFreshReauth, requireReason, requireStepUp, requiresStepUp } from './stepUp';
import { issueImpersonationTicket, IMPERSONATION_TICKET_TTL_SECONDS } from './impersonationTicket';
import { sendHttpError } from '../http/errorEnvelope';
import { AdminUserManager } from './adminUserManager';
import { mountAdminAgentRoutes, type AdminAgentRouteDeps } from './adminAgentRoutes';

/** `/admin-api` uzerinden ASLA cagrilamayan platformAdmin RPC'leri (cerez basan/musteri oturumuna ozgu). Impersonation yalniz bilet ile. */
export const ADMIN_API_DENIED_RPCS: ReadonlySet<string> = new Set(['SecurityService/selectStore']);

const MFA_MAX_FAILURES = 5;
const MFA_LOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const normalizeOrigin = (o: string) => o.trim().replace(/\/+$/, '').toLowerCase();

function originOf(req: Request): string | undefined {
    const o = req.headers?.origin;
    if (typeof o === 'string' && o) return o;
    const r = req.headers?.referer;
    if (typeof r === 'string' && r) {
        try { const u = new URL(r); return u.origin === 'null' ? 'null' : u.origin; } catch { return 'null'; }
    }
    return undefined;
}

/**
 * CSRF (Karar 4.3): SameSite=Strict + Origin dogrulamasi. Durum degistiren isteklerde Origin (yoksa Referer) ADMIN_CORS_ORIGINS icinde OLMALI;
 * ikisi de yoksa REDDEDILIR (musteri originCheck'inin aksine: backoffice SPA her yazmada Origin gonderir; ayni-host istisnasi YOK).
 */
export function adminOriginGuard(allowed: () => string[] = () => config.admin.corsOrigins) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!MUTATING.has((req.method || '').toUpperCase())) return next();
        const origin = originOf(req);
        if (origin === undefined || !allowed().includes(normalizeOrigin(origin))) {
            sendHttpError(res, 403, 'Forbidden origin', 'FORBIDDEN');
            return;
        }
        next();
    };
}

function adminIpGuard(req: Request, res: Response, next: NextFunction) {
    if (!isIpAllowed(getClientIp(req), config.admin.ipAllowlist)) {
        sendHttpError(res, 403, 'Forbidden', 'FORBIDDEN');
        return;
    }
    next();
}

function adminCors() {
    return (req: Request, res: Response, next: NextFunction) => {
        const origins = config.admin.corsOrigins;
        return cors({
            origin: origins.length ? origins : false,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // PUT/DELETE: yalniz /agent/provider + /agent/conversations (BR-4)
            allowedHeaders: ['Content-Type', 'X-Request-Id', 'X-Client-Platform'],   // MOB-08: istemci platform sınıfı
            exposedHeaders: ['X-Request-Id'],
            maxAge: 600,
            optionsSuccessStatus: 204,
        })(req, res, next);
    };
}

const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined);

function auditBackoffice(entry: AuditEntry & { reason?: string }): void {
    const { reason, ...rest } = entry;
    void AuditLogger.log({
        surface: 'backoffice', actorType: 'platform', reqId: getRequestId(), ...rest,
        meta: reason ? { ...(rest.meta ?? {}), reason } : rest.meta,
    });
}

function sessionPrincipalOf(p: AdminPrincipal): SessionPrincipal {
    return { sub: p.sub, tid: undefined, role: undefined, ga: true, tv: p.tv, imp: false, auth_time: p.auth_time, iat: p.iat, exp: p.exp, iss: '', aud: 'backoffice' };
}

export function createAdminRouter(deps: AdminDeps = defaultAdminDeps(), agent: Pick<AdminAgentRouteDeps, 'broker' | 'providers' | 'heartbeatMs'> = {}): Router {
    const router = express.Router();
    const loginLimiter = createRateLimiter(rateLimitOptionsFromEnv());
    const mfaLimiter = createRateLimiter(rateLimitOptionsFromEnv());
    const impersonationLimiter = createRateLimiter(rateLimitOptionsFromEnv()); // [B3] bilet üretimi: ayrı kova, IP başına
    const now = () => deps.now();
    const nowSec = () => Math.floor(now() / 1000);

    router.use(adminIpGuard);
    router.use(adminCors());
    router.use(adminOriginGuard());

    const wrap = (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
        try { await fn(req, res); } catch (e: any) { sendError(req, res, e); }
    };

    // ---- S2: parola -> yarim oturum (TOTP bekler) ----
    router.post('/BackofficeAuthService/login', loginLimiter, wrap(async (req, res) => {
        const ip = getClientIp(req);
        const email = str(req.body?.email, 320);
        const password = str(req.body?.password, 1024);
        if (!email || !password) throw new ApplicationError('Geçersiz istek.', 400, 'VALIDATION');
        const db = await deps.getApplicationDB();
        const userModel = db.getUserModel();
        const user = await userModel.findOne({ email });
        const security = Security.getInstance();
        const locked = !!(user && user.lockUntil && user.lockUntil > new Date(now()));
        // Kullanici yok / platform yoneticisi degil / pasif / kilitli: parola bakilmadan reddedilir ama sahte bcrypt ile zamanlama yaklastirilir,
        // AYNI genel hata (numaralandirma yok; tenant kullanicisi dogru parolayla bile buradan giremez).
        if (!user || user.isGlobalAdmin !== true || user.isActive === false || locked) {
            await security.comparePassword(password, await security.getDummyHash());
            auditBackoffice({ event: 'backoffice.login', result: 'fail', ip, meta: { why: 'ineligible' } });
            throw new ApplicationError(GENERIC_LOGIN_ERROR, 401);
        }
        const ok = await security.comparePassword(password, typeof user.password === 'string' ? user.password : await security.getDummyHash());
        if (!ok) {
            const attempts = (user.failedLoginAttempts ?? 0) + 1;
            const update: any = { $set: { failedLoginAttempts: attempts } };
            if (attempts >= LOGIN_MAX_FAILURES) update.$set.lockUntil = new Date(now() + LOGIN_LOCK_MS);
            await userModel.updateOne({ _id: user._id }, update);
            if (attempts >= LOGIN_MAX_FAILURES) getIdentityCache().invalidateUser(user._id);
            auditBackoffice({ event: 'backoffice.login', result: 'fail', sub: String(user._id), ip, meta: { why: 'password' } });
            throw new ApplicationError(GENERIC_LOGIN_ERROR, 401);
        }
        await userModel.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0 }, $unset: { lockUntil: 1 } });
        const rec = await deps.mfaStore.get(String(user._id));
        const enrolled = !!rec?.enabledAt;
        setAdminSessionCookie(res, { sub: String(user._id), tv: Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0, stg: 'pwd' }, now());
        auditBackoffice({ event: 'backoffice.login', result: 'ok', sub: String(user._id), ip, meta: { stage: 'password' } });
        res.status(200).send({ mfaRequired: enrolled, enrollRequired: !enrolled });
    }));

    // ---- S3: TOTP kaydi (yarim oturum) ----
    router.post('/BackofficeAuthService/enrollTotp', mfaLimiter, wrap(async (req, res) => {
        const { principal, user } = await authenticateAdminRequest(deps, req, 'pwd');
        const rec = await deps.mfaStore.get(principal.sub);
        if (rec?.enabledAt) throw new ApplicationError('İki adımlı doğrulama zaten etkin.', 409);
        const secret = generateTotpSecret();
        if (!(await deps.mfaStore.setPending(principal.sub, encryptField(secret)))) throw new ApplicationError('İki adımlı doğrulama zaten etkin.', 409);
        res.status(200).send({ otpauthUri: otpauthUri(secret, user.email) });
    }));

    router.post('/BackofficeAuthService/confirmTotp', mfaLimiter, wrap(async (req, res) => {
        const { principal, user } = await authenticateAdminRequest(deps, req, 'pwd');
        const code = str(req.body?.code, 8);
        if (!code) throw new ApplicationError('Geçersiz istek.', 400, 'VALIDATION');
        const rec = await deps.mfaStore.get(principal.sub);
        if (!rec || rec.enabledAt || !rec.pendingSecret) throw new ApplicationError('Bekleyen bir kayıt yok.', 409);
        if (rec.lockUntil && new Date(rec.lockUntil) > new Date(now())) throw new ApplicationError('Çok fazla deneme.', 429);
        const match = verifyTotp(decryptField(rec.pendingSecret), code, now());
        if (!match) {
            await deps.mfaStore.recordFailure(principal.sub, MFA_MAX_FAILURES, MFA_LOCK_MS, new Date(now()));
            auditBackoffice({ event: 'backoffice.mfa_enroll', result: 'fail', sub: principal.sub, ip: getClientIp(req) });
            throw new ApplicationError('Doğrulama kodu hatalı.', 401);
        }
        const codes = generateRecoveryCodes();
        const activated = await deps.mfaStore.activate(principal.sub, rec.pendingSecret, match.step, await hashRecoveryCodes(codes));
        if (!activated) throw new ApplicationError('Kayıt tamamlanamadı.', 409);
        setAdminSessionCookie(res, { sub: principal.sub, tv: principal.tv, stg: 'full', auth_time: principal.auth_time, reauth_at: nowSec() }, now());
        auditBackoffice({ event: 'backoffice.mfa_enroll', result: 'ok', sub: principal.sub, ip: getClientIp(req) });
        res.status(200).send({ recoveryCodes: codes, user: { sub: principal.sub, email: user.email, name: user.name, surname: user.surname } });
    }));

    // ---- S4: TOTP ya da kurtarma kodu -> tam oturum ----
    router.post('/BackofficeAuthService/verifyTotp', mfaLimiter, wrap(async (req, res) => {
        const { principal, user } = await authenticateAdminRequest(deps, req, 'pwd');
        const method = await checkSecondFactor(deps, principal.sub, req.body, now());
        auditBackoffice({ event: 'backoffice.mfa_verify', result: 'ok', sub: principal.sub, ip: getClientIp(req), meta: { method: method.kind } });
        setAdminSessionCookie(res, { sub: principal.sub, tv: principal.tv, stg: 'full', auth_time: principal.auth_time, reauth_at: nowSec() }, now());
        res.status(200).send({
            user: { sub: principal.sub, email: user.email, name: user.name, surname: user.surname },
            ...(method.kind === 'recovery' ? { recoveryCodesRemaining: method.remaining } : {}),
        });
    }));

    // ---- S5: yeniden dogrulama (step-up), cikis, tum oturumlar, me ----
    router.post('/BackofficeAuthService/reauth', mfaLimiter, wrap(async (req, res) => {
        const { principal, user } = await authenticateAdminRequest(deps, req, 'full');
        const password = str(req.body?.password, 1024);
        if (!password) throw new ApplicationError('Geçersiz istek.', 400, 'VALIDATION');
        const security = Security.getInstance();
        if (!(await security.comparePassword(password, typeof user.password === 'string' ? user.password : await security.getDummyHash()))) {
            auditBackoffice({ event: 'backoffice.reauth', result: 'fail', sub: principal.sub, ip: getClientIp(req), meta: { why: 'password' } });
            throw new ApplicationError('Parola veya doğrulama kodu hatalı.', 401);
        }
        await checkSecondFactor(deps, principal.sub, req.body, now());
        const reauthAt = nowSec();
        setAdminSessionCookie(res, { sub: principal.sub, tv: principal.tv, stg: 'full', auth_time: principal.auth_time, reauth_at: reauthAt, jti: principal.jti }, now());
        auditBackoffice({ event: 'backoffice.reauth', result: 'ok', sub: principal.sub, ip: getClientIp(req) });
        res.status(200).send({ reauthAt, reauthValidUntil: reauthAt + ADMIN_REAUTH_SECONDS });
    }));

    router.post('/BackofficeAuthService/logout', wrap(async (req, res) => {
        // Herhangi bir asamadaki gecerli token iptal edilir; gecersiz/yok olsa da cerez HER ZAMAN silinir. `tokenVersion` ARTMAZ (yalniz bu oturum).
        const token = readAdminCookie(req);
        if (token) {
            try {
                const p = verifyAdminToken(token, now());
                await deps.revocation.revoke(p.jti, p.exp - nowSec());
                auditBackoffice({ event: 'backoffice.logout', result: 'ok', sub: p.sub, ip: getClientIp(req) });
            } catch { /* gecersiz token: yalniz cerez silinir */ }
        }
        expireAdminSessionCookie(res);
        res.status(200).send(true);
    }));

    router.post('/BackofficeAuthService/logoutAllSessions', wrap(async (req, res) => {
        const { principal } = await authenticateAdminRequest(deps, req, 'full');
        const db = await deps.getApplicationDB();
        await db.getUserModel().updateOne({ _id: principal.sub }, { $inc: { tokenVersion: 1 } });
        getIdentityCache().invalidateUser(principal.sub);
        expireAdminSessionCookie(res);
        auditBackoffice({ event: 'backoffice.logout_all', result: 'ok', sub: principal.sub, ip: getClientIp(req) });
        res.status(200).send(true);
    }));

    const me = wrap(async (req, res) => {
        const { principal, user } = await authenticateAdminRequest(deps, req, 'any');
        const base = { stage: principal.stg, mfaRequired: principal.stg === 'pwd' };
        if (principal.stg === 'pwd') { res.status(200).send(base); return; }
        refreshAdminSession(res, principal, now());
        const rec = await deps.mfaStore.get(principal.sub);
        res.status(200).send({
            ...base,
            user: { sub: principal.sub, email: user.email, name: user.name, surname: user.surname },
            session: {
                authTime: principal.auth_time,
                absoluteExpiresAt: principal.auth_time + ADMIN_ABSOLUTE_SECONDS,
                reauthAt: principal.reauth_at ?? null,
                reauthFresh: isFreshReauth(principal, now()),
            },
            mfa: { enabled: !!rec?.enabledAt, recoveryCodesRemaining: (rec?.recoveryHashes ?? []).filter(h => !h.usedAt).length },
        });
    });
    router.get('/BackofficeAuthService/me', me);
    router.post('/BackofficeAuthService/me', me);

    // ---- B12: platform yoneticisi davet kabulu (KIMLIKSIZ; token = yetki). Oturum ACMAZ: kullanici giris + TOTP kaydiyla devam eder. ----
    router.post('/BackofficeAuthService/acceptInvite', loginLimiter, wrap(async (req, res) => {
        const db = await deps.getApplicationDB();
        const manager = new AdminUserManager({
            applicationDB: db as any, mfaStore: deps.mfaStore, now,
            mailSender: async () => { /* kabulde e-posta gonderilmez */ }, backofficeBaseUrl: () => null,
        });
        const out = await manager.acceptInvite({ token: str(req.body?.token, 128), name: str(req.body?.name, 200), surname: str(req.body?.surname, 200), password: str(req.body?.password, 1024) }, getClientIp(req));
        res.status(200).send(out);
    }));

    // ---- B3: impersonation bileti (step-up + gerekce; Redis yoksa reddedilir) ----
    router.post('/BackofficeTenantService/startImpersonation', impersonationLimiter, wrap(async (req, res) => {
        const { principal } = await authenticateAdminRequest(deps, req, 'full');
        const ip = getClientIp(req);
        requireStepUp(principal, now());
        const reason = requireReason(req.body);
        const tid = Number(req.body?.tid);
        if (!Number.isInteger(tid) || tid <= 0) throw new ApplicationError('Geçersiz mağaza.', 400, 'VALIDATION');
        const db = await deps.getApplicationDB();
        const client: any = await db.getClientModel().findOne({ order: tid }, 'order status').lean();
        if (!client || client.status !== 'ACTIVE') throw new ApplicationError('Geçersiz mağaza.', 400, 'VALIDATION');
        const base = config.mail.publicAppUrl?.trim().replace(/\/+$/, '');
        if (!base) throw new ApplicationError('Impersonation şu an kullanılamıyor.', 503, 'IMPERSONATION_UNAVAILABLE');
        try {
            const ticket = await issueImpersonationTicket(deps.redis(), { sub: principal.sub, tid, tv: principal.tv, reason }, now());
            // Bilet URL fragment'inda (#t=): sunucu loglari ve Referer gormez.
            auditBackoffice({ event: 'impersonation.start', result: 'ok', sub: principal.sub, tid, onBehalfOf: tid, ip, reason });
            res.status(200).send({ url: `${base}/impersonate#t=${ticket}`, expiresInSeconds: IMPERSONATION_TICKET_TTL_SECONDS });
        } catch (e) {
            auditBackoffice({ event: 'impersonation.start', result: 'error', sub: principal.sub, tid, onBehalfOf: tid, ip, reason });
            throw e;
        }
    }));

    // ---- BR-4: backoffice sohbeti (`/admin-api/agent/*`); jenerik RPC rotasindan ONCE ----
    mountAdminAgentRoutes(router, { deps, sessionPrincipalOf, now, ...agent });

    // ---- Jenerik RPC (yalniz platformAdmin yetenekleri) ----
    router.post('/:service/:operation', wrap(async (req, res) => {
        const { service, operation } = req.params;
        const { principal, user } = await authenticateAdminRequest(deps, req, 'full');
        const rpc = service + '/' + operation;
        // Yalniz `minTier:'platformAdmin'` yetenekler (kayitsiz/tenant kademeli/`_` onekli/prototip uyeleri -> 403) ve yasak liste disinda
        if (ADMIN_API_DENIED_RPCS.has(rpc) || getRequiredTier(service, operation) !== 'platformAdmin') throw new ApplicationError('Forbidden', 403);
        let reason: string | undefined;
        if (requiresStepUp(rpc)) {
            requireStepUp(principal, now());
            reason = requireReason(req.body);
        }
        const sessionPrincipal = sessionPrincipalOf(principal);
        const userContext = buildUserContext(user, { tid: undefined, ga: true });
        const result = await runOperation(userContext, service, operation, req.body, sessionPrincipal, { ip: getClientIp(req), surface: 'backoffice', reason });
        refreshAdminSession(res, principal, now());
        sendOk(req, res, result);
    }));

    router.use((_req, res) => { sendHttpError(res, 404, 'Not found', 'NOT_FOUND'); });
    return router;
}

type SecondFactor = { kind: 'totp' } | { kind: 'recovery'; remaining: number };

/**
 * TOTP (+-1 adim; son kullanilan adim tekrar KABUL EDILMEZ -- atomik `claimStep`) ya da tek kullanimlik kurtarma kodu. Basarisiz denemeler
 * hesap basina sayilir (5 -> 15 dk kilit) ve IP hiz sinirlayiciya ek olarak calisir. Hata iletisi tek/genel.
 */
export async function checkSecondFactor(deps: AdminDeps, sub: string, body: any, nowMs: number): Promise<SecondFactor> {
    const rec = await deps.mfaStore.get(sub);
    if (!rec?.enabledAt || !rec.secret) throw new ApplicationError('İki adımlı doğrulama kaydı gerekli.', 409, 'MFA_REQUIRED');
    if (rec.lockUntil && new Date(rec.lockUntil) > new Date(nowMs)) throw new ApplicationError('Çok fazla deneme. Daha sonra tekrar deneyin.', 429);
    const fail = async (): Promise<never> => {
        await deps.mfaStore.recordFailure(sub, MFA_MAX_FAILURES, MFA_LOCK_MS, new Date(nowMs));
        auditBackoffice({ event: 'backoffice.mfa_verify', result: 'fail', sub });
        throw new ApplicationError('Doğrulama kodu hatalı.', 401);
    };
    if (typeof body?.recoveryCode === 'string' && body.recoveryCode) {
        if (!isRecoveryCodeShape(body.recoveryCode)) return fail();
        const entries = rec.recoveryHashes ?? [];
        const idx = await findRecoveryCodeIndex(body.recoveryCode, entries);
        if (idx < 0 || !(await deps.mfaStore.consumeRecovery(sub, entries[idx].hash, new Date(nowMs)))) return fail();
        await deps.mfaStore.clearFailures(sub);
        auditBackoffice({ event: 'backoffice.recovery_code_used', result: 'ok', sub });
        return { kind: 'recovery', remaining: entries.filter((e, i) => !e.usedAt && i !== idx).length };
    }
    const code = str(body?.code, 8);
    const match = code ? verifyTotp(decryptField(rec.secret), code, nowMs) : undefined;
    if (!match || !(await deps.mfaStore.claimStep(sub, match.step))) return fail();
    await deps.mfaStore.clearFailures(sub);
    return { kind: 'totp' };
}

/** `Webserver.configure()` icinde, musteri cors/originCheck/authenticate'ten ONCE cagrilir. */
export function configureAdminApi(app: express.Express, deps?: AdminDeps): void {
    app.use(ADMIN_API_PATH, createAdminRouter(deps));
}
