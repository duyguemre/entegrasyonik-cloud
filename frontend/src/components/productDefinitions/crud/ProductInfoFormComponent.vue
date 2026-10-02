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
  <ProductStepCard :step="2" title="Ürün tanımı" icon="mdi-text-box-edit-outline"
    description="Ürünün kimliği: tipi, markası, başlığı, görselleri ve açıklaması.">
    <ProductFormSection title="Ürün tipi" icon="mdi-shape-outline" description="Satış biçimini seçin; sonraki adım buna göre şekillenir." bare>
      <v-radio-group inline hide-details v-model="productInfoForm.hasVariant" class="pif-radios" aria-label="Ürün tipi">
        <v-radio :value="false" :label="$t('productDefinitions.product.define.withoutVariant')">
          <template #label>
            <span class="pif-choice">
              <span class="pif-choice__text">
                <span class="pif-choice__title">{{ $t('productDefinitions.product.define.withoutVariant') }}</span>
                <span class="pif-choice__desc">Tek stok kodu ve barkodla satılır.</span>
              </span>
            </span>
          </template>
        </v-radio>
        <v-radio :value="true" :label="$t('productDefinitions.product.define.withVariant')">
          <template #label>
            <span class="pif-choice">
              <span class="pif-choice__text">
                <span class="pif-choice__title">{{ $t('productDefinitions.product.define.withVariant') }}</span>
                <span class="pif-choice__desc">Renk, beden gibi her birleşim ayrı kod, fiyat ve stok taşır.</span>
              </span>
            </span>
          </template>
        </v-radio>
      </v-radio-group>
    </ProductFormSection>

    <ProductFormSection title="Temel bilgiler" icon="mdi-card-text-outline"
      description="Marka, listenizdeki ana marka olarak önceden seçilir; başka bir markaya aitse değiştirin.">
      <div :class="productInfoForm.hasVariant ? '' : 'ek-span-full'" data-pf-field="brand">
        <BrandSelectBoxComponent v-model="productInfoForm.brand" :mandatory="true" />
      </div>
      <v-text-field v-if="productInfoForm.hasVariant" clearable maxlength="32" counter data-pf-field="maincode"
        :rules="formRules.stockcodeRules" v-model="productInfoForm.maincode"
        :label="`${$t('productDefinitions.product.define.maincode')} *`"
        :hint="$t('productDefinitions.product.define.maincodeDesc')" persistent-hint />
      <v-text-field class="ek-span-full" clearable :rules="formRules.titleRules" maxlength="160" counter
        data-pf-field="title" v-model="productInfoForm.title" :label="`${$t('productDefinitions.product.define.productTitle')} *`"
        :hint="$t('productDefinitions.product.define.productTitleDesc')" persistent-hint />
    </ProductFormSection>

    <ProductFormSection title="Görseller" icon="mdi-image-multiple-outline"
      :description="galleryDisabled ? 'Galeri, ürün taslağı oluşunca açılır.' : 'İlk görsel kapaktır; sıralama ve varyant görselleri galeriden yönetilir.'" bare>
      <template #aside>
        <span v-if="images.length" class="pif-count ek-num">{{ images.length }} görsel</span>
      </template>
      <!-- FR2-PFORM 27: kapak + sıradaki görseller görünür; düğmenin ne yaptığı yazılı. -->
      <button type="button" class="pif-gallery" :class="{ 'is-empty': !images.length }" data-pf-field="gallery" :disabled="galleryDisabled"
        :aria-label="images.length ? `Resim galerisini düzenle — ${images.length} görsel` : 'Resim galerisine görsel ekle'"
        @click="emit('openGallery')">
        <template v-if="images.length">
          <span class="pif-gallery__grid" aria-hidden="true">
            <span v-for="(img, i) in images.slice(0, 6)" :key="img._id ?? i" class="pif-thumb" :class="{ 'is-cover': i === 0 }">
              <GalleryThumb :src="thumb(img)" :alt="i === 0 ? 'Kapak görseli' : ''" />
              <span v-if="i === 0" class="pif-thumb__badge"><v-icon icon="mdi-star" aria-hidden="true" />Kapak</span>
              <span v-if="i === 5 && images.length > 6" class="pif-thumb__more ek-num">+{{ images.length - 6 }}</span>
            </span>
            <span v-if="images.length < 6" class="pif-thumb pif-thumb--add">
              <v-icon icon="mdi-plus" aria-hidden="true" />
              <span>Ekle</span>
            </span>
          </span>
          <span class="pif-gallery__cta">
            <v-icon icon="mdi-image-edit-outline" size="18" aria-hidden="true" />
            Galeriyi düzenle
          </span>
        </template>
        <span v-else class="pif-drop">
          <span class="pif-drop__icon" aria-hidden="true"><v-icon icon="mdi-upload-outline" /></span>
          <span class="pif-drop__title">Görsel ekle</span>
          <span class="pif-drop__sub">Galeride görselleri sürükleyip bırakabilir, sıralayabilir ve kapağı seçebilirsiniz.</span>
        </span>
      </button>
    </ProductFormSection>

    <ProductFormSection title="Ürün açıklaması" icon="mdi-text-long" description="Kanallarda ürün sayfasında görünür; başlık, liste ve bağlantı kullanılabilir." bare>
      <div class="pif-editor">
        <QuillEditor v-model:content="productInfoForm.description" content-type="html" theme="snow"
          :toolbar="quillToolbar" @ready="labelToolbar" />
      </div>
    </ProductFormSection>
  </ProductStepCard>
