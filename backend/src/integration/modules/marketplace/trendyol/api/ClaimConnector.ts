// api/ClaimConnector.ts
import { IClaimRejectParams, IPlatformResponse } from '@interfaces/index';
import Service from '../services/Service';
import { fromHttpError } from '@integration/modules/common/IntegrationError';
import { integrationCode } from '../constants';
import { TRENDYOL_CLAIMS_LIST_CONTRACT } from '../contracts/claims.list';
import { eventLog } from '@platform/core/logger';
import { markIncomplete } from '@integration/contracts/IncompleteFetch';
import { TRENDYOL_CLAIM_PAGING } from '../limits';

const log = eventLog('adapter-trendyol', 'ClaimConnector');

export class ClaimConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchClaimsFromPlatform(query?: any): Promise<any[]> {
        const settings = this.params.integrationSettings;
        const sellerId = settings?.settings?.SELLERID;
        // Trendyol URL formatı genellikle: .../suppliers/<SELLERID>/claims
        const baseUrl = settings.urls.claimListUrl.replace("<SELLERID>", sellerId);

        const allClaims: any[] = [];
        const params = new URLSearchParams({ page: '0', size: '50' });

        // ==========================================
        // TRENDYOL ÖZEL PARAMETRE MAPPING
        // ==========================================
        if (query) {
            Object.keys(query).forEach(key => {
                if (query[key]) {
                    let value = query[key];

                    // KRİTİK: Tarih dönüşümü (Trendyol milisaniye bekler)
                    // startDate veya endDate gelirse bunları Number'a (timestamp) çeviriyoruz
                    if (key === 'startDate' || key === 'endDate') {
                        const dateValue = new Date(value);
                        if (!isNaN(dateValue.getTime())) {
                            value = dateValue.getTime().toString();
                        }
                    }

                    // Statü filtresi (Trendyol claimItemStatus bekler)
                    // Eğer query'den 'status' gelirse onu 'claimItemStatus'a mapliyoruz
                    const mappedKey = key === 'status' ? 'claimItemStatus' : key;

                    params.append(mappedKey, value);
                }
            });
        }

