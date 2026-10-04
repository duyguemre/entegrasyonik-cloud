import { IOrderPackage, IOrder, ICustomer, IOrderItem, IAddress, ICustomerAddress, OrderInternalStatusEnum, IOrderPlatformFields } from '@interfaces/index';
import { integrationCode } from '../constants'; // 'trendyol'
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { buildInternalOrder } from '@integration/modules/common/adapter/buildInternalOrder';
import { TrendyolShippingModel } from '../constants';
import { reportUnknownEnum } from '@integration/modules/common/contract/reportUnknownEnum';
import { eventLog } from '@platform/core/logger';

const log = eventLog('adapter-trendyol', 'OrderTransformer');

/** ADR-0018 sözleşme kimliği (Aşama A'da zod şemasıyla eşleşecek). */
export const ORDERS_CONTRACT_ID = 'trendyol.orders.list@v2';

/**
 * [C22, 2026-09-28] Sipariş V2 alan adı yeniden adlandırması (spec §2.3): YENİ ad öncelikli, ESKİ ad geri dönüş.
 * `undefined/null/''` "yok" sayılır; 0 GEÇERLİ bir değerdir (eski kod `||` ile 0'ı düşürüyordu).
 */
const pick = (...vals: any[]): any => vals.find(v => v !== undefined && v !== null && v !== '');
const num = (...vals: any[]): number => { const v = pick(...vals); return v === undefined ? 0 : Number(v) || 0; };
const idStr = (...vals: any[]): string | undefined => { const v = pick(...vals); return v === undefined ? undefined : String(v); };

/** Kaydı atlanan (kritik alanı eksik) sipariş kaydı; PII içermez (yalnız paket/sipariş no + neden). */
export interface SkippedOrderRecord { ref: string; reason: 'MISSING_ORDER_ID' | 'MISSING_LINE_ID'; }

/** Toplu şema kayması sezgisi: bu kadar (veya fazla) kayıtta HEPSİ geçersizse tek tek atlamak yerine hata fırlatılır. */
const DRIFT_MIN_RECORDS = 3;

/** `orderDate` GMT+3 kodlu (bkz. resolveOrderDate). */
export const TRENDYOL_ORDER_DATE_GMT3_OFFSET_MS = 3 * 60 * 60 * 1000;

type StatusFlag = 'paymentPending' | 'unpacked' | 'unknownStatus';
interface StatusRule { internal: OrderInternalStatusEnum; flag?: StatusFlag; }

/**
 * Statü tablosu (anahtar: küçük harf — resmi yazım "UnSupplied" ile eski "Unsupplied" ikisini de kapsar).
 * [C22] Yeni statüler (spec §2.1, 13 statü):
 *  - Awaiting/Verified: ÖDEME ONAYI BEKLEYEN paketler. Trendyol: "stok düşümü dışında hiçbir işlem yapılmamalı; Created
 *    olana kadar dokunulmamalı". Dahili statü UNAPPROVED (Created ile aynı, onay/hazırlık/fatura aksiyonları AÇILMAZ:
 *    LifecycleManager/order-service yalnızca AWAITING_APPROVAL/APPROVED'da aksiyon verir) + `meta.statusFlag='paymentPending'`.
 *    Stok kovası: RESERVED (orderStatusMapping — spec stok düşümüne İZİN verir; sıfır-oversell için rezervasyon korunur).
 *  - AtCollectionPoint: paket teslim noktasında (kargolanmış): SHIPPED. UnDelivered: teslim edilemedi, iade yolunda — daha
 *    önce SHIPPED/COMMITTED olan paket geri RESERVED'a DÜŞMESİN diye SHIPPED (COMMITTED).
 *  - UnPacked: paket bozuldu (bölünme); anlamı spec'te doğrulanamadı -> UNAPPROVED + `unpacked` bayrağı, stok işlemi ATLANIR
 *    (orderStatusMapping null döner; çift rezervasyon/serbest bırakma riski alınmaz).
 */
