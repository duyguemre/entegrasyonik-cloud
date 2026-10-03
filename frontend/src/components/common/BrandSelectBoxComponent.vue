<template>
  <div class="brand-select-wrapper">
    <LoadingComponent v-if="loading" ref="loadingComponentRef" attach=".brand-select-wrapper"></LoadingComponent>

    <v-autocomplete v-model="brandId" v-model:search="brandSearchText" v-model:menu="menuOpen" :items="computedBrands" item-value="_id"
      item-title="title" :custom-filter="brandFilter" @keydown.enter="onEnter"
      :rules="mandatory ? formRules.mandatoryRule : []" :placeholder="$t('productDefinitions.brand.search')"
      :no-data-text="createQuery ? `“${createQuery}” ile eşleşen marka yok` : $t('productDefinitions.brand.nodata')" auto-select-first @update:focused="selectOnFocus" clearable persistent-hint :menu-props="{
        contentClass: 'brand-autocomplete-menu',
        maxHeight: '400',
        transition: false
      }">

      <template #label>
        {{ $t('productDefinitions.brand.name') }}{{ mandatory ? ' *' : '' }}
      </template>


      <template #prepend-inner>
        <span v-if="selectedBrand && selectedBrand._id !== -1" class="bsb-mono bsb-mono--sm" :class="`bsb-mono--${tone(selectedBrand.title)}`" aria-hidden="true">{{ initials(selectedBrand.title) }}</span>
      </template>

      <template v-slot:item="{ item, props: itemProps }: any">
        <v-list-item v-bind="itemProps" role="option" class="bsb-item" :class="{ 'is-selected': item.raw._id === brandId }" title="">
          <div class="bsb-row">
            <span v-if="item.raw._id === -1" class="bsb-mono bsb-mono--all" aria-hidden="true"><v-icon icon="mdi-format-list-bulleted" size="16" /></span>
            <span v-else class="bsb-mono" :class="`bsb-mono--${tone(item.title)}`" aria-hidden="true">{{ initials(item.title) }}</span>
            <span class="bsb-text">
              <span class="bsb-title">
                <template v-for="(part, pi) in highlight(item.title)" :key="pi"><mark v-if="part.hit" class="bsb-hit">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template>
              </span>
              <span v-if="item.raw._id !== -1" class="bsb-meta">
                <span v-if="item.raw.isMain" class="bsb-tag">Ana marka</span>
                <span v-if="channelInfo(item.raw)" class="bsb-channels" :class="`is-${channelInfo(item.raw)!.tone}`">
                  <v-icon :icon="channelInfo(item.raw)!.icon" size="14" aria-hidden="true" />{{ channelInfo(item.raw)!.text }}
                </span>
              </span>
            </span>
            <v-icon v-if="item.raw._id === brandId" class="bsb-check" icon="mdi-check" size="18" aria-hidden="true" />
          </div>
        </v-list-item>
      </template>

      <template v-slot:append-item>
        <QuickCreateRow noun="marka" :query="createQuery" :has-results="hasResults" @create="openCreate" />
      </template>
    </v-autocomplete>

    <QuickCreateDialog v-model="createOpen" noun="marka" icon="mdi-tag-plus-outline" :initial-name="createQuery"
      :existing="brandsStore.getBrands()?.value || []" :create="createBrand"
      description="Marka listenize eklenir ve bu ürün için seçilir. Pazaryeri marka eşleşmesini Tanımlar › Markalar'dan yapabilirsiniz."
      @created="onCreated" @picked="onPicked" />
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, getCurrentInstance, nextTick } from 'vue'
import { useBrandsStore } from '@/stores/brandsStore'
import { useI18n } from 'vue-i18n'
import useFormRules from '@/composables/formrules'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import LoadingComponent from '@/components/LoadingComponent.vue'
import QuickCreateRow from './QuickCreateRow.vue'
import QuickCreateDialog from './QuickCreateDialog.vue'
import { findDuplicate, normalizeTitle, trIncludes } from './quickCreate'
import { useBrandChannels } from '@/composables/brandChannels'

