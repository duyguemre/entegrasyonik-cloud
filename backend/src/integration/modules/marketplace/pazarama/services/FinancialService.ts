import { IFinancialTransaction, ICargoInvoice } from '@interfaces/platforms';
import { FinancialConnector } from '../api/FinancialConnector';
import { FinancialMapper } from '../transformers/FinancialMapper';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class FinancialService {
    private connector: FinancialConnector;
    private mapper: FinancialMapper;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new FinancialConnector(this.service, this.params);
        this.mapper = new FinancialMapper();
    }

    public async fetchFinancials(query: any): Promise<IFinancialTransaction[]> {
        try {
            const rawAgreements = await this.connector.fetchPaymentAgreements(query);
            return this.mapper.toInternalTransactions(rawAgreements);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaFinancialService:fetchFinancials] ${error.message}`);
        }
    }

    public async fetchCargoInvoices(invoiceSerialNumber: string): Promise<ICargoInvoice[]> {
        try {
            const rawData = await this.connector.fetchCargoInvoiceDetails(invoiceSerialNumber);
            return this.mapper.toInternalCargoInvoices(rawData, invoiceSerialNumber);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaFinancialService:fetchCargoInvoices] ${error.message}`);
        }
    }
}
