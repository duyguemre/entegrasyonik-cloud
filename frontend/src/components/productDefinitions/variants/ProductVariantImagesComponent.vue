<!--
  frontend/src/components/productDefinitions/variants/ProductVariantImagesComponent.vue

  Faz 3 B2 — TEK varyantın görselleri (varyant tablosunda satırdaki küçük görsel → bu panel). Önceki hâl: iki ayrı
  sürüklenebilir ızgara, "+" kaplamalı galeri, `onActivated` + JSON kopyası, `console.log`'lar, yüklemede
  backend'in döndürdüğü TÜM ürün görsellerini varyanta ekleyen hata, silinmiş galeri görselini gösteren boş kutular.

  Yeni:
    1) "Bu varyantın görselleri" — sıralı şerit (ilk = varyant ana görseli). Sürükle-bırak; klavye: kutuya odaklan,
       Alt+←/→ taşı; × kaldır (toast'ta Geri al).
    2) Kardeşlere uygula — aynı seçenek değerini (ör. Renk: Kırmızı) paylaşan diğer varyantlara tek tıkla aynı set.
    3) "Galeriden seç" — çoklu aç/kapa (ImagePicker); yeni görsel en sona eklenir, varyantın kendi sırası korunur.
    4) Yükle — galeriye eklenir ve YALNIZ yeni yüklenen görsel bu varyanta bağlanır.
  Değişiklikler `variant.images`'ta tutulur, ürün kaydıyla gider (sözleşme aynı).
-->
<template>
  <EkDialogCard class="productVariantImagesComponent pvi" title="Varyant Resimleri" icon="mdi-palette-swatch-outline" width="xl"
    :description="headline" confirm-label="Bitti" confirm-icon="mdi-check" hide-cancel @close="emits('close')" @confirm="emits('close')">
    <div class="pvi-body">
      <section class="pvi-sec" aria-labelledby="pvi-own-h">
        <header class="pvi-sec__head">
          <h3 id="pvi-own-h" class="pvi-sec__title">Bu varyantın görselleri <span class="pvi-count ek-num">{{ ownIds.length }}</span></h3>
          <span class="pvi-sec__hint">İlk görsel varyantın ana görseli · sürükleyin ya da <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd></span>
        </header>

        <div v-if="!ownIds.length" class="pvi-own-empty">
          <v-icon icon="mdi-image-off-outline" aria-hidden="true" />
          <div>
            <strong>Bu varyanta görsel atanmadı.</strong>
            <span>Aşağıdaki galeriden seçin ya da yeni görsel yükleyin.</span>
          </div>
        </div>
        <ul v-else ref="stripRef" class="pvi-strip" aria-label="Varyant görselleri, sıralı">
          <li v-for="(id, i) in ownIds" :key="id" class="pvi-own" :data-id="id" :class="{ 'is-main': i === 0 }">
            <button type="button" class="pvi-own__img" :data-own="id"
              :aria-label="`Varyant görseli ${i + 1} / ${ownIds.length}${i === 0 ? ', ana görsel' : ''}. Taşımak için Alt ve ok tuşları.`"
              @keydown="onOwnKey($event, i)">
              <GalleryThumb :src="urlOf(id)" />
            </button>
            <span v-if="i === 0" class="pvi-own__badge"><v-icon icon="mdi-star" aria-hidden="true" />Ana</span>
            <span v-else class="pvi-own__badge pvi-own__badge--n ek-num" aria-hidden="true">{{ i + 1 }}</span>
            <button type="button" class="pvi-own__remove" :aria-label="`Görsel ${i + 1} varyanttan kaldır`" @click="removeOwn(id)">
              <v-icon :icon="icons.close" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>

      <EkAlert v-if="siblings.length" tone="info" dense class="pvi-siblings"
        :title="`${siblingGroupTitle}: ${siblingValueTitle} olan ${siblings.length} varyant daha var`"
        :text="siblingsInSync ? 'Hepsi bu varyantla aynı görselleri kullanıyor.' : 'Aynı görselleri onlara da tek tıkla uygulayabilirsiniz.'">
        <template v-if="!siblingsInSync" #actions>
          <EkButton size="sm" icon="mdi-content-duplicate" :disabled="!ownIds.length" @click="applyToSiblings">{{ siblings.length }} varyanta uygula</EkButton>
        </template>
      </EkAlert>

      <section class="pvi-sec" aria-labelledby="pvi-gal-h">
        <header class="pvi-sec__head">
          <h3 id="pvi-gal-h" class="pvi-sec__title">Galeriden seç <span class="pvi-count ek-num">{{ gallery.length }}</span></h3>
          <EkButton size="sm" :icon="icons.upload" @click="fileInputRef?.click()">Görsel yükle</EkButton>
        </header>
        <div v-if="uploadItems.length" class="pvi-uploads" role="status">
          <div v-for="up in uploadItems" :key="up.id" class="pvi-up" :class="`is-${up.status}`">
            <span class="pvi-up__thumb"><GalleryThumb :src="up.previewUrl" :alt="up.name" /></span>
            <span class="pvi-up__text">
              <span class="pvi-up__name">{{ up.name }}</span>
              <span v-if="up.status === 'error'" class="pvi-up__err">{{ up.error }}</span>
              <v-progress-linear v-else :model-value="up.progress" :indeterminate="up.progress === 0" height="4" rounded color="primary" bg-color="neutral"
                :aria-label="`${up.name} yükleniyor`" />
            </span>
            <EkButton v-if="up.status === 'error'" size="sm" :icon="icons.refresh" @click="uploads.retry(up.id)">Tekrar dene</EkButton>
          </div>
        </div>
        <EkAlert v-if="rejected" tone="warning" dense dismissible :text="rejected" @dismiss="rejected = ''" />
        <p v-if="!gallery.length && !uploadItems.length" class="pvi-muted">Ürün galerisi boş. Yüklediğiniz görsel hem galeriye hem bu varyanta eklenir.</p>
        <ImagePicker v-else :images="gallery" :model-value="ownIds" size="sm" label="Ürün galerisi" @update:model-value="onPick" />
      </section>

      <input ref="fileInputRef" class="pvi-file" type="file" multiple :accept="IMAGE_GUIDE.acceptAttr" tabindex="-1" aria-hidden="true" @change="onFileInput" />
      <div class="ek-sr-only" aria-live="assertive" aria-atomic="true">{{ liveMsg }}</div>
    </div>
    <template #actions-start>
      <span class="pvi-save"><v-icon icon="mdi-information-outline" aria-hidden="true" />Varyant görselleri ürünü kaydettiğinizde kaydedilir</span>
    </template>
  </EkDialogCard>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Sortable from 'sortablejs'
