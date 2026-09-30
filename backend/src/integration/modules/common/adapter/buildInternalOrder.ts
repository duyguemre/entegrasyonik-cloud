// ADR-0033 Karar 1 (INT-01): iç sipariş modeli (IOrder) iskelet yardımcısı. Yalnız ORTAK varsayılanlar burada
// (flags, fulfillment, meta, boş adres/finans iskeleti); alan EŞLEMESİ (pazaryeri -> iç model) adaptörde kalır.
// Göç (HB/Pazarama/Trendyol OrderTransformer) INT-07'de; bu iş yalnız yardımcıyı ve testini getirir.
import { OrderInternalStatusEnum, type IOrder, type IAddress, type IFinancials } from '@interfaces/order';

export type InternalOrderInput =
    Pick<IOrder, 'integrationCode' | 'externalOrderId' | 'orderNumber' | 'externalStatus'> &
    Partial<Omit<IOrder, 'dates' | 'flags' | 'billingAddress' | 'shippingAddress' | 'financials'>> & {
        dates: IOrder['dates'];
        flags?: IOrder['flags'];
        billingAddress?: Partial<IAddress>;
        shippingAddress?: Partial<IAddress>;
        financials?: Partial<IFinancials>;
    };

const emptyAddress = (a?: Partial<IAddress>): IAddress => ({ firstName: '', addressLine1: '', city: '', state: '', ...a });

export function buildInternalOrder(p: InternalOrderInput): IOrder {
    const financials: IFinancials = { subTotal: 0, grandTotal: 0, ...p.financials };
    return {
        ...p,
        internalStatus: p.internalStatus ?? OrderInternalStatusEnum.UNAPPROVED,
        billingAddress: emptyAddress(p.billingAddress),
        shippingAddress: emptyAddress(p.shippingAddress ?? p.billingAddress),
        financials,
        items: p.items ?? [],
        fulfillment: p.fulfillment ?? [],
        flags: { isAllocated: false, isInvoiceGenerated: false, isMetricsProcessed: false, ...p.flags },
        meta: p.meta ?? {},
    };
}
