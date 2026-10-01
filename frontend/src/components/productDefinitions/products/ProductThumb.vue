<!--
  frontend/src/components/productDefinitions/products/ProductThumb.vue

  Ürün listesi ve satır altı varyant listesinin ORTAK küçük görseli (B1 → FR2 madde 18–20).
    • Kare ölçüler büyütüldü: xs 32 / sm 44 / md 56 / lg 64 px. Görsel hücreye DOĞRU oturur: `object-fit: contain` + beyaz
      yüzey (ürün fotoğrafı kırpılmaz; yatay/dikey fotoğraf ortalanır), ince kenar + `--ek-radius-tile`.
    • Yüklenirken iskelet (sessiz nabız; reduced-motion'da durağan), yüklenemezse / görsel yoksa zarif yer tutucu ikon.
    • Çoklu görsel: çerçevenin arkasında tek ince "yığın" kenarı (sağ-üst 3 px; yerleşimi etkilemez).
    • Önizleme (FR2 madde 19): üzerine gelince / klavye odağında gecikmeli (450 ms) TEK BÜYÜK görsel (sabit 280 px çerçeve →
      hoplamaz) + alt satırda ad ve görsel adedi; tıklanabilir sürümde "Tıklayın: galeri" ipucu. Eski "küçük resim şeridi"
      kaldırıldı (hover'da açıldığı için tıklanamıyordu). Galeriye gezinme TIKLAMAYLA (`click` → ebeveyn `ProductGalleryDialog`).
      `v-tooltip` (etkileşimsiz) — odak kapanı yok.
  Görsel adresi çözümü `productImage.ts`'te (saf, testli).
-->
<template>
  <v-tooltip :disabled="!hasSrc" location="end" :open-delay="PREVIEW_OPEN_DELAY" :close-delay="0" :offset="12"
    :eager="false" transition="fade-transition" content-class="pth-preview">
    <template #activator="{ props: tipProps }">
      <component :is="interactive ? 'button' : 'span'" v-bind="mergeProps($attrs, tipProps)" :type="interactive ? 'button' : undefined"
        class="pth" :class="[`pth--${size}`, { 'is-stacked': stacked, 'is-loading': hasSrc && state === 'loading', 'is-empty': !showImage, 'is-interactive': interactive }]"
        :aria-label="interactive ? label : undefined" :data-image-state="hasSrc ? state : 'none'" @click="onClick">
        <span class="pth__frame">
          <img v-if="hasSrc && state !== 'error'" :key="src" class="pth__img" :src="src" alt="" loading="lazy" decoding="async"
            draggable="false" @load="state = 'loaded'" @error="state = 'error'" />
          <v-icon v-if="!showImage" class="pth__placeholder" icon="mdi-image-outline" aria-hidden="true" />
        </span>
      </component>
    </template>
    <span class="pth-pop">
      <span class="pth-pop__frame" :class="{ 'is-loading': previewState === 'loading' }">
        <img v-if="previewState !== 'error'" class="pth-pop__img" :src="src" alt="" @load="previewState = 'loaded'" @error="previewState = 'error'" />
        <v-icon v-else class="pth-pop__placeholder" icon="mdi-image-broken-variant" aria-hidden="true" />
        <span v-if="count > 1" class="pth-pop__count ek-num"><v-icon icon="mdi-image-multiple-outline" aria-hidden="true" />{{ count }}</span>
      </span>
      <span class="pth-pop__meta">
        <span class="pth-pop__caption">{{ caption ?? label }}</span>
        <span v-if="interactive" class="pth-pop__hint">{{ count > 1 ? `${count} görsel · tıklayın: galeri` : 'Tıklayın: büyük görünüm' }}</span>
        <span v-else-if="count > 1" class="pth-pop__hint">{{ count }} görsel</span>
      </span>
    </span>
  </v-tooltip>
</template>

<script setup lang="ts">
import { computed, mergeProps, ref, watch } from 'vue'

// Kök `v-tooltip`: sınıf/öznitelikler tooltip'e değil görsel öğesine geçsin.
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  /** Gösterilen (ilk) görsel adresi; yoksa yer tutucu. */
  src?: string
  /** Tüm görseller (adet + yığın ipucu; galeri ebeveynde). `src` genelde ilk öğedir. */
  gallery?: string[]
  /** Erişilebilir ad / önizleme alt yazısı (ürün adı ya da varyant seçenekleri). */
  label: string
  /** Önizleme alt yazısı (verilmezse `label`). */
  caption?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Düğme olarak çiz (odaklanabilir, tıklanabilir); aksi hâlde yalnız görsel. */
  interactive?: boolean
}>(), { gallery: () => [], size: 'sm', interactive: false })

const emit = defineEmits<{ click: [e: MouseEvent] }>()

/** Önizleme açılma gecikmesi — satırlar üzerinde gezinirken önizleme yağmuru olmasın. */
const PREVIEW_OPEN_DELAY = 450

const hasSrc = computed(() => !!props.src)
const state = ref<'loading' | 'loaded' | 'error'>('loading')
const previewState = ref<'loading' | 'loaded' | 'error'>('loading')
watch(() => props.src, () => { state.value = 'loading'; previewState.value = 'loading' })

