<!--
  frontend/src/components/productDefinitions/images/VariantImageAssign.vue

  Faz 3 B2 — varyanta görsel atama, SEÇENEK GRUBU seviyesinde (ör. Renk=Kırmızı → S/M/L hepsine tek seferde).
  Tek tek varyant yerine önce grup: aynı renkteki bedenler aynı fotoğrafları paylaşır (Shopify'ın "görselleri
  seçeneğe göre grupla" deseni). Grup satırı: değer adı · varyant/görsel sayısı · ortak görseller · durum
  ("Görsel yok" / "n varyantta farklı") · "Görsel seç". Editör satırın altında açılır (galeriden çoklu seçim),
  "Uygula" gruptaki TÜM varyantlara yazar, varyanta özel görseller korunur (galleryModel.applyGroupImages);
  toast'ta Geri al. Satır genişletilince varyantlar tek tek (küçük önizleme + eksik uyarısı) görünür.
  Atamalar ürün formunda tutulur ve ürün kaydedilince gider (backend sözleşmesi aynı: `variant.images`).
-->
<template>
  <div class="via">
    <div v-if="!variants.length" class="via__empty">
      <EkEmptyState variant="no-data" title="Bu üründe varyant yok"
        message="Varyant oluşturduğunuzda görselleri renk gibi seçeneklere göre buradan atayabilirsiniz." />
    </div>
    <template v-else>
      <EkAlert v-if="!images.length" tone="info" dense title="Önce galeriye görsel ekleyin"
        text="Atama, ürün galerisindeki görsellerden yapılır." />
      <EkAlert v-else-if="missing.length" tone="warning" dense :title="`${missing.length} varyantın görseli yok`"
        :text="missingText">
        <template #actions>
          <EkButton size="sm" tone="ghost" :icon="onlyMissing ? 'mdi-filter-remove-outline' : 'mdi-filter-variant'" :aria-pressed="onlyMissing"
            @click="onlyMissing = !onlyMissing">{{ onlyMissing ? 'Tümünü göster' : 'Yalnız eksikleri göster' }}</EkButton>
        </template>
      </EkAlert>
      <EkAlert v-else tone="success" dense title="Tüm varyantların görseli var" />

      <div v-if="groups.length > 1" class="via__groupby">
        <span id="via-groupby-l" class="via__micro">Görselleri şuna göre ata</span>
        <div class="via__seg" role="radiogroup" aria-labelledby="via-groupby-l" @keydown="onSegKey">
          <button v-for="g in groups" :key="g.choiceId" type="button" role="radio" class="via__seg-btn"
            :class="{ 'is-on': g.choiceId === groupId }" :aria-checked="g.choiceId === groupId"
            :tabindex="g.choiceId === groupId ? 0 : -1" @click="setGroup(g.choiceId)">
            {{ g.title }} <span class="ek-num via__seg-n">{{ g.values.length }}</span>
          </button>
        </div>
      </div>

      <ul class="via__rows" :aria-label="`${activeGroup?.title ?? 'Seçenek'} değerleri`">
        <li v-for="row in rows" :key="row.valueId" class="via__row" :class="{ 'is-open': editing === row.valueId, 'is-missing': row.missing === row.variants.length }">
          <div class="via__row-main">
            <button type="button" class="via__expand" :aria-expanded="expanded.has(row.valueId)" :aria-controls="`via-vars-${row.valueId}`"
              :aria-label="`${row.title} varyantlarını ${expanded.has(row.valueId) ? 'gizle' : 'göster'}`" @click="toggleExpand(row.valueId)">
              <v-icon icon="mdi-chevron-right" aria-hidden="true" />
            </button>
            <div class="via__row-title">
              <span class="via__name">{{ row.title }}</span>
              <span class="via__meta ek-num">{{ row.variants.length }} varyant · {{ row.common.length }} görsel</span>
            </div>
            <div class="via__thumbs" :aria-label="row.common.length ? `${row.title} ortak görselleri` : undefined" :role="row.common.length ? 'img' : undefined">
              <span v-for="id in row.common.slice(0, 5)" :key="id" class="via__thumb"><GalleryThumb :src="urlOf(id)" /></span>
              <span v-if="row.common.length > 5" class="via__more ek-num">+{{ row.common.length - 5 }}</span>
              <span v-if="!row.common.length && row.missing === row.variants.length" class="via__status is-warning">
                <v-icon icon="mdi-image-off-outline" aria-hidden="true" />Görsel yok
              </span>
            </div>
            <span v-if="row.partialVariants > 0" class="via__status is-info">
              <v-icon icon="mdi-information-outline" aria-hidden="true" />{{ row.partialVariants }} varyantta farklı
            </span>
            <EkButton size="sm" :tone="row.common.length ? 'ghost' : 'secondary'" :icon="row.common.length ? 'mdi-image-edit-outline' : 'mdi-image-plus-outline'"
              :disabled="!images.length" :aria-expanded="editing === row.valueId" :aria-controls="`via-edit-${row.valueId}`"
              @click="openEditor(row)">{{ row.common.length ? 'Düzenle' : 'Görsel seç' }}</EkButton>
          </div>

          <div v-if="editing === row.valueId" :id="`via-edit-${row.valueId}`" class="via__editor" role="group" :aria-label="`${row.title} için görsel seçimi`">
            <p class="via__editor-hint">
              <strong>{{ activeGroup?.title }}: {{ row.title }}</strong> olan {{ row.variants.length }} varyanta uygulanır.
              Varyanta özel eklediğiniz görseller korunur.
            </p>
            <ImagePicker v-model="draft" :images="images" :partial="row.partial" :label="`${row.title} için galeri görselleri`" />
            <div class="via__editor-bar">
              <span class="via__editor-count ek-num" aria-live="polite">{{ draft.length }} görsel seçili</span>
              <EkButton size="sm" tone="ghost" @click="editing = null">Vazgeç</EkButton>
              <EkButton size="sm" tone="primary" icon="mdi-check" :disabled="!draftChanged" @click="apply(row)">
                {{ row.variants.length }} varyanta uygula
              </EkButton>
            </div>
          </div>

          <ul v-if="expanded.has(row.valueId)" :id="`via-vars-${row.valueId}`" class="via__vars" :aria-label="`${row.title} varyantları`">
            <li v-for="v in row.variants" :key="v.key" class="via__var">
              <span class="via__var-name">{{ v.label }}<span v-if="v.code" class="via__var-code">{{ v.code }}</span></span>
              <span class="via__var-thumbs">
                <span v-for="id in v.ids.slice(0, 6)" :key="id" class="via__thumb via__thumb--sm"><GalleryThumb :src="urlOf(id)" /></span>
                <span v-if="!v.ids.length" class="via__status is-warning"><v-icon icon="mdi-image-off-outline" aria-hidden="true" />Görsel yok</span>
              </span>
            </li>
          </ul>
        </li>
      </ul>
      <p v-if="!rows.length" class="via__none">Görseli eksik varyant kalmadı.</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EkAlert, EkButton, EkEmptyState } from '@entegrasyonik/ui/components'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { useGallerySrc } from './gallerySrc'
