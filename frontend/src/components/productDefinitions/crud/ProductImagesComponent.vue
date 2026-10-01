<!--
  frontend/src/components/productDefinitions/crud/ProductImagesComponent.vue

  Faz 3 B2 — ürün resim galerisi (ürün ekle/güncelle; ProductDefinitionView, ProductUpdateView, varyant adımı).
  Önceki hâl: sabit 280px kartlar, eylemler yalnız hover'da, kapak kavramı yok, varyant ataması ancak görsel
  seçilince beliren çoklu açılır listeler, yüklemede tek "yükleniyor" örtüsü, silmede geri dönüş yok, 390px'te
  yatay taşma; watcher içinde `console.log` + `deep` izleyici, kullanılmayan örnek veri/fonksiyonlar.

  Yeni yapı (araştırma → karar: frontend/docs/b2-review/README.md):
    [Galeri | Varyant görselleri]  (varyantlı üründe sekme)
    Galeri: toplu işlem çubuğu (EkBulkBar) → ızgara: İLK HÜCRE KAPAK (2×2), sonra küçük kutular, en sonda
    "Görsel ekle". Sürükle-bırak ile sırala (kapak hücresine bırakılan kapak olur); klavye: tutamakta Boşluk →
    oklar → Boşluk/Esc; ⋯ menüsü: Kapak yap · Bir öne/geriye taşı · Önizle · İndir · Sil. Sil = geri al tostu
    (istek toast kapanınca gider). Yükleme: sürükle-bırak + tıkla + yapıştır (Ctrl+V), kart başına ilerleme /
    hata / Tekrar dene. Kalite ipuçları (çözünürlük/oran — genel öneri, pazaryeri kuralı DEĞİL).
    Varyant görselleri: VariantImageAssign (seçenek grubu seviyesinde atama).
  Backend sözleşmesi DEĞİŞMEDİ: ImageApi `getImages` · `upload` (dosya başına) · `sortImages` · `deleteImage` ·
  `deleteImageSelected` · `downloadImage`. Varyant atamaları `productInfoForm.variants[].images`'ta, ürünle kaydedilir.
