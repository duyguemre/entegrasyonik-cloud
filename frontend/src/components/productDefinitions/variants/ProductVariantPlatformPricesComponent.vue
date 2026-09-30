<template>
  <EkDialogCard title="Platform Bazında Varyant Fiyatları" icon="mdi-currency-try"
    :description="editingVariant?.stockcode ? `Varyant: ${editingVariant.stockcode}` : undefined" width="custom"
    hide-actions class="pvpp-card" @close="editingVariantMenu = false">
    <LoadingComponent attach=".productDefinitionView" ref="loadingComponentRef"></LoadingComponent>
    <PlatformPriceComponent :platformPriceForm="editingVariant" :categoryId="productInfoForm.category" />
  </EkDialogCard>
</template>

<script setup lang="ts">

import { onMounted } from 'vue'
import PlatformPriceComponent from '../crud/PlatformPriceComponent.vue';
import { EkDialogCard } from '@entegrasyonik/ui/components'

const editingVariantMenu = defineModel({ default: false })
const emits = defineEmits(['refreshImages', 'close'])
const props = defineProps<{
  productInfoForm: any,
  editingVariant: any
}>()

const init = async () => {
}

onMounted(() => {
  init()
})

onMounted(() => {
})

defineExpose({
});
</script>
