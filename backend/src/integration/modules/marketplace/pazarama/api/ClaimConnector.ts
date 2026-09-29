import { IClaimRejectParams, IPlatformResponse } from '@interfaces/index';
import Service from '../services/Service';
import { fromHttpError } from '@integration/modules/common/IntegrationError';
import { integrationCode } from '../constants';

export class ClaimConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchClaimsFromPlatform(query?: any): Promise<any> {
        const baseUrl = this.params.integrationSettings?.urls?.claimListUrl || 'order/getRefund';
        
        const formatDate = (date: any) => {
            if (!date) return undefined;
            if (typeof date === 'string') return date;
            const d = new Date(date);
            return d.toISOString().replace('T', ' ').substring(0, 19);
        };

        // Pazarama expects POST with pagination and filters
        const payload = {
            pageNumber: query?.page || 1,
            pageSize: query?.size || 100,
            refundStatus: query?.status,
            requestStartDate: formatDate(query?.startDate),
            requestEndDate: formatDate(query?.endDate),
            ...query
        };

        // [ADR-0006 1f] POST kullanır ama semantik olarak iade listesi sorgusudur (okuma) -> idempotent:true.
        const response = await this.service.post(baseUrl, payload, { idempotent: true, operation: 'fetchClaimsFromPlatform' });

        console.log(`[PazaramaClaimConnector] URL: ${baseUrl} | Payload: ${JSON.stringify(payload)} | Received: ${response?.data?.data?.refundList?.length || 0} claims`);

        return response?.data;
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

    public async sendToReview(externalClaimId: string, reviewType: number, description: string, documents?: any[]): Promise<IPlatformResponse> {
        const baseUrl = this.params.integrationSettings?.urls?.orderUpdateRefundUrl || 'order/updateRefund';
        try {
            const body: any = {
                refundId: externalClaimId,
                status: 9, // İncelemeye Gönderme (Review)
                refundReviewType: reviewType,
                description: description
            };

            if (documents) {
                body.documentObjects = documents.map(doc => ({
                    name: doc.name,
                    bytes: doc.bytes
                }));
            }

            const response = await this.service.post(baseUrl, body);
            return {
                success: response.data?.success === true || response.data?.success === undefined,
                message: response.data?.message || "İncelemeye gönderildi.",
                platformId: externalClaimId,
                rawResponse: response.data
            };
        } catch (error: any) {
            throw fromHttpError(error, {
                integrationCode, operation: 'sendToReview', clientId: this.params.clientId, idempotent: false,
            });
        }
    }

    public async sendRevision(externalClaimId: string, description: string, documents?: any[]): Promise<IPlatformResponse> {
        const baseUrl = this.params.integrationSettings?.urls?.orderRefundRevisionUrl || 'order/api/refund/revision';
        const body: any = {
            refundId: externalClaimId,
            description,
            documentObjects: documents || []
        };
        const response = await this.service.post(baseUrl, body);
        return {
            success: response.data?.success || true,
            platformId: externalClaimId,
            rawResponse: response.data
        };
    }
}