import { useChoicesStore } from '@/stores/choicesStore'
import GalleryThumb from './GalleryThumb.vue'
import ImagePicker from './ImagePicker.vue'
import {
  applyGroupImages, buildOptionGroups, groupImageState, preferredGroup, unassignedVariants, variantImageIds, variantKey,
  variantLabel, type GalleryImage, type VariantLike,
} from './galleryModel'

const props = defineProps<{ variants: VariantLike[]; images: GalleryImage[] }>()
const srcOf = useGallerySrc()
const emit = defineEmits<{ announce: [msg: string] }>()

const choicesStore = useChoicesStore()
const { showToast } = useToast()
const choiceTitle = (id: string) => choicesStore.getChoiceTitle(id as any) as string | undefined
const valueTitle = (id: string) => choicesStore.getDirectChoiceValueTitle(id) as string | undefined

const groups = computed(() => buildOptionGroups(props.variants, choiceTitle, valueTitle))
const groupId = ref<string | undefined>(undefined)
watch(groups, (gs) => {
  if (!gs.some((g) => g.choiceId === groupId.value)) groupId.value = preferredGroup(gs)?.choiceId
}, { immediate: true })
const activeGroup = computed(() => groups.value.find((g) => g.choiceId === groupId.value))

const missing = computed(() => unassignedVariants(props.variants, props.images))
const missingText = computed(() => {
  const names = missing.value.slice(0, 3).map((v) => variantLabel(v, valueTitle)).join(', ')
  return `${names}${missing.value.length > 3 ? ` ve ${missing.value.length - 3} varyant daha` : ''}. Seçenek satırından görsel seçerek aynı renkteki tüm bedenlere tek seferde atayın.`
})
const onlyMissing = ref(false)

