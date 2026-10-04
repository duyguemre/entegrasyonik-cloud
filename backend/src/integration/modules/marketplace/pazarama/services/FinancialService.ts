import { IFinancialTransaction, ICargoInvoice } from '@interfaces/platforms';
import { FinancialConnector } from '../api/FinancialConnector';
import { FinancialMapper } from '../transformers/FinancialMapper';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { eventLog } from '@platform/core/logger';

const log = eventLog('engine', 'PazaramaFinancialService');

/**
 * `finance/getotherfinancials` ucu dış kaynakta kanıtsız (02-ekler/pazarama C-17). Uç yok/gövde reddi (NOT_FOUND,
 * NOT_SUPPORTED, VALIDATION) ödeme mutabakatını (paymentAgreement) DÜŞÜRMEZ: uyarı loglanır, yalnız o kısım boş kalır.
 * Geçici hatalar (RATE_LIMITED/UNAVAILABLE/AUTH...) fırlatılır → iş yeniden dener, imleç ilerlemez.
 */
const OTHER_FINANCIALS_SOFT_CODES = new Set(['NOT_FOUND', 'NOT_SUPPORTED', 'VALIDATION']);

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
            const transactions = this.mapper.toInternalTransactions(rawAgreements);
            // [eslesme-fiyat WP6-kalan, D-PZ-12] diğer finansal hareketler (kesinti faturası, ödeme emri, iade faturası…)
            transactions.push(...await this.fetchOtherFinancials(query));
            return transactions;
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaFinancialService:fetchFinancials] ${error.message}`);
        }
    }

    private async fetchOtherFinancials(query: any): Promise<IFinancialTransaction[]> {
        try {
            const raw = await this.connector.fetchOtherFinancials({ startDate: query.startDate, endDate: query.endDate });
            return this.mapper.toInternalOtherFinancials(raw);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error) && OTHER_FINANCIALS_SOFT_CODES.has(error.code)) {
                log.warn('PAZARAMA_OTHERFINANCIALS_ATLANDI', `otherfinancials alınamadı (${error.code}); yalnız ödeme mutabakatı yazılır.`, { clientId: this.clientId });
                return [];
            }
            throw error;
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
