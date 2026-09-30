// services/ClaimService.ts
import { IClaimPackage, IClaimRejectionReason, IClaimRejectParams, IPlatformResponse } from '@interfaces/index';
import { ClaimConnector } from '../api/ClaimConnector';
import { ClaimMapper } from '../transformers/ClaimTransformer';
import Service from './Service';
import { carryIncomplete } from '@integration/contracts/IncompleteFetch';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class ClaimService {
    private connector: ClaimConnector;
    private mapper: ClaimMapper;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new ClaimConnector(this.service, this.params);
        this.mapper = new ClaimMapper();
    }

    public static getInstance(params: any, service: Service): ClaimService {
        return new ClaimService(params, service);
    }

    public async fetchClaims(query?: Record<string, any>): Promise<IClaimPackage[]> {
        try {
            const rawClaims = await this.connector.fetchClaimsFromPlatform(query);
            return carryIncomplete(rawClaims, this.mapper.toInternalClaimPackages(rawClaims));
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            if (error.message.includes(`[${this.clientId}]`)) throw error;
            throw new Error(`[${this.clientId}][ClaimService:fetchClaims] ${error.message}`);
        }
    }


    public async approveClaim(externalClaimId: string, params?: { meta?: any; claimItemIdList?: string[] }): Promise<IPlatformResponse> {
        try {
            return await this.connector.approveClaim(externalClaimId, params);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            if (error.message.includes(`[${this.clientId}]`)) throw error;
            throw new Error(`[${this.clientId}][ClaimService:approveClaim] ${error.message}`);
        }
    }

    public async rejectClaim(externalClaimId: string, params: IClaimRejectParams): Promise<IPlatformResponse> {
        try {
            return await this.connector.rejectClaim(externalClaimId, params);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            if (error.message.includes(`[${this.clientId}]`)) throw error;
            throw new Error(`[${this.clientId}][ClaimService:rejectClaim] ${error.message}`);
        }
    }

    public async retrieveOrderRejectionReasons(): Promise<IClaimRejectionReason[]> {
        try {
            const rawReasons = await this.connector.retrieveOrderRejectionReasons();
            return this.mapper.toInternalClaimRejectionReasons(rawReasons);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            if (error.message.includes(`[${this.clientId}]`)) throw error;
            throw new Error(`[${this.clientId}][ClaimService:retrieveOrderRejectionReasons] ${error.message}`);
        }
    }
}