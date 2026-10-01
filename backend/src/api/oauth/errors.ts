// RFC 6749 / 7591 / 7009 hata bicimi (`{ error, error_description }`). Katalog zarfindan (`{ error, code, requestId }`) AYRIDIR: bu uclar
// standart OAuth istemcilerine konusur. Mesajlar sabit metindir; girdi yansitilmaz, belirtec/ozet/kod asla iletiye girmez.
export class OAuthError extends Error {
    constructor(public readonly status: number, public readonly oauthError: string, public readonly description: string) {
        super(description);
        this.name = 'OAuthError';
    }
}

export const invalidRequest = (d: string) => new OAuthError(400, 'invalid_request', d);
export const invalidGrant = (d = 'Gecersiz veya suresi dolmus yetki.') => new OAuthError(400, 'invalid_grant', d);
export const invalidClient = () => new OAuthError(401, 'invalid_client', 'Istemci taninmiyor.');
export const invalidScope = (d = 'Gecersiz kapsam.') => new OAuthError(400, 'invalid_scope', d);
export const invalidTarget = () => new OAuthError(400, 'invalid_target', 'resource gecersiz.');
export const unsupportedGrantType = () => new OAuthError(400, 'unsupported_grant_type', 'Desteklenmeyen grant_type.');
export const invalidClientMetadata = (d: string) => new OAuthError(400, 'invalid_client_metadata', d);
export const rateLimited = () => new OAuthError(429, 'rate_limited', 'Cok fazla istek.');
