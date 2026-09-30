<template>


  <div class="brandDefinition">
    <div class="workarea-scroll">
      <v-row class="mt-0 mb-0 bdv-row">
        <v-col cols="12" md="6" class="bdv-col">
          <BrandListComponent v-model="isBrandsListed" @openBrandSync="openBrandSync($event)" />
        </v-col>
        <v-col cols="12" md="6" class="bdv-col">
          <BrandSyncComponent v-model="selectedBrand" />
        </v-col>
      </v-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, onMounted, onBeforeMount } from 'vue'
import { useMenuStore } from '@/stores/site/menu'
import BrandListComponent from '@/components/BrandListComponent.vue';
import BrandSyncComponent from '@/components/BrandSyncComponent.vue';
import useIntegrations from '@/composables/integrations';
import { useI18n } from 'vue-i18n';
import useRestApi from '@/composables/restapi'
const eventBus: any = inject('eventBus');
const selectedBrand = ref()
const isBrandsListed = ref(true)
const destroyComponent = () => {
  isBrandsListed.value = false
  selectedBrand.value = undefined
}

defineExpose({
  destroyComponent
});


const openBrandSync = (brand: any) => {
  /*   console.log("selectedBrand", brand) */
  selectedBrand.value = brand
}


const { t } = useI18n()


onMounted(() => {
})

</script>

<style scoped>
/* ADR-0015 B5-2 — bu ekran içeriğini kapsam dışı kök bileşenlere (BrandListComponent/
   BrandSyncComponent) devrediyor; kendi görsel sorumluluğu yalnızca iki panelin tam
   yükseklikte yan yana yerleşimi. (Önceki `.navigation-scroll-container1` bloğu şablonda
   HİÇBİR yerde kullanılmıyordu — ölü CSS, literal renk içeriyordu, kaldırıldı; davranış
   değişmedi.) 110px kabuk sekme/başlık şeridinin yüksekliği — ADR-0015 A3 kabuk sabiti. */
.bdv-row {
  height: 100%;
}

/* Aşama 3 + int düzeltme: dar ekranda (<960px) iki panel ÜST ÜSTE (yan yana 375px'te liste adları sıfır
   genişliğe eziliyordu; 800px'te de iki panel ~330px'e sıkışıyordu); tam ekran yükseklik yalnız yan yana düzende. */
.bdv-col {
  position: relative;
  min-height: 520px;
}

@media (min-width: 960px) {
.bdv-col {
  height: calc(100vh - 110px);
}
}
</style>
