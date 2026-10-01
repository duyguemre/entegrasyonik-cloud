import { ApplicationError } from '@platform/core/security/Security'
import { containsRegex, clampPage, clampLimit } from '@utils/search'
import type { FinancialPanelRepository } from '@database/repositories/tenant/FinancialPanelRepository'

/** getCargoInvoices tek yanıtta en fazla bu kadar satır döner (en yeni önce). */
export const CARGO_INVOICES_MAX_ROWS = 5000

const EMPTY_TOTALS = { totalCredit: 0, totalDebt: 0, totalCargo: 0, netAmount: 0, transactionCount: 0 }

/** Ekstre/özet ortak filtresi: platform, işlem tipi, işlem no araması, tarih aralığı. */
function transactionFilter(r: any): Record<string, any> {
    const { startDate, endDate, integrationCodes, transactionTypes, externalIdSearch } = r;
    const filterQuery: any = {};

    // Çoklu platform filtresi
    if (integrationCodes && integrationCodes.length > 0) {
        filterQuery.integrationCode = { $in: integrationCodes };
    }

    // Çoklu işlem tipi filtresi
    if (transactionTypes && transactionTypes.length > 0) {
        filterQuery.transactionType = { $in: transactionTypes };
    }

    // İşlem No (externalId) araması
    if (externalIdSearch) {
        filterQuery.externalId = containsRegex(externalIdSearch); // [GV-01]
    }

    // Tarih Aralığı Filtresi
    if (startDate || endDate) {
        filterQuery.transactionDate = {};
        if (startDate) filterQuery.transactionDate.$gte = new Date(startDate);
        if (endDate) filterQuery.transactionDate.$lte = new Date(endDate);
    }
    return filterQuery;
}

/**
 * Ana ekstre listesi: filtre + sıralama + sayfa + toplamlar. Çağıranın (handler) hata ayıklama günlüğü için `filterQuery`
 * de döner; yanıt gövdesi `{ transactions, totalNumberOfRecords, summary }`'dir.
 */
export async function queryTransactions(repo: FinancialPanelRepository, request: any) {
    const { page: rawPage, limit: rawLimit, sortBy } = request;
    const filterQuery = transactionFilter(request);

    // Sıralama
    const sortQuery: any = {};
    if (sortBy && sortBy.length > 0) {
        sortBy.forEach((s: any) => {
            sortQuery[s.key] = s.order === 'asc' ? 1 : -1;
        });
    } else {
        sortQuery.transactionDate = -1;
    }

    const page = clampPage(rawPage); // [GV-01/MM-08]
    const limit = clampLimit(rawLimit, 20);
    const skip = (page - 1) * limit;

    const [totalNumberOfRecords, transactions, summary] = await repo.transactionPage(filterQuery, sortQuery, skip, limit);

    return {
        filterQuery,
        transactions,
        totalNumberOfRecords,
        summary: summary[0] ?? { ...EMPTY_TOTALS }
    };
}

/** Kargo bazlı mutabakat listesi. */
export async function cargoInvoices(repo: FinancialPanelRepository, request: any): Promise<any> {
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

    return await repo.cargoInvoices(filterQuery, CARGO_INVOICES_MAX_ROWS);
}

/** Dashboard kartları: frontend'deki aktif filtrelerle aynı koşullarda tek grup toplam. */
export async function financialSummary(repo: FinancialPanelRepository, request: any): Promise<any> {
    const matchQuery = transactionFilter(request);

    // Tek bir grup olarak tüm filtrelenmiş kayıtların toplamı
    const result = await repo.totals(matchQuery);

    // Sonuç yoksa sıfır değerleri döndür
    return result[0] ?? { ...EMPTY_TOTALS };
}

/** Ödeme emri (vade) bazlı hareketler. */
export async function payoutDetails(repo: FinancialPanelRepository, request: any): Promise<any> {
    const { paymentOrderId } = request;
    if (!paymentOrderId) throw new Error("Ödeme emri ID (paymentOrderId) gereklidir.");
    // [API_TENANT_SURFACE §6] yalnızca skaler kimlik: nesne ({$ne:null} vb. operatör) ile tüm ödeme kayıtlarını listeleme engellenir
    if (typeof paymentOrderId !== 'string' && typeof paymentOrderId !== 'number') throw new ApplicationError("paymentOrderId geçersiz.", 400);

    return await repo.payoutTransactions(paymentOrderId);
}
