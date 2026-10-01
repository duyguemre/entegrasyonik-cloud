import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ApplicationError } from '@platform/core/security/Security'
import { listCommissionOverrides, setCommissionOverride, deleteCommissionOverride } from '@operations/finance/commissionOverrides'
import { getOrderCommissionSummary, getCommissionByBarcodes, getRealizedCommissionByCategory, getNetRevenuePreview, MAX_NET_PREVIEW_ITEMS } from '@operations/finance/commissionQueries'
import { getTransactionData, getCargoInvoices, getFinancialSummary, getPayoutDetails, CARGO_INVOICES_MAX_ROWS as MAX_ROWS } from '@operations/finance/transactions'

/** getCargoInvoices tek yanıtta en fazla bu kadar satır döner (en yeni önce; kaynak: operations/finance/transactions). */
export const CARGO_INVOICES_MAX_ROWS = MAX_ROWS

/** ADR-0024 P3-ORD: finans RPC cephesi; ekstre/kargo/özet `operations/finance/transactions`, komisyon `operations/finance/*`. */
export default class FinancialService extends BaseApi implements IService {

    async get() {
        return {}
    }

    /** ÖNYÜZ: Ana ekstre listesi (filtreli, sıralı, sayfalı + özet). */
    async getTransactionData(): Promise<any> {
        return getTransactionData(this.clientDB, this.request)
    }

    /** ÖNYÜZ: Kargo faturaları listesi (kargo bazlı mutabakat; en çok CARGO_INVOICES_MAX_ROWS satır). */
    async getCargoInvoices(): Promise<any> {
        return getCargoInvoices(this.clientDB, this.request)
    }

    /**
     * ÖNYÜZ: Finansal özet (dashboard kartları).
     * @deprecated Bu metod get() içerisine entegre edilmiştir.
     */
    async getFinancialSummary(): Promise<any> {
        return getFinancialSummary(this.clientDB, this.request)
    }

    /** ÖNYÜZ: Ödeme emri (vade) bazlı analiz. */
    async getPayoutDetails(): Promise<any> {
        return getPayoutDetails(this.clientDB, this.request.paymentOrderId)
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
