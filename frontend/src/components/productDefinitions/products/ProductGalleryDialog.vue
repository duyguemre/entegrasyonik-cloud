<!--
  frontend/src/components/productDefinitions/products/ProductGalleryDialog.vue

  FR2 madde 19 — ürün listesinden SALT-OKUNUR galeri (hover önizlemesinin tıklanabilir devamı). Düzenleme eylemleri
  (kapak, sil, sırala) ürün formundaki galeride (`images/ImageLightbox`); burada yalnız gezinme + "Ürünü düzenle".
    • Sahne: sabit oranlı çerçeve, `contain` (fotoğraf kırpılmaz), yüklenirken sakin iskelet.
    • Gezinme: ← / → (uçlarda durur), Home / End; önceki/sonraki düğmeleri; altta tıklanabilir küçük resim şeridi
      (`aria-current`), sayaç "2 / 6".
    • Esc / perde: kapatır (EkDialogHost, sekme kapsamlı). Odak açılışta sahneye.
-->
<template>
  <EkDialogHost :model-value="open" :attach="attach" max-width="960" @update:model-value="(v) => { if (!v) emit('close') }">
    <section v-if="open && images.length" ref="rootRef" class="pgd" role="group" tabindex="-1"
      :aria-label="`${title} görselleri, ${index + 1} / ${images.length}`" @keydown="onKey">
      <header class="pgd__head">
        <div class="pgd__titles">
          <span class="pgd__eyebrow" aria-hidden="true">Ürün görselleri</span>
          <h2 class="pgd__title">{{ title }}</h2>
          <span class="pgd__sub ek-num">{{ subtitle ? `${subtitle} · ` : '' }}Görsel {{ index + 1 }} / {{ images.length }}</span>
        </div>
        <EkButton v-if="editable" tone="secondary" size="sm" icon="mdi-pencil-outline" @click="emit('edit')">Ürünü düzenle</EkButton>
        <EkButton tone="ghost" size="sm" icon="mdi-close" icon-only aria-label="Galeriyi kapat" @click="emit('close')" />
      </header>

      <div class="pgd__stage">
        <img :key="images[index]" class="pgd__img" :class="{ 'is-loading': loading }" :src="images[index]" :alt="`${title} — görsel ${index + 1}`"
          @load="loading = false" @error="loading = false" />
        <template v-if="images.length > 1">
          <button type="button" class="pgd__nav pgd__nav--prev" :disabled="index === 0" aria-label="Önceki görsel" @click="go(index - 1)">
            <v-icon icon="mdi-chevron-left" aria-hidden="true" />
          </button>
          <button type="button" class="pgd__nav pgd__nav--next" :disabled="index === images.length - 1" aria-label="Sonraki görsel" @click="go(index + 1)">
            <v-icon icon="mdi-chevron-right" aria-hidden="true" />
          </button>
        </template>
      </div>

      <nav v-if="images.length > 1" class="pgd__strip" aria-label="Görseller arasında geçiş">
        <button v-for="(img, i) in images" :key="img" type="button" class="pgd__thumb" :class="{ 'is-current': i === index }"
          :aria-label="`Görsel ${i + 1}${i === 0 ? ' (kapak)' : ''}`" :aria-current="i === index ? 'true' : undefined" @click="go(i)">
          <img :src="img" alt="" loading="lazy" />
        </button>
      </nav>
    </section>
  </EkDialogHost>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { EkButton, EkDialogHost } from '@entegrasyonik/ui/components'

const props = withDefaults(defineProps<{
  open: boolean
  images: string[]
  title: string
  subtitle?: string
  startIndex?: number
  editable?: boolean
  attach?: string | boolean
}>(), { startIndex: 0, editable: true, attach: false })

const emit = defineEmits<{ close: []; edit: [] }>()

const index = ref(0)
const loading = ref(true)
const rootRef = ref<HTMLElement | null>(null)

watch(() => props.open, async (v) => {
  if (!v) return
  index.value = Math.min(Math.max(props.startIndex, 0), Math.max(props.images.length - 1, 0))
  loading.value = true
  await nextTick()
  rootRef.value?.focus()
}, { immediate: true })

