<template>

  <div class="psvc-root">

    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <section v-if="singleVariant && singleVariant.prices" class="psvc-card" aria-labelledby="psvc-title">
      <h2 id="psvc-title" class="psvc-title">Tekil ürün bilgisi</h2>
      <p class="psvc-desc">Varyantsız ürünün stok, barkod ve fiyat bilgileri.</p>

      <EkFormSection title="Kod bilgileri" icon="mdi-barcode">
        <v-text-field clearable :rules="formRules.titleRules" maxlength="160" counter data-pf-field="stockcode"
          v-model="singleVariant.stockcode" label="Stok Kodu *" hint="Mağazanızdaki benzersiz ürün kodu" persistent-hint />
        <v-text-field clearable :rules="formRules.titleRules" maxlength="160" counter data-pf-field="barcode"
          v-model="singleVariant.barcode" label="Barkod *" hint="Pazaryerlerine gönderilen barkod" persistent-hint />
      </EkFormSection>

      <EkFormSection title="Fiyat" icon="mdi-currency-try">
        <template v-if="singleVariant?.prices?.isPlatformBasedPrice == false">
          <div data-pf-field="salePrice">
            <VCurrencyComponentVue v-model="singleVariant.prices.salePrice" :rules="formRules.mandatoryRule" :compact="true"
              :label="`${$t('productDefinitions.product.variants.salePrice')} *`" clearable :isIconExist="false" />
          </div>
          <VCurrencyComponentVue v-model="singleVariant.prices.marketPrice" :rules="formRules.mandatoryRule" :compact="true"
            :label="`${$t('productDefinitions.product.variants.marketPrice')} *`" clearable :isIconExist="false" />
        </template>
        <button v-else type="button" class="psvc-platform-prices ek-span-2"
          @click="isVariantPlatformPricesDialog = true; editingVariant = singleVariant">
          <span class="psvc-kv">
            <span class="psvc-kv__label">Satış Fiyatı</span>
            <span class="psvc-kv__value ek-num">{{ formatCurrency(findMinimumSalePrice(singleVariant.platforms)) }} -
              {{ formatCurrency(findMaximumSalePrice(singleVariant.platforms)) }}</span>
          </span>
          <span class="psvc-kv">
            <span class="psvc-kv__label">Piyasa Fiyatı</span>
            <span class="psvc-kv__value ek-num">{{ formatCurrency(findMinimumMarketPrice(singleVariant.platforms)) }} -
              {{ formatCurrency(findMaximumMarketPrice(singleVariant.platforms)) }}</span>
          </span>
          <span class="psvc-platform-prices__action">
            <v-icon icon="mdi-pencil-outline" size="16" aria-hidden="true" /> Platform fiyatlarını düzenle
          </span>
        </button>
        <v-checkbox class="ek-span-full" :label="$t('productDefinitions.product.platformPrice')" hide-details
          v-model="singleVariant.prices.isPlatformBasedPrice" @click.stop />
      </EkFormSection>

      <EkFormSection title="Stok" icon="mdi-warehouse">
        <v-text-field clearable :rules="stockRules" maxlength="160" type="tel" inputmode="numeric" counter
          v-model="singleVariant.stock" label="Stok Adedi *" hint="Satışa açık stok miktarı" persistent-hint />
        <v-text-field clearable :rules="formRules.subTitleRules" maxlength="160" counter
          v-model="singleVariant.shelf" label="Raf" hint="Depodaki raf/konum bilgisi (isteğe bağlı)" persistent-hint />
      </EkFormSection>

      <div class="psvc-actions">
        <EkButton tone="secondary" icon="mdi-tune-variant"
          @click.stop="isVariantAttributesDialog = !isVariantAttributesDialog; editingVariant = singleVariant">
          Ürün Özellikleri
        </EkButton>
      </div>
    </section>

    <div>

      <EkDialogHost :model-value="isVariantPlatformPricesDialog || isVariantAttributesDialog" :attach="dialogAttach"
        :width="isVariantAttributesDialog ? 'xl' : 'lg'"
        @update:model-value="(v) => { if (!v) { isVariantPlatformPricesDialog = false; isVariantAttributesDialog = false } }">

        <keep-alive>
          <ProductVariantAttributesComponent v-model="isVariantAttributesDialog" :editingVariant="editingVariant" key="ProductImagesComponent"
            @close="isVariantAttributesDialog = false" v-if="isVariantAttributesDialog == true"
            :productInfoForm="productInfoForm" class="psvc-s11" :class="{ 'psvc-dim': !isVariantAttributesDialog }" />
        </keep-alive>

        <keep-alive>
          <ProductVariantPlatformPricesComponent v-model="isVariantPlatformPricesDialog"
            :editingVariant="editingVariant" key="ProductImagesComponent"
            @close="isVariantPlatformPricesDialog = false" v-if="isVariantPlatformPricesDialog == true"
            :productInfoForm="productInfoForm" class="psvc-s11" :class="{ 'psvc-dim': !isVariantPlatformPricesDialog }" />
        </keep-alive>

      </EkDialogHost>

    </div>
  </div>

