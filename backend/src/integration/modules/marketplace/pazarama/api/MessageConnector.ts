import Service from '../services/Service';

export class MessageConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchMessageDetail(questionId: string): Promise<any> {
        const urlTemplate = this.params.integrationSettings?.urls?.qnaQuestionIdUrl || 'QuestionAnswer/getApprovalAnswerById?questionId=<QUESTIONID>';
        const url = urlTemplate.replace('<QUESTIONID>', questionId);
        const response = await this.service.get(url);
        return response?.data;
    }

    public async answerMessage(questionId: string, answerText: string): Promise<boolean> {
        const baseUrl = this.params.integrationSettings?.urls?.qnaSellerAnswerUrl || 'QuestionAnswer/sellerAnswer';
        await this.service.put(baseUrl, { questionId, text: answerText });
        return true;
    }

    public async searchMessages(query: any): Promise<any> {
        const baseUrl = this.params.integrationSettings?.urls?.qnaAnswersUrl || 'QuestionAnswer/getApprovalAnswersByMerchantSearch';
        // [ADR-0006 1f] POST kullanır ama semantik olarak arama/listeleme sorgusudur (okuma) -> idempotent:true.
        const response = await this.service.post(baseUrl, query, { idempotent: true, operation: 'searchMessages' });
        return response?.data;
    }
}
