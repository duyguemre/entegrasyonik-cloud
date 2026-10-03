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
  <ProductStepCard title="Ürün tanımı" icon="mdi-text-box-edit-outline"
    description="Ürün tipi, marka, başlık ve açıklama; görseller galeriden yönetilir.">
  <div class="pif-layout">
    <div class="pif-gallery">
      <!-- Sağdaki bölüm başlıklarıyla aynı stil ve aynı başlangıç çizgisi (iki sütun üstten hizalı). -->
      <h3 class="pif-gallery__head"><v-icon icon="mdi-image-multiple-outline" class="pif-gallery__head-icon" aria-hidden="true" />Görseller</h3>
      <!-- FR2-PFORM 27: kapak + sıradaki görseller görünür; düğmenin ne yaptığı yazılı. -->
      <button type="button" class="pif-gallery__tile" data-pf-field="gallery" :disabled="galleryDisabled"
        :aria-label="images.length ? `Resim galerisini düzenle — ${images.length} görsel` : 'Resim galerisine görsel ekle'"
        @click="emit('openGallery')">
        <span class="pif-gallery__cover">
          <GalleryThumb v-if="images[0]" :src="thumb(images[0])" alt="Kapak görseli" />
          <span v-else class="pif-gallery__empty">
            <v-icon icon="mdi-image-plus-outline" aria-hidden="true" />
            <span>Henüz görsel yok</span>
          </span>
          <span v-if="images[0]" class="pif-gallery__badge"><v-icon icon="mdi-star" aria-hidden="true" />Kapak</span>
        </span>
        <span v-if="images.length > 1" class="pif-gallery__strip" aria-hidden="true">
          <span v-for="(img, i) in images.slice(1, 4)" :key="img._id" class="pif-gallery__mini">
            <GalleryThumb :src="thumb(img)" />
            <span v-if="i === 2 && images.length > 4" class="pif-gallery__more ek-num">+{{ images.length - 4 }}</span>
          </span>
        </span>
        <span class="pif-gallery__label">
          <v-icon :icon="images.length ? 'mdi-image-edit-outline' : 'mdi-image-plus-outline'" size="18" aria-hidden="true" />
          {{ images.length ? 'Galeriyi düzenle' : 'Görsel ekle' }}
          <span v-if="images.length" class="pif-gallery__count ek-num">{{ images.length }}</span>
        </span>
      </button>
      <p class="pif-gallery__hint">{{ galleryDisabled ? 'Galeri, ürün taslağı oluşunca açılır.' : 'Sıralama, kapak ve varyant görselleri galeriden yönetilir.' }}</p>
    </div>

    <div class="pif-fields">
      <EkFormSection title="Temel bilgiler" icon="mdi-text-box-outline"
        description="Marka, listenizdeki ana marka (yoksa ilk marka) olarak önceden seçilir; ürününüz başka bir markaya aitse değiştirin.">
        <div class="ek-span-full" data-pf-field="brand">
          <BrandSelectBoxComponent v-model="productInfoForm.brand" :mandatory="true" />
        </div>
        <v-text-field class="ek-span-full" clearable :rules="formRules.titleRules" maxlength="160" counter
          data-pf-field="title" v-model="productInfoForm.title" :label="`${$t('productDefinitions.product.define.productTitle')} *`"
          :hint="$t('productDefinitions.product.define.productTitleDesc')" persistent-hint />
      </EkFormSection>

      <EkFormSection title="Ürün tipi" icon="mdi-shape-outline">
        <div class="ek-span-full">
          <v-radio-group inline hide-details v-model="productInfoForm.hasVariant" class="pif-radios" aria-label="Ürün tipi">
            <v-radio :value="false" :label="$t('productDefinitions.product.define.withoutVariant')" />
            <v-radio :value="true" :label="$t('productDefinitions.product.define.withVariant')" />
          </v-radio-group>
          <p class="pif-type-hint">{{ productInfoForm.hasVariant
            ? 'Renk, beden gibi seçeneklerin her birleşimi ayrı stok kodu, barkod, fiyat ve stok taşır.'
            : 'Tek stok kodu ve barkodla satılan ürün.' }}</p>
        </div>
        <v-text-field v-if="productInfoForm.hasVariant" clearable maxlength="32" counter data-pf-field="maincode"
          :rules="formRules.stockcodeRules" v-model="productInfoForm.maincode"
          :label="`${$t('productDefinitions.product.define.maincode')} *`"
          :hint="$t('productDefinitions.product.define.maincodeDesc')" persistent-hint />
      </EkFormSection>

      <EkFormSection class="pif-desc" title="Ürün açıklaması" icon="mdi-text-long" :columns="1">
        <template #legend-extra>
          <EkButton class="pif-desc__expand" size="sm" tone="ghost" icon="mdi-arrow-expand" @click="descDialog = true">Geniş düzenleyici</EkButton>
        </template>
        <div class="pif-editor">
          <QuillEditor v-if="!descDialog" v-model:content="productInfoForm.description" content-type="html" theme="snow"
            :toolbar="quillToolbar" @ready="labelToolbar" />
        </div>
      </EkFormSection>

      <!-- Uzun açıklama: sayfa kısa kalır, geniş düzenleyici pencerede açılır (aynı model). -->
      <EkDialog v-model="descDialog" title="Ürün açıklaması" icon="mdi-text-long" width="xl" hide-cancel confirm-label="Tamam"
        @confirm="descDialog = false">
        <div class="pif-editor pif-editor--dialog">
          <QuillEditor v-if="descDialog" v-model:content="productInfoForm.description" content-type="html" theme="snow"
            :toolbar="quillToolbar" @ready="labelToolbar" />
        </div>
      </EkDialog>
    </div>
  </div>
  </ProductStepCard>
