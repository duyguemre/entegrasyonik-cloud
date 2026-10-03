/**
 * [eslesme-fiyat WP2, PLAN §3.1] Platform katalog yenileme + eşleme bayatlık taraması (`catalog.platformRefresh`, haftalık).
 *
 * 1) Yenileme (kanal başına): kategori ağacı kimlikleri + YALNIZ tenant'ların EŞLEDİĞİ platform kategorilerinin özellik listeleri ve
 *    eşlenmiş özelliklerin değer listeleri (tüm kataloğu taramaz; çağrı bütçesi `maxCalls`). Sonuç `PlatformCatalog`'a (App) yazılır.
 * 2) Bayatlık (tenant başına): eşlenmiş `platformCategoryId` ağaçta, `platformAttributeId` özellik listesinde, `platformValueId`'ler değer
 *    listesinde yoksa kayıt `stale: {reason, detectedAt, missingValueIds?}` işaretlenir; geri gelenlerde `stale` temizlenir. Eşleme SİLİNMEZ.
 *    Liste ÇEKİLEMEDİYSE (hata/bütçe) o kayıt hakkında karar verilmez (yanlış pozitif yok).
 *
 * Bağımlılıklar enjekte edilir (DB/ağ bilmez → bellek-içi test). Hata yutulmaz ama izole edilir: bir kanal/tenant hatası diğerlerini durdurmaz,
 * sonuçta sayılır (ADR-0006: sessiz başarı yok).
 */

export interface CatalogAdapter {
    retrieveCategories(): Promise<any[]>;
    retrieveCategoryAttributes(platformCategoryId: string): Promise<any[]>;
    retrieveCategoryAttributeValues?(platformCategoryId: string, platformAttributeId: string): Promise<any[]>;
}

export interface CatalogEntry {
    integrationCode: string;
    kind: 'category' | 'attribute' | 'value';
    platformCategoryId: string;
    platformAttributeId: string;
    ids: string[];
    payload?: unknown;
    fetchedAt: Date;
}

export interface MappingRow {
    _id: unknown;
    integrationCode: string;
    isCategoryMapping?: boolean;
    platformCategoryId?: string;
    platformAttributeId?: string | null;
    values?: Array<{ platformValueId?: string | null }>;
    stale?: { reason: string } | null;
}

export type StaleReason = 'CATEGORY_GONE' | 'ATTRIBUTE_GONE' | 'VALUES_GONE';

export interface PlatformCatalogDeps {
    now(): Date;
    /** Katalogu okunacak kanallar ve her kanal için okuma yapabilecek bir adaptör (genelde kanalı kurulu ilk tenant'ın). */
    listChannels(): Promise<Array<{ integrationCode: string; adapter: () => Promise<CatalogAdapter> }>>;
    /** Tenant'lar (bayatlık taraması için). */
    listTenants(): Promise<number[]>;
    /** Tenant'ın bu kanaldaki eşleme kayıtları. */
    listMappings(tid: number, integrationCode: string): Promise<MappingRow[]>;
    /** `stale` alanını yazar (null = temizle). */
    setStale(tid: number, updates: Array<{ id: unknown; stale: Record<string, unknown> | null }>): Promise<void>;
    saveCatalog(entries: CatalogEntry[]): Promise<void>;
    /** Kanal başına en çok dış çağrı (varsayılan 300). */
    maxCallsPerChannel?: number;
    signal?: AbortSignal;
}

const idsOf = (list: any[], key: (x: any) => unknown = (x) => x?._id ?? x?.id): string[] =>
    (Array.isArray(list) ? list : []).map(key).filter((v) => v !== undefined && v !== null && v !== '').map(String);

function flattenIds(nodes: any[], out: string[] = []): string[] {
    for (const n of Array.isArray(nodes) ? nodes : []) {
        const id = n?._id ?? n?.id;
        if (id !== undefined && id !== null && id !== '') out.push(String(id));
        if (Array.isArray(n?.children) && n.children.length) flattenIds(n.children, out);
    }
    return out;
}

