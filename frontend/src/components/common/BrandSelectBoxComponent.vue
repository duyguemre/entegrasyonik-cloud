<template>
  <div class="brand-select-wrapper">
    <LoadingComponent v-if="loading" ref="loadingComponentRef" attach=".brand-select-wrapper"></LoadingComponent>

    <v-autocomplete v-model="brandId" v-model:search="brandSearchText" :items="computedBrands" item-value="_id"
      item-title="title"
      :rules="mandatory ? formRules.mandatoryRule : []" :placeholder="$t('productDefinitions.brand.search')"
      :no-data-text="$t('productDefinitions.brand.nodata')" auto-select-first clearable persistent-hint :menu-props="{
        contentClass: 'brand-autocomplete-menu',
        maxHeight: '400',
        transition: false
      }">

      <template #label>
        {{ $t('productDefinitions.brand.name') }}{{ mandatory ? ' *' : '' }}
      </template>

      <template v-slot:selection="{ item }: any">
        <div class="d-flex align-center overflow-hidden">
          <span class="text-truncate">
            {{ item.title }}
          </span>
        </div>
      </template>

      <template v-slot:item="{ item, props: itemProps }: any">
        <v-list-item v-bind="itemProps" class="custom-brand-item" title="">
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
        <v-divider></v-divider>
        <div class="pa-4 bg-surface-muted">
          <v-form v-model="isNewBrandValid" @submit.prevent="addNewBrand">
            <v-text-field v-model="newBrandName" variant="outlined" density="compact" hide-details="auto"
              :placeholder="$t('productDefinitions.brand.title')" :rules="titleRules">
              <template v-slot:append-inner>
                <v-btn color="primary" variant="flat" size="small" :disabled="!isNewBrandValid || !newBrandName"
                  @click="addNewBrand">
                  <v-icon>mdi-plus</v-icon>
                </v-btn>
              </template>
            </v-text-field>
          </v-form>
        </div>
      </template>
    </v-autocomplete>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import { useBrandsStore } from '@/stores/brandsStore'
import { useI18n } from 'vue-i18n'
import useFormRules from '@/composables/formrules'
import { useSnackbarStore } from '@/stores/snackbarStore'
import LoadingComponent from '@/components/LoadingComponent.vue'

const props = defineProps<{
  noInit?: boolean
  mandatory?: boolean
  withAll?: boolean
}>()

const emits = defineEmits(['change'])

const brandsStore = useBrandsStore()
const { t } = useI18n()
const formRules: any = useFormRules()
const snackbarStore = useSnackbarStore()

const brandId = defineModel({ default: undefined })
const brandSearchText = ref("")
const newBrandName = ref("")
const isNewBrandValid = ref(false)
const loading = ref(false)

const titleRules = [
  (v: any) => !!v || t("rules.mandatory"),
  (v: string) => (v && v.length >= 2 && v.length <= 160) || t("rules.2_160characters"),
]

const computedBrands = computed(() => {
  const storeBrands = brandsStore.getBrands()?.value || []
  let processedList = [...storeBrands]

  // 1. ARAMA FİLTRESİ
  if (brandSearchText.value && brandSearchText.value.length >= 2) {
    processedList = processedList.filter((b: any) =>
      b.title.toLocaleUpperCase('tr-TR').includes(brandSearchText.value.toLocaleUpperCase('tr-TR'))
    )
  }

  // 2. HEPSİ SEÇENEĞİ
  if (props.withAll) {
    processedList = [{ _id: -1, title: t('common.all') || 'Hepsi' }, ...processedList]
  }

  // 3. MAIN/SİSTEM BRAND'LERİ FİLTRELE (withAll modu değilse ve isMain ise gizle)
  // Mevcut BrandSelectBoxComponent.vue mantığını koruyoruz
  return processedList.filter((item: any) => {
    if (props.withAll && item.isMain) return false
    return true
  })
})

const addNewBrand = async () => {
  if (!newBrandName.value || !isNewBrandValid.value) return
  loading.value = true
  try {
    await brandsStore.addBrand({ title: newBrandName.value })
    newBrandName.value = ""
    snackbarStore.addSnackbar({ text: t('common.success'), color: 'success' })
  } finally {
    loading.value = false
  }
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
