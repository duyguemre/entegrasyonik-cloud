// ADR-0001 Karar 12: login/register/userContext/selectStore yanıtları sunucuda kurulan PROFİL DTO'sudur.
// Beyaz liste: yalnızca FE'nin kullandığı alanlar döner. password, tokenVersion, failedLoginAttempts, lockUntil, __v ve
// belgede kalmış diğer (strict:false) alanlar ASLA dönmez.
const PROFILE_FIELDS = [
    '_id', 'email', 'name', 'surname', 'username',
    'owner', 'resources', 'roleCode', 'isGlobalAdmin',
    'order', 'clientId',
] as const;

/** `user`: Mongoose doc/lean nesnesi ya da authenticate'in kurduğu userContext. Girdi değiştirilmez. */
export function toProfileDto(user: any): any {
    if (!user) return user;
    const src: any = typeof user.toObject === 'function' ? user.toObject() : user;
    const dto: any = {};
    for (const f of PROFILE_FIELDS) {
        if (src[f] !== undefined) dto[f] = src[f];
    }
    if (Array.isArray(dto.resources)) dto.resources = [...dto.resources];
    // Hesap yaşam döngüsü: e-posta doğrulama durumu HER ZAMAN boolean döner; alanı olmayan (eski) kullanıcılar doğrulanmamıştır.
    // (Doğrulanmamış hesap girişten engellenmez; zorunlu kılma ayrı karar.)
    dto.emailVerified = src.emailVerified === true;
    return dto;
}
