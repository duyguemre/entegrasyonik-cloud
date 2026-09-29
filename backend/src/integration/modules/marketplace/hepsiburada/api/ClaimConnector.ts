import Service from '../services/Service';
import { IPlatformResponse, IClaimRejectParams } from '@interfaces/index';

export class ClaimConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchClaimsFromPlatform(query?: any): Promise<any[]> {
        const s = this.params.integrationSettings.settings || {};
        const merchantId = s.MERCHANTID || s.merchantid || s.SELLERID || s.sellerid || s.APIKEY || s.apikey || "";
        const response = await this.service.get(`claims/merchantId/${merchantId}`, {
            limit: 100,
            offset: 0,
            ...query
        });
        return response?.data || [];
    }

    public async approveClaim(claimId: string, params?: any): Promise<IPlatformResponse> {
        const s = this.params.integrationSettings.settings || {};
        const merchantId = s.MERCHANTID || s.merchantid || s.SELLERID || s.sellerid || s.APIKEY || s.apikey || "";
        // Hepsiburada uses claimNumber usually, mapping internal claimId to that if needed
        const response = await this.service.post(`claims/merchantId/${merchantId}/approve`, {
            claimId: claimId,
            ...params
        });
        return {
            success: true,
            message: "Talep onaylandı.",
            platformId: claimId,
            rawResponse: response.data
        };
    }

    public async rejectClaim(claimId: string, params: IClaimRejectParams): Promise<IPlatformResponse> {
        const s = this.params.integrationSettings.settings || {};
        const merchantId = s.MERCHANTID || s.merchantid || s.SELLERID || s.sellerid || s.APIKEY || s.apikey || "";
        const response = await this.service.post(`claims/merchantId/${merchantId}/reject`, {
            claimId: claimId,
            rejectionReason: params.reasonId,
            rejectionStatement: params.description
        });
        return {
            success: true,
            message: "Talep reddedildi.",
            platformId: claimId,
            rawResponse: response.data
        };
    }
}
