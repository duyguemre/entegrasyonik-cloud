// ADR-0026 Karar 4.2: `/admin-api` kimlik dogrulama. Bir istek YALNIZCA su kosullarin TUMU saglanirsa gecer:
//   EK_ADMIN cerezi var, `aud==='backoffice'`, `ga===true`, DB'den TAZE okunan `Users.isGlobalAdmin===true` (kimlik onbellegi KULLANILMAZ),
//   `mfa===true` (tam oturum), hesap aktif/kilitsiz, tokenVersion tutarli, oturum iptal edilmemis, mutlak 8 sa asilmamis.
// Musteri `JWT_TOKEN` cerezi burada HIC okunmaz. Tum hatalar tek genel 401 (asama `pwd` ile full endpoint'e gelmek 403 MFA_REQUIRED).
import type { Request } from 'express';
import { ApplicationError } from '@api/Security';
import { readAdminCookie, verifyAdminToken, type AdminPrincipal, type AdminStage } from './adminSession';
import type { AdminDeps } from './adminDeps';

export interface AdminAuthResult {
    principal: AdminPrincipal;
    /** Users belgesi (lean; parola ozeti dahil OLABILIR -- disariya SIZDIRILMAZ, yalniz buildUserContext ile suzulur). */
    user: any;
}

export async function authenticateAdminRequest(deps: AdminDeps, req: Request, stage: AdminStage | 'any'): Promise<AdminAuthResult> {
    const token = readAdminCookie(req);
    if (!token) throw new ApplicationError('Token is undefined', 401);
    const principal = verifyAdminToken(token, deps.now());

    if (stage === 'full' && principal.stg !== 'full') throw new ApplicationError('İki adımlı doğrulama gerekli.', 403, 'MFA_REQUIRED');
    if (stage === 'pwd' && principal.stg !== 'pwd') throw new ApplicationError('Token not verified', 401);

    if (await deps.revocation.isRevoked(principal.jti)) throw new ApplicationError('Token not verified', 401);

    const db = await deps.getApplicationDB();
    let user: any;
    try {
        user = await db.getUserModel().findById(principal.sub).lean();
    } catch (e: any) {
        if (e && e.name === 'CastError') throw new ApplicationError('Token not verified', 401);
        throw e;
    }
    if (!user) throw new ApplicationError('Token not verified', 401);
    if ((Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0) !== principal.tv) throw new ApplicationError('Token not verified', 401);
    // Platform katmani: sunucuda DB'den taze `isGlobalAdmin` (token claim'i tek basina yetmez)
    if (user.isGlobalAdmin !== true) throw new ApplicationError('Token not verified', 401);
    if (user.isActive === false) throw new ApplicationError('Account is not active', 401);
    if (user.lockUntil && new Date(user.lockUntil) > new Date(deps.now())) throw new ApplicationError('Account is locked', 401);
    return { principal, user };
}
