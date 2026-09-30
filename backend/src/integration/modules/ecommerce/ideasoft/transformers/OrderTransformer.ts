import { IOrderPackage, IOrderItem, ICustomer, OrderInternalStatusEnum } from '@interfaces/index';
import { integrationCode } from '../constants';
import { buildInternalOrder } from '@integration/modules/common/adapter/buildInternalOrder';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { eventLog } from '@platform/core/logger';
import { reportUnknownEnum } from '@integration/modules/common/contract/reportUnknownEnum';

const log = eventLog('adapter-ideasoft', 'OrderTransformer');
/** Kayıtların TÜMÜ kimliksizse ve en az bu kadar kayıt varsa şema kayması varsayılır (HB/Trendyol ile aynı eşik). */
const DRIFT_MIN_RECORDS = 3;
export const IDEASOFT_ORDERS_CONTRACT_ID = 'ideasoft.orders';

/** [faz4-conf-fix C9b/C7b] Motorun beklediği IOrderPackage ({order, customer}) üretir (ortak `buildInternalOrder`). */
export class OrderTransformer {
    constructor(private clientId: string | number = 'UnknownClient') {}

    public toInternalOrderPackages(rawOrders: any[]): IOrderPackage[] {
        if (!Array.isArray(rawOrders)) return [];
        // [C7b, playbook §4.2] kimliksiz kayıt "undefined" kimliğiyle SESSİZCE kaydedilmez: atla + logla; tümü kimliksizse VALIDATION.
        const valid = rawOrders.filter(o => o != null && (o.id || o.orderNumber));
        const skipped = rawOrders.length - valid.length;
        if (skipped > 0) {
            log.error('ORDERTRANSFORMER_IDEASOFT_SIPARIS_KIMLIGI_EKSIK', `${skipped}/${rawOrders.length} Ideasoft sipariş kaydı kimlik (id/orderNumber) eksikliği nedeniyle ATLANDI (şema kayması olabilir).`);
            if (rawOrders.length >= DRIFT_MIN_RECORDS && valid.length === 0) {
                throw new IntegrationError('VALIDATION',
                    `Ideasoft sipariş yanıtı beklenen kimlik alanlarını taşımıyor (${rawOrders.length}/${rawOrders.length} kayıt geçersiz; şema kayması şüphesi).`,
                    { integrationCode, operation: 'fetchOrders', clientId: String(this.clientId), platformCode: 'ORDER_SCHEMA_DRIFT' });
            }
        }
        return valid.map((order: any) => this.toInternalOrderPackage(order)).filter(Boolean) as IOrderPackage[];
    }

