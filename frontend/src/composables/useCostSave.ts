/**
 * frontend/src/composables/useCostSave.ts
 *
 * PRC-R0 — ürün oluşturma/düzenleme ekranlarında maliyet kaydı: genel varyant kaydından AYRI ikinci adım
 * (`PricingService/setVariantCosts`; backend genel kayıtta maliyeti süzer). Sonuç ayrı, açık bildirilir:
 * "ürün kaydedildi ama maliyet kaydedilemedi" durumu kullanıcıdan gizlenmez. Hesap saf yardımcılardadır (usePricingApi.ts).
 */
import { useI18n } from 'vue-i18n'
import { useSnackbarStore } from '@/stores/snackbarStore'
import {
  applyCostEdits, changedCosts, costBaseline, saveCostEdits, usePricingApi,
  type CostBaseline, type CostDiff, type CostSaveOutcome,
} from '@/composables/usePricingApi'

export function useCostSave() {
  const { t } = useI18n()
  const snackbar = useSnackbarStore()
  const api = usePricingApi()

  /** Kaydetmeden ÖNCE çağrılır (genel kayıt yanıtı formu sunucu değerleriyle değiştirir). */
  const plan = (baseline: CostBaseline, variants: any[] | undefined): CostDiff => changedCosts(baseline, variants)

  /**
   * Genel kayıt BAŞARILI olduktan sonra çağrılır. `variants`: yanıttan gelen form varyantları (düzenleme ekranı);
   * kullanıcının yazdığı maliyetler önce geri yazılır, kayıt başarısızsa formda görünür kalır.
   */
  async function persist(variants: any[] | undefined, diff: CostDiff, context: 'create' | 'update'): Promise<CostSaveOutcome> {
    if (context === 'update') applyCostEdits(variants, diff.items)
    const outcome = await saveCostEdits(api.setCosts, diff)
    if (diff.skippedNoBarcode > 0) {
      snackbar.addSnackbar({ show: true, text: t('pricing.cost.noBarcode', { count: diff.skippedNoBarcode }), timeout: 8000, color: 'warning' })
    }
    if (outcome.status === 'ok') {
      snackbar.addSnackbar({ show: true, text: t('pricing.cost.saved', { count: outcome.updated }), timeout: 3000, color: 'success' })
    } else if (outcome.status === 'partial') {
      snackbar.addSnackbar({ show: true, text: t('pricing.cost.partial', { count: outcome.notFound }), timeout: 10000, color: 'warning' })
    } else if (outcome.status === 'failed') {
      const key = outcome.reason === 'unauthorized' ? 'pricing.cost.failedUnauthorized' : context === 'create' ? 'pricing.cost.failedCreate' : 'pricing.cost.failed'
      snackbar.addSnackbar({ show: true, text: t(key), timeout: 12000, color: 'error' })
    }
    return outcome
  }

  return { plan, persist, baseline: costBaseline }
}
