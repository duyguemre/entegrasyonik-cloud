// WP9 (faz4-int): platformdan bağımsız, SAF (DB/HTTP yok) özellik (attribute) yükü yardımcıları.
// Amaç: varyantın `platforms[code].attributes` kaydını (FE nesnesi `{attributeName, attributeValue, attributeValueId}`,
// eski ham ilkel değer ya da import'tan gelen biçim) tek yerde normalize etmek ve kategori kurallarına
// (zorunlu / listeden seçim) göre eksik-hatalı olanları ALAN BAZLI raporlamak. Platform sözleşmesine özgü alan adları
// (attributeId, customAttributeValue, ...) burada YOK; her dönüştürücü kendi biçimini üretir.

import { ICategoryAttribute } from '@interfaces/index';

/** Değer yerine geçmeyen ("boş") metinler: FE/eski veriden sızan 'undefined'/'null' dizeleri dahil. */
const EMPTY_TOKENS = new Set(['', 'undefined', 'null', 'nan']);

/** İlkel ise kırpılmış dize; boş/`undefined`/`null`/nesne ise `undefined`. */
export function cleanScalar(v: unknown): string | undefined {
    if (v === undefined || v === null || typeof v === 'object' || typeof v === 'function') return undefined;
    const s = String(v).trim();
    return EMPTY_TOKENS.has(s.toLowerCase()) ? undefined : s;
}

export interface INormalizedAttrValue {
    /** Platform değer kimliği (listeden seçim). */
    valueId?: string;
    /** Serbest/gösterim metni. */
    text?: string;
}

/**
 * Bir özelliğin kayıtlı değerini normalize eder. Girdi nesne (`attributeValueId|valueId|id`, `attributeValue|customAttributeValue|value`)
 * ya da ilkel olabilir (ilkel: hem kimlik hem metin adayıdır -> `valueId` = `text` = ilkel). Değer yoksa `null` (=özellik yok sayılır).
 */
export function normalizeAttrValue(data: any): INormalizedAttrValue | null {
    if (data === undefined || data === null) return null;
    if (typeof data !== 'object') {
        const s = cleanScalar(data);
        return s === undefined ? null : { valueId: s, text: s };
    }
    const valueId = cleanScalar(data.attributeValueId ?? data.valueId ?? data.id);
    const text = cleanScalar(data.attributeValue ?? data.customAttributeValue ?? data.value ?? data.title);
    if (valueId === undefined && text === undefined) return null;
    return { valueId, text };
}

const tr = (s: string) => s.toLocaleLowerCase('tr').trim();

/** Kategori özelliğinin (yeni okunan) değer listesinde kimliğe göre arama. */
export function findValueById(catAttr: ICategoryAttribute | undefined, id: string) {
    return catAttr?.values?.find(v => String(v.id) === String(id));
}

/** Kategori özelliğinin değer listesinde metne göre (Türkçe büyük/küçük harf duyarsız) arama. */
export function findValueByText(catAttr: ICategoryAttribute | undefined, text: string) {
    const t = tr(text);
    return catAttr?.values?.find(v => tr(String(v.title)) === t);
}

export interface IAttrLookup {
    /** Kategori özelliği kimliği (`_id`) -> özellik. */
    byId: Map<string, ICategoryAttribute>;
}

export function indexCategoryAttributes(catAttrs: ICategoryAttribute[] | undefined): IAttrLookup {
    const byId = new Map<string, ICategoryAttribute>();
    for (const c of catAttrs || []) {
        const id = String((c as any).platformAttributeId ?? c._id);
        byId.set(id, c);
    }
    return { byId };
}

/**
 * Zorunlu (`required`) olup gönderilecek kümede OLMAYAN kategori özelliklerini döndürür. `skip` ile (ör. onaylı içerik
 * güncellemesinde değiştirilemeyen slicer/varianter) hariç tutulur.
 */
export function missingRequiredAttributes(
    catAttrs: ICategoryAttribute[] | undefined,
    sentIds: Set<string>,
    skip?: (c: ICategoryAttribute) => boolean
): ICategoryAttribute[] {
    return (catAttrs || []).filter(c => c.required && !sentIds.has(String((c as any).platformAttributeId ?? c._id)) && !(skip && skip(c)));
}

/** Kullanıcıya gösterilecek alan bazlı, tek satırlık mesaj: "Renk (47), Beden (338)". */
export function labelAttribute(id: string, title?: string): string {
    return title ? `${title} (${id})` : id;
}

/**
 * [WP9] Platform ürünündeki (id, metin) değerini bir eşlemenin `values[]` kaydına çözer: ÖNCE değer kimliği (kesin),
 * bulunamazsa metin (Türkçe büyük/küçük harf duyarsız). `null`/eksik `platformValueId` "null" dizesiyle eşleşmez;
 * eksik `platformValueName` istisna fırlatmaz (eskiden `undefined.toLocaleUpperCase` TypeError'ıydı).
 */
export function matchMappingValue<T extends { platformValueId?: any; platformValueName?: any }>(
    values: T[] | undefined,
    platform: { valueId?: string; text?: string }
): T | undefined {
    if (!values || values.length === 0) return undefined;
    if (platform.valueId !== undefined) {
        const byId = values.find(v => v.platformValueId !== undefined && v.platformValueId !== null && String(v.platformValueId) === platform.valueId);
        if (byId) return byId;
    }
    const candidates = [platform.text, platform.valueId].filter((x): x is string => typeof x === 'string' && x !== '');
    for (const c of candidates) {
        const t = tr(c);
        const byName = values.find(v => v.platformValueName !== undefined && v.platformValueName !== null && tr(String(v.platformValueName)) === t);
        if (byName) return byName;
    }
    return undefined;
}
