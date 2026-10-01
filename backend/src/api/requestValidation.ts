// [ADR-0023] RPC istek gövdesi doğrulaması: yetenek kaydındaki bağın `input` zod şeması (varsa) ile TEK NOKTADAN doğrulama.
// Hata: 400 + kod `VALIDATION` + `fields: [{ path, message }]`. Gövde DEĞERLERİ hata yanıtına/loga ASLA yansıtılmaz (ADR-0001 Karar 12):
// iletiler zod'un değer içeren metinlerinden değil, `issue.code`'dan üretilen sabit Türkçe iletilerdendir; yalnız izin verilmeyen
// alanların ADLARI (arındırılmış, sınırlı) yazılır.
import type { ZodIssue } from 'zod';
import { RPC_INPUT_BY_RPC } from '../capabilities';
import { ApplicationError } from '@platform/core/security/Security';

export interface FieldIssue { path: string; message: string }

const MAX_ISSUES = 10;

function formatPath(path: ReadonlyArray<string | number>): string {
    let out = '';
    for (const seg of path) out += typeof seg === 'number' ? `[${seg}]` : out ? `.${seg}` : seg;
    return out || '(gövde)';
}

const safeName = (k: string): string => k.replace(/[^A-Za-z0-9_$.-]/g, '?').slice(0, 40);

/** Değer içermeyen, koddan türetilmiş sabit ileti. */
function messageFor(issue: ZodIssue): string {
    switch (issue.code) {
        case 'invalid_type': return issue.received === 'undefined' ? 'zorunlu alan' : 'geçersiz tip';
        case 'unrecognized_keys': return `izin verilmeyen alan: ${issue.keys.slice(0, 5).map(safeName).join(', ')}`;
        case 'too_small': return issue.type === 'string' ? 'çok kısa veya boş' : issue.type === 'array' ? 'yetersiz öğe sayısı' : 'değer çok küçük';
        case 'too_big': return issue.type === 'string' ? 'çok uzun' : issue.type === 'array' ? 'çok fazla öğe' : 'değer çok büyük';
        case 'invalid_string': return 'geçersiz biçim';
        case 'invalid_enum_value': case 'invalid_literal': case 'invalid_union_discriminator': return 'izin verilen değerlerden biri olmalı';
        case 'invalid_union': return 'geçersiz değer';
        case 'custom': return typeof issue.message === 'string' && issue.message.length <= 120 ? issue.message : 'geçersiz değer';
        default: return 'geçersiz değer';
    }
}

export function toFieldIssues(issues: ReadonlyArray<ZodIssue>): FieldIssue[] {
    return issues.slice(0, MAX_ISSUES).map((i) => ({ path: formatPath(i.path), message: messageFor(i) }));
}

/** İstek biçimlendirilmiş bir 400 VALIDATION hatasına dönüştürülür. */
export function validationError(fields: FieldIssue[]): ApplicationError {
    return new ApplicationError('Geçersiz istek: ' + fields.map((f) => `${f.path}: ${f.message}`).join(' | '), 400, 'VALIDATION', fields);
}

/**
 * `body`: sunucu alanları (`userContext/principal/order/clientId/requestMeta`) ATILMIŞ ham istek. Şema yoksa gövde AYNEN döner.
 * Şema varsa zod çıktısı döner (allow-list/`transform` etkisiyle bilinmeyen iç alanlar atılmış olabilir).
 */
export function validateRpcRequest(service: string, operation: string, body: unknown): any {
    const schema = RPC_INPUT_BY_RPC.get(service + '/' + operation);
    if (!schema) return body;
    const parsed = schema.safeParse(body ?? {});
    if (parsed.success) return parsed.data;
    throw validationError(toFieldIssues(parsed.error.issues));
}
