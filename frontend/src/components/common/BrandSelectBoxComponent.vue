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


      <template v-slot:item="{ item, props: itemProps }: any">
        <v-list-item v-bind="itemProps" role="option" class="custom-brand-item" title="">
          <div class="d-flex align-center w-100 position-relative">
            <div class="leaf-indicator"></div>
            <v-icon size="16" class="mr-2" color="content-muted">
              mdi-tag-outline
            </v-icon>
            <div class="brand-title-wrapper d-flex align-center flex-grow-1 overflow-hidden">
              <span class="brand-text text-truncate">{{ item.title }}</span>
            </div>
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

// ---- yeni marka (QuickCreateDialog) ----
const selectedTitle = computed(() => computedBrands.value.find((b: any) => b._id === brandId.value)?.title)
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

.custom-brand-item {
  min-height: var(--ek-control-h-lg) !important;
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.leaf-indicator {
  position: absolute;
  left: calc(var(--ek-space-4) * -1);
  width: 3px;
  height: 60%;
  border-radius: 0 var(--ek-radius-sm) var(--ek-radius-sm) 0;
  background-color: var(--ek-color-action);
}

.brand-text {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-type-label-weight);
}
</style>