const key = (cat: string, attr = '') => `${cat}|${attr}`;

/** Bir kanalın kataloğunu tazeler; dönen haritalar bayatlık taramasında kullanılır (yalnız BAŞARIYLA çekilen listeler). */
export async function refreshChannel(integrationCode: string, adapter: CatalogAdapter, targets: { categories: Set<string>; attributes: Set<string> }, opts: { now: Date; maxCalls: number; signal?: AbortSignal }) {
    let calls = 0;
    const budget = () => calls < opts.maxCalls && !opts.signal?.aborted;
    const entries: CatalogEntry[] = [];
    const known = { categories: null as Set<string> | null, attributes: new Map<string, Set<string>>(), values: new Map<string, Set<string>>() };
    const errors: string[] = [];

    calls++;
    try {
        const tree = await adapter.retrieveCategories();
        const ids = flattenIds(tree);
        if (ids.length) {
            known.categories = new Set(ids);
            entries.push({ integrationCode, kind: 'category', platformCategoryId: '', platformAttributeId: '', ids, fetchedAt: opts.now });
        }
    } catch (e: any) { errors.push(`categories: ${e?.message ?? e}`); }

    for (const cat of targets.categories) {
        if (!budget()) break;
        calls++;
        try {
            const attrs = await adapter.retrieveCategoryAttributes(cat);
            const ids = idsOf(attrs);
            known.attributes.set(cat, new Set(ids));
            entries.push({ integrationCode, kind: 'attribute', platformCategoryId: cat, platformAttributeId: '', ids, payload: attrs, fetchedAt: opts.now });
            // Gömülü değerler varsa ayrı uca gitmeden kaydet.
            for (const a of Array.isArray(attrs) ? attrs : []) {
                const aid = String(a?._id ?? a?.id ?? '');
                if (aid && targets.attributes.has(key(cat, aid)) && Array.isArray(a?.values) && a.values.length) {
                    const vids = idsOf(a.values, (v) => v?.id ?? v?._id);
                    known.values.set(key(cat, aid), new Set(vids));
                    entries.push({ integrationCode, kind: 'value', platformCategoryId: cat, platformAttributeId: aid, ids: vids, fetchedAt: opts.now });
                }
            }
        } catch (e: any) { errors.push(`attributes ${cat}: ${e?.message ?? e}`); }
    }

    if (typeof adapter.retrieveCategoryAttributeValues === 'function') {
        for (const k of targets.attributes) {
            if (known.values.has(k)) continue;
            if (!budget()) break;
            const [cat, aid] = k.split('|');
            if (!known.attributes.get(cat)?.has(aid)) continue; // özellik yoksa değerine gitme (ATTRIBUTE_GONE zaten)
            calls++;
            try {
                const vals = await adapter.retrieveCategoryAttributeValues(cat, aid);
                const vids = idsOf(vals, (v) => v?.id ?? v?._id);
                known.values.set(k, new Set(vids));
                entries.push({ integrationCode, kind: 'value', platformCategoryId: cat, platformAttributeId: aid, ids: vids, fetchedAt: opts.now });
            } catch (e: any) { errors.push(`values ${k}: ${e?.message ?? e}`); }
        }
    }
    return { entries, known, calls, errors };
}

type Known = Awaited<ReturnType<typeof refreshChannel>>['known'];