import EkDialogCard from '@/components/ds/EkDialogCard.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkAlert from '@/components/ds/EkAlert.vue'
import { icons } from '@/design/icons'
import useRestApi from '@/composables/restapi'
import { useToast } from '@/composables/useToast'
import { useChoicesStore } from '@/stores/choicesStore'
import GalleryThumb from '@/components/productDefinitions/images/GalleryThumb.vue'
import ImagePicker from '@/components/productDefinitions/images/ImagePicker.vue'
import { useImageUploads } from '@/components/productDefinitions/images/useImageUploads'
import { motionMs } from '@/components/productDefinitions/images/motion'
import {
  IMAGE_GUIDE, buildOptionGroups, moveItem, preferredGroup, pruneVariantRefs, variantImageIds, variantKey, variantLabel,
  type GalleryImage, type VariantLike,
} from '@/components/productDefinitions/images/galleryModel'

defineModel({ default: false })
const emits = defineEmits(['refreshImages', 'close'])
const props = defineProps<{ productInfoForm: any; variant: VariantLike }>()

const restApi = useRestApi() as any
const { showToast } = useToast()
const choicesStore = useChoicesStore()
const valueTitle = (id: string) => choicesStore.getDirectChoiceValueTitle(id) as string | undefined

const gallery = computed<GalleryImage[]>(() => props.productInfoForm.images ?? [])
const ownIds = computed(() => variantImageIds(props.variant, gallery.value))
const urlOf = (id: string) => gallery.value.find((x) => x._id === id)?.url
const headline = computed(() => `${variantLabel(props.variant, valueTitle)}${props.variant.stockcode ? ` · ${props.variant.stockcode}` : ''}`)

const liveMsg = ref('')
function announce(msg: string) {
  liveMsg.value = ''
  requestAnimationFrame(() => { liveMsg.value = msg })
}

/** Varyantın görsellerini (kimlik listesi) yazar; galeride karşılığı olmayan eski referanslar düşer. */
function setOwn(ids: string[]) {
  props.variant.images = ids.slice()
}

// ---- kaldır (geri al)
function removeOwn(id: string) {
  const before = (props.variant.images ?? []).slice()
  const i = ownIds.value.indexOf(id)
  setOwn(ownIds.value.filter((x) => x !== id))
  announce(`Görsel ${i + 1} varyanttan kaldırıldı`)
  showToast({ tone: 'info', message: 'Görsel bu varyanttan kaldırıldı (galeride duruyor).', actionLabel: 'Geri al', onAction: () => { props.variant.images = before } })
  nextTick(() => stripRef.value?.querySelector<HTMLElement>('.pvi-own__img')?.focus())
}

