<!--
  frontend/src/components/productDefinitions/crud/ProductInfoFormComponent.vue

  Ürün tanımlama/güncelleme sihirbazının "Ürün Tanımı" adımı (ProductDefinitionView ve
  ProductUpdateView ortak gövdesi). DS-v2 Aşama 2: önceden resim galerisi düğmesi
  `position:absolute; top:100px` ile formun ÜSTÜNE biniyor, alanlar `v-col` boşluk
  kolonlarıyla ortalanıyordu (dar ekranda iç içe giriyordu). Artık tek ızgara:
  solda galeri kutucuğu, sağda `EkFormSection` bölümleri (ürün tipi · temel bilgiler ·
  açıklama); tablet/mobilde galeri üste iner.
  Alanlar, kurallar ve v-model bağları DEĞİŞMEDİ (çağıran görünümün `productInfoForm`
  nesnesi doğrudan düzenlenir).
-->
<template>
  <div class="pif-layout">
    <div class="pif-gallery">
      <button type="button" class="pif-gallery__tile" data-pf-field="gallery" :disabled="galleryDisabled" @click="emit('openGallery')">
        <span v-if="!productInfoForm.images || !productInfoForm.images[0]" class="pif-gallery__empty">
          <v-icon icon="mdi-image-outline" size="96" aria-hidden="true" />
        </span>
        <span v-else class="pif-gallery__image">
          <ProductImageComponent v-model="productInfoForm.images[0]" :productId="imageProductId as string" :height="176" />
        </span>
        <span class="pif-gallery__label">
          <v-icon icon="mdi-image-multiple-outline" size="16" aria-hidden="true" />
          Resim Galerisi
          <span v-if="productInfoForm.images" class="pif-gallery__count ek-num">({{ productInfoForm.images?.length }})</span>
        </span>
      </button>
    </div>

    <div class="pif-fields">
      <EkFormSection title="Ürün tipi" icon="mdi-shape-outline">
        <v-radio-group inline hide-details v-model="productInfoForm.hasVariant" class="pif-radios">
          <v-radio :value="false" :label="$t('productDefinitions.product.define.withoutVariant')" />
          <v-radio :value="true" :label="$t('productDefinitions.product.define.withVariant')" />
        </v-radio-group>
        <v-text-field v-if="productInfoForm.hasVariant" clearable maxlength="32" counter data-pf-field="maincode"
          :rules="formRules.stockcodeRules" v-model="productInfoForm.maincode"
          :label="`${$t('productDefinitions.product.define.maincode')} *`"
          :hint="$t('productDefinitions.product.define.maincodeDesc')" persistent-hint />
      </EkFormSection>

      <EkFormSection title="Temel bilgiler" icon="mdi-text-box-outline"
        description="Marka, listenizdeki ana marka (yoksa ilk marka) olarak önceden seçilir; ürününüz başka bir markaya aitse değiştirin.">
        <div class="ek-span-full" data-pf-field="brand">
          <BrandSelectBoxComponent v-model="productInfoForm.brand" :mandatory="true" />
        </div>
        <v-text-field class="ek-span-full" clearable :rules="formRules.titleRules" maxlength="160" counter
          data-pf-field="title" v-model="productInfoForm.title" :label="`${$t('productDefinitions.product.define.productTitle')} *`"
          :hint="$t('productDefinitions.product.define.productTitleDesc')" persistent-hint />
      </EkFormSection>

      <EkFormSection title="Ürün açıklaması" icon="mdi-text-long" :columns="1">
        <div class="pif-editor">
          <QuillEditor v-model:content="productInfoForm.description" content-type="html" theme="snow"
            :toolbar="quillToolbar" />
        </div>
      </EkFormSection>
    </div>
  </div>
</template>

<script setup lang="ts">
import { QuillEditor } from '@vueup/vue-quill'
import '@vueup/vue-quill/dist/vue-quill.snow.css'
import { EkFormSection } from '@entegrasyonik/ui/components'
import BrandSelectBoxComponent from '@/components/common/BrandSelectBoxComponent.vue'
import ProductImageComponent from '@/components/productDefinitions/products/ProductImageComponent.vue'
import useFormRules from '@/composables/formrules'

defineProps<{
  productInfoForm: any
  quillToolbar: any
  /** Galeri, ürün kimliği (kayıtlı `_id` veya taslak `tempId`) oluşmadan açılamaz — çağıran belirler. */
  galleryDisabled: boolean
  /** Kapak resmi bileşenine verilen ürün kimliği — çağıran belirler (tanımlamada `tempId`). */
  imageProductId: string | undefined
}>()

const emit = defineEmits<{ openGallery: [] }>()
const formRules: any = useFormRules()
</script>

<style scoped>
.pif-layout {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: var(--ek-space-6);
  align-items: start;
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--ek-space-6);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.pif-gallery__tile {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-family: inherit;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.pif-gallery__tile:hover:not(:disabled) {
  border-color: var(--ek-color-action-border);
}

.pif-gallery__tile:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.pif-gallery__tile:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.pif-gallery__empty,
.pif-gallery__image {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 176px;
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-subtle);
}

.pif-gallery__label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
}

.pif-gallery__count {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.pif-fields {
  min-width: 0;
}

.pif-radios :deep(.v-selection-control-group) {
  gap: var(--ek-space-4);
}

.pif-editor {
  height: 360px;
  display: flex;
  flex-direction: column;
}

.pif-editor :deep(.ql-toolbar) {
  border-color: var(--ek-color-border-input);
  border-radius: var(--ek-radius-control) var(--ek-radius-control) 0 0;
}

.pif-editor :deep(.ql-container) {
  flex: 1;
  min-height: 0;
  border-color: var(--ek-color-border-input);
  border-radius: 0 0 var(--ek-radius-control) var(--ek-radius-control);
  font-family: inherit;
}

@media (max-width: 1023px) {
  .pif-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .pif-gallery__tile {
    max-width: 240px;
  }
}

@media (max-width: 599px) {
  .pif-layout {
    padding: var(--ek-space-4);
  }
}
</style>
