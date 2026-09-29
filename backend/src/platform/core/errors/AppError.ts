// ADR-0016 §4.3: uygulama hatası. `expose=true` ise `message` istemciye AYNEN döner (bilinçli, kullanıcıya yazılmış ileti);
// `expose=false` ise istemciye genel ileti + requestId gider, ayrıntı yalnızca loga yazılır.
//
// KASITLI TASARIM (blast-radius'u sınırlamak için): `code` HTTP durumundan OTOMATİK türetilmez — yalnızca açıkça
// verilirse taşınır (`undefined` kalabilir). `ApiManager.sendError` yalnız `typeof e.code === 'string'` ise yanıta
// `code` ekler (ESKİ davranışla AYNI kapı); böylece mevcut `ApplicationError(msg, status)` çağrıları (kod VERMEYEN
// yüzlerce çağrı yeri) yanıt gövdesini DEĞİŞTİRMEZ. Yeni/known kodlu hatalar `AppError.of(code)` ile üretilir.
// Beklenmeyen (500, maskelenmiş) hatalarda kod her zaman `sendError` tarafından `'INTERNAL'` olarak eklenir.
import { ERROR_CODES, ErrorCode } from './codes';

export interface AppErrorOptions {
    /** Katalog kodu (ör. WEAK_PASSWORD, VALIDATION). Verilmezse `code` tanımsız kalır (geriye uyum). */
    code?: string;
    /** İletinin istemciye gösterilip gösterilmeyeceği. Varsayılan: true (bilinçli üretilmiş hata). */
    expose?: boolean;
    details?: unknown;
    cause?: unknown;
}

export class AppError extends Error {
    public readonly code?: string;
    public readonly status: number;
    public readonly expose: boolean;
    public readonly details?: unknown;
    public readonly cause?: unknown;

    constructor(message: string, status: number = 500, opts: AppErrorOptions = {}) {
        super(message);
        this.name = new.target.name;
        this.status = status;
        this.code = opts.code;
        this.expose = opts.expose ?? true;
        this.details = opts.details;
        this.cause = opts.cause;
        Object.setPrototypeOf(this, new.target.prototype);
        if (typeof (Error as any).captureStackTrace === 'function') (Error as any).captureStackTrace(this, new.target);
    }

    /** Express/`ApplicationError` uyumu: `statusCode` = `status`. */
    get statusCode(): number { return this.status; }

    /** Katalog varsayılan iletisiyle hata üretir. */
    static of(code: ErrorCode, opts: Omit<AppErrorOptions, 'code'> & { message?: string } = {}): AppError {
        const def = ERROR_CODES[code];
        return new AppError(opts.message ?? def.message, def.status, { ...opts, code });
    }

    /** İletisi istemciye SIZMAYAN beklenmeyen iç hata (ayrıntı loga gider). */
    static internal(message: string, cause?: unknown): AppError {
        return new AppError(message, 500, { code: 'INTERNAL', expose: false, cause });
    }
}
