import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import { containsRegex, normalizePagination } from '@utils/search'

/**
 * CustomerService
 * Müşteri yönetimi, CRM analitiği ve platformlar arası kimlik çözümleme mantığını yönetir.
 */
export default class CustomerService extends BaseApi implements IService {

    async get(): Promise<any> {
        // Standart IService gereksinimi (Gerektiğinde tekil get için doldurulabilir)
    }

    /**
     * getCustomers
     * Müşteri listesini filtreleme, sayfalama ve temel finansal içgörülerle döner.
     */
    async getCustomers(): Promise<any> {
        try {
            const {
                searchCustomerForm = {},
                pagination: rawPagination,
                sortBy: sortReq
            } = this.request;

            const sortField = sortReq?.key || 'createdAt';
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


            // 3. AGGREGATION PIPELINE (Listeleme + Finansal Özet)
            const result = await this.clientDB.getCustomerModel().aggregate([
                { $match: filterQuery },
                {
                    $facet: {
                        metadata: [{ $count: 'total' }],
                        data: [
                            { $sort: { [sortField]: sortOrder } },
                            { $skip: skipCount },
                            { $limit: pagination.limit },
                            {
                                $addFields: {
                                    // İade Oranı Hesaplama (%)
                                    returnRate: {
                                        $cond: [
                                            { $gt: ["$metrics.totalOrderCount", 0] },
                                            { $multiply: [{ $divide: ["$metrics.totalClaimCount", "$metrics.totalOrderCount"] }, 100] },
                                            0
                                        ]
                                    },
                                    // Net Kazanç (Brüt Harcama - İadeler)
                                    netRevenue: {
                                        $subtract: [
                                            { $ifNull: ["$metrics.totalSpent", 0] },
                                            { $ifNull: ["$metrics.totalReturnAmount", 0] }
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                }
            ]);

            const totalRecords = result[0].metadata[0]?.total || 0;

            return {
                totalNumberOfRecords: totalRecords,
                totalNumberOfPages: Math.ceil(totalRecords / pagination.limit) || 1,
                customers: result[0].data
            };

        } catch (error) {
            console.error('[CustomerService] getCustomers Hatası:', error);
            throw error;
        }
    }

    /**
     * getCustomerDetail
     * Tekil müşteri kartı verisini döner.
     */
    async getCustomerDetail(): Promise<any> {
        try {
            const { customerId } = this.request;
            if (!customerId) throw new Error('Müşteri ID gerekli');

            const customer: any = await this.clientDB.getCustomerModel().findById(customerId).lean();
            if (!customer) throw new Error('Müşteri bulunamadı');

            // 1. Son 20 Siparişi Getir
            customer.recentOrders = await this.clientDB.getOrderModel()
                .find({ customerId: new ObjectId(customerId) })
                .sort({ createdAt: -1 })
                .limit(20)
                .lean();

            // 2. Son 20 İade Talebini Getir
            customer.recentClaims = await this.clientDB.getClaimModel()
                .find({ customerId: new ObjectId(customerId) })
                .sort({ createdAt: -1 })
                .limit(20)
                .lean();

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
        } catch (error) {
            console.error('[CustomerService] getCustomerDetail Hatası:', error);
            throw error;
        }
    }

    /**
     * updateCustomer
     * Müşteri bilgilerini günceller.
     */
    async updateCustomer(): Promise<any> {
        try {
            const { customerId, updateData } = this.request;
            await this.clientDB.getCustomerModel().findByIdAndUpdate(customerId, updateData);
            return { success: true };
        } catch (error) {
            console.error('[CustomerService] updateCustomer Hatası:', error);
            throw error;
        }
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
    async anonymizeCustomer(): Promise<any> {
        try {
            const { customerId } = this.request;
            if (!customerId) throw new Error('customerId gerekli.');
            const oid = new ObjectId(customerId);
            const MASK = '[anonymized]';

            const customer: any = await this.clientDB.getCustomerModel().findById(oid).lean();
            if (!customer) throw new Error('Müşteri bulunamadı.');

            const maskedAddresses = Array.isArray(customer.addresses)
                ? customer.addresses.map((a: any) => ({ ...a, addressLine: MASK, city: MASK, state: MASK, postalCode: MASK }))
                : customer.addresses;

            await this.clientDB.getCustomerModel().updateOne({ _id: oid }, {
                $set: {
                    firstName: MASK, lastName: MASK, companyName: MASK, taxNumber: MASK,
                    email: MASK, phone: MASK, isEmailMasked: true, isPhoneMasked: true,
                    addresses: maskedAddresses,
                },
            });

            const ADDRESS_FIELDS = ['firstName', 'lastName', 'companyName', 'taxNumber', 'email', 'phone', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode'];
            const orderAddressSet: Record<string, string> = { customerFirstName: MASK, customerLastName: MASK };
            for (const f of ADDRESS_FIELDS) {
                orderAddressSet[`billingAddress.${f}`] = MASK;
                orderAddressSet[`shippingAddress.${f}`] = MASK;
            }
            await this.clientDB.getOrderModel().updateMany({ customerId: oid }, { $set: orderAddressSet });
            await this.clientDB.getMessageModel().updateMany({ customerId: oid }, { $set: { externalUserName: MASK } });

            return { success: true, customerId: String(oid) };
        } catch (error) {
            console.error('[CustomerService] anonymizeCustomer Hatası:', error);
            throw error;
        }
    }
}