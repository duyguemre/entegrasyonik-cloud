import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ApplicationError } from '@platform/core/security/Security'
import { FinancialPanelRepository } from '@database/repositories/tenant/FinancialPanelRepository'
import { queryTransactions, cargoInvoices, financialSummary, payoutDetails } from '@operations/finance/financialPanel'
import { listCommissionOverrides, setCommissionOverride, deleteCommissionOverride } from '@operations/finance/commissionOverrides'
import { getOrderCommissionSummary, getCommissionByBarcodes, getRealizedCommissionByCategory, getNetRevenuePreview, MAX_NET_PREVIEW_ITEMS } from '@operations/finance/commissionQueries'
import { getCommissionDrift } from '@operations/finance/commissionDrift'
import { eventLog } from '@platform/core/logger';

const log = eventLog('api', 'financial-service');

export { CARGO_INVOICES_MAX_ROWS } from '@operations/finance/financialPanel'

/**
 * Finans RPC cephesi (ADR-0024 Dalga 3 P3-ORD). Sorgular `FinancialPanelRepository`'de, iş kuralları
 * `operations/finance/financialPanel`'de; RPC adları ve yanıt biçimleri değişmedi.
 */
export default class FinancialService extends BaseApi implements IService {

    private get finance(): FinancialPanelRepository { return new FinancialPanelRepository(this.clientDB) }

    async get() {
        return {}
    }

    /**
     * ÖNYÜZ: Ana Ekstre Listesi
     * Tüm finansal hareketleri (Satış, İade, Kesinti vb.) filtreli ve sıralı getirir.
     */
    async getTransactionData(): Promise<any> {
        const { filterQuery, transactions, totalNumberOfRecords, summary } = await queryTransactions(this.finance, this.request);

        log.debug('FINANCIAL_GET_RESULT', '[FinancialService:get] sorgu sonucu', { filterKeys: Object.keys(filterQuery), found: transactions.length });
        if (transactions.length > 0) {
            log.debug('FINANCIAL_GET_SAMPLE', '[FinancialService:get] örnek kayıt', { integrationCode: transactions[0].integrationCode, transactionType: transactions[0].transactionType });
        }

        return { transactions, totalNumberOfRecords, summary };
    }

    /**
     * ÖNYÜZ: Kargo Faturaları Listesi
     * Kargo bazlı mutabakat ekranı için verileri sağlar.
     */
    async getCargoInvoices(): Promise<any> {
        return cargoInvoices(this.finance, this.request);
    }

    /**
     * ÖNYÜZ: Finansal Özet (Dashboard Kartları)
     * Muhasebeci ve patron ekranı için agregasyon sonuçlarını döner.
     * @deprecated Bu metod get() içerisine entegre edilmiştir.
     */
    async getFinancialSummary(): Promise<any> {
        return financialSummary(this.finance, this.request);
    }

    /**
     * ÖNYÜZ: Ödeme Emri (Vade) Bazlı Analiz
     * "Bu hafta hangi ödemede ne kadar kazandım?" sorusu için.
     */
    async getPayoutDetails(): Promise<any> {
        return payoutDetails(this.finance, this.request);
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

    /** COM-08: kategori başına gerçekleşen oran vs referans (override > tablo) sapması; eşik kanal ayarından. Salt okuma. */
    async getCommissionDrift(): Promise<any> {
        const { integrationCode, days } = this.request;
        return getCommissionDrift(this.clientDB, this.clientId, { integrationCode: this.scalarString(integrationCode ?? 'trendyol', 'integrationCode'), days });
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
