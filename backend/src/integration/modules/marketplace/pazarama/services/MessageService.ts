import { IMessage } from '@interfaces/index';
import { MessageConnector } from '../api/MessageConnector';
import { MessageTransformer } from '../transformers/MessageTransformer';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class MessageService {
    private connector: MessageConnector;
    private transformer: MessageTransformer;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new MessageConnector(this.service, this.params);
        this.transformer = new MessageTransformer();
    }

    public async retrieveMessages(query?: any): Promise<IMessage[]> {
        try {
            const rawResponse = await this.connector.fetchMessages(query);

            // Veri yapısı API'den { data: { approvalAnswersByMerchant: [...] } } şeklinde dönebilir.
            const dataObj = rawResponse?.data || rawResponse;

            const questions = dataObj?.ApprovalAnswersByMerchant || dataObj?.approvalAnswersByMerchant ||
                dataObj?.ApprovalAnswersByMerchantSearchs || dataObj?.approvalAnswersByMerchantSearchs || [];

            // Pazarama'nın liste servisi eksik veri (metin, barkod vb. yok) döndüğü için 
            // her bir sorunun detayını otomatik olarak çekip listeyi zenginleştiriyoruz.
            const enrichedMessages = await Promise.all(
                questions.map(async (q: any) => {
                    try {
                        const detailResponse = await this.connector.fetchMessageDetail(q.questionId);
                        const detail = detailResponse?.data || detailResponse;
                        return this.transformer.toInternalMessage(detail);
                    } catch (e) {
                        // Detay çekilemezse en azından liste verisiyle devam et
                        return this.transformer.toInternalMessage(q);
                    }
                })
            );

            return enrichedMessages;
        } catch (error: any) {

            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaMessageService:retrieveMessages] ${error.message}`);
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
