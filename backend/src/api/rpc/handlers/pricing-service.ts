import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ApplicationError } from '@platform/core/security/Security'
import { listVariantCosts, setVariantCosts } from '@operations/pricing/variantCost'
import { buyboxHistory, listBuybox, previewMargin } from '@operations/pricing/pricingQueries'

/**
 * PricingService — PRC-R0 (maliyet) + PRC-R1 (buybox görünürlüğü, SALT OKUMA). İnce kabuk: doğrulama ve iş mantığı
 * `operations/pricing/*`'tadır; ekran ve Otopilot/MCP aynı operasyonları çağırır (ADR-0019 yetenek kaydı: pricing.*).
 * Tenant kapsamı sunucuda doğrulanmış principal'dan (`this.clientDB`); istek gövdesi tenant seçemez.
 * Pazaryerine HİÇBİR yazma yapılmaz (fiyat eşitleme/otomatik yazma R2/R3, ayrı).
 */
export default class PricingService extends BaseApi implements IService {
    async get(): Promise<any> { /* IService gereksinimi; kullanılmıyor */ }

    private tid(): number {
        if (!this.clientDB) throw new ApplicationError('Tenant bulunamadı.', 400)
        const tid = Number(this.clientId)
        if (!Number.isInteger(tid) || tid <= 0) throw new ApplicationError('Tenant bulunamadı.', 400)
        return tid
    }

    /** Maliyet listesi + kapsam göstergesi (maliyeti girilmiş varyant yüzdesi). */
    async listCosts(): Promise<any> {
        this.tid()
        return listVariantCosts(this.clientDB, this.request)
    }

    /** Toplu maliyet yazımı (≤500). Değişmeyen kalem yazılmaz; her değişiklik `costUpdatedAt`. */
    async setVariantCosts(): Promise<any> {
        this.tid()
        return setVariantCosts(this.clientDB, this.request)
    }

    /** Trendyol buybox durumu (rozet/filtre), kanal destek tablosu, tazeleme ayarları ve özet sayılar. */
    async listBuybox(): Promise<any> {
        const tid = this.tid()
        return listBuybox(this.clientDB, this.applicationDB, tid, this.request)
    }

    /** Barkodun buybox geçmişi (varsayılan 30 gün; seyreltilmiş gözlemler). */
    async getBuyboxHistory(): Promise<any> {
        this.tid()
        return buyboxHistory(this.clientDB, this.request)
    }

    /** Kâr önizlemesi: mevcut fiyatta ve buybox fiyatında net kâr, buybox'a fark, başa baş fiyat, kural uygunluğu. */
    async previewMargin(): Promise<any> {
        const tid = this.tid()
        return previewMargin(this.clientDB, this.applicationDB, tid, this.request)
    }
}
