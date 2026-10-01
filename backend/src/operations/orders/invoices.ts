import { OrderInternalStatusEnum, IPlatformResponse } from '@interfaces/index'
import { Types } from 'mongoose'
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { ApplicationError } from '@platform/core/security/Security'
import { containsRegex, normalizePagination } from '@utils/search';
import type { InvoicePanelRepository } from '@database/repositories/tenant/InvoicePanelRepository'

/**
 * ADR-0024 Dalga 3 (P3-ORD): fatura iş kuralları (manuel kayıt, liste, silme, oluşturma + pazaryeri bildirimi, toplu,
 * uyumsuzluk çözümü). Davranış `InvoiceService`'in eski gövdeleriyle birebir. Günlükleme çağıran (handler) tarafındadır:
 * `logError` platform bildirim hatasını yazar.
 */
export interface InvoiceDeps { repo: InvoicePanelRepository; clientId: number; logError: (message: string, error: unknown) => void }

/**
 * [MM-08 / ADR-0021 aynı desen] getInvoices sıralama alanı izin listesi. `InvoiceSchema` (Invoice.ts, `timestamps:true`
 * -> `createdAt`) alanlarından ve FE fatura tablosunun (InvoiceListView.vue) sıralanabilir başlıklarına/sıralama
 * seçeneklerine karşılık gelir. `OrderService.getOrders` ile AYNI keyfi-alan-adı-enjeksiyonu riskini kapatır.
 */
const INVOICE_SORT_FIELDS: readonly string[] = [
    'createdAt', 'invoiceNumber', 'issueDate', 'totalAmount', 'status',
];
const DEFAULT_INVOICE_SORT_FIELD = 'createdAt';

export async function createManualInvoice(repo: InvoicePanelRepository, request: any): Promise<any> {
    try {
        const data = request.data;
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
            const order = await repo.findOrderByNumberOrExternalId(data.externalOrderId);

            if (order) {
                invoicePayload.orderId = order._id;
                invoicePayload.customerId = order.customerId;
                invoicePayload.integrationCode = order.integrationCode;

                await repo.updateOrderOne(
                    { _id: order._id },
                    { $set: { 'flags.isInvoiceGenerated': true, 'invoice.status': 'SUCCESS' } }
                );
            }
        }

        await repo.saveInvoice(invoicePayload);

        return { success: true, message: "Fatura başarıyla sisteme kaydedildi." };

    } catch (error: any) {
        // ETTN çakışmaları vb.
        if (error.code === 11000) {
            return { success: false, message: "Bu ETTN veya Fatura no ile kayıt zaten mevcut!" };
        }
        return { success: false, message: error.message || "Fatura oluşturulurken bir hata oluştu." };
    }
}

export async function listInvoices(repo: InvoicePanelRepository, request: any): Promise<any> {
    let direction = 1;
    const sortBy: any = {};
    if (request.sortBy != undefined && request.sortBy.key) {
        direction = request.sortBy.order == 'asc' ? 1 : -1;
        if (typeof request.sortBy.key !== 'string' || !INVOICE_SORT_FIELDS.includes(request.sortBy.key)) {
            throw new ApplicationError('sortBy.key geçersiz: ' + INVOICE_SORT_FIELDS.join(', ') + ' değerlerinden biri olmalıdır.', 400);
        }
        sortBy[request.sortBy.key] = direction;
    } else {
        sortBy[DEFAULT_INVOICE_SORT_FIELD] = -1;
    }

    const filterQuery: any = {};

    // Filtreleme (Durum ve Tip)
    if (request.filters) {
        if (request.filters.status && request.filters.status.length > 0) {
            filterQuery.status = { $in: request.filters.status };
        }
        if (request.filters.type) {
            filterQuery.type = request.filters.type;
        }

        if (request.filters.startDate || request.filters.endDate) {
            filterQuery.issueDate = {};
            if (request.filters.startDate) filterQuery.issueDate.$gte = new Date(request.filters.startDate);
            if (request.filters.endDate) {
                const end = new Date(request.filters.endDate);
                end.setHours(23, 59, 59, 999);
                filterQuery.issueDate.$lte = end;
            }
        }
    }

    // Arama Kutusu (SearchBox)
    if (request.search) {
        filterQuery['$or'] = [
            { invoiceNumber: containsRegex(request.search) }, // [GV-01]
            { externalOrderId: containsRegex(request.search) },
            { integrationCode: containsRegex(request.search) }
        ];
    }

    const pagination = normalizePagination(request.pagination, 15); // [GV-01/MM-08] limit üst sınırı, page>=1
    const skipCount = (pagination.page - 1) * pagination.limit;
    const limitCount = pagination.limit;

    const response: any = {};
    const { total, invoices } = await repo.listPage(filterQuery, sortBy, skipCount, limitCount);
    response.totalNumberOfRecords = total;
    response.invoices = invoices;

    return response;
}

