<!--
  frontend/src/components/productDefinitions/images/ImagePicker.vue

  Faz 3 B2 — galeriden ÇOKLU seçim ızgarası (varyant atama editörü ve varyant paneli). Her görsel bir aç/kapa
  düğmesi (`aria-pressed`); seçiliyken aksiyon çerçevesi + onay işareti. Sıra galeri sırasıdır (atama sonucu da
  galeri sırasına dizilir — `sortByGallery`), bu yüzden seçim sırası numarası gösterilmez; kapak rozeti gösterilir.
-->
<template>
  <ul class="ipk" :class="`ipk--${size}`" role="list" :aria-label="label">
    <li v-for="(img, i) in images" :key="img._id">
      <button type="button" class="ipk__item" :class="{ 'is-on': isOn(img._id), 'is-partial': partial?.includes(img._id) && !isOn(img._id) }"
        :aria-pressed="isOn(img._id)" :aria-label="itemLabel(img, i)" @click="toggle(img._id)">
        <GalleryThumb :src="img.url" />
        <span class="ipk__check" aria-hidden="true"><v-icon :icon="isOn(img._id) ? 'mdi-check' : 'mdi-plus'" /></span>
        <span v-if="i === 0" class="ipk__cover" aria-hidden="true">Kapak</span>
      </button>
    </li>
  </ul>
</template>

<script setup lang="ts">
import GalleryThumb from './GalleryThumb.vue'
import { sortByGallery, type GalleryImage } from './galleryModel'

const props = withDefaults(defineProps<{
  images: GalleryImage[]
  modelValue: string[]
  /** Yalnız bazı varyantlarda olan görseller (yarı dolu gösterim). */
  partial?: string[]
  label?: string
  size?: 'sm' | 'md'
}>(), { label: 'Galeri görselleri', size: 'md' })

const emit = defineEmits<{ 'update:modelValue': [ids: string[]] }>()

const isOn = (id: string) => props.modelValue.includes(id)

function toggle(id: string) {
  const next = isOn(id) ? props.modelValue.filter((x) => x !== id) : [...props.modelValue, id]
  emit('update:modelValue', sortByGallery(next, props.images))
}

function itemLabel(img: GalleryImage, i: number) {
  const base = `Görsel ${i + 1}${i === 0 ? ' (kapak)' : ''}`
  if (isOn(img._id)) return `${base}, seçili`
  if (props.partial?.includes(img._id)) return `${base}, bazı varyantlarda var`
  return base
}
</script>

<style scoped>
.ipk {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ipk--sm {
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
}

.ipk__item {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  overflow: hidden;
  background: none;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ipk__item:hover {
  border-color: var(--ek-color-border-strong);
}

.ipk__item:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ipk__item.is-on {
  border-color: var(--ek-color-action);
  box-shadow: 0 0 0 1px var(--ek-color-action);
}

.ipk__item.is-partial {
  border-style: dashed;
  border-color: var(--ek-color-action-border);
}

.ipk__check {
  position: absolute;
  top: var(--ek-space-1);
  right: var(--ek-space-1);
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: var(--ek-radius-full);
  border: 1px solid var(--ek-color-border-strong);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
  transition: var(--ek-transition-colors);
}

.ipk__check :deep(.v-icon) {
  font-size: 14px;
}

.ipk__item.is-on .ipk__check {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
}

.ipk__cover {
  position: absolute;
  left: var(--ek-space-1);
  bottom: var(--ek-space-1);
  padding: 0 6px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: 18px;
  font-weight: 600;
}

/* FE-LOCAL-1057 — görsel seçici: seçim işareti köşeli kutu (yuvarlak değil); kapak etiketi köşeli. */
.ipk__check {
  border-radius: var(--ek-radius-md);
}

.ipk__cover {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
}

.ipk__item.is-on {
  box-shadow: inset 0 0 0 1px var(--ek-color-action);
}
</style>
