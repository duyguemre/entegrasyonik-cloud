import { eventLog } from '@platform/core/logger';

const log = eventLog('engine', 'reportUnknownEnum');
// ADR-0018 §2a(iii) için MİNİMAL API (Aşama A'nın bulgu modeli/FindingService'i henüz YOK; onu BAŞLATMAZ).
// Durum eşleyicileri `default` dalında bilinmeyen bir enum değeriyle karşılaşınca sessizce yutmak yerine bunu çağırır.
// Eşleme davranışı DEĞİŞMEZ (çağıran yine kendi güvenli varsayılanını döner); bu fonksiyon ASLA fırlatmaz.
//
// Gizlilik (ADR-0018): yalnızca kısa, PII olmayan durum kodu kaydedilir — ≤64 karakter ve yalnız [A-Za-z0-9_-];
// aksi halde değer '<redacted>' olur (müşteri adı vb. bir gövde değeri asla saklanmaz/loglanmaz).
//
// Sink deseni (`setSink`): ADR-0018 Aşama A `FindingService.record`'u bu sink'e bağlayacaktır; o zamana dek varsayılan
// sink süreç-içi sayaç tutar ve aynı (contractId, field, value) için YALNIZCA ilk seferde uyarı loglar.

export interface UnknownEnumEvent {
    contractId: string;
    field: string;
    /** Redakte edilmiş değer ('<redacted>' olabilir). */
    value: string;
}

export type UnknownEnumSink = (event: UnknownEnumEvent) => void;

const SAFE_VALUE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TRACKED = 500;
const counts = new Map<string, number>();
let customSink: UnknownEnumSink | null = null;

export function redactEnumValue(value: unknown): string {
    const s = typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
    return SAFE_VALUE.test(s) ? s : '<redacted>';
}

/** ADR-0018 Aşama A bulgu servisi bağlanana dek: test/enjeksiyon için. `null` varsayılana döner. */
export function setUnknownEnumSink(sink: UnknownEnumSink | null): void {
    customSink = sink;
}

export function reportUnknownEnum(contractId: string, field: string, value: unknown): void {
    try {
        const event: UnknownEnumEvent = { contractId, field, value: redactEnumValue(value) };
        if (customSink) { customSink(event); return; }
        const key = `${contractId}|${field}|${event.value}`;
        const seen = counts.get(key) ?? 0;
        if (seen === 0 && counts.size >= MAX_TRACKED) counts.clear(); // sınırsız büyümeyi engelle
        counts.set(key, seen + 1);
        if (seen === 0) {
            log.warn('REPORTUNKNOWNENUM_BILINMEYEN_ENUM_DEGERI_CONTRACT', `bilinmeyen enum değeri: contract=${contractId} field=${field} value=${event.value} ` +
                '(eşleme varsayılana düştü; yeni bir pazaryeri durumu olabilir — adaptör eşlemesi gözden geçirilmeli)');
        }
    } catch {
        /* bekçi hiçbir koşulda iş akışını bozmaz */
    }
}

/** Testler için. */
export function getUnknownEnumCount(contractId: string, field: string, value: unknown): number {
    return counts.get(`${contractId}|${field}|${redactEnumValue(value)}`) ?? 0;
}

export function resetUnknownEnumState(): void {
    counts.clear();
    customSink = null;
}
