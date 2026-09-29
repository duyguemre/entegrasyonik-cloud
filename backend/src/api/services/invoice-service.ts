import { IService, OrderInternalStatusEnum, IPlatformResponse } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { Types } from 'mongoose'
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { containsRegex, normalizePagination } from '@utils/search';

export default class InvoiceService extends BaseApi implements IService {

    currentClientId: any
    constructor(clientId: number, protected request: any) {
        super(clientId, request)
        this.currentClientId = clientId
    }

    async get(): Promise<any> {
    }

    async createManualInvoice(): Promise<any> {
        try {
            const data = this.request.data;
            if (!data) return { success: false, message: "Fatura verisi boş olamaz." };

            const ettn = data.ettn?.trim() || `SYS-MANUAL-${Date.now()}`;

            const invoicePayload: any = {
                integrationCode: "MANUAL",
                invoiceMethod: 'MANUAL',
                ettn: ettn,
                invoiceNumber: data.invoiceNumber || '',
                type: data.type || 'SALES',
                documentType: data.documentType || 'E_ARSIV',
                status: 'APPROVED',
                totalAmount: Number(data.totalAmount) || 0,
                currency: 'TRY',
                pdfUrl: data.pdfUrl || '',
                issueDate: data.issueDate ? new Date(data.issueDate) : new Date(),
                externalOrderId: data.externalOrderId || ''
            };

            // Eğer varsa siparişle eşleştirip statüsünü Faturası Kesildi olarak güncelle
            if (data.externalOrderId) {
                const order = await this.clientDB.getOrderModel()
                    .findOne({ $or: [{ orderNumber: data.externalOrderId }, { externalOrderId: data.externalOrderId }] })
                    .lean();

                if (order) {
                    invoicePayload.orderId = order._id;
                    invoicePayload.customerId = order.customerId;
                    invoicePayload.integrationCode = order.integrationCode;

                    await this.clientDB.getOrderModel().updateOne(
                        { _id: order._id },
                        { $set: { 'flags.isInvoiceGenerated': true, 'invoice.status': 'SUCCESS' } }
                    );
                }
            }

            const InvoiceModel = this.clientDB.getInvoiceModel();
            const newInvoice = new InvoiceModel(invoicePayload);
            await newInvoice.save();

            return { success: true, message: "Fatura başarıyla sisteme kaydedildi." };

        } catch (error: any) {
            // ETTN çakışmaları vb.
            if (error.code === 11000) {
                return { success: false, message: "Bu ETTN veya Fatura no ile kayıt zaten mevcut!" };
            }
            return { success: false, message: error.message || "Fatura oluşturulurken bir hata oluştu." };
        }
    }

    async getInvoices(): Promise<any> {
        try {
            var direction = 1;
            const sortBy: any = {};
            if (this.request.sortBy != undefined) {
                direction = this.request.sortBy.order == 'asc' ? 1 : -1;
                sortBy[this.request.sortBy.key] = direction;
            } else {
                sortBy.createdAt = -1;
            }

            const filterQuery: any = {};
            
            // Filtreleme (Durum ve Tip)
            if (this.request.filters) {
                if (this.request.filters.status && this.request.filters.status.length > 0) {
                    filterQuery.status = { $in: this.request.filters.status };
                }
                if (this.request.filters.type) {
                    filterQuery.type = this.request.filters.type;
                }
                
                if (this.request.filters.startDate || this.request.filters.endDate) {
                    filterQuery.issueDate = {};
                    if (this.request.filters.startDate) filterQuery.issueDate.$gte = new Date(this.request.filters.startDate);
                    if (this.request.filters.endDate) {
                        const end = new Date(this.request.filters.endDate);
                        end.setHours(23, 59, 59, 999);
                        filterQuery.issueDate.$lte = end;
                    }
                }
            }

            // Arama Kutusu (SearchBox)
            if (this.request.search) {
                filterQuery['$or'] = [
                    { invoiceNumber: containsRegex(this.request.search) }, // [GV-01]
                    { externalOrderId: containsRegex(this.request.search) },
                    { integrationCode: containsRegex(this.request.search) }
                ];
            }

            const pagination = normalizePagination(this.request.pagination, 15); // [GV-01/MM-08] limit üst sınırı, page>=1
            const skipCount = (pagination.page - 1) * pagination.limit;
            const limitCount = pagination.limit;

            const response: any = {};
            const result = await this.clientDB.getInvoiceModel().aggregate([
                { $match: filterQuery },
                {
                    $lookup: {
                        from: 'Orders',
                        localField: 'orderId',
                        foreignField: '_id',
                        as: 'order'
                    }
                },
                { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'Customers',
                        localField: 'customerId',
                        foreignField: '_id',
                        as: 'customer'
                    }
                },
                { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
                { $sort: sortBy },
                {
                    $facet: {
                        totalNumberOfRecords: [ { $count: 'count' } ],
                        invoices: [ { $skip: skipCount }, { $limit: limitCount } ]
                    }
                }
            ]);

            const aggregationResult = result[0] || {};
            response.totalNumberOfRecords = aggregationResult.totalNumberOfRecords?.[0]?.count || 0;
            response.invoices = aggregationResult.invoices || [];
            
            return response;
        } catch (error) {
            throw error;
        }
    }

