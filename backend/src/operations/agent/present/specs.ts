// ADR-0034 Karar (E) / AGENT_BROKER_PLAN BR-2: yetenek basina SUNUM esleme (yalniz `mcp.exposed` yetenekler). Tablo/KPI/onay karti
// sayilari ve etiketleri MODELDEN degil arac sonucundan ve bu esleme tablosundan uretilir (halusinasyon yuzeyi sifir).
// Esleme yoksa `present.ts` cikti semasindan genel kolonlar cikarir.
import type { AppLink, ColumnType, EntityRef, EntityType, KpiItem, Locale, TableRow } from '../protocol/v1';

type L = { tr: string; en: string };

export interface ColumnSpec {
    key: string;
    label: L;
    type: ColumnType;
    statusDomain?: string;
    untrusted?: boolean;
    align?: 'start' | 'end';
}

export interface TableSpec {
    kind: 'table';
    title: L;
    /** Cikti nesnesinde satir dizisinin alani. */
    itemsKey: string;
    columns: ColumnSpec[];
    rowKey: string;
    /** Kolon disi degerleri (EntityRef hucreleri) uretmek icin: donen nesne, ayni anahtarli duz hucrenin yerine gecer. */
    cells?: (item: any) => Record<string, TableRow[string]>;
    openIn?: (input: any) => AppLink | undefined;
}

export interface EntitySpec {
    kind: 'entity';
    /** Tek sonuc varsa entity-link, birden fazlaysa bu tablo. */
    table: TableSpec;
    entityType: EntityType;
    idKey: string;
    labelKey: string;
    link: (item: any) => AppLink;
    fields: (item: any, loc: Locale) => Array<{ label: string; value: string; type?: 'text' | 'money' | 'date' | 'status' }>;
}

export interface KpiSpec {
    kind: 'kpi';
    title: L;
    items: (data: any, loc: Locale) => KpiItem[];
    openIn?: AppLink;
}

export type PresentSpec = TableSpec | EntitySpec | KpiSpec;

const ref = (type: EntityType, id: unknown, label: unknown): EntityRef => ({ type, id: String(id).slice(0, 128), label: String(label ?? '').slice(0, 200) });

const direction = (v: number): 'up' | 'down' | 'flat' => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');

const ORDERS_TABLE: TableSpec = {
    kind: 'table', title: { tr: 'Siparişler', en: 'Orders' }, itemsKey: 'items', rowKey: 'orderNumber',
    columns: [
        { key: 'orderNumber', label: { tr: 'Sipariş no', en: 'Order no' }, type: 'entity' },
        { key: 'channel', label: { tr: 'Kanal', en: 'Channel' }, type: 'channel' },
        { key: 'customer', label: { tr: 'Müşteri', en: 'Customer' }, type: 'text', untrusted: true },
        { key: 'total', label: { tr: 'Tutar', en: 'Total' }, type: 'money' },
        { key: 'status', label: { tr: 'Durum', en: 'Status' }, type: 'status', statusDomain: 'order' },
        { key: 'orderDate', label: { tr: 'Tarih', en: 'Date' }, type: 'datetime' },
        { key: 'itemCount', label: { tr: 'Adet', en: 'Items' }, type: 'number' },
        { key: 'tracking', label: { tr: 'Kargo', en: 'Shipping' }, type: 'text', untrusted: true },
    ],
    cells: (o) => ({ orderNumber: ref('order', o.id, o.orderNumber) }),
    openIn: (i) => ({ screen: 'OrderListView', ...(i?.status ? { params: { internalStatuses: String(i.status) } } : {}) }),
};

const PRODUCTS_TABLE: TableSpec = {
    kind: 'table', title: { tr: 'Ürünler', en: 'Products' }, itemsKey: 'items', rowKey: 'title',
    columns: [
        { key: 'title', label: { tr: 'Ürün', en: 'Product' }, type: 'entity', untrusted: true },
        { key: 'sku', label: { tr: 'Stok kodu', en: 'SKU' }, type: 'text', untrusted: true },
        { key: 'barcode', label: { tr: 'Barkod', en: 'Barcode' }, type: 'text', untrusted: true },
        { key: 'stock', label: { tr: 'Stok', en: 'Stock' }, type: 'number' },
        { key: 'minPrice', label: { tr: 'En düşük fiyat', en: 'Min price' }, type: 'money' },
        { key: 'maxPrice', label: { tr: 'En yüksek fiyat', en: 'Max price' }, type: 'money' },
    ],
    cells: (p) => ({ title: ref('product', p.id, p.title) }),
    openIn: () => ({ screen: 'productDefinitions/ProductListView' }),
};

