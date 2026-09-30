// [ADR-0030 X5] Tek hata zarfı (RPC dışı uçlar + son hata işleyici): `{ error, code, requestId }`. `error` metin KALIR (geriye uyum),
// `code` katalog kodudur (docs/ERROR_CODES.md). requestId: ALS bağlamı, yoksa `X-Request-Id` yanıt başlığı (body-parser hatalarında ALS kaybolabilir).
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import { getRequestId } from '@platform/core/context';
import { AppError, ERROR_CODES, codeForStatus, isKnownErrorCode } from '@platform/core/errors';
import { logger } from '@platform/core/logger';

const log = logger.child({ module: 'httpError' });

function currentRequestId(res: Response): string | undefined {
    const h = res.getHeader?.('x-request-id');
    return getRequestId() ?? (typeof h === 'string' && h ? h : undefined);
}

/** Ham `res.status(n).send({ error })` yerine: zarf `{ error, code, requestId }`. `message` verilmezse katalog iletisi. */
export function sendHttpError(res: Response, status: number, message?: string, code?: string): void {
    const c = code ?? codeForStatus(status);
    const body: Record<string, unknown> = { error: message ?? (isKnownErrorCode(c) ? ERROR_CODES[c].message : ERROR_CODES.INTERNAL.message), code: c };
    const requestId = currentRequestId(res);
    if (requestId) body.requestId = requestId;
    res.status(status).send(body);
}

/** Hiçbir rotanın karşılamadığı istek: JSON 404 (Express'in HTML'i yerine). */
export const notFoundHandler: RequestHandler = (_req: Request, res: Response) => {
    sendHttpError(res, 404, 'İstenen yol bulunamadı.', 'NOT_FOUND');
};

/**
 * Son hata işleyici (4 argümanlı; TÜM rotalardan SONRA). Beklenmeyen hatada istemciye yığın/iç ileti SIZMAZ (yalnız genel ileti +
 * requestId; ayrıntı logda). Bilinçli `AppError` (expose) iletisi/kodu aynen döner; body-parser hataları 400/413 zarfına çevrilir.
 */
export const errorHandler: ErrorRequestHandler = (err: any, req: Request, res: Response, next) => {
    if (res.headersSent) return next(err); // akış başladıysa Express bağlantıyı keser
    if (err instanceof AppError && err.status < 500 && err.expose) return sendHttpError(res, err.status, err.message, err.code ?? codeForStatus(err.status));
    const status = Number(err?.status ?? err?.statusCode);
    if (status === 413) return sendHttpError(res, 413, ERROR_CODES.PAYLOAD_TOO_LARGE.message, 'PAYLOAD_TOO_LARGE');
    if (status >= 400 && status < 500) {
        // body-parser (bozuk JSON/kodlama) ve http-errors: iç ileti (gövde parçası içerebilir) yerine sabit ileti.
        return sendHttpError(res, status, status === 400 ? 'Geçersiz istek gövdesi.' : undefined, codeForStatus(status));
    }
    log.error({ method: req.method, err }, 'Yakalanmamış hata');
    sendHttpError(res, 500, ERROR_CODES.INTERNAL.message, 'INTERNAL');
};
