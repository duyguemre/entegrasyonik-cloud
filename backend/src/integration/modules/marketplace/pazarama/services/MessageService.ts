import { IMessage } from '@interfaces/index';
import { MessageConnector } from '../api/MessageConnector';
import { MessageTransformer } from '../transformers/MessageTransformer';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

/** Detay zenginleştirmede eşzamanlı istek tavanı (F-P2-3: eskiden her soru için sınırsız Promise.all). */
const DETAIL_CONCURRENCY = 5;

/** Liste kaydında soru metni zaten varsa detay GET'ine gerek yok. */
const hasQuestionText = (q: any): boolean => !!(q?.Question || q?.question);

export class MessageService {
    private connector: MessageConnector;
    private transformer: MessageTransformer;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new MessageConnector(this.service, this.params);
        this.transformer = new MessageTransformer();
    }

    /**
     * [eslesme-fiyat WP6-kalan, D-PZ-13] Liste kanıtlı `QuestionAnswer/getApprovalAnswersByMerchantSearch` POST'undan
     * (02-ekler/pazarama C-17; eski GET `getApprovalAnswersByMerchant` dış kaynakta kanıtsız). Detay GET'i yalnız soru metni
     * eksik kayıtlar için ve en çok DETAIL_CONCURRENCY eşzamanlı.
     */
    public async retrieveMessages(query?: any): Promise<IMessage[]> {
        try {
            const rawResponse = await this.connector.searchMessages(query || {});

            // Veri yapısı API'den { data: { approvalAnswersByMerchantSearchs: [...] } } şeklinde dönebilir.
            const dataObj = rawResponse?.data || rawResponse;

            const questions: any[] = dataObj?.ApprovalAnswersByMerchantSearchs || dataObj?.approvalAnswersByMerchantSearchs ||
                dataObj?.ApprovalAnswersByMerchant || dataObj?.approvalAnswersByMerchant || (Array.isArray(dataObj) ? dataObj : []);

            const out: IMessage[] = new Array(questions.length);
            for (let i = 0; i < questions.length; i += DETAIL_CONCURRENCY) {
                const batch = questions.slice(i, i + DETAIL_CONCURRENCY);
                const mapped = await Promise.all(batch.map(q => this.enrich(q)));
                mapped.forEach((m, j) => { out[i + j] = m; });
            }
            return out;
        } catch (error: any) {

            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaMessageService:retrieveMessages] ${error.message}`);
        }
    }

    /** Liste kaydı eksikse (metin yok) detayı çekip dönüştürür; detay başarısızsa liste verisiyle devam eder. */
    private async enrich(q: any): Promise<IMessage> {
        if (hasQuestionText(q)) return this.transformer.toInternalMessage(q);
        try {
            const detailResponse = await this.connector.fetchMessageDetail(q.questionId ?? q.QuestionId);
            const detail = detailResponse?.data || detailResponse;
            return this.transformer.toInternalMessage(detail);
        } catch {
            return this.transformer.toInternalMessage(q);
        }
    }

    public async answerMessage(externalMessageId: string, answerText: string): Promise<boolean> {
        try {
            return await this.connector.answerMessage(externalMessageId, answerText);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaMessageService:answerMessage] ${error.message}`);
        }
    }
}