export const PRESENT_SPECS: Readonly<Record<string, PresentSpec>> = {
    'orders.list': ORDERS_TABLE,
    'products.search': {
        kind: 'entity', table: PRODUCTS_TABLE, entityType: 'product', idKey: 'id', labelKey: 'title',
        link: () => ({ screen: 'productDefinitions/ProductListView' }),
        fields: (p, loc) => [
            { label: loc === 'tr' ? 'Stok kodu' : 'SKU', value: String(p.sku ?? '-') },
            { label: loc === 'tr' ? 'Stok' : 'Stock', value: String(p.stock) },
            ...(typeof p.minPrice === 'number' ? [{ label: loc === 'tr' ? 'Fiyat' : 'Price', value: String(p.maxPrice !== null && p.maxPrice !== p.minPrice ? `${p.minPrice} - ${p.maxPrice}` : p.minPrice), type: 'text' as const }] : []),
        ],
    },
    'stock.low_list': {
        kind: 'table', title: { tr: 'Düşük stoklu ürünler', en: 'Low-stock products' }, itemsKey: 'items', rowKey: 'sku',
        columns: [
            { key: 'sku', label: { tr: 'Stok kodu', en: 'SKU' }, type: 'entity', untrusted: true },
            { key: 'barcode', label: { tr: 'Barkod', en: 'Barcode' }, type: 'text', untrusted: true },
            { key: 'stock', label: { tr: 'Stok', en: 'Stock' }, type: 'number' },
            { key: 'reserved', label: { tr: 'Rezerve', en: 'Reserved' }, type: 'number' },
            { key: 'available', label: { tr: 'Kullanılabilir', en: 'Available' }, type: 'number' },
        ],
        cells: (v) => ({ sku: ref('variant', v.variantId, v.sku ?? v.barcode ?? v.variantId) }),
        openIn: () => ({ screen: 'productDefinitions/ProductListView' }),
    },
    // ---- PRC-R0/R1: maliyet ve buybox (yalniz Trendyol) ----
    'pricing.cost.list': {
        kind: 'table', title: { tr: 'Ürün maliyetleri', en: 'Product costs' }, itemsKey: 'items', rowKey: 'variantId',
        columns: [
            { key: 'sku', label: { tr: 'Stok kodu', en: 'SKU' }, type: 'entity', untrusted: true },
            { key: 'barcode', label: { tr: 'Barkod', en: 'Barcode' }, type: 'text', untrusted: true },
            { key: 'costPrice', label: { tr: 'Maliyet (KDV hariç)', en: 'Cost (excl. VAT)' }, type: 'money' },
            { key: 'costUpdatedAt', label: { tr: 'Güncellendi', en: 'Updated' }, type: 'datetime' },
            { key: 'stale', label: { tr: 'Eski', en: 'Stale' }, type: 'boolean' },
        ],
        cells: (v) => ({ sku: ref('variant', v.variantId, v.sku ?? v.barcode ?? v.variantId) }),
        openIn: () => ({ screen: 'productDefinitions/ProductListView' }),
    },
    'pricing.buybox.list': {
        kind: 'table', title: { tr: 'Trendyol buybox durumu', en: 'Trendyol buybox status' }, itemsKey: 'items', rowKey: 'variantId',
        columns: [
            { key: 'sku', label: { tr: 'Stok kodu', en: 'SKU' }, type: 'entity', untrusted: true },
            { key: 'barcode', label: { tr: 'Barkod', en: 'Barcode' }, type: 'text', untrusted: true },
            { key: 'status', label: { tr: 'Buybox', en: 'Buybox' }, type: 'status', statusDomain: 'buybox' },
            { key: 'buyboxOrder', label: { tr: 'Sıra', en: 'Rank' }, type: 'number' },
            { key: 'ownPrice', label: { tr: 'Fiyatım', en: 'My price' }, type: 'money' },
            { key: 'buyboxPrice', label: { tr: 'Buybox fiyatı', en: 'Buybox price' }, type: 'money' },
            { key: 'gapPercent', label: { tr: 'Fark (%)', en: 'Gap (%)' }, type: 'percent' },
            { key: 'checkedAt', label: { tr: 'Son güncelleme', en: 'Last update' }, type: 'datetime' },
        ],
        cells: (v) => ({ sku: ref('variant', v.variantId, v.sku ?? v.barcode ?? v.variantId) }),
        openIn: (i) => ({ screen: 'productDefinitions/ProductListView', ...(i?.status ? { params: { buybox: String(i.status) } } : {}) }),
    },
    // PRC-R2: kural listesi ve öneriler. Fiyatı KOD hesaplar (K15); tablo sunucu verisidir, model rakamları değiştiremez.
    'pricing.rules.list': {
        kind: 'table', title: { tr: 'Rekabet fiyat kuralları', en: 'Competition pricing rules' }, itemsKey: 'rules', rowKey: 'id',
        columns: [
            { key: 'name', label: { tr: 'Kural', en: 'Rule' }, type: 'text', untrusted: true },
            { key: 'enabled', label: { tr: 'Açık', en: 'On' }, type: 'boolean' },
            { key: 'mode', label: { tr: 'Yön', en: 'Mode' }, type: 'text' },
            { key: 'pausedReason', label: { tr: 'Duraklatma nedeni', en: 'Pause reason' }, type: 'text' },
            { key: 'open', label: { tr: 'Açık öneri', en: 'Open suggestions' }, type: 'number' },
            { key: 'version', label: { tr: 'Sürüm', en: 'Version' }, type: 'number' },
        ],
        cells: (r) => ({ mode: r.competition.mode === 'below' ? 'below / altında' : 'above / üstünde', open: r.suggestions.open }),
        openIn: () => ({ screen: 'pricing/PricingRulesView' }),
    },
    'pricing.suggestions.list': {
        kind: 'table', title: { tr: 'Fiyat önerileri (Trendyol)', en: 'Price suggestions (Trendyol)' }, itemsKey: 'items', rowKey: 'id',
        columns: [
            { key: 'sku', label: { tr: 'Stok kodu', en: 'SKU' }, type: 'entity', untrusted: true },
            { key: 'barcode', label: { tr: 'Barkod', en: 'Barcode' }, type: 'text', untrusted: true },
            { key: 'beforePrice', label: { tr: 'Şimdiki fiyat', en: 'Current price' }, type: 'money' },
            { key: 'afterPrice', label: { tr: 'Önerilen fiyat', en: 'Suggested price' }, type: 'money' },
            { key: 'buyboxPrice', label: { tr: 'Buybox fiyatı', en: 'Buybox price' }, type: 'money' },
            { key: 'profitAfter', label: { tr: 'Tahmini kâr', en: 'Est. profit' }, type: 'money' },
            { key: 'floor', label: { tr: 'Taban', en: 'Floor' }, type: 'money' },
            { key: 'status', label: { tr: 'Durum', en: 'Status' }, type: 'text' },
        ],
        cells: (v) => ({ sku: ref('variant', v.variantId, v.sku ?? v.barcode ?? v.variantId), status: v.blockedReason ? `${v.status}: ${v.blockedReason}` : v.status }),
        openIn: () => ({ screen: 'pricing/PricingRulesView' }),
    },
    'pricing.margin.preview': {
        kind: 'table', title: { tr: 'Kâr önizlemesi (Trendyol)', en: 'Profit preview (Trendyol)' }, itemsKey: 'items', rowKey: 'variantId',
        columns: [
            { key: 'sku', label: { tr: 'Stok kodu', en: 'SKU' }, type: 'entity', untrusted: true },
            { key: 'ownPrice', label: { tr: 'Fiyat', en: 'Price' }, type: 'money' },
            { key: 'profitNow', label: { tr: 'Kâr (bu fiyatta)', en: 'Profit (this price)' }, type: 'money' },
            { key: 'buyboxPrice', label: { tr: 'Buybox fiyatı', en: 'Buybox price' }, type: 'money' },
            { key: 'profitAtBuybox', label: { tr: 'Kâr (buybox fiyatında)', en: 'Profit (at buybox)' }, type: 'money' },
            { key: 'breakEvenPrice', label: { tr: 'Başa baş fiyat', en: 'Break-even price' }, type: 'money' },
            { key: 'commissionSource', label: { tr: 'Komisyon kaynağı', en: 'Commission source' }, type: 'text' },
            { key: 'note', label: { tr: 'Not', en: 'Note' }, type: 'text' },
        ],
        // Hücreler sunucu çıktısından (model sayı üretmez): iç içe kâr alanları düz kolonlara indirilir.
        cells: (v) => ({
            sku: ref('variant', v.variantId ?? v.barcode, v.sku ?? v.barcode ?? v.variantId),
            profitNow: v.current?.profit ?? null,
            buyboxPrice: v.buybox?.price ?? null,
            profitAtBuybox: v.atBuybox?.profit ?? null,
            commissionSource: v.commission?.source ?? null,
            note: !v.found ? 'not_found' : v.buyboxBelowFloor ? 'buybox_below_break_even' : (v.ineligibleReasons?.length ? v.ineligibleReasons.join(',') : null),
        }),
        openIn: () => ({ screen: 'productDefinitions/ProductListView' }),
    },
    'integrations.health.get': {
        kind: 'table', title: { tr: 'Entegrasyon sağlığı', en: 'Integration health' }, itemsKey: 'integrations', rowKey: 'code',
        columns: [
            { key: 'code', label: { tr: 'Entegrasyon', en: 'Integration' }, type: 'channel' },
            { key: 'type', label: { tr: 'Tür', en: 'Type' }, type: 'text' },
            { key: 'health', label: { tr: 'Durum', en: 'Status' }, type: 'status', statusDomain: 'integration' },
            { key: 'calls24h', label: { tr: 'Çağrı (24 sa)', en: 'Calls (24h)' }, type: 'number' },
            { key: 'errors24h', label: { tr: 'Hata (24 sa)', en: 'Errors (24h)' }, type: 'number' },
            { key: 'lastSuccessfulSyncAt', label: { tr: 'Son başarılı senkron', en: 'Last successful sync' }, type: 'datetime' },
            { key: 'circuit', label: { tr: 'Devre', en: 'Circuit' }, type: 'text' },
        ],
        openIn: () => ({ screen: 'integrations/MarketplaceView' }),
    },
    // ---- BR-4 backoffice sohbeti (`adminChat`): yalniz sayac/durum tablolari; tenant verisi yok ----
    'platform.overview.health': {
        kind: 'table', title: { tr: 'Platform sağlığı', en: 'Platform health' }, itemsKey: 'items', rowKey: 'area',
        columns: [
            { key: 'area', label: { tr: 'Alan', en: 'Area' }, type: 'text' },
            { key: 'status', label: { tr: 'Durum', en: 'Status' }, type: 'text' },
            { key: 'detail', label: { tr: 'Ayrıntı', en: 'Detail' }, type: 'text' },
        ],
    },
    'platform.engine.queues': {
        kind: 'table', title: { tr: 'İş kuyrukları', en: 'Job queues' }, itemsKey: 'items', rowKey: 'queue',
        columns: [
            { key: 'queue', label: { tr: 'Kuyruk', en: 'Queue' }, type: 'text' },
            { key: 'available', label: { tr: 'Erişilebilir', en: 'Available' }, type: 'boolean' },
            { key: 'waiting', label: { tr: 'Bekleyen', en: 'Waiting' }, type: 'number' },
            { key: 'active', label: { tr: 'Aktif', en: 'Active' }, type: 'number' },
            { key: 'delayed', label: { tr: 'Ertelenen', en: 'Delayed' }, type: 'number' },
            { key: 'failed', label: { tr: 'Başarısız', en: 'Failed' }, type: 'number' },
            { key: 'pendingReview', label: { tr: 'İnceleme bekleyen', en: 'Pending review' }, type: 'number' },
        ],
    },
    'platform.integrations.api_health': {
        kind: 'table', title: { tr: 'Entegrasyon API sağlığı', en: 'Integration API health' }, itemsKey: 'items', rowKey: 'integrationCode',
        columns: [
            { key: 'integrationCode', label: { tr: 'Entegrasyon', en: 'Integration' }, type: 'channel' },
            { key: 'total', label: { tr: 'Çağrı', en: 'Calls' }, type: 'number' },
            { key: 'errors', label: { tr: 'Hata', en: 'Errors' }, type: 'number' },
            { key: 'errorRate', label: { tr: 'Hata oranı (0-1)', en: 'Error rate (0-1)' }, type: 'number' },
            { key: 'p95Ms', label: { tr: 'p95 (ms)', en: 'p95 (ms)' }, type: 'number' },
            { key: 'affectedTenants', label: { tr: 'Etkilenen mağaza', en: 'Affected stores' }, type: 'number' },
            { key: 'topErrorCode', label: { tr: 'Sık hata kodu', en: 'Top error code' }, type: 'text' },
        ],
    },
    'platform.integrations.resilience': {
        kind: 'table', title: { tr: 'Entegrasyon dayanıklılığı', en: 'Integration resilience' }, itemsKey: 'items', rowKey: 'integrationCode',
        columns: [
            { key: 'integrationCode', label: { tr: 'Entegrasyon', en: 'Integration' }, type: 'channel' },
            { key: 'podsReporting', label: { tr: 'Raporlayan pod', en: 'Reporting pods' }, type: 'number' },
            { key: 'circuitsOpen', label: { tr: 'Açık devre', en: 'Open circuits' }, type: 'number' },
            { key: 'circuitsHalfOpen', label: { tr: 'Yarı açık', en: 'Half-open' }, type: 'number' },
            { key: 'rateLimited', label: { tr: 'Hız sınırlı', en: 'Rate limited' }, type: 'number' },
            { key: 'intake', label: { tr: 'Alım', en: 'Intake' }, type: 'text' },
        ],
    },
    'reports.sales.summary': {
        kind: 'kpi', title: { tr: 'Satış özeti', en: 'Sales summary' }, openIn: { screen: 'DashboardView' },
        items: (d, loc): KpiItem[] => {
            const t = loc === 'tr';
            const c = d.changeVsYesterdayPct;
            return [
                { key: 'todayOrders', label: t ? 'Bugünkü sipariş' : 'Orders today', value: d.today.orders, format: 'number',
                    delta: { value: c.orders, direction: direction(c.orders), good: c.orders >= 0 } },
                { key: 'todayRevenue', label: t ? 'Bugünkü ciro' : 'Revenue today', value: d.today.revenue, format: 'money', currency: d.currency,
                    delta: { value: c.revenue, direction: direction(c.revenue), good: c.revenue >= 0 } },
                { key: 'totalRevenue', label: t ? 'Toplam ciro' : 'Total revenue', value: d.totals.revenue, format: 'money', currency: d.currency },
                { key: 'returns', label: t ? 'İade' : 'Returns', value: d.totals.returns, format: 'number' },
                { key: 'pendingShipping', label: t ? 'Kargo bekleyen' : 'Awaiting shipment', value: d.pending.shipping, format: 'number' },
                { key: 'pendingClaims', label: t ? 'İşlem bekleyen iade' : 'Open claims', value: d.pending.claims, format: 'number' },
            ];
        },
    },
};

