import { IClaimRejectParams, IPlatformResponse } from '@interfaces/index';
import Service from '../services/Service';
import { fromHttpError } from '@integration/modules/common/IntegrationError';
import { integrationCode } from '../constants';
import { paginatePage } from './paginatePage';
import { eventLog } from '@platform/core/logger';

const log = eventLog('adapter-pazarama', 'ClaimConnector');

export class ClaimConnector {
    constructor(private service: Service, private params: any) { }

    /** Tüm iade sayfalarını dolaşır (bkz. paginatePage) ve ham iade kayıtlarının DİZİSİNİ döner (tavanda `markIncomplete` işaretli). */
    public async fetchClaimsFromPlatform(query?: any): Promise<any[]> {
        const baseUrl = this.params.integrationSettings?.urls?.claimListUrl || 'order/getRefund';

        const formatDate = (date: any) => {
            if (!date) return undefined;
            if (typeof date === 'string') return date;
            const d = new Date(date);
            return d.toISOString().replace('T', ' ').substring(0, 19);
        };

        return paginatePage(async (page, limit) => {
            // Pazarama expects POST with pagination and filters
            const payload = {
                refundStatus: query?.status,
                requestStartDate: formatDate(query?.startDate),
                requestEndDate: formatDate(query?.endDate),
                ...query,
                pageNumber: page,
                pageSize: limit,
            };

            // [ADR-0006 1f] POST kullanır ama semantik olarak iade listesi sorgusudur (okuma) -> idempotent:true.
            const response = await this.service.post(baseUrl, payload, { idempotent: true, operation: 'fetchClaimsFromPlatform' });
            const body = response?.data;
            const list = body?.data?.refundList || body?.refundList || (Array.isArray(body) ? body : []);
            log.info('CLAIMCONNECTOR_URL_PAYLOAD_RECEIVED_CLAIMS', `Pazarama iade listesi alindi: ${list?.length || 0} kayit`);
            return Array.isArray(list) ? list : [];
        }, {
            operation: 'fetchClaimsFromPlatform', clientId: this.params.clientId,
            startPage: Number(query?.pageNumber ?? query?.page) || 1, limit: Number(query?.pageSize ?? query?.size) || undefined,
        });
    }

    public async approveClaim(externalClaimId: string, params?: any): Promise<IPlatformResponse> {
        const baseUrl = this.params.integrationSettings?.urls?.orderUpdateRefundUrl || 'order/updateRefund';
        try {
            const body = {
                refundId: externalClaimId,
                status: 2 // Tedarikçi Tarafından Onaylandı
            };
            const response = await this.service.post(baseUrl, body);
            return {
                success: response.data?.success === true || response.data?.success === undefined,
                message: response.data?.message || "İade onaylandı.",
                platformId: externalClaimId,
                rawResponse: response.data
            };
        } catch (error: any) {
            throw fromHttpError(error, {
                integrationCode, operation: 'approveClaim', clientId: this.params.clientId, idempotent: false,
            });
        }
    }

    public async rejectClaim(externalClaimId: string, params: IClaimRejectParams): Promise<IPlatformResponse> {
        const baseUrl = this.params.integrationSettings?.urls?.orderUpdateRefundUrl || 'order/updateRefund';
        try {
            const body: any = {
                refundId: externalClaimId,
                status: 3, // Tedarikçi Tarafından Reddedildi
                RefundRejectType: Number(params.reasonId || 12), // Default to "Diğer" if not mapped
                description: params.description || "Reddedildi"
            };

            // If documents (images) are provided, Pazarama allows them in the same updateRefund call
            if (params.documents && Array.isArray(params.documents)) {
                body.documentObjects = params.documents.map((doc: any) => ({
                    name: doc.name || "image.png",
                    bytes: doc.base64 || doc.bytes
                }));
            }

            const response = await this.service.post(baseUrl, body);
            return {
                success: response.data?.success === true || response.data?.success === undefined,
                message: response.data?.message || "İade reddedildi.",
                platformId: externalClaimId,
                rawResponse: response.data
            };
        } catch (error: any) {
            throw fromHttpError(error, {
                integrationCode, operation: 'rejectClaim', clientId: this.params.clientId, idempotent: false,
            });
        }
    }

    // [eslesme-fiyat WP6-kalan, D-PZ-10] `sendToReview` (updateRefund status:9) ve `sendRevision` (order/api/refund/revision)
    // KALDIRILDI: IPlatform'a bağlı değildi (ulaşılamaz), alanları hiçbir dış kaynakta yok (02-ekler/pazarama C-16:
    // "canlıda denenmemeli"). Kanıtlanırsa IPlatform metoduyla yeniden eklenir.
}
