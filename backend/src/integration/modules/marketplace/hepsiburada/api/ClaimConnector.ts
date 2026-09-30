import Service from '../services/Service';
import { IPlatformResponse, IClaimRejectParams } from '@interfaces/index';
import { paginateOffset, readTotal } from './paginateOffset';

export class ClaimConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchClaimsFromPlatform(query?: any): Promise<any[]> {
        const s = this.params.integrationSettings.settings || {};
        const merchantId = s.MERCHANTID || s.merchantid || s.SELLERID || s.sellerid || s.APIKEY || s.apikey || "";
        // [faz4-int-wp1 / F-02] Tüm sayfalar dolaşılır (bkz. paginateOffset).
        const { limit: qLimit, offset: qOffset, ...rest } = query || {};
        const startOffset = Number(qOffset) || 0;
        return paginateOffset(async (fetched, limit) => {
            const response = await this.service.get(`claims/merchantId/${merchantId}`, { ...rest, limit, offset: startOffset + fetched });
            const data = response?.data;
            // Mevcut davranış: gövde dizi (mapper dizi bekler). Sarmalı biçim (items) yalnız varsa okunur.
            const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
            return { items, total: Array.isArray(data) ? undefined : readTotal(data) };
        }, { operation: 'fetchClaimsFromPlatform', clientId: this.params.clientId, limit: Number(qLimit) || undefined });
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