export async function deleteInvoice(repo: InvoicePanelRepository, invoiceId: any): Promise<any> {
    if (!invoiceId) throw new Error("Fatura ID gereklidir.");

    const deleted = await repo.deleteInvoiceById(invoiceId);
    if (!deleted) throw new Error("Fatura bulunamadı veya daha önce silinmiş.");

    // Siparişteki isInvoiceGenerated bayrağını geri al
    if (deleted.orderId) {
        await repo.updateOrderById(deleted.orderId, {
            $set: { 'flags.isInvoiceGenerated': false }
        });
    }

    return { success: true, message: "Fatura başarıyla silindi." };
}

/**
 * FATURA OLUŞTURMA / KAYDETME
 */
export async function createInvoice(deps: InvoiceDeps, orderId: any, invoiceData: any): Promise<any> {
    const { repo } = deps;
    try {
        const order = await repo.findOrderById(orderId);
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
        const newInvoice = await repo.upsertSalesInvoice(order._id, {
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
        });

        // 2. PAZARYERİ BİLDİRİMİ (ÖNCE)
        // Platforma gönderiyoruz, eğer hata alırsak sipariş statüsünü güncellemiyoruz.
        const platformResult = await syncInvoiceToPlatform(deps, order, newInvoice);

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

        const updatedOrder = await repo.updateOrderById(
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
 * `create(orderId)` tekil oluşturmayı çağıran tarafça sağlanır (istek nesnesi çağıran tarafta değiştirilir).
 */
export async function bulkCreateInvoices(repo: InvoicePanelRepository, orderIds: any, create: (orderId: any) => Promise<any>): Promise<any> {
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
        throw new Error("Lütfen işlem yapılacak en az bir sipariş seçin.");
    }

    const results = { successCount: 0, failedCount: 0, successful: [] as any[], failed: [] as any[] };

    for (const orderId of orderIds) {
        try {
            const orderRecord = await repo.findOrderNumberById(orderId);
            const orderNumber = orderRecord?.orderNumber || orderId;

            const res = await create(orderId);

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
 * `reissue()` yeni fatura kesimini çağıran tarafça sağlanır (istek nesnesi çağıran tarafta değiştirilir).
 */
export async function resolveAndReissueInvoice(repo: InvoicePanelRepository, orderId: any, reissue: () => Promise<any>): Promise<any> {
    const order = await repo.findOrderById(orderId);
    if (!order || !order.platformDiscrepancy?.hasDiscrepancy) {
        throw new Error("Çözümlenecek bir uyumsuzluk bulunamadı.");
    }

    const updatedItems = order.platformDiscrepancy.platformItems;
    const activeItems = updatedItems.filter((item: any) => item.itemStatus === 'ACTIVE');
    const newTotal = activeItems.reduce((acc: number, item: any) => acc + (item.totalPrice || 0), 0);

    // Tüm ürünler iptalse faturayı iptal et ve siparişi kapat
    if (activeItems.length === 0) {
        await repo.updateInvoices({ orderId: order._id }, { $set: { status: 'CANCELLED', cancellationDate: new Date() } });
        const updatedOrder = await repo.updateOrderById(orderId, {
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
    await repo.updateOrderById(orderId, {
        $set: {
            items: updatedItems,
            'financials.grandTotal': newTotal,
            'financials.subTotal': newTotal,
            internalStatus: OrderInternalStatusEnum.APPROVED,
            'flags.isInvoiceGenerated': false
        },
        $unset: { invoice: "", 'dates.invoicedAt': "", platformDiscrepancy: "" }
    });

    await repo.updateInvoices({ orderId: order._id, status: { $ne: 'CANCELLED' } }, { $set: { status: 'CANCELLED', cancellationDate: new Date() } });

    return await reissue();
}

/**
 * Platform Entegrasyonu Bildirimi
 */
async function syncInvoiceToPlatform(deps: InvoiceDeps, order: any, invoice: any): Promise<IPlatformResponse> {
    try {
        const factory = new IntegrationFactory(deps.clientId);
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
            await deps.repo.updateOrderById(order._id, {
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
        deps.logError("[InvoiceService] Platform Sync Error:", syncError);
        return { success: false, message: syncError.message };
    }
}
