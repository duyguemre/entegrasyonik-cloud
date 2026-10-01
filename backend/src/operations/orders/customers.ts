import { ObjectId } from 'mongodb';
import { containsRegex, normalizePagination, pickSortField } from '@utils/search';
import type { CustomerPanelRepository } from '@database/repositories/tenant/CustomerPanelRepository';

/**
 * ADR-0024 Dalga 3 (P3-ORD): müşteri listeleme/detay/güncelleme/anonimleştirme iş kuralları.
 * Davranış `CustomerService`'in eski gövdeleriyle birebir; tenant izolasyonu `repo` (tenant DB) ile.
 */

/** [DB-02] Sıralama alanı izin listesi; bilinmeyen alan => varsayılan `createdAt`. */
export const CUSTOMER_SORT_FIELDS: readonly string[] = [
    '_id', 'createdAt', 'updatedAt', 'firstName', 'lastName', 'companyName', 'email', 'phone', 'status',
    'metrics.totalOrderCount', 'metrics.totalSpent', 'metrics.totalClaimCount', 'metrics.totalReturnAmount', 'metrics.lastOrderDate',
];

/** Müşteri listesini filtreleme, sayfalama ve temel finansal içgörülerle döner. `request`: `{ searchCustomerForm, pagination, sortBy }`. */
export async function listCustomers(repo: CustomerPanelRepository, request: any): Promise<any> {
    const {
        searchCustomerForm = {},
        pagination: rawPagination,
        sortBy: sortReq
    } = request;

    const sortField = pickSortField(sortReq?.key, CUSTOMER_SORT_FIELDS, 'createdAt').field;
    const sortOrder = sortReq?.order === 'desc' ? -1 : 1;
    const pagination = normalizePagination(rawPagination, 15); // [GV-01/MM-08] limit üst sınırı, page>=1
    const skipCount = (pagination.page - 1) * pagination.limit;

    const filterQuery: any = {};
    const data = searchCustomerForm.data || {};


    // 1. GELİŞMİŞ ARAMA (Global Search)
    if (data.globalSearch) {
        const searchRegex = containsRegex(data.globalSearch); // [GV-01] kaçışlı + uzunluk sınırlı
        filterQuery.$or = [
            { firstName: searchRegex },
            { lastName: searchRegex },
            { email: searchRegex },
            { phone: searchRegex },
            { taxNumber: searchRegex },
            { companyName: searchRegex }
        ];
    }

    // 2. FİLTRELER
    if (data.cities?.length > 0) filterQuery['addresses.city'] = { $in: data.cities };
    if (data.tags?.length > 0) filterQuery.tags = { $in: data.tags };
    if (data.status) filterQuery.status = data.status;


    // 3. AGGREGATION PIPELINE (Listeleme + Finansal Özet) — repo'da
    const { total: totalRecords, customers } = await repo.listPage(filterQuery, { [sortField]: sortOrder }, skipCount, pagination.limit);

    return {
        totalNumberOfRecords: totalRecords,
        totalNumberOfPages: Math.ceil(totalRecords / pagination.limit) || 1,
        customers
    };
}

/** Tekil müşteri kartı verisini döner (son siparişler/iadeler + finansal içgörüler). */
export async function customerDetail(repo: CustomerPanelRepository, customerId: any): Promise<any> {
    if (!customerId) throw new Error('Müşteri ID gerekli');

    const customer: any = await repo.findLeanById(customerId);
    if (!customer) throw new Error('Müşteri bulunamadı');

    // 1. Son 20 Siparişi Getir
    customer.recentOrders = await repo.recentOrders(customerId, 20);

    // 2. Son 20 İade Talebini Getir
    customer.recentClaims = await repo.recentClaims(customerId, 20);

    // 3. Finansal İçgörüleri (Insights) Hesapla
    const totalSpent = customer.metrics?.totalSpent || 0;
    const totalReturn = customer.metrics?.totalReturnAmount || 0;
    const orderCount = customer.metrics?.totalOrderCount || 0;
    const claimCount = customer.metrics?.totalClaimCount || 0;

    customer.insights = {
        ...customer.insights,
        netRevenue: totalSpent - totalReturn,
        returnRate: orderCount > 0 ? (claimCount / orderCount) * 100 : 0,
        // Basit bir skorlama mantığı (Örnek)
        customerScore: Math.max(0, Math.min(20, (orderCount * 2) - (claimCount * 5)))
    };

    return customer;
}

