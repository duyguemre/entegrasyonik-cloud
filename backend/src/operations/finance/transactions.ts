import { IClientDB } from '@interfaces/index';
import { FinancialRepository } from '@database/repositories/tenant/FinancialRepository';
import { ApplicationError } from '@platform/core/security/Security';
import { containsRegex, clampPage, clampLimit } from '@utils/search';

/** ADR-0024 P3-ORD: finansal ekstre, kargo faturaları, özet ve ödeme emri; eski `FinancialService` gövdesi, davranış BİREBİR. */

/** getCargoInvoices tek yanıtta en fazla bu kadar satır döner (en yeni önce). */
export const CARGO_INVOICES_MAX_ROWS = 5000;

const EMPTY_SUMMARY = { totalCredit: 0, totalDebt: 0, totalCargo: 0, netAmount: 0, transactionCount: 0 };

/** Ekstre/özet ortak filtresi: kanal(lar), işlem tip(ler)i, işlem no araması, işlem tarihi aralığı. */
function transactionFilter(input: any): any {
    const { startDate, endDate, integrationCodes, transactionTypes, externalIdSearch } = input;
    const filterQuery: any = {};
    if (integrationCodes && integrationCodes.length > 0) filterQuery.integrationCode = { $in: integrationCodes };
    if (transactionTypes && transactionTypes.length > 0) filterQuery.transactionType = { $in: transactionTypes };
    if (externalIdSearch) filterQuery.externalId = containsRegex(externalIdSearch); // [GV-01]
    if (startDate || endDate) {
        filterQuery.transactionDate = {};
        if (startDate) filterQuery.transactionDate.$gte = new Date(startDate);
        if (endDate) filterQuery.transactionDate.$lte = new Date(endDate);
    }
    return filterQuery;
}

/** Ana ekstre listesi: tüm finansal hareketler (satış, iade, kesinti...) filtreli, sıralı, sayfalı + özet. */
export async function getTransactionData(clientDB: IClientDB, request: any) {
    const { page: rawPage, limit: rawLimit, sortBy } = request;
    const filterQuery = transactionFilter(request);

    const sortQuery: any = {};
    if (sortBy && sortBy.length > 0) sortBy.forEach((s: any) => { sortQuery[s.key] = s.order === 'asc' ? 1 : -1; });
    else sortQuery.transactionDate = -1;

    const page = clampPage(rawPage); // [GV-01/MM-08]
    const limit = clampLimit(rawLimit, 20);
    const skip = (page - 1) * limit;
    const [totalNumberOfRecords, transactions, summary] = await new FinancialRepository(clientDB).pagedTransactions(filterQuery, sortQuery, skip, limit);

    console.log(`[FinancialService:get] Filter: ${JSON.stringify(filterQuery)}, Found: ${transactions.length} records`);
    if (transactions.length > 0) {
        console.log(`[FinancialService:get] Sample Record Integration: ${transactions[0].integrationCode}, Type: ${transactions[0].transactionType}`);
    }
    return { transactions, totalNumberOfRecords, summary: summary[0] ?? { ...EMPTY_SUMMARY } };
}

/** Kargo faturaları (kargo bazlı mutabakat). [API_TENANT_SURFACE §6] sayfasız uç: `CARGO_INVOICES_MAX_ROWS` tavanı. */
export async function getCargoInvoices(clientDB: IClientDB, request: any) {
    const { invoiceNumber, orderNumber, integrationCode, startDate, endDate } = request;
    const filterQuery: any = {};
    if (integrationCode) filterQuery.integrationCode = integrationCode;
    if (invoiceNumber) filterQuery.invoiceNumber = invoiceNumber;
    if (orderNumber) filterQuery.orderNumber = orderNumber;
    if (startDate || endDate) {
        filterQuery.transactionDate = {};
        if (startDate) filterQuery.transactionDate.$gte = new Date(startDate);
        if (endDate) filterQuery.transactionDate.$lte = new Date(endDate);
    }
    return new FinancialRepository(clientDB).cargoInvoices(filterQuery, CARGO_INVOICES_MAX_ROWS);
}

/** Finansal özet (pano kartları); ekstreyle aynı filtre. @deprecated `getTransactionData` özeti içerir. */
export async function getFinancialSummary(clientDB: IClientDB, request: any) {
    const result = await new FinancialRepository(clientDB).summary(transactionFilter(request));
    return result[0] ?? { ...EMPTY_SUMMARY };
}

/** Ödeme emri (vade) bazlı hareketler. [API_TENANT_SURFACE §6] yalnızca skaler kimlik (operatör nesnesiyle listeleme engellenir). */
export async function getPayoutDetails(clientDB: IClientDB, paymentOrderId: unknown) {
    if (!paymentOrderId) throw new Error('Ödeme emri ID (paymentOrderId) gereklidir.');
    if (typeof paymentOrderId !== 'string' && typeof paymentOrderId !== 'number') throw new ApplicationError('paymentOrderId geçersiz.', 400);
    return new FinancialRepository(clientDB).byPaymentOrder(paymentOrderId);
}
