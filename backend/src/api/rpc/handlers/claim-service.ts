import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ClaimPanelRepository } from '@database/repositories/tenant/ClaimPanelRepository'
import { listClaims, rejectClaim, approveClaim, bulkApproveClaims, getClaimById } from '@operations/orders/claims'
import { eventLog } from '@platform/core/logger';

const log = eventLog('api', 'claim-service');

/**
 * İade/talep RPC cephesi (ADR-0024 Dalga 3 P3-ORD). Sorgular `ClaimPanelRepository`'de, iş kuralları `operations/orders/claims`'te;
 * RPC adları ve yanıt biçimleri değişmedi. Tenant izolasyonu `this.clientDB` (tenant DB) seçimiyle.
 */
export default class ClaimService extends BaseApi implements IService {

    private get claims(): ClaimPanelRepository { return new ClaimPanelRepository(this.clientDB) }
    private get deps() { return { repo: this.claims, clientId: Number(this.currentClientId) } }

    async get(): Promise<any> {
        // İleride tekil iade/talep detayı çekmek için
    }

    /** İADELERİ/TALEPLERİ LİSTELEME */
    async getClaims(): Promise<any> {
        try {
            return await listClaims(this.claims, this.request.searchClaimForm);
        } catch (error) {
            log.error('CLAIM_GET_CLAIMS_FAILED', '[ClaimService] getClaims hatası', { err: error });
            throw error;
        }
    }

    /** TALEP REDDİ (Marketplace Entegrasyonlu & Evrensel Parametreli) */
    async rejectClaim(): Promise<any> {
        return rejectClaim(this.deps, this.request.claimId, this.request.rejectData || this.request);
    }

    /** TALEP ONAYI (Marketplace Entegrasyonlu & Meta Desteği) */
    async approveClaim(): Promise<any> {
        return approveClaim(this.deps, this.request.claimId);
    }

    /** TOPLU TALEP ONAYI */
    async bulkApproveClaim(): Promise<any> {
        return bulkApproveClaims(this.deps, this.request.claimIds);
    }

    /** TEKİL TALEP GETİRME (Detay Ekranı İçin) */
    async getClaimById(): Promise<any> {
        return getClaimById(this.claims, this.request.claimId);
    }
}