// ---- galeriden seç: eklenen sona, kaldırılan çıkar; varyantın kendi sırası korunur
function onPick(next: string[]) {
  const cur = ownIds.value
  const kept = cur.filter((id) => next.includes(id))
  const added = next.filter((id) => !cur.includes(id))
  setOwn([...kept, ...added])
  announce(added.length ? `Görsel eklendi, ${kept.length + added.length}. sırada` : 'Görsel kaldırıldı')
}

// ---- sıralama: sürükle-bırak + Alt+ok
const stripRef = ref<HTMLElement | null>(null)
function onOwnKey(e: KeyboardEvent, i: number) {
  if (!e.altKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
  e.preventDefault()
  const n = ownIds.value.length
  const to = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : i + (e.key === 'ArrowLeft' ? -1 : 1)
  if (to < 0 || to >= n || to === i) return
  const id = ownIds.value[i]
  setOwn(moveItem(ownIds.value, i, to))
  announce(`Konum ${to + 1} / ${n}${to === 0 ? ', ana görsel' : ''}`)
  nextTick(() => stripRef.value?.querySelector<HTMLElement>(`[data-own="${id}"]`)?.focus())
}

let sortable: Sortable | null = null
watch(stripRef, (el) => {
  sortable?.destroy()
  sortable = null
  if (!el) return
  sortable = Sortable.create(el, {
    draggable: '.pvi-own',
    filter: '.pvi-own__remove',
    preventOnFilter: false,
    animation: motionMs('base'),
    forceFallback: true,
    fallbackTolerance: 4,
    fallbackClass: 'pvi-drag-clone',
    ghostClass: 'is-ghost',
    onEnd(evt) {
      const item = evt.item
      evt.from.removeChild(item)
      evt.from.insertBefore(item, evt.from.children[evt.oldIndex ?? 0] ?? null)
      const from = evt.oldDraggableIndex ?? -1
      const to = evt.newDraggableIndex ?? -1
      if (from < 0 || to < 0 || from === to) return
      setOwn(moveItem(ownIds.value, from, to))
      announce(`Görsel ${to + 1}. sıraya taşındı`)
    },
  })
})
onBeforeUnmount(() => sortable?.destroy())

// ---- aynı seçenek değerini paylaşan kardeşler
const variants = computed<VariantLike[]>(() => props.productInfoForm.variants ?? [])
const siblingGroup = computed(() => preferredGroup(buildOptionGroups(variants.value, (id) => choicesStore.getChoiceTitle(id as any) as string | undefined, valueTitle)))
const siblingValue = computed(() => {
  const g = siblingGroup.value
  if (!g) return undefined
  const myKey = variantKey(props.variant, variants.value.indexOf(props.variant))
  return g.values.find((v) => v.variantKeys.includes(myKey))
})
const siblingGroupTitle = computed(() => siblingGroup.value?.title ?? '')
const siblingValueTitle = computed(() => siblingValue.value?.title ?? '')
const siblings = computed(() => {
  const val = siblingValue.value
  if (!val || (siblingGroup.value?.values.length ?? 0) < 2) return []
  return variants.value.filter((v, i) => v !== props.variant && val.variantKeys.includes(variantKey(v, i)))
})
const siblingsInSync = computed(() => siblings.value.every((v) => {
  const ids = variantImageIds(v, gallery.value)
  return ids.length === ownIds.value.length && ids.every((x, i) => x === ownIds.value[i])
}))

function applyToSiblings() {
  const targets = siblings.value
  const snapshot = targets.map((v) => (v.images ?? []).slice())
  targets.forEach((v) => { v.images = ownIds.value.slice() })
  const msg = `${siblingValueTitle.value} görselleri ${targets.length} varyanta uygulandı.`
  announce(msg)
  showToast({ tone: 'success', message: msg, actionLabel: 'Geri al', onAction: () => targets.forEach((v, i) => { v.images = snapshot[i] }) })
}

// ---- yükleme: galeriye ekle + yalnız yeni görseli bu varyanta bağla
const fileInputRef = ref<HTMLInputElement | null>(null)
const rejected = ref('')
const uploads = useImageUploads({
  product: () => props.productInfoForm,
  onUploaded: async (_imgs, name) => {
    const before = new Set(gallery.value.map((x) => x._id))
    const resp = await restApi.postImage('getImages', { productId: props.productInfoForm.tempId })
    if (!resp || resp instanceof Error || !Array.isArray(resp.images)) return
    props.productInfoForm.images = resp.images
    if (props.productInfoForm.variants) pruneVariantRefs(props.productInfoForm.variants, resp.images)
    const fresh = resp.images.filter((x: GalleryImage) => !before.has(x._id)).map((x: GalleryImage) => x._id)
    if (fresh.length) setOwn([...ownIds.value, ...fresh.filter((id: string) => !ownIds.value.includes(id))])
    announce(`${name} yüklendi ve bu varyanta eklendi`)
    emits('refreshImages', '')
  },
})
const uploadItems = uploads.items
function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  const bad = uploads.add(Array.from(input.files ?? []))
  rejected.value = bad.length ? bad.map((r) => `${r.file.name}: ${r.reason}`).join(' · ') : ''
  input.value = ''
}
</script>

