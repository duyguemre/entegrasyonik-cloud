import { IService, PLATFORM_PROCESS } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ApplicationError } from '@platform/core/security/Security'
import { listVariantCosts, setVariantCosts } from '@operations/pricing/variantCost'
import { buyboxHistory, listBuybox, previewMargin } from '@operations/pricing/pricingQueries'
import {
    applySuggestions, deleteRule, dismissSuggestions, getRulesState, listPriceHistory, listSuggestions, saveRule, setPricingSettings,
} from '@operations/pricing/priceRules'
import { createPricingEnv, type PricePublisher } from '@operations/pricing/createPricingEnv'
import { applyChannelRule, previewChannelRule } from '@operations/pricing/channelRules'
import { ExportBatchService } from '@integration/engine/catalog/export/ExportBatchService'

/** RunOperation'ın eklediği sunucu alanları (kimlik/bağlam) — iş gövdesi `.strict()` şemalarına girmeden ayrılır. */
const SERVER_FIELDS = ['userContext', 'principal', 'requestMeta', 'ctx'] as const

/**
 * PricingService — PRC-R0 (maliyet) + PRC-R1 (buybox görünürlüğü, SALT OKUMA) + PRC-R2 (rekabet fiyat kuralı, KURU öneri, İNSAN ONAYLI
 * uygulama). İnce kabuk: doğrulama ve iş mantığı `operations/pricing/*`'tadır; ekran ve Otopilot/MCP aynı operasyonları çağırır
 * (ADR-0019 yetenek kaydı: pricing.*). Tenant kapsamı sunucuda doğrulanmış principal'dan (`this.clientDB`); istek gövdesi tenant seçemez.
 * Pazaryerine yazan TEK yol `applySuggestions`'tır ve yalnız onay adımından çağrılır (ekran onay penceresi / Otopilot PendingAction).
 * Otomatik (insan onaysız) uygulama YOKTUR (PRC-R3, avukat yanıtı bekleniyor).
 */
export default class PricingService extends BaseApi implements IService {
    async get(): Promise<any> { /* IService gereksinimi; kullanılmıyor */ }

    /** İş gövdesi: sunucu alanları çıkarılmış istek (strict şemalar yalnız kullanıcı gövdesini görür). */
    private body(): Record<string, unknown> {
        const out: Record<string, unknown> = { ...(this.request ?? {}) }
        for (const k of SERVER_FIELDS) delete out[k]
        return out
    }

    private actor(): string | null {
        const sub = this.request?.principal?.sub
        return sub === undefined || sub === null ? null : String(sub)
    }

    /** Mevcut fiyat yayın hattı (ADR-0024 D6 ExportBatchService, UPDATE_PRICE, yalnız Trendyol). YALNIZ onaylı uygulamada kullanılır. */
    private readonly publisher: PricePublisher = async (clientDB, tid, barcodes) => {
        await new ExportBatchService({ clientDB, applicationDB: this.applicationDB, clientId: tid })
            .process({ mode: PLATFORM_PROCESS.UPDATE_PRICE, selectedIntegrations: ['trendyol'], barcodeList: barcodes, scope: 1 })
    }

    private env(withPublisher = false) {
        return createPricingEnv(this.applicationDB, this.request, withPublisher ? this.publisher : undefined)
    }

    private tid(): number {
        if (!this.clientDB) throw new ApplicationError('Tenant bulunamadı.', 400)
        const tid = Number(this.clientId)
        if (!Number.isInteger(tid) || tid <= 0) throw new ApplicationError('Tenant bulunamadı.', 400)
        return tid
    }

    /** Maliyet listesi + kapsam göstergesi (maliyeti girilmiş varyant yüzdesi). */
    async listCosts(): Promise<any> {
        this.tid()
        return listVariantCosts(this.clientDB, this.body())
    }

