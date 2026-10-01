<!--
  PRC-R0 — ürün listesi başlığında sakin "Maliyet kapsamı %X" göstergesi. %100 değilse ipucu: maliyeti girilmemiş ürünlerde
  kâr hesaplanmaz (görünür metin + erişilebilir açıklama; yalnız hover'a bağlı DEĞİL). Yükleniyor: iskelet; hata: yeniden dene;
  yetki yok / veri yok: gösterilmez (liste kendi yetkisiyle çalışır).
-->
<template>
  <span v-if="state !== 'hidden'" class="ccc" role="status" data-testid="cost-coverage">
    <span v-if="state === 'loading'" class="ccc__skeleton" aria-hidden="true"></span>
    <span v-if="state === 'loading'" class="ek-sr-only">{{ t('pricing.coverage.loading') }}</span>

    <template v-else-if="state === 'error'">
      <span class="ccc__muted">{{ t('pricing.coverage.error') }}</span>
      <button type="button" class="ccc__retry" @click="load">{{ t('pricing.retry') }}</button>
    </template>

    <template v-else-if="view">
      <EkStatusChip v-if="view.complete" tone="success" icon="mdi-check-circle-outline"
        :label="t('pricing.coverage.label', { percent: percentText })" />
      <!-- Eksik kapsam: tek, kompakt BİLGİ hapı (info tonu). Açıklama ipucunda + ekran okuyucuya `aria-describedby`. -->
      <EkTooltip v-else :text="t('pricing.coverage.hint')" location="bottom" :open-delay="200">
        <span class="ccc__info" tabindex="0" aria-describedby="ccc-hint">
          <v-icon icon="mdi-information-outline" size="14" aria-hidden="true" />
          <span class="ccc__full">{{ t('pricing.coverage.label', { percent: percentText }) }}</span>
          <span class="ccc__short" aria-hidden="true">{{ percentText }}</span>
        </span>
      </EkTooltip>
      <span v-if="!view.complete" id="ccc-hint" class="ek-sr-only">{{ t('pricing.coverage.hint') }}</span>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { EkStatusChip, EkTooltip } from '@entegrasyonik/ui/components'
import { coverageView, usePricingApi, type CostCoverage } from '@/composables/usePricingApi'

const { t, locale } = useI18n()
const api = usePricingApi()
const state = ref<'loading' | 'ready' | 'error' | 'hidden'>('loading')
const coverage = ref<CostCoverage | null>(null)
const view = computed(() => coverageView(coverage.value))
// Yüzde işareti Türkçede önde (%60), İngilizcede sonda (60%).
const percentText = computed(() => (locale.value === 'en' ? `${view.value?.percent}%` : `%${view.value?.percent}`))

async function load() {
  state.value = 'loading'
  const res = await api.costCoverage()
  if (!res.ok) { state.value = res.reason === 'unauthorized' ? 'hidden' : 'error'; return }
  coverage.value = res.data
  state.value = coverageView(res.data)?.empty ? 'hidden' : 'ready'
}
onMounted(load)
defineExpose({ load })
</script>

<style scoped>
.ccc { display: inline-flex; align-items: center; flex-wrap: wrap; gap: var(--ek-space-1) var(--ek-space-2); min-width: 0; }
.ccc__skeleton { display: inline-block; width: 120px; height: 22px; border-radius: var(--ek-radius-chip); background: var(--ek-color-surface-muted); }
.ccc__muted, .ccc__hint { color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); }
.ccc__retry { color: var(--ek-color-action); font-size: var(--ek-type-caption-size); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; border-radius: var(--ek-radius-control); }
.ccc__retry:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.ccc__info {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 var(--ek-space-2) 0 6px;
  border: 1px solid var(--ek-color-info-border);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
  line-height: 1;
  white-space: nowrap;
  cursor: help;
}
.ccc__info:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.ccc__short { display: none; }
/* Dar ekranda yalnız ikon + yüzde (tam metin ekran okuyucuda ve ipucunda kalır). */
@media (max-width: 599px) {
  .ccc__full { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .ccc__short { display: inline; }
}

</style>