    async deleteInvoice(): Promise<any> {
        try {
            const { invoiceId } = this.request;
            if (!invoiceId) throw new Error("Fatura ID gereklidir.");

            const deleted = await this.clientDB.getInvoiceModel().findByIdAndDelete(invoiceId);
            if (!deleted) throw new Error("Fatura bulunamadı veya daha önce silinmiş.");

            // Siparişteki isInvoiceGenerated bayrağını geri al
            if (deleted.orderId) {
                await this.clientDB.getOrderModel().findByIdAndUpdate(deleted.orderId, {
                    $set: { 'flags.isInvoiceGenerated': false }
                });
            }

            return { success: true, message: "Fatura başarıyla silindi." };
        } catch (error) {
            throw error;
        }
    }

    /**
     * FATURA OLUŞTURMA / KAYDETME
     */
    async createInvoice(): Promise<any> {
        try {
            const { orderId, invoiceData } = this.request;

            const order = await this.clientDB.getOrderModel().findById(orderId);
            if (!order) throw new Error("Sipariş bulunamadı.");

            // Entegratör kontrolü (İleride konfigürasyondan okunabilir)
            const hasIntegratedProvider = false;

            if (!hasIntegratedProvider && !invoiceData) {
                return {
                    success: false,
                    action: 'OPEN_MANUAL_INVOICE_FORM',
                    message: 'Fatura bilgileri eksik. Lütfen manuel giriş yapın.'
                };
            }

            const issueDate = invoiceData?.issueDate ? new Date(invoiceData.issueDate) : new Date();
            const ettn = invoiceData?.ettn || new Types.ObjectId().toString();

            // 1. Invoices Koleksiyonuna Detaylı Kayıt
            const newInvoice = await this.clientDB.getInvoiceModel().findOneAndUpdate(
                { orderId: order._id, type: 'SALES' },
                {
                    $set: {
                        integrationCode: order.integrationCode,
                        customerId: order.customerId,
                        invoiceMethod: invoiceData?.invoiceMethod || 'MANUAL',
                        ettn: ettn,
                        invoiceNumber: invoiceData?.invoiceNumber,
                        type: 'SALES',
                        documentType: invoiceData?.documentType || 'E_ARSIV',
                        status: invoiceData?.status || 'APPROVED',
                        pdfUrl: invoiceData?.pdfUrl || invoiceData?.invoiceLink,
                        invoiceLink: invoiceData?.invoiceLink,
                        issueDate: issueDate,
                        totalAmount: order.financials?.grandTotal || order.totalPrice || 0,
                        externalOrderId: order.externalOrderId,
                        currency: order.financials?.currencyCode || 'TRY'
                    }
                },
                { upsert: true, new: true }
            );

            // 2. PAZARYERİ BİLDİRİMİ (ÖNCE)
            // Platforma gönderiyoruz, eğer hata alırsak sipariş statüsünü güncellemiyoruz.
            const platformResult = await this.syncInvoiceToPlatform(order, newInvoice);

            if (!platformResult.success) {
                return {
                    success: false,
                    message: `Fatura oluşturuldu ancak pazaryerine iletilemedi: ${platformResult.message}`,
                    data: { invoice: newInvoice }
                };
            }

            // 3. Order Kök Şeması Güncelleme (SONRA)
            // KRİTİK: Eğer sipariş zaten Kargolandı veya Teslim Edildi statüsündeyse, statüsünü geriye çekme.
            const statusUpdate: any = {
                'dates.invoicedAt': issueDate,
                invoice: {
                    invoiceMethod: newInvoice.invoiceMethod,
                    status: 'SUCCESS',
                    invoiceNumber: newInvoice.invoiceNumber,
                    ettn: newInvoice.ettn,
                    invoiceLink: newInvoice.invoiceLink,
                    invoicedAt: issueDate
                },
                'flags.isInvoiceGenerated': true
            };

            const updatedOrder = await this.clientDB.getOrderModel().findByIdAndUpdate(
                orderId,
                {
                    $set: statusUpdate,
                    $push: {
                        history: {
                            status: statusUpdate.internalStatus || order.internalStatus,
                            changedAt: new Date(),
                            description: 'Fatura oluşturuldu ve pazaryerine başarıyla iletildi.',
                            actionBy: 'USER'
                        }
                    }
                },
                { new: true }
            );

            return {
                success: true,
                message: 'Fatura başarıyla işlendi ve platforma iletildi.',
                data: { order: updatedOrder, invoice: newInvoice }
            };

        } catch (error: any) {
            if (error.code === 11000) throw new Error("Bu sipariş için zaten bir fatura kaydı mevcut.");
            throw error;
        }
    }

