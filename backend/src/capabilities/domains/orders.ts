// Sipariş yetenekleri (OrderService). FE: OrderListView (+ components/order/composables/useOrderActions.ts sabitleri).
// Tekli+toplu RPC varyantları TEK yeteneğin `bindings[]`'idir (ADR-0019 §1 "Yetenek ≠ RPC operasyonu").
import { defineCapability as c, deferred, nx, NO_AGENT, onScreens, noUi } from '../define';

const ORD = 'OrderListView';

export const ORDERS_CAPABILITIES = [
    c({
        id: 'orders.list', domain: 'orders', summary: { tr: 'Siparişleri listele/filtrele', en: 'List/filter orders' },
        effect: 'read', minTier: 'member', external: false, pii: 'raw', bindings: [{ rpc: 'OrderService/getOrders' }],
        ui: onScreens(ORD),
        mcp: deferred('C', 'ADR-0009 çekirdek araç #3 (orders_list); Aşama C\'de açılır. Önkoşul: müşteri PII maskeleme + limit≤100/cursor şeması + C7 sipariş sync güvenilirliği.'), agent: NO_AGENT,
        review: 'Bugünkü çıktı ham müşteri PII içerir (pii:raw); exposed olmadan önce masked yapılmalı (P7).',
    }),
    c({
        id: 'orders.approve', domain: 'orders', summary: { tr: 'Siparişleri onayla (tekli/toplu)', en: 'Approve orders (single/bulk)' },
        effect: 'write', minTier: 'member', external: true, bindings: [{ rpc: 'OrderService/approveOrder' }, { rpc: 'OrderService/bulkApproveOrder' }],
        ui: onScreens([ORD, 'approve']),
        mcp: deferred('D', 'ADR-0019 Aşama D ilk yazma adayı (orders_approve); PendingAction + idempotencyKey + onay akışı hazır olunca açılır.'), agent: NO_AGENT,
    }),
    c({
        id: 'orders.cancel', domain: 'orders', summary: { tr: 'Siparişleri iptal et (tekli/toplu)', en: 'Cancel orders (single/bulk)' },
        effect: 'destructive', minTier: 'member', external: true, bindings: [{ rpc: 'OrderService/cancelOrder' }, { rpc: 'OrderService/bulkCancelOrder' }],
        ui: onScreens([ORD, 'cancel']), mcp: nx('irreversible', 'Pazaryerinde sipariş iptali geri alınamaz (undo yok); confirm:typed yalnız undo≠none için, dolayısıyla yalnız ekranda.'), agent: NO_AGENT,
    }),
    c({
        id: 'orders.rejection_reasons.list', domain: 'orders', summary: { tr: 'Sipariş iptal/red nedenlerini getir', en: 'Get order rejection/cancel reasons' },
        effect: 'read', minTier: 'member', external: true, bindings: [{ rpc: 'OrderService/getOrderRejectionReasons' }],
        ui: onScreens([ORD, 'cancel']), mcp: nx('ui_plumbing', 'İptal diyaloğunun başvuru verisi (neden listesi); kullanıcının işi değil, diyalog iç verisi.'), agent: NO_AGENT,
    }),
    c({
        id: 'orders.mark_printed', domain: 'orders', summary: { tr: 'Siparişi "barkod basıldı" olarak işaretle', en: 'Mark an order as barcode-printed' },
        effect: 'write', minTier: 'member', bindings: [{ rpc: 'OrderService/markAsPrinted' }],
        ui: noUi('Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE); yalnızca yerel bayrak + platformActions kaydı.'),
        mcp: nx('ui_plumbing', 'Yerel barkod-basıldı bayrağı; etiket yazdırma UI akışının iç işi, sohbet değeri yok.'), agent: NO_AGENT,
    }),
];
