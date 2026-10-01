import { Types } from 'mongoose';
import { IClientDB, IPlatformResponse, OrderInternalStatusEnum } from '@interfaces/index';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { InvoiceRepository } from '@database/repositories/tenant/InvoiceRepository';
import { OrderRepository } from '@database/repositories/tenant/OrderRepository';
import { ApplicationError } from '@platform/core/security/Security';
import { containsRegex, normalizePagination } from '@utils/search';

/**
 * ADR-0024 P3-ORD: fatura listeleme, manuel/sipariş faturası, toplu fatura ve uyumsuzluk sonrası yeniden faturalama;
 * eski `InvoiceService` gövdesi, davranış BİREBİR. Sipariş faturasında platform bildirimi ÖNCE, sipariş kök durumu SONRA yazılır.
 */
export interface InvoiceDeps { clientDB: IClientDB; clientId: unknown }

/**
 * [MM-08 / ADR-0021 aynı desen] getInvoices sıralama alanı izin listesi (`InvoiceSchema`, `timestamps:true` -> `createdAt`;
 * FE InvoiceListView.vue sıralanabilir başlıkları). Keyfi alan adı enjeksiyonunu kapatır.
 */
const INVOICE_SORT_FIELDS: readonly string[] = ['createdAt', 'invoiceNumber', 'issueDate', 'totalAmount', 'status'];
const DEFAULT_INVOICE_SORT_FIELD = 'createdAt';

/** Manuel fatura kaydı; sipariş numarası eşleşirse sipariş "faturası kesildi" işaretlenir. Hata yanıtta `{success:false}` döner. */
export async function createManualInvoice(clientDB: IClientDB, data: any) {
    try {
        if (!data) return { success: false, message: 'Fatura verisi boş olamaz.' };
        const ettn = data.ettn?.trim() || `SYS-MANUAL-${Date.now()}`;
        const invoicePayload: any = {
            integrationCode: 'MANUAL',
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
            externalOrderId: data.externalOrderId || '',
        };
        if (data.externalOrderId) {
            const orders = new OrderRepository(clientDB);
            const order = await orders.findByNumberOrExternalId(data.externalOrderId);
            if (order) {
                invoicePayload.orderId = order._id;
                invoicePayload.customerId = order.customerId;
                invoicePayload.integrationCode = order.integrationCode;
                await orders.markInvoiceGenerated(order._id);
            }
        }
        await new InvoiceRepository(clientDB).create(invoicePayload);
        return { success: true, message: 'Fatura başarıyla sisteme kaydedildi.' };
    } catch (error: any) {
        if (error.code === 11000) return { success: false, message: 'Bu ETTN veya Fatura no ile kayıt zaten mevcut!' };
        return { success: false, message: error.message || 'Fatura oluşturulurken bir hata oluştu.' };
    }
}

/** Fatura listesi: durum/tip/tarih filtresi, arama kutusu, izinli sıralama. */
export async function searchInvoices(clientDB: IClientDB, request: any) {
    const sortBy: any = {};
    if (request.sortBy != undefined && request.sortBy.key) {
        const direction = request.sortBy.order == 'asc' ? 1 : -1;
        if (typeof request.sortBy.key !== 'string' || !INVOICE_SORT_FIELDS.includes(request.sortBy.key)) {
            throw new ApplicationError('sortBy.key geçersiz: ' + INVOICE_SORT_FIELDS.join(', ') + ' değerlerinden biri olmalıdır.', 400);
        }
        sortBy[request.sortBy.key] = direction;
    } else {
        sortBy[DEFAULT_INVOICE_SORT_FIELD] = -1;
    }

    const filterQuery: any = {};
    const filters = request.filters;
    if (filters) {
        if (filters.status && filters.status.length > 0) filterQuery.status = { $in: filters.status };
        if (filters.type) filterQuery.type = filters.type;
        if (filters.startDate || filters.endDate) {
            filterQuery.issueDate = {};
            if (filters.startDate) filterQuery.issueDate.$gte = new Date(filters.startDate);
            if (filters.endDate) {
                const end = new Date(filters.endDate);
                end.setHours(23, 59, 59, 999);
                filterQuery.issueDate.$lte = end;
            }
        }
    }
    if (request.search) {
        filterQuery['$or'] = [
            { invoiceNumber: containsRegex(request.search) }, // [GV-01]
            { externalOrderId: containsRegex(request.search) },
            { integrationCode: containsRegex(request.search) },
        ];
    }

    const pagination = normalizePagination(request.pagination, 15); // [GV-01/MM-08] limit üst sınırı, page>=1
    const skipCount = (pagination.page - 1) * pagination.limit;
    const { total, items } = await new InvoiceRepository(clientDB).pagedSearch(filterQuery, sortBy, skipCount, pagination.limit);
    return { totalNumberOfRecords: total, invoices: items };
}

