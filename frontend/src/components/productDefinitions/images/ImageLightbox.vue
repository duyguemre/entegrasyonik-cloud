<!--
  frontend/src/components/productDefinitions/images/ImageLightbox.vue

  Faz 3 B2 — büyük önizleme. İç içe `EkDialogHost` (sekme kapsamlı örtü yığını): Esc YALNIZ önizlemeyi kapatır,
  galeri açık kalır. ←/→ önceki/sonraki, Home/End uçlar; alt şerit küçük görsellerden atlama. Sağ sütun: sıra,
  çözünürlük/boyut, kalite ipuçları, "kullanıldığı varyantlar", eylemler (Kapak yap · İndir · Sil).
  Dar kapta (< 720px) bilgi sütunu görselin altına iner.
-->
<template>
  <EkDialogHost :model-value="open" max-width="1180" @update:model-value="(v) => { if (!v) emit('close') }">
    <div v-if="current" ref="rootRef" class="ilb" role="group" :aria-label="`Görsel önizleme, ${index + 1} / ${images.length}`"
      tabindex="-1" @keydown="onKey">
      <header class="ilb__head">
        <h2 class="ilb__title">
          Görsel <span class="ek-num">{{ index + 1 }} / {{ images.length }}</span>
          <span v-if="index === 0" class="ilb__cover"><v-icon icon="mdi-star" aria-hidden="true" />Kapak</span>
        </h2>
        <EkButton ref="closeRef" tone="ghost" size="sm" icon="mdi-close" icon-only aria-label="Önizlemeyi kapat" @click="emit('close')" />
      </header>

      <div class="ilb__body">
        <div class="ilb__stage">
          <GalleryThumb :key="current._id" :src="srcOf(current)" :alt="`Görsel ${index + 1}`" />
          <button type="button" class="ilb__nav ilb__nav--prev" :disabled="index === 0" aria-label="Önceki görsel" @click="go(index - 1)">
            <v-icon icon="mdi-chevron-left" aria-hidden="true" />
          </button>
          <button type="button" class="ilb__nav ilb__nav--next" :disabled="index === images.length - 1" aria-label="Sonraki görsel" @click="go(index + 1)">
            <v-icon icon="mdi-chevron-right" aria-hidden="true" />
          </button>
        </div>

        <aside class="ilb__info" aria-label="Görsel bilgileri">
          <dl class="ilb__facts">
            <div><dt>Çözünürlük</dt><dd class="ek-num">{{ current.width && current.height ? `${current.width} × ${current.height} px` : '—' }}</dd></div>
            <div><dt>Dosya boyutu</dt><dd class="ek-num">{{ formatBytes(current.size) }}</dd></div>
          </dl>

          <ul v-if="hints.length" class="ilb__hints">
            <li v-for="h in hints" :key="h.short" :class="`is-${h.level}`">
              <v-icon :icon="h.level === 'warning' ? 'mdi-alert-outline' : 'mdi-information-outline'" aria-hidden="true" />
              <span><strong>{{ h.short }}.</strong> {{ h.text }}</span>
            </li>
          </ul>

          <section v-if="showUsage" class="ilb__usage" aria-labelledby="ilb-usage-h">
            <h3 id="ilb-usage-h" class="ilb__micro">Kullanıldığı varyantlar</h3>
            <p v-if="!usage.length" class="ilb__muted">Hiçbir varyanta atanmadı.</p>
            <ul v-else class="ilb__chips">
              <li v-for="u in usage" :key="u">{{ u }}</li>
            </ul>
          </section>

          <div class="ilb__actions">
            <EkButton v-if="index > 0" size="sm" icon="mdi-star-outline" @click="emit('cover', current._id)">Kapak yap</EkButton>
            <EkButton size="sm" tone="ghost" :icon="icons.download" @click="emit('download', current._id)">İndir</EkButton>
            <EkButton size="sm" tone="ghost" class="ilb__danger" :icon="icons.delete" @click="emit('remove', current._id)">Sil</EkButton>
          </div>
        </aside>
      </div>

      <nav class="ilb__strip" aria-label="Görseller arasında geçiş">
        <button v-for="(img, i) in images" :key="img._id" type="button" class="ilb__strip-item" :class="{ 'is-current': i === index }"
          :aria-label="`Görsel ${i + 1}${i === 0 ? ' (kapak)' : ''}`" :aria-current="i === index ? 'true' : undefined" @click="go(i)">
          <GalleryThumb :src="srcOf(img)" />
        </button>
      </nav>
    </div>
  </EkDialogHost>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { EkDialogHost, EkButton } from '@entegrasyonik/ui/components'
