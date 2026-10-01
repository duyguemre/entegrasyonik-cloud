// ADR-0034 Karar (E) / BR-2: arac sonucu -> protokol parcasi, SUNUCUDA ve deterministik (model GenUI uretmez).
// Sayilar (`total`, satirlar, KPI degerleri) yalniz arac sonucundan gelir; modelin yazdigi metinle tablo arasinda celiski olursa tablo dogrudur.
import type { CellValue, KpiPart, Locale, Part, TablePart, TableRow, EntityLinkPart } from '../protocol/v1';
import { PRESENT_SPECS, type ColumnSpec, type TableSpec } from './specs';

/** Tablo parcasi en cok 50 satir (protokol); "daha fazla" ile toplam gosterim 500 satirdir. */
export const MAX_PART_ROWS = 50;
export const MAX_TOTAL_ROWS = 500;

export interface Presented {
    part: Part | null;
    /** Bu parcada gosterilen satir sayisi (tablo/entity-tablo). */
    rows: number;
    total: number | null;
    /** Sunucudan gelen sonraki sayfa imleci (yoksa null). Token uretimi cagiranda (broker). */
    nextCursor: string | null;
    /** Modele giden KOMPAKT ozet (sayilar sunucudan). */
    modelView: unknown;
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function cellOf(v: unknown): CellValue {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'string') return cut(v, 500);
    return cut(JSON.stringify(v), 500);
}

/** Cikti semasi kayitli degilse: ilk dizi alanindan genel kolonlar (yalniz skaler degerler). */
function inferTable(data: any): TableSpec | null {
    if (!data || typeof data !== 'object') return null;
    const itemsKey = Object.keys(data).find((k) => Array.isArray(data[k]) && data[k].length > 0 && typeof data[k][0] === 'object');
    if (!itemsKey) return null;
    const first = data[itemsKey][0] as Record<string, unknown>;
    const cols: ColumnSpec[] = Object.entries(first)
        .filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))
        .slice(0, 12)
        .map(([key, v]): ColumnSpec => ({
            key, label: { tr: key, en: key }, type: typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'text', untrusted: typeof v === 'string' || v === null,
        }));
    if (cols.length === 0) return null;
    return { kind: 'table', title: { tr: 'Sonuç', en: 'Result' }, itemsKey, rowKey: cols[0].key, columns: cols };
}

export function tableRows(spec: TableSpec, data: any): TableRow[] {
    const items: any[] = Array.isArray(data?.[spec.itemsKey]) ? data[spec.itemsKey] : [];
    return items.slice(0, MAX_PART_ROWS).map((it) => {
        const extra = spec.cells ? spec.cells(it) : {};
        const row: TableRow = {};
        for (const c of spec.columns) row[c.key] = c.key in extra ? (extra[c.key] as CellValue) : cellOf(it?.[c.key]);
        return row;
    });
}

function buildTable(capId: string, spec: TableSpec, data: any, input: any, loc: Locale, partId: string, moreToken: string | null): { part: TablePart; rows: number } {
    const items: any[] = Array.isArray(data?.[spec.itemsKey]) ? data[spec.itemsKey] : [];
    const currency = typeof items[0]?.currency === 'string' && items[0].currency.length === 3 ? items[0].currency : undefined;
    const rows = tableRows(spec, data);
    const total = typeof data?.total === 'number' ? data.total : null;
    const openIn = spec.openIn?.(input);
    const part: TablePart = {
        id: partId, type: 'table', title: spec.title[loc], capabilityId: capId,
        columns: spec.columns.map((c) => ({
            key: c.key, label: c.label[loc], type: c.type,
            ...(c.type === 'money' && currency ? { currency } : {}), ...(c.statusDomain ? { statusDomain: c.statusDomain } : {}),
            ...(c.untrusted ? { untrusted: true } : {}), ...(c.align ? { align: c.align } : {}),
        })),
        rowKey: spec.rowKey, rows, total, more: moreToken ? { token: moreToken } : null, ...(openIn ? { openIn } : {}),
    };
    return { part, rows: rows.length };
}

