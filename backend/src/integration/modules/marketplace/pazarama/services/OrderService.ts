import { carryIncomplete, getIncomplete, markIncomplete } from '@integration/contracts/IncompleteFetch';
import { IOrderPackage, IOrderRejectParams, IPlatformResponse, ISendInvoicePayload, ISendTrackingPayload, OrderInternalStatusEnum } from '@interfaces/index';
import { OrderConnector } from '../api/OrderConnector';
import { OrderMapper } from '../transformers/OrderTransformer';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { eventLog } from '@platform/core/logger';
import { integrationCode } from '../constants';

const log = eventLog('adapter-pazarama', 'OrderService');
/** Kayıtların TÜMÜ kimliksizse ve en az bu kadar kayıt varsa şema kayması varsayılır (Trendyol/HB DRIFT_MIN_RECORDS ile aynı eşik). */
const DRIFT_MIN_RECORDS = 3;

/** [D-PZ-8] Sipariş sorgu dilimi (30 gün). */
export const PZ_ORDER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function splitWindows(start: Date, end: Date, maxMs: number): { start: Date; end: Date }[] {
    const out: { start: Date; end: Date }[] = [];
    let s = start.getTime();
    const e = end.getTime();
    if (!(Number.isFinite(s) && Number.isFinite(e)) || s >= e) return [{ start, end }];
    while (s < e) { const n = Math.min(s + maxMs, e); out.push({ start: new Date(s), end: new Date(n) }); s = n; }
    return out;
}

