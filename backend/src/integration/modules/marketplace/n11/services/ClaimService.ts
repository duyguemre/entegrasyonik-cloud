import { IClaimRejectParams, IPlatformResponse } from '@interfaces/index';
import { ReturnConnector } from '../api/AuxiliaryConnectors';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class ClaimService {
    private connector: ReturnConnector;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new ReturnConnector(this.service, this.params);
    }

    public async fetchClaims(query?: Record<string, any>): Promise<any[]> {
        try {
            const payload = {
                'sch:searchData': {
                    status: 'REQUESTED'
                },
                'sch:pagingData': {
                    currentPage: 0,
                    pageSize: 100
                }
            };
            const response = await this.connector.claimReturnList(payload);
            
            const claims = response.claimReturnList?.claimReturn || [];
            return Array.isArray(claims) ? claims : [claims];
        } catch (error: any) {
             if (IntegrationError.isIntegrationError(error)) throw error;
             throw new Error(`[${this.clientId}][N11ClaimService:fetchClaims] ${error.message}`);
        }
    }

    public async approveClaim(externalClaimId: string, params?: { meta?: any }): Promise<IPlatformResponse> {
        try {
            const payload = {
                'sch:claimCancelId': externalClaimId
            };
            await this.connector.claimReturnApprove(payload);
            return { success: true };
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11ClaimService:approveClaim] ${error.message}`);
        }
    }

    public async rejectClaim(externalClaimId: string, params: IClaimRejectParams): Promise<IPlatformResponse> {
        try {
            const payload = {
                'sch:claimCancelId': externalClaimId,
                'sch:claimRejectReasonId': params.reasonId,
                'sch:claimRejectReasonNote': params.description || ''
            };
            await this.connector.claimReturnReject(payload);
            return { success: true };
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11ClaimService:rejectClaim] ${error.message}`);
        }
    }
}
