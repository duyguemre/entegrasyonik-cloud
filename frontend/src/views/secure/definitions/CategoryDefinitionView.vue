<template>
  <div class="categoryDefinition">
    <CategoryManager v-if="isActive" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import CategoryManager from '@/components/categories/CategoryManager.vue'

// `productDefinitions/CategoryListView.vue` ile AYNI ekran (yinelenen giriş): içerik ortak `CategoryManager`'dadır.
const isActive = ref(true)
const destroyComponent = () => {
  isActive.value = false
}

defineExpose({
  destroyComponent
})
</script>

<style scoped>
.categoryDefinition {
  position: absolute;
  inset: 0;
}
</style>