export class OrderService {
    private connector: OrderConnector;
    private mapper: OrderMapper;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new OrderConnector(this.service, this.params);
        this.mapper = new OrderMapper();
    }

    public async fetchOrders(query?: Record<string, any>): Promise<IOrderPackage[]> {
        try {
            // Pazarama API expects startDate and endDate
            const end = query?.endDate ? new Date(query.endDate) : new Date();
            const start = query?.lastSyncTimestamp
                ? new Date(query.lastSyncTimestamp)
                : new Date(end.getTime() - 24 * 60 * 60 * 1000); // Fallback to last 24 hours if no sync date

            // [eslesme-fiyat WP4, 02-ekler/pazarama C-14 / D-PZ-8] aralık en çok 30 günlük dilimlere bölünür ([İKİNCİL]: StartDate/
            // EndDate ≤31 gün). Eskiden `lastSyncTimestamp→now` sınırsızdı: uzun kesinti sonrası API reddi/kesik sonuç riski.
            const rawOrders: any[] = [];
            let incomplete: ReturnType<typeof getIncomplete>;
            for (const w of splitWindows(start, end, PZ_ORDER_WINDOW_MS)) {
                const part = await this.connector.fetchOrdersFromPlatform({ startDate: w.start.toISOString(), endDate: w.end.toISOString() });
                incomplete ??= getIncomplete(part);
                rawOrders.push(...part);
            }
            if (incomplete) markIncomplete(rawOrders, { reason: incomplete.reason, collected: rawOrders.length });

            return carryIncomplete(rawOrders, this.mapper.toInternalOrderPackages(this.dropMissingIdentity(rawOrders)));
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaOrderService:fetchOrders] ${error.message}`);
        }
    }

    /**
     * [INT-05 / conformance C7b, playbook §4.2] Sipariş kimliği (OrderNumber/OrderId) olmayan kayıt boş kimlikle SESSİZCE kaydedilmez:
     * atlanır + loglanır (Trendyol C22 / HB deseni); kayıtların TÜMÜ (>= DRIFT_MIN_RECORDS) kimliksizse şema kayması varsayılıp VALIDATION fırlatılır.
     * `carryIncomplete` ham diziden okunur (işaret ham dizidedir); filtreli dizi yalnız mapper'a gider.
     */
    private dropMissingIdentity(raw: any[]): any[] {
        const valid = raw.filter(o => !!(o?.OrderNumber || o?.orderNumber || o?.OrderId || o?.orderId));
        const skipped = raw.length - valid.length;
        if (skipped === 0) return raw;
        log.error('ORDERSERVICE_PZ_SIPARIS_KIMLIGI_EKSIK', `${skipped}/${raw.length} Pazarama sipariş kaydı kimlik (OrderNumber/OrderId) eksikliği nedeniyle ATLANDI (şema kayması olabilir).`);
        if (raw.length >= DRIFT_MIN_RECORDS && valid.length === 0) {
            throw new IntegrationError('VALIDATION',
                `Pazarama sipariş yanıtı beklenen kimlik alanlarını taşımıyor (${raw.length}/${raw.length} kayıt geçersiz; şema kayması şüphesi).`,
                { integrationCode, operation: 'fetchOrders', clientId: this.clientId, platformCode: 'ORDER_SCHEMA_DRIFT' });
        }
        return valid;
    }

    public async rejectOrder(externalOrderId: string, params: IOrderRejectParams): Promise<boolean> {
        try {
            // Pazarama dökümanına göre satıcı tarafından reddedilen (stok yok vb.) siparişler 13 (Tedarik Edilemedi) statüsüne alınmalıdır.
            // [eslesme-fiyat WP4, D-PZ-9] Kalem verilmemişse TÜM kalemler `updateOrderStatusList` ile tek istekte (eski fallback
            // `orderItemId = externalOrderId` kesin hatalıydı); kalem verilmişse yalnız o kalemler (kısmi tedarik edememe).
            const items = (params?.lineItems || []).filter((i: any) => i?.externalLineId);
            if (items.length === 0) {
                await this.connector.updateOrderStatusList(externalOrderId, 13);
            } else {
                for (const item of items) {
                    await this.connector.updateOrderStatus(externalOrderId, item.externalLineId, 13);
                }
            }
            return true;
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaOrderService:rejectOrder] ${error.message}`);
        }
    }

    public async sendOrderShipping(payload: ISendTrackingPayload): Promise<IPlatformResponse> {
        try {
            // Pazarama Rule: Must be in status 12 (Preparing) before status 5 (Shipped)
            // We can check metadata if we have it, or just attempt a transition if not sure.
            // For now, we'll implement a robust check or sequential call if the omurga doesn't handle states.

            // If the external status is 3, we MUST move it to 12 first.
            if (payload.meta?.currentExternalStatus === '3' || payload.meta?.status === 3 || payload.meta?.orderStatus === 3) {
                // [eslesme-fiyat WP4, D-PZ-9] tüm kalemler tek istekte 12'ye (eski: yalnız ilk kalem / orderId fallback)
                await this.connector.updateOrderStatusList(payload.orderId, 12);
            }

            return await this.connector.sendOrderShipping(payload);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaOrderService:sendOrderShipping] ${error.message}`);
        }
    }

    /** [eslesme-fiyat WP4, D-PZ-9] Onay: siparişin tüm kalemleri `updateOrderStatusList` ile 12'ye (tek istek). */
    public async approveOrder(orderNumber: string): Promise<boolean> {
        try {
            return await this.connector.updateOrderStatusList(orderNumber, 12);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaOrderService:approveOrder] ${error.message}`);
        }
    }

    public async updateOrderPackageStatus(orderNumber: string, externalLineItemId: string, targetStatus: OrderInternalStatusEnum): Promise<boolean> {
        try {
            let pazaramaStatus = 3;
            if (targetStatus === OrderInternalStatusEnum.APPROVED) pazaramaStatus = 12;
            if (targetStatus === OrderInternalStatusEnum.SHIPPED) pazaramaStatus = 5;
            if (targetStatus === OrderInternalStatusEnum.DELIVERED) pazaramaStatus = 11;
            if (targetStatus === OrderInternalStatusEnum.CANCELLED) pazaramaStatus = 6;

            return await this.connector.updateOrderStatus(orderNumber, externalLineItemId, pazaramaStatus);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaOrderService:updateOrderPackageStatus] ${error.message}`);
        }
    }

    public async sendOrderInvoice(payload: ISendInvoicePayload): Promise<IPlatformResponse> {
        try {
            return await this.connector.sendOrderInvoice(payload);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaOrderService:sendOrderInvoice] ${error.message}`);
        }
    }

    public async retrieveOrderRejectionReasons(): Promise<any[]> {
        return [
            { id: '1', title: 'Stokta Yok' },
            { id: '2', title: 'Hatalı Fiyat' },
            { id: '3', title: 'Müşteri Talebi' },
            { id: '4', title: 'Diğer' }
        ];
    }
}
