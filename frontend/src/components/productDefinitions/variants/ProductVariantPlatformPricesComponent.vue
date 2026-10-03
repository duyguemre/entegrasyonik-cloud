<template>
  <v-row>
    <v-col cols="6" offset="3">
      <CardComponent icon="mdi-image-multiple-outline" title="Platform Bazında Varyant Fiyatları"
        :whiteBackground="false" class="pvpp-s1">
        <LoadingComponent attach=".productDefinitionView" ref="loadingComponentRef"></LoadingComponent>
        <template #header>
          <v-btn aria-label="Kapat" @click="editingVariantMenu = false"
            elevation="0" min-width="0" color="white" class="pvpp-s2"><v-icon size="x-large" color="primary">mdi-close</v-icon></v-btn>
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

<style>
/* ADR-0015 B5-2 — satir ici stillerden tasinan siniflar (autostyle). Satir ici stilin onceligi
   !important ile korunur; ayni ozellikte Vuetify yardimci sinifi/`color` prop cakismasi varsa
   (satir ici stil zaten yeniliyordu) !important eklenmez. Scope'suz: v-dialog/v-menu ve alt
   bilesen kokleri scoped ozniteligi almayabilir; onek dosyaya ozgudur. */
.pvpp-s1 {
  overflow-y: scroll !important;
  border: 1px solid var(--ek-color-border-default) !important;
  height: calc(100vh - 110px) !important;
}

.pvpp-s2 {
  border: 1px solid var(--ek-color-border-strong) !important;
  width: 30px !important;
  opacity: .9 !important;
}
</style>