const STATUS_RULES: Record<string, StatusRule> = {
    created: { internal: OrderInternalStatusEnum.UNAPPROVED },
    picking: { internal: OrderInternalStatusEnum.APPROVED },
    invoiced: { internal: OrderInternalStatusEnum.APPROVED },
    shipped: { internal: OrderInternalStatusEnum.SHIPPED },
    delivered: { internal: OrderInternalStatusEnum.DELIVERED },
    cancelled: { internal: OrderInternalStatusEnum.CANCELLED },
    unsupplied: { internal: OrderInternalStatusEnum.CANCELLED },
    returned: { internal: OrderInternalStatusEnum.RETURNED },
    awaiting: { internal: OrderInternalStatusEnum.UNAPPROVED, flag: 'paymentPending' },
    verified: { internal: OrderInternalStatusEnum.UNAPPROVED, flag: 'paymentPending' },
    atcollectionpoint: { internal: OrderInternalStatusEnum.SHIPPED },
    undelivered: { internal: OrderInternalStatusEnum.SHIPPED },
    unpacked: { internal: OrderInternalStatusEnum.UNAPPROVED, flag: 'unpacked' },
};

export class OrderMapper {
    /** Son `toInternalOrderPackages` çağrısında atlanan kayıtlar (test/izleme; PII yok). */
    public lastSkipped: SkippedOrderRecord[] = [];

    constructor(private readonly clientId: string | number = 'UnknownClient', private readonly shippingModel: TrendyolShippingModel = 'marketplace') { }

    /**
     * Trendyol JSON verisini IOrderPackage yapısına dönüştürür.
     * [C22] V2 alan adlarını (yeni ad öncelikli) ve eski adları HOŞGÖRÜLÜ okur. Kritik alanı (paket/sipariş kimliği ya da satır
     * kimliği) eksik kayıt `"undefined"` kimliğiyle KAYDEDİLMEZ: atlanır + loglanır; kayıtların TÜMÜ (>= DRIFT_MIN_RECORDS)
     * geçersizse şema kayması varsayılır ve IntegrationError(VALIDATION) fırlatılır.
     */
    public toInternalOrderPackages(orders: any[]): IOrderPackage[] {
        this.lastSkipped = [];
        const out: IOrderPackage[] = [];
        for (const order of orders) {
            const mapped = this.mapOne(order);
            if (mapped) out.push(mapped);
        }
        if (this.lastSkipped.length > 0) {
            log.error('ORDERTRANSFORMER_ORDERMAPPER_TRENDYOL_SIPARIS_KAYDI', `${this.lastSkipped.length}/${orders.length} Trendyol sipariş kaydı kritik alan eksikliği nedeniyle ATLANDI (şema kayması olabilir): ` +
                this.lastSkipped.slice(0, 10).map(r => `${r.ref}:${r.reason}`).join(', '));
            if (orders.length >= DRIFT_MIN_RECORDS && this.lastSkipped.length === orders.length) {
                throw new IntegrationError('VALIDATION',
                    `Trendyol sipariş yanıtı beklenen kimlik alanlarını taşımıyor (${orders.length}/${orders.length} kayıt geçersiz; şema kayması şüphesi, spec C22).`,
                    { integrationCode, operation: 'toInternalOrderPackages', clientId: this.clientId, platformCode: 'ORDER_SCHEMA_DRIFT' });
            }
        }
        return out;
    }

