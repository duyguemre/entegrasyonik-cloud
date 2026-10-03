<template>

  <div class="psvc-root">

    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <ProductStepCard v-if="singleVariant && singleVariant.prices" class="psvc-card" title="Tekil ürün bilgisi" icon="mdi-barcode-scan"
      description="Varyantsız ürünün stok kodu, barkod, fiyat ve stok bilgileri.">
      <template #actions>
        <EkButton tone="secondary" icon="mdi-tune-variant"
          @click.stop="isVariantAttributesDialog = !isVariantAttributesDialog; editingVariant = singleVariant">
          Ürün Özellikleri
        </EkButton>
      </template>
      <!-- FE-LOCAL-1057: "Detay bilgiler" adımıyla AYNI düzen — başlık bantlı grup kartları; satırda solda ad + açıklama,
           sağda alan. Alanlar, kurallar ve `data-pf-field` çapaları aynen korunur (erişilebilir ad `aria-label`). -->
      <div class="psvc-groups">
        <section class="psvc-group" aria-labelledby="psvc-g-code">
          <header class="psvc-group__head">
            <span class="psvc-group__icon" aria-hidden="true"><v-icon icon="mdi-barcode" /></span>
            <div>
              <h3 id="psvc-g-code" class="psvc-group__title">Kod ve stok</h3>
              <p class="psvc-group__desc">Ürünü tanımlayan kodlar ve satışa açık miktar</p>
            </div>
          </header>
          <div class="psvc-rows">
            <div class="psvc-row">
              <div class="psvc-row__text">
                <span class="psvc-row__label">Stok kodu <span class="psvc-req" aria-hidden="true">*</span></span>
                <p class="psvc-row__desc">Mağazanızdaki benzersiz ürün kodu.</p>
              </div>
              <div class="psvc-row__control">
                <v-text-field clearable :rules="formRules.titleRules" maxlength="160" counter data-pf-field="stockcode" variant="outlined"
                  v-model="singleVariant.stockcode" aria-label="Stok Kodu *" placeholder="Örn. TSHIRT-001" hide-details="auto" class="psvc-input" />
              </div>
            </div>
            <div class="psvc-row">
              <div class="psvc-row__text">
                <span class="psvc-row__label">Barkod <span class="psvc-req" aria-hidden="true">*</span></span>
                <p class="psvc-row__desc">Pazaryerlerine gönderilen barkod.</p>
              </div>
              <div class="psvc-row__control">
                <v-text-field clearable :rules="formRules.titleRules" maxlength="160" counter data-pf-field="barcode" variant="outlined"
                  v-model="singleVariant.barcode" aria-label="Barkod *" placeholder="Örn. 8690000000000" hide-details="auto" class="psvc-input" />
              </div>
            </div>
            <div class="psvc-row">
              <div class="psvc-row__text">
                <span class="psvc-row__label">Stok adedi <span class="psvc-req" aria-hidden="true">*</span></span>
                <p class="psvc-row__desc">Satışa açık stok miktarı.</p>
              </div>
              <div class="psvc-row__control">
                <v-text-field clearable :rules="stockRules" maxlength="160" type="tel" inputmode="numeric" counter variant="outlined"
                  v-model="singleVariant.stock" aria-label="Stok Adedi *" suffix="adet" hide-details="auto" class="psvc-input" />
              </div>
            </div>
            <div class="psvc-row">
              <div class="psvc-row__text">
                <span class="psvc-row__label">Raf</span>
                <p class="psvc-row__desc">Depodaki raf/konum bilgisi (isteğe bağlı).</p>
              </div>
              <div class="psvc-row__control">
                <v-text-field clearable :rules="formRules.subTitleRules" maxlength="160" counter variant="outlined"
                  v-model="singleVariant.shelf" aria-label="Raf" placeholder="Örn. A-01" hide-details="auto" class="psvc-input" />
              </div>
            </div>
          </div>
        </section>

        <section class="psvc-group" aria-labelledby="psvc-g-price">
          <header class="psvc-group__head">
            <span class="psvc-group__icon" aria-hidden="true"><v-icon icon="mdi-currency-try" /></span>
            <div>
              <h3 id="psvc-g-price" class="psvc-group__title">Fiyat</h3>
              <p class="psvc-group__desc">Satış fiyatı, kanal fiyatları ve maliyet</p>
            </div>
          </header>
          <div class="psvc-rows">
            <template v-if="singleVariant?.prices?.isPlatformBasedPrice == false">
              <div class="psvc-row">
                <div class="psvc-row__text">
                  <span class="psvc-row__label">{{ $t('productDefinitions.product.variants.salePrice') }} <span class="psvc-req" aria-hidden="true">*</span></span>
                  <p class="psvc-row__desc">Müşterinin ödediği fiyat (KDV dahil).</p>
                </div>
                <div class="psvc-row__control" data-pf-field="salePrice">
                  <VCurrencyComponentVue v-model="singleVariant.prices.salePrice" :rules="formRules.mandatoryRule" :compact="true"
                    :aria-label="`${$t('productDefinitions.product.variants.salePrice')} *`" clearable :isIconExist="false" />
                </div>
              </div>
              <div class="psvc-row">
                <div class="psvc-row__text">
                  <span class="psvc-row__label">{{ $t('productDefinitions.product.variants.marketPrice') }} <span class="psvc-req" aria-hidden="true">*</span></span>
                  <p class="psvc-row__desc">Üstü çizili gösterilen liste fiyatı.</p>
                </div>
                <div class="psvc-row__control">
                  <VCurrencyComponentVue v-model="singleVariant.prices.marketPrice" :rules="formRules.mandatoryRule" :compact="true"
                    :aria-label="`${$t('productDefinitions.product.variants.marketPrice')} *`" clearable :isIconExist="false" />
                </div>
              </div>
            </template>
            <!-- FR2-PFORM 25: kanal başına etkin satış fiyatı (özel / ana) tek bakışta; tıklayınca kanal fiyatları. -->
            <div v-else class="psvc-row psvc-row--block">
              <button type="button" class="psvc-platform-prices" data-pf-field="channelPrices"
                @click="isVariantPlatformPricesDialog = true; editingVariant = singleVariant">
                <span class="psvc-cp__head">
                  <span class="psvc-kv__label">Kanal fiyatları</span>
                  <span class="psvc-platform-prices__action"><v-icon icon="mdi-pencil-outline" size="16" aria-hidden="true" /> Düzenle</span>
                </span>
                <span class="psvc-cp__list">
                  <span v-for="row in channelPriceRows" :key="row.code" class="psvc-cp__item">
                    <EkPlatformMark :name="row.title" :code="row.code" />
                    <strong class="ek-num">{{ formatCurrency(row.sale) }}</strong>
                    <span class="psvc-cp__src" :class="{ 'is-custom': row.custom }">{{ row.custom ? 'özel' : 'ana fiyat' }}</span>
                    <v-icon v-if="row.issues.some((i) => i.level === 'error')" icon="mdi-alert-circle-outline" class="psvc-cp__err"
                      :aria-label="row.issues[0].message" />
                  </span>
                  <span v-if="!channelPriceRows.length" class="psvc-cp__none">Bağlı kanal yok</span>
                </span>
              </button>
            </div>
            <div class="psvc-row" :class="{ 'is-on': singleVariant.prices.isPlatformBasedPrice }">
              <div class="psvc-row__text">
                <span class="psvc-row__label">{{ $t('productDefinitions.product.platformPrice') }}</span>
                <p class="psvc-row__desc">Kanallara farklı fiyat verin; girmediğiniz kanal ana fiyatla satılır.</p>
              </div>
              <div class="psvc-row__control psvc-row__control--end">
                <v-checkbox :aria-label="$t('productDefinitions.product.platformPrice')" hide-details density="compact"
                  v-model="singleVariant.prices.isPlatformBasedPrice" @click.stop />
              </div>
            </div>
            <!-- PRC-R0: birim alış maliyeti (KDV hariç). Boş = maliyet yok (0 değil); ürün kaydıyla DEĞİL, ayrı `setVariantCosts` ile kaydedilir. -->
            <div class="psvc-row">
              <div class="psvc-row__text">
                <span class="psvc-row__label">{{ $t('pricing.cost.label') }}</span>
                <p class="psvc-row__desc">{{ $t('pricing.cost.hint') }}</p>
              </div>
              <div class="psvc-row__control" data-pf-field="costPrice">
                <VCurrencyComponentVue v-model="singleVariant.costPrice" :compact="true" nullToEmpty
                  :aria-label="$t('pricing.cost.label')" clearable :isIconExist="false" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </ProductStepCard>

    <div>

      <EkDialogHost :model-value="isVariantPlatformPricesDialog || isVariantAttributesDialog" :attach="dialogAttach"
        width="xl"
        @update:model-value="(v) => { if (!v) { isVariantPlatformPricesDialog = false; isVariantAttributesDialog = false } }">

        <!-- keep-alive YOK: diyalog taslakla çalışır; her açılışta varyantın güncel değerleriyle yeniden kurulur. -->
        <ProductVariantAttributesComponent v-if="isVariantAttributesDialog" v-model="isVariantAttributesDialog" :editingVariant="editingVariant"
          key="ProductVariantAttributesComponent" @close="isVariantAttributesDialog = false" :productInfoForm="productInfoForm" />

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
import { ref, computed, onBeforeMount, onMounted } from 'vue'
import { EkFormSection, EkButton, EkDialogHost, EkPlatformMark } from '@entegrasyonik/ui/components'
import { useIntegrationStore } from '@/stores/integrationStore'
import { channelRows } from './channelPriceModel'
import { useI18n } from 'vue-i18n';
import LoadingComponent from '@/components/LoadingComponent.vue'
import ProductStepCard from '../crud/ProductStepCard.vue'

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

