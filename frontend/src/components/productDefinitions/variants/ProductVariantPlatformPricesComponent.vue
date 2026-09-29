<template>
  <v-row>
    <v-col cols="6" offset="3">
      <CardComponent icon="mdi-image-multiple-outline" title="Platform Bazında Varyant Fiyatları"
        :whiteBackground="false" style="overflow-y:scroll;border:1px solid #ddd;height:calc(100vh - 110px)!important">
        <LoadingComponent attach=".productDefinitionView" ref="loadingComponentRef"></LoadingComponent>
        <template #header>
          <v-btn style="border:1px solid #bbb;width:30px; opacity:.9;" @click="editingVariantMenu = false"
            elevation="0" min-width="0" color="white"><v-icon size="x-large" color="primary">mdi-close</v-icon></v-btn>
        </template>
        <PlatformPriceComponent :platformPriceForm="editingVariant" :categoryId="productInfoForm.category" />
      </CardComponent>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">

import { onMounted } from 'vue'
import PlatformPriceComponent from '../crud/PlatformPriceComponent.vue';
import CardComponent from "@/components/CardComponent.vue";

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

<style></style>