const showImage = computed(() => hasSrc.value && state.value !== 'error')
const stacked = computed(() => showImage.value && props.gallery.length > 1)
/** Görsel adedi (`src` galeride yoksa ona eklenir). */
const count = computed(() => (props.src && !props.gallery.includes(props.src) ? props.gallery.length + 1 : props.gallery.length))

function onClick(e: MouseEvent) {
  if (props.interactive) emit('click', e)
}
</script>

<style scoped>
.pth {
  --pth-size: 44px;
  position: relative;
  isolation: isolate;
  display: inline-flex;
  flex: none;
  width: var(--pth-size);
  height: var(--pth-size);
  padding: 0;
  border: 0;
  background: transparent;
  vertical-align: middle;
}

.pth--xs { --pth-size: 32px; }
.pth--md { --pth-size: 56px; }
.pth--lg { --pth-size: 64px; }

.pth__frame {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  /* Ürün fotoğrafları çoğunlukla beyaz zeminli: `contain` boşluğu yüzeyle birleşir (kutu içinde kutu görünmez). */
  background: var(--ek-color-surface);
  transition: border-color var(--ek-motion-feedback);
}

.pth__img {
  width: 100%;
  height: 100%;
  padding: 2px;
  object-fit: contain;
  opacity: 1;
  transition: opacity var(--ek-motion-overlay);
}

/* İskelet: görsel gelene kadar sessiz nabız; görsel yüklenince yumuşak belirme. */
.pth.is-loading .pth__img { opacity: 0; }
.pth.is-loading .pth__frame { animation: pth-pulse var(--ek-motion-loop-pulse) var(--ek-easing-standard) infinite; }

@keyframes pth-pulse {
  0%, 100% { background: var(--ek-color-surface-sunken); }
  50% { background: var(--ek-color-surface-muted); }
}

.pth__placeholder {
  color: var(--ek-color-content-subtle);
  font-size: var(--ek-icon-md);
}

.pth--xs .pth__placeholder { font-size: var(--ek-icon-sm); }

/* Çoklu görsel: arkada tek ince kart kenarı (sayı yok). Mutlak konum → yerleşim/satır yüksekliği değişmez. */
.pth.is-stacked::before {
  content: '';
  position: absolute;
  inset: -3px -3px 3px 3px;
  z-index: -1;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-muted);
}

.pth--xs.is-stacked::before { inset: -2px -2px 2px 2px; }

.pth.is-interactive { cursor: pointer; border-radius: var(--ek-radius-tile); }
.pth.is-interactive:hover .pth__frame { border-color: var(--ek-color-action-border); }
.pth.is-interactive:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }

@media (prefers-reduced-motion: reduce) {
  .pth.is-loading .pth__frame { animation: none; }
  .pth__img, .pth__frame { transition: none; }
}
</style>

<style>
/* Önizleme balonu (teleport edilir → kapsamsız; önek bu bileşene özgü). Sabit çerçeve: açılışta/yüklemede boyut değişmez. */
/* `!important`: genel DS tooltip kuralı (vuetify-overrides.css) ters yüzeyi `!important` ile veriyor; önizleme açık yüzey
   (görsel ters zeminde renk algısını bozar) — yalnız bu içerik sınıfında geri alınır. */
.v-tooltip > .v-overlay__content.pth-preview {
  padding: var(--ek-space-2) !important;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-popover) !important;
  background: var(--ek-color-surface-raised) !important;
  color: var(--ek-color-content-default) !important;
  box-shadow: var(--ek-shadow-popover);
}

.pth-pop {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  width: 280px;
}

.pth-pop__frame {
  position: relative;
  display: grid;
  place-items: center;
  width: 280px;
  height: 280px;
  overflow: hidden;
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  box-shadow: inset 0 0 0 1px var(--ek-color-border-subtle);
}

/* Görsel adedi: sağ üstte sakin sayaç (şerit yerine; hover'da tıklanamayan küçük resimler gösterilmez). */
.pth-pop__count {
  position: absolute;
  top: var(--ek-space-2);
  right: var(--ek-space-2);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px var(--ek-space-2);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-raised);
  box-shadow: inset 0 0 0 1px var(--ek-color-border-default);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.pth-pop__count .v-icon {
  font-size: var(--ek-icon-sm);
}

.pth-pop__frame.is-loading { animation: pth-pop-pulse var(--ek-motion-loop-pulse) var(--ek-easing-standard) infinite; }
.pth-pop__frame.is-loading .pth-pop__img { opacity: 0; }

@keyframes pth-pop-pulse {
  0%, 100% { background: var(--ek-color-surface-sunken); }
  50% { background: var(--ek-color-surface-muted); }
}

.pth-pop__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: opacity var(--ek-motion-overlay);
}

.pth-pop__placeholder {
  color: var(--ek-color-content-subtle);
  font-size: var(--ek-icon-lg);
}


.pth-pop__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pth-pop__hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pth-pop__caption {
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  line-height: var(--ek-type-caption-line);
  white-space: nowrap;
  text-overflow: ellipsis;
}

@media (prefers-reduced-motion: reduce) {
  .pth-pop__frame.is-loading { animation: none; }
  .pth-pop__img { transition: none; }
}
</style>