function go(i: number) {
  const next = Math.min(Math.max(i, 0), props.images.length - 1)
  if (next === index.value) return
  index.value = next
  loading.value = true
}

function onKey(e: KeyboardEvent) {
  const map: Record<string, number> = { ArrowLeft: index.value - 1, ArrowRight: index.value + 1, Home: 0, End: props.images.length - 1 }
  if (!(e.key in map)) return
  e.preventDefault()
  go(map[e.key])
}
</script>

<style scoped>
.pgd {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--ek-radius-dialog);
  background: var(--ek-color-surface-raised);
  outline: none;
}

.pgd__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-3) var(--ek-space-3) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.pgd__titles {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.pgd__title {
  margin: 0;
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-lg);
  font-weight: var(--ek-font-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pgd__sub {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.pgd__stage {
  position: relative;
  flex: none;
  height: min(58vh, 560px);
  background: var(--ek-color-surface);
}

/* Mutlak yerleşim + contain: görsel sahneyi ASLA taşmaz (dikey/yatay fotoğraf ortalanır). */
.pgd__img {
  position: absolute;
  inset: var(--ek-space-4) var(--ek-space-16);
  width: calc(100% - 2 * var(--ek-space-16));
  height: calc(100% - 2 * var(--ek-space-4));
  object-fit: contain;
  transition: opacity var(--ek-motion-overlay);
}

.pgd__img.is-loading { opacity: 0; }

.pgd__nav {
  position: absolute;
  top: 50%;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-raised);
  box-shadow: var(--ek-shadow-card);
  color: var(--ek-color-content-default);
  cursor: pointer;
  transform: translateY(-50%);
  transition: var(--ek-transition-colors);
}

.pgd__nav--prev { left: var(--ek-space-4); }
.pgd__nav--next { right: var(--ek-space-4); }
.pgd__nav:hover:not(:disabled) { border-color: var(--ek-color-border-strong); background: var(--ek-color-surface-muted); }
.pgd__nav:disabled { opacity: 0.4; cursor: default; }
.pgd__nav:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }

.pgd__strip {
  display: flex;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-5);
  overflow-x: auto;
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.pgd__thumb {
  flex: none;
  width: 64px;
  height: 64px;
  padding: 2px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.pgd__thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.pgd__thumb:hover { border-color: var(--ek-color-border-strong); }
.pgd__thumb.is-current { border-color: var(--ek-color-action); box-shadow: inset 0 0 0 1px var(--ek-color-action); }
.pgd__thumb:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }

@media (max-width: 599px) {
  .pgd__stage { height: 52vh; }
  .pgd__img { inset: var(--ek-space-2); width: calc(100% - 2 * var(--ek-space-2)); height: calc(100% - 2 * var(--ek-space-2)); }
  .pgd__nav { width: 36px; height: 36px; }
  .pgd__thumb { width: 52px; height: 52px; }
}

@media (prefers-reduced-motion: reduce) {
  .pgd__img, .pgd__nav, .pgd__thumb { transition: none; }
}

/* ================= FE-LOCAL-1048 — ürün galerisi: ana sayfa diliyle =================
   Kart köşesi; başlık bandı sakin zeminde — kısa eylem çizgili mikro etiket + ürün adı; gezinme düğmeleri çerçeveli
   köşeli kutular (gölge yok); etkin küçük resim eylem çerçevesi + açık zemin. */
.pgd {
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.pgd__head {
  border-bottom-color: var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
}

.pgd__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.pgd__eyebrow::before {
  content: '';
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.pgd__title {
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
}

.pgd__nav {
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  box-shadow: none;
}

.pgd__nav:hover:not(:disabled) {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.pgd__strip {
  border-top-color: var(--ek-color-border-default);
}

.pgd__thumb:hover { border-color: var(--ek-color-action-border); }

.pgd__thumb.is-current {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action-subtle);
  box-shadow: none;
}
</style>