-->
<template>
  <EkDialogCard class="productImagesComponent pig" title="Ürün Resim Galerisi" icon="mdi-image-multiple-outline" width="xl"
    :description="description" confirm-label="Bitti" confirm-icon="mdi-check" hide-cancel @close="finish" @confirm="finish">
    <div ref="bodyRef" class="pig-body" :class="{ 'is-dragging-files': fileDrag }" @dragenter="onDragEnter" @dragover="onDragOver"
      @dragleave="onDragLeave" @drop="onDrop">
      <EkPageTabs v-if="hasVariants" v-model="tab" dense class="pig-tabs" label="Galeri bölümleri" :tabs="tabs" />

      <!-- ============================================================ GALERİ -->
      <section v-show="tab === 'gallery'" class="pig-gallery" aria-label="Galeri">
        <EkBulkBar v-if="visible.length || uploadItems.length" class="pig-bar" :count="selected.length" noun="görsel" @clear="selected = []">
          <template #start>
            <span class="pig-bar__hint">
              <v-icon icon="mdi-gesture-tap-hold" aria-hidden="true" />
              <span><strong>Sırayı değiştirmek için</strong> görseli sürükleyin<span class="pig-wide"> ya da ⋯ menüsünden taşıyın</span> · 1. görsel <strong>kapak</strong></span>
            </span>
          </template>
          <template #end>
            <EkButton v-if="visible.length > 1" size="sm" tone="ghost" icon="mdi-checkbox-multiple-marked-outline" @click="selectAll">Tümünü seç</EkButton>
            <EkButton size="sm" :icon="icons.upload" @click="pickFiles">Görsel yükle</EkButton>
          </template>
          <template #actions>
            <EkButton v-if="hasVariants" size="sm" icon="mdi-palette-swatch-outline" :aria-expanded="assignOpen" aria-controls="pig-assign"
              @click="assignOpen = !assignOpen">Varyantlara ata</EkButton>
            <EkButton size="sm" :icon="icons.download" :disabled="selected.length > 5" @click="downloadSelected">İndir</EkButton>
            <EkActionButton action="delete" show-label label="Seçilenleri sil" @click="removeImages(selected.slice())" />
          </template>
        </EkBulkBar>

        <!-- seçilileri seçenek değerlerine ata -->
        <div v-if="assignOpen && selected.length" id="pig-assign" class="pig-assign" role="group" aria-label="Seçili görselleri varyantlara ata">
          <div v-for="g in optionGroups" :key="g.choiceId" class="pig-assign__group">
            <span :id="`pig-ag-${g.choiceId}`" class="pig-micro">{{ g.title }}</span>
            <div class="pig-assign__values" role="group" :aria-labelledby="`pig-ag-${g.choiceId}`">
              <button v-for="v in g.values" :key="v.valueId" type="button" class="pig-pill" :class="{ 'is-on': assignSel[g.choiceId]?.includes(v.valueId) }"
                :aria-pressed="!!assignSel[g.choiceId]?.includes(v.valueId)" @click="toggleAssignValue(g.choiceId, v.valueId)">
                <v-icon v-if="assignSel[g.choiceId]?.includes(v.valueId)" icon="mdi-check" aria-hidden="true" />{{ v.title }}
              </button>
            </div>
          </div>
          <div class="pig-assign__bar">
            <span class="pig-assign__count" aria-live="polite">
              <template v-if="assignTargets.length">{{ selected.length }} görsel → <strong class="ek-num">{{ assignTargets.length }}</strong> varyanta eklenecek</template>
              <template v-else>Değer seçin (ör. Renk: Kırmızı → o renkteki tüm bedenler)</template>
            </span>
            <EkButton size="sm" tone="ghost" @click="assignOpen = false">Vazgeç</EkButton>
            <EkButton size="sm" tone="primary" icon="mdi-check" :disabled="!assignTargets.length" @click="assignSelected">Ata</EkButton>
          </div>
        </div>

        <EkAlert v-if="rejected.length" tone="warning" dense dismissible :title="`${rejected.length} dosya eklenmedi`" @dismiss="rejected = []">
          <ul class="pig-rejected">
            <li v-for="r in rejected.slice(0, 4)" :key="r.name"><strong>{{ r.name }}</strong> — {{ r.reason }}</li>
          </ul>
        </EkAlert>
        <EkAlert v-if="failedCount > 1" tone="error" dense :title="`${failedCount} görsel yüklenemedi`" text="Bağlantınızı kontrol edip yeniden deneyin.">
          <template #actions><EkButton size="sm" :icon="icons.refresh" @click="uploads.retryAll()">Tümünü tekrar dene</EkButton></template>
        </EkAlert>

        <!-- boş durum = büyük bırakma alanı -->
        <div v-if="!visible.length && !uploadItems.length" class="pig-empty">
          <button type="button" class="pig-drop" @click="pickFiles">
            <span class="pig-drop__icon" aria-hidden="true"><v-icon :icon="icons.upload" /></span>
            <span class="pig-drop__title"><span class="pig-pointer">Ürün görsellerini buraya bırakın</span><span class="pig-touch">Ürün görsellerini ekleyin</span></span>
            <span class="pig-drop__sub"><span class="pig-pointer">ya da </span><u>cihazınızdan seçin</u><span class="pig-pointer"> · panoya kopyaladığınız görseli <kbd>Ctrl</kbd>+<kbd>V</kbd> ile yapıştırın</span></span>
          </button>
          <ul class="pig-guide" aria-label="Görsel önerileri">
            <li><v-icon icon="mdi-file-image-outline" aria-hidden="true" />JPG, PNG ya da WebP · tek seferde en çok {{ IMAGE_GUIDE.maxFilesPerBatch }}</li>
            <li><v-icon icon="mdi-arrow-expand-all" aria-hidden="true" />Kısa kenar en az {{ IMAGE_GUIDE.recommendedPx }} px (yakınlaştırma için)</li>
            <li><v-icon icon="mdi-square-rounded-outline" aria-hidden="true" />Sade/beyaz zemin, ürün kareyi doldursun</li>
            <li><v-icon icon="mdi-star-outline" aria-hidden="true" />İlk görsel kapak olur; sonra sürükleyerek değiştirebilirsiniz</li>
          </ul>
        </div>

        <ul v-else ref="gridRef" class="pig-grid" role="list" aria-label="Ürün görselleri" aria-describedby="pig-kbd-help">
          <li v-for="(img, i) in visible" :key="img._id" class="pig-tile" :data-id="img._id"
            :class="{ 'is-cover': i === 0, 'is-selected': isSelected(img._id), 'is-grabbed': grabbed === img._id, 'has-selection': selected.length > 0 }">
            <div class="pig-tile__media">
            <button type="button" class="pig-tile__open" :aria-label="`Görsel ${i + 1}${i === 0 ? ' (kapak)' : ''} — büyük önizleme`"
              @click="openLightbox(i)">
              <GalleryThumb :src="img.url" :alt="`Görsel ${i + 1}`" />
            </button>

            <div class="pig-tile__top">
              <label class="pig-check" @click.stop>
                <input type="checkbox" :checked="isSelected(img._id)" :aria-label="`Görsel ${i + 1} seç`" @change="toggleSelect(img._id)" />
                <span class="pig-check__box" aria-hidden="true"><v-icon icon="mdi-check" /></span>
              </label>
              <span class="pig-tile__spacer" />
              <button type="button" class="pig-handle" :aria-label="`Görsel ${i + 1} sırasını değiştir`" aria-roledescription="sıralama tutamağı"
                :aria-pressed="grabbed === img._id" aria-describedby="pig-kbd-help" :data-handle="img._id"
                :data-ek-esc-local="grabbed === img._id ? '' : undefined"
                @keydown="onHandleKey($event, img._id)" @blur="onHandleBlur(img._id)">
                <v-icon icon="mdi-drag" aria-hidden="true" />
              </button>
              <EkContextMenu :groups="tileMenu(i)" :label="`Görsel ${i + 1} işlemleri`" class="pig-menu" @select="(it) => onTileMenu(it.key, img, i)">
                <template #activator="{ props: mp }">
                  <button v-bind="mp" type="button" class="pig-iconbtn" :aria-label="`Görsel ${i + 1} işlemleri`">
                    <v-icon :icon="icons.more" aria-hidden="true" />
                  </button>
                </template>
              </EkContextMenu>
            </div>

            <div class="pig-tile__foot">
              <span class="pig-tile__meta">
                <EkTooltip v-if="qualityOf(img).length" :text="qualityOf(img).map((h) => h.text).join(' ')">
                  <span class="pig-badge" :class="`pig-badge--${worstLevel(qualityOf(img))}`" tabindex="0" role="img"
                    :aria-label="qualityOf(img).map((h) => h.short).join(', ')">
                    <v-icon :icon="worstLevel(qualityOf(img)) === 'warning' ? 'mdi-alert-outline' : 'mdi-information-outline'" aria-hidden="true" />
                    <span v-if="i === 0" class="pig-badge__txt">{{ qualityOf(img)[0].short }}</span>
                  </span>
                </EkTooltip>
                <EkTooltip v-if="hasVariants" :text="usageCount(img._id) ? `${usageCount(img._id)} varyantta kullanılıyor` : 'Hiçbir varyanta atanmadı'">
                  <span class="pig-badge pig-badge--usage ek-num" :class="{ 'is-zero': !usageCount(img._id) }" tabindex="0" role="img"
                    :aria-label="usageCount(img._id) ? `${usageCount(img._id)} varyantta kullanılıyor` : 'Hiçbir varyanta atanmadı'">
                    <v-icon icon="mdi-palette-swatch-outline" aria-hidden="true" />{{ usageCount(img._id) }}
                  </span>
                </EkTooltip>
              </span>
            </div>
            </div>
            <!-- FR2-PFORM 27: hangi görsel olduğu altyazıda (sıra · kapak · dosya adı · çözünürlük) -->
            <div class="pig-tile__cap">
              <span class="pig-tile__pos ek-num" :class="{ 'is-cover': i === 0 }">
                <v-icon v-if="i === 0" icon="mdi-star" aria-hidden="true" />{{ i === 0 ? 'Kapak' : `${i + 1}. görsel` }}
              </span>
              <span class="pig-tile__name" :title="img.width && img.height ? `${imageName(img, i)} · ${img.width}×${img.height} px` : imageName(img, i)">{{ imageName(img, i) }}</span>
              <span v-if="i === 0 && img.width && img.height" class="pig-tile__dim ek-num">{{ img.width }}×{{ img.height }} px</span>
            </div>
          </li>

          <!-- yüklenenler -->
          <li v-for="up in uploadItems" :key="up.id" class="pig-tile pig-tile--upload" :class="`is-${up.status}`">
            <div class="pig-tile__media"><span class="pig-tile__open pig-tile__open--static"><GalleryThumb :src="up.previewUrl" :alt="up.name" /></span></div>
            <div class="pig-up" :role="up.status === 'error' ? 'alert' : undefined">
              <template v-if="up.status === 'error'">
                <span class="pig-up__title"><v-icon icon="mdi-alert-circle-outline" aria-hidden="true" />Yüklenemedi</span>
                <span class="pig-up__sub">{{ up.error }}</span>
                <span class="pig-up__actions">
                  <EkButton size="sm" :icon="icons.refresh" @click="uploads.retry(up.id)">Tekrar dene</EkButton>
                  <EkButton size="sm" tone="ghost" icon="mdi-close" icon-only :aria-label="`${up.name} yüklemesini kaldır`" @click="uploads.remove(up.id)" />
                </span>
              </template>
              <template v-else>
                <span class="pig-up__title ek-num">{{ up.status === 'queued' ? 'Sırada' : up.progress ? `Yükleniyor %${up.progress}` : 'Yükleniyor…' }}</span>
                <v-progress-linear :model-value="up.progress" :indeterminate="up.status === 'uploading' && up.progress === 0" height="4" rounded
                  color="primary" bg-color="neutral" :aria-label="`${up.name} yükleniyor`" />
              </template>
              <span class="pig-up__name" :title="up.name">{{ up.name }}</span>
            </div>
          </li>

          <li class="pig-tile pig-tile--add">
            <button type="button" class="pig-add" @click="pickFiles">
              <v-icon :icon="icons.upload" aria-hidden="true" />
              <span class="pig-add__title">Görsel ekle</span>
              <span class="pig-add__sub pig-pointer">Sürükleyin, seçin ya da yapıştırın</span>
            </button>
          </li>
        </ul>

        <p id="pig-kbd-help" class="ek-sr-only">
          Sırayı değiştirmek için tutamağa odaklanıp Boşluk tuşuna basın, ok tuşlarıyla taşıyın, Boşluk ile bırakın, Esc ile vazgeçin.
          İlk sıradaki görsel kapaktır.
        </p>
        <p v-if="visible.length" class="pig-guide-line">
          <v-icon icon="mdi-information-outline" aria-hidden="true" />
          Öneri: kısa kenar en az {{ IMAGE_GUIDE.recommendedPx }} px, kare ya da dikey, sade/beyaz zemin. Pazaryeri görsel kuralları kategoriye göre değişebilir.
        </p>
      </section>

      <!-- ============================================================ VARYANT -->
      <section v-if="hasVariants" v-show="tab === 'variants'" class="pig-variants" aria-label="Varyant görselleri">
        <VariantImageAssign :variants="productInfoForm.variants" :images="visible" @announce="announce" />
      </section>

      <div v-if="fileDrag" class="pig-dropveil" aria-hidden="true">
        <span class="pig-dropveil__box"><v-icon :icon="icons.upload" />Bırakın, galeriye eklensin</span>
      </div>
      <input ref="fileInputRef" class="pig-file" type="file" multiple :accept="IMAGE_GUIDE.acceptAttr" tabindex="-1" aria-hidden="true"
        @change="onFileInput" />
      <div class="ek-sr-only" aria-live="assertive" aria-atomic="true">{{ liveMsg }}</div>
    </div>

    <template #actions-start>
      <span class="pig-save" role="status">
        <template v-if="saving"><v-icon icon="mdi-cloud-sync-outline" aria-hidden="true" />Kaydediliyor…</template>
        <template v-else-if="uploadItems.length"><v-icon :icon="icons.upload" aria-hidden="true" />{{ uploadLine }}</template>
        <template v-else><v-icon icon="mdi-cloud-check-outline" aria-hidden="true" /><span>Sıra ve silme anında kaydedilir<span v-if="hasVariants" class="pig-wide"> · varyant atamaları ürünle kaydedilir</span></span></template>
      </span>
    </template>
  </EkDialogCard>

  <ImageLightbox :open="lightboxOpen" :images="visible" :index="lightboxIndex" :show-usage="hasVariants" :usage-of="usageNames"
    @update:index="(i) => (lightboxIndex = i)" @close="lightboxOpen = false" @cover="makeCoverById" @download="downloadImage"
    @remove="(id) => removeImages([id])" />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Sortable from 'sortablejs'
