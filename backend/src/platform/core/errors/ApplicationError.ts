import { AppError } from './AppError';

/**
 * Bilinçli, kullanıcıya yazılmış hata (ADR-0016 §4.3: `AppError`'ın uyumlu alt sınıfı). `message` istemciye AYNEN döner
 * (expose=true); `statusCode` = HTTP durumu. `code` verilmezse HTTP durumundan katalog kodu türetilir
 * (`platform/core/errors/codes.ts`); verilirse (ör. WEAK_PASSWORD) o kod korunur.
 * ADR-0024 P1-CORE: operations katmanı api/Security'ye bağımlı olmasın diye platform'a taşındı (api/Security eski yolda yeniden dışa aktarır).
 */
export class ApplicationError extends AppError {
    constructor(message: any, statusCode: any, code?: string, details?: unknown) {
        super(message, Number(statusCode) || 500, { code, expose: true, details });
    }
}