    private mapOne(order: any): IOrderPackage | null {
        {
            // 0. KRİTİK KİMLİK ALANLARI (V2: `id` -> `shipmentPackageId`, `line.id` -> `lineId`)
            const externalOrderId = idStr(order.shipmentPackageId, order.id, order._id, order.packageId, order.orderNumber);
            if (externalOrderId === undefined) {
                this.lastSkipped.push({ ref: `orderNumber=${order.orderNumber ?? '?'}`, reason: 'MISSING_ORDER_ID' });
                return null;
            }
            const rawLines: any[] = Array.isArray(order.lines) ? order.lines : [];
            const lineIds = rawLines.map(l => idStr(l?.lineId, l?.id, l?._id));
            if (lineIds.some(id => id === undefined)) {
                this.lastSkipped.push({ ref: `package=${externalOrderId}`, reason: 'MISSING_LINE_ID' });
                return null;
            }
            const statusRule = this.resolveStatus(order.status);

            // 1. İSİM VE KİMLİK AYIKLAMA
            const cFirstName = (order.customerFirstName || order.shipmentAddress?.firstName || order.billingAddress?.firstName || "MUSTERI").trim();
            const cLastName = (order.customerLastName || order.shipmentAddress?.lastName || order.billingAddress?.lastName || "").trim();

            const rawCustomerId = String(order.customerId || "").trim();
            const fallbackStr = `${cFirstName}${cLastName}`.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const fallbackId = fallbackStr || String(order.orderNumber || externalOrderId).trim();
            const safeExternalCustomerId = rawCustomerId !== "" ? rawCustomerId : `TR-GUEST-${fallbackId}`;

            // 2. ADRES MAPPING (FALLBACK DESTEKLİ)
            const shippingAddr = this.mapToIAddress(order.shipmentAddress, cFirstName, cLastName);
            const billingAddr = this.mapToIAddress(order.invoiceAddress || order.shipmentAddress, cFirstName, cLastName);

            const cPhone = order.customerPhone || order.invoiceAddress?.phone || order.shipmentAddress?.phone || "";

            const customer: ICustomer = {
                firstName: cFirstName,
                lastName: cLastName,
                email: order.customerEmail || "",
                phone: cPhone,
                isEmailMasked: !!order.customerEmail?.includes('trendyol.com'),
                isPhoneMasked: false,

                taxNumber: order.invoiceAddress?.taxNumber || order.identityNumber || "",
                taxOffice: order.invoiceAddress?.taxOffice || "",
                isCorporate: !!order.invoiceAddress?.taxNumber,
                companyName: order.invoiceAddress?.company || order.invoiceAddress?.companyName || "",

                externalIdentities: [{
                    integrationCode: integrationCode,
                    externalCustomerId: safeExternalCustomerId
                }],

                addresses: [
                    {
                        ...this.mapToICustomerAddress(shippingAddr),
                        title: 'Teslimat Adresi',
                        isDefaultShipping: true
                    },
                    {
                        ...this.mapToICustomerAddress(billingAddr),
                        title: 'Fatura Adresi',
                        isDefaultBilling: true
                    }
                ]
            };

            const statusKey = String(order.status ?? '').toLowerCase();
            const isUnsupplied = statusKey === 'unsupplied';
            const isCancelled = statusKey === 'cancelled';
            let source = 'UNKNOWN';
            if (isUnsupplied) {
                source = 'SELLER';
            } else if (isCancelled) {
                source = order.statusReason?.toLowerCase().includes('müşteri') ? 'CUSTOMER' : 'PLATFORM';
            }

            // 3. ORDER MAPPING
            const internalOrder: IOrder = buildInternalOrder({
                integrationCode: integrationCode,
                externalOrderId,
                orderNumber: order.orderNumber || externalOrderId,
                customerFirstName: cFirstName,
                customerLastName: cLastName,
                externalStatus: order.status || "UNKNOWN",
                internalStatus: statusRule.internal,
                cancelReason: (isCancelled || isUnsupplied)
                    ? (order.statusReason || order.lines?.[0]?.cancelReason || order.lines?.[0]?.reason || 'İptal Nedeni Belirtilmedi')
                    : undefined,

                cancelSource: source,
                dates: {
                    orderDate: this.resolveOrderDate(order),
                    estimatedDeliveryDate: order.estimatedDeliveryEndDate ? new Date(order.estimatedDeliveryEndDate) : undefined,
                    shippedDate: order.shippedDate ? new Date(order.shippedDate) : undefined,
                    deliveredDate: order.deliveredDate ? new Date(order.deliveredDate) : undefined,
                    invoiceDate: trendyolInvoicedAt(order),
                    externalUpdatedAt: order.lastModifiedDate ? new Date(order.lastModifiedDate) : undefined
                },

                billingAddress: billingAddr,
                shippingAddress: shippingAddr,

                financials: {
                    currencyCode: order.currencyCode || 'TRY',
                    // V2 yeniden adlandırma: grossAmount->packageGrossAmount, totalDiscount->packageSellerDiscount, totalPrice->packageTotalPrice
                    subTotal: num(order.packageGrossAmount, order.grossAmount),
                    totalDiscount: num(order.packageTotalDiscount, order.packageSellerDiscount, order.totalDiscount),
                    totalTax: Number(order.taxAmount || 0), // güncel şemada yok (spec §7) -> 0
                    shippingFee: Number(order.cargoAmount || 0), // güncel şemada yok (spec §7) -> 0
                    grandTotal: num(order.packageTotalPrice, order.totalPrice)
                },

                fulfillment: [{
                    // [eslesme-fiyat WP4, K-D] tenant ayarı `shippingModel`: seller → satıcı kargosu (MANUAL), aksi pazaryeri lojistiği.
                    shipmentMethod: this.shippingModel === 'seller' ? 'MANUAL' : 'MARKETPLACE',
                    status: (order.cargoTrackingNumber || order.trackingCode) ? 'SUCCESS' : 'PENDING',
                    carrierCode: order.cargoProviderName || "",
                    carrierName: order.cargoProviderName || "",
                    trackingCode: (order.cargoTrackingNumber || order.trackingCode)?.toString() || "",
                    trackingUrl: order.cargoTrackingLink || "",
                    campaignCode: (order.cargoTrackingNumber || order.trackingCode)?.toString() || "",
                    desi: Number(order.cargoDeci || 0)
                }],

                invoice: trendyolInvoice(order),

                items: rawLines.map((line: any, idx: number): IOrderItem => {
                    const lineId = lineIds[idx] as string; // yukarıda doğrulandı (undefined olsaydı kayıt atlanırdı)
                    const quantity = Number(line.quantity || 0);
                    const unitPrice = num(line.lineUnitPrice, line.price);
                    return {
                        externalLineItemId: lineId,
                        externalItemId: lineId,
                        productName: line.productName || "İsimsiz Ürün",
                        sku: line.stockCode || line.merchantSku || "", // V2: merchantSku -> stockCode
                        barcode: line.barcode || "",
                        quantity,
                        unitPrice,
                        discountAmount: num(line.lineTotalDiscount, line.lineSellerDiscount, line.discount),
                        taxRate: num(line.vatRate, line.vatBaseAmount), // V2: vatBaseAmount -> vatRate
                        // `lineItemPrice` satır kökünde yok (discountDetails altında) -> lineUnitPrice * adet
                        totalPrice: line.lineItemPrice !== undefined && line.lineItemPrice !== null ? Number(line.lineItemPrice) || 0 : unitPrice * quantity,
                        itemStatus: this.mapItemStatus(line.orderLineItemStatusName || line.status || '')
                    };
                }),

                flags: { isAllocated: false, isInvoiceGenerated: !!order.invoiceLink, isMetricsProcessed: false },

                // [eslesme-fiyat WP6, K-F / D-ORD-3, F-P1-13] normalize alanlar (yalnız yanıtta olanlar; `meta` aynen kalır).
                platformFields: trendyolPlatformFields(order),

                meta: {
                    packageId: order.shipmentPackageId ?? order.id ?? order.packageId,
                    giftBox: !!order.giftBox || !!order.giftBoxRequested,
                    commercial: !!order.commercial,
                    // [WP5] 09.09.2026'dan beri sipariş yanıtında `paymentMethod` var (esnek `meta`; şema değişikliği yok).
                    paymentMethod: order.paymentMethod ?? undefined,
                    micro: !!order.micro,
                    etgbNo: order.etgbNo,
                    etgbDate: order.etgbDate,
                    ...order,
                    // Hesaplanan bayrak ham alanların ÜSTÜNE yazılır (`...order` hiçbir zaman `statusFlag` taşımaz).
                    ...(statusRule.flag ? { statusFlag: statusRule.flag } : {}),
                }
            });

            return {
                order: internalOrder,
                customer: customer,
                claims: [] // Claims are handled by ClaimConnector separately
            };
        }
    }