/** Fatura silinir; bağlı siparişin `isInvoiceGenerated` bayrağı geri alınır. */
export async function deleteInvoice(clientDB: IClientDB, invoiceId: unknown) {
    if (!invoiceId) throw new Error('Fatura ID gereklidir.');
    const deleted = await new InvoiceRepository(clientDB).deleteById(invoiceId);
    if (!deleted) throw new Error('Fatura bulunamadı veya daha önce silinmiş.');
    if (deleted.orderId) {
        await new OrderRepository(clientDB).updateById(deleted.orderId, { $set: { 'flags.isInvoiceGenerated': false } });
    }
    return { success: true, message: 'Fatura başarıyla silindi.' };
}

/** Platform fatura bildirimi + `platformActions` kaydı. İstisna dışarı fırlatılmaz, `{success:false, message}` döner. */
async function syncInvoiceToPlatform(deps: InvoiceDeps, order: any, invoice: any): Promise<IPlatformResponse> {
    try {
        const factory = new IntegrationFactory(Number(deps.clientId));
        const instance = await factory.getInstance(order.integrationCode);
        if (instance && typeof instance.sendOrderInvoice === 'function') {
            const platformResult = await instance.sendOrderInvoice({
                orderId: order.externalOrderId,
                invoiceNumber: invoice.invoiceNumber,
                invoiceDate: invoice.issueDate,
                invoiceAmount: order.financials?.grandTotal || 0,
                pdfUrl: invoice.pdfUrl || invoice.invoiceLink,
                documentType: invoice.documentType as 'E_ARSIV' | 'E_FATURA',
                currency: order.currency || 'TRY',
            });
            await new OrderRepository(deps.clientDB).updateById(order._id, {
                $push: {
                    platformActions: {
                        actionType: 'INVOICE_SEND',
                        platform: order.integrationCode,
                        requestPayload: { invoiceNumber: invoice.invoiceNumber },
                        responsePayload: platformResult.rawResponse,
                        status: platformResult.success ? 'SUCCESS' : 'FAILED',
                        createdAt: new Date(),
                    },
                },
            });
            return platformResult;
        }
        return { success: true, message: 'Platform fatura bildirimini desteklemiyor veya metod tanımlı değil.' };
    } catch (syncError: any) {
        console.error('[InvoiceService] Platform Sync Error:', syncError);
        return { success: false, message: syncError.message };
    }
}

/** FATURA OLUŞTURMA / KAYDETME: fatura kaydı -> platform bildirimi -> sipariş kök güncellemesi (statü geri çekilmez). */
export async function createInvoice(deps: InvoiceDeps, orderId: unknown, invoiceData: any) {
    try {
        const orders = new OrderRepository(deps.clientDB);
        const order = await orders.findById(orderId);
        if (!order) throw new Error('Sipariş bulunamadı.');

        const hasIntegratedProvider = false; // Entegratör kontrolü (ileride konfigürasyondan)
        if (!hasIntegratedProvider && !invoiceData) {
            return { success: false, action: 'OPEN_MANUAL_INVOICE_FORM', message: 'Fatura bilgileri eksik. Lütfen manuel giriş yapın.' };
        }

        const issueDate = invoiceData?.issueDate ? new Date(invoiceData.issueDate) : new Date();
        const ettn = invoiceData?.ettn || new Types.ObjectId().toString();
        const newInvoice = await new InvoiceRepository(deps.clientDB).upsertSalesInvoice(order._id, {
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
            currency: order.financials?.currencyCode || 'TRY',
        });

        const platformResult = await syncInvoiceToPlatform(deps, order, newInvoice);
        if (!platformResult.success) {
            return { success: false, message: `Fatura oluşturuldu ancak pazaryerine iletilemedi: ${platformResult.message}`, data: { invoice: newInvoice } };
        }

        // KRİTİK: sipariş zaten Kargolandı/Teslim Edildi ise statüsü geri çekilmez (internalStatus yazılmaz).
        const statusUpdate: any = {
            'dates.invoicedAt': issueDate,
            invoice: {
                invoiceMethod: newInvoice.invoiceMethod,
                status: 'SUCCESS',
                invoiceNumber: newInvoice.invoiceNumber,
                ettn: newInvoice.ettn,
                invoiceLink: newInvoice.invoiceLink,
                invoicedAt: issueDate,
            },
            'flags.isInvoiceGenerated': true,
        };
        const updatedOrder = await orders.updateById(orderId, {
            $set: statusUpdate,
            $push: {
                history: {
                    status: statusUpdate.internalStatus || order.internalStatus,
                    changedAt: new Date(),
                    description: 'Fatura oluşturuldu ve pazaryerine başarıyla iletildi.',
                    actionBy: 'USER',
                },
            },
        }, { new: true });
        return { success: true, message: 'Fatura başarıyla işlendi ve platforma iletildi.', data: { order: updatedOrder, invoice: newInvoice } };
    } catch (error: any) {
        if (error.code === 11000) throw new Error('Bu sipariş için zaten bir fatura kaydı mevcut.');
        throw error;
    }
}