import { icons } from '@entegrasyonik/ui/icons'
import { useGallerySrc } from './gallerySrc'
import GalleryThumb from './GalleryThumb.vue'
import { formatBytes, imageQuality, type GalleryImage } from './galleryModel'

const props = withDefaults(defineProps<{
  open: boolean
  images: GalleryImage[]
  index: number
  /** Görsel kimliği → kullanan varyant adları. */
  usageOf?: (id: string) => string[]
  showUsage?: boolean
}>(), { showUsage: false })
const srcOf = useGallerySrc()

const emit = defineEmits<{
  close: []
  'update:index': [i: number]
  cover: [id: string]
  download: [id: string]
  remove: [id: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const current = computed(() => props.images[props.index])
const hints = computed(() => (current.value ? imageQuality(current.value) : []))
const usage = computed(() => (current.value && props.usageOf ? props.usageOf(current.value._id) : []))

function go(i: number) {
  if (i < 0 || i >= props.images.length) return
  emit('update:index', i)
}

function onKey(e: KeyboardEvent) {
  const map: Record<string, number> = { ArrowLeft: props.index - 1, ArrowRight: props.index + 1, Home: 0, End: props.images.length - 1 }
  if (!(e.key in map)) return
  // Metin/düğme dışı odakta da çalışır; düğme üzerindeyken ok tuşu sayfayı kaydırmasın.
  e.preventDefault()
  go(map[e.key])
}

watch(() => props.open, async (v) => {
  if (!v) return
  await nextTick()
  requestAnimationFrame(() => rootRef.value?.focus({ preventScroll: true }))
})
watch(() => props.images.length, (n) => {
  if (props.open && n === 0) emit('close')
  else if (props.index > n - 1) emit('update:index', Math.max(0, n - 1))
})
</script>

<style scoped>
.ilb {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: calc(100vh - var(--ek-space-12));
  background: var(--ek-color-surface-raised);
  border-radius: var(--ek-radius-dialog);
  outline: none;
  overflow: hidden;
}

.ilb__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-3) var(--ek-space-3) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.ilb__title {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  margin: 0;
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
  color: var(--ek-color-content-strong);
}

.ilb__cover {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: 22px;
  font-weight: 600;
}

.ilb__cover :deep(.v-icon) {
  font-size: 14px;
}

.ilb__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  min-height: 0;
  flex: 1 1 auto;
}

.ilb__stage {
  position: relative;
  aspect-ratio: 1;
  max-height: min(64vh, 720px);
  width: 100%;
  justify-self: center;
  background: var(--ek-color-surface-sunken);
}

.ilb__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--ek-radius-full);
  border: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  box-shadow: var(--ek-shadow-raised);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ilb__nav--prev { left: var(--ek-space-3); }
.ilb__nav--next { right: var(--ek-space-3); }

.ilb__nav:hover:not(:disabled) {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.ilb__nav:disabled {
  opacity: 0;
  pointer-events: none;
}

.ilb__nav:focus-visible,
.ilb__strip-item:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ilb__info {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  padding: var(--ek-space-5);
  border-left: 1px solid var(--ek-color-border-subtle);
  overflow: auto;
}

.ilb__facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ek-space-3);
  margin: 0;
}

.ilb__facts dt,
.ilb__micro {
  margin: 0 0 var(--ek-space-1);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.ilb__facts dd {
  margin: 0;
  font-size: var(--ek-type-body-size);
  color: var(--ek-color-content-strong);
}

.ilb__hints {
  display: grid;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ilb__hints li {
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-3);
  border-radius: var(--ek-radius-control);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
}

.ilb__hints li.is-warning {
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.ilb__hints :deep(.v-icon) {
  font-size: 16px;
  margin-top: 1px;
}

.ilb__muted {
  margin: 0;
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}

.ilb__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ilb__chips li {
  padding: 2px var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-default);
  background: var(--ek-color-surface);
}

.ilb__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin-top: auto;
}

.ilb__danger {
  color: var(--ek-color-error) !important;
}

.ilb__strip {
  display: flex;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-5);
  border-top: 1px solid var(--ek-color-border-subtle);
  overflow-x: auto;
}

.ilb__strip-item {
  flex: 0 0 auto;
  width: 56px;
  height: 56px;
  padding: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  overflow: hidden;
  cursor: pointer;
  background: none;
  transition: var(--ek-transition-colors);
}

.ilb__strip-item.is-current {
  border-color: var(--ek-color-action);
  box-shadow: 0 0 0 1px var(--ek-color-action);
}

@media (max-width: 720px) {
  .ilb__body {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .ilb__info {
    border-left: 0;
    border-top: 1px solid var(--ek-color-border-subtle);
  }
}
</style>
