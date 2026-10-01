import { ObjectId } from 'mongodb';
import { IClientDB } from '@interfaces/index';
import { CustomerRepository } from '@database/repositories/tenant/CustomerRepository';
import { OrderRepository } from '@database/repositories/tenant/OrderRepository';
import { ClaimRepository } from '@database/repositories/tenant/ClaimRepository';
import { MessageRepository } from '@database/repositories/tenant/MessageRepository';
import { containsRegex, normalizePagination, pickSortField } from '@utils/search';

/** ADR-0024 P3-ORD: müşteri (CRM) listeleme, kart, güncelleme ve anonimleştirme; eski `CustomerService` gövdesi, davranış BİREBİR. */

/** [DB-02] Sıralama alanı izin listesi; bilinmeyen alan => varsayılan `createdAt`. */
export const CUSTOMER_SORT_FIELDS: readonly string[] = [
    '_id', 'createdAt', 'updatedAt', 'firstName', 'lastName', 'companyName', 'email', 'phone', 'status',
    'metrics.totalOrderCount', 'metrics.totalSpent', 'metrics.totalClaimCount', 'metrics.totalReturnAmount', 'metrics.lastOrderDate',
];

/** Müşteri listesi: filtre, sayfalama ve temel finansal içgörüler (iade oranı, net kazanç). */
export async function searchCustomers(clientDB: IClientDB, request: any) {
    const { searchCustomerForm = {}, pagination: rawPagination, sortBy: sortReq } = request;
    const sortField = pickSortField(sortReq?.key, CUSTOMER_SORT_FIELDS, 'createdAt').field;
    const sortOrder = sortReq?.order === 'desc' ? -1 : 1;
    const pagination = normalizePagination(rawPagination, 15); // [GV-01/MM-08] limit üst sınırı, page>=1
    const skipCount = (pagination.page - 1) * pagination.limit;

    const filterQuery: any = {};
    const data = searchCustomerForm.data || {};
    if (data.globalSearch) {
        const searchRegex = containsRegex(data.globalSearch); // [GV-01] kaçışlı + uzunluk sınırlı
        filterQuery.$or = [
            { firstName: searchRegex }, { lastName: searchRegex }, { email: searchRegex },
            { phone: searchRegex }, { taxNumber: searchRegex }, { companyName: searchRegex },
        ];
    }
    if (data.cities?.length > 0) filterQuery['addresses.city'] = { $in: data.cities };
    if (data.tags?.length > 0) filterQuery.tags = { $in: data.tags };
    if (data.status) filterQuery.status = data.status;

    const result = await new CustomerRepository(clientDB).pagedSearch(filterQuery, { [sortField]: sortOrder }, skipCount, pagination.limit);
    const totalRecords = result[0].metadata[0]?.total || 0;
    return {
        totalNumberOfRecords: totalRecords,
        totalNumberOfPages: Math.ceil(totalRecords / pagination.limit) || 1,
        customers: result[0].data,
    };
}

/** Müşteri kartı: son 20 sipariş + son 20 iade + finansal içgörü (net gelir, iade oranı, basit skor). */
export async function getCustomerDetail(clientDB: IClientDB, customerId: any) {
    if (!customerId) throw new Error('Müşteri ID gerekli');
    const customer: any = await new CustomerRepository(clientDB).findByIdLean(customerId);
    if (!customer) throw new Error('Müşteri bulunamadı');

    customer.recentOrders = await new OrderRepository(clientDB).recentByCustomer(new ObjectId(customerId));
    customer.recentClaims = await new ClaimRepository(clientDB).recentByCustomer(new ObjectId(customerId));

    const totalSpent = customer.metrics?.totalSpent || 0;
    const totalReturn = customer.metrics?.totalReturnAmount || 0;
    const orderCount = customer.metrics?.totalOrderCount || 0;
    const claimCount = customer.metrics?.totalClaimCount || 0;
    customer.insights = {
        ...customer.insights,
        netRevenue: totalSpent - totalReturn,
        returnRate: orderCount > 0 ? (claimCount / orderCount) * 100 : 0,
        customerScore: Math.max(0, Math.min(20, (orderCount * 2) - (claimCount * 5))),
    };
    return customer;
}

export async function updateCustomer(clientDB: IClientDB, customerId: unknown, updateData: unknown) {
    await new CustomerRepository(clientDB).updateById(customerId, updateData);
    return { success: true };
}

/**
 * anonymizeCustomer — ADR-0003 adım 8 (Karar F.23): tenant'ın son kullanıcı (pazaryeri müşterisi) silme talebi. Customers ve
 * ilişkili Orders/Messages'teki KİŞİSEL alanlar GERİ DÖNDÜRÜLEMEZ şekilde sabit `'[anonymized]'` ile maskelenir;
 * Customers/Orders/Invoices KAYITLARI SİLİNMEZ (fatura/sipariş yasal saklama — yalnızca kişisel alanlar maskelenir).
 *
 * PII ENVANTERİ (ClientMongooseSchemas.ts + model dosyaları):
 *  - Customers: firstName, lastName, companyName, taxNumber (TCKN/VKN), email, phone, addresses[].addressLine/city/state/postalCode
 *    MASKELENİR; `isEmailMasked`/`isPhoneMasked` true'ya çekilir.
 *  - Orders (bu müşteriye ait): customerFirstName/customerLastName, billingAddress ve shippingAddress alt alanları MASKELENİR;
 *    financials/items/invoice/fulfillment DOKUNULMAZ (PII değil / yasal iz).
 *  - Messages (bu müşteriye ait): `externalUserName` MASKELENİR.
 *  - Claims / Invoices: doğrudan PII alanı YOK -> DOKUNULMAZ.
 *  - "BELİRSİZ" (insan kararı; bilerek EKLENMEDİ): Message.text/answer serbest metni; Order.meta / Claim.meta (Mixed);
 *    Export/ImportStagedProduct payload'ları.
 */
export async function anonymizeCustomer(clientDB: IClientDB, customerId: any) {
    if (!customerId) throw new Error('customerId gerekli.');
    const oid = new ObjectId(customerId);
    const MASK = '[anonymized]';
    const customers = new CustomerRepository(clientDB);

    const customer: any = await customers.findByIdLean(oid);
    if (!customer) throw new Error('Müşteri bulunamadı.');

    const maskedAddresses = Array.isArray(customer.addresses)
        ? customer.addresses.map((a: any) => ({ ...a, addressLine: MASK, city: MASK, state: MASK, postalCode: MASK }))
        : customer.addresses;
    await customers.setFields(oid, {
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
    await new OrderRepository(clientDB).maskByCustomer(oid, orderAddressSet);
    await new MessageRepository(clientDB).maskUserNameByCustomer(oid, MASK);

    return { success: true, customerId: String(oid) };
}
