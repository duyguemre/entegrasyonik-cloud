// Sipariş yetenekleri (OrderService). FE: OrderListView (+ components/order/composables/useOrderActions.ts sabitleri).
// Tekli+toplu RPC varyantları TEK yeteneğin `bindings[]`'idir (ADR-0019 §1 "Yetenek ≠ RPC operasyonu").
// `orders.list` (core) ve `orders.approve` (yazma, onaylı) LLM yüzeylerine açıktır (ADR-0034 BR-2).
import { z } from 'zod';
import { ORDER_INTERNAL_STATUSES } from '@platform/core/orders/orderStatus';
import { defineCapability as c, nx, NO_AGENT, onScreens, noUi } from '../define';
import { maskPerson, toIso } from '../derive/pii';

const ORD = 'OrderListView';
// [WP6-kalan, D-ORD-4] tek kaynak: platform/core/orders/orderStatus.ts (PRE_APPROVAL, SPLIT dahil)
const ORDER_STATUSES = ORDER_INTERNAL_STATUSES;
/** Sayfa imleci `p<sayfa>` (OrderService sayfa tabanlıdır; imleç opak metin olarak istemciye/LLM'e verilir). */
const PAGE_CURSOR = /^p[1-9][0-9]{0,3}$/;
const pageOf = (cursor?: string): number => (cursor ? Number(cursor.slice(1)) : 1);

