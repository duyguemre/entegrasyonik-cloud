import { IClaimPackage, IOrderRejectionReason, IClaimRejectParams, IPlatformResponse } from '@interfaces/index';
import { ClaimConnector } from '../api/ClaimConnector';
import { ClaimMapper } from '../transformers/ClaimTransformer';
import { Service } from './Service';
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

    public async fetchClaims(query?: Record<string, any>): Promise<IClaimPackage[]> {
        try {
            const rawResponse = await this.connector.fetchClaimsFromPlatform(query);
            return this.mapper.toInternalClaimPackages(rawResponse);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][HepsiburadaClaimService:fetchClaims] ${error.message}`);
        }
    }

    public async approveClaim(externalClaimId: string, params?: { meta?: any }): Promise<IPlatformResponse> {
        try {
            return await this.connector.approveClaim(externalClaimId, params);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][HepsiburadaClaimService:approveClaim] ${error.message}`);
        }
    }

    public async rejectClaim(externalClaimId: string, params: IClaimRejectParams): Promise<IPlatformResponse> {
        try {
            return await this.connector.rejectClaim(externalClaimId, params);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][HepsiburadaClaimService:rejectClaim] ${error.message}`);
        }
    }

    public async retrieveOrderRejectionReasons(): Promise<IOrderRejectionReason[]> {
        const hepsiburadaReasons = [
            { id: 'CustomerReturnedWrongItem', title: 'Yanlış ürün gönderilmiş' },
            { id: 'ProductIsDamaged', title: 'Ürün hasarlı' },
            { id: 'MissingQuantity', title: 'Eksik ürün' },
            { id: 'NoSuchAccessory', title: 'Aksesuar eksik' },
            { id: 'BoxIsEmptyWithReport', title: 'Kutu boş (Tutanaklı)' },
            { id: 'Other', title: 'Diğer' }
        ];
        return this.mapper.toInternalClaimRejectionReasons(hepsiburadaReasons);
    }
}
