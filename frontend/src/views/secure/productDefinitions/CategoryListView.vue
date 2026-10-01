<template>
  <div class="categoryListView">
    <CategoryManager v-if="isActive" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import CategoryManager from '@/components/categories/CategoryManager.vue'

// Sekme kapanırken kabuk `destroyComponent`'i çağırır: ağaç/detay (ve açık diyaloglar) bırakılır.
const isActive = ref(true)
const destroyComponent = () => {
  isActive.value = false
}

defineExpose({
  destroyComponent
})
</script>

<style scoped>
/* Ekran içeriği `CategoryManager`'da (EkPageBar + araç şeridi + ağaç | detay); bu kök yalnız sekme alanını doldurur
   (Seçenek/Etiket listeleriyle aynı mutlak yerleşim — `.cat-manager` kendi dolgusunu taşır). */
.categoryListView {
  position: absolute;
  inset: 0;
}
</style>