<style scoped>
.pvi-body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
}

.pvi-sec {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.pvi-sec__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2) var(--ek-space-4);
}

.pvi-sec__title {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
  color: var(--ek-color-content-strong);
}

.pvi-count {
  padding: 0 7px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: 20px;
}

.pvi-sec__hint,
.pvi-muted,
.pvi-save {
  margin: 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.pvi-save {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.pvi-save :deep(.v-icon) {
  font-size: 16px;
}

kbd {
  padding: 0 4px;
  border: 1px solid var(--ek-color-border-strong);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--ek-color-surface);
  font: inherit;
  font-size: var(--ek-type-caption-size);
}

.pvi-own-empty {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-5);
  border: 1.5px dashed var(--ek-color-warning-border);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.pvi-own-empty > div {
  display: flex;
  flex-direction: column;
  font-size: var(--ek-type-body-size);
}

.pvi-own-empty :deep(.v-icon) {
  font-size: 28px;
}

.pvi-strip {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pvi-own {
  position: relative;
  width: 132px;
  aspect-ratio: 1;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  overflow: hidden;
  cursor: grab;
  background: var(--ek-color-surface);
  transition: var(--ek-transition-colors);
}

.pvi-own.is-main {
  width: 164px;
  border-color: var(--ek-color-action-border);
}

.pvi-own:hover {
  border-color: var(--ek-color-border-strong);
  box-shadow: var(--ek-shadow-card);
}

.pvi-own.is-ghost {
  border: 1.5px dashed var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}

.pvi-own.is-ghost > * {
  opacity: 0;
}

:global(.pvi-drag-clone) {
  opacity: 0.92 !important;
  box-shadow: var(--ek-shadow-popover) !important;
}

.pvi-own__img {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: none;
  cursor: inherit;
  border-radius: inherit;
}

.pvi-own__img:focus-visible,
.pvi-own__remove:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.pvi-own__badge {
  position: absolute;
  left: var(--ek-space-2);
  bottom: var(--ek-space-2);
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 7px;
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: 20px;
  font-weight: 600;
  pointer-events: none;
}

.pvi-own__badge :deep(.v-icon) {
  font-size: 14px;
}

.pvi-own__badge--n {
  border-color: var(--ek-color-border-subtle);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
}

.pvi-own__remove {
  position: absolute;
  top: var(--ek-space-2);
  right: var(--ek-space-2);
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  cursor: pointer;
  opacity: 0;
  transition: var(--ek-transition-colors), opacity var(--ek-duration-fast) var(--ek-easing-enter);
}

.pvi-own:hover .pvi-own__remove,
.pvi-own:focus-within .pvi-own__remove {
  opacity: 1;
}

.pvi-own__remove:hover {
  color: var(--ek-color-error);
  border-color: var(--ek-color-error-border);
}

.pvi-own__remove :deep(.v-icon) {
  font-size: 16px;
}

.pvi-uploads {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.pvi-up {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-2);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
}

.pvi-up.is-error {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
}

.pvi-up__thumb {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  overflow: hidden;
  flex: 0 0 auto;
}

.pvi-up__text {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  flex: 1 1 auto;
  min-width: 0;
}

.pvi-up__name {
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-default);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pvi-up__err {
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-error-emphasis);
}

.pvi-file {
  display: none;
}

@media (hover: none) {
  .pvi-own__remove {
    opacity: 1;
    width: 40px;
    height: 40px;
  }
}

@media (max-width: 640px) {
  .pvi-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .pvi-own,
  .pvi-own.is-main {
    width: auto;
  }

  .pvi-own.is-main {
    grid-column: span 2;
    grid-row: span 2;
  }
}
</style>