    /**
     * TOPLU FATURA OLUŞTURMA
     */
    async bulkCreateInvoice(): Promise<any> {
        const { orderIds } = this.request;
        if (!Array.isArray(orderIds) || orderIds.length === 0) {
            throw new Error("Lütfen işlem yapılacak en az bir sipariş seçin.");
        }

        const results = { successCount: 0, failedCount: 0, successful: [] as any[], failed: [] as any[] };
        const originalRequest = { ...this.request };

        for (const orderId of orderIds) {
            try {
                const orderRecord = await this.clientDB.getOrderModel().findById(orderId).select('orderNumber');
                const orderNumber = orderRecord?.orderNumber || orderId;

                this.request = { orderId };
                const res = await this.createInvoice();

                if (res.success) {
                    results.successful.push({ orderId, orderNumber, data: res.data.order });
                    results.successCount++;
                } else {
                    results.failed.push({ orderId, orderNumber, reason: res.message });
                    results.failedCount++;
                }
            } catch (error: any) {
                results.failed.push({ orderId, reason: error.message });
                results.failedCount++;
            }
        }

        this.request = originalRequest;
        // [DÜZELTME, 2026-09-29, ADR-0016 B-R-T2 bulgusu] `success` ÖNCEDEN koşulsuz `true` idi (tüm siparişler
        // başarısız olsa bile) — claim-service.ts `bulkApproveClaim`'in KULLANDIĞI aynı desene ("hepsi
        // başarısızsa success:false") getirildi. FE `res.success`'a bakarsa artık gerçek durumu görür.
        return {
            success: results.failedCount === 0,
            message: `Toplu fatura işlemi tamamlandı. ${results.successCount} başarılı, ${results.failedCount} başarısız.`,
            data: results
        };
    }

