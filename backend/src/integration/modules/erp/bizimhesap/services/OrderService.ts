import { IOrderPackage, ICustomer, OrderInternalStatusEnum } from '@interfaces/index';
import { buildInternalOrder } from '@integration/modules/common/adapter/buildInternalOrder';
import { eventLog } from '@platform/core/logger';
import { integrationCode } from '../constants';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { observeResponseSchema } from '@integration/modules/common/contract/observeResponseSchema';
import { reportUnknownEnum } from '@integration/modules/common/contract/reportUnknownEnum';
import { paginate } from '@integration/modules/common/adapter/paginate';
import { carryIncomplete } from '@integration/contracts/IncompleteFetch';
import { BIZIMHESAP_ORDERS_LIST } from '../contracts';

const log = eventLog('adapter-bizimhesap', 'OrderService');
/** Kayıtların TÜMÜ kimliksizse ve en az bu kadar kayıt varsa şema kayması varsayılır (HB/Trendyol ile aynı eşik). */
const DRIFT_MIN_RECORDS = 3;
const PAGE_SIZE = 1000;
/** Sayfa (istek turu) üst sınırı; `BIZIMHESAP_MAX_PAGES` ile ayarlanır. Aşılırsa sonuç `incomplete` işaretlenir (sessiz kırpma yok; C6b). */
const maxPages = (): number => {
    const n = Number(process.env.BIZIMHESAP_MAX_PAGES);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 200;
};
/** C12: Bizimhesap sipariş `status` alanı için BİLİNEN (belgesiz; genel) değerler. Bunun dışı `reportUnknownEnum` ile raporlanır; eşleme AYNI kalır (AWAITING_APPROVAL). */
export const BIZIMHESAP_ORDERS_CONTRACT_ID = 'bizimhesap.orders';
const KNOWN_STATUSES = new Set(['', 'created', 'new', 'pending', 'approved', 'shipped', 'delivered', 'completed', 'cancelled', 'canceled', 'returned']);

