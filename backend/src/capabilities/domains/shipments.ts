// Sevkiyat (ShipmentService). Not (E3 dürüstlük): kargo entegrasyonu yoktur; createShipment pazaryerine sevkiyat bildirir,
// kargo firması entegrasyonu yoksa manuel form akışına döner.
import { defineCapability as c, deferred, nx, NO_AGENT, onScreens, noUi } from '../define';

export const SHIPMENTS_CAPABILITIES = [
    c({
        id: 'shipments.list', domain: 'shipments', summary: { tr: 'Sevkiyatları sayfalı listele', en: 'List shipments (paginated)' },
        effect: 'read', minTier: 'member', pii: 'raw', bindings: [{ rpc: 'ShipmentService/getShipments' }],
        ui: noUi('Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE); stub — filtre/sıralama yok.'),
        mcp: deferred('later', 'Stub liste (filtre/sıralama yok, ham sipariş verisi); anlamlı bir sevkiyat okuması olmadan açılmaz (E3 dürüstlük).'), agent: NO_AGENT,
    }),
    c({
        id: 'shipments.create', domain: 'shipments', summary: { tr: 'Sevkiyat oluştur / pazaryerine bildir (tekli/toplu)', en: 'Create shipment / notify marketplace (single/bulk)' },
        effect: 'write', minTier: 'member', external: true, bindings: [{ rpc: 'ShipmentService/createShipment' }, { rpc: 'ShipmentService/bulkCreateShipment' }],
        ui: onScreens(['OrderListView', 'createShipment']),
        mcp: nx('irreversible', 'Pazaryerine sevkiyat bildirimi geri alınamaz; kargo firması entegrasyonu yok (yalnız pazaryeri bildirimi/manuel form), açıklama doğrulanmamış iddia içeremez (E3).'), agent: NO_AGENT,
    }),
];
