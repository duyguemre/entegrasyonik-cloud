<template>
  <div class="ma-12 align-center justify-center d-flex no-auth">
    <CardComponent class="pa-6">
      <v-icon class="mr-2 " color="error">mdi-cancel</v-icon>
      <span class="no-auth__text">İşlem Yapma Yetkiniz Bulunmamaktadır.</span>
    </CardComponent>
  </div>
</template>
<script lang="ts" setup>
import { watch, ref } from 'vue'
import CardComponent from './CardComponent.vue';
</script>
<style scoped>
.no-auth {
  font-size: var(--ek-type-display-size);
}

.no-auth__text {
  color: var(--ek-color-content-default);
}
</style>