</template>

<script setup lang="ts">
import { formatMoney } from '@entegrasyonik/ui/format'
import { ref, onBeforeMount, onMounted } from 'vue'
import { EkFormSection, EkButton, EkDialogHost } from '@entegrasyonik/ui/components'
import { useI18n } from 'vue-i18n';
import LoadingComponent from '@/components/LoadingComponent.vue'

import useFormRules from '@/composables/formrules';
import VCurrencyComponentVue from '@/components/VCurrencyComponent.vue';
import ProductVariantAttributesComponent from './ProductVariantAttributesComponent.vue';
import ProductVariantPlatformPricesComponent from './ProductVariantPlatformPricesComponent.vue';

const emits = defineEmits(['refreshImages', 'refreshVariants', 'refreshTotalVariantsStockCount', 'close'])

const formRules = useFormRules()
// Stok adedi sayıdır: zorunlu + yalnız rakam (önceki 2–160 karakter kuralı "5" gibi tek haneli stoku hatalı gösteriyordu).
const stockRules = [...formRules.mandatoryRule, ...formRules.numberRulesWithoutZero]

var choicesStoreChoices: any = undefined
const loadingComponentRef: any = ref(null)
const isVariantAttributesDialog = ref(false)
const isVariantPlatformPricesDialog = ref(false)

const { t } = useI18n()
const editingVariant: any = ref({})

const props = defineProps<{
  productInfoForm: any,
  singleVariant: any,
  dialogAttach: any
}>()

const formatCurrency = (number: number) => {
  return formatMoney(Number(number))
}

onBeforeMount(() => {
})

onMounted(() => {
})

const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const findMinimumSalePrice = (platforms: any) => {
  if(!platforms) return 0
  const res = Object.values(platforms).reduce((min: any, platform: any) =>
    platform.prices.salePrice && platform.prices.salePrice < min ? platform.prices.salePrice : min, Infinity);
  if (res == Infinity) return 0
  return Number(res)
}
const findMinimumMarketPrice = (platforms: any) => {
  if(!platforms) return 0
  const res = Object.values(platforms).reduce((min: any, platform: any) =>
    platform.prices.marketPrice && platform.prices.marketPrice < min ? platform.prices.marketPrice : min, Infinity);
  if (res == Infinity) return 0
  return Number(res)
}
const findMaximumSalePrice = (platforms: any) => {
  if(!platforms) return 0
  return Number(Object.values(platforms).reduce((max: any, platform: any) =>
    platform.prices.salePrice && platform.prices.salePrice > max ? platform.prices.salePrice : max, 0))
}
const findMaximumMarketPrice = (platforms: any) => {
  if(!platforms) return 0
  return Number(Object.values(platforms).reduce((max: any, platform: any) =>
    platform.prices.marketPrice && platform.prices.marketPrice > max ? platform.prices.marketPrice : max, 0))
}

</script>

<style scoped>
.psvc-root {
  max-width: 880px;
  margin: 0 auto;
}

.psvc-card {
  padding: var(--ek-space-6);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.psvc-title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.psvc-desc {
  margin: var(--ek-space-1) 0 var(--ek-space-5);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.psvc-platform-prices {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-6);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-default);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.psvc-platform-prices:hover {
  border-color: var(--ek-color-action-border);
}

.psvc-platform-prices:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.psvc-kv {
  display: flex;
  flex-direction: column;
}

.psvc-kv__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.psvc-kv__value {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.psvc-platform-prices__action {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin-left: auto;
  color: var(--ek-color-action);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
}

.psvc-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--ek-space-5);
}

@media (max-width: 599px) {
  .psvc-card {
    padding: var(--ek-space-4);
  }
}
</style>

<style>
/* ADR-0015 B5-2 — satir ici stillerden tasinan siniflar (autostyle). Satir ici stilin onceligi
   !important ile korunur; ayni ozellikte Vuetify yardimci sinifi/`color` prop cakismasi varsa
   (satir ici stil zaten yeniliyordu) !important eklenmez. Scope'suz: v-dialog/v-menu ve alt
   bilesen kokleri scoped ozniteligi almayabilir; onek dosyaya ozgudur. */

.psvc-s11 {
  transition: opacity var(--ek-duration-base) var(--ek-easing-standard) !important;
}

.psvc-dim {
  opacity: .2 !important;
}
</style>