const props = defineProps<{
  noInit?: boolean
  mandatory?: boolean
  withAll?: boolean
}>()

const emits = defineEmits(['change'])

const brandsStore = useBrandsStore()
const { t } = useI18n()
const formRules: any = useFormRules()
const { showToast } = useToast()

const brandId = defineModel({ default: undefined })
const brandSearchText = ref("")
const menuOpen = ref(false)
const loading = ref(false)

// FR2-PFORM 23: filtre Vuetify'a bırakılır (Türkçe harf duyarsız). Eskiden liste arama metniyle ÖNCEDEN
// süzülüyordu; seçili marka süzülen listeden düşünce kutu ham kimliği ("brand-…") gösteriyordu.
const brandFilter = (_value: string, query: string, item?: any) => item?.raw?._id === -1 || trIncludes(item?.raw?.title, query)

const computedBrands = computed(() => {
  const storeBrands = brandsStore.getBrands()?.value || []
  let processedList = [...storeBrands]

  // HEPSİ SEÇENEĞİ
  if (props.withAll) {
    processedList = [{ _id: -1, title: t('common.all') || 'Hepsi' }, ...processedList]
  }

  // MAIN/SİSTEM BRAND'LERİ FİLTRELE (withAll modu değilse ve isMain ise gizle)
  return processedList.filter((item: any) => {
    if (props.withAll && item.isMain) return false
    return true
  })
})

// ---- liste satırı: monogram, eşleşme vurgusu, kanal eşleme özeti ----
const { summarize } = useBrandChannels()

/** Baş harfler: iki kelimeyse ilk harfleri, tek kelimeyse ilk iki harf (Türkçe büyük harf). */
function initials(title: string = '') {
  const words = String(title).trim().split(/\s+/).filter(Boolean)
  const raw = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)
  return raw.toLocaleUpperCase('tr')
}

