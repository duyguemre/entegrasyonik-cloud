<template>
  <!-- FR2-PFORM 25: ekranın amacı başlıkta; kapanışta değişiklik formda kalır (ürün kaydıyla gider). -->
  <EkDialogCard title="Kanal bazında fiyatlar" icon="mdi-storefront-outline"
    :description="description" width="custom" confirm-label="Tamam" confirm-icon="mdi-check" hide-cancel
    class="pvpp-card" @close="editingVariantMenu = false" @confirm="editingVariantMenu = false">
    <template #actions-start>
      <span class="pvpp-note"><v-icon icon="mdi-content-save-outline" aria-hidden="true" />Değişiklikler ürünü kaydedince kanallara gider</span>
    </template>
    <LoadingComponent attach=".productDefinitionView" ref="loadingComponentRef"></LoadingComponent>
    <PlatformPriceComponent :platformPriceForm="editingVariant" :categoryId="productInfoForm.category" />
  </EkDialogCard>
</template>

<script setup lang="ts">

import { computed, onMounted } from 'vue'
import PlatformPriceComponent from '../crud/PlatformPriceComponent.vue';
import { EkDialogCard } from '@entegrasyonik/ui/components'

const editingVariantMenu = defineModel({ default: false })
const emits = defineEmits(['refreshImages', 'close'])
const props = defineProps<{
  productInfoForm: any,
  editingVariant: any
}>()

const description = computed(() => {
  const code = props.editingVariant?.stockcode
  return `${code ? `${code} · ` : ''}Her kanal kendi fiyatıyla ya da ana fiyatla satılır`
})

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

<style scoped>
.pvpp-note {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.pvpp-note :deep(.v-icon) {
  font-size: 16px;
}
</style>