</template>

<script setup lang="ts">
import { QuillEditor } from '@vueup/vue-quill'
import '@vueup/vue-quill/dist/vue-quill.snow.css'
import { EkButton, EkDialog, EkFormSection } from '@entegrasyonik/ui/components'
import ProductStepCard from './ProductStepCard.vue'
import BrandSelectBoxComponent from '@/components/common/BrandSelectBoxComponent.vue'
import { computed, ref } from 'vue'

/** Geniş açıklama düzenleyicisi açık mı (açıkken satır içi editör kaldırılır; tek Quill örneği). */
const descDialog = ref(false)
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
.pif-layout {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  gap: var(--ek-space-8);
  align-items: start;
}

.pif-gallery {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

/* Başlık = EkFormSection başlığı; alt boşluk (gap ile) = başlık altı + ızgara üst boşluğu → kutucuk, sağdaki ilk alanla aynı yükseklikte. */
.pif-gallery__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-2);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.pif-gallery__head-icon {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-subheading-icon);
}

.pif-gallery__tile {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  width: 100%;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.pif-gallery__tile:hover:not(:disabled) {
  border-color: var(--ek-color-action-border);
  box-shadow: var(--ek-shadow-card);
}

.pif-gallery__tile:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.pif-gallery__tile:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.pif-gallery__cover {
  position: relative;
  display: block;
  aspect-ratio: 1;
  background: var(--ek-color-surface-sunken);
}

.pif-gallery__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-2);
  height: 100%;
  color: var(--ek-color-content-subtle);
  font-size: var(--ek-type-caption-size);
}

.pif-gallery__empty :deep(.v-icon) {
  font-size: 40px;
}

.pif-gallery__badge {
  position: absolute;
  bottom: var(--ek-space-2);
  left: var(--ek-space-2);
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 22px;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-caption-size);
  font-weight: 600;
}

.pif-gallery__badge :deep(.v-icon) {
  font-size: 13px;
}

.pif-gallery__strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ek-space-1);
  padding: var(--ek-space-1);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.pif-gallery__mini {
  position: relative;
  display: block;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--ek-radius-sm);
}

.pif-gallery__more {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: var(--ek-color-surface-inverse);
  color: var(--ek-color-content-inverse);
  font-weight: 600;
  opacity: 0.86;
}

.pif-gallery__label {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
}

.pif-gallery__count {
  margin-left: auto;
  min-width: 22px;
  padding: 0 6px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  text-align: center;
}