// ---- Onay karti (yazma yetenekleri): ozet, etkilenen kayitlar, degisiklik, sonuc metni --------------------------------------
export interface ConfirmSpec {
    summary: (input: any, loc: Locale) => string;
    affected: (input: any) => { count: number; sample: EntityRef[] };
    changes?: (input: any, loc: Locale) => Array<{ label: string; from?: string; to: string }>;
    /** Yurutme sonrasi SABIT sablondan metin (model cagrilmaz). `ok` = en az bir kayit basarili. */
    result: (output: any, loc: Locale) => { message: string; ok: boolean };
    openIn?: AppLink;
    /** Onay sayfasindaki birincil dugme metni (MCP-4; eylemi soyler). Yoksa yetenek basligi. */
    confirmLabel?: (input: any, loc: Locale) => string;
}

const money2 = (n: unknown) => (typeof n === 'number' ? n.toFixed(2) : '-');

export const CONFIRM_SPECS: Readonly<Record<string, ConfirmSpec>> = {
    'pricing.cost.set': {
        summary: (i, loc) => (loc === 'tr'
            ? `${i.items.length} varyantın birim maliyeti (KDV hariç) güncellenecek. Pazaryeri fiyatları DEĞİŞMEZ.`
            : `The unit cost (excl. VAT) of ${i.items.length} variant(s) will be updated. Marketplace prices do NOT change.`),
        affected: (i) => ({ count: i.items.length, sample: (i.items as any[]).slice(0, 10).map((x) => ref('variant', x.variantId ?? x.barcode, x.barcode ?? `#${String(x.variantId).slice(-6)}`)) }),
        changes: (i, loc) => (i.items as any[]).slice(0, 10).map((x) => ({
            label: String(x.barcode ?? `#${String(x.variantId).slice(-6)}`), to: x.costPrice === null ? (loc === 'tr' ? 'silinecek' : 'cleared') : `${money2(x.costPrice)} TRY`,
        })),
        result: (o, loc) => ({
            ok: o.updated > 0 || o.unchanged > 0,
            message: loc === 'tr'
                ? `${o.updated} maliyet güncellendi, ${o.unchanged} değişmedi, ${o.notFound.length} bulunamadı. Maliyet kapsamı: %${o.coverage.percent}.`
                : `${o.updated} cost(s) updated, ${o.unchanged} unchanged, ${o.notFound.length} not found. Cost coverage: ${o.coverage.percent}%.`,
        }),
        openIn: { screen: 'productDefinitions/ProductListView' },
        confirmLabel: (i, loc) => (loc === 'tr' ? `${i.items.length} maliyeti kaydet` : `Save ${i.items.length} cost(s)`),
    },
    // PRC-R2: onay kartı. Önizleme (önce/sonra) yürütme anında sunucuda TAZE veriyle sigortadan yeniden geçer; geçmeyen uygulanmaz.
    // Dil "fiyat güncellendi"dir; "indirim" ifadesi kullanılmaz (K11).
    'pricing.suggestions.apply': {
        summary: (i, loc) => (loc === 'tr'
            ? `${i.suggestionIds.length} fiyat önerisi onaylanırsa Trendyol satış fiyatı güncellenecek. Uygulamadan hemen önce taban, tavan, eşitleme yasağı, artış ve sıklık sınırları taze veriyle yeniden denetlenir; geçmeyen öneri uygulanmaz. Liste (üstü çizili) fiyat değişmez.`
            : `If approved, ${i.suggestionIds.length} price suggestion(s) will update the Trendyol sale price. Right before applying, floor, ceiling, no-equalize, increase and frequency limits are re-checked with fresh data; failing suggestions are not applied. The list (strikethrough) price does not change.`),
        // Örnek kayıtlar yerine sunucu önizlemesi (önce → sonra, `previewChanges`) gösterilir.
        affected: (i) => ({ count: i.suggestionIds.length, sample: [] }),
        result: (o, loc) => ({
            ok: o.applied.length > 0,
            message: loc === 'tr'
                ? `${o.applied.length} ürünün fiyatı güncellendi, ${o.rejected.length} öneri sigortadan geçmedi ve uygulanmadı.`
                : `${o.applied.length} price(s) updated, ${o.rejected.length} suggestion(s) failed the price fuse and were not applied.`,
        }),
        openIn: { screen: 'pricing/PricingRulesView' },
        confirmLabel: (i, loc) => (loc === 'tr' ? `${i.suggestionIds.length} fiyatı güncelle` : `Update ${i.suggestionIds.length} price(s)`),
    },
    'orders.approve': {
        summary: (i, loc) => (loc === 'tr'
            ? `${i.orderIds.length} sipariş "Onaylandı" durumuna geçecek ve pazaryerine bildirilecek.`
            : `${i.orderIds.length} order(s) will be marked Approved and the marketplace will be notified.`),
        affected: (i) => ({ count: i.orderIds.length, sample: (i.orderIds as string[]).slice(0, 10).map((id) => ref('order', id, `#${id.slice(-6)}`)) }),
        changes: (_i, loc) => [{ label: loc === 'tr' ? 'Durum' : 'Status', from: loc === 'tr' ? 'Satıcı onayı bekliyor' : 'Awaiting seller approval', to: loc === 'tr' ? 'Onaylandı' : 'Approved' }],
        result: (o, loc) => ({
            ok: o.approved > 0,
            message: loc === 'tr' ? `${o.approved} sipariş onaylandı, ${o.failed} hata.` : `${o.approved} order(s) approved, ${o.failed} failed.`,
        }),
        openIn: { screen: 'OrderListView', params: { internalStatuses: 'APPROVED' } },
        confirmLabel: (i, loc) => (loc === 'tr' ? `${i.orderIds.length} siparişi onayla` : `Approve ${i.orderIds.length} order(s)`),
    },
};
