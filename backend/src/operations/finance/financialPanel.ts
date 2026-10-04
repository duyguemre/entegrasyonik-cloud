import { ApplicationError } from '@platform/core/security/Security'
import { containsRegex, clampPage, clampLimit, toInList } from '@utils/search'
import type { FinancialPanelRepository } from '@database/repositories/tenant/FinancialPanelRepository'

/** getCargoInvoices tek yanıtta en fazla bu kadar satır döner (en yeni önce). */
export const CARGO_INVOICES_MAX_ROWS = 5000

const EMPTY_TOTALS = { totalCredit: 0, totalDebt: 0, totalCargo: 0, netAmount: 0, transactionCount: 0 }

/** Ekstre sıralama izin listesi (F-P1-8; diğer modüllerdeki allowlist deseni). FE: externalId/netAmount/transactionDate/paymentOrderId. */
export const FINANCE_SORT_FIELDS: readonly string[] = [
    'transactionDate', 'payoutDate', 'netAmount', 'credit', 'debt', 'externalId', 'paymentOrderId',
    'orderNumber', 'integrationCode', 'transactionType', 'createdAt'
]

function sortQueryOf(sortBy: any): Record<string, 1 | -1> {
    const sortQuery: Record<string, 1 | -1> = {}
    if (Array.isArray(sortBy) && sortBy.length > 0) {
        for (const s of sortBy) {
            const key = s?.key
            if (typeof key !== 'string' || !FINANCE_SORT_FIELDS.includes(key)) {
                throw new ApplicationError('sortBy.key geçersiz: ' + FINANCE_SORT_FIELDS.join(', ') + ' değerlerinden biri olmalıdır.', 400)
            }
            sortQuery[key] = s.order === 'asc' ? 1 : -1
        }
    } else {
        sortQuery.transactionDate = -1
    }
    return sortQuery
}

/**
 * Kargo toplamı için CargoInvoices filtresi: ekstre filtresinin kanal + tarih kısmı (işlem tipi/işlem no kargo faturasında yok).
 * İşlem tipi filtresi kargo kesintisini (DEDUCTION) içermiyorsa kargo toplamı 0'dır (kart, seçili türlerle tutarlı kalır).
 */
function cargoFilterOf(txFilter: Record<string, any>): Record<string, any> | null {
    const types: string[] | undefined = txFilter.transactionType?.$in
    if (types && !types.includes('DEDUCTION')) return null
    if (txFilter.externalId) return null
    const f: Record<string, any> = {}
    if (txFilter.integrationCode) f.integrationCode = txFilter.integrationCode
    if (txFilter.transactionDate) f.transactionDate = txFilter.transactionDate
    return f
}

async function withCargo(repo: FinancialPanelRepository, txFilter: Record<string, any>, totals: any | undefined) {
    const cargoFilter = cargoFilterOf(txFilter)
    const totalCargo = cargoFilter ? await repo.cargoTotal(cargoFilter) : 0
    return { ...EMPTY_TOTALS, ...(totals ?? {}), totalCargo }
}

/** Ekstre/özet ortak filtresi: platform, işlem tipi, işlem no araması, tarih aralığı. */
function transactionFilter(r: any): Record<string, any> {
    const { startDate, endDate, integrationCodes, transactionTypes, externalIdSearch } = r;
    const filterQuery: any = {};

    // Çoklu platform filtresi
    const integrationCodeList = toInList(integrationCodes); // [2026-10-03] tek dize de kabul
    if (integrationCodeList) filterQuery.integrationCode = { $in: integrationCodeList };

    // Çoklu işlem tipi filtresi
    const transactionTypeList = toInList(transactionTypes);
    if (transactionTypeList) filterQuery.transactionType = { $in: transactionTypeList };

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

    // Sıralama (izin listesi; bilinmeyen anahtar 400)
    const sortQuery = sortQueryOf(sortBy);

    const page = clampPage(rawPage); // [GV-01/MM-08]
    const limit = clampLimit(rawLimit, 20);
    const skip = (page - 1) * limit;

    const [totalNumberOfRecords, transactions, summary] = await repo.transactionPage(filterQuery, sortQuery, skip, limit);

    return {
        filterQuery,
        transactions,
        totalNumberOfRecords,
        summary: await withCargo(repo, filterQuery, summary[0])
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

    // Sonuç yoksa sıfır değerleri döndür; kargo CargoInvoices'tan
    return await withCargo(repo, matchQuery, result[0]);
}

/** Ödeme emri (vade) bazlı hareketler. */
export async function payoutDetails(repo: FinancialPanelRepository, request: any): Promise<any> {
    const { paymentOrderId } = request;
    if (!paymentOrderId) throw new Error("Ödeme emri ID (paymentOrderId) gereklidir.");
    // [API_TENANT_SURFACE §6] yalnızca skaler kimlik: nesne ({$ne:null} vb. operatör) ile tüm ödeme kayıtlarını listeleme engellenir
    if (typeof paymentOrderId !== 'string' && typeof paymentOrderId !== 'number') throw new ApplicationError("paymentOrderId geçersiz.", 400);

    return await repo.payoutTransactions(paymentOrderId);
}
