import { ApplicationError } from '@platform/core/errors';

// [ADR-0028 Karar 8] Adım-yükseltmesi (step-up), tenant tarafı. ADR çerez `reauth_at` claim'i öngörür; oturum çerezi/`Security` claim şeması bu iş
// paketinin sahipliğinde olmadığından MEKANİZMA SUNUCU TARAFLI tutulur: `AccountService/reauthenticate {password}` parolayı doğrular ve merkezi
// `Users.reauthAt` yazar; step-up gerektiren işlemler burayı okur (5 dk). Kullanıcı bazlıdır (oturum bazlı değil) — ADR claim'ine geçişte yalnız bu
// dosya değişir.

export const REAUTH_WINDOW_MS = 5 * 60 * 1000;
export const REAUTH_REQUIRED_CODE = 'REAUTH_REQUIRED';

export function reauthValidUntil(reauthAt: unknown): Date | undefined {
    if (!reauthAt) return undefined;
    const t = new Date(reauthAt as any).getTime();
    return Number.isFinite(t) ? new Date(t + REAUTH_WINDOW_MS) : undefined;
}

/** Son parola doğrulaması <= 5 dk değilse `401 REAUTH_REQUIRED` (FE diyalog açıp isteği yineler). `usersModel`: merkezi Users. */
export async function assertRecentReauth(usersModel: any, sub: string, nowMs: number = Date.now()): Promise<void> {
    const q: any = usersModel.findOne({ _id: sub }, 'reauthAt');
    const doc: any = q && typeof q.lean === 'function' ? await q.lean() : await q; // Mongoose sorgusu ya da düz Promise (birim test mock'u)
    const until = reauthValidUntil(doc?.reauthAt);
    if (!until || until.getTime() < nowMs) {
        throw new ApplicationError('İşlemi onaylamak için parolanızı yeniden girin.', 401, REAUTH_REQUIRED_CODE);
    }
}