const urlOf = (id: string) => srcOf(props.images.find((x) => x._id === id))

const rows = computed(() => {
  const g = activeGroup.value
  if (!g) return []
  return g.values
    .map((val) => {
      const vs = props.variants.filter((v, i) => val.variantKeys.includes(variantKey(v, i)))
      const state = groupImageState(vs, props.images)
      const perVariant = vs.map((v) => ({
        key: variantKey(v, props.variants.indexOf(v)),
        label: variantLabel(v, valueTitle),
        code: v.stockcode ? String(v.stockcode) : '',
        ids: variantImageIds(v, props.images),
        ref: v,
      }))
      return {
        valueId: val.valueId,
        title: val.title,
        variants: perVariant,
        common: state.common,
        partial: state.partial,
        missing: perVariant.filter((x) => !x.ids.length).length,
        partialVariants: perVariant.filter((x) => x.ids.length !== state.common.length).length,
      }
    })
    .filter((r) => !onlyMissing.value || r.missing > 0)
})

// ---- grup seçici (radyo grubu, ←/→)
function setGroup(id: string) {
  groupId.value = id
  editing.value = null
}
function onSegKey(e: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return
  e.preventDefault()
  const i = groups.value.findIndex((g) => g.choiceId === groupId.value)
  const n = groups.value.length
  const next = groups.value[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n]
  setGroup(next.choiceId)
  requestAnimationFrame(() => (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
}

// ---- genişletme / editör
const expanded = ref(new Set<string>())
function toggleExpand(id: string) {
  const s = new Set(expanded.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expanded.value = s
}

const editing = ref<string | null>(null)
const draft = ref<string[]>([])
const draftBase = ref<string[]>([])
const draftChanged = computed(() => draft.value.length !== draftBase.value.length || draft.value.some((x, i) => x !== draftBase.value[i]))

function openEditor(row: (typeof rows.value)[number]) {
  if (editing.value === row.valueId) { editing.value = null; return }
  editing.value = row.valueId
  draft.value = row.common.slice()
  draftBase.value = row.common.slice()
}

function apply(row: (typeof rows.value)[number]) {
  const targets = row.variants.map((x) => x.ref)
  const snapshot = targets.map((v) => (v.images ?? []).slice())
  const changed = applyGroupImages(targets, draft.value, row.common, props.images)
  editing.value = null
  const msg = `${activeGroup.value?.title ?? ''}: ${row.title} — ${changed} varyantın görselleri güncellendi`
  emit('announce', msg)
  if (!changed) return
  showToast({
    tone: 'success',
    message: msg,
    actionLabel: 'Geri al',
    onAction: () => {
      targets.forEach((v, i) => { v.images = snapshot[i] })
      emit('announce', `${row.title} ataması geri alındı`)
    },
  })
}

defineExpose({ missingCount: computed(() => missing.value.length) })
</script>

<style scoped>
.via {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.via__micro {
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.via__groupby {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}

.via__seg {
  display: inline-flex;
  padding: 2px;
  gap: 2px;
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-sunken);
  border: 1px solid var(--ek-color-border-default);
}

.via__seg-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 30px;
  padding: 0 var(--ek-space-3);
  border: 0;
  border-radius: calc(var(--ek-radius-control) - 2px);
  background: transparent;
  color: var(--ek-color-content-muted);
  font: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.via__seg-btn.is-on {
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  box-shadow: var(--ek-shadow-card);
}

.via__seg-btn:focus-visible,
.via__expand:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.via__seg-n {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.via__rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  overflow: hidden;
}

.via__row + .via__row {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.via__row.is-open {
  background: var(--ek-color-surface-muted);
}

.via__row-main {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 80px;
  padding: var(--ek-space-2) var(--ek-space-4) var(--ek-space-2) var(--ek-space-2);
}

.via__expand {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-content-muted);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.via__expand:hover {
  background: var(--ek-color-surface-sunken);
}

.via__expand :deep(.v-icon) {
  transition: transform var(--ek-motion-reveal);
}

.via__expand[aria-expanded='true'] :deep(.v-icon) {
  transform: rotate(90deg);
}

.via__row-title {
  display: flex;
  flex-direction: column;
  min-width: 120px;
}

.via__name {
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
  color: var(--ek-color-content-strong);
}

.via__meta {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.via__thumbs {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  flex: 1 1 auto;
  min-width: 0;
}

/* FR2-PFORM 29: varyant görselleri okunur boyutta (44 → 60px; alt satırlar 32 → 44px). */
.via__thumb {
  flex: 0 0 auto;
  width: 60px;
  height: 60px;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
  overflow: hidden;
}

.via__thumb--sm {
  width: 44px;
  height: 44px;
  border-radius: var(--ek-radius-sm);
}

.via__more {
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
  padding: 0 var(--ek-space-1);
}

.via__status {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  padding: 2px var(--ek-space-2);
  border-radius: var(--ek-radius-chip);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  white-space: nowrap;
}

.via__status :deep(.v-icon) {
  font-size: 14px;
}

.via__status.is-warning {
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.via__status.is-info {
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
}

.via__editor {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: 0 var(--ek-space-4) var(--ek-space-4) calc(var(--ek-space-2) + 32px + var(--ek-space-3));
}

.via__editor-hint {
  margin: 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.via__editor-hint strong {
  color: var(--ek-color-content-default);
  font-weight: 600;
}

.via__editor-bar {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.via__editor-count {
  margin-right: auto;
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}

.via__vars {
  margin: 0;
  padding: 0 var(--ek-space-4) var(--ek-space-3) calc(var(--ek-space-2) + 32px + var(--ek-space-3));
  list-style: none;
}

.via__var {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 44px;
  border-top: 1px dashed var(--ek-color-border-subtle);
}

.via__var-name {
  display: flex;
  flex-direction: column;
  min-width: 160px;
  font-size: var(--ek-type-body-size);
  color: var(--ek-color-content-default);
}

.via__var-code {
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
  font-variant-numeric: tabular-nums;
}

.via__var-thumbs {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  flex-wrap: wrap;
}

.via__none,
.via__empty {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
}

@media (max-width: 640px) {
  .via__row-main {
    flex-wrap: wrap;
    padding-right: var(--ek-space-3);
  }

  .via__thumbs {
    order: 5;
    flex-basis: 100%;
    padding-left: calc(32px + var(--ek-space-3));
  }

  .via__row-main > :deep(.ek-btn),
  .via__row-main > .ek-btn {
    margin-left: auto;
  }

  .via__editor,
  .via__vars {
    padding-left: var(--ek-space-3);
    padding-right: var(--ek-space-3);
  }

  .via__var {
    flex-wrap: wrap;
    padding: var(--ek-space-2) 0;
  }
}
</style>
