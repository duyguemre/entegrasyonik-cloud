import { IMessage } from '@interfaces/index';
import { ProductConnector } from '../api/ProductConnector';
import { MessageMapper } from '../transformers/Mappers';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class MessageService {
    private connector: ProductConnector;
    private mapper: MessageMapper;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new ProductConnector(this.service, this.params);
        this.mapper = new MessageMapper();
    }

    public async retrieveMessages(query?: any): Promise<IMessage[]> {
        try {
            const payload = {
                'sch:productQuestionSearch': {
                    status: 'OPEN'
                },
                'sch:pagingData': {
                    currentPage: 0,
                    pageSize: 100
                }
            };
            const response = await this.connector.getProductQuestionList(payload);
            return this.mapper.toInternalMessages(response);
        } catch (error: any) {
             if (IntegrationError.isIntegrationError(error)) throw error;
             throw new Error(`[${this.clientId}][N11MessageService:retrieveMessages] ${error.message}`);
        }
    }

    public async answerMessage(externalMessageId: string, answerText: string): Promise<boolean> {
        try {
            const payload = {
                'sch:productQuestionId': externalMessageId,
                'sch:answer': answerText
            };
            await this.connector.saveProductAnswer(payload);
            return true;
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11MessageService:answerMessage] ${error.message}`);
        }
    }
}