import { EkDialogCard, EkButton, EkActionButton, EkAlert, EkBulkBar, EkContextMenu, EkPageTabs, EkTooltip } from '@entegrasyonik/ui/components'
import type { EkMenuGroup } from '@entegrasyonik/ui/components'
import { icons } from '@entegrasyonik/ui/icons'
import useRestApi from '@/composables/restapi'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { useChoicesStore } from '@/stores/choicesStore'
import GalleryThumb from '@/components/productDefinitions/images/GalleryThumb.vue'
import ImageLightbox from '@/components/productDefinitions/images/ImageLightbox.vue'
import VariantImageAssign from '@/components/productDefinitions/images/VariantImageAssign.vue'
import { useImageUploads } from '@/components/productDefinitions/images/useImageUploads'
import { motionMs } from '@/components/productDefinitions/images/motion'
import {
  IMAGE_GUIDE, addImagesToVariants, buildOptionGroups, imageQuality, imageUsage, keyboardTarget, makeCover, matchingVariants,
  moveItem, pruneVariantRefs, sameOrder, sortByGallery, unassignedVariants, uploadSummary, variantKey, variantLabel, worstLevel,
  type GalleryImage, type OptionSelection,
} from '@/components/productDefinitions/images/galleryModel'

// Çağıranlar `v-model` bağlıyor (açık/kapalı); panel kendisi kullanmaz, `close` yayar.
defineModel({ default: false })
const emits = defineEmits(['refreshImages', 'close'])
const props = defineProps<{ productInfoForm: any; /** Açılış sekmesi (varyant adımından 'variants'). */ initialTab?: 'gallery' | 'variants' }>()

