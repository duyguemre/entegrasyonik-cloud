<!--
  PRC-R2 (K19, K2): Fiyat kuralları — platform kill-switch + kural/öneri TOPLAM istatistikleri (tenant verisi gösterilmez).
  K51 deseni: Durum (açık mı, dikkat) → Karar (kapat/aç) → Eylem (taslak → yayın, gerekçeli) → Ayrıntı (sayaçlar).
  Kill-switch ve S6 kota ayarı MEVCUT `_platform` taslak → yayın akışıyla değişir (sayfanın taslak çubuğu, gerekçe + geçmiş + geri alma).
  Otomatik (insan onaysız) uygulama bu sürümde YOKTUR (PRC-R3).
-->
<template>
  <section class="bo-panel" aria-labelledby="bo-pr-title" data-testid="pricing-rules-panel">
    <header class="bo-panel__bar">
      <div>
        <h2 id="bo-pr-title" class="bo-panel__title">Fiyat kuralları (onaylı öneri)</h2>
        <p class="bo-panel__hint">Müşteriler buybox'a göre kendi kurallarını yazar; fiyat yalnız müşteri onaylayınca değişir. Sayılar tüm müşterilerin toplamıdır — müşteri adı, ürün ya da fiyat gösterilmez.</p>
      </div>
      <EkStatusChip :tone="switchOn ? 'success' : 'neutral'" dot :label="switchOn ? 'Açık' : 'Kapalı'" data-testid="pricing-rules-switch-state" />
    </header>

    <div v-if="attention.length" class="bo-pr__attention">
      <EkAlert v-for="a in attention" :key="a.id" :tone="a.tone" dense :title="a.title" :text="a.text" :data-attention="a.id" />
    </div>

    <EkCard flush>
      <div class="bo-pr__form">
        <SettingField v-if="flagItem" :item="flagItem" :model-value="cfg.form[FLAG]" :effective="cfg.data?.values[FLAG]" :changed="cfg.isChanged(FLAG)" :error="cfg.fieldErrors[FLAG]"
          data-testid="pricing-rules-flag" @update:model-value="(v) => (cfg.form[FLAG] = v)" />
        <SettingField v-if="quotaItem" :item="quotaItem" :model-value="cfg.form[QUOTA]" :effective="cfg.data?.values[QUOTA]" :changed="cfg.isChanged(QUOTA)" :error="cfg.fieldErrors[QUOTA]"
          data-testid="pricing-rules-quota" @update:model-value="(v) => (cfg.form[QUOTA] = v)" />
        <div class="bo-pr__actions">
          <EkButton tone="primary" icon="mdi-file-eye-outline" :loading="cfg.saving" :disabled="!cfg.changedKeys.length && !cfg.hasDraft" data-testid="pricing-rules-save" @click="cfg.saveAndPreview()">Taslak kaydet ve önizle</EkButton>
          <span class="bo-panel__hint">Kapatma tüm müşterilerde öneri üretimini ve onaylı uygulamayı ~15 sn içinde durdurur; kurallar silinmez. Yayın gerekçe ister ve geçmişte görünür.</span>
        </div>
      </div>

      <StateBlock :phase="overview.phase" :error="overview.error" skeleton="cards" :rows="2" error-title="Fiyat kuralı istatistikleri okunamadı" @retry="overview.load()">
        <dl v-if="o" class="bo-pr__tiles" data-testid="pricing-rules-stats">
          <div class="bo-pr__tile"><dt>Açık müşteri</dt><dd><span class="bo-pr__value ek-num">{{ fmtInt(o.tenantsEnabled) }}</span><span class="bo-pr__sub">/ {{ fmtInt(o.scannedTenants) }} aktif müşteri tarandı</span></dd></div>
          <div class="bo-pr__tile"><dt>Kural</dt><dd><span class="bo-pr__value ek-num">{{ fmtInt(o.rules.enabled) }}</span><span class="bo-pr__sub">açık · toplam {{ fmtInt(o.rules.total) }} ({{ fmtInt(o.tenantsWithRules) }} müşteride)</span></dd></div>
          <div class="bo-pr__tile" data-tile="paused"><dt>Duraklatılan kural</dt><dd><span class="bo-pr__value ek-num">{{ fmtInt(o.rules.pausedExternal + o.rules.pausedOscillation) }}</span><span class="bo-pr__sub">dış değişiklik {{ fmtInt(o.rules.pausedExternal) }} · salınım {{ fmtInt(o.rules.pausedOscillation) }}</span></dd></div>
          <div class="bo-pr__tile"><dt>Açık öneri</dt><dd><span class="bo-pr__value ek-num">{{ fmtInt(o.suggestions.open) }}</span><span class="bo-pr__sub">engellenen {{ fmtInt(o.suggestions.blocked) }}</span></dd></div>
          <div class="bo-pr__tile"><dt>Son 7 gün</dt><dd><span class="bo-pr__value ek-num">{{ fmtInt(o.suggestions.applied7d) }}</span><span class="bo-pr__sub">onaylanıp uygulandı · reddedilen {{ fmtInt(o.suggestions.dismissed7d) }}</span></dd></div>
        </dl>
        <p class="bo-pr__note">
          <v-icon icon="mdi-shield-lock-outline" aria-hidden="true" />
          Otomatik (müşteri onaysız) fiyat uygulaması bu sürümde yoktur; hukuk görüşü bekleniyor (PRC-R3). Sayaçlar hiçbir müşterinin fiyat kararında kullanılmaz.
        </p>
      </StateBlock>
    </EkCard>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { EkAlert, EkButton, EkCard, EkStatusChip } from '@entegrasyonik/ui/components'
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
.bo-pr__attention { display: flex; flex-direction: column; gap: var(--ek-space-2); margin-bottom: var(--ek-space-3); }
.bo-pr__form { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ek-space-2); max-width: 720px; padding: var(--ek-space-5) var(--ek-space-5) 0; }
.bo-pr__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ek-space-3); }
.bo-pr__tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--ek-space-4); margin: 0; padding: var(--ek-space-5); }
.bo-pr__tile dt { color: var(--ek-color-content-muted); font-size: var(--ek-type-label-size); }
.bo-pr__tile dd { display: flex; flex-direction: column; gap: 2px; margin: var(--ek-space-1) 0 0; }
.bo-pr__value { color: var(--ek-color-content-strong); font-size: var(--ek-type-heading-size); font-weight: var(--ek-font-weight-semibold); }
.bo-pr__sub { color: var(--ek-color-content-muted); font-size: var(--ek-type-label-size); }
.bo-pr__note { display: flex; align-items: flex-start; gap: var(--ek-space-2); margin: 0; padding: 0 var(--ek-space-5) var(--ek-space-5); color: var(--ek-color-content-muted); font-size: var(--ek-type-label-size); }
</style>