const integrationStore = useIntegrationStore()
const channelPriceRows = computed(() => channelRows(
  [...(integrationStore.getClientMarketplaces() ?? []), ...(integrationStore.getClientECommerces() ?? [])].map((c: any) => ({ code: c.code, title: c.title || c.code })),
  props.singleVariant,
))

</script>

<style scoped>
/* FE R4 B: iki sütun — solda kimlik (kod) + stok, sağda fiyat (kanal fiyatları + maliyet); dar kapta alt alta. */
.psvc-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--ek-space-8);
}

.psvc-col {
  min-width: 0;
}

.psvc-col--price {
  padding-left: var(--ek-space-8);
  border-left: 1px solid var(--ek-color-border-subtle);
}

.psvc-platform-prices {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--ek-space-3);
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

.psvc-cp__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.psvc-cp__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2) var(--ek-space-5);
}

.psvc-cp__item {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-strong);
}

.psvc-cp__src {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.psvc-cp__src.is-custom {
  color: var(--ek-color-action-emphasis);
}

.psvc-cp__err {
  color: var(--ek-color-error);
  font-size: 16px;
}

.psvc-cp__none {
  color: var(--ek-color-content-muted);
}

.psvc-chk {
  display: flex;
  flex-direction: column;
}

.psvc-chk__hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.psvc-cost-hint {
  margin: var(--ek-space-1) 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
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
  color: var(--ek-color-action);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
}

@media (max-width: 1023px) {
  .psvc-columns {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .psvc-col--price {
    margin-top: var(--ek-space-6);
    padding: var(--ek-space-5) 0 0;
    border-top: 1px solid var(--ek-color-border-subtle);
    border-left: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .psvc-platform-prices {
    transition: none;
  }
}

/* ================= FE-LOCAL-1057 — "Detay bilgiler" ile aynı grup/satır düzeni ================= */
.psvc-groups {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--ek-space-5);
  align-items: start;
}

.psvc-group {
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.psvc-group__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.psvc-group__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  color: var(--ek-color-action-emphasis);
}

.psvc-group__icon .v-icon {
  font-size: var(--ek-icon-md);
}

.psvc-group__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-semibold);
}