const restApi = useRestApi() as any
const { showToast, toasts, dismissToast } = useToast()
const choicesStore = useChoicesStore()

// ---------------------------------------------------------------- durum
const tab = ref<'gallery' | 'variants'>(props.initialTab ?? 'gallery')
const bodyRef = ref<HTMLElement | null>(null)
const gridRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const selected = ref<string[]>([])
const saving = ref(false)
const liveMsg = ref('')
const rejected = ref<{ name: string; reason: string }[]>([])

const images = computed<GalleryImage[]>(() => props.productInfoForm.images ?? [])
const variants = computed<any[]>(() => props.productInfoForm.variants ?? [])
const hasVariants = computed(() => !!props.productInfoForm.hasVariant && variants.value.some((v) => v.choices?.length))
if (!hasVariants.value) tab.value = 'gallery'

/** Silinmek üzere bekleyen (geri alınabilir) görseller — ızgarada gösterilmez. */
const pending = ref(new Map<string, { toastId: number; ids: string[] }>())
const pendingIds = computed(() => new Set([...pending.value.values()].flatMap((p) => p.ids)))
const visible = computed(() => images.value.filter((img) => !pendingIds.value.has(img._id)))

const description = computed(() => {
  const n = visible.value.length
  return n
    ? `${n} görsel · ürün sayfasında ve kanallarda bu sırayla gösterilir; 1. görsel kapaktır`
    : 'Ürününüzün görsellerini ekleyin; ilk görsel kapak olur'
})

const valueTitle = (id: string) => choicesStore.getDirectChoiceValueTitle(id) as string | undefined
const usage = computed(() => imageUsage(visible.value, variants.value))
const usageCount = (id: string) => usage.value.get(id)?.length ?? 0
const usageNames = (id: string) => {
  const keys = usage.value.get(id) ?? []
  return variants.value.filter((v, i) => keys.includes(variantKey(v, i))).map((v) => variantLabel(v, valueTitle))
}
const missingCount = computed(() => (hasVariants.value ? unassignedVariants(variants.value, visible.value).length : 0))
const tabs = computed(() => [
  { value: 'gallery', label: 'Galeri', icon: 'mdi-image-multiple-outline', count: visible.value.length },
  { value: 'variants', label: missingCount.value ? `Varyantlar · ${missingCount.value} eksik` : 'Varyantlar', icon: 'mdi-palette-swatch-outline' },
])

const qualityCache = new WeakMap<object, ReturnType<typeof imageQuality>>()
function qualityOf(img: GalleryImage) {
  let q = qualityCache.get(img)
  if (!q) { q = imageQuality(img); qualityCache.set(img, q) }
  return q
}

/** Görselin okunur adı: yüklenen dosya adı (varsa), yoksa sıra. */
function imageName(img: GalleryImage, i: number) {
  const raw = String(img.originalname ?? img.originalName ?? img.name ?? '').trim()
  // Adsız yüklemede backend yükleme kimliğini ad yapar — kimlik gösterilmez.
  return raw && !/^[0-9a-f-]{16,}$/i.test(raw) ? raw : `Görsel ${i + 1}`
}

function announce(msg: string) {
  liveMsg.value = ''
  requestAnimationFrame(() => { liveMsg.value = msg })
}

// ---------------------------------------------------------------- seçim
const isSelected = (id: string) => selected.value.includes(id)
function toggleSelect(id: string) {
  selected.value = isSelected(id) ? selected.value.filter((x) => x !== id) : [...selected.value, id]
}
function selectAll() {
  selected.value = visible.value.map((x) => x._id)
}
watch(visible, (list) => {
  const ids = new Set(list.map((x) => x._id))
  if (selected.value.some((id) => !ids.has(id))) selected.value = selected.value.filter((id) => ids.has(id))
})
watch(() => selected.value.length, (n) => { if (!n) assignOpen.value = false })

// ---------------------------------------------------------------- sunucu: yenile / sırala / sil
const tempId = () => props.productInfoForm.tempId
let refreshing: Promise<void> | null = null
let refreshAgain = false

async function refreshImages() {
  if (refreshing) { refreshAgain = true; return refreshing }
  refreshing = (async () => {
    do {
      refreshAgain = false
      const resp = await restApi.postImage('getImages', { productId: tempId() })
      if (resp && !(resp instanceof Error) && Array.isArray(resp.images)) {
        props.productInfoForm.images = resp.images
        if (props.productInfoForm.variants) pruneVariantRefs(props.productInfoForm.variants, resp.images)
      }
    } while (refreshAgain)
    refreshing = null
    emits('refreshImages', '')
  })()
  return refreshing
}

/** Yeni sırayı uygular (iyimser) ve `sortImages` ile kaydeder; hata olursa eski sıraya döner. */
async function commitOrder(next: GalleryImage[], message?: string) {
  const before = images.value.slice()
  const tail = before.filter((img) => pendingIds.value.has(img._id))
  const full = [...next, ...tail]
  if (sameOrder(full, before)) return
  props.productInfoForm.images = full
  saving.value = true
  const resp = await restApi.postImage('sortImages', { sortedImageIds: full.map((x) => x._id), tempProductId: tempId() })
  saving.value = false
  if (resp !== true) {
    props.productInfoForm.images = before
    showToast({ tone: 'error', title: 'Sıra kaydedilemedi', message: 'Bağlantınızı kontrol edip tekrar deneyin.' })
    return
  }
  if (message) announce(message)
}

function makeCoverById(id: string) {
  const i = visible.value.findIndex((x) => x._id === id)
  if (i <= 0) return
  void commitOrder(makeCover(visible.value, id), `Görsel ${i + 1} kapak yapıldı`)
  showToast({ tone: 'success', message: 'Kapak görseli değişti.' })
}

function moveBy(id: string, delta: number) {
  const i = visible.value.findIndex((x) => x._id === id)
  const to = Math.max(0, Math.min(visible.value.length - 1, i + delta))
  if (i === -1 || to === i) return
  void commitOrder(moveItem(visible.value, i, to), `Görsel ${to + 1}. sıraya taşındı${to === 0 ? ', kapak oldu' : ''}`)
}

