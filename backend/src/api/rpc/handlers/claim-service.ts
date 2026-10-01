import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import * as claims from '@operations/orders/claims'

/**
 * ADR-0024 P3-ORD: iade/talep RPC cephesi. İş akışları `operations/orders/claims`, sorgular
 * `database/repositories/tenant/ClaimRepository` (RPC adları ve yanıt biçimleri değişmez).
 */
export default class ClaimService extends BaseApi implements IService {

    private get deps(): claims.ClaimDeps {
        return { clientDB: this.clientDB, clientId: this.currentClientId }
    }

    async get(): Promise<any> {
        // İleride tekil iade/talep detayı çekmek için
    }

    /** İADELERİ/TALEPLERİ LİSTELEME */
    async getClaims(): Promise<any> {
        try {
            return await claims.searchClaims(this.clientDB, this.request.searchClaimForm)
        } catch (error) {
            console.error('[ClaimService] getClaims Hatası:', error);
            throw error;
        }
    }

    /** TALEP REDDİ (pazaryeri entegrasyonlu) */
    async rejectClaim(): Promise<any> {
        const { claimId } = this.request
        const { reason, reasonId } = this.request.rejectData || this.request
        return claims.rejectClaim(this.deps, claimId, reason, reasonId)
    }

    /** TALEP ONAYI (pazaryeri entegrasyonlu) */
    async approveClaim(): Promise<any> {
        return claims.approveClaim(this.deps, this.request.claimId)
    }

    /** TOPLU TALEP ONAYI */
    async bulkApproveClaim(): Promise<any> {
        return claims.bulkApproveClaim(this.deps, this.request.claimIds)
    }

    /** TEKİL TALEP (detay ekranı) */
    async getClaimById(): Promise<any> {
        return claims.getClaimById(this.clientDB, this.request.claimId)
    }
}