.pif-gallery__hint {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pif-fields {
  min-width: 0;
}

/* Ürün tipi: iki seçim kutucuğu (radyo + etiket tek tıklama alanı); seçili kutucuk aksiyon tonunda. */
.pif-radios :deep(.v-selection-control-group) {
  flex-wrap: wrap;
  gap: var(--ek-space-3);
}

.pif-radios :deep(.v-radio) {
  flex: 1 1 200px;
  max-width: 320px;
  min-height: 48px;
  padding: 0 var(--ek-space-4) 0 var(--ek-space-1);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
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
  min-height: 46px;
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
  opacity: 1;
  cursor: pointer;
}

.pif-type-hint {
  margin: var(--ek-space-1) 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

@media (prefers-reduced-motion: reduce) {
  .pif-radios :deep(.v-radio),
  .pif-gallery__tile {
    transition: none;
  }
}

/* Satır içi editör kısa: adım ve altbilgi kaydırmadan görünür; uzun metin geniş düzenleyicide. */
.pif-editor {
  height: 200px;
  display: flex;
  flex-direction: column;
}

.pif-editor :deep(.ql-toolbar) {
  border-color: var(--ek-color-border-input);
  border-radius: var(--ek-radius-control) var(--ek-radius-control) 0 0;
}

/* Görünüm dosyasındaki genel `.ql-editor { min/max-height: 345px }` kuralı kısa editörü taşırıyordu: editör kabı doldurur. */
.pif-editor :deep(.ql-editor) {
  min-height: 0;
  max-height: none;
  height: 100%;
  overflow-y: auto;
}

.pif-editor :deep(.ql-container) {
  flex: 1;
  min-height: 0;
  border-color: var(--ek-color-border-input);
  border-radius: 0 0 var(--ek-radius-control) var(--ek-radius-control);
  font-family: inherit;
}

.pif-editor--dialog {
  height: min(60vh, 560px);
}

.pif-desc :deep(.ek-form-section__legend) {
  width: 100%;
}

/* Düğme başlık satırını yükseltmesin (üç sütunun başlıkları aynı çizgide kalsın). */
.pif-desc__expand {
  margin-left: auto;
  margin-block: calc(-1 * var(--ek-space-2));
}

/* Geniş ekran: üç sütun — Görseller · Ürün tipi + Temel bilgiler · Ürün açıklaması. Üç başlık aynı çizgide,
   ayırıcı çizgi yok (sütun boşluğu = galeri boşluğu); açıklama editörü orta sütunun yüksekliğine uzar. */
@media (min-width: 1360px) {
  .pif-fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
    grid-template-rows: auto 1fr;
    column-gap: var(--ek-space-8);
    align-items: stretch;
  }

  .pif-fields > :not(.pif-desc) {
    grid-column: 1;
  }

  /* `.pif-fields > .pif-desc.ek-form-section`: EkFormSection'ın ardışık bölüm kuralını (üst boşluk + çizgi) yenecek öncelik. */
  .pif-fields > .pif-desc.ek-form-section {
    display: flex;
    flex-direction: column;
    grid-column: 2;
    grid-row: 1 / span 2;
    min-width: 0;
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }

  .pif-desc :deep(.ek-form-section__grid) {
    flex: 1;
    grid-template-rows: minmax(0, 1fr);
  }

  .pif-desc .pif-editor {
    height: 100%;
    min-height: 200px;
  }
}

@media (max-width: 1023px) {
  .pif-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .pif-gallery {
    max-width: 260px;
  }
}

@media (max-width: 599px) {
  .pif-gallery {
    max-width: 200px;
  }
}

/* FE-LOCAL-1054 — görseller sütunu: başlık mikro etiket; karoda gölge yok; kapak rozeti ve sayaç köşeli. */
.pif-gallery__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.pif-gallery__head::before {
  content: '';
  flex: none;
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.pif-gallery__head-icon {
  display: none;
}

.pif-gallery__tile:hover:not(:disabled) {
  box-shadow: none;
}

.pif-gallery__cover,
.pif-gallery__count {
  border-radius: var(--ek-radius-md);
}

.pif-gallery__count {
  border: 1px solid var(--ek-color-border-default);
}
</style>