    private toInternalOrderPackage(order: any): IOrderPackage | null {
        try {
            const externalOrderId = String(order.id || order.orderNumber);
            const internalStatus = this.mapOrderStatus(order.status);
            const itemStatus = this.mapItemStatus(internalStatus);

            // [satır kimliği] id'siz satır "undefined"/sentetik kimlikle kaydedilmez: atla + logla; TÜM satırlar kimliksizse sipariş atlanır.
            const rawLines: any[] = order.orderLines || order.lines || order.items || [];
            const goodLines = rawLines.filter(l => l != null && l.id);
            if (goodLines.length < rawLines.length) {
                log.error('ORDERTRANSFORMER_IDEASOFT_SATIR_KIMLIGI_EKSIK', `Ideasoft siparişi ${externalOrderId}: ${rawLines.length - goodLines.length}/${rawLines.length} satır kimlik (id) eksikliği nedeniyle ATLANDI.`);
                if (goodLines.length === 0) return null;
            }
            const items = goodLines.map((line: any): IOrderItem => {
                const lineId = String(line.id);
                const sku = line.product?.sku || line.sku || '';
                const quantity = Number(line.quantity || 1);
                const unitPrice = Number(line.price || line.salePrice || 0);
                return {
                    externalLineItemId: lineId,
                    externalItemId: String(sku || lineId),
                    productName: line.product?.name || line.productName || '',
                    sku,
                    barcode: line.product?.barcode || line.barcode || '',
                    quantity,
                    unitPrice,
                    taxRate: 0,
                    totalPrice: unitPrice * quantity,
                    itemStatus,
                };
            });

            const shipping = order.shippingAddress || order.deliveryAddress || {};
            const billing = order.billingAddress || order.invoiceAddress || shipping;
            const fullName = `${shipping.firstName || ''} ${shipping.lastName || ''}`.trim() || order.customer?.name || '';
            const [firstName, ...rest] = fullName.split(' ');
            const lastName = rest.join(' ');
            const email = order.customer?.email || order.customerEmail || '';
            const phone = shipping.phone || order.customer?.phone || '';
            const grandTotal = Number(order.totalPrice || order.total || 0);
            const shippingFee = Number(order.shippingPrice || 0);

            const toAddress = (a: any, name: string) => {
                const [f, ...r] = name.split(' ');
                return {
                    firstName: f || '', lastName: r.join(' '), email, phone: a.phone || '',
                    addressLine1: a.address || a.addressLine || '', city: a.city || '',
                    state: a.district || a.city || '', postalCode: a.postalCode || '', countryCode: 'TR',
                };
            };
            const shippingAddress = toAddress(shipping, fullName);
            const billingAddress = toAddress(billing, `${billing.firstName || ''} ${billing.lastName || ''}`.trim());

            const customer: ICustomer = {
                firstName: firstName || 'MUSTERI', lastName, email, phone,
                isEmailMasked: false, isPhoneMasked: false,
                externalIdentities: [{ integrationCode, externalCustomerId: String(order.customer?.id || `IDEASOFT-GUEST-${externalOrderId}`) }],
            };

            const trackingCode = order.cargo?.trackingNumber || order.trackingNumber || '';
            const internalOrder = buildInternalOrder({
                integrationCode,
                externalOrderId,
                orderNumber: String(order.orderNumber || order.id),
                externalStatus: String(order.status || ''),
                internalStatus,
                customerFirstName: customer.firstName,
                customerLastName: customer.lastName,
                dates: { orderDate: new Date(order.createdAt || order.orderDate || Date.now()) },
                billingAddress, shippingAddress,
                financials: { currencyCode: 'TRY', subTotal: grandTotal - shippingFee, shippingFee, grandTotal },
                items,
                fulfillment: trackingCode ? [{ shipmentMethod: 'MARKETPLACE', status: 'SUCCESS', carrierName: order.cargo?.company || order.cargoCompany || '', trackingCode }] : [],
                meta: { ...order },
            });
            return { order: internalOrder, customer, claims: [] };
        } catch {
            return null;
        }
    }

    private mapOrderStatus(status: string | number): OrderInternalStatusEnum {
        const map: Record<string, OrderInternalStatusEnum> = {
            'new': OrderInternalStatusEnum.AWAITING_APPROVAL,
            'preparing': OrderInternalStatusEnum.APPROVED,
            'shipped': OrderInternalStatusEnum.SHIPPED,
            'delivered': OrderInternalStatusEnum.DELIVERED,
            'cancelled': OrderInternalStatusEnum.CANCELLED,
            'returned': OrderInternalStatusEnum.RETURNED,
            '1': OrderInternalStatusEnum.AWAITING_APPROVAL,
            '2': OrderInternalStatusEnum.APPROVED,
            '3': OrderInternalStatusEnum.SHIPPED,
            '4': OrderInternalStatusEnum.DELIVERED,
            '5': OrderInternalStatusEnum.CANCELLED,
        };
        const mapped = map[String(status)];
        if (mapped) return mapped;
        // [C12, ADR-0018 §2a(iii)] bilinmeyen/eksik durum SESSİZCE düşmez: eşleme (AWAITING_APPROVAL) AYNI kalır, değer raporlanır.
        reportUnknownEnum(IDEASOFT_ORDERS_CONTRACT_ID, 'status', status === undefined || status === null || status === '' ? 'MISSING' : status);
        return OrderInternalStatusEnum.AWAITING_APPROVAL;
    }

    private mapItemStatus(s: OrderInternalStatusEnum): 'ACTIVE' | 'CANCELLED' | 'RETURNED' {
        if (s === OrderInternalStatusEnum.CANCELLED) return 'CANCELLED';
        if (s === OrderInternalStatusEnum.RETURNED) return 'RETURNED';
        return 'ACTIVE';
    }
}
