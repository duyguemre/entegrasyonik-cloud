// ADR-0018 Karar 2a(iv) — "şekil parmak izi": sıralı anahtar yolları + tip adlarının SHA-256'sı. DEĞER ASLA ALINMAZ.
// Saf fonksiyon, I/O yok. "Bir doğrulamada en fazla 50 dizi elemanı gezilir" (Karar 2a "Örnekleme ve maliyet").
import crypto from 'crypto';

const MAX_ARRAY_ELEMENTS = 50;
const MAX_DEPTH = 12;

function typeNameOf(v: unknown): string {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
}

/**
 * `data`'nın sıralı `key.path:type` çiftlerini üretir (nesneler anahtar adına göre sıralanır, dizilerde
 * yalnızca ilk `MAX_ARRAY_ELEMENTS` eleman gezilir, tekrarlanan dizi yolları TEKİLLEŞTİRİLİR). Bu liste
 * doğrudan `docDiff`/log'a YAZILMAZ (yalnız hash'i saklanır) — çağıran isterse ayrıca kullanabilir.
 */
export function extractShapePaths(data: unknown, prefix = '', depth = 0, out: Set<string> = new Set()): Set<string> {
    if (depth > MAX_DEPTH) return out;
    if (data === undefined) return out;
    if (Array.isArray(data)) {
        out.add(`${prefix || '$'}:array`);
        for (let i = 0; i < Math.min(data.length, MAX_ARRAY_ELEMENTS); i++) {
            extractShapePaths(data[i], `${prefix}[]`, depth + 1, out);
        }
        return out;
    }
    if (data !== null && typeof data === 'object') {
        out.add(`${prefix || '$'}:object`);
        const keys = Object.keys(data as Record<string, unknown>).sort();
        for (const k of keys) {
            extractShapePaths((data as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k, depth + 1, out);
        }
        return out;
    }
    out.add(`${prefix || '$'}:${typeNameOf(data)}`);
    return out;
}

/** SHA-256 şekil parmak izi (yalnız anahtar yolu + tip adı; DEĞER hiçbir zaman hash girdisine girmez). */
export function computeShapeFingerprint(data: unknown): string {
    const paths = [...extractShapePaths(data)].sort();
    return crypto.createHash('sha256').update(paths.join('\n')).digest('hex');
}
