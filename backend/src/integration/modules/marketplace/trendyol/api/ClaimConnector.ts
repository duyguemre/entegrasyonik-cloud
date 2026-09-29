// api/ClaimConnector.ts
import { IClaimRejectParams, IPlatformResponse } from '@interfaces/index';
import Service from '../services/Service';
import { fromHttpError } from '@integration/modules/common/IntegrationError';
import { integrationCode } from '../constants';
import { TRENDYOL_CLAIMS_LIST_CONTRACT } from '../contracts/claims.list';

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
            if (firstResponse?.data?.content) {
                allClaims.push(...firstResponse.data.content);
                const totalPages = firstResponse.data.totalPages || 1;

                // 2. DİĞER SAYFALARI PARALEL ÇEK (p-limit desteği ile)
                if (totalPages > 1) {
                    const promises = [];
                    // Trendyol'da page index 0'dan başlar, o yüzden 1'den başlıyoruz
                    for (let p = 1; p < totalPages; p++) {
                        const pageParams = new URLSearchParams(params);
                        pageParams.set('page', p.toString());

                        promises.push(this.service.get(`${baseUrl}?${pageParams.toString()}`, undefined, { contract: TRENDYOL_CLAIMS_LIST_CONTRACT }));
                    }

                    // Promise.all, Service içindeki rate-limit (p-limit) korumasına tabidir
                    const results = await Promise.all(promises);

                    results.forEach(res => {
                        if (res?.data?.content) {
                            allClaims.push(...res.data.content);
                        }
                    });
                }
            }

            console.log(`[ClaimConnector] Toplam ${allClaims.length} adet iade çekildi.`);
            return allClaims;

        } catch (error: any) {
            // [ADR-0006 adım 3] ÖNCEKİ DAVRANIŞ hata yutup [] dönmekti (bkz.
            // tests/characterization/stubs/Trendyol.errorSwallow.stub.test.ts). Artık IntegrationError fırlatılır.
            console.error("[ClaimConnector] Trendyol'dan iadeler çekilemedi:", error.message);
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
            console.error("[ClaimConnector] Trendyol iptal nedenleri çekilemedi:", error.message);
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
            if (ids.length === 0) console.warn(`[ClaimConnector] approveClaim(${externalClaimId}): claimItemIdList verilmedi; boş gövde gönderiliyor (V2 gövdesi claimLineItemIdList ister).`);
            const response = await this.service.put(url, ids.length ? { claimLineItemIdList: ids, params: {} } : {});

            return {
                success: response.status >= 200 && response.status < 300,
                message: "İade onaylandı.",
                platformId: externalClaimId,
                rawResponse: response.data
            };
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || error.message;
            console.error(`[ClaimConnector] Trendyol iade onay hatası (${externalClaimId}):`, errorMsg);
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
            console.error(`[ClaimConnector] Trendyol claim reddi hatası (${externalClaimId}):`, errorMsg);
            return {
                success: false,
                message: errorMsg,
                platformId: externalClaimId,
                rawResponse: error.response?.data
            };
        }
    }
}
