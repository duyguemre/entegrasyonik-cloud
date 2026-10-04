import { carryIncomplete } from '@integration/contracts/IncompleteFetch';
import { IClaimPackage, IClaimRejectionReason, IClaimRejectParams, IPlatformResponse } from '@interfaces/index';
import { ClaimConnector } from '../api/ClaimConnector';
import { ClaimMapper } from '../transformers/ClaimTransformer';
import Service from './Service';
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
            const rawClaims = await this.connector.fetchClaimsFromPlatform(query);
            return carryIncomplete(rawClaims, this.mapper.toInternalClaimPackages(rawClaims));
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaClaimService:fetchClaims] ${error.message}`);
        }
    }

    public async approveClaim(externalClaimId: string, params?: { meta?: any }): Promise<IPlatformResponse> {
        try {
            return await this.connector.approveClaim(externalClaimId, params);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaClaimService:approveClaim] ${error.message}`);
        }
    }

    public async rejectClaim(externalClaimId: string, params: IClaimRejectParams): Promise<IPlatformResponse> {
        try {
            return await this.connector.rejectClaim(externalClaimId, params);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaClaimService:rejectClaim] ${error.message}`);
        }
    }

    /**
     * Pazarama İade Red Sebepleri
     */
    public async retrieveOrderRejectionReasons(): Promise<IClaimRejectionReason[]> {
        const pazaramaReasons = [
            { id: 1, title: 'Gelen ürün bana ait değil' },
            { id: 2, title: 'Gelen ürün defolu/zarar görmüş' },
            { id: 3, title: 'Gelen ürün adedi eksik' },
            { id: 4, title: 'Gelen ürün yanlış' },
            { id: 5, title: 'Gelen ürün kullanılmış' },
            { id: 6, title: 'Gelen ürün sahte' },
            { id: 7, title: 'Gelen ürünün parçası/aksesuarı eksik' },
            { id: 8, title: 'Gönderdiğim ürün kusurlu değil' },
            { id: 9, title: 'Gönderdiğim ürün yanlış değil' },
            { id: 10, title: 'İade paketi boş geldi' },
            { id: 11, title: 'İade paketi elime ulaşmadı' },
            { id: 12, title: 'Diğer' }
        ];
        return this.mapper.toInternalClaimRejectionReasons(pazaramaReasons);
    }
}
