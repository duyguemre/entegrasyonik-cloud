// F-09 / ADR-0018 (API-drift sinyali) — pazaryeri YANIT sözleşmesi gözlemcisi.
// DAVRANIŞ KESİN KURALI: yalnız GÖZLEM. Yanıtı değiştirmez, reddetmez, fırlatmaz (ADR-0030 madde 8: yanıt
// şeması çalışma anında zorlanmaz). Uyuşmazlıkta:
//   - `integration_response_schema_mismatch{integration,endpoint,field}` sayacı artar,
//   - eventLog `API_SCHEMA_DRIFT` yazılır (alan yolu + beklenen tip; DEĞER/PII YOK).
// Şemalar `.passthrough()` olmalı (bilinmeyen alan uyuşmazlık sayılmaz); zorunlu = yalnız kodun okuduğu alanlar.
import { z, type ZodTypeAny } from 'zod';
import { eventLog } from '@platform/core/logger';
import { metricsRegistry } from '@platform/runtime/metrics';

const log = eventLog('engine', 'observeResponseSchema');

export interface ResponseContract {
    integration: string;
    /** Düşük kardinaliteli uç kimliği, ör. 'orders.list'. URL/kimlik içermez. */
    endpoint: string;
    schema: ZodTypeAny;
}

const MAX_FIELDS_PER_RESPONSE = 10;
const SAFE_PATH = /^[A-Za-z0-9_\-[\].()]{1,120}$/;

/** Dizi indekslerini `[]` yapar (metrik kardinalitesi); güvensiz karakterli yolu maskeler. */
export function normalizeFieldPath(path: ReadonlyArray<string | number>): string {
    let out = '';
    for (const seg of path) out += typeof seg === 'number' ? '[]' : (out ? `.${seg}` : String(seg));
    if (!out) out = '(root)';
    return SAFE_PATH.test(out) ? out : '<redacted-path>';
}

/**
 * `data`'yı sözleşmeye karşı doğrular. Uyuşuyorsa `true`; uyuşmazsa sinyal üretip `false` döner. ASLA fırlatmaz.
 */
export function observeResponseSchema(contract: ResponseContract, data: unknown, ctx?: { clientId?: string | number }): boolean {
    try {
        const result = contract.schema.safeParse(data);
        if (result.success) return true;

        const seen = new Set<string>();
        for (const issue of result.error.issues) {
            const field = normalizeFieldPath(issue.path);
            if (seen.has(field) || seen.size >= MAX_FIELDS_PER_RESPONSE) continue;
            seen.add(field);
            const expected = issue.code === 'invalid_type' ? String(issue.expected) : issue.code;
            metricsRegistry.incCounter('integration_response_schema_mismatch',
                { integration: contract.integration, endpoint: contract.endpoint, field });
            log.warn('API_SCHEMA_DRIFT', 'Pazaryeri yanıtı beklenen sözleşmeye uymuyor (istek başarısız SAYILMADI).', {
                integrationCode: contract.integration,
                endpoint: contract.endpoint,
                field,
                expected,
                tenantId: ctx?.clientId,
            });
        }
        return false;
    } catch {
        return true; // gözlemci hiçbir koşulda iş akışını bozmaz
    }
}

/** "Şu alanlardan en az biri dolu (string/number) olmalı" — ör. orderNumber | orderId. Uyuşmazlık yolu: ilk anahtar. */
export function requireOneOf<T extends z.ZodObject<any, any, any, any, any>>(schema: T, keys: string[], expected = 'string') {
    return schema.superRefine((val: Record<string, unknown>, ctx) => {
        const ok = keys.some(k => {
            const v = val[k];
            return (typeof v === 'string' && v !== '') || typeof v === 'number';
        });
        if (!ok) ctx.addIssue({ code: z.ZodIssueCode.invalid_type, expected: expected as any, received: 'undefined', path: [keys[0]], message: `one of ${keys.join('|')} required` });
    });
}