    /**
     * Sipariş tarihi -> UTC `Date`. Resmi (changelog/getShipmentPackages): `orderDate` GMT+3, `createdDate` GMT döner
     * (tutarsızlık). `orderDate` epoch'u yerel (TR) duvar saatini UTC'ymiş gibi kodlar => gerçek an = değer - 3 sa.
     * `createdDate` (ve eski `creationDate`) zaten GMT'dir => düzeltme YOK. Öncelik: orderDate (düzeltilmiş) → createdDate → şimdi.
     * TODO(WP5, sandbox doğrulaması): kayma yönü/sabiti stage hesabı gelince canlı örnekle teyit edilmeli.
     */
    private resolveOrderDate(order: any): Date {
        const od = Number(order.orderDate);
        if (order.orderDate !== undefined && order.orderDate !== null && order.orderDate !== '' && Number.isFinite(od)) return new Date(od - TRENDYOL_ORDER_DATE_GMT3_OFFSET_MS);
        const cd = pick(order.createdDate, order.creationDate);
        if (cd !== undefined && Number.isFinite(Number(cd))) return new Date(Number(cd));
        return new Date();
    }

    /**
     * Statü -> dahili statü. Bilinmeyen (tabloda olmayan) değer SESSİZCE düşmez: davranış (UNAPPROVED) aynı kalır ama
     * `reportUnknownEnum` (ADR-0018 §2a iii) çağrılır ve `meta.statusFlag='unknownStatus'` ile işaretlenir; stok kovası
     * `orderStatusMapping` yedeğiyle (UNAPPROVED->RESERVED) korunur (sıfır-oversell için muhafazakâr).
     */
    private resolveStatus(status: unknown): StatusRule {
        const key = String(status ?? '').toLowerCase();
        const rule = STATUS_RULES[key];
        if (rule) return rule;
        reportUnknownEnum(ORDERS_CONTRACT_ID, 'status', key === '' ? 'MISSING' : status);
        return { internal: OrderInternalStatusEnum.UNAPPROVED, flag: 'unknownStatus' };
    }