/**
 * TOPLU FATURA: her sipariş `createInvoice` ile YALNIZ `{orderId}` (invoiceData yok) işlenir.
 * [DÜZELTME, 2026-09-29, ADR-0016 B-R-T2] `success` yalnız tümü başarılıysa true (claim `bulkApproveClaim` deseni).
 */
export async function bulkCreateInvoice(deps: InvoiceDeps, orderIds: unknown) {
    if (!Array.isArray(orderIds) || orderIds.length === 0) throw new Error('Lütfen işlem yapılacak en az bir sipariş seçin.');

    const results = { successCount: 0, failedCount: 0, successful: [] as any[], failed: [] as any[] };
    const orders = new OrderRepository(deps.clientDB);
    for (const orderId of orderIds) {
        try {
            const orderRecord = await orders.findById(orderId).select('orderNumber');
            const orderNumber = orderRecord?.orderNumber || orderId;
            const res: any = await createInvoice(deps, orderId, undefined);
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
    return {
        success: results.failedCount === 0,
        message: `Toplu fatura işlemi tamamlandı. ${results.successCount} başarılı, ${results.failedCount} başarısız.`,
        data: results,
    };
}

/** UYUMSUZLUK ÇÖZÜMLEME VE YENİDEN FATURALANDIRMA: tümü iptalse fatura iptal + sipariş kapanır; kısmi ise güncelle + yeniden fatura. */
export async function resolveAndReissueInvoice(deps: InvoiceDeps, orderId: unknown) {
    const orders = new OrderRepository(deps.clientDB);
    const invoices = new InvoiceRepository(deps.clientDB);

    const order = await orders.findById(orderId);
    if (!order || !order.platformDiscrepancy?.hasDiscrepancy) throw new Error('Çözümlenecek bir uyumsuzluk bulunamadı.');

    const updatedItems = order.platformDiscrepancy.platformItems;
    const activeItems = updatedItems.filter((item: any) => item.itemStatus === 'ACTIVE');
    const newTotal = activeItems.reduce((acc: number, item: any) => acc + (item.totalPrice || 0), 0);

    if (activeItems.length === 0) {
        await invoices.cancelForOrder(order._id, false);
        const updatedOrder = await orders.updateById(orderId, {
            $set: { internalStatus: OrderInternalStatusEnum.CANCELLED, items: updatedItems, 'financials.grandTotal': 0, 'financials.subTotal': 0 },
            $unset: { invoice: '', 'dates.invoicedAt': '', platformDiscrepancy: '' },
        }, { new: true });
        return { success: true, message: 'Tüm ürünler iptal edildiği için fatura iptal edildi.', data: updatedOrder };
    }

    await orders.updateById(orderId, {
        $set: { items: updatedItems, 'financials.grandTotal': newTotal, 'financials.subTotal': newTotal, internalStatus: OrderInternalStatusEnum.APPROVED, 'flags.isInvoiceGenerated': false },
        $unset: { invoice: '', 'dates.invoicedAt': '', platformDiscrepancy: '' },
    });
    await invoices.cancelForOrder(order._id, true);
    return createInvoice(deps, orderId, undefined);
}