const TONES = ['action', 'info', 'success', 'warning'] as const
/** Ada göre sabit ton (aynı marka her yerde aynı renkte). */
function tone(title: string = '') {
  let h = 0
  for (const ch of String(title)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TONES[h % TONES.length]
}

/** Arama metniyle eşleşen kısmı işaretler (Türkçe harf duyarsız). */
function highlight(title: string = '') {
  const q = brandSearchText.value?.trim()
  if (!q || q === selectedTitle.value) return [{ text: title, hit: false }]
  const i = title.toLocaleLowerCase('tr').indexOf(q.toLocaleLowerCase('tr'))
  if (i < 0) return [{ text: title, hit: false }]
  return [
    { text: title.slice(0, i), hit: false },
    { text: title.slice(i, i + q.length), hit: true },
    { text: title.slice(i + q.length), hit: false },
  ].filter((p) => p.text)
}

/** Kanal eşleme durumu: kaç bağlı kanalda pazaryeri markasıyla eşli. Kanal yoksa gösterilmez. */
function channelInfo(brand: any) {
  const s = summarize(brand)
  if (!s.total) return undefined
  if (s.mapped.length === s.total) return { tone: 'ok', icon: 'mdi-check-circle-outline', text: s.total === 1 ? `${s.mapped[0].title} ile eşli` : 'Tüm kanallarda eşli' }
  if (!s.mapped.length) return { tone: 'none', icon: 'mdi-link-variant-off', text: 'Kanal eşlemesi yok' }
  return { tone: 'part', icon: 'mdi-link-variant', text: `${s.mapped.length}/${s.total} kanalda eşli` }
}

// ---- yeni marka (QuickCreateDialog) ----
const selectedBrand = computed<any>(() => computedBrands.value.find((b: any) => b._id === brandId.value))
const selectedTitle = computed(() => selectedBrand.value?.title)
/** Arama kutusunda seçili markanın adı duruyorsa öneri yapılmaz; yalnız kullanıcının yazdığı metin önerilir. */
const createQuery = computed(() => {
  const q = normalizeTitle(brandSearchText.value)
  return q && q !== selectedTitle.value ? q : ''
})
const hasResults = computed(() => !createQuery.value || computedBrands.value.some((b: any) => trIncludes(b.title, createQuery.value)))
const createOpen = ref(false)

function openCreate() {
  menuOpen.value = false
  createOpen.value = true
}

/** Enter: eşleşme yoksa (ve yazılan ad listede değilse) yeni marka diyaloğu açılır. */
function onEnter() {
  if (createQuery.value && !hasResults.value && !findDuplicate(computedBrands.value, createQuery.value)) openCreate()
}

const createBrand = (title: string) => brandsStore.addBrand({ title })

function onCreated(id: string, title: string) {
  brandId.value = id as any
  brandSearchText.value = ''
  showToast({ tone: 'success', message: `“${title}” markası eklendi ve seçildi.` })
}

/** Odakta mevcut ad seçili gelir: yazmaya başlayınca ad DEĞİŞİR (seçili adın sonuna eklenmez). */
const instance = getCurrentInstance()
function selectOnFocus(focused: boolean) {
  if (!focused) return
  const input = (instance?.proxy?.$el as HTMLElement | undefined)?.querySelector?.('input')
  if (!input) return
  // Fare tıklamasında imleci yerleştiren mouseup seçimi bozmasın (tek seferlik).
  input.addEventListener('mouseup', (e) => e.preventDefault(), { once: true })
  nextTick(() => setTimeout(() => input.select(), 0))
}

function onPicked(id: string) {
  brandId.value = id as any
}

onMounted(() => {
  if (!props.noInit && (brandId.value === undefined || brandId.value === null || brandId.value === -1)) {
    if (props.withAll) {
      /*       brandId.value = -1 */
    } else {
      // isMain olanı bulup seçelim (eski mantık)
      const mainBrand = computedBrands.value.find((b: any) => b.isMain)
      if (mainBrand) {
        brandId.value = mainBrand._id
      } else if (computedBrands.value.length > 0) {
        // Main yoksa ilkini seç
        const first = computedBrands.value.find((b: any) => b._id !== -1)
        if (first) brandId.value = first._id
      }
    }
  }
})
</script>

<style scoped>
.brand-select-wrapper {
  position: relative;
}

/* Marka satırı: monogram · ad (+ eşleşme vurgusu) · ana marka / kanal eşleme özeti · seçili onayı. */
.bsb-item {
  min-height: 52px !important;
  margin: 2px var(--ek-space-2);
  border-radius: var(--ek-radius-control);
}

.bsb-item.is-selected {
  background: var(--ek-color-action-subtle);
}

.bsb-row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-width: 0;
}

.bsb-mono {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ek-radius-tile);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.02em;
}

.bsb-mono--sm {
  width: 24px;
  height: 24px;
  margin-right: var(--ek-space-1);
  font-size: var(--ek-type-micro-size);
}

.bsb-mono--action { background: var(--ek-color-action-subtle); color: var(--ek-color-action-emphasis); }
.bsb-mono--info { background: var(--ek-color-info-subtle); color: var(--ek-color-info-emphasis); }
.bsb-mono--success { background: var(--ek-color-success-subtle); color: var(--ek-color-success-emphasis); }
.bsb-mono--warning { background: var(--ek-color-warning-subtle); color: var(--ek-color-warning-emphasis); }
.bsb-mono--all { background: var(--ek-color-surface-muted); color: var(--ek-color-content-muted); }

.bsb-text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.bsb-title {
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bsb-hit {
  padding: 0 1px;
  border-radius: 2px;
  background: var(--ek-color-warning-subtle);
  color: inherit;
  font-weight: var(--ek-font-weight-semibold);
}

.bsb-meta {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bsb-meta:empty {
  display: none;
}

.bsb-tag {
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-medium);
}

.bsb-channels {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.bsb-channels.is-ok { color: var(--ek-color-success-emphasis); }
.bsb-channels.is-part { color: var(--ek-color-warning-emphasis); }

.bsb-check {
  flex: none;
  color: var(--ek-color-action);
}
</style>