</template>

<script setup lang="ts">
import { QuillEditor } from '@vueup/vue-quill'
import '@vueup/vue-quill/dist/vue-quill.snow.css'
import ProductStepCard from './ProductStepCard.vue'
import ProductFormSection from './ProductFormSection.vue'
import BrandSelectBoxComponent from '@/components/common/BrandSelectBoxComponent.vue'
import { computed } from 'vue'
import GalleryThumb from '@/components/productDefinitions/images/GalleryThumb.vue'
import { useProductImageUrl } from '@/composables/useProductImageUrl'
import useFormRules from '@/composables/formrules'

const props = defineProps<{
  productInfoForm: any
  quillToolbar: any
  /** Galeri, ürün kimliği (kayıtlı `_id` veya taslak `tempId`) oluşmadan açılamaz — çağıran belirler. */
  galleryDisabled: boolean
  /** Kapak resmi bileşenine verilen ürün kimliği — çağıran belirler (tanımlamada `tempId`). */
  imageProductId: string | undefined
}>()

const emit = defineEmits<{ openGallery: [] }>()
const productImageUrl = useProductImageUrl()
const images = computed<any[]>(() => (Array.isArray(props.productInfoForm.images) ? props.productInfoForm.images : []))
const thumb = (img: any) => productImageUrl(img, props.imageProductId as string, { thumbnail: true })
const formRules: any = useFormRules()

/**
 * FE R4 B (axe `aria-command-name`): Quill araç çubuğu denetimleri adsızdı (başlık seçicisi `role="button"` span'i) ya da
 * İngilizce adlıydı. Editör hazır olunca her denetime Türkçe erişilebilir ad verilir; düzenleyici davranışı değişmez.
 */
const TOOLBAR_LABELS: Record<string, string> = {
  bold: 'Kalın', italic: 'İtalik', underline: 'Altı çizili', blockquote: 'Alıntı', link: 'Bağlantı', clean: 'Biçimi temizle',
  'list:ordered': 'Numaralı liste', 'list:bullet': 'Madde işaretli liste', 'indent:-1': 'Girintiyi azalt', 'indent:+1': 'Girintiyi artır',
}
function labelToolbar(quill: any) {
  const bar: HTMLElement | undefined = quill?.getModule?.('toolbar')?.container
  if (!bar) return
  bar.setAttribute('role', 'toolbar')
  bar.setAttribute('aria-label', 'Açıklama biçimlendirme')
  bar.querySelectorAll<HTMLButtonElement>('button[class^="ql-"]').forEach((b) => {
    const format = b.className.replace(/^ql-/, '').split(' ')[0]
    const label = TOOLBAR_LABELS[b.value ? `${format}:${b.value}` : format]
    if (label) b.setAttribute('aria-label', label)
  })
  bar.querySelectorAll<HTMLElement>('.ql-header .ql-picker-label').forEach((el) => el.setAttribute('aria-label', 'Başlık düzeyi'))
  bar.querySelectorAll<HTMLElement>('.ql-header .ql-picker-item').forEach((el) => {
    const level = el.getAttribute('data-value')
    el.setAttribute('aria-label', level ? `Başlık ${level}` : 'Normal metin')
  })
}
</script>

