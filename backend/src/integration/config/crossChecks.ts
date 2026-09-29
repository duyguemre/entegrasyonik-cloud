// ADR-0020 Karar 2.2 "Çapraz doğrulama" (Aşama B). Saf fonksiyonlar; I/O yapmaz. Her kural bir `getValue(key)`
// okuyucusu alır (çağıran, taslağın PROSPEKTİF etkin değerlerini — draft.overrides ile ezilmiş görünümü — verir)
// ve ihlal varsa insan-okunur bir TR ileti döner, yoksa `null`.
//
// NOT (ADR ile bu uygulama arasındaki KASITLI fark, raporda belirtilir): ADR örneği `cursorOverlapMs < intervalMs × 4`
// yazar; katalogdaki BUGÜNKÜ varsayılanlar (`order.claimSync.cursorOverlapMs=3600000`, `.intervalMs=900000`) tam eşitlik
// üretir (3600000 = 900000×4) ve katı "<" ile bugünün kendi varsayılanını ihlal sayardı. Bu yüzden "<=" kullanılır.

export type GetValue = (key: string) => unknown;

export interface CrossCheckRule {
    id: string;
    description: { tr: string; en: string };
    /** İhlal varsa TR ileti, yoksa `null`. */
    check: (getValue: GetValue) => string | null;
}

function num(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export const CROSS_CHECK_RULES: readonly CrossCheckRule[] = [
    {
        id: 'order.claimSync.overlapWithinInterval',
        description: {
            tr: 'İmleç örtüşmesi, senkron aralığının 4 katını aşmamalı (aksi halde her turda gereksiz tekrar taraması olur).',
            en: 'Cursor overlap must not exceed 4x the sync interval (otherwise every round re-scans unnecessarily).',
        },
        check: (getValue) => {
            const overlap = num(getValue('order.claimSync.cursorOverlapMs'));
            const interval = num(getValue('order.claimSync.intervalMs'));
            if (overlap === undefined || interval === undefined) return null;
            if (overlap > interval * 4) return `order.claimSync.cursorOverlapMs (${overlap}) > order.claimSync.intervalMs×4 (${interval * 4})`;
            return null;
        },
    },
    {
        id: 'export.publisher.chunkSizeWithinTrendyolLimit',
        description: {
            tr: 'Trendyol tek istekte en fazla 1000 ürün kabul eder; yayıncı parça boyutu bunu aşmamalı.',
            en: 'Trendyol accepts at most 1000 products per request; publisher chunk size must not exceed this.',
        },
        check: (getValue) => {
            const chunk = num(getValue('export.publisher.chunkSize'));
            if (chunk === undefined) return null;
            const TRENDYOL_MAX_ITEMS_PER_REQUEST = 1000;
            if (chunk > TRENDYOL_MAX_ITEMS_PER_REQUEST) return `export.publisher.chunkSize (${chunk}) > Trendyol sınırı (${TRENDYOL_MAX_ITEMS_PER_REQUEST})`;
            return null;
        },
    },
];

/** Tüm kuralları çalıştırır; ihlal listesini döner (boşsa geçti). */
export function runCrossChecks(getValue: GetValue, rules: readonly CrossCheckRule[] = CROSS_CHECK_RULES): string[] {
    const out: string[] = [];
    for (const rule of rules) {
        const msg = rule.check(getValue);
        if (msg) out.push(msg);
    }
    return out;
}