        try {
            // 1. İLK SAYFA ÇEKİMİ
            // [ADR-0018 Karar 2a] `contract` YALNIZ gözlem amaçlıdır; istek/yanıt akışı AYNI kalır.
            const firstResponse = await this.service.get(`${baseUrl}?${params.toString()}`, undefined, { contract: TRENDYOL_CLAIMS_LIST_CONTRACT });

            // Trendyol response'u genellikle { content: [], totalPages: x, ... } şeklindedir
            let incomplete: { reason: 'PAGINATION_PAGE_CAP' | 'PAGINATION_REPEATED_PAGE' } | undefined;
            if (firstResponse?.data?.content) {
                allClaims.push(...firstResponse.data.content);
                const reportedPages = Number(firstResponse.data.totalPages) || 1;
                // [INT-05] Sunucunun bildirdiği totalPages'e güvenilmez: tavan + sınırlı eşzamanlılık + tekrar sayfa tespiti.
                const totalPages = Math.min(reportedPages, TRENDYOL_CLAIM_PAGING.maxPages);
                const seen = new Set<string>([JSON.stringify(firstResponse.data.content)]);

                // 2. DİĞER SAYFALARI SINIRLI EŞZAMANLILIKLA (gruplar halinde) ÇEK; grup içi sonuçlar sayfa sırasıyla işlenir.
                // Ara sayfa hatası yutulmaz (Promise.all reddi -> aşağıdaki catch -> IntegrationError).
                for (let start = 1; start < totalPages && !incomplete; start += TRENDYOL_CLAIM_PAGING.concurrency) {
                    const end = Math.min(start + TRENDYOL_CLAIM_PAGING.concurrency, totalPages);
                    const batch: Promise<any>[] = [];
                    for (let p = start; p < end; p++) {
                        const pageParams = new URLSearchParams(params);
                        pageParams.set('page', p.toString());
                        batch.push(this.service.get(`${baseUrl}?${pageParams.toString()}`, undefined, { contract: TRENDYOL_CLAIMS_LIST_CONTRACT }));
                    }
                    const results = await Promise.all(batch);

                    for (let i = 0; i < results.length; i++) {
                        const content = results[i]?.data?.content;
                        if (!content) continue;
                        const sig = JSON.stringify(content);
                        if (content.length && seen.has(sig)) {
                            incomplete = { reason: 'PAGINATION_REPEATED_PAGE' };
                            log.warn('PAGINATION_REPEATED_PAGE', 'Trendyol iade sayfası tekrar etti; sonuç eksik olabilir.', { clientId: this.params.clientId, page: start + i, collected: allClaims.length });
                            break;
                        }
                        seen.add(sig);
                        allClaims.push(...content);
                    }
                }

                if (!incomplete && reportedPages > totalPages) {
                    incomplete = { reason: 'PAGINATION_PAGE_CAP' };
                    log.warn('PAGINATION_PAGE_CAP', 'Trendyol iade sayfa tavanına ulaşıldı; sonuç eksik olabilir.', { clientId: this.params.clientId, maxPages: TRENDYOL_CLAIM_PAGING.maxPages, reportedPages, collected: allClaims.length });
                }
            }

            if (incomplete) markIncomplete(allClaims, { reason: incomplete.reason, collected: allClaims.length });

            log.info('CLAIMCONNECTOR_TOPLAM_ADET_IADE_CEKILDI', `Toplam ${allClaims.length} adet iade çekildi.`);
            return allClaims;

        } catch (error: any) {
            // [ADR-0006 adım 3] ÖNCEKİ DAVRANIŞ hata yutup [] dönmekti (bkz.
            // tests/characterization/stubs/Trendyol.errorSwallow.stub.test.ts). Artık IntegrationError fırlatılır.
            log.error('CLAIMCONNECTOR_TRENDYOL_DAN_IADELER_CEKILEMEDI', "Trendyol'dan iadeler çekilemedi:", { err: error });
            throw fromHttpError(error, {
                integrationCode, operation: 'fetchClaimsFromPlatform', clientId: this.params.clientId, idempotent: true,
            });
        }
    }

    public async retrieveOrderRejectionReasons(): Promise<any[]> {
        try {
            const settings = this.params.integrationSettings;
            const sellerId = settings?.settings?.SELLERID;
            const url = settings.urls.claimRejectionReasonsUrl;
            const response = await this.service.get(url);
            return response?.data || [];
        } catch (error: any) {
            // [ADR-0006 adım 3]
            log.error('CLAIMCONNECTOR_TRENDYOL_IPTAL_NEDENLERI_CEKILEMEDI', "Trendyol iptal nedenleri çekilemedi:", { err: error });
            throw fromHttpError(error, {
                integrationCode, operation: 'retrieveOrderRejectionReasons', clientId: this.params.clientId, idempotent: true,
            });
        }
    }

    public async approveClaim(externalClaimId: string, params?: { meta?: any; claimItemIdList?: string[] }): Promise<IPlatformResponse> {
        try {
            const settings = this.params.integrationSettings;
            const sellerId = settings?.settings?.SELLERID;

            const url = settings.urls.claimApproveUrl
                .replace("<SELLERID>", sellerId)
                .replace("<CLAIMID>", externalClaimId);

            // [C22 2026-09-28] Resmi gövde (spec §1/§7): { claimLineItemIdList: [...], params: {} }. ESKİ gövde: {}.
            // Kalem kimliği verilmemişse (eski çağıranlar) ESKİ boş gövde korunur ve uyarı basılır (Trendyol 400 dönebilir).
            const ids = (params?.claimItemIdList || []).map(String).filter(Boolean);
            if (ids.length === 0) log.warn('CLAIMCONNECTOR_APPROVECLAIM_CLAIMITEMIDLIST_VERILMEDI_BO', `approveClaim(${externalClaimId}): claimItemIdList verilmedi; boş gövde gönderiliyor (V2 gövdesi claimLineItemIdList ister).`);
            const response = await this.service.put(url, ids.length ? { claimLineItemIdList: ids, params: {} } : {});

            return {
                success: response.status >= 200 && response.status < 300,
                message: "İade onaylandı.",
                platformId: externalClaimId,
                rawResponse: response.data
            };
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || error.message;
            log.error('CLAIMCONNECTOR_TRENDYOL_IADE_ONAY_HATASI', `Trendyol iade onay hatası (${externalClaimId}):`, { detail: errorMsg });
            return {
                success: false,
                message: errorMsg,
                platformId: externalClaimId,
                rawResponse: error.response?.data
            };
        }
    }

    public async rejectClaim(externalClaimId: string, params: IClaimRejectParams): Promise<IPlatformResponse> {
        try {
            const settings = this.params.integrationSettings;
            const sellerId = settings?.settings?.SELLERID;

            const url = settings.urls.claimRejectUrl
                .replace("<SELLERID>", sellerId)
                .replace("<CLAIMID>", externalClaimId)
                .replace("<CLAIMISSUEREASONID>", params.reasonId)
                .replace("<CLAIMITEMIDLIST>", params.claimItemIdList.join(','))
                .replace("<DESCRIPTION>", params.description || '');

            const response = await this.service.post(url, {});

            return {
                success: response.status === 200 || response.status === 204,
                message: "İade reddedildi.",
                platformId: externalClaimId,
                rawResponse: response.data
            };
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || error.message;
            log.error('CLAIMCONNECTOR_TRENDYOL_CLAIM_REDDI_HATASI', `Trendyol claim reddi hatası (${externalClaimId}):`, { detail: errorMsg });
            return {
                success: false,
                message: errorMsg,
                platformId: externalClaimId,
                rawResponse: error.response?.data
            };
        }
    }
}