/** Saf karar: kayıt için yeni `stale` değeri; `undefined` = karar yok (liste çekilemedi), `null` = güncel. */
export function staleFor(row: MappingRow, known: Known, now: Date): Record<string, unknown> | null | undefined {
    const cat = String(row.platformCategoryId ?? '');
    if (!cat) return undefined;
    if (known.categories && !known.categories.has(cat)) return { reason: 'CATEGORY_GONE', detectedAt: now };
    if (row.isCategoryMapping || row.platformAttributeId === null || row.platformAttributeId === undefined) return known.categories ? null : undefined;
    const attrs = known.attributes.get(cat);
    if (!attrs) return undefined;
    const aid = String(row.platformAttributeId);
    if (!attrs.has(aid)) return { reason: 'ATTRIBUTE_GONE', detectedAt: now };
    const valueIds = (row.values || []).map((v) => v?.platformValueId).filter((v) => v !== undefined && v !== null && v !== '').map(String);
    if (!valueIds.length) return null;
    const vals = known.values.get(key(cat, aid));
    if (!vals) return undefined;
    const missing = valueIds.filter((v) => !vals.has(v));
    return missing.length ? { reason: 'VALUES_GONE', detectedAt: now, missingValueIds: missing.slice(0, 50) } : null;
}

export async function runPlatformCatalogCycle(deps: PlatformCatalogDeps) {
    const now = deps.now();
    const maxCalls = deps.maxCallsPerChannel ?? 300;
    const tenants = await deps.listTenants();
    const channels = await deps.listChannels();
    const result = { channels: 0, calls: 0, entries: 0, tenantsScanned: 0, marked: 0, cleared: 0, failed: 0, errors: [] as string[] };

    for (const ch of channels) {
        if (deps.signal?.aborted) break;
        // Hedefler: tenant'ların eşlediği platform kategori/özellikleri (kanal başına birleşim).
        const rowsByTenant = new Map<number, MappingRow[]>();
        const targets = { categories: new Set<string>(), attributes: new Set<string>() };
        for (const tid of tenants) {
            try {
                const rows = await deps.listMappings(tid, ch.integrationCode);
                if (!rows.length) continue;
                rowsByTenant.set(tid, rows);
                for (const r of rows) {
                    if (!r.platformCategoryId) continue;
                    targets.categories.add(String(r.platformCategoryId));
                    if (!r.isCategoryMapping && r.platformAttributeId) targets.attributes.add(key(String(r.platformCategoryId), String(r.platformAttributeId)));
                }
            } catch (e: any) { result.failed++; result.errors.push(`${ch.integrationCode}/t${tid}: ${e?.message ?? e}`); }
        }
        if (!rowsByTenant.size) continue;

        let refreshed: Awaited<ReturnType<typeof refreshChannel>>;
        try {
            refreshed = await refreshChannel(ch.integrationCode, await ch.adapter(), targets, { now, maxCalls, signal: deps.signal });
            if (refreshed.entries.length) await deps.saveCatalog(refreshed.entries);
        } catch (e: any) { result.failed++; result.errors.push(`${ch.integrationCode}: ${e?.message ?? e}`); continue; }
        result.channels++; result.calls += refreshed.calls; result.entries += refreshed.entries.length;
        result.errors.push(...refreshed.errors.slice(0, 5).map((m) => `${ch.integrationCode}: ${m}`));

        for (const [tid, rows] of rowsByTenant) {
            const updates: Array<{ id: unknown; stale: Record<string, unknown> | null }> = [];
            for (const r of rows) {
                const next = staleFor(r, refreshed.known, now);
                if (next === undefined) continue;
                const wasStale = !!r.stale;
                if (next && (!wasStale || r.stale?.reason !== next.reason)) { updates.push({ id: r._id, stale: next }); result.marked++; }
                else if (next && wasStale && next.reason === 'VALUES_GONE') { updates.push({ id: r._id, stale: next }); }
                else if (!next && wasStale) { updates.push({ id: r._id, stale: null }); result.cleared++; }
            }
            try {
                if (updates.length) await deps.setStale(tid, updates);
                result.tenantsScanned++;
            } catch (e: any) { result.failed++; result.errors.push(`${ch.integrationCode}/t${tid} setStale: ${e?.message ?? e}`); }
        }
    }
    result.errors = result.errors.slice(0, 20);
    return result;
}