/** Modele giden satirlar: varlik hucreleri `{id,label}` (model, onay gibi sonraki araclar icin KIMLIGI buradan alir; kimlikler sunucudandir). */
function modelRows(spec: TableSpec, data: any, n = 10): unknown[] {
    return tableRows(spec, data).slice(0, n).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === 'object' ? { id: (v as { id: string }).id, label: (v as { label: string }).label } : v])));
}

/**
 * `data` = `invokeCapability` ciktisi (strip edilmis). `moreToken` = sonraki sayfa belirteci (broker uretir; yoksa null).
 * Sunum kaydi yoksa (ya da cikti tablo/KPI degilse) `part: null` -> yalniz modele ozet gider.
 */
export function presentResult(capId: string, data: any, input: any, loc: Locale, partId: string, moreToken: string | null = null): Presented {
    const spec = PRESENT_SPECS[capId] ?? inferTable(data) ?? undefined;
    const nextCursor = typeof data?.nextCursor === 'string' ? data.nextCursor : null;
    if (!spec) return { part: null, rows: 0, total: null, nextCursor, modelView: { result: data } };

    if (spec.kind === 'kpi') {
        const items = spec.items(data, loc);
        const part: KpiPart = { id: partId, type: 'kpi', title: spec.title[loc], items, ...(spec.openIn ? { openIn: spec.openIn } : {}) };
        return { part, rows: 0, total: null, nextCursor: null, modelView: { kpi: items.map((k) => ({ key: k.key, label: k.label, value: k.value, ...(k.delta ? { changePct: k.delta.value } : {}) })) } };
    }

    const table = spec.kind === 'entity' ? spec.table : spec;
    const items: any[] = Array.isArray(data?.[table.itemsKey]) ? data[table.itemsKey] : [];
    const total = typeof data?.total === 'number' ? data.total : null;
    // Skaler ust duzey alanlar (ornegin `enabled`, `threshold`) modele de gider; sayilar yine sunucudandir.
    const extras = Object.fromEntries(Object.entries(data ?? {}).filter(([k, v]) => k !== table.itemsKey && k !== 'nextCursor' && (v === null || ['string', 'number', 'boolean'].includes(typeof v))));
    const view = { ...extras, total: total ?? items.length, shown: Math.min(items.length, MAX_PART_ROWS), rows: modelRows(table, data) };

    if (spec.kind === 'entity' && items.length === 1) {
        const it = items[0];
        const part: EntityLinkPart = {
            id: partId, type: 'entity-link',
            entity: { type: spec.entityType, id: String(it[spec.idKey]).slice(0, 128), label: cut(String(it[spec.labelKey] ?? ''), 200) },
            link: spec.link(it), fields: spec.fields(it, loc).slice(0, 8),
        };
        return { part, rows: 0, total, nextCursor: null, modelView: view };
    }
    if (items.length === 0) return { part: null, rows: 0, total: total ?? 0, nextCursor: null, modelView: view };
    const built = buildTable(capId, table, data, input, loc, partId, moreToken);
    return { part: built.part, rows: built.rows, total, nextCursor, modelView: view };
}

/** "Daha fazla" yaniti icin yalniz satirlar (+ toplam). */
export function presentRows(capId: string, data: any): { rows: TableRow[]; total: number | null; nextCursor: string | null } | null {
    const spec = PRESENT_SPECS[capId] ?? inferTable(data) ?? undefined;
    if (!spec || spec.kind === 'kpi') return null;
    const table = spec.kind === 'entity' ? spec.table : spec;
    return {
        rows: tableRows(table, data),
        total: typeof data?.total === 'number' ? data.total : null,
        nextCursor: typeof data?.nextCursor === 'string' ? data.nextCursor : null,
    };
}