    /**
     * UYUMSUZLUK ÇÖZÜMLEME VE YENİDEN FATURALANDIRMA
     */
    async resolveAndReissueInvoice(): Promise<any> {
        try {
            const { orderId } = this.request;
            const OrderModel = this.clientDB.getOrderModel();
            const InvoiceModel = this.clientDB.getInvoiceModel();

            const order = await OrderModel.findById(orderId);
            if (!order || !order.platformDiscrepancy?.hasDiscrepancy) {
                throw new Error("Çözümlenecek bir uyumsuzluk bulunamadı.");
            }

            const updatedItems = order.platformDiscrepancy.platformItems;
            const activeItems = updatedItems.filter((item: any) => item.itemStatus === 'ACTIVE');
            const newTotal = activeItems.reduce((acc: number, item: any) => acc + (item.totalPrice || 0), 0);

            // Tüm ürünler iptalse faturayı iptal et ve siparişi kapat
            if (activeItems.length === 0) {
                await InvoiceModel.updateMany({ orderId: order._id }, { $set: { status: 'CANCELLED', cancellationDate: new Date() } });
                const updatedOrder = await OrderModel.findByIdAndUpdate(orderId, {
                    $set: { 
                        internalStatus: OrderInternalStatusEnum.CANCELLED, 
                        items: updatedItems, 
                        'financials.grandTotal': 0,
                        'financials.subTotal': 0
                    },
                    $unset: { invoice: "", 'dates.invoicedAt': "", platformDiscrepancy: "" }
                }, { new: true });

                return { success: true, message: 'Tüm ürünler iptal edildiği için fatura iptal edildi.', data: updatedOrder };
            }

            // Kısmi iptal varsa: Veriyi güncelle, statüyü geri çek ve yeni fatura kes
            await OrderModel.findByIdAndUpdate(orderId, {
                $set: { 
                    items: updatedItems, 
                    'financials.grandTotal': newTotal, 
                    'financials.subTotal': newTotal,
                    internalStatus: OrderInternalStatusEnum.APPROVED, 
                    'flags.isInvoiceGenerated': false 
                },
                $unset: { invoice: "", 'dates.invoicedAt': "", platformDiscrepancy: "" }
            });

            await InvoiceModel.updateMany({ orderId: order._id, status: { $ne: 'CANCELLED' } }, { $set: { status: 'CANCELLED', cancellationDate: new Date() } });

            this.request = { orderId };
            return await this.createInvoice();

        } catch (error) {
            console.error('[InvoiceService] Error:', error);
            throw error;
        }
    }

    /**
     * PRIVATE: Platform Entegrasyonu Bildirimi
     */
    private async syncInvoiceToPlatform(order: any, invoice: any): Promise<IPlatformResponse> {
        try {
            const factory = new IntegrationFactory(Number(this.currentClientId));
            const instance = await factory.getInstance(order.integrationCode);

            if (instance && typeof instance.sendOrderInvoice === 'function') {
                const platformResult = await instance.sendOrderInvoice({
                    orderId: order.externalOrderId,
                    invoiceNumber: invoice.invoiceNumber,
                    invoiceDate: invoice.issueDate,
                    invoiceAmount: order.financials?.grandTotal || 0,
                    pdfUrl: invoice.pdfUrl || invoice.invoiceLink,
                    documentType: invoice.documentType as 'E_ARSIV' | 'E_FATURA',
                    currency: order.currency || 'TRY'
                });

                // Platform hareketini logla
                await this.clientDB.getOrderModel().findByIdAndUpdate(order._id, {
                    $push: {
                        platformActions: {
                            actionType: 'INVOICE_SEND',
                            platform: order.integrationCode,
                            requestPayload: { invoiceNumber: invoice.invoiceNumber },
                            responsePayload: platformResult.rawResponse,
                            status: platformResult.success ? 'SUCCESS' : 'FAILED',
                            createdAt: new Date()
                        }
                    }
                });

                return platformResult;
            }

            return { success: true, message: 'Platform fatura bildirimini desteklemiyor veya metod tanımlı değil.' };
        } catch (syncError: any) {
            console.error("[InvoiceService] Platform Sync Error:", syncError);
            return { success: false, message: syncError.message };
        }
    }
}