    private mapItemStatus(status: string): 'ACTIVE' | 'CANCELLED' | 'RETURNED' {
        switch (String(status).toLowerCase()) {
            case 'cancelled':
            case 'unsupplied': return 'CANCELLED';
            case 'returned': return 'RETURNED';
            default: return 'ACTIVE';
        }
    }

    private mapToIAddress(addr: any, fallbackFirstName?: string, fallbackLastName?: string): IAddress {
        let fName = addr?.firstName;
        let lName = addr?.lastName || "";

        if (!fName && addr?.fullName) {
            const parts = addr.fullName.trim().split(' ');
            fName = parts[0];
            lName = parts.slice(1).join(' ');
        }

        return {
            firstName: (fName || fallbackFirstName || "Müşteri").trim(),
            lastName: (lName || fallbackLastName || "").trim(),
            companyName: addr?.company || addr?.companyName || "", // V2: companyName -> company
            isCorporate: !!addr?.taxNumber,
            taxNumber: addr?.taxNumber || "",
            taxOffice: addr?.taxOffice || "",
            email: addr?.email || "",
            phone: addr?.phone || "",
            addressLine1: addr?.address1 || addr?.fullAddress || "Adres Bilgisi Yok",
            addressLine2: addr?.address2 || "",
            city: addr?.city || "",
            state: addr?.district || "",
            postalCode: addr?.postalCode || addr?.zipCode || "", // V2: zipCode -> postalCode
            countryCode: 'TR'
        };
    }