/** Sil = geri al tostu; istek tost kapanınca (süre / kapat / en eskinin düşmesi) ya da panel kapanınca gider. */
function removeImages(ids: string[]) {
  if (!ids.length) return
  const key = ids.join('|')
  const n = ids.length
  const wasCover = visible.value[0] && ids.includes(visible.value[0]._id)
  selected.value = selected.value.filter((id) => !ids.includes(id))
  assignOpen.value = false
  const toastId = showToast({
    tone: 'info',
    message: n > 1 ? `${n} görsel silindi.` : `Görsel silindi.${wasCover ? ' Sıradaki görsel kapak oldu.' : ''}`,
    actionLabel: 'Geri al',
    duration: 6000,
    onAction: () => {
      const m = new Map(pending.value)
      m.delete(key)
      pending.value = m
      announce(n > 1 ? `${n} görsel geri alındı` : 'Görsel geri alındı')
    },
  })
  const m = new Map(pending.value)
  m.set(key, { toastId, ids })
  pending.value = m
  announce(n > 1 ? `${n} görsel silindi. Geri almak için bildirimdeki Geri al düğmesini kullanın.` : 'Görsel silindi. Geri alınabilir.')
}

async function commitDelete(key: string) {
  const p = pending.value.get(key)
  if (!p) return
  const m = new Map(pending.value)
  m.delete(key)
  pending.value = m
  // Görseller istek bitene dek gizli kalsın: önce yerelden düş, sonra sunucuya gönder.
  props.productInfoForm.images = images.value.filter((img) => !p.ids.includes(img._id))
  saving.value = true
  const resp = p.ids.length > 1
    ? await restApi.postImage('deleteImageSelected', { tempProductId: tempId(), selectedImages: p.ids })
    : await restApi.postImage('deleteImage', { imageId: p.ids[0], tempProductId: tempId() })
  saving.value = false
  if (resp !== true) showToast({ tone: 'error', title: 'Görsel silinemedi', message: 'Görsel galeride bırakıldı. Tekrar deneyin.' })
  await refreshImages()
}

// Tost kapandığında (Geri al'a basılmadıysa) silmeyi gönder.
watch(() => toasts.map((t) => t.id), (ids) => {
  for (const [key, p] of pending.value) if (!ids.includes(p.toastId)) void commitDelete(key)
})

function flushPending() {
  for (const [key, p] of pending.value) {
    dismissToast(p.toastId)
    void commitDelete(key)
  }
}

function finish() {
  flushPending()
  emits('close')
}
onBeforeUnmount(flushPending)

// ---------------------------------------------------------------- indirme
function downloadImage(id: string) {
  const link = document.createElement('a')
  link.href = restApi.downloadImage(id)
  link.target = '_blank'
  link.rel = 'noopener'
  link.click()
}
function downloadSelected() {
  selected.value.slice(0, 5).forEach(downloadImage)
}

// ---------------------------------------------------------------- toplu varyant ataması
const assignOpen = ref(false)
const assignSel = ref<OptionSelection>({})
const optionGroups = computed(() =>
  buildOptionGroups(variants.value, (id) => choicesStore.getChoiceTitle(id as any) as string | undefined, valueTitle))
const assignTargets = computed(() => matchingVariants(variants.value, assignSel.value))
function toggleAssignValue(choiceId: string, valueId: string) {
  const cur = assignSel.value[choiceId] ?? []
  assignSel.value = { ...assignSel.value, [choiceId]: cur.includes(valueId) ? cur.filter((x) => x !== valueId) : [...cur, valueId] }
}
function assignSelected() {
  const targets = assignTargets.value
  const snapshot = targets.map((v) => (v.images ?? []).slice())
  const ids = sortByGallery(selected.value, visible.value)
  const changed = addImagesToVariants(targets, ids, visible.value)
  assignOpen.value = false
  assignSel.value = {}
  selected.value = []
  const msg = changed ? `${ids.length} görsel ${changed} varyanta eklendi.` : 'Seçili görseller bu varyantlarda zaten vardı.'
  announce(msg)
  showToast({
    tone: 'success', message: msg,
    ...(changed ? { actionLabel: 'Geri al', onAction: () => targets.forEach((v, i) => { v.images = snapshot[i] }) } : {}),
  })
}

// ---------------------------------------------------------------- kart menüsü
function tileMenu(i: number): EkMenuGroup[] {
  const last = visible.value.length - 1
  return [
    { items: [
      { key: 'cover', label: 'Kapak yap', icon: 'mdi-star-outline', disabled: i === 0 },
      { key: 'left', label: 'Bir öne taşı', icon: 'mdi-arrow-left', disabled: i === 0 },
      { key: 'right', label: 'Bir geriye taşı', icon: 'mdi-arrow-right', disabled: i === last },
    ] },
    { items: [
      { key: 'view', label: 'Büyük önizleme', icon: icons.view },
      { key: 'download', label: 'İndir', icon: icons.download },
    ] },
    { items: [{ key: 'delete', label: 'Sil', icon: icons.delete, danger: true }] },
  ]
}
function onTileMenu(key: string, img: GalleryImage, i: number) {
  if (key === 'cover') makeCoverById(img._id)
  else if (key === 'left') moveBy(img._id, -1)
  else if (key === 'right') moveBy(img._id, 1)
  else if (key === 'view') openLightbox(i)
  else if (key === 'download') downloadImage(img._id)
  else if (key === 'delete') removeImages([img._id])
}

// ---------------------------------------------------------------- önizleme
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)
function openLightbox(i: number) {
  lightboxIndex.value = i
  lightboxOpen.value = true
}

// ---------------------------------------------------------------- klavyeyle sıralama
const grabbed = ref<string | null>(null)
let grabStart: GalleryImage[] = []

function gridColumns() {
  const el = gridRef.value
  if (!el) return 1
  return Math.max(1, getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length)
}

function focusHandle(id: string) {
  nextTick(() => gridRef.value?.querySelector<HTMLElement>(`[data-handle="${id}"]`)?.focus())
}

