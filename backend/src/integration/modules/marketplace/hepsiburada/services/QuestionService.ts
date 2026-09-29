import { Service } from './Service';
import { QuestionMapper } from '../transformers/QuestionTransformer';
import { IMessage } from '@interfaces/index';

export class QuestionService {
    private mapper: QuestionMapper;

    constructor(
        private params: any,
        private service: Service
    ) {
        this.mapper = new QuestionMapper();
    }

    public async fetchQuestions(query?: any): Promise<IMessage[]> {
        const merchantId = this.params.integrationSettings.settings.SELLERID;
        // Hepsiburada hem ürün soruları hem sipariş mesajları için aynı endpoint'i kullanıyor olabilir mock tarafında
        const response = await this.service.get(`questions/merchantid/${merchantId}`, query);
        return this.mapper.toInternalMessages(response?.data || {});
    }

    public async answerMessage(questionId: string, answerText: string): Promise<boolean> {
        const merchantId = this.params.integrationSettings.settings.SELLERID;
        const response = await this.service.post(`questions/merchantid/${merchantId}/answers`, {
            questionId,
            answer: answerText
        });
        return !!response?.data;
    }
}
