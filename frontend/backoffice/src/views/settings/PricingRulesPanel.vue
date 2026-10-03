<!--
  PRC-R2 (K19, K2): Fiyat kuralları — platform kill-switch + kural/öneri TOPLAM istatistikleri (tenant verisi gösterilmez).
  K51 deseni: Durum (açık mı, dikkat) → Karar (kapat/aç) → Eylem (taslak → yayın, gerekçeli) → Ayrıntı (sayaçlar).
  Kill-switch ve S6 kota ayarı MEVCUT `_platform` taslak → yayın akışıyla değişir (sayfanın taslak çubuğu, gerekçe + geçmiş + geri alma).
  Otomatik (insan onaysız) uygulama bu sürümde YOKTUR (PRC-R3).
-->
<template>
  <BoSection id="bo-pr" title="Fiyat kuralları (onaylı öneri)" description="Müşteriler buybox'a göre kendi kurallarını yazar; fiyat yalnız müşteri onaylayınca değişir. Sayılar tüm müşterilerin toplamıdır — müşteri adı, ürün ya da fiyat gösterilmez." data-testid="pricing-rules-panel">
    <template #actions>
      <EkStatusChip :tone="switchOn ? 'success' : 'neutral'" dot :label="switchOn ? 'Açık' : 'Kapalı'" data-testid="pricing-rules-switch-state" />
    </template>

    <div v-if="attention.length" class="bo-pr__attention">
      <EkAlert v-for="a in attention" :key="a.id" :tone="a.tone" dense :title="a.title" :text="a.text" :data-attention="a.id" />
    </div>

    <div class="bo-pr__form">
      <SettingField v-if="flagItem" :item="flagItem" :model-value="cfg.form[FLAG]" :effective="cfg.data?.values[FLAG]" :changed="cfg.isChanged(FLAG)" :error="cfg.fieldErrors[FLAG]"
        data-testid="pricing-rules-flag" @update:model-value="(v) => (cfg.form[FLAG] = v)" />
      <SettingField v-if="quotaItem" :item="quotaItem" :model-value="cfg.form[QUOTA]" :effective="cfg.data?.values[QUOTA]" :changed="cfg.isChanged(QUOTA)" :error="cfg.fieldErrors[QUOTA]"
        data-testid="pricing-rules-quota" @update:model-value="(v) => (cfg.form[QUOTA] = v)" />
      <div class="bo-pr__actions">
        <BoAction kind="save" label="Taslak kaydet ve önizle" :loading="cfg.saving" :disabled="!cfg.changedKeys.length && !cfg.hasDraft" data-testid="pricing-rules-save" @click="cfg.saveAndPreview()" />
        <span class="bo-panel__hint">Kapatma tüm müşterilerde öneri üretimini ve onaylı uygulamayı ~15 sn içinde durdurur; kurallar silinmez. Yayın gerekçe ister ve geçmişte görünür.</span>
      </div>
    </div>

    <StateBlock :phase="overview.phase" :error="overview.error" skeleton="cards" :rows="2" error-title="Fiyat kuralı istatistikleri okunamadı" @retry="overview.load()">
      <BoTileGrid v-if="o" :min="176" dense data-testid="pricing-rules-stats">
        <BoStat label="Açık müşteri" :value="fmtInt(o.tenantsEnabled)" :hint="`/ ${fmtInt(o.scannedTenants)} aktif müşteri tarandı`" />
        <BoStat label="Kural" :value="fmtInt(o.rules.enabled)" :hint="`açık · toplam ${fmtInt(o.rules.total)}`" :info="`${fmtInt(o.rules.enabled)} kural açık; toplam ${fmtInt(o.rules.total)} kural, ${fmtInt(o.tenantsWithRules)} müşteride.`" />
        <BoStat label="Duraklatılan kural" :value="fmtInt(o.rules.pausedExternal + o.rules.pausedOscillation)" :hint="`dış değişiklik ${fmtInt(o.rules.pausedExternal)} · salınım ${fmtInt(o.rules.pausedOscillation)}`" data-tile="paused" />
        <BoStat label="Açık öneri" :value="fmtInt(o.suggestions.open)" :hint="`engellenen ${fmtInt(o.suggestions.blocked)}`" />
        <BoStat label="Son 7 gün" :value="fmtInt(o.suggestions.applied7d)" :hint="`uygulandı · reddedilen ${fmtInt(o.suggestions.dismissed7d)}`" info="Müşteri onayıyla uygulanan öneri sayısı; yanında reddedilenler." />
      </BoTileGrid>
    </StateBlock>
    <template #footer>
      <p class="bo-pr__note">
        <v-icon icon="mdi-shield-lock-outline" aria-hidden="true" />
        Otomatik (müşteri onaysız) fiyat uygulaması bu sürümde yoktur; hukuk görüşü bekleniyor (PRC-R3). Sayaçlar hiçbir müşterinin fiyat kararında kullanılmaz.
      </p>
    </template>
  </BoSection>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { EkAlert, EkStatusChip } from '@entegrasyonik/ui/components'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import BoStat from '@bo/components/r2/BoStat.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import { api } from '@bo/api'
import { useResource } from '@bo/composables/useResource'
import type { PricingRulesOverview } from '@bo/api/contract'
import SettingField from './SettingField.vue'
import type { PlatformConfig } from './usePlatformConfig'
import { fmtInt } from './competitionLogic'
import { pricingRulesAttention } from './pricingRulesLogic'
import '@bo/styles/kit.css'

const props = defineProps<{ cfg: PlatformConfig }>()
const FLAG = 'features.pricingRules'
const QUOTA = 'pricing.suggestions.bulkApplyQuota'

const overview = reactive(useResource<PricingRulesOverview>(() => api.call('BackofficeBillingService/getPricingRulesOverview', {})))
const o = computed(() => overview.data)
const flagItem = computed(() => props.cfg.data?.catalog.find((c) => c.key === FLAG))
const quotaItem = computed(() => props.cfg.data?.catalog.find((c) => c.key === QUOTA))
const switchOn = computed(() => props.cfg.data?.values[FLAG]?.value === true)
const attention = computed(() => pricingRulesAttention(o.value, switchOn.value))

onMounted(() => overview.load())
defineExpose({ reload: () => overview.load() })
</script>

<style scoped>
.bo-pr__attention { display: flex; flex-direction: column; gap: var(--ek-space-2); margin-bottom: var(--ek-space-4); }
/* Ayar satırları tek kartta (Platform ayarlarıyla aynı düzen). */
.bo-pr__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  max-width: 880px;
  margin-bottom: var(--ek-space-5);
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface);
}
.bo-pr__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ek-space-3); }
.bo-pr__note { display: flex; align-items: flex-start; gap: var(--ek-space-2); margin: 0; color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); }

/* BO-LOCAL-01 — fiyat kuralları ayar kartı: kart köşeli. */
.bo-pr__form {
  border-radius: var(--ek-radius-card);
}
</style>
