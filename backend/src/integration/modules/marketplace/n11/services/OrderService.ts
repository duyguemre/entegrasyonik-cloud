import { IOrderPackage, IOrderRejectParams, IPlatformResponse, ISendInvoicePayload, ISendTrackingPayload, OrderInternalStatusEnum } from '@interfaces/index';
import { OrderConnector } from '../api/OrderConnector';
import { OrderMapper } from '../transformers/OrderMapper';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { integrationCode } from '../constants';

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
            // Try REST first
            try {
                const response = await this.connector.fetchOrdersRest({
                    pageSize: 100,
                    currentPage: 0
                });
                // [N11 REST şekil düzeltmesi, 2026-09-29] TERS ÇEVRİLDİ: ÖNCEKİ kontrol `response.shipmentPackages`
                // idi — kaynak (`n11APISoapREFERANSDOKUMANTASYONU_v9_0.docx` §3.7 GetShipmentPackages) gerçek REST
                // 200 yanıtının `{totalElements, content:[...]}` şeklinde olduğunu, `shipmentPackages` alanının
                // HİÇ var olmadığını gösteriyor — kontrol HER ZAMAN false'du, REST dalı hiç tetiklenmiyordu ve
                // SESSİZCE (log yok) SOAP'a düşülüyordu (bkz. karakterizasyon: N11.resilience.contract.test.ts).
                if (Array.isArray(response?.content)) {
                    return this.mapper.toInternalOrderPackagesFromRest(response);
                }
                // Beklenmeyen/tanınmayan REST şekli: sessizce yutulmaz — görünür kılınır, SOAP'a bilinçli düşülür.
                console.warn(`[N11OrderService:fetchOrders] REST yanıtı beklenen şekilde değil (content[] yok), SOAP'a düşülüyor. Yanıt anahtarları: ${Object.keys(response ?? {}).join(',') || '(boş)'}`);
            } catch (e: any) {
                // [ADR-0006 Karar 2] TERS ÇEVRİLDİ: ÖNCEKİ DAVRANIŞ her REST hatasında (AUTH/VALIDATION
                // dahil) sessizce SOAP'a düşerdi. Yedek yol yalnızca UNAVAILABLE/NOT_SUPPORTED'ta ve
                // LOGLANARAK kullanılır; AUTH/VALIDATION'da yedeğe düşülmez, hata doğrudan fırlatılır.
                const code = IntegrationError.isIntegrationError(e) ? e.code : undefined;
                if (code !== 'UNAVAILABLE' && code !== 'NOT_SUPPORTED') throw e;
                console.warn(`[N11OrderService:fetchOrders] REST başarısız (${code}), SOAP'a düşülüyor: ${e.message}`);
            }

            // N11 API requires search parameters. We default to the last 24 hours.
            const startDate = query?.lastSyncTimestamp
                ? new Date(query.lastSyncTimestamp)
                : new Date(Date.now() - 24 * 60 * 60 * 1000);

            const endDate = new Date();

            const formatDate = (date: Date) => {
                return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
            };

            const payload = {
                'sch:searchData': {
                    period: {
                        startDate: formatDate(startDate),
                        endDate: formatDate(endDate)
                    }
                }
            };

            const response = await this.connector.fetchOrdersFromPlatform(payload);
            return this.mapper.toInternalOrderPackages(response);

        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11OrderService:fetchOrders] ${error.message}`);
        }
    }

    /**
     * [ADR-0006 adım 4] TERS ÇEVRİLDİ (BACKLOG C9 sahte başarı): ÖNCEKİ DAVRANIŞ hiçbir SOAP/REST
     * çağrısı yapmadan `true` dönüyordu (bkz. tests/characterization/stubs/N11.approveReject.stub.test.ts).
     * Gerçek N11 sipariş reddi (ClaimReturn/ShipmentPackage reddi) uç noktası uygulanana kadar
     * NOT_SUPPORTED fırlatılır.
     */
    public async rejectOrder(externalOrderId: string, params: IOrderRejectParams): Promise<boolean> {
        throw new IntegrationError('NOT_SUPPORTED', 'N11 sipariş reddi henüz gerçek olarak uygulanmadı.', {
            integrationCode, operation: 'rejectOrder', clientId: this.clientId,
        });
    }

    public async sendOrderShipping(payload: ISendTrackingPayload): Promise<IPlatformResponse> {
        try {
            const soapPayload = {
                'sch:orderItemShipment': {
                    orderItemId: payload.lineItems?.[0]?.externalLineItemId || payload.orderId,
                    shipmentCompany: {
                        name: payload.carrierName || 'Yurtiçi Kargo'
                    },
                    campaignNumber: payload.trackingCode,
                    trackingNumber: payload.trackingCode,
                    shipmentMethod: '1'
                }
            };

            await this.connector.makeOrderItemShipment(soapPayload);
            return { success: true };
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11OrderService:sendOrderShipping] ${error.message}`);
        }
    }

    /**
     * [ADR-0006 adım 4] TERS ÇEVRİLDİ (BACKLOG C9 sahte başarı): ÖNCEKİ DAVRANIŞ hiçbir SOAP/REST
     * çağrısı yapmadan `true` dönüyordu (N11.approveOrder bu metoda delege eder). Gerçek N11 sipariş
     * onay/paketleme uç noktası uygulanana kadar NOT_SUPPORTED fırlatılır.
     */
    public async updateOrderPackageStatus(orderNumber: string, externalLineItemId: string, targetStatus: OrderInternalStatusEnum): Promise<boolean> {
        throw new IntegrationError('NOT_SUPPORTED', 'N11 sipariş paket statü güncelleme (onay) henüz gerçek olarak uygulanmadı.', {
            integrationCode, operation: 'updateOrderPackageStatus', clientId: this.clientId,
        });
    }

    public async sendOrderInvoice(payload: ISendInvoicePayload): Promise<IPlatformResponse> {
        try {
            const soapPayload = {
                'sch:orderNumber': payload.orderId,
                'sch:url': payload.pdfUrl
            };
            await this.connector.saveLinkSellerInvoice(soapPayload);
            return { success: true };
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11OrderService:sendOrderInvoice] ${error.message}`);
        }
    }

    public async retrieveOrderRejectionReasons(): Promise<any[]> {
        return [
            { id: 'OUT_OF_STOCK', title: 'Stokta Yok' }
        ];
    }
}
