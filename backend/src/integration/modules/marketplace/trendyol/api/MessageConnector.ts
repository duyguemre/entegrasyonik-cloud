import Service from '../services/Service';
import { fromHttpError } from '@integration/modules/common/IntegrationError';
import { integrationCode } from '../constants';
import { eventLog } from '@platform/core/logger';

const log = eventLog('adapter-trendyol', 'MessageConnector');

export class MessageConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchMessages(query?: any): Promise<any[]> {
        const settings = this.params.integrationSettings;
        const sellerId = settings?.settings?.SELLERID;

        // Trendyol URL formatı: qna/sellers/<SELLERID>/questions/filter
        const baseUrl = settings.urls.qnaListUrl.replace("<SELLERID>", sellerId);

        const params = new URLSearchParams({ size: '50' });
        if (query) {
            Object.keys(query).forEach(key => {
                if (query[key]) {
                    let value = query[key];

                    // 1. KRİTİK DÜZELTME: Tarih Formatı
                    // Trendyol Order API de startDate/endDate için Milisaniye (Timestamp) bekler.
                    // ISO String gelirse Trendyol 400 hatası döner.
                    if (key === 'startDate' || key === 'endDate') {
                        const dateValue = new Date(value);
                        if (!isNaN(dateValue.getTime())) {
                            value = dateValue.getTime().toString();
                        }
                    }

                    // 2. KRİTİK DÜZELTME: Statü Parametresi
                    // Bizim sistemde 'status' gelir, ama Trendyol 'status' (küçük harf) 
                    // veya paket bazlı sorgularda farklı isimler bekleyebilir.
                    // Genellikle 'status' doğrudur ancak URL parametrelerinde tutarlılık önemlidir.
                    params.append(key, value);
                }
            });
        }

        try {
            const response = await this.service.get(`${baseUrl}?${params.toString()}`);
            // Trendyol response formatı: { content: [], ... }
            return response?.data?.content || [];
        } catch (error: any) {
            // [ADR-0006 adım 3] ÖNCEKİ DAVRANIŞ hata yutup [] dönmekti. Artık IntegrationError fırlatılır.
            log.error('MESSAGECONNECTOR_TRENDYOL_DAN_MESAJLAR_CEKILEMEDI', "Trendyol'dan mesajlar çekilemedi:", { err: error });
            throw fromHttpError(error, {
                integrationCode, operation: 'fetchMessages', clientId: this.params.clientId, idempotent: true,
            });
        }
    }

    public async answerMessage(externalMessageId: string, answerText: string): Promise<boolean> {
        try {
            const settings = this.params.integrationSettings;
            const sellerId = settings?.settings?.SELLERID;

            // URL formatı: qna/sellers/<SELLERID>/questions/<QID>/answers
            const url = settings.urls.qnaAnswerUrl
                .replace("<SELLERID>", sellerId)
                .replace("<QID>", externalMessageId);

            const response = await this.service.post(url, { text: answerText });
            return response.status >= 200 && response.status < 300;
        } catch (error: any) {
            log.error('MESSAGECONNECTOR_TRENDYOL_MESAJ_CEVAPLAMA_HATASI', `Trendyol mesaj cevaplama hatası (${externalMessageId}):`, { err: error });
            throw fromHttpError(error, {
                integrationCode, operation: 'answerMessage', clientId: this.params.clientId, idempotent: false,
            });
        }
    }
}