export class OrderService {
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || 'UnknownClient';
    }

    public async fetchOrders(query?: Record<string, any>): Promise<IOrderPackage[]> {
        try {
            const urls = this.params.integrationSettings?.urls || {};
            const settings = this.params.integrationSettings?.settings || {};
            const orderListUrl = urls.orderListUrl;

            // [eslesme-fiyat WP4, 02-ekler/bizimhesap C-3 / D-BH-3] Bizimhesap'ta sipariş LİSTELEME ucu hiçbir kaynakta yok (yalnız
            // addinvoice yazma). Eskiden `orderListUrl` yoksa sessizce `[]` dönüyordu (çağıranın imleci "başarılı" ilerlerdi) → artık
            // NOT_SUPPORTED. Tenant/mock açıkça `orderListUrl` verdiyse eski okuma korunur.
            if (!orderListUrl) {
                throw new IntegrationError('NOT_SUPPORTED', 'Bizimhesap sipariş listeleme ucu sağlamıyor (yalnız fatura ekleme dokümante).', {
                    integrationCode, operation: 'fetchOrders', clientId: this.clientId,
                });
            }

            const finalUrl = orderListUrl.replace('<SELLERID>', settings.sellerId || '');
            // [faz4-conf-close C6b] ortak paginate: sayfa tavanı (BIZIMHESAP_MAX_PAGES) / tekrar eden sayfa => sessiz kesme YOK, `incomplete` işareti.
            // Sayfa sayısı yanıttaki `totalPages`'ten gelir (imleç = sonraki sayfa; son sayfada null).
            const allOrders = await paginate<any>(async ({ page }) => {
                const response = await this.service.get(`${finalUrl}?page=${page}&size=${PAGE_SIZE}`);
                const data = response?.data;
                observeResponseSchema(BIZIMHESAP_ORDERS_LIST, data, { clientId: this.params.clientId }); // F-09 (C7a): yalnız gözlem
                const totalPages = Number(data?.totalPages ?? 1);
                return { items: Array.isArray(data?.content) ? data.content : [], next: page + 1 < totalPages ? page + 1 : null };
            }, { kind: 'cursor', maxPages: maxPages(), limit: PAGE_SIZE, operation: 'fetchOrders', integrationCode, clientId: this.clientId });

            return carryIncomplete(allOrders, this.convert(allOrders));
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][${integrationCode}OrderService:fetchOrders] ${error.message}`);
        }
    }

    /**
     * [faz4-conf-fix C9b/C7b] Motorun beklediği IOrderPackage ({order, customer}); ortak `buildInternalOrder` ile.
     * Kimliksiz kayıt "undefined" kimliğiyle kaydedilmez: atla + logla; >=3 ve tümü kimliksizse VALIDATION ORDER_SCHEMA_DRIFT (HB deseni).
     * Satır düzeyinde de aynı: kimliksiz (id yok) satır atlanır + loglanır; siparişin TÜM satırları kimliksizse sipariş atlanır.
     */
    private convert(orders: any[]): IOrderPackage[] {
        const valid = orders.filter(o => o != null && (o.id || o.orderNumber));
        const skipped = orders.length - valid.length;
        if (skipped > 0) {
            log.error('ORDERSERVICE_BIZIMHESAP_SIPARIS_KIMLIGI_EKSIK', `${skipped}/${orders.length} Bizimhesap sipariş kaydı kimlik (id/orderNumber) eksikliği nedeniyle ATLANDI (şema kayması olabilir).`);
            if (orders.length >= DRIFT_MIN_RECORDS && valid.length === 0) {
                throw new IntegrationError('VALIDATION',
                    `Bizimhesap sipariş yanıtı beklenen kimlik alanlarını taşımıyor (${orders.length}/${orders.length} kayıt geçersiz; şema kayması şüphesi).`,
                    { integrationCode, operation: 'fetchOrders', clientId: this.clientId, platformCode: 'ORDER_SCHEMA_DRIFT' });
            }
        }
        const out: IOrderPackage[] = [];
        for (const order of valid) {
            const externalOrderId = String(order.id || order.orderNumber);
            const rawStatus = String(order.status ?? '');
            if (!KNOWN_STATUSES.has(rawStatus.trim().toLowerCase())) reportUnknownEnum(BIZIMHESAP_ORDERS_CONTRACT_ID, 'status', rawStatus); // C12: eşleme değişmez
            const rawLines: any[] = Array.isArray(order.lines) ? order.lines : [];
            const goodLines = rawLines.filter(l => l != null && l.id);
            if (goodLines.length < rawLines.length) {
                log.error('ORDERSERVICE_BIZIMHESAP_SATIR_KIMLIGI_EKSIK', `Bizimhesap siparişi ${externalOrderId}: ${rawLines.length - goodLines.length}/${rawLines.length} satır kimlik (id) eksikliği nedeniyle ATLANDI.`);
                if (goodLines.length === 0) continue; // tüm satırlar kimliksiz => sipariş atlanır
            }
            const firstName = String(order.customerFirstName || '').trim();
            const lastName = String(order.customerLastName || '').trim();
            const email = order.customerEmail || '';
            const phone = order.shipmentAddress?.phone || '';
            const toAddress = (a: any) => ({
                firstName: a?.firstName || '', lastName: a?.lastName || '', email, phone: a?.phone || '',
                addressLine1: a?.address1 || '', city: a?.city || '',
                state: a?.district || a?.city || '', postalCode: a?.postalCode || '', countryCode: a?.countryCode || 'TR',
            });
            const items = goodLines.map((line: any) => {
                const quantity = Number(line.quantity || 1);
                const unitPrice = Number(line.amount || 0);
                const sku = line.merchantSku || line.barcode || '';
                return {
                    externalLineItemId: String(line.id),
                    externalItemId: String(sku || line.id),
                    productName: line.productName || '',
                    sku,
                    barcode: line.barcode || '',
                    quantity,
                    unitPrice,
                    discountAmount: Number(line.discount || 0),
                    taxRate: 0,
                    totalPrice: unitPrice * quantity,
                    itemStatus: 'ACTIVE' as const,
                };
            });
            const grandTotal = Number(order.grossAmount || 0);
            const tracking = String(order.cargoTrackingNumber || '');
            const customer: ICustomer = {
                firstName: firstName || 'MUSTERI', lastName, email, phone,
                isEmailMasked: false, isPhoneMasked: false,
                externalIdentities: [{ integrationCode, externalCustomerId: String(order.customerId || `BIZIMHESAP-GUEST-${externalOrderId}`) }],
            };
            const internalOrder = buildInternalOrder({
                integrationCode,
                externalOrderId,
                orderNumber: String(order.orderNumber || order.id),
                externalStatus: String(order.status || ''),
                internalStatus: OrderInternalStatusEnum.AWAITING_APPROVAL, // ERP kaynağı: durum eşlemesi yok (ham değer externalStatus'ta; bilinmeyen değer reportUnknownEnum ile raporlanır, C12)
                customerFirstName: customer.firstName,
                customerLastName: customer.lastName,
                dates: { orderDate: new Date(order.orderDate || order.createdAt || Date.now()) },
                shippingAddress: toAddress(order.shipmentAddress),
                billingAddress: toAddress(order.invoiceAddress || order.shipmentAddress),
                financials: { currencyCode: 'TRY', subTotal: grandTotal, totalDiscount: Number(order.totalDiscount || 0), shippingFee: 0, grandTotal },
                items,
                fulfillment: tracking ? [{ shipmentMethod: 'MARKETPLACE', status: 'SUCCESS', carrierName: order.cargoProviderName || '', trackingCode: tracking }] : [],
                meta: { ...order },
            });
            out.push({ order: internalOrder, customer, claims: [] });
        }
        return out;
    }

    public async retrieveOrderRejectionReasons(): Promise<any[]> {
        return [
            { id: '1', title: 'Stokta Yok' },
            { id: '2', title: 'Diğer' }
        ];
    }

    /** [ADR-0006 Karar 2] TERS ÇEVRİLDİ (bkz. ProductService.notSupported): generic Error yerine IntegrationError. */
    public notSupported(op: string): never {
        throw new IntegrationError('NOT_SUPPORTED', `${op} bu entegrasyon için desteklenmiyor`, {
            integrationCode, operation: op, clientId: this.clientId,
        });
    }
}
