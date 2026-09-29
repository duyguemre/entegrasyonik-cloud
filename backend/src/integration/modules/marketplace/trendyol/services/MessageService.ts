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

    public static getInstance(params: any, service: Service): MessageService {
        return new MessageService(params, service);
    }

    public async retrieveMessages(query?: any): Promise<IMessage[]> {
        try {
            const rawMessages = await this.connector.fetchMessages(query);
            return this.transformer.toInternalMessages(rawMessages);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            if (error.message.includes(`[${this.clientId}]`)) throw error;
            throw new Error(`[${this.clientId}][MessageService:retrieveMessages] ${error.message}`);
        }
    }

    public async answerMessage(externalMessageId: string, answerText: string): Promise<boolean> {
        try {
            return await this.connector.answerMessage(externalMessageId, answerText);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            if (error.message.includes(`[${this.clientId}]`)) throw error;
            throw new Error(`[${this.clientId}][MessageService:answerMessage] ${error.message}`);
        }
    }
}
