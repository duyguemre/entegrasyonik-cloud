import { IBrand, IFinancialTransaction, ICargoInvoice } from '@interfaces/index';
import { SettlementConnector, ShipmentConnector } from '../api/AuxiliaryConnectors';
import { FinancialMapper } from '../transformers/Mappers';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class BrandService {
    constructor(private params: any, private service: Service) { }

    public async fetchBrands(query: any): Promise<IBrand[]> {
        return [];
    }
}

export class FinancialService {
    private connector: SettlementConnector;
    private mapper: FinancialMapper;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new SettlementConnector(this.service, this.params);
        this.mapper = new FinancialMapper();
    }

    public async fetchFinancials(query: { startDate: Date; endDate: Date; transactionTypes?: string[] }): Promise<IFinancialTransaction[]> {
        try {
             const formatDate = (date: Date) => date.toISOString().split('T')[0];

             const payload = {
                 startDate: formatDate(query.startDate),
                 endDate: formatDate(query.endDate),
                 pagingData: { currentPage: 0, pageSize: 100 }
             };

             const response = await this.connector.getSettlementList(payload);
             return this.mapper.toInternalTransactions(response);
        } catch (error: any) {
             if (IntegrationError.isIntegrationError(error)) throw error;
             throw new Error(`[${this.clientId}][N11FinancialService:fetchFinancials] ${error.message}`);
        }
    }

    public async fetchCargoInvoices(invoiceSerialNumber: string): Promise<ICargoInvoice[]> {
        return [];
    }
}

export class ShipmentService {
    private clientId: string;
    private connector: ShipmentConnector;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new ShipmentConnector(this.service, this.params);
    }

    public async fetchShipments(): Promise<any[]> {
        try {
            const response = await this.connector.fetchShipmentCompanies();
            const companies = response.shipmentCompanies?.shipmentCompany || [];
            return Array.isArray(companies) ? companies : [companies];
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11ShipmentService:fetchShipments] ${error.message}`);
        }
    }

    /**
     * [ADR-0006 adım 3] TERS ÇEVRİLDİ: ÖNCEKİ DAVRANIŞ hatayı yakalayıp sessizce `[]` dönüyordu
     * ("adres yok" ile "çekme başarısız" ayırt edilemiyordu, yasaklanmış "catch->[]" deseni).
     * Artık IntegrationError fırlatılır.
     */
    public async fetchAddresses(): Promise<any[]> {
        try {
            const response = await this.connector.fetchAddressesRest();
            return response.addresses || [];
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11ShipmentService:fetchAddresses] ${error.message}`);
        }
    }
}