function onHandleKey(e: KeyboardEvent, id: string) {
  const list = visible.value
  const i = list.findIndex((x) => x._id === id)
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    if (grabbed.value === id) return drop(true)
    grabbed.value = id
    grabStart = list.slice()
    announce(`Görsel ${i + 1} alındı. Konum ${i + 1} / ${list.length}. Ok tuşlarıyla taşıyın, Boşluk ile bırakın, Esc ile vazgeçin.`)
    return
  }
  if (grabbed.value !== id) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    props.productInfoForm.images = [...grabStart, ...images.value.filter((img) => pendingIds.value.has(img._id))]
    grabbed.value = null
    announce('Taşıma iptal edildi, görsel yerine döndü.')
    focusHandle(id)
    return
  }
  // Kapak 2×2 kapladığı için dikey adım satırdaki sütun sayısı kadar (yaklaşık, beklenen davranış).
  const to = keyboardTarget(i, e.key, gridColumns(), list.length)
  if (to === null) return
  e.preventDefault()
  if (to === i) return
  const next = moveItem(list, i, to)
  props.productInfoForm.images = [...next, ...images.value.filter((img) => pendingIds.value.has(img._id))]
  announce(`Konum ${to + 1} / ${list.length}${to === 0 ? ' — kapak' : ''}.`)
  focusHandle(id)
}

function drop(announceIt: boolean) {
  const id = grabbed.value
  if (!id) return
  grabbed.value = null
  const list = visible.value
  const to = list.findIndex((x) => x._id === id)
  props.productInfoForm.images = grabStart.concat(images.value.filter((img) => pendingIds.value.has(img._id)))
  void commitOrder(list, announceIt ? `Görsel ${to + 1}. sıraya bırakıldı${to === 0 ? ', kapak oldu' : ''}.` : undefined)
  focusHandle(id)
}

function onHandleBlur(id: string) {
  // Odak taşınırken (yeniden çizim) tutamak geçici kaybolabilir; gerçekten ayrılındıysa bırak.
  setTimeout(() => {
    if (grabbed.value !== id) return
    const active = document.activeElement as HTMLElement | null
    if (active?.dataset?.handle === id) return
    drop(false)
  }, 0)
}

// ---------------------------------------------------------------- sürükle-bırak (fare/dokunmatik)
let sortable: Sortable | null = null
function initSortable() {
  sortable?.destroy()
  sortable = null
  const el = gridRef.value
  if (!el) return
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
  sortable = Sortable.create(el, {
    draggable: '.pig-tile:not(.pig-tile--upload):not(.pig-tile--add)',
    // Dokunmatikte yalnız tutamaktan (sayfa kaydırması serbest); farede kartın tamamından.
    handle: coarse ? '.pig-handle' : undefined,
    filter: '.pig-check, .pig-iconbtn',
    preventOnFilter: false,
    animation: motionMs('base'),
    easing: 'ease-out',
    forceFallback: true,
    // FR2-PFORM 28: kopya BODY'ye eklenir. Kapta kalınca (varsayılan) diyalog kabının `transform`'u `position:fixed`
    // kopyanın kapsayıcı bloğunu değiştiriyor, kopya imleçten diyalog ofseti kadar uzakta çiziliyordu.
    fallbackOnBody: true,
    fallbackTolerance: 4,
    fallbackClass: 'pig-drag-clone',
    ghostClass: 'is-ghost',
    chosenClass: 'is-chosen',
    delay: coarse ? motionMs('fast') : 0,
    delayOnTouchOnly: true,
    onEnd(evt) {
      const from = evt.oldDraggableIndex ?? -1
      const to = evt.newDraggableIndex ?? -1
      // SortableJS DOM'u taşıdı; Vue listeyi yeniden çizeceği için DOM'u eski hâline al, veriyi güncelle.
      const item = evt.item
      const parent = evt.from
      parent.removeChild(item)
      parent.insertBefore(item, parent.children[evt.oldIndex ?? 0] ?? null)
      if (from < 0 || to < 0 || from === to) return
      void commitOrder(moveItem(visible.value, from, to), `Görsel ${to + 1}. sıraya taşındı${to === 0 ? ', kapak oldu' : ''}.`)
    },
  })
}
watch(gridRef, () => nextTick(initSortable))
onBeforeUnmount(() => sortable?.destroy())

// ---------------------------------------------------------------- yükleme
const uploads = useImageUploads({
  product: () => props.productInfoForm,
  onUploaded: (_imgs, name) => {
    announce(`${name} yüklendi`)
    void refreshImages()
  },
})
const uploadItems = uploads.items
const failedCount = computed(() => uploadSummary(uploadItems.value).failed)
const uploadLine = computed(() => {
  const s = uploadSummary(uploadItems.value)
  const parts = []
  if (s.active) parts.push(`${s.active} görsel yükleniyor${s.progress ? ` (%${s.progress})` : ''}`)
  if (s.failed) parts.push(`${s.failed} hata`)
  return parts.join(' · ')
})

function addFiles(files: File[]) {
  if (!files.length) return
  const bad = uploads.add(files)
  rejected.value = bad.map((r) => ({ name: r.file.name, reason: r.reason }))
  const ok = files.length - bad.length
  if (ok) announce(`${ok} görsel yükleniyor`)
  tab.value = 'gallery'
}

function pickFiles() {
  fileInputRef.value?.click()
}
function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  addFiles(Array.from(input.files ?? []))
  input.value = ''
}

const fileDrag = ref(false)
let dragDepth = 0
const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
function onDragEnter(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  dragDepth++
  fileDrag.value = true
}
function onDragOver(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}
function onDragLeave(e: DragEvent) {
  if (!hasFiles(e)) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) fileDrag.value = false
}
function onDrop(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  dragDepth = 0
  fileDrag.value = false
  addFiles(Array.from(e.dataTransfer?.files ?? []))
}

/** Yapıştır (Ctrl+V): odak galeri panelindeyken panodaki görsel dosyaları yüklenir; metin alanlarına karışmaz. */
function onPaste(e: ClipboardEvent) {
  const root = bodyRef.value
  const target = e.target as HTMLElement | null
  if (!root || lightboxOpen.value) return
  if (target && !root.contains(target) && target !== document.body) return
  if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName) && (target as HTMLInputElement).type !== 'checkbox') return
  const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
  if (!files.length) return
  e.preventDefault()
  addFiles(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `yapistirilan-${Date.now()}-${i + 1}.png`, { type: f.type }))))
}
onMounted(() => window.addEventListener('paste', onPaste))
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))
</script>