<style scoped>
/* ── ürün tipi: iki seçim kartı (radyo + ikon + başlık + açıklama tek tıklama alanı) ───────────────────────── */
.pif-radios :deep(.v-selection-control-group) {
  flex-wrap: wrap;
  gap: var(--ek-space-3);
}

.pif-radios :deep(.v-radio) {
  flex: 1 1 240px;
  align-items: center;
  min-height: 68px;
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-3) var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  transition: var(--ek-transition-colors);
}

.pif-radios :deep(.v-radio:hover) {
  border-color: var(--ek-color-action-border);
}

.pif-radios :deep(.v-radio.v-selection-control--dirty) {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action-subtle);
  box-shadow: var(--ek-selection-ring);
}

.pif-radios :deep(.v-radio .v-label) {
  flex: 1 1 auto;
  align-self: stretch;
  opacity: 1;
  cursor: pointer;
}

.pif-choice {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
}

.pif-choice__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pif-choice__title {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
}

.pif-choice__desc {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

/* ── görseller ───────────────────────────────────────────────────────────────────────────────────────── */
.pif-count {
  padding: 2px var(--ek-space-2);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.pif-gallery {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: var(--ek-radius-tile);
  background: transparent;
  color: var(--ek-color-content-default);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.pif-gallery:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.pif-gallery:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.pif-gallery__grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--ek-space-2);
}

.pif-thumb {
  position: relative;
  display: block;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
  transition: var(--ek-transition-colors);
}

.pif-thumb.is-cover {
  grid-column: span 2;
  grid-row: span 2;
  border-color: var(--ek-color-action-border);
}

.pif-gallery:hover:not(:disabled) .pif-thumb {
  border-color: var(--ek-color-border-strong);
}

.pif-thumb__badge {
  position: absolute;
  top: var(--ek-space-2);
  left: var(--ek-space-2);
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 22px;
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  box-shadow: var(--ek-shadow-raised);
}

.pif-thumb__badge :deep(.v-icon) {
  font-size: 13px;
}

.pif-thumb__more {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: var(--ek-color-surface-inverse);
  color: var(--ek-color-content-inverse);
  font-weight: var(--ek-font-weight-semibold);
  opacity: 0.86;
}

.pif-thumb--add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 1px dashed var(--ek-color-border-strong);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.pif-gallery:hover:not(:disabled) .pif-thumb--add {
  border-color: var(--ek-color-action);
  color: var(--ek-color-action-emphasis);
}

.pif-gallery__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
}

.pif-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-1);
  min-height: 176px;
  padding: var(--ek-space-6);
  border: 1.5px dashed var(--ek-color-border-strong);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
  text-align: center;
  transition: var(--ek-transition-colors);
}

.pif-gallery:hover:not(:disabled) .pif-drop {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action-subtle);
}

.pif-drop__icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  margin-bottom: var(--ek-space-2);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface);
  color: var(--ek-color-action);
  box-shadow: var(--ek-shadow-card);
}

.pif-drop__icon :deep(.v-icon) {
  font-size: var(--ek-icon-xl);
}

.pif-drop__title {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.pif-drop__sub {
  max-width: 46ch;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

/* ── açıklama editörü ────────────────────────────────────────────────────────────────────────────────── */
.pif-editor {
  height: 360px;
  display: flex;
  flex-direction: column;
}

.pif-editor :deep(.ql-toolbar) {
  border-color: var(--ek-color-border-input);
  border-radius: var(--ek-radius-control) var(--ek-radius-control) 0 0;
  background: var(--ek-color-surface-muted);
}

.pif-editor :deep(.ql-container) {
  flex: 1;
  min-height: 0;
  border-color: var(--ek-color-border-input);
  border-radius: 0 0 var(--ek-radius-control) var(--ek-radius-control);
  font-family: inherit;
}

@container pform (max-width: 599px) {
  .pif-gallery__grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .pif-drop {
    min-height: 140px;
    padding: var(--ek-space-4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pif-radios :deep(.v-radio),
  .pif-thumb,
  .pif-drop {
    transition: none;
  }
}
</style>