    private mapToICustomerAddress(addr: IAddress): ICustomerAddress {
        return {
            ...addr,
            addressLine: addr.addressLine1 + (addr.addressLine2 ? " " + addr.addressLine2 : ""),
            isDefaultShipping: false,
            isDefaultBilling: false
        };
    }
}

/**
 * [eslesme-fiyat WP6-kalan, D-ORD-3 / Ek E F-P2-6] Faturalanma anı PLATFORM zamanından: `packageHistories[]`'teki
 * `Invoiced` girdisinin `createdDate`'i. Eskiden `status==='Invoiced'` iken her senkronda `new Date()` yazılıyordu (tarih
 * her turda kayıyordu). Girdi yoksa tarih uydurulmaz.
 */
export function trendyolInvoicedAt(order: any): Date | undefined {
    const hist = Array.isArray(order?.packageHistories) ? order.packageHistories : [];
    const entry = hist.find((h: any) => String(h?.status ?? '').toLowerCase() === 'invoiced');
    if (!entry?.createdDate) return undefined;
    const d = new Date(entry.createdDate);
    return isNaN(d.getTime()) ? undefined : d;
}

/**
 * [eslesme-fiyat WP6-kalan] Fatura özeti platformdan: bağlantı (`invoiceLink`) varsa SUCCESS; numara yanıtta varsa
 * (`invoiceNumber`; canlı alan adı yerelde teyit edilecek) alınır; faturalanma anı `trendyolInvoicedAt`.
 */
export function trendyolInvoice(order: any) {
    return {
        invoiceMethod: 'MARKETPLACE' as const,
        invoiceProvider: 'TRENDYOL',
        status: (order?.invoiceLink ? 'SUCCESS' : 'PENDING') as 'SUCCESS' | 'PENDING',
        invoiceLink: order?.invoiceLink || undefined,
        invoiceNumber: order?.invoiceNumber ? String(order.invoiceNumber) : undefined,
        invoicedAt: trendyolInvoicedAt(order),
    };
}

/**
 * [eslesme-fiyat WP6, K-F / D-ORD-3] Trendyol paket yanıtından tipli alanlar. Bölünmüş paket (`createdBy: 'split'`) köken paket
 * kimliklerini `originPackageIds`'te taşır → `splitFrom` (F-P1-13: paketler arası ilişki; her paket yine ayrı Order).
 * Fatura numarası yanıtta varsa (`invoiceNumber`) alınır; yoksa boş (uydurma yok).
 */
export function trendyolPlatformFields(order: any): IOrderPlatformFields {
    const origin = Array.isArray(order?.originPackageIds) ? order.originPackageIds.map((v: any) => String(v)).filter(Boolean) : [];
    const packageId = order?.shipmentPackageId ?? order?.id ?? order?.packageId;
    const out: IOrderPlatformFields = {
        commercial: !!order?.commercial,
        micro: !!order?.micro,
    };
    if (order?.paymentMethod) out.paymentMethod = String(order.paymentMethod);
    if (packageId !== undefined && packageId !== null) out.packageId = String(packageId);
    if (origin.length) out.splitFrom = origin;
    if (order?.invoiceNumber) out.invoiceNumber = String(order.invoiceNumber);
    if (order?.invoiceLink) out.invoiceStatus = 'ISSUED';
    if (order?.storeFrontCode) out.channel = String(order.storeFrontCode);
    return out;
}