<style scoped>
.pig {
  /* FR2-PFORM 27: kutular büyüdü (148 → 184px); 1440'ta 5 kolon, kapak 2×2. */
  --pig-tile: 184px;
  height: 100%;
}

.pig-body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-height: 420px;
}

.pig-tabs {
  margin-top: calc(-1 * var(--ek-space-2));
}

.pig-gallery,
.pig-variants {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.pig-bar {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-muted);
}

.pig-bar__hint {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}

.pig-bar__hint :deep(.v-icon) {
  font-size: 16px;
}

.pig-bar__hint strong {
  color: var(--ek-color-content-default);
  font-weight: 600;
}

.pig-micro {
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

/* ---------------- toplu atama paneli */
.pig-assign {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.pig-assign__group {
  display: grid;
  grid-template-columns: 120px 1fr;
  align-items: center;
  gap: var(--ek-space-3);
}

.pig-assign__values {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.pig-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  min-height: 32px;
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-input);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font: inherit;
  font-size: var(--ek-type-label-size);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.pig-pill:hover {
  background: var(--ek-color-surface-muted);
}

.pig-pill.is-on {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.pig-pill :deep(.v-icon) {
  font-size: 16px;
}

.pig-pill:focus-visible,
.pig-add:focus-visible,
.pig-drop:focus-visible,
.pig-tile__open:focus-visible,
.pig-handle:focus-visible,
.pig-iconbtn:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.pig-assign__bar {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding-top: var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.pig-assign__count {
  margin-right: auto;
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}

.pig-assign__count strong {
  color: var(--ek-color-content-strong);
}

.pig-rejected {
  margin: 0;
  padding-left: var(--ek-space-4);
}

/* ---------------- boş durum */
.pig-empty {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: var(--ek-space-5);
  align-items: stretch;
}

.pig-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-3);
  min-height: 280px;
  padding: var(--ek-space-8);
  border: 1.5px dashed var(--ek-color-border-strong);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-muted);
  font: inherit;
  text-align: center;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.pig-drop:hover,
.is-dragging-files .pig-drop {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action-subtle);
}

.pig-drop__icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: var(--ek-radius-full);
  border: 1px solid var(--ek-color-action-border);
  background: var(--ek-color-surface);
  color: var(--ek-color-action);
}

.pig-drop__icon :deep(.v-icon) {
  font-size: 28px;
}

.pig-drop__title {
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
  color: var(--ek-color-content-strong);
}

.pig-drop__sub {
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.pig-drop__sub u {
  color: var(--ek-color-action);
  text-underline-offset: 3px;
}

kbd {
  padding: 0 5px;
  border: 1px solid var(--ek-color-border-strong);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--ek-color-surface);
  font: inherit;
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-default);
}

.pig-guide {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--ek-space-3);
  margin: 0;
  padding: var(--ek-space-5);
  list-style: none;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
}

.pig-guide li {
  display: grid;
  grid-template-columns: 20px 1fr;
  gap: var(--ek-space-3);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-default);
}

.pig-guide :deep(.v-icon) {
  font-size: 18px;
  margin-top: 2px;
  color: var(--ek-color-content-muted);
}

/* ---------------- ızgara */
.pig-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--pig-tile), 1fr));
  grid-auto-flow: dense;
  gap: var(--ek-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pig-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  overflow: hidden;
  transition: border-color var(--ek-duration-fast) var(--ek-easing-enter), box-shadow var(--ek-duration-fast) var(--ek-easing-enter);
}

.pig-tile.is-cover {
  grid-column: span 2;
  grid-row: span 2;
}

.pig-tile:not(.pig-tile--add):not(.pig-tile--upload) {
  cursor: grab;
}

.pig-tile:hover {
  border-color: var(--ek-color-border-strong);
  box-shadow: var(--ek-shadow-card);
}

.pig-tile.is-selected {
  border-color: var(--ek-color-action);
  box-shadow: 0 0 0 1px var(--ek-color-action);
}

.pig-tile.is-grabbed {
  border-color: var(--ek-color-action);
  box-shadow: 0 0 0 2px var(--ek-color-action), var(--ek-shadow-raised);
}

/* SortableJS: yer tutucu = kesik çerçeveli boş yuva; sürüklenen kopya = hafif gölge, ölçek/zıplama yok. */
.pig-tile.is-ghost {
  border: 1.5px dashed var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  box-shadow: none;
}

.pig-tile.is-ghost > * {
  opacity: 0;
}

:global(.pig-drag-clone) {
  opacity: 0.92 !important;
  box-shadow: var(--ek-shadow-popover) !important;
  cursor: grabbing !important;
}

.pig-tile__media {
  position: relative;
  flex: 1 1 auto;
  aspect-ratio: 1;
  min-height: 0;
}

.pig-tile.is-cover .pig-tile__media {
  aspect-ratio: auto;
}

