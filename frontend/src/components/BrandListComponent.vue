<!--
  Marka tanımları sol paneli: arama + yeni marka ekleme + marka listesi.
  DS-v2 Aşama 2: kart (CardComponent/EkCard dili), alanlar EkFormGrid, satırlar token
  yüzeyli liste (eski gri kutular/sıra kutusu/literal renkler kaldırıldı); ⚙ düğmesi
  gerçek düğme + erişilebilir ad. Ekleme/arama/seçim davranışı DEĞİŞMEDİ.
-->
<template>
  <div class="brandListComponentView">
    <LoadingComponent attach=".brandDefinition" ref="loadingComponentRef"></LoadingComponent>

    <div class="workarea-scroll ek-brand-list">
      <CardComponent icon="mdi-tag-multiple-outline" title="Marka Listesi" :isHovered="false">
        <EkFormGrid :columns="1">
          <v-text-field append-inner-icon="mdi-magnify" @click.stop type="tel" maxlength="160" clearable counter
            :rules="formRules.searchRules" v-model="brandSearchText" :label="$t('productDefinitions.brand.search')"
            :hint="$t('productDefinitions.brand.brandSearchDesc')" />

          <v-form v-model="brandForm" @keydown.enter.prevent @submit.prevent>
            <v-text-field type="tel" maxlength="160" counter clearable :hint="$t('productDefinitions.brand.brandNameDesc')"
              v-model="brandName" :rules="titleRules" :label="$t('productDefinitions.brand.title')"
              @keyup.enter="addBrand({ title: brandName }); brandName = undefined">
              <template v-slot:append-inner>
                <EkButton tone="primary" size="sm" icon="mdi-plus" icon-only aria-label="Marka ekle"
                  :disabled="!brandForm || brandName == undefined"
                  @click="addBrand({ title: brandName }); brandName = undefined" />
              </template>
            </v-text-field>
          </v-form>
        </EkFormGrid>

        <ul class="ek-brand-list__items" aria-label="Markalar">
          <template v-for="(brand, index) of computedBrands" :key="brand._id">
            <li v-if="!brand.isMain" class="ek-brand-list__item">
              <span class="ek-brand-list__index ek-num" aria-hidden="true">{{ index }}</span>
              <v-icon icon="mdi-folder-outline" size="18" class="ek-brand-list__icon" aria-hidden="true" />
              <span class="ek-brand-list__title">{{ brand.title }}</span>
              <EkButton tone="ghost" size="sm" icon="mdi-cog-outline" icon-only :aria-label="`${brand.title} ayarları`"
                @click.stop="openBrandSync(brand)" />
            </li>
          </template>
        </ul>
      </CardComponent>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, inject, ref, onBeforeMount, onBeforeUnmount } from 'vue'
import { EkButton, EkFormGrid } from '@entegrasyonik/ui/components'
import useRestApi from '@/composables/restapi'
import useFormRules from '@/composables/formrules';
import { useI18n } from 'vue-i18n';
import { useBrandsStore } from '@/stores/brandsStore';
import LoadingComponent from '@/components/LoadingComponent.vue'
import CardComponent from './CardComponent.vue';

const brandsStore = useBrandsStore()
const formRules = useFormRules()
const restApi = useRestApi()
const eventBus: any = inject('eventBus')
var showBrands = defineModel({ default: false })

const emits = defineEmits(['openBrandSync'])
const open: any = ref(['0'])
const isEditDialogOpen = ref(false)
const isConfirmationDialogOpen = ref(false)
const editingBrand: any = ref()
const brandSearchText: any = ref()
const brandForm: any = ref()
const brandName: any = ref()
var brandsStoreBrands: any = undefined
const loadingComponentRef: any = ref(null)

const { t } = useI18n()
const titleRules = [
  (v: any) => !!v || (!v && v === 0) || t("rules.mandatory"),
  (v: string) => !((v != null && v.length > 0) && (v != null && (v.length < 2 || v.length > 160))) || t("rules.2_160characters"),
]

onBeforeMount(() => {
  fetchBrands()
})

onBeforeUnmount(async () => {
  open.value = undefined
})

const computedBrands = computed(() => {
  if (!brandsStoreBrands.value || !brandSearchText.value || brandSearchText.value.length < 2) return brandsStoreBrands.value
  return brandsStoreBrands.value.filter((item: any) => item.title.toLowerCase().includes(brandSearchText.value.toLowerCase()))
})


const fetchBrands = () => {
  brandsStoreBrands = brandsStore.getBrands(true)
  eventBus.emit('pageResize', "");
  openBrandSync(undefined)
}


const startEdit = (ec: any) => {
  editingBrand.value = ec
  editingBrand.value.updateTitle = ec.title
  isEditDialogOpen.value = true
}

const endEdit = () => {
  isEditDialogOpen.value = false
  isConfirmationDialogOpen.value = false
  editingBrand.value = undefined
}

const openBrandSync = (brand: any) => {
  emits("openBrandSync", brand)
}

const addBrand = async (newBrand: any) => {
  let guid = loadingComponentRef.value.info("")
  const response = await restApi.post("BrandService/addBrand", { title: newBrand.title })
  loadingComponentRef.value.remove(guid)
  if (response && response._id) {
    update()
  }

}

const updateBrand = async () => {
  let guid = loadingComponentRef.value.info("")
  const response = await restApi.post("BrandService/updateBrand", { _id: editingBrand.value._id, title: editingBrand.value.updateTitle })
  loadingComponentRef.value.remove(guid)
  if (response && response.result == true) {
    update()
    endEdit()
  }
}

const deleteBrand = async () => {
  if (!editingBrand.value)
    endEdit()
  let guid = loadingComponentRef.value.info("")
  const response = await restApi.post("BrandService/deleteBrand", { _id: editingBrand.value._id, parentId: editingBrand.value.parentId })
  loadingComponentRef.value.remove(guid)
  if (response && response.result && response.result.acknowledged == true) {
    endEdit()
    update()
  }
}

const update = () => {
  fetchBrands()
}

</script>

<style scoped>
.ek-brand-list {
  padding: var(--ek-space-4) var(--ek-space-2) 0 var(--ek-space-6);
}

.ek-brand-list__items {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  margin: var(--ek-space-4) 0 0;
  padding: var(--ek-space-1);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-sunken);
  list-style: none;
}

.ek-brand-list__items:empty {
  display: none;
}

.ek-brand-list__item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: var(--ek-control-h-lg);
  padding: var(--ek-space-1) var(--ek-space-1) var(--ek-space-1) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
  transition: var(--ek-transition-colors);
}

.ek-brand-list__item:hover {
  border-color: var(--ek-color-border-default);
}

.ek-brand-list__index {
  min-width: var(--ek-space-6);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-brand-list__icon {
  color: var(--ek-color-content-muted);
}

.ek-brand-list__title {
  flex: 1;
  min-width: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>