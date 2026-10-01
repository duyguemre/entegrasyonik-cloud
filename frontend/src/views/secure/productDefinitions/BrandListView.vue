<template>
  <div class="brandDefinition">
    <!-- Marka listesi (EkListScreen) + sağdan açılan detay paneli (ad düzenleme, kanal eşlemeleri). Silme onayı burada. -->
    <ConfirmationDialogComponent v-model="confirmDelete.open" :title="`'${confirmDelete.brand?.title ?? ''}' markası silinsin mi?`"
      :subtitle="$t('productDefinitions.brand.deleteConfirmation')" color="error" icon="mdi-trash-can-outline"
      confirm-icon="mdi-trash-can-outline" attach=".brandDefinition" confirm-text="Sil" @confirm="deleteBrand()" />

    <BrandListComponent v-model="isBrandsListed" :selected-id="selectedBrandId" @select="openBrand($event)"
      @delete="askDelete($event)" />

    <EkDialogHost :model-value="!!selectedBrandId" attach=".brandDefinition" placement="end" width="md"
      @update:model-value="(v) => { if (!v) closeBrand() }">
      <BrandSyncComponent v-if="selectedBrandId" :brand-id="selectedBrandId" @close="closeBrand()"
        @delete="askDelete($event)" />
    </EkDialogHost>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { EkDialogHost } from '@entegrasyonik/ui/components'
import BrandListComponent from '@/components/BrandListComponent.vue'
import BrandSyncComponent from '@/components/BrandSyncComponent.vue'
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue'
import useRestApi from '@/composables/restapi'
import { useBrandsStore } from '@/stores/brandsStore'
import { useSnackbarStore } from '@/stores/snackbarStore'

const restApi = useRestApi()
const brandsStore = useBrandsStore()
const snackbarStore = useSnackbarStore()

const selectedBrandId = ref<string | undefined>()
const isBrandsListed = ref(true)
const confirmDelete = reactive<{ open: boolean; brand: any }>({ open: false, brand: null })

const destroyComponent = () => {
  isBrandsListed.value = false
  selectedBrandId.value = undefined
}
defineExpose({ destroyComponent })

const openBrand = (brand: any) => { selectedBrandId.value = brand?._id }
const closeBrand = () => { selectedBrandId.value = undefined }

const askDelete = (brand: any) => {
  if (!brand) return
  confirmDelete.brand = brand
  confirmDelete.open = true
}

// BrandService/deleteBrand gövdesi DEĞİŞMEDİ: { _id }.
const deleteBrand = async () => {
  const brand = confirmDelete.brand
  if (!brand) return
  const response = await restApi.post('BrandService/deleteBrand', { _id: brand._id })
  if (response && response.acknowledged == true) {
    if (selectedBrandId.value === brand._id) closeBrand()
    confirmDelete.open = false
    await brandsStore.retrieve()
    snackbarStore.addSnackbar({ show: true, text: 'Marka silindi', timeout: 2000, color: 'success' })
  } else {
    snackbarStore.addSnackbar({ show: true, text: 'Marka silinemedi — bağlantınızı kontrol edip tekrar deneyin.', timeout: 4000, color: 'error' })
  }
}
</script>

<style scoped>
/* Çalışma alanı sekmesini doldurur; liste kendi içinde kayar (Varyant grupları/Etiketler ile aynı iskelet). */
.brandDefinition {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

@media (max-width: 767px) {
  .brandDefinition {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}
</style>
