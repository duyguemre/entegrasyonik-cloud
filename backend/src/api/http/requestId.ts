// ADR-0017 Karar 1.6: TÜM rotalardan (health/webhook dahil, auth'tan ÖNCE) önce takılan correlation middleware'i.
// Gelen `X-Request-Id` geçerli biçimse aynen kullanılır, değilse üretilir; yanıtta HER ZAMAN `X-Request-Id` döner.
import type { NextFunction, Request, Response } from 'express';
import { resolveRequestId, runWithContext } from '@platform/core/context';

export const REQUEST_ID_HEADER = 'X-Request-Id';

export function createRequestIdMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
        const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER.toLowerCase()]);
        res.setHeader(REQUEST_ID_HEADER, requestId);
        res.locals.requestId = requestId;
        runWithContext({ requestId, route: `${req.method} ${req.path}` }, () => next());
    };
}