/** Müşteri bilgilerini günceller. */
export async function updateCustomer(repo: CustomerPanelRepository, customerId: any, updateData: any): Promise<any> {
    await repo.updateById(customerId, updateData);
    return { success: true };
}

/**
 * anonymizeCustomer — ADR-0003 adım 8 (Karar F.23): tenant'ın son kullanıcı (pazaryeri müşterisi) silme
 * talebi. Customers ve ilişkili Orders/Messages'teki KİŞİSEL alanlar GERİ DÖNDÜRÜLEMEZ şekilde sabit
 * `'[anonymized]'` ile maskelenir; Customers/Orders/Invoices KAYITLARI SİLİNMEZ (fatura/sipariş yasal
 * saklama — yalnızca kişisel alanlar maskelenir, ADR F.23).
 *
 * PII ENVANTERİ (bu görevde TARANDI; ClientMongooseSchemas.ts + model dosyaları):
 *  - Customers: firstName, lastName, companyName, taxNumber (TCKN/VKN), email, phone, addresses[].addressLine/
 *    city/state/postalCode MASKELENİR. `isEmailMasked`/`isPhoneMasked` true'ya çekilir (şema bu amaçla var).
 *  - Orders (bu müşteriye ait): customerFirstName/customerLastName, billingAddress ve shippingAddress alt
 *    alanları (firstName/lastName/companyName/taxNumber/email/phone/addressLine1/addressLine2/city/state/
 *    postalCode) MASKELENİR; financials/items/invoice/fulfillment DOKUNULMAZ (PII değil / yasal iz).
 *  - Messages (bu müşteriye ait): `externalUserName` MASKELENİR (pazaryerinden gelen müşteri adı).
 *  - Claims: TARANDI, doğrudan ad/e-posta/telefon/adres alanı YOK (yalnızca customerId referansı,
 *    fulfillment.carrier*, kargo takip bilgisi — PII değil) -> DOKUNULMAZ.
 *  - Invoices: TARANDI, doğrudan PII alanı YOK (yalnızca orderId/customerId referansı + ettn/invoiceNumber/
 *    pdfUrl) -> DOKUNULMAZ (belge kendisi zaten silinmiyor).
 *  - "BELİRSİZ" (insan kararı; maskeleme LİSTESİNE bilerek EKLENMEDİ): Message.text/answer (serbest metinde
 *    müşteri kendi adını/telefonunu yazmış olabilir — otomatik tespit güvenilir değil); Order.meta / Claim.meta
 *    (Schema.Types.Mixed, serbest pazaryeri verisi — içerik taranamadı); ExportStagedProduct/ImportStagedProduct
 *    payload'ları (ürün verisi, müşteri PII'si beklenmez ama doğrulanmadı).
 */
export async function anonymizeCustomer(repo: CustomerPanelRepository, customerId: any): Promise<any> {
    if (!customerId) throw new Error('customerId gerekli.');
    const oid = new ObjectId(customerId);
    const MASK = '[anonymized]';

    const customer: any = await repo.findLeanById(oid);
    if (!customer) throw new Error('Müşteri bulunamadı.');

    const maskedAddresses = Array.isArray(customer.addresses)
        ? customer.addresses.map((a: any) => ({ ...a, addressLine: MASK, city: MASK, state: MASK, postalCode: MASK }))
        : customer.addresses;

    await repo.updateCustomerFields(oid, {
        firstName: MASK, lastName: MASK, companyName: MASK, taxNumber: MASK,
        email: MASK, phone: MASK, isEmailMasked: true, isPhoneMasked: true,
        addresses: maskedAddresses,
    });

    const ADDRESS_FIELDS = ['firstName', 'lastName', 'companyName', 'taxNumber', 'email', 'phone', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode'];
    const orderAddressSet: Record<string, string> = { customerFirstName: MASK, customerLastName: MASK };
    for (const f of ADDRESS_FIELDS) {
        orderAddressSet[`billingAddress.${f}`] = MASK;
        orderAddressSet[`shippingAddress.${f}`] = MASK;
    }
    await repo.updateOrderFields(oid, orderAddressSet);
    await repo.updateMessageFields(oid, { externalUserName: MASK });

    return { success: true, customerId: String(oid) };
}