.psvc-group__desc {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.psvc-rows {
  display: flex;
  flex-direction: column;
}

.psvc-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 15rem);
  gap: var(--ek-space-2) var(--ek-space-5);
  align-items: start;
  padding: var(--ek-space-4) var(--ek-space-5);
}

.psvc-row + .psvc-row {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.psvc-row--block {
  grid-template-columns: minmax(0, 1fr);
}

.psvc-row.is-on {
  background: var(--ek-color-action-subtle);
}

.psvc-row__text {
  min-width: 0;
  padding-top: var(--ek-space-2);
}

.psvc-row__label {
  display: block;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
}

.psvc-req {
  color: var(--ek-color-error);
}

.psvc-row__desc {
  margin: 2px 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.psvc-row__control {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.psvc-row__control--end {
  align-items: flex-end;
  padding-top: var(--ek-space-1);
}

.psvc-input :deep(.v-field) {
  background: var(--ek-color-surface);
}

.psvc-input :deep(input::placeholder) {
  color: var(--ek-color-content-subtle);
  opacity: 1;
}

.psvc-platform-prices {
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-muted);
}

@media (max-width: 1023px) {
  .psvc-groups {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 599px) {
  .psvc-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .psvc-row__control--end {
    align-items: flex-start;
  }
}
</style>

<style>
/* ADR-0015 B5-2 — satir ici stillerden tasinan siniflar (autostyle). Satir ici stilin onceligi
   !important ile korunur; ayni ozellikte Vuetify yardimci sinifi/`color` prop cakismasi varsa
   (satir ici stil zaten yeniliyordu) !important eklenmez. Scope'suz: v-dialog/v-menu ve alt
   bilesen kokleri scoped ozniteligi almayabilir; onek dosyaya ozgudur. */

.psvc-s11 {
  transition: opacity var(--ek-motion-reveal) !important;
}

.psvc-dim {
  opacity: .2 !important;
}
</style>
