// ADR-0017 §10 "Rate limiting / kötüye kullanım": mevcut süreç-içi (`api/rateLimit.ts::createRateLimiter`, ADR-0001
// Karar 10 login/register deseni) GENİŞLETİLİR -- kod TEKRARLANMAZ, aynı sayaç ilkeli KULLANILIR. Genel API için
// kimlik (`tenantId:userSub`) anahtarlı gevşek sınır; kimliksiz istekler IP'ye düşer. Tek replika varsayımı (ADR):
// web pod >= 2 olunca Redis tabanlıya geçiş (§Maliyet eşiği); env `GLOBAL_RATE_LIMIT_ENABLED=false` ile kapatılabilir.
import type { NextFunction, Request, Response } from 'express';
import { config } from '@config';
import { createRateLimiter } from './rateLimit';
import { getClientIp } from './clientIp';

/** Express, her isteği işlerken `req.res`'i doldurur (bkz. `application.handle`) -- middleware sırasında zaten dolu. */
function identityKey(req: Request): string {
    const principal = (req as any).res?.locals?.principal;
    if (principal && typeof principal.sub === 'string') {
        return `${principal.tid ?? '-'}:${principal.sub}`;
    }
    return 'ip:' + getClientIp(req);
}

/**
 * `res.locals.principal`'ı okuyabilmesi için Webserver'da `authenticate` middleware'inden SONRA, rota
 * kaydından (configureApis/configureImageServices) ÖNCE takılmalıdır. Kapalıysa (`GLOBAL_RATE_LIMIT_ENABLED=false`)
 * no-op middleware döner (test/acil durum kaçış anahtarı).
 */
export function createGlobalRateLimitMiddleware() {
    if (!config.rateLimit.global.enabled) {
        return (_req: Request, _res: Response, next: NextFunction) => next();
    }
    return createRateLimiter({
        max: config.rateLimit.global.max,
        windowMs: config.rateLimit.global.windowMs,
        keyFn: identityKey,
    });
}
