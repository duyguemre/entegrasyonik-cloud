<template>
  <div class=" ma-12  align-center justify-center d-flex" style="font-size:2em;">
    <CardComponent class="pa-6">
      <v-icon class="mr-2 " color="danger">mdi-cancel</v-icon>
      <span style="opacity:.8">İşlem Yapma Yetkiniz Bulunmamaktadır.</span>
    </CardComponent>
  </div>
</template>
<script lang="ts" setup>
import { watch, ref } from 'vue'
import CardComponent from './CardComponent.vue';
</script>
<style scoped></style>