export const ORDERS_CAPABILITIES = [
    c({
        id: 'orders.list', version: '1.1', domain: 'orders', summary: { tr: 'Siparişleri listele/filtrele', en: 'List/filter orders' },
        effect: 'read', minTier: 'member', permission: 'orders:read', external: false, pii: 'masked',
        untrustedPaths: ['items[].customer', 'items[].tracking'],
        input: z.object({
            status: z.enum(ORDER_STATUSES).optional(),
            channel: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
            search: z.string().min(1).max(100).optional(),
            limit: z.number().int().min(1).max(50).optional(),
            cursor: z.string().regex(PAGE_CURSOR).optional(),
        }).strict(),
        output: z.object({
            items: z.array(z.object({
                id: z.string(), orderNumber: z.string(), channel: z.string(), customer: z.string(), total: z.number(), currency: z.string(),
                status: z.string(), orderDate: z.string().nullable(), itemCount: z.number().int(), tracking: z.string().nullable(),
            })),
            total: z.number().int(),
            nextCursor: z.string().nullable(),
        }),
        bindings: [{
            rpc: 'OrderService/getOrders',
            map: (i: { status?: string; channel?: string; search?: string; limit?: number; cursor?: string }) => ({
                searchOrderForm: {
                    pagination: { page: pageOf(i.cursor), limit: i.limit ?? 25 },
                    filter: {
                        ...(i.status ? { internalStatuses: [i.status] } : {}),
                        ...(i.channel ? { integrationCodes: [i.channel] } : {}),
                        ...(i.search ? { globalSearch: i.search } : {}),
                    },
                },
            }),
        }],
        project: (raw: any, i: { limit?: number; cursor?: string }) => {
            const orders: any[] = Array.isArray(raw?.orders) ? raw.orders : [];
            const total = Number(raw?.totalNumberOfRecords) || 0;
            const limit = i.limit ?? 25;
            const page = pageOf(i.cursor);
            return {
                items: orders.map((o) => ({
                    id: String(o._id), orderNumber: String(o.orderNumber ?? ''), channel: String(o.integrationCode ?? ''),
                    customer: maskPerson(o.billingAddress?.firstName, o.billingAddress?.lastName),
                    total: Number(o.financials?.grandTotal) || 0, currency: String(o.financials?.currencyCode ?? 'TRY'),
                    status: String(o.internalStatus ?? ''), orderDate: toIso(o.dates?.orderDate),
                    itemCount: Array.isArray(o.items) ? o.items.reduce((n: number, it: any) => n + (Number(it?.quantity) || 1), 0) : 0,
                    tracking: (Array.isArray(o.fulfillment) ? o.fulfillment[0]?.trackingCode : undefined) ?? null,
                })),
                total,
                nextCursor: page * limit < total ? `p${page + 1}` : null,
            };
        },
        ui: onScreens(ORD),
        mcp: { exposed: { toolset: 'core', confirm: 'none', present: 'table', deepLink: { screen: ORD } } },
        llm: {
            description: 'Lists the tenant\'s marketplace orders, newest first, optionally filtered by order status, sales channel or a free-text search '
                + '(order number, tracking code). Returns at most 50 rows per call plus a cursor for the next page. Customer names are masked; use the screen link for details. '
                + 'Use it to answer questions like which orders await approval. It cannot change orders; use orders_approve for approval.',
            examples: ['Onay bekleyen siparişlerim neler?', 'Trendyol\'daki son siparişleri göster', 'Kargoya verilmemiş siparişler hangileri?'],
        },
        agent: NO_AGENT,
        review: 'Bugünkü servis çıktısı ham müşteri PII içerir; sohbet yolunda `project` ile maskelenir (pii:masked) — UI yolu (jenerik RPC) DEĞİŞMEDİ.',
    }),
    c({
        id: 'orders.approve', version: '1.1', domain: 'orders', summary: { tr: 'Siparişleri onayla (tekli/toplu)', en: 'Approve orders (single/bulk)' },
        effect: 'write', minTier: 'member', permission: 'orders:write', external: true, idempotency: 'key', pii: 'none',
        untrustedPaths: ['failures[].reason'],
        input: z.object({ orderIds: z.array(z.string().min(1).max(64)).min(1).max(50) }).strict(),
        output: z.object({
            approved: z.number().int(), failed: z.number().int(),
            failures: z.array(z.object({ orderId: z.string(), reason: z.string() })).max(50),
        }),
        // Sohbet yolu HER ZAMAN toplu ucu kullanır (tek kayıt = 1 elemanlı liste; `map` taşıyan ilk bağ); tekli uç UI yolu içindir.
        bindings: [
            { rpc: 'OrderService/approveOrder' },
            { rpc: 'OrderService/bulkApproveOrder', map: (i: { orderIds: string[] }) => ({ orderIds: i.orderIds }) },
        ],
        project: (raw: any) => {
            const d = raw?.data ?? {};
            const failed: any[] = Array.isArray(d.failed) ? d.failed : [];
            return {
                approved: Number(d.successCount) || 0, failed: Number(d.failedCount) || 0,
                failures: failed.slice(0, 50).map((f) => ({ orderId: String(f?.orderId ?? ''), reason: String(f?.errorMessage ?? '').slice(0, 160) })),
            };
        },
        ui: onScreens([ORD, 'approve']),
        mcp: { exposed: { toolset: 'orders', confirm: 'confirm', present: 'text', deepLink: { screen: ORD } } },
        llm: {
            description: 'Approves one or more marketplace orders that are awaiting seller approval (up to 50 per call) and notifies the marketplace. '
                + 'This is a write action with an external effect: the user always sees a confirmation card first and nothing happens until they confirm. '
                + 'Only orders in the awaiting-approval state can be approved; others are reported as failures. Do not use it to cancel or reject orders.',
            examples: ['Bu 3 siparişi onayla', 'Onay bekleyen tüm siparişleri onaya gönder', 'Şu siparişi onayla: 65f0c1'],
        },
        agent: NO_AGENT,
    }),
    c({
        id: 'orders.cancel', domain: 'orders', summary: { tr: 'Siparişleri iptal et (tekli/toplu)', en: 'Cancel orders (single/bulk)' },
        effect: 'destructive', minTier: 'member', permission: 'orders:write', external: true, bindings: [{ rpc: 'OrderService/cancelOrder' }, { rpc: 'OrderService/bulkCancelOrder' }],
        ui: onScreens([ORD, 'cancel']), mcp: nx('irreversible', 'Pazaryerinde sipariş iptali geri alınamaz (undo yok); confirm:typed yalnız undo≠none için, dolayısıyla yalnız ekranda.'), agent: NO_AGENT,
    }),
    c({
        id: 'orders.rejection_reasons.list', domain: 'orders', summary: { tr: 'Sipariş iptal/red nedenlerini getir', en: 'Get order rejection/cancel reasons' },
        effect: 'read', minTier: 'member', permission: 'orders:read', external: true, bindings: [{ rpc: 'OrderService/getOrderRejectionReasons' }],
        ui: onScreens([ORD, 'cancel']), mcp: nx('ui_plumbing', 'İptal diyaloğunun başvuru verisi (neden listesi); kullanıcının işi değil, diyalog iç verisi.'), agent: NO_AGENT,
    }),
    c({
        id: 'orders.mark_printed', domain: 'orders', summary: { tr: 'Siparişi "barkod basıldı" olarak işaretle', en: 'Mark an order as barcode-printed' },
        effect: 'write', minTier: 'member', permission: 'orders:write', bindings: [{ rpc: 'OrderService/markAsPrinted' }],
        ui: noUi('Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE); yalnızca yerel bayrak + platformActions kaydı.'),
        mcp: nx('ui_plumbing', 'Yerel barkod-basıldı bayrağı; etiket yazdırma UI akışının iç işi, sohbet değeri yok.'), agent: NO_AGENT,
    }),
];
