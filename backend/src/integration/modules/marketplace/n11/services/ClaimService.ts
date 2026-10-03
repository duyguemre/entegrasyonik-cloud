import { IClaimRejectParams, IPlatformResponse } from '@interfaces/index';
import { ReturnConnector } from '../api/AuxiliaryConnectors';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { ClaimMapper } from '../transformers/ClaimMapper';
import { paginatePage, readTotal } from '../api/paginatePage';

/** [eslesme-fiyat WP4, D-N11-7] ReturnService sayfa boyutu: resmî depo okuması 20 kayıt/sayfa. */
export const N11_CLAIM_PAGE_SIZE = 20;

export class ClaimService {
    private connector: ReturnConnector;
    private mapper = new ClaimMapper();
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new ReturnConnector(this.service, this.params);
    }

    /**
     * [eslesme-fiyat WP4, D-N11-7 (P0)] ÖNCEKİ: yalnız ilk sayfa (100) ve HAM kayıt (mapper yok → OrderWorker işleyemiyordu).
     * YENİ: 20'lik sayfalarla tüm sayfalar (ortak `paginate`: tekrar-sayfa koruması + tavanda `markIncomplete`) ve
     * `ClaimMapper` ile `IClaimPackage`. Durum süzgeci `REQUESTED` korunur (motor yeni talepleri işler).
     */
    public async fetchClaims(_query?: Record<string, any>): Promise<any[]> {
        try {
            const raw = await paginatePage(async (page, limit) => {
                const response = await this.connector.claimReturnList({
                    'sch:searchData': { status: 'REQUESTED' },
                    'sch:pagingData': { currentPage: page, pageSize: limit },
                });
                const list = response?.claimReturnList?.claimReturn;
                const items = list === undefined || list === null ? [] : Array.isArray(list) ? list : [list];
                return { items, total: readTotal(response?.pagingData?.totalCount) };
            }, { operation: 'fetchClaims', clientId: this.clientId, limit: N11_CLAIM_PAGE_SIZE });
            return this.mapper.toInternalClaimPackages(raw);
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
