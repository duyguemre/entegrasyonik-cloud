import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ApplicationError } from '../Security'
import { containsRegex, clampPage, clampLimit } from '@utils/search'
import { listCommissionOverrides, setCommissionOverride, deleteCommissionOverride } from '@operations/finance/commissionOverrides'
import { getOrderCommissionSummary, getCommissionByBarcodes, getRealizedCommissionByCategory, getNetRevenuePreview, MAX_NET_PREVIEW_ITEMS } from '@operations/finance/commissionQueries'

/** getCargoInvoices tek yanıtta en fazla bu kadar satır döner (en yeni önce). */
export const CARGO_INVOICES_MAX_ROWS = 5000

export default class FinancialService extends BaseApi implements IService {

    async get() {
        return {}
    }

    /**
     * ÖNYÜZ: Ana Ekstre Listesi
     * Tüm finansal hareketleri (Satış, İade, Kesinti vb.) filtreli ve sıralı getirir.
     */
    async getTransactionData(): Promise<any> {
        try {
            const {
                startDate,
                endDate,
                integrationCodes,
                transactionTypes,
                externalIdSearch,
                page: rawPage,
                limit: rawLimit,
                sortBy
            } = this.request;

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
            const model = this.clientDB.getFinancialTransactionModel();

            const [totalNumberOfRecords, transactions, summary] = await Promise.all([
                model.countDocuments(filterQuery),
                model.find(filterQuery).sort(sortQuery).skip(skip).limit(limit).lean(),
                model.aggregate([
                    { $match: filterQuery },
                    {
                        $group: {
                            _id: null,
                            totalCredit: { $sum: "$credit" },
                            totalDebt: { $sum: "$debt" },
                            totalCargo: { $sum: "$cargoAmount" },
                            netAmount: { $sum: "$netAmount" },
                            transactionCount: { $sum: 1 }
                        }
                    }
                ])
            ]);

            console.log(`[FinancialService:get] Filter: ${JSON.stringify(filterQuery)}, Found: ${transactions.length} records`);
            if (transactions.length > 0) {
                console.log(`[FinancialService:get] Sample Record Integration: ${transactions[0].integrationCode}, Type: ${transactions[0].transactionType}`);
            }

            return {
                transactions,
                totalNumberOfRecords,
                summary: summary[0] ?? { totalCredit: 0, totalDebt: 0, totalCargo: 0, netAmount: 0, transactionCount: 0 }
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * ÖNYÜZ: Kargo Faturaları Listesi
     * Kargo bazlı mutabakat ekranı için verileri sağlar.
     */
    async getCargoInvoices(): Promise<any> {
        try {
            const {
                invoiceNumber,
                orderNumber,
                integrationCode,
                startDate,
                endDate
            } = this.request;

            const filterQuery: any = {};

            if (integrationCode) filterQuery.integrationCode = integrationCode;
            if (invoiceNumber) filterQuery.invoiceNumber = invoiceNumber;
            if (orderNumber) filterQuery.orderNumber = orderNumber;

            if (startDate || endDate) {
                filterQuery.transactionDate = {};
                if (startDate) filterQuery.transactionDate.$gte = new Date(startDate);
                if (endDate) filterQuery.transactionDate.$lte = new Date(endDate);
            }

            return await this.clientDB.getCargoInvoiceModel()
                .find(filterQuery)
                .sort({ transactionDate: -1 })
                .limit(CARGO_INVOICES_MAX_ROWS) // [API_TENANT_SURFACE §6] sayfasız uç genel RPC'ye açılırken sınırsız okuma engellendi
                .lean();
        } catch (error) {
            throw error;
        }
    }

    /**
     * ÖNYÜZ: Finansal Özet (Dashboard Kartları)
     * Muhasebeci ve patron ekranı için agregasyon sonuçlarını döner.
     * @deprecated Bu metod get() içerisine entegre edilmiştir.
     */
    async getFinancialSummary(): Promise<any> {
        try {
            const {
                startDate,
                endDate,
                integrationCodes,
                transactionTypes,
                externalIdSearch
            } = this.request;

            const matchQuery: any = {};

            // Frontend'deki aktif filtrelerle aynı koşullar
            if (integrationCodes && integrationCodes.length > 0) {
                matchQuery.integrationCode = { $in: integrationCodes };
            }
            if (transactionTypes && transactionTypes.length > 0) {
                matchQuery.transactionType = { $in: transactionTypes };
            }
            // İşlem No (externalId) araması
            if (externalIdSearch) {
                matchQuery.externalId = containsRegex(externalIdSearch); // [GV-01]
            }
            if (startDate || endDate) {
                matchQuery.transactionDate = {};
                if (startDate) matchQuery.transactionDate.$gte = new Date(startDate);
                if (endDate) matchQuery.transactionDate.$lte = new Date(endDate);
            }

            // Tek bir grup olarak tüm filtrelenmiş kayıtların toplamı
            const result = await this.clientDB.getFinancialTransactionModel().aggregate([
                { $match: matchQuery },
                {
                    $group: {
                        _id: null,
                        totalCredit: { $sum: "$credit" },
                        totalDebt: { $sum: "$debt" },
                        totalCargo: { $sum: "$cargoAmount" },
                        netAmount: { $sum: "$netAmount" },
                        transactionCount: { $sum: 1 }
                    }
                }
            ]);

            // Sonuç yoksa sıfır değerleri döndür
            return result[0] ?? {
                totalCredit: 0,
                totalDebt: 0,
                totalCargo: 0,
                netAmount: 0,
                transactionCount: 0
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * ÖNYÜZ: Ödeme Emri (Vade) Bazlı Analiz
     * "Bu hafta hangi ödemede ne kadar kazandım?" sorusu için.
     */
    async getPayoutDetails(): Promise<any> {
        try {
            const { paymentOrderId } = this.request;
            if (!paymentOrderId) throw new Error("Ödeme emri ID (paymentOrderId) gereklidir.");
            // [API_TENANT_SURFACE §6] yalnızca skaler kimlik: nesne ({$ne:null} vb. operatör) ile tüm ödeme kayıtlarını listeleme engellenir
            if (typeof paymentOrderId !== 'string' && typeof paymentOrderId !== 'number') throw new ApplicationError("paymentOrderId geçersiz.", 400);

            return await this.clientDB.getFinancialTransactionModel()
                .find({ paymentOrderId })
                .sort({ transactionDate: 1 })
                .lean();
        } catch (error) {
            throw error;
        }
    }

    /** [COM-03/COM-07] Girdi: yalnızca skaler string/sayı (nesne/operatör enjeksiyonu engellenir). */
    private scalarString(v: unknown, name: string): string {
        if (typeof v !== 'string' && typeof v !== 'number') throw new ApplicationError(`${name} geçersiz.`, 400);
        const s = String(v).trim();
        if (!s || s.length > 100) throw new ApplicationError(`${name} geçersiz.`, 400);
        return s;
    }

    /**
     * ÖNYÜZ (COM-07): Sipariş kalemi başına komisyon özeti. Kaynak önceliği: override (COM-04, henüz yok) > gerçekleşen (hakediş) >
     * tahmini (kanal komisyon tablosu) > bilinmiyor; her kalem `commission.source` etiketi taşır ('override'|'actual'|'estimated'|'unknown').
     */
    async getOrderCommissionSummary(): Promise<any> {
        const { orderNumber, integrationCode } = this.request;
        return getOrderCommissionSummary(this.clientDB, this.clientId, {
            orderNumber: this.scalarString(orderNumber, 'orderNumber'),
            integrationCode: this.scalarString(integrationCode ?? 'trendyol', 'integrationCode'),
        });
    }

    /** ÖNYÜZ (COM-07): Barkod listesi için komisyon kaynağı + oran (ürün liste/detay net fiyat). En çok 200 barkod. */
    async getCommissionByBarcodes(): Promise<any> {
        const { barcodes, integrationCode, days } = this.request;
        if (!Array.isArray(barcodes)) throw new ApplicationError('barcodes dizi olmalı.', 400);
        return getCommissionByBarcodes(this.clientDB, this.clientId, {
            integrationCode: this.scalarString(integrationCode ?? 'trendyol', 'integrationCode'),
            barcodes: barcodes.slice(0, 200).map((b: unknown) => this.scalarString(b, 'barcode')),
            days,
        });
    }

    /**
     * ÖNYÜZ (COM-07): Net fiyat/net gelir önizlemesi (ürün liste/detay). Okuma anında hesaplanır, kalıcı alan yok. En çok 200 öğe.
     * `grossPrice` verilmezse varyantın brüt satış fiyatı kullanılır; bilinmeyen bileşen 0 sayılmaz (`net.confidence`).
     */
    async getNetRevenuePreview(): Promise<any> {
        const { items } = this.request;
        if (!Array.isArray(items)) throw new ApplicationError('items dizi olmalı.', 400);
        if (items.length > MAX_NET_PREVIEW_ITEMS) throw new ApplicationError(`items en çok ${MAX_NET_PREVIEW_ITEMS} öğe olabilir.`, 400);
        return getNetRevenuePreview(this.clientDB, this.clientId, {
            items: items.map((it: any) => {
                if (!it || typeof it !== 'object') throw new ApplicationError('items öğesi geçersiz.', 400);
                const hasBarcode = it.barcode !== undefined && it.barcode !== null && it.barcode !== '';
                const hasVariant = it.variantId !== undefined && it.variantId !== null && it.variantId !== '';
                if (!hasBarcode && !hasVariant) throw new ApplicationError('items öğesi için barcode veya variantId gerekli.', 400);
                if (it.grossPrice !== undefined && it.grossPrice !== null && !(typeof it.grossPrice === 'number' && Number.isFinite(it.grossPrice) && it.grossPrice >= 0)) throw new ApplicationError('grossPrice geçersiz.', 400);
                return {
                    ...(hasBarcode ? { barcode: this.scalarString(it.barcode, 'barcode') } : {}),
                    ...(hasVariant ? { variantId: this.scalarString(it.variantId, 'variantId') } : {}),
                    ...(typeof it.grossPrice === 'number' ? { grossPrice: it.grossPrice } : {}),
                    integrationCode: this.scalarString(it.integrationCode, 'integrationCode'),
                };
            }),
        });
    }

    /** ÖNYÜZ (COM-03): Kategori başına son N gün (varsayılan 90, en çok 180) ortalama GERÇEKLEŞEN komisyon oranı. */
    async getRealizedCommissionByCategory(): Promise<any> {
        const { integrationCode, days } = this.request;
        return getRealizedCommissionByCategory(this.clientDB, { integrationCode: this.scalarString(integrationCode ?? 'trendyol', 'integrationCode'), days });
    }

    /** ÖNYÜZ (COM-04): Tenant komisyon override listesi (`integrationCode` verilirse yalnız o kanal). */
    async listCommissionOverrides(): Promise<any> {
        const { integrationCode } = this.request;
        return listCommissionOverrides(this.clientDB, { integrationCode: integrationCode === undefined ? undefined : this.scalarString(integrationCode, 'integrationCode') });
    }

    /** ÖNYÜZ (COM-04, admin+): Kanal varsayılanı ya da kategori bazlı oran geçersiz kılma (upsert). Oran 0-100, en çok 2 ondalık. */
    async setCommissionOverride(): Promise<any> {
        const { integrationCode, scope, platformCategoryId, rate, note } = this.request;
        return setCommissionOverride(this.clientDB, this.clientId, this.ctx.actor.sub, {
            integrationCode: this.scalarString(integrationCode, 'integrationCode'),
            scope,
            platformCategoryId: platformCategoryId === undefined || platformCategoryId === null ? undefined : this.scalarString(platformCategoryId, 'platformCategoryId'),
            rate,
            note: typeof note === 'string' ? note : undefined,
        });
    }

    /** ÖNYÜZ (COM-04, admin+): Override kaydını siler. */
    async deleteCommissionOverride(): Promise<any> {
        const { id } = this.request;
        if (typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) throw new ApplicationError('id geçersiz.', 400);
        return deleteCommissionOverride(this.clientDB, this.clientId, { id });
    }
}