    /** Toplu maliyet yazımı (≤500). Değişmeyen kalem yazılmaz; her değişiklik `costUpdatedAt`. */
    async setVariantCosts(): Promise<any> {
        this.tid()
        return setVariantCosts(this.clientDB, this.body())
    }

    /** Trendyol buybox durumu (rozet/filtre), kanal destek tablosu, tazeleme ayarları ve özet sayılar. */
    async listBuybox(): Promise<any> {
        const tid = this.tid()
        return listBuybox(this.clientDB, this.applicationDB, tid, this.body())
    }

    /** Barkodun buybox geçmişi (varsayılan 30 gün; seyreltilmiş gözlemler). */
    async getBuyboxHistory(): Promise<any> {
        this.tid()
        return buyboxHistory(this.clientDB, this.body())
    }

    /** Kâr önizlemesi: mevcut fiyatta ve buybox fiyatında net kâr, buybox'a fark, başa baş fiyat, kural uygunluğu. */
    async previewMargin(): Promise<any> {
        const tid = this.tid()
        return previewMargin(this.clientDB, this.applicationDB, tid, this.body())
    }

    // ---- PRC-R2 ----------------------------------------------------------------------------------------------------------
    /** Kurallar + açık/kapalı durumu (platform/tenant/metin kabulü) + sorumluluk metni (taslak) + platform sınırları. */
    async getRules(): Promise<any> {
        const tid = this.tid()
        return getRulesState(this.clientDB, tid, this.env())
    }

    /** Kural oluştur/güncelle (sürüm artar, duraklatma kalkar). K1/K4/K6 sunucuda doğrulanır. */
    async saveRule(): Promise<any> {
        const tid = this.tid()
        return saveRule(this.clientDB, tid, this.actor(), this.body(), this.env())
    }

    async deleteRule(): Promise<any> {
        const tid = this.tid()
        return deleteRule(this.clientDB, tid, this.actor(), this.body(), this.env())
    }

    /** Tenant anahtarı (K19) + sorumluluk metni kabulü (K3) + çift motor uyarısı onayı (K17). */
    async setPricingSettings(): Promise<any> {
        const tid = this.tid()
        return setPricingSettings(this.clientDB, tid, this.actor(), this.body(), this.env())
    }

    /** Öneri listesi (açık/engelli/uygulanan/reddedilen/süresi dolan) + son 10 gün en düşük fiyat (K10). */
    async listSuggestions(): Promise<any> {
        const tid = this.tid()
        return listSuggestions(this.clientDB, tid, this.body(), this.env())
    }

    /** Denetim geçmişi: uygulanan öneriler + gözlenen dış değişiklikler (K18). */
    async getPriceHistory(): Promise<any> {
        this.tid()
        return listPriceHistory(this.clientDB, this.body(), this.env())
    }

    /** İNSAN ONAYLI uygulama (sigorta yeniden çalışır; mevcut fiyat yayın hattı). */
    async applySuggestions(): Promise<any> {
        const tid = this.tid()
        return applySuggestions(this.clientDB, tid, this.actor(), this.body(), this.env(true))
    }

    // ---- eslesme-fiyat WP5: kanal fiyat kuralı (type:'channel', K-A) ---------------------------------------------------------
    /** SALT OKUMA: kanal kuralının kapsamındaki varyantlar için hesaplanan fiyat + gerekçe. */
    async previewChannelRule(): Promise<any> {
        const tid = this.tid()
        return previewChannelRule(this.clientDB, tid, this.body(), this.env())
    }

    /** İNSAN ONAYLI uygulama: `rulePrice` yazar; etkin fiyatı değişen kanal otomatik fiyat yayınıyla gider (pricePending). */
    async applyChannelRule(): Promise<any> {
        const tid = this.tid()
        return applyChannelRule(this.clientDB, tid, this.actor(), this.body(), this.env())
    }

    async dismissSuggestions(): Promise<any> {
        const tid = this.tid()
        return dismissSuggestions(this.clientDB, tid, this.actor(), this.body(), this.env())
    }
}
