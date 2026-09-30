// [F-06] LogEvents.fingerprint: kararlı, sırsız parmak izi + hata sınıfı türetme (logger.ts <-> eventLog.ts döngüsünü önlemek için ayrı dosya).
import * as crypto from 'crypto';

/** Mesajı parmak izi için şablona çevirir: UUID -> <uuid>, uzun hex/ObjectId -> <id>, sayı -> #, boşluklar sadeleşir. */
export function messageTemplate(message: string): string {
    return String(message ?? '')
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
        .replace(/\b[0-9a-f]{16,}\b/gi, '<id>')
        .replace(/\d+/g, '#')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
}

/** Kararlı 16 hane fingerprint: source + code + mesaj şablonu. */
export function computeFingerprint(source: string | undefined, code: string | undefined, message: string): string {
    return crypto.createHash('sha1').update(`${source ?? '-'}|${code ?? '-'}|${messageTemplate(message)}`).digest('hex').slice(0, 16);
}

/** `IntegrationError` (name === 'IntegrationError') için `code`; diğer hatalar için `name`/`code`. Hata yoksa undefined. */
export function classifyError(err: unknown): string | undefined {
    if (!err || typeof err !== 'object') return undefined;
    const e = err as { name?: unknown; code?: unknown; constructor?: { name?: string } };
    if (e.name === 'IntegrationError' && typeof e.code === 'string') return e.code;
    if (typeof e.code === 'string' && e.code) return e.code;
    return (typeof e.name === 'string' && e.name) || e.constructor?.name || 'Error';
}
