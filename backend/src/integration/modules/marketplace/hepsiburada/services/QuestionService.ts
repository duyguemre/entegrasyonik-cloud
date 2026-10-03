import { Service } from './Service';
import { QuestionMapper } from '../transformers/QuestionTransformer';
import { IMessage } from '@interfaces/index';
import { carryIncomplete } from '@integration/contracts/IncompleteFetch';
import { paginateOffset, readTotal } from '../api/paginateOffset';
import { hbMerchantId } from '../constants';

export class QuestionService {
    private mapper: QuestionMapper;

    constructor(
        private params: any,
        private service: Service
    ) {
        this.mapper = new QuestionMapper();
    }

    public async fetchQuestions(query?: any): Promise<IMessage[]> {
        const merchantId = hbMerchantId(this.params.integrationSettings?.settings);
        // Hepsiburada hem ürün soruları hem sipariş mesajları için aynı endpoint'i kullanıyor olabilir mock tarafında
        // [INT-05 / F-02] ILK istek eskisiyle BIREBIR (sorgu aynen); yanit dolu/kesik gorunuyorsa sonraki sayfalar offset+limit ile (bkz. FinancialConnector).
        const raw = await paginateOffset(async (offset, limit) => {
            const response = await this.service.get(`questions/merchantid/${merchantId}`, offset === 0 ? query : { ...query, limit, offset });
            const data = response?.data;
            const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
            return { items, total: Array.isArray(data) ? undefined : readTotal(data) };
        }, { operation: 'fetchQuestions', clientId: this.params.clientId });
        return carryIncomplete(raw, this.mapper.toInternalMessages(raw));
    }

    public async answerMessage(questionId: string, answerText: string): Promise<boolean> {
        const merchantId = hbMerchantId(this.params.integrationSettings?.settings);
        const response = await this.service.post(`questions/merchantid/${merchantId}/answers`, {
            questionId,
            answer: answerText
        });
        return !!response?.data;
    }
}