.pig-tile__cap {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 36px;
  padding: var(--ek-space-1) var(--ek-space-2) var(--ek-space-1) var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pig-tile__pos {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 2px;
  color: var(--ek-color-content-strong);
  font-weight: 600;
}

.pig-tile__pos.is-cover {
  color: var(--ek-color-action-emphasis);
}

.pig-tile__pos :deep(.v-icon) {
  font-size: 14px;
}

.pig-tile__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--ek-color-content-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pig-tile__dim {
  flex: none;
  color: var(--ek-color-content-muted);
}

.pig-tile__open {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: none;
  cursor: inherit;
  border-radius: inherit;
}

.pig-tile__open--static {
  cursor: default;
}

.pig-tile__top {
  position: absolute;
  inset: 0 0 auto 0;
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  padding: var(--ek-space-2);
}

/* Sıralama tutamağı HER ZAMAN görünür (sıranın değiştirilebildiği anlaşılsın — FR2-PFORM 27); seçim ve menü üzerine gelince. */
.pig-tile__top > .pig-check,
.pig-tile__top > .pig-menu,
.pig-tile__top > :deep(.pig-menu) {
  opacity: 0;
  transition: opacity var(--ek-duration-fast) var(--ek-easing-enter);
}

.pig-tile:hover .pig-tile__top > *,
.pig-tile:focus-within .pig-tile__top > *,
.pig-tile.is-selected .pig-tile__top > *,
.pig-tile.has-selection .pig-tile__top > *,
.pig-tile.is-grabbed .pig-tile__top > * {
  opacity: 1;
}

@media (pointer: coarse) {
  .pig-tile__top > * {
    opacity: 1 !important;
  }
}

.pig-tile__spacer {
  flex: 1 1 auto;
}

.pig-check {
  position: relative;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  cursor: pointer;
}

.pig-check input {
  position: absolute;
  inset: 0;
  opacity: 0;
  margin: 0;
  cursor: pointer;
}

.pig-check__box {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1.5px solid var(--ek-color-border-input);
  border-radius: 5px;
  background: var(--ek-color-surface);
  color: transparent;
  transition: var(--ek-transition-colors);
}

.pig-check__box :deep(.v-icon) {
  font-size: 14px;
}

.pig-check input:checked + .pig-check__box {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
}

.pig-check input:focus-visible + .pig-check__box {
  box-shadow: var(--ek-focus-ring);
}

.pig-handle,
.pig-iconbtn {
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
  transition: var(--ek-transition-colors);
}

.pig-handle {
  cursor: grab;
}

.pig-handle[aria-pressed='true'] {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
}

.pig-handle:hover,
.pig-iconbtn:hover {
  background: var(--ek-color-surface-muted);
}

.pig-handle :deep(.v-icon),
.pig-iconbtn :deep(.v-icon) {
  font-size: 18px;
}

.pig-tile__foot {
  position: absolute;
  inset: auto 0 0 0;
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  padding: var(--ek-space-2);
  pointer-events: none;
}

.pig-tile__foot .pig-badge {
  pointer-events: auto;
}

.pig-tile__meta {
  display: inline-flex;
  gap: var(--ek-space-1);
  margin-left: auto;
}

.pig-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-height: 22px;
  padding: 0 7px;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: 20px;
  font-weight: 500;
  white-space: nowrap;
}

.pig-badge :deep(.v-icon) {
  font-size: 14px;
}

.pig-badge--cover {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-weight: 600;
}

.pig-badge--pos {
  min-width: 22px;
  justify-content: center;
  padding: 0 6px;
}

.pig-badge--warning {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.pig-badge--info {
  border-color: var(--ek-color-info-border);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
}

.pig-badge--usage.is-zero {
  color: var(--ek-color-content-muted);
  border-style: dashed;
}

.pig-badge:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

/* ---------------- yükleme kartı */
.pig-tile--upload .pig-tile__open :deep(img) {
  opacity: 0.35 !important;
}

.pig-up {
  position: absolute;
  inset: auto 0 0 0;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  padding: var(--ek-space-3);
  background: var(--ek-color-surface);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.pig-up__title {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  font-size: var(--ek-type-label-size);
  font-weight: 600;
  color: var(--ek-color-content-strong);
}

.pig-up__title :deep(.v-icon) {
  font-size: 16px;
}

.pig-up__sub {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pig-up__name {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pig-up__actions {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.pig-tile--upload.is-error {
  border-color: var(--ek-color-error-border);
}

.pig-tile--upload.is-error .pig-up {
  background: var(--ek-color-error-subtle);
  border-top-color: var(--ek-color-error-border);
}

.pig-tile--upload.is-error .pig-up__title {
  color: var(--ek-color-error-emphasis);
}

.pig-tile--upload.is-error .pig-up__sub {
  color: var(--ek-color-error-emphasis);
}

/* ---------------- ekle kutusu */
.pig-tile--add {
  border: 1.5px dashed var(--ek-color-border-strong);
  background: var(--ek-color-surface-sunken);
}

.pig-tile--add:hover {
  border-color: var(--ek-color-action);
  box-shadow: none;
}

.pig-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-1);
  width: 100%;
  height: 100%;
  padding: var(--ek-space-3);
  border: 0;
  background: none;
  color: var(--ek-color-content-muted);
  font: inherit;
  text-align: center;
  cursor: pointer;
  border-radius: inherit;
  transition: var(--ek-transition-colors);
}

.pig-add:hover {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.pig-add :deep(.v-icon) {
  font-size: 24px;
}

.pig-add__title {
  font-size: var(--ek-type-label-size);
  font-weight: 600;
  color: var(--ek-color-content-default);
}

.pig-add__sub {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pig-guide-line {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.pig-guide-line :deep(.v-icon) {
  font-size: 16px;
}

/* ---------------- dosya sürükleme örtüsü */
.pig-dropveil {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  border: 2px dashed var(--ek-color-action);
  border-radius: var(--ek-radius-card);
  background: color-mix(in srgb, var(--ek-color-action-subtle) 88%, transparent);
  pointer-events: none;
  animation: pig-fade var(--ek-duration-fast) var(--ek-easing-enter);
}

.pig-dropveil__box {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-5);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-popover);
  color: var(--ek-color-action-emphasis);
  font-weight: 600;
}

@keyframes pig-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.pig-file {
  display: none;
}

.pig-save {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}

.pig-save :deep(.v-icon) {
  font-size: 16px;
}

/* işaretçi / dokunmatik metinleri (sürükle-bırak ve Ctrl+V yalnız işaretçili cihazda anlamlı) */
.pig-touch {
  display: none;
}

/* dokunmatik: eylemler hep görünür, hedefler ≥ 40px */
@media (hover: none) {
  .pig-pointer {
    display: none;
  }

  .pig-touch {
    display: inline;
  }

  .pig-tile__top {
    opacity: 1;
  }

  .pig-handle,
  .pig-iconbtn,
  .pig-check {
    width: 40px;
    height: 40px;
  }
}

@media (max-width: 640px) {
  .pig {
    --pig-tile: 104px;
  }

  .pig-body {
    min-height: 0;
  }

  .pig-empty {
    grid-template-columns: 1fr;
  }

  .pig-drop {
    min-height: 200px;
    padding: var(--ek-space-5);
  }

  .pig-assign__group {
    grid-template-columns: 1fr;
    gap: var(--ek-space-2);
  }

  .pig-guide-line {
    display: none;
  }

  .pig-badge__txt,
  .pig-wide {
    display: none;
  }
}
</style>
