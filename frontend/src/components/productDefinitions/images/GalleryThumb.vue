<!--
  frontend/src/components/productDefinitions/images/GalleryThumb.vue

  Faz 3 B2 — galeri/atama/önizleme ortak görsel kutusu: kare (ya da kabın oranı) alan, görsel `contain`
  ile ortalanır (kırpılmaz; ürünün tamamı ve zemini görünür), sakin `surface-sunken` zemin. Yüklenemezse
  ikon + "Görsel yüklenemedi" (ekran okuyucu için alt metin).
-->
<template>
  <span class="gth" :class="[`gth--${fit}`, { 'is-broken': broken, 'is-loaded': loaded }]">
    <img v-if="src && !broken" :src="src" :alt="alt" loading="lazy" decoding="async" draggable="false"
      @load="loaded = true" @error="broken = true" />
    <span v-else class="gth__empty" role="img" :aria-label="src ? `${alt} — görsel yüklenemedi` : alt">
      <v-icon :icon="src ? 'mdi-image-broken-variant' : 'mdi-image-outline'" aria-hidden="true" />
    </span>
  </span>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{ src?: string; alt?: string; fit?: 'contain' | 'cover' }>(), { alt: '', fit: 'contain' })
const broken = ref(false)
const loaded = ref(false)
watch(() => props.src, () => { broken.value = false; loaded.value = false })
</script>

<style scoped>
.gth {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--ek-color-surface-sunken);
}

.gth img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  opacity: 0;
  transition: opacity var(--ek-duration-base) var(--ek-easing-enter);
}

.gth--cover img {
  object-fit: cover;
}

.gth.is-loaded img {
  opacity: 1;
}

.gth__empty {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--ek-color-content-subtle);
}

.gth__empty :deep(.v-icon) {
  font-size: 32px;
}
</style>
