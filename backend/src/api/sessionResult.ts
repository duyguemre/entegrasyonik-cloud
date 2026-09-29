import type { SessionClaimsInput } from './Security';

/**
 * login/register/selectStore sonucu: `body` HTTP yanıt gövdesidir (profil DTO'su; token/parola içermez);
 * `sessionClaims` ise yalnızca ApiManager tarafından Set-Cookie ile imzalanır (gövdeye ASLA girmez).
 */
export interface SessionResult { sessionClaims: SessionClaimsInput; body: any }

export function isSessionResult(r: any): r is SessionResult {
    return !!r && typeof r === 'object' && !!r.sessionClaims && 'body' in r
}
